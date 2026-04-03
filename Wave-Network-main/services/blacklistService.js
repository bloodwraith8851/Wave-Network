/**
 * blacklistService.js — Keyword blacklist scanner for messages
 */

/**
 * Get the blacklist for a guild.
 */
async function getBlacklist(db, guildId) {
  return (await db.get(`guild_${guildId}.blacklist`)) || [];
}

/**
 * Add a keyword to the blacklist.
 */
async function addKeyword(db, guildId, keyword) {
  const list = await getBlacklist(db, guildId);
  const normalized = keyword.toLowerCase().trim();
  if (list.includes(normalized)) return false;
  list.push(normalized);
  await db.set(`guild_${guildId}.blacklist`, list);
  return true;
}

/**
 * Remove a keyword from the blacklist.
 */
async function removeKeyword(db, guildId, keyword) {
  const list = await getBlacklist(db, guildId);
  const normalized = keyword.toLowerCase().trim();
  const filtered = list.filter(k => k !== normalized);
  await db.set(`guild_${guildId}.blacklist`, filtered);
  return filtered.length < list.length;
}

/**
 * Check if a message contains blacklisted keywords.
 * @returns {string|null} The matched keyword, or null if clean
 */
async function checkMessage(db, guildId, content) {
  const list = await getBlacklist(db, guildId);
  const lower = content.toLowerCase();
  for (const kw of list) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

module.exports = { getBlacklist, addKeyword, removeKeyword, checkMessage };
