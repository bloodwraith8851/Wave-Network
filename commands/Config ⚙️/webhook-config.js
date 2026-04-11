const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

const VALID_URL      = /^https:\/\/[^\s]{5,500}$/;
const VALID_EVENTS   = ['ticket_create', 'ticket_close', 'ticket_delete', 'rating_received', 'ticket_escalate', 'member_banned', 'member_kicked'];

module.exports = {
  name:            'webhook',
  description:     'Manage external webhook integrations (Slack, Trello, Zapier, etc).',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'add',
      description: 'Add a webhook URL to receive bot events.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name:        'url',
          description: 'HTTPS webhook URL.',
          type:        ApplicationCommandOptionType.String,
          required:    true,
        },
        {
          name:        'events',
          description: 'Comma-separated events (e.g. ticket_create,ticket_close). Leave empty for all.',
          type:        ApplicationCommandOptionType.String,
          required:    false,
        },
        {
          name:        'name',
          description: 'Optional friendly name for this webhook.',
          type:        ApplicationCommandOptionType.String,
          required:    false,
        },
      ],
    },
    {
      name:        'list',
      description: 'View all configured webhooks.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'remove',
      description: 'Remove a webhook by its number (from /webhook list).',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'index',
        description: 'Webhook number shown in /webhook list.',
        type:        ApplicationCommandOptionType.Integer,
        required:    true,
        min_value:   1,
      }],
    },
    {
      name:        'test',
      description: 'Send a test payload to a specific webhook.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'index',
        description: 'Webhook number to test.',
        type:        ApplicationCommandOptionType.Integer,
        required:    true,
        min_value:   1,
      }],
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const url    = interaction.options.getString('url').trim();
      const evStr  = interaction.options.getString('events')?.trim() || '';
      const name   = interaction.options.getString('name')?.trim()   || 'Unnamed';

      if (!VALID_URL.test(url)) {
        return errorMessage(client, interaction, 'Invalid URL. Must be an HTTPS URL (5-500 characters).');
      }

      // Parse and validate events
      let events = evStr
        ? evStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
        : VALID_EVENTS;

      const invalid = events.filter(e => !VALID_EVENTS.includes(e));
      if (invalid.length) {
        return errorMessage(client, interaction, [
          `Invalid event(s): \`${invalid.join(', ')}\``,
          `Valid events: \`${VALID_EVENTS.join(', ')}\``,
        ].join('\n'));
      }

      const webhooks = (await db.get(`guild_${gid}.webhooks`)) || [];
      if (webhooks.length >= 10) return errorMessage(client, interaction, 'Max 10 webhooks per server. Remove one first.');

      // Check for duplicate URL
      if (webhooks.find(w => w.url === url)) {
        return errorMessage(client, interaction, 'That webhook URL is already registered.');
      }

      webhooks.push({ url, events, name, addedAt: Date.now(), addedBy: interaction.user.id });
      await db.set(`guild_${gid}.webhooks`, webhooks);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Webhook Added',
          description: [
            `**Name:** \`${name}\``,
            `**URL:** \`${url.slice(0, 60)}${url.length > 60 ? '…' : ''}\``,
            `**Events:** ${events.map(e => `\`${e}\``).join(', ')}`,
            `**Total:** ${webhooks.length}/10`,
          ].join('\n'),
          color: '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'list') {
      const webhooks = (await db.get(`guild_${gid}.webhooks`)) || [];

      if (webhooks.length === 0) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '🌐  Webhooks',
            description: 'No webhooks configured. Use `/webhook add` to add one.',
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      const lines = webhooks.map((w, i) => [
        `**${i + 1}.** ${w.name || 'Unnamed'}`,
        `  🔗 \`${w.url.slice(0, 50)}${w.url.length > 50 ? '…' : ''}\``,
        `  📡 ${w.events.map(e => `\`${e}\``).join(', ')}`,
      ].join('\n')).join('\n\n');

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       `🌐  Webhooks (${webhooks.length}/10)`,
          description: lines,
          color:       '#7C3AED',
        })],
        flags: 64,
      });
    }

    if (sub === 'remove') {
      const idx      = interaction.options.getInteger('index') - 1;
      const webhooks = (await db.get(`guild_${gid}.webhooks`)) || [];

      if (idx < 0 || idx >= webhooks.length) {
        return errorMessage(client, interaction, `No webhook at position ${idx + 1}. Use \`/webhook list\` to see valid numbers.`);
      }

      const removed = webhooks.splice(idx, 1)[0];
      await db.set(`guild_${gid}.webhooks`, webhooks);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Webhook Removed',
          description: `\`${removed.name || removed.url.slice(0, 50)}\` has been removed.\n\n**Remaining:** ${webhooks.length}/10`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'test') {
      const idx      = interaction.options.getInteger('index') - 1;
      const webhooks = (await db.get(`guild_${gid}.webhooks`)) || [];

      if (idx < 0 || idx >= webhooks.length) {
        return errorMessage(client, interaction, `No webhook at position ${idx + 1}.`);
      }

      await interaction.deferReply({ flags: 64 });

      const webhook = webhooks[idx];
      const payload = {
        event:     'test',
        guild_id:  gid,
        guild_name: interaction.guild.name,
        triggered_by: interaction.user.id,
        timestamp:  Date.now(),
        message:   'This is a test payload from Wave Network.',
      };

      try {
        const res = await fetch(webhook.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'WaveNetwork-Bot/2.0' },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(5000),
        });

        const status = res.status;
        const ok     = res.ok;

        return interaction.editReply({
          embeds: [premiumEmbed(client, {
            title:       ok ? '✅  Test Successful' : '⚠️  Test Failed',
            description: [
              `**Webhook:** \`${webhook.name || 'Unnamed'}\``,
              `**Status:** \`${status}\` ${ok ? '(OK)' : '(Error)'}`,
            ].join('\n'),
            color: ok ? '#10B981' : '#F59E0B',
          })],
        });
      } catch (e) {
        return interaction.editReply({
          embeds: [premiumEmbed(client, {
            title:       '⛔  Test Failed',
            description: `Could not reach the webhook URL.\n\n**Error:** \`${e.message}\``,
            color:       '#EF4444',
          })],
        });
      }
    }
  },
};
