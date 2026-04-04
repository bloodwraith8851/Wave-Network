const express = require('express');
const Logger  = require(`${process.cwd()}/utils/logger`);

module.exports = async (client) => {
  const app  = express();
  const port = parseInt(process.env.PORT || client.config?.source?.port || 3000);
  const isSharded = process.env.SHARDING_ENABLED === 'true';

  // When running under ShardingManager, shard.js already owns PORT with its own
  // /health endpoint. Skip keepAlive to avoid EADDRINUSE → crash loop.
  if (isSharded) {
    Logger.info('keepAlive', `ShardingManager owns PORT ${port} — shard HTTP server skipped`);
    return;
  }

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

  // ── Start listening — catch port conflicts at server level ─────────────────
  const server = app.listen(port, '0.0.0.0');

  server.on('listening', () => {
    Logger.ok('keepAlive', `🌐  Health server running on port ${port}`);
    Logger.ok('keepAlive', `   GET http://0.0.0.0:${port}/health`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Port taken — this is expected when ShardManager is also running.
      // Do NOT crash — just log and continue. The ShardManager /health covers Railway.
      Logger.warn('keepAlive', `Port ${port} already in use — HTTP server skipped (ShardManager owns this port)`);
    } else {
      Logger.error('keepAlive', `HTTP server error (code: ${err.code})`, err);
    }
  });
};

