/**
 * autoAssignService.js — Round-robin / load-balanced ticket assignment
 *
 * Automatically assigns tickets to available staff when created.
 *
 * Modes: round_robin | load_balanced | off
 * DB keys:
 *   guild_<id>.autoassign.mode       → 'round_robin'|'load_balanced'|'off'
 *   guild_<id>.autoassign.pool       → staffUserId[]  (configured pool)
 *   guild_<id>.autoassign.rr_index   → number         (round-robin pointer)
 *   guild_<id>.autoassign.counts     → { userId: openTicketCount }
 */

/**
 * Get auto-assign configuration.
 */
async function getConfig(db, guildId) {
  return {
    mode:  (await db.get(`guild_${guildId}.autoassign.mode`)) || 'off',
    pool:  (await db.get(`guild_${guildId}.autoassign.pool`)) || [],
    index: (await db.get(`guild_${guildId}.autoassign.rr_index`)) ?? 0,
  };
}

/**
 * Set auto-assign mode.
 */
async function setMode(db, guildId, mode) {
  await db.set(`guild_${guildId}.autoassign.mode`, mode);
}

/**
 * Add a staff member to the assignment pool.
 */
async function addToPool(db, guildId, userId) {
  const pool = (await db.get(`guild_${guildId}.autoassign.pool`)) || [];
  if (!pool.includes(userId)) {
    pool.push(userId);
    await db.set(`guild_${guildId}.autoassign.pool`, pool);
    return true;
  }
  return false;
}

/**
 * Remove a staff member from the assignment pool.
 */
async function removeFromPool(db, guildId, userId) {
  const pool    = (await db.get(`guild_${guildId}.autoassign.pool`)) || [];
  const filtered = pool.filter(id => id !== userId);
  await db.set(`guild_${guildId}.autoassign.pool`, filtered);
  return filtered.length < pool.length;
}

/**
 * Get current open ticket count for a staff member.
 */
async function getStaffLoad(db, guildId, userId) {
  const counts = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};
  return counts[userId] || 0;
}

/**
 * Pick the next staff member to assign based on mode.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<string|null>} userId or null
 */
async function pickStaff(db, guild) {
  const guildId = guild.id;
  const cfg     = await getConfig(db, guildId);

  if (cfg.mode === 'off' || !cfg.pool.length) return null;

  // Filter to online/idle members only
  await guild.members.fetch({ user: cfg.pool }).catch(() => null);
  const available = cfg.pool.filter(uid => {
    const member = guild.members.cache.get(uid);
    if (!member) return false;
    const status = member.presence?.status;
    return status === 'online' || status === 'idle';
  });

  if (!available.length) return cfg.pool[cfg.index % cfg.pool.length] || null; // fallback: any pool member

  if (cfg.mode === 'round_robin') {
    const idx    = cfg.index % available.length;
    const chosen = available[idx];
    await db.set(`guild_${guildId}.autoassign.rr_index`, idx + 1);
    return chosen;
  }

  if (cfg.mode === 'load_balanced') {
    const counts = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};
    let   chosen = available[0];
    let   minLoad = counts[chosen] || 0;
    for (const uid of available) {
      const load = counts[uid] || 0;
      if (load < minLoad) { minLoad = load; chosen = uid; }
    }
    return chosen;
  }

  return null;
}

/**
 * Increment the open-ticket count for a staff member (called on assignment).
 */
async function incrementLoad(db, guildId, userId) {
  const counts    = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};
  counts[userId]  = (counts[userId] || 0) + 1;
  await db.set(`guild_${guildId}.autoassign.counts`, counts);
}

/**
 * Decrement load when a ticket is closed/deleted.
 */
async function decrementLoad(db, guildId, userId) {
  const counts   = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};
  counts[userId] = Math.max(0, (counts[userId] || 1) - 1);
  await db.set(`guild_${guildId}.autoassign.counts`, counts);
}

/**
 * Assign a ticket to the next available staff member.
 * Returns the assigned userId or null.
 */
async function assignTicket(client, guild, ticketChannel, db) {
  try {
    const guildId  = guild.id;
    const staffId  = await pickStaff(db, guild);
    if (!staffId) return null;

    const { EmbedBuilder } = require('discord.js');
    const member = guild.members.cache.get(staffId) || await guild.members.fetch(staffId).catch(() => null);
    if (!member) return null;

    // Store assignment
    await db.set(`guild_${guildId}.ticket.assigned_${ticketChannel.id}`, staffId);
    await incrementLoad(db, guildId, staffId);

    // Notify in channel
    await ticketChannel.send({
      content: `<@${staffId}>`,
      embeds: [new EmbedBuilder()
        .setColor('#3B82F6')
        .setTitle('👤  Ticket Assigned')
        .setDescription(`This ticket has been automatically assigned to ${member}.\n\n> They will be handling your request.`)
        .setFooter({ text: 'Wave Network  •  Auto-Assign' })
        .setTimestamp()
      ],
    }).catch(() => null);

    return staffId;
  } catch (e) {
    console.error('[AutoAssign] Error:', e.message);
    return null;
  }
}

module.exports = {
  getConfig, setMode, addToPool, removeFromPool,
  getStaffLoad, pickStaff, incrementLoad, decrementLoad, assignTicket,
};
