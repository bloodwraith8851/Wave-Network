/**
 * autoCloseService.js — Auto-close inactive tickets
 * Runs on an interval. Warns inactive tickets, then closes after grace period.
 */
const { ChannelType } = require('discord.js');
const { premiumEmbed, ticketControlRow } = require('../functions/functions');
const transcriptService = require('./transcriptService');
const analyticsService  = require('./analyticsService');

const CHECK_INTERVAL_MS  = 30 * 60 * 1000; // Check every 30 min
const DEFAULT_INACTIVE_H = 24;              // Default: 24 hours of inactivity
const WARN_BEFORE_MIN    = 60;             // Warn 60 min before auto-close

/**
 * Start the auto-close loop.
 */
function start(client) {
  console.log('[AutoClose] Service started.');
  setInterval(() => run(client), CHECK_INTERVAL_MS);
  // Also run immediately after 5 min (let bot fully boot)
  setTimeout(() => run(client), 5 * 60 * 1000);
}

async function run(client) {
  const db = client.db;
  try {
    for (const [, guild] of client.guilds.cache) {
      const inactiveHours = (await db.get(`guild_${guild.id}.ticket.settings.auto_close_hours`)) ?? DEFAULT_INACTIVE_H;
      if (inactiveHours === 0) continue; // 0 = disabled

      const ticketChannels = guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildText && c.name.startsWith('ticket-')
      );

      for (const [, ch] of ticketChannels) {
        try {
          const ownerId    = await db.get(`guild_${guild.id}.ticket.control_${ch.id}`);
          if (!ownerId) continue;

          // Fetch last message timestamp
          const msgs      = await ch.messages.fetch({ limit: 1 }).catch(() => null);
          const lastMsg   = msgs?.first();
          const lastMsgTs = lastMsg ? lastMsg.createdTimestamp : (await db.get(`guild_${guild.id}.ticket.created_at_${ch.id}`)) || 0;
          const idleMs    = Date.now() - lastMsgTs;
          const inactiveMs = inactiveHours * 3600 * 1000;
          const warnMs    = inactiveMs - WARN_BEFORE_MIN * 60 * 1000;

          const warned = await db.get(`guild_${guild.id}.ticket.autoclose_warned_${ch.id}`);

          // Warn stage
          if (idleMs >= warnMs && !warned) {
            await db.set(`guild_${guild.id}.ticket.autoclose_warned_${ch.id}`, Date.now());
            await ch.send({
              content: `<@${ownerId}>`,
              embeds: [premiumEmbed(client, {
                title: `⚠️  Inactivity Warning`,
                description: `This ticket has been inactive for **${Math.floor(idleMs / 3600000)}h**.\n\nIt will be **automatically closed in ${WARN_BEFORE_MIN} minutes** if there is no activity.\n\nReply to this message to keep it open.`,
                color: '#F59E0B'
              })]
            }).catch(() => null);
          }

          // Close stage
          if (idleMs >= inactiveMs) {
            await ch.send({
              embeds: [premiumEmbed(client, {
                title: `🔒  Auto-Closed — Inactivity`,
                description: `This ticket was automatically closed after **${inactiveHours}h** of inactivity.`,
                color: '#EF4444'
              }).setFooter({ text: `Wave Network  •  Auto-Close System`, iconURL: guild.iconURL({ dynamic: true }) })],
              components: [ticketControlRow({ state: 'closed', disableClose: true })]
            }).catch(() => null);

            // Generate transcript
            const botMember = guild.members.cache.get(client.user.id) || await guild.members.fetch(client.user.id).catch(() => null);
            if (botMember) {
              await transcriptService.generateAndDeliver(client, ch, botMember, 'auto-closed').catch(() => null);
            }

            // Analytics
            await analyticsService.trackEvent(db, guild.id, 'ticket_closed', {
              staffId: client.user.id,
              channelId: ch.id,
              autoClose: true,
              timestamp: Date.now()
            });

            // Lock channel
            await ch.permissionOverwrites.edit(ownerId, { SendMessages: false }).catch(() => null);

            // Clean up auto-close keys
            await db.delete(`guild_${guild.id}.ticket.autoclose_warned_${ch.id}`);
          }
        } catch { /* Skip errored channels */ }
      }
    }
  } catch (e) {
    console.error('[AutoClose] Error:', e.message);
  }
}

module.exports = { start };
