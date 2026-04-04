/**
 * canned.js — /canned command
 * Manage and use reusable response templates.
 *
 * /canned add <name> <content>
 * /canned list
 * /canned use <name>
 * /canned delete <name>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EmbedBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const cannedSvc = require(`${process.cwd()}/services/cannedService`);
const permSvc   = require(`${process.cwd()}/services/permissionService`);
const auditSvc  = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'canned',
  description: 'Manage and use reusable response templates inside tickets.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Save a new canned response template.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'name', description: 'Short name/key (e.g. "needs-info").', type: ApplicationCommandOptionType.String, required: true },
        { name: 'content', description: 'The response text. Supports {user}, {ticket}, {category}, {staff}.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'List all saved canned responses.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'use',
      description: 'Send a canned response in the current ticket channel.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'name', description: 'Name of the canned response to send.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'delete',
      description: 'Delete a canned response.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'name', description: 'Name of the canned response to delete.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Require Staff+ for all subcommands
    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.canned', client.config, interaction, errorMessage);
    if (denied) return;

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const name    = interaction.options.getString('name');
      const content = interaction.options.getString('content');
      const result  = await cannedSvc.add(db, guildId, name, content);
      if (!result.success) return errorMessage(client, interaction, result.msg);

      await auditSvc.log(db, guildId, interaction.user.id, 'canned.add', { name: result.msg });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Canned Response Saved',
          description: `Response \`${result.msg}\` has been saved.\n\nUse it with \`/canned use ${result.msg}\`.`,
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  ${interaction.guild.name}`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const list = await cannedSvc.getAll(db, guildId);
      if (!list.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, { title: '📋  Canned Responses', description: 'No canned responses saved yet.\n\nUse `/canned add <name> <content>` to create one.', color: '#6B7280' })],
          flags: 64,
        });
      }
      const lines = list.map((r, i) => `\`${String(i+1).padStart(2)}\`  **${r.name}** — ${r.content.slice(0, 60)}${r.content.length > 60 ? '…' : ''}`);
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📋  Canned Responses  ·  ${list.length}/${cannedSvc.MAX_RESPONSES}`,
          description: lines.join('\n'),
          color: '#7C3AED',
        })
          .addFields([{ name: '💡 Variables', value: '`{user}` `{ticket}` `{category}` `{staff}`', inline: false }])
          .setFooter({ text: `Wave Network  •  ${interaction.guild.name}`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── USE ──────────────────────────────────────────────────────────────────
    if (sub === 'use') {
      const name     = interaction.options.getString('name');
      const response = await cannedSvc.get(db, guildId, name);
      if (!response) return errorMessage(client, interaction, `❌ No canned response found for \`${name}\`.\n\nRun \`/canned list\` to see available responses.`);

      const channelId = interaction.channel.id;
      const ownerId   = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
      const category  = await db.get(`guild_${guildId}.ticket.category_${channelId}`);

      const content = cannedSvc.applyVars(response.content, {
        user:     ownerId ? `<@${ownerId}>` : 'User',
        ticket:   interaction.channel.name,
        category: category || 'General',
        staff:    `<@${interaction.user.id}>`,
      });

      await interaction.reply({ content, allowedMentions: { users: ownerId ? [ownerId] : [] } });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const name    = interaction.options.getString('name');
      const removed = await cannedSvc.remove(db, guildId, name);
      if (!removed) return errorMessage(client, interaction, `❌ No canned response named \`${name}\` was found.`);

      await auditSvc.log(db, guildId, interaction.user.id, 'canned.delete', { name });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🗑️  Canned Response Deleted',
          description: `Response \`${name}\` has been removed.`,
          color: '#EF4444',
        }).setFooter({ text: `Wave Network  •  ${interaction.guild.name}`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
