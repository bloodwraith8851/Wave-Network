'use strict';
/**
 * CacheLayer.js — Write-batching + Read-through TTL Cache
 *
 * Sits in front of QuickDB to eliminate redundant disk reads and batch writes.
 *
 * Performance impact:
 *  • Reduces DB reads from ~5ms × N per interaction → 1 read per 5 min per guild
 *  • Write batching eliminates JSON file thrashing (the #1 latency bottleneck)
 *  • Estimated round-trip improvement: 300ms → <100ms on cached paths
 *
 * Usage:
 *   const cache = new CacheLayer(client.db);
 *   cache.start();
 *
 *   // Guild-scoped helpers (recommended)
 *   const role = await cache.guild(guildId).get('ticket.admin_role');
 *   cache.guild(guildId).set('ticket.admin_role', roleId);
 *   cache.guild(guildId).invalidate();   // called on settings change
 *
 *   // Raw DB-like access
 *   await cache.get('some_key');
 *   cache.set('some_key', value);
 */

const Logger = require('../utils/logger');

const TTL = {
  GUILD:  300_000,   // 5 min — guild settings (changes rarely)
  USER:    30_000,   // 30s  — user-specific data
  PERM:    60_000,   // 60s  — resolved permission level
  SHORT:   10_000,   // 10s  — high-churn values
};

const FLUSH_INTERVAL = 500;   // batch write every 500ms
const MAX_ENTRIES    = 10_000; // guard against unbounded growth

class CacheLayer {
  /**
   * @param {import('quick.db').QuickDB} db
   */
  constructor(db) {
    this.db      = db;
    this._store  = new Map();   // key → { value, expiresAt }
    this._dirty  = new Map();   // key → value  (pending writes)
    this._hits   = 0;
    this._misses = 0;
    this._timer  = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    this._isRunning = true;
    this._flushLoop();
    Logger.ok('CacheLayer', 'Started — write-batching initialized ✅');
    return this;
  }

  async stop() {
    this._isRunning = false;
    clearTimeout(this._timer);
    await this._flush();
    Logger.ok('CacheLayer', 'Stopped — final flush complete');
  }

  async _flushLoop() {
    if (!this._isRunning) return;
    try {
      await this._flush();
    } catch (e) {
      Logger.error('CacheLayer', 'Flush error', e);
    }
    this._timer = setTimeout(() => this._flushLoop(), FLUSH_INTERVAL);
    if (this._timer.unref) this._timer.unref();
  }

  // ── Core get / set / delete ───────────────────────────────────────────────

  /**
   * Get a value. Returns cached copy or fetches from DB (cache-miss → store).
   */
  async get(key, ttl = TTL.GUILD) {
    const entry = this._store.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      this._hits++;
      return entry.value;
    }

    this._misses++;
    let value;
    try {
      value = await this.db.get(key);
    } catch (e) {
      Logger.error('CacheLayer', `DB read failed: ${key}`, e);
      return null;
    }

    if (value !== null && value !== undefined) {
      this._setMemory(key, value, ttl);
    }
    return value !== undefined ? value : null;
  }

  /**
   * Set a value — writes to memory immediately and queues for batch flush.
   */
  set(key, value, ttl = TTL.GUILD) {
    this._setMemory(key, value, ttl);
    this._dirty.set(key, value);
    return this;
  }

  /**
   * Delete a value from cache + DB immediately.
   */
  async delete(key) {
    this._store.delete(key);
    this._dirty.delete(key);
    try {
      await this.db.delete(key);
    } catch (e) {
      Logger.error('CacheLayer', `DB delete failed: ${key}`, e);
    }
    return this;
  }

  /**
   * Check if a key exists.
   */
  async has(key) {
    const val = await this.get(key);
    return val !== null && val !== undefined;
  }

  // ── Scoped helpers ────────────────────────────────────────────────────────

  /**
   * Guild-scoped cache helper — auto-namespaces keys with `guild_{id}.`
   */
  guild(guildId) {
    if (!guildId || guildId === 'DM') {
      return { get: () => null, set: () => this, delete: () => this, has: () => false, invalidate: () => 0 };
    }
    const prefix = `guild_${guildId}`;
    return {
      get:        (path, ttl)        => this.get(`${prefix}.${path}`, ttl),
      set:        (path, value, ttl) => this.set(`${prefix}.${path}`, value, ttl),
      delete:     (path)             => this.delete(`${prefix}.${path}`),
      has:        (path)             => this.has(`${prefix}.${path}`),
      invalidate: ()                 => this.invalidate(guildId),
    };
  }

  /**
   * User-scoped cache helper — 30s TTL (higher churn).
   */
  user(guildId, userId) {
    const prefix = `guild_${guildId}.user_${userId}`;
    return {
      get:    (path)        => this.get(`${prefix}.${path}`,  TTL.USER),
      set:    (path, value) => this.set(`${prefix}.${path}`, value, TTL.USER),
      delete: (path)        => this.delete(`${prefix}.${path}`),
    };
  }

  /**
   * Permission cache — 60s TTL, cleared on role change.
   */
  perm(guildId, userId) {
    const key = `_perm_cache_${guildId}_${userId}`;
    return {
      get:   ()       => this.get(key, TTL.PERM),
      set:   (level)  => this.set(key, level, TTL.PERM),
      clear: ()       => this._store.delete(key),
    };
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /**
   * Purge all cache entries for a specific guild.
   * Call this whenever guild settings are written.
   */
  invalidate(guildId) {
    const prefix = `guild_${guildId}`;
    let count = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) { this._store.delete(key); count++; }
    }
    // Also clear permission cache for this guild
    for (const key of this._store.keys()) {
      if (key.startsWith(`_perm_cache_${guildId}`)) { this._store.delete(key); count++; }
    }
    Logger.debug('CacheLayer', `Invalidated ${count} keys for guild ${guildId}`);
    return count;
  }

  /** Clear all entries (hot-reload / restart scenario) */
  invalidateAll() {
    const size = this._store.size;
    this._store.clear();
    this._dirty.clear();
    Logger.debug('CacheLayer', `Purged all ${size} cache entries`);
    return size;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats() {
    const total   = this._hits + this._misses;
    const hitRate = total > 0 ? ((this._hits / total) * 100).toFixed(1) : '0.0';
    // Rough memory estimate
    let sizeBytes = 0;
    try { sizeBytes = JSON.stringify([...this._store.values()]).length; } catch { /* */ }

    return {
      hits:    this._hits,
      misses:  this._misses,
      hitRate: `${hitRate}%`,
      entries: this._store.size,
      pending: this._dirty.size,
      sizeKB:  (sizeBytes / 1024).toFixed(1),
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _setMemory(key, value, ttl) {
    // Evict oldest entry if at capacity
    if (this._store.size >= MAX_ENTRIES) {
      const oldest = this._store.keys().next().value;
      this._store.delete(oldest);
    }
    this._store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  async _flush() {
    if (this._dirty.size === 0) return;

    const batch = new Map(this._dirty);
    this._dirty.clear();

    try {
      for (const [key, value] of batch.entries()) {
        await this.db.set(key, value);
      }
      Logger.debug('CacheLayer', `Flushed ${batch.size} pending write(s) serially`);
    } catch (e) {
      Logger.error('CacheLayer', 'Batch flush failed — re-queuing dirty keys', e);
      for (const [k, v] of batch) this._dirty.set(k, v);
    }
  }
}

module.exports = CacheLayer;
