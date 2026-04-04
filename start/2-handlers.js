/**
 * 2-handlers.js — Loads core handlers (commands, keepAlive, extraEvents, antiCrash)
 */
const fs     = require('fs');
const Logger = require(`${process.cwd()}/utils/logger`);

module.exports = async (client) => {
  Logger.divider('Loading Handlers');
  let counter  = 0;
  const failed = [];

  // When running under ShardingManager (SHARDING_ENABLED=true), the ShardingManager
  // already owns PORT with its own /health server in shard.js.
  // Loading keepAlive.js here too would cause EADDRINUSE → crash loop.
  const isSharded = process.env.SHARDING_ENABLED === 'true';

  const handlers = [
    'slashCommandHandler.js',
    (client.config.source.keep_alive && !isSharded) ? 'keepAlive.js' : null,
    'extraEvents.js',
    client.config.source.anti_crash ? 'antiCrash.js' : null,
  ].filter(Boolean);

  if (isSharded) {
    Logger.info('Handlers', 'ShardingManager mode — keepAlive.js skipped (ShardManager owns PORT)');
  }

  for (const handler of handlers) {
    try {
      require(`${process.cwd()}/handlers/${handler}`)(client);
      Logger.info('Handlers', `Loaded  ${handler}`);
      counter++;
    } catch (e) {
      failed.push(handler);
      Logger.error('Handlers', `Failed to load ${handler}`, e);
    }
  }

  Logger.loadedBox('Handlers', counter);
  if (failed.length) Logger.warn('Handlers', `${failed.length} handler(s) failed: ${failed.join(', ')}`);
};
