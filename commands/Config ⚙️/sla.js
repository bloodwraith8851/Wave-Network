/**
 * sla.js — /sla command
 * View and configure SLA (Service Level Agreement) targets per category.
 *
 * /sla view
 * /sla set <category> <minutes>
 * /sla check          — run manual SLA check now
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const slaSvc   = require(`${process.cwd()}/services/slaService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

function fmtMinutes(m) {
  if (!m) return 'N/A';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

module.exports = {
  name: 'sla',
  description: 'View and configure Service Level Agreement (SLA) response time targets.',
  category: 'Config ⚙️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'view',
      description: 'View current SLA configuration.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'set',
      description: 'Set an SLA target for a category or set the default.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'category', description: 'Category name or "default".', type: ApplicationCommandOptionType.String, required: true },
        { name: 'minutes',  description: 'Target response time in minutes (e.g. 60 = 1 hour).', type: ApplicationCommandOptionType.Integer, required: true },
      ],
    },
    {
      name: 'check',
      description: 'Run an immediate SLA check across all open tickets.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member,
      sub === 'check' ? 'staff.stats' : 'config.set', client.config, interaction, errorMessage
    );
    if (denied) return;

    // ── VIEW ─────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const defaultTarget = await slaSvc.getSLAMinutes(db, guildId, null);

      // Try to find per-category configs
      const categories = (await db.get(`guild_${guildId}.ticket.menu_option`)) || [];
      const catLines   = await Promise.all(
        categories.map(async c => {
          const target = await slaSvc.getSLAMinutes(db, guildId, c.label || c.value);
          return `> **${c.label || c.value}:** \`${fmtMinutes(target)}\``;
        })
      );

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '⏱️  SLA Configuration',
          description: [
            `**Default Target:** \`${fmtMinutes(defaultTarget)}\``,
            ``,
            catLines.length ? `**Per-Category:**\n${catLines.join('\n')}` : '*No categories configured yet.*',
            ``,
            `> 🟡 Warning fires at **75%** of target`,
            `> 🔴 Breach alert fires at **100%** of target`,
          ].join('\n'),
          color: '#F59E0B',
        }).setFooter({ text: 'Wave Network  •  SLA Monitor', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── SET ──────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const category = interaction.options.getString('category').trim();
      const minutes  = interaction.options.getInteger('minutes');
      if (minutes < 5 || minutes > 10080) return errorMessage(client, interaction, 'SLA target must be between 5 minutes and 7 days (10080 minutes).');
      await slaSvc.setSLAMinutes(db, guildId, category, minutes);
      await auditSvc.log(db, guildId, interaction.user.id, 'sla.set', { category, minutes });
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  SLA Target Set',
          description: `**${category === 'default' ? 'Default' : `Category: ${category}`}** SLA target set to **${fmtMinutes(minutes)}**.\n\nWarning fires at \`${fmtMinutes(Math.round(minutes * 0.75))}\`, breach at \`${fmtMinutes(minutes)}\`.`,
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  SLA', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── CHECK ────────────────────────────────────────────────────────────────
    if (sub === 'check') {
      await interaction.deferReply({ ephemeral: true });
      await slaSvc.runSLACheck(client, interaction.guild);
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: '✅  SLA Check Complete',
          description: 'SLA check ran successfully. If any tickets are near or past their SLA target, alerts have been posted to the mod log channel.',
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  SLA', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }
  },
};
