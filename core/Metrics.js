'use strict';
/**
 * Metrics.js — Bot Observability Layer
 *
 * Lightweight in-process metrics collection.
 * No external dependencies — pure in-memory counters + gauges + timings.
 *
 * Usage:
 *   const Metrics = require('./core/Metrics');
 *   Metrics.increment('commands.executed');
 *   Metrics.gauge('memory.rss', process.memoryUsage().rss);
 *   Metrics.timing('db.read', 4);
 *   const snap = Metrics.snapshot();
 *
 * Exposed by apiServer.js at GET /metrics (authenticated).
 */

// ─────────────────── Store ────────────────────────────────────────────────────
const _counters = new Map();  // name → total count
const _gauges   = new Map();  // name → current value
const _timings  = new Map();  // name → { count, total, min, max }
const _started  = Date.now();

// ─────────────────── Core API ─────────────────────────────────────────────────

/**
 * Increment a counter.
 * @param {string} name  — e.g. 'commands.executed', 'tickets.created'
 * @param {number} [by]  — increment amount (default 1)
 */
function increment(name, by = 1) {
  _counters.set(name, (_counters.get(name) || 0) + by);
}

/**
 * Decrement a counter.
 * @param {string} name
 * @param {number} [by]
 */
function decrement(name, by = 1) {
  _counters.set(name, Math.max(0, (_counters.get(name) || 0) - by));
}

/**
 * Set a gauge (a value that goes up and down — e.g. memory, active tickets).
 * @param {string} name
 * @param {number} value
 */
function gauge(name, value) {
  _gauges.set(name, value);
}

/**
 * Record a timing measurement.
 * @param {string} name     — e.g. 'db.read', 'api.latency'
 * @param {number} ms       — duration in milliseconds
 */
function timing(name, ms) {
  if (!_timings.has(name)) {
    _timings.set(name, { count: 0, total: 0, min: Infinity, max: -Infinity });
  }
  const t  = _timings.get(name);
  t.count += 1;
  t.total += ms;
  if (ms < t.min) t.min = ms;
  if (ms > t.max) t.max = ms;
}

/**
 * Time an async function and record the result.
 * @param {string}   name
 * @param {Function} fn
 * @returns {*} The return value of fn
 */
async function time(name, fn) {
  const start  = Date.now();
  const result = await fn();
  timing(name, Date.now() - start);
  return result;
}

// ─────────────────── Snapshot ─────────────────────────────────────────────────

/**
 * Get a full metrics snapshot — used by /metrics API endpoint and /status command.
 * @returns {object}
 */
function snapshot() {
  const mem     = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());

  // Summarize timings
  const timingsSummary = {};
  for (const [name, t] of _timings) {
    timingsSummary[name] = {
      count: t.count,
      avgMs: t.count > 0 ? Math.round(t.total / t.count) : 0,
      minMs: t.min === Infinity  ? 0 : t.min,
      maxMs: t.max === -Infinity ? 0 : t.max,
    };
  }

  return {
    timestamp:   new Date().toISOString(),
    uptimeSec,
    counters:    Object.fromEntries(_counters),
    gauges:      Object.fromEntries(_gauges),
    timings:     timingsSummary,
    process: {
      rssBytes:       mem.rss,
      heapUsedBytes:  mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      node:           process.version,
      platform:       process.platform,
      pid:            process.pid,
    },
    startedAt: new Date(_started).toISOString(),
  };
}

/**
 * Reset all metrics (useful for testing).
 */
function reset() {
  _counters.clear();
  _gauges.clear();
  _timings.clear();
}

// ─────────────────── Auto-gauges (updated every 30s) ──────────────────────────

let _autoInterval = null;

function startAutoGauges() {
  if (_autoInterval) return;
  _autoInterval = setInterval(() => {
    const mem = process.memoryUsage();
    gauge('memory.rss',       mem.rss);
    gauge('memory.heap_used', mem.heapUsed);
    gauge('process.uptime',   Math.floor(process.uptime()));
  }, 30_000);

  if (_autoInterval.unref) _autoInterval.unref();
}

function stopAutoGauges() {
  if (_autoInterval) { clearInterval(_autoInterval); _autoInterval = null; }
}

// ─────────────────── Export ───────────────────────────────────────────────────

module.exports = {
  increment,
  decrement,
  gauge,
  timing,
  time,
  snapshot,
  reset,
  startAutoGauges,
  stopAutoGauges,
};
