/**
 * shardReady.js — Shard #<id> is fully connected and ready
 *
 * Fired once per shard when its WebSocket becomes READY.
 * The bot client is fully operational at this point.
 */
const clc = require('cli-color');

module.exports = async (client, id) => {
  const ts       = new Date().toISOString();
  const guilds   = client.guilds?.cache?.size ?? '?';
  const ping     = client.ws?.ping ?? '?';
  const username = client.user?.tag ?? 'Unknown';

  console.log(clc.greenBright(
    `[${ts}] [ShardReady] ✅  Shard #${id} READY — ` +
    `Bot: ${username}  Guilds: ${guilds}  WS Ping: ${ping}ms`
  ));

  // Report upward to ShardingManager process via IPC
  try {
    process.send?.({ _type: 'shard_ping', shardId: id, guilds, ping });
  } catch { /* DM process has no IPC */ }
};
