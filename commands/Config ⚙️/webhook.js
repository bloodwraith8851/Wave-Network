/**
 * webhook.js — /webhook command
 * Configure outbound webhook integrations for ticket events.
 *
 * /webhook add <url> [events]
 * /webhook list
 * /webhook remove <url-or-id>
 * /webhook test <url-or-id>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc     = require(`${process.cwd()}/services/permissionService`);
const webhookSvc  = require(`${process.cwd()}/services/webhookService`);
const auditSvc    = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'webhook',
  description: 'Configure outbound webhooks to integrate with external tools (Slack, Trello, etc.).',
  category: 'Config ⚙️',
  cooldown: 5,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Register a new outbound webhook URL.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'url',    description: 'Webhook endpoint URL.', type: ApplicationCommandOptionType.String,  required: true },
        { name: 'events', description: 'Comma-separated events (leave empty = all). E.g: ticket_create,ticket_close', type: ApplicationCommandOptionType.String, required: false },
      ],
    },
    {
      name: 'list',
      description: 'List all configured webhooks.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'remove',
      description: 'Remove a webhook by URL or ID.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'url_or_id', description: 'Webhook URL or ID to remove.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'test',
      description: 'Send a test payload to a webhook.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'url_or_id', description: 'Webhook URL or ID to test.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'webhook.manage', client.config, interaction, errorMessage);
    if (denied) return;

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const url      = interaction.options.getString('url').trim();
      const evtStr   = interaction.options.getString('events');
      const events   = evtStr
        ? evtStr.split(',').map(e => e.trim()).filter(Boolean)
        : webhookSvc.VALID_EVENTS; // all events if none specified

      const result = await webhookSvc.add(db, guildId, url, events);
      if (!result.success) return errorMessage(client, interaction, result.msg);

      await auditSvc.log(db, guildId, interaction.user.id, 'webhook.add', { url: url.slice(0, 60), events });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Webhook Added',
          description: [
            `Webhook registered with ID \`${result.id}\`.`,
            ``,
            `**URL:** \`${url.slice(0, 60)}${url.length > 60 ? '…' : ''}\``,
            `**Events:** ${events.map(e => `\`${e}\``).join(', ')}`,
            ``,
            `Use \`/webhook test\` to send a test payload.`,
          ].join('\n'),
          color: client.colors?.success || '#10B981',
        }).setFooter({ text: 'Wave Network  •  Webhooks', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const webhooks = await webhookSvc.getAll(db, guildId);
      if (!webhooks.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '🔗  Webhooks',
            description: 'No webhooks configured yet.\n\nAdd one with `/webhook add <url>`.',
            color: client.colors?.none || '#6B7280',
          })],
          flags: 64,
        });
      }
      const lines = webhooks.map((w, i) =>
        `\`${i+1}.\` ${w.enabled ? '🟢' : '🔴'} **ID ${w.id}**\n> URL: \`${w.url.slice(0, 55)}…\`\n> Events: ${w.events.map(e => `\`${e}\``).join(', ')}`
      );
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🔗  Webhooks  ·  ${webhooks.length}/${webhookSvc.MAX_WEBHOOKS}`,
          description: lines.join('\n\n'),
          color: client.colors?.primary || '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  Webhooks', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const urlOrId = interaction.options.getString('url_or_id').trim();
      const removed = await webhookSvc.remove(db, guildId, urlOrId);
      if (!removed) return errorMessage(client, interaction, `No webhook found matching \`${urlOrId}\`.`);
      await auditSvc.log(db, guildId, interaction.user.id, 'webhook.remove', { urlOrId });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '🗑️  Webhook Removed', description: `Webhook \`${urlOrId}\` has been deleted.`, color: client.colors?.error || '#EF4444' })
          .setFooter({ text: 'Wave Network  •  Webhooks', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }

    // ── TEST ─────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const urlOrId  = interaction.options.getString('url_or_id').trim();
      const webhooks = await webhookSvc.getAll(db, guildId);
      const target   = webhooks.find(w => w.url === urlOrId || String(w.id) === urlOrId);
      if (!target) return errorMessage(client, interaction, `No webhook found matching \`${urlOrId}\`.`);

      await interaction.deferReply({ flags: 64 });

      const testPayload = {
        event: 'test',
        guildId,
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test payload from Wave Network.', triggeredBy: interaction.user.tag },
      };

      try {
        const res = await fetch(target.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'WaveNetwork-WebhookService/1.0' },
          body:    JSON.stringify(testPayload),
        });
        return interaction.editReply({
          embeds: [premiumEmbed(client, {
            title: res.ok ? '✅  Test Successful' : '⚠️  Test Failed',
            description: `HTTP \`${res.status} ${res.statusText}\``,
            color: res.ok ? '#10B981' : '#EF4444',
          }).setFooter({ text: 'Wave Network  •  Webhooks', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        });
      } catch (e) {
        return interaction.editReply({
          embeds: [premiumEmbed(client, { title: '❌  Test Error', description: `\`${e.message}\``, color: '#EF4444' })],
        });
      }
    }
  },
};
