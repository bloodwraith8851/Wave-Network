/**
 * shardDisconnect.js — Shard #<id> WebSocket closed
 *
 * Called when a shard's WebSocket connection is closed.
 * Discord.js will auto-reconnect; we just log and report.
 *
 * Note: The CloseEvent code is important for diagnosis:
 *   4000 – Unknown error (reconnect OK)
 *   4004 – Authentication failed (check TOKEN)
 *   4009 – Session timeout (reconnect OK)
 *   4011 – Sharding required (set shards: 'auto')
 *   4013 – Invalid intent (check IntentsBitField)
 *   4014 – Disallowed intent (enable in Dev Portal)
 */
const clc = require('cli-color');

const WS_CLOSE_CODES = {
  4000: 'Unknown error — reconnecting',
  4001: 'Unknown opcode — reconnecting',
  4002: 'Decode error — reconnecting',
  4003: 'Not authenticated — reconnecting',
  4004: '❗ Authentication failed — check TOKEN',
  4005: 'Already authenticated',
  4007: 'Invalid sequence — reconnecting',
  4008: '⚠️  Rate limited — slow down',
  4009: 'Session timed out — reconnecting',
  4010: '❗ Invalid shard — check shard config',
  4011: '❗ Sharding required — enable ShardingManager',
  4012: '❗ Invalid API version',
  4013: '❗ Invalid intent — check IntentsBitField',
  4014: '❗ Disallowed intent — enable in Discord Dev Portal',
};

module.exports = async (client, event, id) => {
  const ts     = new Date().toISOString();
  const code   = event?.code ?? event;
  const reason = WS_CLOSE_CODES[code] || `Code ${code}`;

  const isCritical = [4004, 4010, 4011, 4013, 4014].includes(code);
  const color      = isCritical ? clc.bgRed.white : clc.yellow;

  console.warn(color(`[${ts}] [ShardDisconnect] ⚡  Shard #${id} disconnected — ${reason}`));

  if (isCritical) {
    console.error(clc.red(
      `[ShardDisconnect] CRITICAL close code ${code} — manual intervention required. ` +
      `The ShardingManager will NOT auto-respawn for code 4004/4014.`
    ));
  }

  // Notify ShardingManager via IPC
  try {
    process.send?.({ _type: 'log', level: isCritical ? 'error' : 'warn', tag: `shard#${id}`, text: `Disconnected — ${reason}` });
  } catch { /* */ }
};
