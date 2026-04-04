/**
 * escalationService.js — Auto-escalation of unresolved tickets
 *
 * Escalates tickets to senior staff after X hours of inactivity.
 * Two tiers: Tier 1 → Moderator, Tier 2 → Admin (after 2x the threshold)
 *
 * DB keys:
 *   guild_<id>.ticket.escalated_<channelId> → { tier: 1|2, escalatedAt: ts }
 *   guild_<id>.ticket.settings.escalation_hours → number
 */

const DEFAULT_ESCALATION_HOURS = 24;

/**
 * Get escalation config for a guild.
 */
async function getEscalationHours(db, guildId) {
  return (await db.get(`guild_${guildId}.ticket.settings.escalation_hours`)) ?? DEFAULT_ESCALATION_HOURS;
}

/**
 * Run escalation checks across all open ticket channels.
 * Called by the escalation interval in index.js.
 */
async function runEscalationCheck(client, guild) {
  try {
    const db      = client.db;
    const guildId = guild.id;

    const escalHours  = await getEscalationHours(db, guildId);
    const modRoleId   = await db.get(`guild_${guildId}.permissions.roles.moderator`);
    const adminRoleId = await db.get(`guild_${guildId}.permissions.roles.admin`)
      || await db.get(`guild_${guildId}.ticket.admin_role`);
    const logId       = await db.get(`guild_${guildId}.modlog`);
    const logCh       = logId ? guild.channels.cache.get(logId) : null;

    if (!logCh) return; // no mod log — skip

    const { EmbedBuilder } = require('discord.js');
    const ticketChannels = guild.channels.cache.filter(c =>
      c.type === 0 && c.name.startsWith('ticket-')
    );

    for (const [, ch] of ticketChannels) {
      const ownerId   = await db.get(`guild_${guildId}.ticket.control_${ch.id}`);
      if (!ownerId) continue;

      const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${ch.id}`);
      if (!createdAt) continue;

      const elapsedHours   = (Date.now() - createdAt) / 3600000;
      const escalKey       = `guild_${guildId}.ticket.escalated_${ch.id}`;
      const escalData      = (await db.get(escalKey)) || { tier: 0 };
      const category       = await db.get(`guild_${guildId}.ticket.category_${ch.id}`) || 'Unknown';

      // Tier 1: Escalate to Moderator after X hours
      if (elapsedHours >= escalHours && escalData.tier < 1) {
        escalData.tier        = 1;
        escalData.escalatedAt = Date.now();
        await db.set(escalKey, escalData);

        const ping = modRoleId ? `<@&${modRoleId}>` : '@here';
        await ch.send({
          content: ping,
          embeds: [new EmbedBuilder()
            .setColor('#F59E0B')
            .setTitle('⬆️  Ticket Escalated — Tier 1')
            .setDescription(`This ticket has been escalated to **Moderator** level after ${Math.round(elapsedHours)}h with no resolution.\n\n**Owner:** <@${ownerId}>\n**Category:** \`${category}\``)
            .setFooter({ text: 'Wave Network  •  Escalation System' })
            .setTimestamp()
          ],
        }).catch(() => null);

        if (logCh) await logCh.send({
          embeds: [new EmbedBuilder()
            .setColor('#F59E0B')
            .setTitle('⬆️  Ticket Escalated — Tier 1')
            .setDescription(`${ch} escalated to **Moderator** after ${Math.round(elapsedHours)}h.\nOwner: <@${ownerId}> | Category: \`${category}\``)
            .setFooter({ text: 'Wave Network  •  Escalation System' }).setTimestamp()
          ]
        }).catch(() => null);
      }

      // Tier 2: Escalate to Admin after 2x hours
      if (elapsedHours >= escalHours * 2 && escalData.tier < 2) {
        escalData.tier        = 2;
        escalData.escalatedAt = Date.now();
        await db.set(escalKey, escalData);

        const ping = adminRoleId ? `<@&${adminRoleId}>` : '@here';
        await ch.send({
          content: ping,
          embeds: [new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚨  Ticket Escalated — Tier 2 (Admin)')
            .setDescription(`This ticket has been escalated to **Admin** level after ${Math.round(elapsedHours)}h unresolved.\n\n**Owner:** <@${ownerId}>\n**Category:** \`${category}\`\n\n> This requires immediate attention.`)
            .setFooter({ text: 'Wave Network  •  Escalation System' })
            .setTimestamp()
          ],
        }).catch(() => null);

        if (logCh) await logCh.send({
          embeds: [new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚨  Ticket Escalated — Tier 2 (Admin)')
            .setDescription(`${ch} escalated to **Admin** after ${Math.round(elapsedHours)}h.\nOwner: <@${ownerId}> | Category: \`${category}\``)
            .setFooter({ text: 'Wave Network  •  Escalation System' }).setTimestamp()
          ]
        }).catch(() => null);
      }
    }
  } catch (e) {
    console.error('[Escalation] Check error:', e.message);
  }
}

/**
 * Start the escalation check interval (every 30 minutes).
 */
function startEscalationMonitor(client) {
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      await runEscalationCheck(client, guild).catch(() => null);
    }
  }, 30 * 60 * 1000);
  console.log('[Escalation] Monitor started (30min interval)');
}

/**
 * Clear escalation data when ticket is resolved/closed.
 */
async function clearEscalation(db, guildId, channelId) {
  await db.delete(`guild_${guildId}.ticket.escalated_${channelId}`);
}

module.exports = {
  getEscalationHours, runEscalationCheck,
  startEscalationMonitor, clearEscalation, DEFAULT_ESCALATION_HOURS,
};
