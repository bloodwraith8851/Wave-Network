/**
 * warningService.js — Per-user warning system
 */

/**
 * Add a warning to a user.
 */
async function addWarning(db, guildId, userId, staffId, reason) {
  const key = `guild_${guildId}.warnings_${userId}`;
  const warnings = (await db.get(key)) || [];
  const warn = {
    id: warnings.length + 1,
    reason,
    staffId,
    timestamp: Date.now()
  };
  warnings.push(warn);
  await db.set(key, warnings);
  return warn;
}

/**
 * Get all warnings for a user.
 */
async function getWarnings(db, guildId, userId) {
  return (await db.get(`guild_${guildId}.warnings_${userId}`)) || [];
}

/**
 * Clear all warnings for a user.
 */
async function clearWarnings(db, guildId, userId) {
  await db.delete(`guild_${guildId}.warnings_${userId}`);
}

/**
 * Remove a specific warning by ID.
 */
async function removeWarning(db, guildId, userId, warnId) {
  const key = `guild_${guildId}.warnings_${userId}`;
  const warnings = (await db.get(key)) || [];
  const filtered = warnings.filter(w => w.id !== warnId);
  await db.set(key, filtered);
  return filtered;
}

/**
 * Format a timestamp for display.
 */
function formatWarnTime(ts) {
  return `<t:${Math.floor(ts / 1000)}:R>`;
}

module.exports = { addWarning, getWarnings, clearWarnings, removeWarning, formatWarnTime };
