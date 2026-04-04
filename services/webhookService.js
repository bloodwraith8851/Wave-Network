/**
 * webhookService.js — Send ticket events to external webhooks
 *
 * Supports: ticket_create, ticket_close, ticket_delete,
 *           ticket_escalate, rating_received, ticket_assigned
 *
 * DB key: guild_<id>.webhooks → WebhookConfig[]
 * WebhookConfig: { id, url, events: string[], enabled: boolean, createdAt }
 *
 * Retry logic: up to 3 attempts with exponential backoff.
 */

const MAX_WEBHOOKS    = 10;
const MAX_RETRIES     = 3;
const INITIAL_BACKOFF = 1000; // ms

const VALID_EVENTS = [
  'ticket_create',
  'ticket_close',
  'ticket_delete',
  'ticket_escalate',
  'ticket_assigned',
  'rating_received',
  'ticket_tag_added',
];

/**
 * Get all configured webhooks for a guild.
 */
async function getAll(db, guildId) {
  return (await db.get(`guild_${guildId}.webhooks`)) || [];
}

/**
 * Add a webhook configuration.
 */
async function add(db, guildId, url, events = VALID_EVENTS) {
  const list = await getAll(db, guildId);
  if (list.length >= MAX_WEBHOOKS) return { success: false, msg: `Max ${MAX_WEBHOOKS} webhooks reached.` };

  const invalidEvts = events.filter(e => !VALID_EVENTS.includes(e));
  if (invalidEvts.length) return { success: false, msg: `Invalid events: \`${invalidEvts.join(', ')}\`\nValid: \`${VALID_EVENTS.join(', ')}\`` };

  // Validate URL
  try { new URL(url); } catch { return { success: false, msg: 'Invalid URL format.' }; }

  const id = Date.now();
  list.push({ id, url, events, enabled: true, createdAt: Date.now() });
  await db.set(`guild_${guildId}.webhooks`, list);
  return { success: true, id };
}

/**
 * Remove a webhook by URL or ID.
 */
async function remove(db, guildId, urlOrId) {
  const list     = await getAll(db, guildId);
  const filtered = list.filter(w => w.url !== urlOrId && String(w.id) !== String(urlOrId));
  if (filtered.length === list.length) return false;
  await db.set(`guild_${guildId}.webhooks`, filtered);
  return true;
}

/**
 * Send a payload to a webhook URL with retry logic.
 */
async function _sendWithRetry(url, payload, attempt = 1) {
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'WaveNetwork-WebhookService/1.0' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      const delay = INITIAL_BACKOFF * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
      return _sendWithRetry(url, payload, attempt + 1);
    }
    console.error(`[Webhook] Failed after ${MAX_RETRIES} attempts: ${e.message}`);
    return false;
  }
}

/**
 * Dispatch an event to all matching webhooks for a guild.
 *
 * @param {object} db
 * @param {string} guildId
 * @param {string} eventType  — must be in VALID_EVENTS
 * @param {object} data        — event payload (ticket info, etc.)
 */
async function dispatch(db, guildId, eventType, data = {}) {
  try {
    const webhooks = await getAll(db, guildId);
    const matching = webhooks.filter(w => w.enabled && w.events.includes(eventType));
    if (!matching.length) return;

    const payload = {
      event:     eventType,
      guildId,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(matching.map(w => _sendWithRetry(w.url, payload)));
  } catch (e) {
    console.error('[Webhook] dispatch error:', e.message);
  }
}

module.exports = { getAll, add, remove, dispatch, VALID_EVENTS, MAX_WEBHOOKS };
