/**
 * shard.js — Wave Network Hybrid Cluster Manager (Production)
 * Advanced Level Zero-Downtime Architecture
 */

require('dotenv').config();
const { ClusterManager } = require('discord-hybrid-sharding');
const Logger = require('./utils/logger');
const path   = require('path');
const { createServer } = require('http');

const TOKEN       = process.env.TOKEN;
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || process.env.PORT || '8989');
const BOT_SCRIPT  = path.join(__dirname, 'index.js');

if (!TOKEN) {
  Logger.fatal('ClusterManager', 'TOKEN is not set in environment variables. Exiting.');
  process.exit(1);
}

Logger.banner();
Logger.info('ClusterManager', 'Starting Advanced Hybrid Sharding Architecture...');

// Instantiating the Hybrid Cluster Protocol
const manager = new ClusterManager(BOT_SCRIPT, {
  totalShards: 'auto',
  shardsPerClusters: 2, // Maps 2 shards per V8 Isolate (Process) to save massive RAM footprints.
  mode: 'process',
  token: TOKEN,
  respawn: true,
  usev14: true
});

async function sendWebhookAlert(payload) {
  const url = process.env.SHARD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch(e) { }
}

manager.on('clusterCreate', cluster => {
  Logger.ok('ClusterManager', `🚀 Cluster #${cluster.id} initializing hybrid network.`);
  
  cluster.on('ready', () => {
    Logger.ok('ClusterManager', `✅ Cluster #${cluster.id} is connected via WebSocket.`);
    sendWebhookAlert({
      embeds: [{ title: `✅ Cluster #${cluster.id} is securely routing traffic.`, color: 0x10B981, timestamp: new Date().toISOString() }]
    });
  });

  cluster.on('death', (process) => {
    Logger.error('ClusterManager', `💀 Cluster #${cluster.id} Core Process died.`);
    sendWebhookAlert({
      embeds: [{ title: `💀 Cluster #${cluster.id} Data Thread Terminated`, description: `Engaging Automatic Rescue Protocols...`, color: 0xEF4444, timestamp: new Date().toISOString() }]
    });
  });

  // Hot Reload Listeners for Zero Downtime Update
  cluster.on('reconnecting', () => Logger.info('ClusterManager', `🔄 Cluster #${cluster.id} attempting reconnect...`));
});

// Fire up the zero-downtime clustering system
manager.spawn({ timeout: -1 })
  .then(() => Logger.ok('ClusterManager', `All clusters have been launched using Advanced Hybrid Protocols.`))
  .catch(e => Logger.error('ClusterManager', `Fatal: Failed to spawn clusters: ${e.message}`));

// Health check HTTP server
const healthServer = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'cluster_optimized_ok',
      architecture: 'hybrid_threaded',
      clusters: manager.totalClusters,
      shards: manager.totalShards,
    }));
  } else {
    res.writeHead(404).end('Not Found');
  }
});
healthServer.listen(HEALTH_PORT, '0.0.0.0', () => Logger.ok('ClusterManager', `Liveness Web Server active on port ${HEALTH_PORT}`));
