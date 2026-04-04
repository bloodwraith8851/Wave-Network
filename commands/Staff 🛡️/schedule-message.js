/**
 * schedule-message.js — /schedule-message command
 * Staff can schedule a custom message to be sent in a ticket at a future time.
 *
 * /schedule-message set <time> <message>
 * /schedule-message list
 * /schedule-message cancel <id>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc   = require(`${process.cwd()}/services/permissionService`);
const scheduler = require(`${process.cwd()}/services/scheduledMessageService`);

module.exports = {
  name: 'schedule-message',
  description: 'Schedule a message to be sent in this ticket at a future time.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'set',
      description: 'Schedule a message to send after a delay.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'time',    description: 'Delay before sending (e.g. 2h, 30m).', type: ApplicationCommandOptionType.String, required: true },
        { name: 'message', description: 'The message to send.',                  type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'List pending scheduled messages for this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'cancel',
      description: 'Cancel a pending scheduled message by ID.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'id', description: 'Scheduled message ID (from /schedule-message list).', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;
    const sub       = interaction.options.getSubcommand();

    const ownerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    if (!ownerId) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.schedule_message', client.config, interaction, errorMessage);
    if (denied) return;

    if (sub === 'set') {
      const timeStr = interaction.options.getString('time');
      const message = interaction.options.getString('message');
      const delayMs = scheduler.parseDelay(timeStr);

      if (!delayMs || delayMs < 60000) {
        return errorMessage(client, interaction, 'Invalid time. Examples: `30m`, `2h`, `1d`. Minimum is 1 minute.');
      }
      if (delayMs > 7 * 24 * 3600000) {
        return errorMessage(client, interaction, 'Maximum schedule time is **7 days**.');
      }
      if (message.length > 1500) {
        return errorMessage(client, interaction, 'Message must be 1500 characters or less.');
      }

      const pending = await scheduler.listForChannel(db, guildId, channelId);
      if (pending.filter(i => i.type === 'message').length >= 10) {
        return errorMessage(client, interaction, 'Max 10 pending scheduled messages per ticket.');
      }

      const item    = await scheduler.schedule(db, guildId, channelId, 'message', message, delayMs, interaction.user.id);
      const sendAt  = Math.floor(item.sendAt / 1000);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Message Scheduled',
          description: [
            `Your message will be sent <t:${sendAt}:R> (<t:${sendAt}:F>).`,
            ``,
            `**Preview:**`,
            `> ${message.slice(0, 200)}${message.length > 200 ? '…' : ''}`,
            ``,
            `**ID:** \`${item.id}\`  *(use this to cancel)*`,
          ].join('\n'),
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  Scheduled Messages', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const pending = (await scheduler.listForChannel(db, guildId, channelId)).filter(i => i.type === 'message');
      if (!pending.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, { title: '📅  Scheduled Messages', description: 'No pending messages for this ticket.', color: '#6B7280' })],
          ephemeral: true,
        });
      }
      const lines = pending.map((m, i) => {
        const ts = Math.floor(m.sendAt / 1000);
        return `\`${i+1}.\` <t:${ts}:R> — ${m.message.slice(0, 60)}${m.message.length > 60 ? '…' : ''}\n> ID: \`${m.id}\``;
      });
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📅  Scheduled Messages  ·  ${pending.length} pending`,
          description: lines.join('\n\n'),
          color: '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  Scheduler', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'cancel') {
      const id       = interaction.options.getString('id').trim();
      const success  = await scheduler.cancel(db, guildId, id);
      if (!success) return errorMessage(client, interaction, `No pending scheduled message with ID \`${id}\` found.`);

      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '✅  Scheduled Message Cancelled', description: `Message \`${id}\` has been cancelled.`, color: '#EF4444' })],
        ephemeral: true,
      });
    }
  },
};
