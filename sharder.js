'use strict';
/**
 * sharder.js — Wave Network Advanced Sharding Manager
 *
 * Implements Discord.js ShardingManager to run the bot across multiple processes.
 * Required for bots in > 2,000 servers.
 *
 * Features:
 * - Auto-scaling based on Discord's recommended shard count
 * - Staggered booting to prevent rate limits
 * - Cross-shard communication (broadcastEval)
 * - Restarts dead shards automatically
 */

require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path   = require('path');
const Logger = require('./utils/logger');
const config = require('./storage/config.js');

const token = process.env.TOKEN || config.discord.token;

if (!token) {
  Logger.fatal('Sharder', 'No Discord token found in .env or config.js');
  process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token,
  totalShards: process.env.SHARD_COUNT === 'auto' ? 'auto' : parseInt(process.env.SHARD_COUNT) || 'auto',
  respawn:     true,
});

manager.on('shardCreate', shard => {
  Logger.ok('Sharder', `Launced Shard #${shard.id}`);

  shard.on('death', (process) => {
    Logger.fatal('Sharder', `Shard #${shard.id} completely died (Exit Code: ${process.exitCode}). Respawning...`);
  });

  shard.on('disconnect', () => {
    Logger.warn('Sharder', `Shard #${shard.id} disconnected from the gateway.`);
  });

  shard.on('ready', () => {
    Logger.ok('Sharder', `Shard #${shard.id} is ready and serving guilds.`);
  });
});

manager.spawn()
  .then(shards => {
    Logger.ok('Sharder', `Total of ${shards.size} shards spawned successfully.`);
  })
  .catch(err => {
    Logger.error('Sharder', 'Failed to spawn shards', err);
  });
