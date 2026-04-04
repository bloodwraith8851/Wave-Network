/**
 * dbHelper.js — Database utility helpers
 *
 * Common patterns used throughout the bot to reduce boilerplate.
 */

/**
 * Get a guild-namespaced key value with a fallback default.
 * @template T
 * @param {object} db
 * @param {string} guildId
 * @param {string} key         — without the guild prefix
 * @param {T}      [fallback]  — returned if key is null/undefined
 * @returns {Promise<T>}
 */
async function gget(db, guildId, key, fallback = null) {
  const val = await db.get(`guild_${guildId}.${key}`);
  return val !== null && val !== undefined ? val : fallback;
}

/**
 * Set a guild-namespaced key.
 */
async function gset(db, guildId, key, value) {
  return db.set(`guild_${guildId}.${key}`, value);
}

/**
 * Delete a guild-namespaced key.
 */
async function gdel(db, guildId, key) {
  return db.delete(`guild_${guildId}.${key}`);
}

/**
 * Push an item into a guild-namespaced array, creating it if absent.
 * Optionally trims to a max length (oldest items removed first).
 */
async function gpush(db, guildId, key, item, maxLength = 0) {
  const arr = (await gget(db, guildId, key, []));
  arr.push(item);
  if (maxLength > 0 && arr.length > maxLength) arr.splice(0, arr.length - maxLength);
  await gset(db, guildId, key, arr);
  return arr;
}

/**
 * Atomic increment of a guild-namespaced numeric counter.
 * Returns the new value.
 */
async function gincr(db, guildId, key, amount = 1) {
  const current = (await gget(db, guildId, key, 0)) + amount;
  await gset(db, guildId, key, current);
  return current;
}

/**
 * Get multiple guild-namespaced keys in a single call.
 * Returns an object keyed by the short key names.
 * @param {string[]} keys
 */
async function gmget(db, guildId, keys) {
  const result = {};
  await Promise.all(keys.map(async k => {
    result[k] = await gget(db, guildId, k, null);
  }));
  return result;
}

/**
 * Set every ticket DB key for a new ticket in one call.
 * @param {object} db
 * @param {string} guildId
 * @param {string} channelId
 * @param {string} ownerId
 * @param {string} [category]
 */
async function initTicketKeys(db, guildId, channelId, ownerId, category = null) {
  const now = Date.now();
  await Promise.all([
    gset(db, guildId, `ticket.control_${channelId}`, ownerId),
    gset(db, guildId, `ticket.created_at_${channelId}`, now),
    category ? gset(db, guildId, `ticket.category_${channelId}`, category) : Promise.resolve(),
  ]);
  return now;
}

/**
 * Delete all ticket-specific DB keys for a channel.
 */
async function cleanupTicketKeys(db, guildId, channelId, ownerId = null) {
  const keysToDelete = [
    `ticket.control_${channelId}`,
    `ticket.created_at_${channelId}`,
    `ticket.category_${channelId}`,
    `ticket.initial_msg_${channelId}`,
    `ticket.tags_${channelId}`,
    `sla.breach_${channelId}`,
    `ticket.escalated_${channelId}`,
    `ticket.assigned_${channelId}`,
  ];
  if (ownerId) keysToDelete.push(`ticket.name_${ownerId}`);

  await Promise.all(keysToDelete.map(k => gdel(db, guildId, k).catch(() => null)));
}

module.exports = { gget, gset, gdel, gpush, gincr, gmget, initTicketKeys, cleanupTicketKeys };
