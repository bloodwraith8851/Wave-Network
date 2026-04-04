/**
 * shardReconnecting.js — Shard #<id> is reconnecting to Discord
 *
 * Fired when the WebSocket is closed and the next reconnect attempt begins.
 * This is completely normal behaviour — Discord.js handles reconnection
 * automatically with exponential backoff.
 */
const clc = require('cli-color');

module.exports = async (client, id) => {
  const ts = new Date().toISOString();
  console.log(clc.cyanBright(`[${ts}] [ShardReconnecting] 🔄  Shard #${id} is reconnecting to Discord…`));

  // Notify ShardingManager
  try {
    process.send?.({ _type: 'log', level: 'warn', tag: `shard#${id}`, text: 'Reconnecting…' });
  } catch { /* */ }
};
