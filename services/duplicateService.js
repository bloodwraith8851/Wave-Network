/**
 * duplicateService.js — Detect similar open tickets from the same user
 *
 * Compares a new ticket's initial message against existing open tickets
 * owned by the same user. Uses keyword overlap scoring.
 *
 * DB key: guild_<id>.ticket.initial_msg_<channelId> → string (message content)
 */

const SIMILARITY_THRESHOLD = 0.35; // 35% keyword overlap triggers warning

/**
 * Store the initial message for a ticket channel.
 */
async function storeInitialMessage(db, guildId, channelId, content) {
  await db.set(`guild_${guildId}.ticket.initial_msg_${channelId}`, content.slice(0, 500));
}

/**
 * Calculate keyword overlap between two strings (Jaccard-like).
 * @returns {number} 0.0 – 1.0 similarity score
 */
function similarity(a, b) {
  const tokenize = s => new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2) // ignore very short words
  );
  const setA  = tokenize(a);
  const setB  = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union        = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Check if a new ticket from userId is similar to any existing open ticket.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} db
 * @param {string} guildId
 * @param {string} userId      — ticket owner
 * @param {string} newContent  — initial message of the new/pending ticket
 * @param {number} [threshold] — override sensitivity (0–1)
 * @returns {Promise<{ isDuplicate: boolean, score: number, existingChannel: ?Channel }>}
 */
async function checkDuplicate(guild, db, guildId, userId, newContent, threshold = SIMILARITY_THRESHOLD) {
  try {
    const { ChannelType } = require('discord.js');
    const ticketChannels  = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText && c.name.startsWith('ticket-')
    );

    let bestScore   = 0;
    let bestChannel = null;

    for (const [, ch] of ticketChannels) {
      const ownerId = await db.get(`guild_${guildId}.ticket.control_${ch.id}`);
      if (ownerId !== userId) continue; // only check same user's tickets

      const existingMsg = await db.get(`guild_${guildId}.ticket.initial_msg_${ch.id}`);
      if (!existingMsg) continue;

      const score = similarity(newContent, existingMsg);
      if (score > bestScore) {
        bestScore   = score;
        bestChannel = ch;
      }
    }

    return {
      isDuplicate: bestScore >= threshold,
      score:       Math.round(bestScore * 100),
      existingChannel: bestChannel,
    };
  } catch {
    return { isDuplicate: false, score: 0, existingChannel: null };
  }
}

/**
 * Get the configured sensitivity threshold for a guild.
 * @returns {Promise<number>}
 */
async function getThreshold(db, guildId) {
  const setting = await db.get(`guild_${guildId}.ticket.settings.duplicate_threshold`);
  // Maps 'low'|'medium'|'high' to numeric thresholds
  const MAP = { low: 0.6, medium: 0.35, high: 0.2, off: null };
  if (typeof setting === 'string' && setting in MAP) return MAP[setting];
  return SIMILARITY_THRESHOLD;
}

module.exports = { storeInitialMessage, checkDuplicate, similarity, getThreshold, SIMILARITY_THRESHOLD };
