/**
 * keepAlive.js — Express health server for Railway
 *
 * Railway requires a running HTTP server to consider the deployment healthy.
 * It uses the PORT environment variable (automatically injected).
 *
 * Routes:
 *   GET /          → 200 "Wave Network is online"
 *   GET /health    → 200 JSON with bot stats (for Railway health check)
 *   GET /ping      → 200 "pong"
 *
 * This runs inside the BOT SHARD process (index.js), not the ShardingManager.
 * The ShardingManager (shard.js) has its OWN /health endpoint on HEALTH_PORT.
 *
 * Railway automatically sets PORT — never hardcode it.
 */
const express = require('express');
const clc     = require('cli-color');

module.exports = async (client) => {
  const app  = express();
  const port = parseInt(process.env.PORT || client.config?.source?.port || 3000);

  app.use(express.json());

  // ── Root ─────────────────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    res.send(`
      <html><head><title>Wave Network</title></head>
      <body style="font-family:sans-serif;background:#0f0f1a;color:#fff;padding:2rem;text-align:center">
        <h1>🌊 Wave Network</h1>
        <p>Premium Discord Ticket Bot</p>
        <p style="color:#10B981">✅ Online</p>
        <code>Bot: ${client.user?.tag || 'Starting…'}</code>
      </body></html>
    `);
  });

  // ── Health check (Railway + uptime monitors) ──────────────────────────────
  app.get('/health', (req, res) => {
    const ready  = client.isReady?.() ?? !!client.user;
    const status = {
      status:  ready ? 'ok' : 'starting',
      bot:     client.user?.tag || null,
      guilds:  client.guilds?.cache?.size ?? 0,
      ping:    client.ws?.ping ?? -1,
      uptime:  Math.floor(process.uptime()),
      memory:  Math.round(process.memoryUsage().rss / 1024 / 1024),
      shard:   process.env.SHARDING_ENABLED === 'true' ? (process.env.SHARDS ?? 0) : 'standalone',
      ts:      new Date().toISOString(),
    };
    res.status(ready ? 200 : 503).json(status);
  });

  // ── Ping ──────────────────────────────────────────────────────────────────
  app.get('/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));

  // ── Start listening ───────────────────────────────────────────────────────
  app.listen(port, '0.0.0.0', () => {
    const SL = 69;
    console.log(
      '\n' +
      clc.yellowBright(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`) + '\n' +
      clc.yellowBright(`     ┃ `) + ' '.repeat(-1 + SL - ` ┃ `.length) + clc.yellowBright('┃') + '\n' +
      clc.yellowBright(`     ┃ `) + clc.greenBright(`         🌐  Health server listening on port ${port}`) + ' '.repeat(Math.max(0, -1 + SL - ` ┃ `.length - `         🌐  Health server listening on port ${port}`.length)) + clc.yellowBright('┃') + '\n' +
      clc.yellowBright(`     ┃ `) + ' '.repeat(-1 + SL - ` ┃ `.length) + clc.yellowBright('┃') + '\n' +
      clc.yellowBright(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`) + '\n'
    );
  });
};
