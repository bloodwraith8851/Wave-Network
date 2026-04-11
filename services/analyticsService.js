/**
 * analyticsService.js — Ticket analytics tracking & reporting
 * Audited: null guards, Logger integration, healthCheck for ServiceContainer.
 */
const Logger = require('../utils/logger');
/**
 * Track a single analytics event.
 * @param {object} db
 * @param {string} guildId
 * @param {string} event  — 'ticket_created' | 'ticket_closed' | 'ticket_deleted' | 'first_response'
 * @param {object} data
 */
async function trackEvent(db, guildId, event, data) {
  // Guard: never write to guild_undefined or guild_DM
  if (!guildId || typeof guildId !== 'string' || guildId === 'DM' || guildId === 'undefined') return;
  try {
    const key = `guild_${guildId}.analytics`;

    // Increment total counters
    if (event === 'ticket_created') {
      await db.add(`${key}.total_created`, 1);
      // Per-category
      const cat = (data.category || 'unknown').replace(/\s/g, '_');
      await db.add(`${key}.category_${cat}`, 1);
    }
    if (event === 'ticket_closed' || event === 'ticket_deleted') {
      await db.add(`${key}.total_closed`, 1);
      // Track staff close count
      if (data.staffId) {
        await db.add(`${key}.staff_${data.staffId}_closed`, 1);
      }
    }
    if (event === 'first_response') {
      // response time in ms
      const responseTime = data.responseTime;
      if (typeof responseTime === 'number' && responseTime > 0) {
        const existing = (await db.get(`${key}.response_times`)) || [];
        existing.push(responseTime);
        // Keep only last 100 for performance
        if (existing.length > 100) existing.shift();
        await db.set(`${key}.response_times`, existing);
      }
    }

    // Store raw event log (trimmed to last 200)
    const events = (await db.get(`${key}.events`)) || [];
    events.push({ event, ts: Date.now(), ...data });
    if (events.length > 200) events.shift();
    await db.set(`${key}.events`, events);

  } catch (e) {
    Logger.error('analyticsService', `trackEvent error: ${e.message}`);
  }
}

/**
 * Get aggregated stats for a guild.
 * @returns {object}
 */
async function getStats(db, guild) {
  // Guard: never query without a real guild object
  if (!guild?.id || typeof guild.id !== 'string') {
    return { totalCreated: 0, totalClosed: 0, openTickets: 0, avgResponse: null, catBreakdown: {}, staffLeaderboard: [] };
  }
  try {
    const key = `guild_${guild.id}.analytics`;

    const totalCreated = (await db.get(`${key}.total_created`)) || 0;
    const totalClosed  = (await db.get(`${key}.total_closed`))  || 0;

    // Count currently open tickets
    const openTickets = guild.channels.cache.filter(c =>
      c.type === 0 && c.name.startsWith('ticket-')
    ).size;

    // Avg response time
    const responseTimes = (await db.get(`${key}.response_times`)) || [];
    const avgResponse = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    // Build category breakdown
    const events  = (await db.get(`${key}.events`)) || [];
    const catMap  = {};
    for (const e of events) {
      if (e.event === 'ticket_created' && e.category) {
        catMap[e.category] = (catMap[e.category] || 0) + 1;
      }
    }

    // Build staff leaderboard
    const staffMap = {};
    for (const e of events) {
      if ((e.event === 'ticket_closed' || e.event === 'ticket_deleted') && e.staffId) {
        staffMap[e.staffId] = (staffMap[e.staffId] || 0) + 1;
      }
    }
    const staffLeaderboard = Object.entries(staffMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    return {
      totalCreated,
      totalClosed,
      openTickets,
      avgResponse,
      catBreakdown: catMap,
      staffLeaderboard
    };
  } catch (e) {
    Logger.error('analyticsService', `getStats error: ${e.message}`);
    return { totalCreated: 0, totalClosed: 0, openTickets: 0, avgResponse: null, catBreakdown: {}, staffLeaderboard: [] };
  }
}

/**
 * Format milliseconds into a human-readable string.
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return 'N/A';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** ServiceContainer health check */
async function healthCheck() { /* stateless — always healthy */ }

module.exports = { trackEvent, getStats, formatDuration, healthCheck };
