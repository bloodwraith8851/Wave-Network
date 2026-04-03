/**
 * antiAbuseService.js — Ticket abuse protection
 * Handles: per-user cooldowns, max open tickets, spam rate-limiting
 */

const DEFAULTS = {
  cooldown_seconds: 300,  // 5 minutes
  max_tickets: 1,         // max concurrent tickets per user
  spam_limit: 3,          // max attempts per spam window
  spam_window_ms: 30000   // 30 second spam window
};

/**
 * Check if a user is currently on ticket-creation cooldown.
 * @returns {{ blocked: boolean, remaining: number }} remaining in seconds
 */
async function checkCooldown(db, guildId, userId) {
  try {
    const settingKey = `guild_${guildId}.ticket.settings.cooldown_seconds`;
    const cooldownSecs = (await db.get(settingKey)) ?? DEFAULTS.cooldown_seconds;
    if (cooldownSecs === 0) return { blocked: false, remaining: 0 };

    const lastKey  = `guild_${guildId}.ticket.cooldown_${userId}`;
    const lastTime = await db.get(lastKey);
    if (!lastTime) return { blocked: false, remaining: 0 };

    const elapsed  = Date.now() - lastTime;
    const cooldownMs = cooldownSecs * 1000;
    if (elapsed < cooldownMs) {
      return { blocked: true, remaining: Math.ceil((cooldownMs - elapsed) / 1000) };
    }
    return { blocked: false, remaining: 0 };
  } catch {
    return { blocked: false, remaining: 0 };
  }
}

/**
 * Set the cooldown timestamp for a user (call after creating a ticket).
 */
async function setCooldown(db, guildId, userId) {
  await db.set(`guild_${guildId}.ticket.cooldown_${userId}`, Date.now());
}

/**
 * Check if user has too many open tickets.
 * @returns {{ blocked: boolean, count: number, max: number }}
 */
async function checkMaxTickets(db, guild, userId) {
  try {
    const maxKey = `guild_${guild.id}.ticket.settings.max_tickets`;
    const max    = (await db.get(maxKey)) ?? DEFAULTS.max_tickets;

    // Count all open ticket channels belonging to this user
    const userTickets = guild.channels.cache.filter(ch => {
      if (ch.type !== 0) return false; // text channels only
      if (!ch.name.startsWith('ticket-')) return false;
      return true; // further check by DB would be ideal but expensive; name check is fast
    });

    // More accurate: check DB control entries
    let count = 0;
    for (const [, ch] of userTickets) {
      const ctrl = await db.get(`guild_${guild.id}.ticket.control_${ch.id}`);
      if (ctrl === userId) count++;
    }

    return { blocked: count >= max, count, max };
  } catch {
    return { blocked: false, count: 0, max: DEFAULTS.max_tickets };
  }
}

/**
 * Spam rate-limit: max N attempts in a sliding window.
 * @returns {{ blocked: boolean }}
 */
async function checkSpam(db, guildId, userId) {
  try {
    const key  = `guild_${guildId}.ticket.spam_${userId}`;
    const data = (await db.get(key)) || { count: 0, firstAttempt: Date.now() };

    const now     = Date.now();
    const elapsed = now - data.firstAttempt;

    if (elapsed > DEFAULTS.spam_window_ms) {
      // Reset window
      await db.set(key, { count: 1, firstAttempt: now });
      return { blocked: false };
    }

    data.count++;
    await db.set(key, data);

    if (data.count > DEFAULTS.spam_limit) {
      return { blocked: true };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

/**
 * Run all abuse checks in order. Returns a result object.
 * @returns {{ allowed: boolean, reason: string|null, remaining?: number }}
 */
async function runAllChecks(db, guild, userId) {
  // 1. spam check
  const spam = await checkSpam(db, guild.id, userId);
  if (spam.blocked) {
    return { allowed: false, reason: 'spam', remaining: 0 };
  }

  // 2. cooldown check
  const cool = await checkCooldown(db, guild.id, userId);
  if (cool.blocked) {
    return { allowed: false, reason: 'cooldown', remaining: cool.remaining };
  }

  // 3. max tickets check
  const max = await checkMaxTickets(db, guild, userId);
  if (max.blocked) {
    return { allowed: false, reason: 'max_tickets', count: max.count, max: max.max };
  }

  return { allowed: true, reason: null };
}

module.exports = { checkCooldown, setCooldown, checkMaxTickets, checkSpam, runAllChecks };
