'use strict';
/**
 * apiServer.js — Wave Network RESTful API Handler
 *
 * Replaces the basic keep-alive Express server with a full REST API layer.
 * Used by the web dashboard and external integrations.
 *
 * Endpoints:
 *   GET  /health                       — Shard + service health (public)
 *   GET  /metrics                      — Full metrics snapshot (auth required)
 *   GET  /api/guild/:id                — Guild settings (auth required)
 *   POST /api/guild/:id/settings       — Update guild settings (auth required)
 *   GET  /api/guild/:id/stats          — Analytics data (auth required)
 *   GET  /api/guild/:id/tickets        — Open ticket list (auth required)
 *   POST /api/command/reload           — Hot-reload commands (owner token)
 *
 * Auth:
 *   All /api/* and /metrics routes require:
 *   Authorization: Bearer <API_SECRET>
 *   API_SECRET is set via environment variable.
 */

const express   = require('express');
const Logger    = require(`${process.cwd()}/utils/logger`);
const Metrics   = require(`${process.cwd()}/core/Metrics`);

// Request rate limiter (simple in-memory)
const rateLimits = new Map(); // ip → { count, resetAt }
const RATE_LIMIT  = 60;      // requests per window
const RATE_WINDOW = 60_000;  // 1 minute

function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimits.get(ip) || { count: 0, resetAt: now + RATE_WINDOW };

  if (now > entry.resetAt) {
    entry.count   = 0;
    entry.resetAt = now + RATE_WINDOW;
  }

  entry.count++;
  rateLimits.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 60 requests/minute.' });
  }

  next();
}

// Bearer token auth middleware
function requireAuth(req, res, next) {
  const secret = process.env.API_SECRET;
  if (!secret) return next(); // No secret set = open (dev mode)

  const header = req.headers['authorization'];
  const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid Bearer token.' });
  }
  next();
}

module.exports = function startApiServer(client) {
  const port = client.config?.source?.port || parseInt(process.env.PORT || '3000');
  const app  = express();

  // ── Middleware ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '50kb' }));
  // ── Security Headers ────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  });

  app.use((req, res, next) => {
    // CORS — allow dashboard origin
    const allowedOrigins = [
      process.env.DASHBOARD_URL || 'http://localhost:3001',
      'https://wave-dashboard.vercel.app',
    ];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(o => origin.startsWith(o))) {
      res.setHeader('Access-Control-Allow-Origin',  origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(rateLimit);

  // ── GET /health ─ Public ──────────────────────────────────────────────────
  app.get('/health', async (req, res) => {
    try {
      const shardId    = client.shardId ?? 0;
      const isReady    = client?.user !== null;
      const serviceSum = client.services?.summary?.() || { total: 0, ok: 0 };

      Metrics.increment('api.health_checks');

      res.json({
        status:      isReady ? 'ok' : 'starting',
        shard:       shardId,
        guilds:      client.guilds?.cache?.size ?? 0,
        users:       client.guilds?.cache?.reduce((a, g) => a + g.memberCount, 0) ?? 0,
        ping:        client.ws?.ping ?? -1,
        memory_mb:   Math.round(process.memoryUsage().rss / 1024 / 1024),
        uptime_sec:  Math.floor(process.uptime()),
        services:    serviceSum,
        timestamp:   Date.now(),
        version:     require(`${process.cwd()}/package.json`).version,
      });
    } catch (e) {
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // ── GET /metrics ─ Auth required ─────────────────────────────────────────
  app.get('/metrics', requireAuth, (req, res) => {
    Metrics.increment('api.metrics_fetches');
    const cacheStats = client.cache?.stats?.() || {};
    const snap       = Metrics.snapshot();
    snap.cache       = cacheStats;
    res.json(snap);
  });

  // ── GET /api/guild/:id ─ Full settings ───────────────────────────────────
  app.get('/api/guild/:id', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    if (!/^\d{17,19}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });

    try {
      const data    = await client.db.get(`guild_${guildId}`);
      const guild   = client.guilds?.cache?.get(guildId);

      Metrics.increment('api.guild_reads');
      res.json({
        guild_id:    guildId,
        guild_name:  guild?.name ?? null,
        icon:        guild?.iconURL({ dynamic: true }) ?? null,
        member_count: guild?.memberCount ?? null,
        config:      data ?? {},
        timestamp:   Date.now(),
      });
    } catch (e) {
      Logger.error('ApiServer', `GET /api/guild/${guildId} failed`, e);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // ── POST /api/guild/:id/settings ─ Update settings ───────────────────────
  app.post('/api/guild/:id/settings', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    if (!/^\d{17,19}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });

    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs.' });
    }

    try {
      const ops = Object.entries(updates).map(([key, value]) => {
        // Sanitize key (prevent DB injection)
        if (!/^[a-z0-9._-]{1,100}$/i.test(key)) return null;
        return client.db.set(`guild_${guildId}.${key}`, value);
      }).filter(Boolean);

      await Promise.all(ops);
      client.cache?.invalidate?.(guildId);

      Metrics.increment('api.guild_writes');
      res.json({ success: true, updated: Object.keys(updates).length, timestamp: Date.now() });
    } catch (e) {
      Logger.error('ApiServer', `POST /api/guild/${guildId}/settings failed`, e);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // ── GET /api/guild/:id/stats ─ Analytics data ─────────────────────────────
  app.get('/api/guild/:id/stats', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    if (!/^\d{17,19}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });

    try {
      const stats = await client.db.get(`guild_${guildId}.analytics`) || {};
      Metrics.increment('api.stats_reads');
      res.json({ guild_id: guildId, stats, timestamp: Date.now() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/guild/:id/tickets ─ Open tickets ─────────────────────────────
  app.get('/api/guild/:id/tickets', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    if (!/^\d{17,19}$/.test(guildId)) return res.status(400).json({ error: 'Invalid guild ID.' });

    try {
      const guild = client.guilds?.cache?.get(guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found on this shard.' });

      // Find channels that are tickets
      const tickets = [];
      for (const [chId, ch] of guild.channels.cache) {
        const ownerId = await client.db.get(`guild_${guildId}.ticket.control_${chId}`);
        if (!ownerId) continue;

        tickets.push({
          channel_id:   chId,
          channel_name: ch.name,
          owner_id:     ownerId,
          category:     await client.db.get(`guild_${guildId}.ticket.category_${chId}`),
          claimed_by:   await client.db.get(`guild_${guildId}.ticket.claimed_${chId}`),
          priority:     await client.db.get(`guild_${guildId}.ticket.priority_${chId}`) || 'medium',
          created_at:   await client.db.get(`guild_${guildId}.ticket.created_at_${chId}`),
        });
      }

      Metrics.increment('api.ticket_reads');
      res.json({ guild_id: guildId, count: tickets.length, tickets, timestamp: Date.now() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/command/reload ─ Hot reload commands ─────────────────────────
  app.post('/api/command/reload', requireAuth, async (req, res) => {
    // Extra check: only owner token
    const ownerToken = process.env.OWNER_API_TOKEN;
    if (ownerToken) {
      const provided = req.headers['x-owner-token'];
      if (provided !== ownerToken) return res.status(403).json({ error: 'Forbidden.' });
    }

    try {
      // Clear command cache and re-require all commands
      const fs     = require('fs');
      const cwd    = process.cwd();
      let   reloaded = 0;

      fs.readdirSync(`${cwd}/commands`).forEach(dir => {
        fs.readdirSync(`${cwd}/commands/${dir}`).filter(f => f.endsWith('.js')).forEach(file => {
          try {
            const path = require.resolve(`${cwd}/commands/${dir}/${file}`);
            delete require.cache[path];
            const cmd = require(path);
            if (cmd.name) { client.commands.set(cmd.name, cmd); reloaded++; }
          } catch { /* skip */ }
        });
      });

      Metrics.increment('api.reloads');
      Logger.ok('ApiServer', `Hot-reload: ${reloaded} commands reloaded`);
      res.json({ success: true, reloaded, timestamp: Date.now() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  // ── Start server ──────────────────────────────────────────────────────────
  const server = app.listen(port, () => {
    Logger.ok('ApiServer', `✅  API server listening on port ${port}`);
    Logger.ok('ApiServer', `   Health:  GET  /health`);
    Logger.ok('ApiServer', `   Metrics: GET  /metrics  (auth)`);
    Logger.ok('ApiServer', `   Guild:   GET  /api/guild/:id  (auth)`);
    Metrics.startAutoGauges();
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      Logger.warn('ApiServer', `Port ${port} already in use — API server not started (ShardManager likely owns it).`);
    } else {
      Logger.error('ApiServer', 'Server error', e);
    }
  });

  return server;
};
