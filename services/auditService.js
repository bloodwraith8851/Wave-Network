/**
 * auditService.js — Configuration & admin action audit log
 *
 * Stores: action type, userId, old/new values, timestamp
 * Retention: last 200 entries per guild
 * DB key: guild_<id>.audit_log → Array<AuditEntry>
 */

const MAX_ENTRIES = 200;

/**
 * Log an audit event.
 * @param {object} db
 * @param {string} guildId
 * @param {string} userId   — who performed the action
 * @param {string} action   — dot-namespaced action (e.g. 'permissions.set_role')
 * @param {object} [data={}] — old/new values, any additional context
 */
async function log(db, guildId, userId, action, data = {}) {
  try {
    const key     = `guild_${guildId}.audit_log`;
    const entries = (await db.get(key)) || [];

    entries.push({
      id:        entries.length + 1,
      action,
      userId,
      data,
      timestamp: Date.now(),
    });

    // Trim to last 200
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

    await db.set(key, entries);
  } catch (e) {
    console.error('[Audit] log error:', e.message);
  }
}

/**
 * Retrieve audit entries, optionally filtered.
 * @param {object} db
 * @param {string} guildId
 * @param {{ userId?: string, action?: string, limit?: number }} filters
 * @returns {Promise<AuditEntry[]>}
 */
async function getEntries(db, guildId, { userId, action, limit = 20 } = {}) {
  try {
    let entries = (await db.get(`guild_${guildId}.audit_log`)) || [];

    if (userId) entries  = entries.filter(e => e.userId === userId);
    if (action) entries  = entries.filter(e => e.action?.includes(action));

    return entries.slice(-limit).reverse(); // most recent first
  } catch {
    return [];
  }
}

/**
 * Format a single audit entry for display.
 */
function formatEntry(entry, guild) {
  const ts   = `<t:${Math.floor(entry.timestamp / 1000)}:R>`;
  const who  = `<@${entry.userId}>`;
  const dataStr = entry.data && Object.keys(entry.data).length
    ? '\n' + Object.entries(entry.data)
        .map(([k, v]) => `  ${k}: \`${String(v).slice(0, 50)}\``)
        .join('\n')
    : '';
  return `**\`${entry.action}\`** ${ts}\n> By ${who}${dataStr}`;
}

/**
 * Clear the audit log for a guild.
 */
async function clear(db, guildId) {
  await db.delete(`guild_${guildId}.audit_log`);
}

module.exports = { log, getEntries, formatEntry, clear };
