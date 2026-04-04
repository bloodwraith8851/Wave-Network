/**
 * schedule-close.js — /schedule-close command
 * Schedule a ticket to auto-close after a specified delay.
 *
 * /schedule-close <time>         — e.g. "2h", "30m", "1d"
 * /schedule-close cancel         — cancel the scheduled close
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc   = require(`${process.cwd()}/services/permissionService`);
const scheduler = require(`${process.cwd()}/services/scheduledMessageService`);

module.exports = {
  name: 'schedule-close',
  description: 'Schedule this ticket to automatically close after a delay.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'set',
      description: 'Schedule the auto-close (e.g. 2h, 30m, 1d).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'time', description: 'Delay before closing (e.g. 2h, 45m, 1d).', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'cancel',
      description: 'Cancel the scheduled close for this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'status',
      description: 'Check scheduled close status for this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;
    const sub       = interaction.options.getSubcommand();

    const ownerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    if (!ownerId) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.schedule_close', client.config, interaction, errorMessage);
    if (denied) return;

    if (sub === 'set') {
      const timeStr = interaction.options.getString('time');
      const delayMs = scheduler.parseDelay(timeStr);

      if (!delayMs || delayMs < 60000) {
        return errorMessage(client, interaction, 'Invalid time format. Examples: `30m`, `2h`, `1d`. Minimum is 1 minute.');
      }
      if (delayMs > 7 * 24 * 3600000) {
        return errorMessage(client, interaction, 'Maximum schedule time is **7 days**.');
      }

      // Cancel any existing scheduled close for this channel
      const existing = await scheduler.listForChannel(db, guildId, channelId);
      for (const item of existing.filter(i => i.type === 'close')) {
        await scheduler.cancel(db, guildId, item.id);
      }

      const item    = await scheduler.schedule(db, guildId, channelId, 'close', '', delayMs, interaction.user.id);
      const closeAt = Math.floor(item.sendAt / 1000);

      // Send warning message in ticket
      await interaction.channel.send({
        embeds: [premiumEmbed(client, {
          title: '⏰  Scheduled Close Set',
          description: `This ticket will be **automatically closed** <t:${closeAt}:R> (<t:${closeAt}:F>).\n\nStaff can cancel with \`/schedule-close cancel\`.`,
          color: '#F59E0B',
        }).setFooter({ text: 'Wave Network  •  Scheduled Close', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Scheduled Close Set',
          description: `Ticket scheduled to close <t:${closeAt}:R>.`,
          color: '#10B981',
        }).setFooter({ text: `ID: ${item.id}`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'cancel') {
      const pending = await scheduler.listForChannel(db, guildId, channelId);
      const closes  = pending.filter(i => i.type === 'close');
      if (!closes.length) {
        return errorMessage(client, interaction, 'No scheduled close is active for this ticket.');
      }
      for (const item of closes) await scheduler.cancel(db, guildId, item.id);

      await interaction.channel.send({
        embeds: [premiumEmbed(client, {
          title: '✅  Scheduled Close Cancelled',
          description: `The automatic close for this ticket has been cancelled by ${interaction.user}.`,
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  Scheduled Close', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });

      return interaction.reply({ content: '✅ Scheduled close cancelled.', ephemeral: true });
    }

    if (sub === 'status') {
      const pending = await scheduler.listForChannel(db, guildId, channelId);
      const closes  = pending.filter(i => i.type === 'close');
      const msgs    = pending.filter(i => i.type === 'message');

      const lines = [
        closes.length
          ? `⏰ **Auto-close:** <t:${Math.floor(closes[0].sendAt / 1000)}:R> (<t:${Math.floor(closes[0].sendAt / 1000)}:F>)`
          : '⏰ **Auto-close:** *Not scheduled*',
        msgs.length
          ? `💬 **Scheduled messages:** ${msgs.length} pending`
          : '💬 **Scheduled messages:** *None*',
      ];

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '📅  Schedule Status',
          description: lines.join('\n'),
          color: '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  Scheduler', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
