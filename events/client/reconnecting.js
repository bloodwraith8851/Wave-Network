/**
 * reconnecting.js — Discord client 'shardReconnecting' event
 *
 * Fires each time a shard begins reconnecting.
 */
const clc = require('cli-color');

module.exports = (client, shardId) => {
  const ts = new Date().toISOString();
  console.log(clc.yellow(`[${ts}] [Reconnecting] Shard ${shardId ?? 0} is reconnecting…`));
};
