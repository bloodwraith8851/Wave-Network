/**
 * slaService.js — Service Level Agreement (SLA) tracking
 *
 * Sets response time targets per category. Alerts when SLA is breached.
 * Integrates with autoCloseService interval or can run standalone.
 *
 * DB keys:
 *   guild_<id>.sla.config.<category>  → minutes (target)
 *   guild_<id>.sla.config.default     → minutes (global default)
 *   guild_<id>.sla.breach_<channelId> → { alerted: bool, breachedAt: ts }
 */

const DEFAULT_SLA_MINUTES = 60; // 1 hour default

/**
 * Get the SLA target for a specific category.
 */
async function getSLAMinutes(db, guildId, category) {
  const catKey = category?.toLowerCase().replace(/\s+/g, '_');
  const specific = catKey ? await db.get(`guild_${guildId}.sla.config.${catKey}`) : null;
  if (specific) return specific;
  return (await db.get(`guild_${guildId}.sla.config.default`)) ?? DEFAULT_SLA_MINUTES;
}

/**
 * Set the SLA target for a category (or 'default').
 */
async function setSLAMinutes(db, guildId, category, minutes) {
  const key = category === 'default'
    ? `guild_${guildId}.sla.config.default`
    : `guild_${guildId}.sla.config.${category.toLowerCase().replace(/\s+/g, '_')}`;
  await db.set(key, minutes);
}

/**
 * Check SLA status for a ticket channel.
 * @returns {{ status: 'ok'|'warning'|'breached', minutesElapsed, minutesTarget, percentUsed }}
 */
async function checkSLA(db, guildId, channelId, category) {
  const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${channelId}`);
  if (!createdAt) return null;

  const target       = await getSLAMinutes(db, guildId, category);
  const elapsed      = (Date.now() - createdAt) / 60000; // in minutes
  const percentUsed  = (elapsed / target) * 100;

  let status = 'ok';
  if (percentUsed >= 100) status = 'breached';
  else if (percentUsed >= 75) status = 'warning';

  return { status, minutesElapsed: Math.round(elapsed), minutesTarget: target, percentUsed: Math.round(percentUsed) };
}

/**
 * Run SLA checks across all open ticket channels in a guild.
 * Sends alerts to mod log channel.
 */
async function runSLACheck(client, guild) {
  try {
    const db      = client.db;
    const guildId = guild.id;
    const logId   = await db.get(`guild_${guildId}.modlog`);
    const logCh   = logId ? guild.channels.cache.get(logId) : null;
    if (!logCh) return;

    const { EmbedBuilder } = require('discord.js');
    const ticketChannels = guild.channels.cache.filter(c =>
      c.type === 0 && c.name.startsWith('ticket-')
    );

    for (const [, ch] of ticketChannels) {
      const ownerId  = await db.get(`guild_${guildId}.ticket.control_${ch.id}`);
      if (!ownerId) continue;

      const category = await db.get(`guild_${guildId}.ticket.category_${ch.id}`);
      const sla      = await checkSLA(db, guildId, ch.id, category);
      if (!sla) continue;

      const breachKey  = `guild_${guildId}.sla.breach_${ch.id}`;
      const breachData = (await db.get(breachKey)) || { warned: false, alerted: false };

      // Warning at 75%
      if (sla.status === 'warning' && !breachData.warned) {
        breachData.warned = true;
        await db.set(breachKey, breachData);
        await logCh.send({
          embeds: [new EmbedBuilder()
            .setColor('#F59E0B')
            .setTitle('⏱️  SLA Warning')
            .setDescription(`${ch} is approaching its SLA target.\n\n**Elapsed:** ${sla.minutesElapsed}m / ${sla.minutesTarget}m (${sla.percentUsed}%)\n**Owner:** <@${ownerId}>`)
            .setFooter({ text: 'Wave Network  •  SLA Monitor' })
            .setTimestamp()
          ]
        }).catch(() => null);
      }

      // Breach at 100%
      if (sla.status === 'breached' && !breachData.alerted) {
        breachData.alerted    = true;
        breachData.breachedAt = Date.now();
        await db.set(breachKey, breachData);
        await logCh.send({
          embeds: [new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚨  SLA Breached')
            .setDescription(`${ch} has **exceeded its SLA target** with no response.\n\n**Elapsed:** ${sla.minutesElapsed}m / ${sla.minutesTarget}m\n**Owner:** <@${ownerId}>\n**Category:** \`${category || 'Unknown'}\``)
            .setFooter({ text: 'Wave Network  •  SLA Monitor' })
            .setTimestamp()
          ]
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('[SLA] Check error:', e.message);
  }
}

/**
 * Start the SLA monitoring interval (every 5 minutes).
 */
function startSLAMonitor(client) {
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      await runSLACheck(client, guild).catch(() => null);
    }
  }, 5 * 60 * 1000); // every 5 minutes
  console.log('[SLA] Monitor started (5min interval)');
}

/**
 * Clear SLA breach data when a ticket is closed/responded to.
 */
async function clearBreachData(db, guildId, channelId) {
  await db.delete(`guild_${guildId}.sla.breach_${channelId}`);
}

module.exports = { getSLAMinutes, setSLAMinutes, checkSLA, runSLACheck, startSLAMonitor, clearBreachData, DEFAULT_SLA_MINUTES };
