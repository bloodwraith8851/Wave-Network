/**
 * reminderService.js — Ping staff when tickets have no response
 */
const { ChannelType } = require('discord.js');
const { premiumEmbed } = require('../functions/functions');

const CHECK_INTERVAL_MS  = 15 * 60 * 1000; // Every 15 min
const DEFAULT_REMIND_MIN = 30;              // Default: remind after 30 min no response

function start(client) {
  console.log('[Reminder] Service started.');
  setInterval(() => run(client), CHECK_INTERVAL_MS);
}

async function run(client) {
  const db = client.db;
  try {
    for (const [, guild] of client.guilds.cache) {
      const remindMin = (await db.get(`guild_${guild.id}.ticket.settings.reminder_minutes`)) ?? DEFAULT_REMIND_MIN;
      if (remindMin === 0) continue;

      const tickets = guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText && c.name.startsWith('ticket-')
      );

      for (const [, ch] of tickets) {
        try {
          const ownerId = await db.get(`guild_${guild.id}.ticket.control_${ch.id}`);
          if (!ownerId) continue;

          // Use stored activity timestamp instead of fetching messages (MUCH FASTER)
          const lastActivity = await db.get(`guild_${guild.id}.ticket.last_activity_at_${ch.id}`) || ch.createdTimestamp;

          const idleMs = Date.now() - lastActivity;
          const remindMs = remindMin * 60 * 1000;

          if (idleMs >= remindMs && !alreadyReminded) {
            const adminRole = await db.get(`guild_${guild.id}.ticket.admin_role`);
            const modRole   = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
            const staffRole = await db.get(`guild_${guild.id}.permissions.roles.staff`);
            
            let roles = [adminRole, modRole, staffRole].filter(Boolean);
            const mention = roles.length > 0 ? roles.map(r => `<@&${r}>`).join(' ') : '@here';
            
            const claimer   = await db.get(`guild_${guild.id}.ticket.claimed_${ch.id}`);
            const pingTarget = claimer ? `<@${claimer}>` : mention;

          const idleMin    = Math.floor(idleMs / 60000);
          const urgent     = idleMin > remindMin * 3;
          const closeSoon  = idleMin > remindMin * 2;
          const color      = urgent ? '#EF4444' : closeSoon ? '#F97316' : '#F59E0B';
          const urgLabel   = urgent ? '🔴 URGENT — ' : closeSoon ? '🟠 Action Needed — ' : '🟡 Reminder — ';
          const lastActive = Math.floor(lastActivity / 1000);

            await ch.send({
              content: pingTarget,
              embeds: [premiumEmbed(client, {
                title: `🔔  ${urgLabel}No Staff Response`,
                description: [
                  `<@${ownerId}> is waiting — last message <t:${lastActive}:R>`,
                  ``,
                  `⏱️ **Idle time:** \`${idleMin} min\`  ·  Threshold: \`${remindMin} min\``,
                  `📋 **Ticket:** ${ch}`,
                  ``,
                  urgent
                    ? `> ⚠️ This ticket has been idle **${idleMin} minutes**. Immediate attention required!`
                    : `> Please respond to this ticket as soon as possible.`
                ].join('\n'),
                color
              }).setFooter({ text: `Wave Network  •  Auto-Reminder`, iconURL: guild.iconURL({ dynamic: true }) })]
            }).catch(() => null);

            await db.set(`guild_${guild.id}.ticket.reminded_${ch.id}`, Date.now());
          }

          // Removal logic is handled by setting last_activity_at on staff reply in messageCreate
        } catch { /* Skip */ }
      }
    }
  } catch (e) {
    console.error('[Reminder] Error:', e.message);
  }
}

module.exports = { start };
