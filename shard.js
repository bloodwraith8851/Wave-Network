/**
 * shard.js — Production ShardingManager entry point
 *
 * This file is the TRUE entry point when running in production.
 * It spawns and manages shards, each running index.js as their bot process.
 *
 * Usage:
 *   node shard.js              ← production (auto shard count from Discord)
 *   SHARD_COUNT=4 node shard.js ← force a specific shard count
 *   node shard.js --dev        ← single shard dev mode
 *
 * PM2 example (ecosystem.config.js):
 *   { script: 'shard.js', name: 'wave-network', instances: 1, autorestart: true }
 *
 * Features
 * ─────────
 *  • Auto-detects recommended shard count from Discord Gateway API
 *  • Per-shard spawn delay to avoid Gateway rate-limits
 *  • Shard health tracking (state, ping, guilds, memory)
 *  • Auto-respawn dead shards with exponential backoff (max 5 attempts)
 *  • Graceful SIGTERM / SIGINT shutdown (sends shards offline before exit)
 *  • Express /health endpoint for uptime monitors & k8s liveness probes
 *  • Metrics log every 5 minutes (per-shard ping, guild count, memory)
 */

require('dotenv').config();
const { ShardingManager } = require('discord.js');
const clc = require('cli-color');
const path = require('path');
const { createServer } = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN       = process.env.TOKEN;
const DEV_MODE    = process.argv.includes('--dev');
const SHARD_COUNT = process.env.SHARD_COUNT ? parseInt(process.env.SHARD_COUNT) : 'auto';
// Railway injects PORT automatically — use it so the health check is reachable
const HEALTH_PORT = parseInt(process.env.PORT || process.env.HEALTH_PORT || '8989');

const BOT_SCRIPT  = path.join(__dirname, 'index.js');
const MAX_RETRIES = 5;
const RETRY_BASE  = 5000;   // 5s base, doubles each attempt
const SPAWN_DELAY = 5500;   // ms between each shard spawn
const METRICS_INTERVAL = 5 * 60 * 1000; // 5 minutes

if (!TOKEN) {
  Logger.fatal('ShardManager', 'TOKEN is not set in environment variables. Exiting.');
  process.exit(1);
}

// ── Shard health tracking ─────────────────────────────────────────────────────
const shardHealth = new Map();  // shardId → { state, spawned, restarts, lastPing }

function setShardState(id, state, extras = {}) {
  const prev = shardHealth.get(id) || { restarts: 0, spawned: Date.now() };
  shardHealth.set(id, { ...prev, state, ...extras, updatedAt: Date.now() });
}

// ── Logger ────────────────────────────────────────────────────────────────────
function log(level, msg) {
  Logger[level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info']('ShardManager', msg);
}

Logger.banner();
log('info', `Starting Wave Network (dev=${DEV_MODE}, shards=${SHARD_COUNT})`);


// ── ShardingManager ───────────────────────────────────────────────────────────
const manager = new ShardingManager(BOT_SCRIPT, {
  token:        TOKEN,
  totalShards:  DEV_MODE ? 1 : SHARD_COUNT,
  shardList:    'auto',
  respawn:      true,       // ShardingManager will auto-respawn—we add backoff on top
  mode:         'process',
  execArgv:     [],
  env: {
    ...process.env,
    SHARDING_ENABLED: 'true',
  },
});

// ── Shard lifecycle events ────────────────────────────────────────────────────
manager.on('shardCreate', shard => {
  log('info', `Shard #${shard.id} created — spawning…`);
  setShardState(shard.id, 'spawning');

  // ── Ready ──────────────────────────────────────────────────────────────
  shard.on('ready', () => {
    log('ok', `✅  Shard #${shard.id} is READY`);
    setShardState(shard.id, 'ready', { readyAt: Date.now() });
  });

  // ── Disconnect ────────────────────────────────────────────────────────
  shard.on('disconnect', () => {
    log('warn', `⚠️   Shard #${shard.id} DISCONNECTED — Discord.js will reconnect automatically`);
    setShardState(shard.id, 'disconnected');
  });

  // ── Reconnecting ──────────────────────────────────────────────────────
  shard.on('reconnecting', () => {
    log('info', `🔄  Shard #${shard.id} RECONNECTING…`);
    setShardState(shard.id, 'reconnecting');
  });

  // ── Resume ────────────────────────────────────────────────────────────
  shard.on('resume', () => {
    log('ok', `▶️   Shard #${shard.id} RESUMED`);
    setShardState(shard.id, 'ready', { resumedAt: Date.now() });
  });

  // ── Error (WS error on the shard) ─────────────────────────────────────
  shard.on('error', err => {
    const safe = /ECONNRESET|ETIMEDOUT|Unknown Message/i.test(err?.message);
    if (safe) {
      log('warn', `Shard #${shard.id} transient error: ${err.message}`);
    } else {
      log('error', `Shard #${shard.id} ERROR: ${err.message}`);
    }
  });

  // ── Death (process exit) with exponential backoff respawn ─────────────
  shard.on('death', async (proc) => {
    const health = shardHealth.get(shard.id) || { restarts: 0 };
    const retries = health.restarts;

    log('error', `💀  Shard #${shard.id} DIED (code=${proc.exitCode}, restarts=${retries})`);
    setShardState(shard.id, 'dead');

    if (retries >= MAX_RETRIES) {
      log('error', `Shard #${shard.id} exceeded max restarts (${MAX_RETRIES}). Not respawning.`);
      return;
    }

    const delay = RETRY_BASE * Math.pow(2, retries);  // 5s, 10s, 20s, 40s, 80s
    log('warn', `Shard #${shard.id} will respawn in ${delay / 1000}s (attempt ${retries + 1}/${MAX_RETRIES})`);

    await new Promise(r => setTimeout(r, delay));
    setShardState(shard.id, 'respawning', { restarts: retries + 1 });

    try {
      await shard.spawn();
      log('ok', `Shard #${shard.id} respawned successfully.`);
    } catch (e) {
      log('error', `Shard #${shard.id} respawn failed: ${e.message}`);
    }
  });

  // ── Message from shard (inter-shard IPC) ──────────────────────────────
  shard.on('message', msg => {
    if (msg?._type === 'shard_ping') {
      setShardState(shard.id, shardHealth.get(shard.id)?.state || 'ready', { lastPing: Date.now() });
    }
    if (msg?._type === 'log') {
      log(msg.level || 'info', `[Shard#${shard.id}:${msg.tag || 'bot'}] ${msg.text}`);
    }
  });
});

// ── Spawn all shards ──────────────────────────────────────────────────────────
(async () => {
  try {
    log('info', `Spawning shards with ${SPAWN_DELAY}ms delay between each…`);
    await manager.spawn({ timeout: 90000, delay: SPAWN_DELAY });
    log('ok', `All ${manager.totalShards} shard(s) spawned successfully.`);
  } catch (e) {
    log('error', `Fatal: Failed to spawn shards: ${e.message}`);
    process.exit(1);
  }
})();

    // ── Metrics logger ─────────────────────────────────────────────────────
setInterval(async () => {
  try {
    const [pings, guilds, memResults] = await Promise.all([
      manager.broadcastEval(c => c.ws.ping),
      manager.broadcastEval(c => c.guilds.cache.size),
      manager.broadcastEval(() => Math.round(process.memoryUsage().rss / 1024 / 1024)),
    ]);

    let totalGuilds = 0;
    const shardRows = [];
    manager.shards.forEach((shard, id) => {
      const ping  = pings[id]   ?? -1;
      const guild = guilds[id]  ?? 0;
      const mem   = memResults[id] ?? 0;
      const state = shardHealth.get(id)?.state || 'unknown';
      totalGuilds += guild;
      setShardState(id, state, { ping, guild, mem });
      shardRows.push({ shardId: id, state, ping, guilds: guild, mem });
    });
    Logger.shardPanel(shardRows, totalGuilds);
  } catch { /* shard not ready yet */ }
}, METRICS_INTERVAL);


// ── Health check HTTP server ──────────────────────────────────────────────────
const healthServer = createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const statuses = [];
    let allReady = true;
    shardHealth.forEach((info, id) => {
      statuses.push({ id, ...info });
      if (info.state !== 'ready') allReady = false;
    });

    let totalGuilds = 0, avgPing = 0;
    try {
      const [guilds, pings] = await Promise.all([
        manager.broadcastEval(c => c.guilds.cache.size),
        manager.broadcastEval(c => c.ws.ping),
      ]);
      totalGuilds = guilds.reduce((a, b) => a + b, 0);
      avgPing     = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
    } catch { /* */ }

    const body = JSON.stringify({
      status:      allReady ? 'ok' : 'degraded',
      totalShards: manager.totalShards,
      totalGuilds,
      avgPing,
      uptime:      process.uptime(),
      shards:      statuses,
      ts:          new Date().toISOString(),
    }, null, 2);

    res.writeHead(allReady ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

healthServer.listen(HEALTH_PORT, () => {
  log('ok', `Health endpoint: http://localhost:${HEALTH_PORT}/health`);
});

// ── IPC: broadcast utility (exported for optional management scripts) ─────────
async function broadcast(fn) {
  return manager.broadcastEval(fn);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  log('warn', `${signal} received — graceful shutdown…`);
  try {
    // Tell all shards to update status to invisible before dying
    await manager.broadcastEval(async c => {
      await c.user?.setStatus('invisible').catch(() => null);
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch { /* */ }
  log('info', 'All shards signalled. Exiting.');
  healthServer.close();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('uncaughtException', e => {
  log('error', `uncaughtException in ShardManager: ${e.message}\n${e.stack}`);
  shutdown('uncaughtException');
});

module.exports = { manager, broadcast };
