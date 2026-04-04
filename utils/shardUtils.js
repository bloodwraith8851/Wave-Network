/**
 * shardUtils.js — Inter-shard communication utilities
 *
 * Provides helper functions for commands and services that need to
 * query or broadcast data across all shards.
 *
 * These use client.shard.broadcastEval() when sharding is active,
 * and fall back gracefully to local data in standalone (dev) mode.
 */

/**
 * Get the total guild count across ALL shards.
 * @param {import('discord.js').Client} client
 * @returns {Promise<number>}
 */
async function getTotalGuildCount(client) {
  if (!client.shard) return client.guilds.cache.size;
  try {
    const counts = await client.shard.broadcastEval(c => c.guilds.cache.size);
    return counts.reduce((a, b) => a + b, 0);
  } catch {
    return client.guilds.cache.size;
  }
}

/**
 * Get the total user count across ALL shards.
 * @param {import('discord.js').Client} client
 * @returns {Promise<number>}
 */
async function getTotalUserCount(client) {
  if (!client.shard) return client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
  try {
    const counts = await client.shard.broadcastEval(c =>
      c.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0)
    );
    return counts.reduce((a, b) => a + b, 0);
  } catch {
    return client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
  }
}

/**
 * Get the average WebSocket ping across ALL shards.
 * @param {import('discord.js').Client} client
 * @returns {Promise<number>}
 */
async function getAveragePing(client) {
  if (!client.shard) return client.ws.ping;
  try {
    const pings = await client.shard.broadcastEval(c => c.ws.ping);
    return Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
  } catch {
    return client.ws.ping;
  }
}

/**
 * Get the total shard count.
 * @param {import('discord.js').Client} client
 * @returns {number}
 */
function getShardCount(client) {
  return client.shard?.count ?? 1;
}

/**
 * Get the current shard ID for this process.
 * @param {import('discord.js').Client} client
 * @returns {number}
 */
function getCurrentShardId(client) {
  return client.shard?.ids?.[0] ?? 0;
}

/**
 * Find a guild across all shards by ID.
 * Returns the serialisable guild data or null.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @returns {Promise<object|null>}
 */
async function findGuildAcrossShards(client, guildId) {
  if (!client.shard) {
    const g = client.guilds.cache.get(guildId);
    return g ? { id: g.id, name: g.name, memberCount: g.memberCount } : null;
  }
  try {
    const results = await client.shard.broadcastEval((c, { id }) => {
      const g = c.guilds.cache.get(id);
      return g ? { id: g.id, name: g.name, memberCount: g.memberCount } : null;
    }, { context: { id: guildId } });
    return results.find(r => r !== null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Broadcast a status update across all shards.
 * @param {import('discord.js').Client} client
 * @param {{ status: string, activities: Array }} presence
 */
async function broadcastPresence(client, presence) {
  if (!client.shard) {
    await client.user?.setPresence(presence);
    return;
  }
  await client.shard.broadcastEval((c, p) => c.user?.setPresence(p), { context: presence });
}

/**
 * Build per-shard stats for the /status or /botinfo commands.
 * @param {import('discord.js').Client} client
 * @returns {Promise<Array<{shardId: number, guilds: number, ping: number, mem: number}>>}
 */
async function getShardStats(client) {
  if (!client.shard) {
    return [{
      shardId: 0,
      guilds:  client.guilds.cache.size,
      ping:    client.ws.ping,
      mem:     Math.round(process.memoryUsage().rss / 1024 / 1024),
    }];
  }
  try {
    const [guilds, pings, mems] = await Promise.all([
      client.shard.broadcastEval(c => c.guilds.cache.size),
      client.shard.broadcastEval(c => c.ws.ping),
      client.shard.broadcastEval(() => Math.round(process.memoryUsage().rss / 1024 / 1024)),
    ]);
    return guilds.map((g, i) => ({
      shardId: i,
      guilds:  g,
      ping:    pings[i] ?? -1,
      mem:     mems[i]  ?? 0,
    }));
  } catch {
    return [];
  }
}

module.exports = {
  getTotalGuildCount,
  getTotalUserCount,
  getAveragePing,
  getShardCount,
  getCurrentShardId,
  findGuildAcrossShards,
  broadcastPresence,
  getShardStats,
};
