/**
 * scheduledMessageService.js — Queue and deliver messages at future times
 *
 * Supports scheduled closures and custom scheduled messages in ticket channels.
 *
 * DB key: guild_<id>.scheduled_messages → ScheduledMessage[]
 * ScheduledMessage: { id, type, channelId, guildId, message, sendAt, createdBy, cancelled }
 *
 * Types: 'message' | 'close'
 */

let _client = null;
let _timer  = null;

/**
 * Initialize the service — call from index.js after client is ready.
 */
function init(client) {
  _client = client;
  _startTimer();
  console.log('[Scheduler] Scheduled message service started (60s tick)');
}

function _startTimer() {
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => _tick().catch(e => console.error('[Scheduler] tick error:', e.message)), 60 * 1000);
}

/**
 * Check and deliver any pending scheduled messages.
 */
async function _tick() {
  if (!_client) return;
  const now = Date.now();

  for (const [, guild] of _client.guilds.cache) {
    const db      = _client.db;
    const guildId = guild.id;
    const key     = `guild_${guildId}.scheduled_messages`;
    let   msgs    = (await db.get(key)) || [];
    let   changed = false;

    for (const msg of msgs) {
      if (msg.cancelled || msg.sent || msg.sendAt > now) continue;

      const channel = guild.channels.cache.get(msg.channelId);
      if (!channel) { msg.sent = true; changed = true; continue; }

      if (msg.type === 'message') {
        // Deliver the custom message
        const { EmbedBuilder } = require('discord.js');
        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor('#7C3AED')
            .setTitle('📅  Scheduled Message')
            .setDescription(msg.message)
            .setFooter({ text: `Scheduled by staff  •  Wave Network` })
            .setTimestamp()
          ]
        }).catch(() => null);
      }

      if (msg.type === 'close') {
        // Auto-close the ticket
        const ownerId    = await db.get(`guild_${guildId}.ticket.control_${channel.id}`);
        const { PermissionsBitField, EmbedBuilder } = require('discord.js');
        const adminRoleId = await db.get(`guild_${guildId}.ticket.admin_role`);

        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🔒  Ticket Scheduled Close')
            .setDescription(`This ticket is being automatically closed as scheduled.`)
            .setFooter({ text: 'Wave Network  •  Scheduled Close' })
            .setTimestamp()
          ]
        }).catch(() => null);

        // Lock channel
        const overrides = [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        ];
        if (ownerId)     overrides.push({ id: ownerId,     deny: [PermissionsBitField.Flags.ViewChannel] });
        if (adminRoleId) overrides.push({ id: adminRoleId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        await channel.permissionOverwrites.set(overrides).catch(() => null);

        const transcriptSvc = require(`${process.cwd()}/services/transcriptService`);
        await transcriptSvc.generateAndDeliver(_client, channel, null, 'scheduled-close').catch(() => null);
      }

      msg.sent    = true;
      msg.sentAt  = now;
      changed     = true;
    }

    if (changed) await db.set(key, msgs);
  }
}

/**
 * Schedule a new message or close.
 * @param {object} db
 * @param {string} guildId
 * @param {string} channelId
 * @param {'message'|'close'} type
 * @param {string} message      — message text (for type 'message')
 * @param {number} delayMs      — delay in milliseconds from now
 * @param {string} createdBy    — userId
 * @returns {object} the created scheduled item
 */
async function schedule(db, guildId, channelId, type, message, delayMs, createdBy) {
  const key  = `guild_${guildId}.scheduled_messages`;
  const msgs = (await db.get(key)) || [];

  const id   = `${channelId}_${Date.now()}`;
  const item = {
    id,
    type,
    channelId,
    guildId,
    message: message || '',
    sendAt: Date.now() + delayMs,
    createdBy,
    sent: false,
    cancelled: false,
    createdAt: Date.now(),
  };

  msgs.push(item);
  await db.set(key, msgs);
  return item;
}

/**
 * List pending (unsent, uncancelled) scheduled items for a channel.
 */
async function listForChannel(db, guildId, channelId) {
  const msgs = (await db.get(`guild_${guildId}.scheduled_messages`)) || [];
  return msgs.filter(m => m.channelId === channelId && !m.sent && !m.cancelled);
}

/**
 * Cancel a scheduled item by ID.
 * @returns {boolean}
 */
async function cancel(db, guildId, itemId) {
  const key  = `guild_${guildId}.scheduled_messages`;
  const msgs = (await db.get(key)) || [];
  const item = msgs.find(m => m.id === itemId);
  if (!item || item.sent) return false;
  item.cancelled = true;
  await db.set(key, msgs);
  return true;
}

/**
 * Parse a human-readable time string (e.g. "2h", "30m", "1d") to milliseconds.
 * @returns {number|null}
 */
function parseDelay(str) {
  const match = str.trim().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase();
  const mult  = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return Math.round(value * mult[unit]);
}

module.exports = { init, schedule, listForChannel, cancel, parseDelay };
