/**
 * config-export.js — /config-export & /config-import
 * Export the entire guild ticket configuration as a JSON file,
 * or import from a previously exported file.
 *
 * Export covers: all guild_<id>.ticket.*, guild_<id>.permissions.*,
 *                guild_<id>.branding.*, guild_<id>.sla.config.*
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  AttachmentBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

// Keys to export (without guildId prefix)
const EXPORT_NAMESPACES = [
  'ticket.admin_role',
  'ticket.category',
  'modlog',
  'ticket.menu_option',
  'ticket.type',
  'ticket.settings',
  'permissions.roles',
  'permissions.features',
  'branding',
  'sla.config',
  'auto_reply_rules',
  'canned_responses',
  'faq_entries',
  'language',
];

module.exports = {
  name: 'config-export',
  description: 'Export or import your complete guild configuration as a JSON backup.',
  category: 'Config ⚙️',
  cooldown: 10,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'AttachFiles'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'export',
      description: 'Download your complete server config as a JSON file.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'import',
      description: 'Restore from a previously exported JSON config file.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'file', description: 'The JSON config file to import.', type: ApplicationCommandOptionType.Attachment, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.export', client.config, interaction, errorMessage);
    if (denied) return;

    // ── EXPORT ───────────────────────────────────────────────────────────────
    if (sub === 'export') {
      await interaction.deferReply({ ephemeral: true });

      const config = {
        _meta: {
          guildId,
          guildName:  interaction.guild.name,
          exportedAt: new Date().toISOString(),
          exportedBy: interaction.user.tag,
          version:    '2.0',
        },
      };

      // Collect configured namespaces
      for (const ns of EXPORT_NAMESPACES) {
        try {
          const val = await db.get(`guild_${guildId}.${ns}`);
          if (val !== null && val !== undefined) {
            config[ns] = val;
          }
        } catch { /* skip */ }
      }

      const json       = JSON.stringify(config, null, 2);
      const buffer     = Buffer.from(json, 'utf8');
      const attachment = new AttachmentBuilder(buffer, {
        name:        `wave-config-${guildId}-${Date.now()}.json`,
        description: 'Wave Network configuration export',
      });

      await auditSvc.log(db, guildId, interaction.user.id, 'config.export', {});

      return interaction.editReply({
        content: '',
        embeds: [premiumEmbed(client, {
          title: '📥  Config Exported',
          description: [
            `Your complete server configuration has been exported.`,
            ``,
            `**Includes:** ${Object.keys(config).filter(k => k !== '_meta').length} setting groups`,
            `**Exported by:** ${interaction.user}`,
            ``,
            `> Keep this file safe — it contains your entire ticket setup.`,
            `> Restore with \`/config-export import\`.`,
          ].join('\n'),
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  Config Export`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        files: [attachment],
      });
    }

    // ── IMPORT ───────────────────────────────────────────────────────────────
    if (sub === 'import') {
      await interaction.deferReply({ ephemeral: true });

      const attachment = interaction.options.getAttachment('file');
      if (!attachment.name.endsWith('.json')) {
        return interaction.editReply({ content: '❌ Please attach a `.json` file exported by `/config-export export`.' });
      }
      if (attachment.size > 500000) { // 500KB limit
        return interaction.editReply({ content: '❌ File is too large (max 500KB).' });
      }

      let data;
      try {
        const res = await fetch(attachment.url);
        const text = await res.text();
        data = JSON.parse(text);
      } catch {
        return interaction.editReply({ content: '❌ Invalid JSON file. Please use a file exported by this bot.' });
      }

      // Validate structure
      if (!data._meta || data._meta.version !== '2.0') {
        return interaction.editReply({ content: '❌ Invalid or outdated config format. Please export again with the current version.' });
      }

      // Import each namespace
      let imported = 0;
      for (const [key, val] of Object.entries(data)) {
        if (key === '_meta') continue;
        try {
          await db.set(`guild_${guildId}.${key}`, val);
          imported++;
        } catch { /* skip */ }
      }

      await auditSvc.log(db, guildId, interaction.user.id, 'config.import', {
        originalGuild: data._meta.guildId,
        exportedAt:    data._meta.exportedAt,
        keysImported:  imported,
      });

      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: '✅  Config Imported',
          description: [
            `Successfully restored **${imported}** setting groups.`,
            ``,
            `**Source:** \`${data._meta.guildName}\``,
            `**Exported:** ${data._meta.exportedAt}`,
            `**By:** \`${data._meta.exportedBy}\``,
            ``,
            `> Some settings (like channel IDs) may need to be updated for this server.`,
          ].join('\n'),
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  Config Import`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }
  },
};
