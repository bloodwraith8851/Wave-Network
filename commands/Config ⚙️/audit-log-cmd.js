/**
 * audit-log-cmd.js — /audit-log command
 * View the config/admin action audit trail for this server.
 *
 * /audit-log [user] [action]
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const PAGE_SIZE = 5;

module.exports = {
  name: 'audit-log',
  description: 'View the configuration and admin action audit trail for this server.',
  category: 'Config ⚙️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    { name: 'user',   description: 'Filter by the user who performed the action.', type: ApplicationCommandOptionType.User,   required: false },
    { name: 'action', description: 'Filter by action type (e.g. "permissions", "canned").', type: ApplicationCommandOptionType.String, required: false },
    { name: 'limit',  description: 'Number of entries to retrieve (max 50).', type: ApplicationCommandOptionType.Integer, required: false },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'audit.view', client.config, interaction, errorMessage);
    if (denied) return;

    await interaction.deferReply({ ephemeral: true });

    const filterUser   = interaction.options.getUser('user');
    const filterAction = interaction.options.getString('action')?.toLowerCase();
    const limit        = Math.min(interaction.options.getInteger('limit') || 20, 50);

    const entries = await auditSvc.getEntries(db, guildId, {
      userId: filterUser?.id,
      action: filterAction,
      limit,
    });

    if (!entries.length) {
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: '📋  Audit Log',
          description: 'No audit entries found matching your filters.',
          color: '#6B7280',
        })],
      });
    }

    const totalPages = Math.ceil(entries.length / PAGE_SIZE);
    let page = 0;

    function buildEmbed(p) {
      const slice = entries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      const lines = slice.map(e => auditSvc.formatEntry(e, interaction.guild));

      return premiumEmbed(client, {
        title: `📋  Audit Log  ·  ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`,
        description: lines.join('\n\n').slice(0, 4000),
        color: '#7C3AED',
      })
        .addFields([{ name: '🔎 Filters', value: [
          filterUser   ? `User: <@${filterUser.id}>` : null,
          filterAction ? `Action: \`${filterAction}\`` : null,
        ].filter(Boolean).join('  ·  ') || 'None', inline: false }])
        .setFooter({ text: `Page ${p + 1}/${totalPages}  •  Wave Network  •  Last 200 entries kept`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
    }

    function buildRow(p) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('audit_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('audit_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1),
      );
    }

    const msg = await interaction.editReply({ embeds: [buildEmbed(0)], components: totalPages > 1 ? [buildRow(0)] : [] });

    if (totalPages > 1) {
      const collector = msg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async btn => {
        if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not your audit log.', ephemeral: true });
        if (btn.customId === 'audit_prev') page--;
        if (btn.customId === 'audit_next') page++;
        await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
      });
      collector.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
    }
  },
};
