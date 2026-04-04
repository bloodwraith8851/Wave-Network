/**
 * shardError.js — WebSocket error on shard #<id>
 *
 * Handles errors emitted directly from the WebSocket layer.
 * These are almost always transient (connection resets, timeouts).
 * The ShardingManager respawns on actual process death — WS errors
 * by themselves do not kill the process.
 */
const clc = require('cli-color');
const { logError, isNonFatal } = require(`${process.cwd()}/utils/errorHandler`);

module.exports = async (client, error, id) => {
  const ts      = new Date().toISOString();
  const fatal   = !isNonFatal(error);
  const errStr  = error?.message || String(error);

  if (fatal) {
    console.error(clc.red(`[${ts}] [ShardError] ❌  Shard #${id} FATAL WS ERROR: ${errStr}`));
    if (error?.stack) console.error(clc.red(error.stack.split('\n').slice(0, 5).join('\n')));
  } else {
    console.warn(clc.yellow(`[${ts}] [ShardError] ⚠️   Shard #${id} transient WS error: ${errStr}`));
  }

  // Notify ShardingManager
  try {
    process.send?.({ _type: 'log', level: fatal ? 'error' : 'warn', tag: `shard#${id}`, text: `WS error: ${errStr}` });
  } catch { /* */ }
};
