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

          const alreadyReminded = await db.get(`guild_${guild.id}.ticket.reminded_${ch.id}`);

          // Fetch last non-system message
          const msgs = await ch.messages.fetch({ limit: 5 }).catch(() => null);
          if (!msgs) continue;
          const lastOwnerMsg = msgs.find(m => m.author.id === ownerId && !m.author.bot);
          if (!lastOwnerMsg) continue;

          const idleMs = Date.now() - lastOwnerMsg.createdTimestamp;
          const remindMs = remindMin * 60 * 1000;

          if (idleMs >= remindMs && !alreadyReminded) {
            const adminRole = await db.get(`guild_${guild.id}.ticket.admin_role`);
            const mention   = adminRole ? `<@&${adminRole}>` : '@here';
            const claimer   = await db.get(`guild_${guild.id}.ticket.claimed_${ch.id}`);
            const pingTarget = claimer ? `<@${claimer}>` : mention;

          const idleMin    = Math.floor(idleMs / 60000);
          const urgent     = idleMin > remindMin * 3;
          const closeSoon  = idleMin > remindMin * 2;
          const color      = urgent ? '#EF4444' : closeSoon ? '#F97316' : '#F59E0B';
          const urgLabel   = urgent ? '🔴 URGENT — ' : closeSoon ? '🟠 Action Needed — ' : '🟡 Reminder — ';
          const lastActive = Math.floor(lastOwnerMsg.createdTimestamp / 1000);

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

          // Reset reminder when staff replies
          if (alreadyReminded) {
            const lastMsg = msgs.first();
            if (lastMsg && lastMsg.author.id !== ownerId && !lastMsg.author.bot) {
              await db.delete(`guild_${guild.id}.ticket.reminded_${ch.id}`);
            }
          }
        } catch { /* Skip */ }
      }
    }
  } catch (e) {
    console.error('[Reminder] Error:', e.message);
  }
}

module.exports = { start };
