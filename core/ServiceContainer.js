'use strict';
/**
 * ServiceContainer.js — Dependency Injection Container + Health Registry
 *
 * Manages all 24 Wave Network services as named singletons with:
 *  - Lazy initialization (services loaded on first .get())
 *  - Ordered startup lifecycle (startAll → calls service.start(client))
 *  - Per-service health checks (checkAll → { name, status, latencyMs }[])
 *  - Graceful shutdown (stopAll → calls service.stop())
 *  - Crash-isolated background workers
 *
 * Usage in index.js:
 *   const ServiceContainer = require('./core/ServiceContainer');
 *   const container = new ServiceContainer();
 *   container
 *     .register('ticket',    require('./services/ticketService'))
 *     .register('analytics', require('./services/analyticsService'))
 *     // ... all 24 services
 *
 *   await container.startAll(client);
 *   client.services = container;
 *
 * Usage in commands (via ctx.services):
 *   const ticketSvc = ctx.services.get('ticket');
 *   await ticketSvc.createTicket(ctx.client, ctx.interaction, 'General', null, reason);
 */

const Logger = require('../utils/logger');

class ServiceContainer {
  constructor() {
    this._registry  = new Map();  // name → { instance | factory, options }
    this._instances = new Map();  // name → resolved singleton instance
    this._health    = new Map();  // name → { status, latencyMs, error?, checkedAt }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a service by name.
   * @param {string}          name     — identifier used in .get()
   * @param {object|Function} factory  — service object or factory function
   * @param {{ singleton?: boolean }} options
   */
  register(name, factory, options = {}) {
    this._registry.set(name, { factory, options: { singleton: true, ...options } });
    return this; // chainable
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  /**
   * Get a registered service (lazy-initializes singletons).
   * @param {string} name
   * @returns {object}
   */
  get(name) {
    if (!this._registry.has(name)) {
      throw new Error(`[ServiceContainer] Service '${name}' is not registered. Available: ${[...this._registry.keys()].join(', ')}`);
    }

    const { factory, options } = this._registry.get(name);

    if (options.singleton) {
      if (!this._instances.has(name)) {
        const instance = typeof factory === 'function' ? factory() : factory;
        this._instances.set(name, instance);
      }
      return this._instances.get(name);
    }

    // Non-singleton: create fresh instance each time
    return typeof factory === 'function' ? factory() : factory;
  }

  /** Check if a service is registered */
  has(name) {
    return this._registry.has(name);
  }

  /** List all registered service names */
  list() {
    return [...this._registry.keys()];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start all registered services.
   * Calls service.start(client) if the method exists.
   * Services are started sequentially to respect dependencies.
   */
  async startAll(client) {
    Logger.info('ServiceContainer', `Initializing ${this._registry.size} services…`);
    let started = 0;
    const failed = [];
    const startOrder = [...this._registry.keys()];

    for (const name of startOrder) {
      try {
        const svc = this.get(name);
        if (typeof svc.start === 'function') {
          await svc.start(client);
          Logger.ok('ServiceContainer', `✅  ${name}`);
          started++;
        }
      } catch (e) {
        failed.push(name);
        Logger.error('ServiceContainer', `Failed to start '${name}'`, e);
      }
    }

    Logger.loadedBox('Services', started);
    if (failed.length) {
      Logger.warn('ServiceContainer', `${failed.length} service(s) failed to start: ${failed.join(', ')}`);
    }

    return { started, failed };
  }

  /**
   * Stop all services gracefully.
   * Calls service.stop() if the method exists.
   */
  async stopAll() {
    Logger.info('ServiceContainer', 'Stopping all services…');

    for (const [name, instance] of this._instances) {
      try {
        if (typeof instance.stop === 'function') {
          await instance.stop();
          Logger.ok('ServiceContainer', `Stopped: ${name}`);
        }
      } catch (e) {
        Logger.error('ServiceContainer', `Error stopping '${name}'`, e);
      }
    }

    this._instances.clear();
    Logger.ok('ServiceContainer', 'All services stopped.');
  }

  // ── Health Checks ─────────────────────────────────────────────────────────

  /**
   * Run health checks on all services.
   * Returns an array of { name, status, latencyMs, error? } objects.
   */
  async checkAll() {
    const results = [];

    for (const [name] of this._registry) {
      const started = Date.now();
      try {
        const svc = this.get(name);

        if (typeof svc.healthCheck === 'function') {
          await svc.healthCheck();
        }

        const latencyMs = Date.now() - started;
        const record    = { status: 'ok', latencyMs, checkedAt: Date.now() };
        this._health.set(name, record);
        results.push({ name, ...record });

      } catch (e) {
        const latencyMs = Date.now() - started;
        const record    = { status: 'error', error: e.message, latencyMs, checkedAt: Date.now() };
        this._health.set(name, record);
        results.push({ name, ...record });
      }
    }

    return results;
  }

  /**
   * Get cached health state for a specific service or all services.
   * @param {string} [name] — if omitted returns all
   */
  health(name) {
    if (name) return this._health.get(name) ?? { status: 'unknown', latencyMs: 0 };
    return [...this._health.entries()].map(([n, h]) => ({ name: n, ...h }));
  }

  /**
   * Quick summary for /status command or API
   */
  summary() {
    const all      = this.health();
    const ok       = all.filter(s => s.status === 'ok').length;
    const errored  = all.filter(s => s.status === 'error').length;
    const unknown  = all.filter(s => s.status === 'unknown').length;
    const avgMs    = all.length > 0
      ? Math.round(all.reduce((a, s) => a + (s.latencyMs || 0), 0) / all.length)
      : 0;

    return {
      total:   this._registry.size,
      ok,
      errored,
      unknown,
      avgLatencyMs: avgMs,
      services:     all,
    };
  }
}

module.exports = ServiceContainer;
