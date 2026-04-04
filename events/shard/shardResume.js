/**
 * shardResume.js — Shard #<id> resumed after reconnect
 *
 * Fired when a shard successfully resumes - the WebSocket is back and
 * replayed all missed events. `replayedEvents` shows how many events
 * were buffered during the outage.
 */
const clc = require('cli-color');

module.exports = async (client, id, replayedEvents) => {
  const ts     = new Date().toISOString();
  const guilds = client.guilds?.cache?.size ?? '?';
  const ping   = client.ws?.ping ?? '?';

  console.log(clc.greenBright(
    `[${ts}] [ShardResume] ▶️   Shard #${id} RESUMED — ` +
    `Replayed: ${replayedEvents} events  Guilds: ${guilds}  Ping: ${ping}ms`
  ));

  // Notify ShardingManager
  try {
    process.send?.({ _type: 'log', level: 'info', tag: `shard#${id}`, text: `Resumed — ${replayedEvents} events replayed` });
    process.send?.({ _type: 'shard_ping', shardId: id, guilds, ping });
  } catch { /* */ }
};
