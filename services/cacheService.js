/**
 * services/cacheService.js
 * In-memory cache for guild-specific settings.
 */

const TTL = 5 * 60 * 1000; // 5 minute cache by default

/**
 * Get a value from cache or DB.
 * @param {object} client   — Discord client (holds the cache Map)
 * @param {string} guildId  — the guild ID
 * @param {string} key      — the setting key (e.g., 'ticket.admin_role')
 * @returns {Promise<any>}
 */
async function get(client, guildId, key) {
  const cacheKey = `${guildId}.${key}`;
  const now = Date.now();
  
  if (client.guildCache.has(cacheKey)) {
    const entry = client.guildCache.get(cacheKey);
    if (now - entry.at < TTL) return entry.val;
  }
  
  // Cache miss or expired
  const dbKey = `guild_${guildId}.${key}`;
  const val = await client.db.get(dbKey);
  
  client.guildCache.set(cacheKey, { val, at: now });
  return val;
}

/**
 * Invalidate a specific cache entry (e.g. when settings are changed).
 */
function invalidate(client, guildId, key) {
  client.guildCache.delete(`${guildId}.${key}`);
}

/**
 * Invalidate all settings for a guild.
 */
function invalidateGuild(client, guildId) {
  for (const k of client.guildCache.keys()) {
    if (k.startsWith(`${guildId}.`)) client.guildCache.delete(k);
  }
}

module.exports = { get, invalidate, invalidateGuild };
