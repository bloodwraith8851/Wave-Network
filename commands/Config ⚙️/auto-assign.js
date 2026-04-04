/**
 * auto-assign.js — /auto-assign command
 * Configure the ticket auto-assignment system.
 *
 * /auto-assign mode <round_robin|load_balanced|off>
 * /auto-assign add <user>
 * /auto-assign remove <user>
 * /auto-assign status
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc      = require(`${process.cwd()}/services/permissionService`);
const autoAssignSvc = require(`${process.cwd()}/services/autoAssignService`);
const auditSvc     = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'auto-assign',
  description: 'Configure automatic ticket assignment to staff members.',
  category: 'Config ⚙️',
  cooldown: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'mode',
      description: 'Set the assignment algorithm.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'mode', description: 'Assignment mode.', type: ApplicationCommandOptionType.String, required: true,
          choices: [
            { name: '🔄 Round Robin',    value: 'round_robin' },
            { name: '⚖️ Load Balanced', value: 'load_balanced' },
            { name: '❌ Off',            value: 'off' },
          ] },
      ],
    },
    {
      name: 'add',
      description: 'Add a staff member to the assignment pool.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'user', description: 'Staff member to add.', type: ApplicationCommandOptionType.User, required: true },
      ],
    },
    {
      name: 'remove',
      description: 'Remove a staff member from the assignment pool.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'user', description: 'Staff member to remove.', type: ApplicationCommandOptionType.User, required: true },
      ],
    },
    {
      name: 'status',
      description: 'View current assignment pool and mode.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.set', client.config, interaction, errorMessage);
    if (denied) return;

    if (sub === 'mode') {
      const mode = interaction.options.getString('mode');
      await autoAssignSvc.setMode(db, guildId, mode);
      await auditSvc.log(db, guildId, interaction.user.id, 'autoassign.set_mode', { mode });
      const icons = { round_robin: '🔄', load_balanced: '⚖️', off: '❌' };
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `${icons[mode]}  Auto-Assign Mode: ${mode.replace('_', ' ').toUpperCase()}`,
          description: {
            round_robin:    'Tickets will be assigned to staff in rotation, regardless of workload.',
            load_balanced:  'Tickets will be assigned to the staff member with the **fewest open tickets**.',
            off:            'Auto-assign is **disabled**. Tickets will not be automatically assigned.',
          }[mode],
          color: mode === 'off' ? '#6B7280' : '#10B981',
        }).setFooter({ text: 'Wave Network  •  Auto-Assign', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'add') {
      const user  = interaction.options.getUser('user');
      const added = await autoAssignSvc.addToPool(db, guildId, user.id);
      if (!added) return errorMessage(client, interaction, `${user} is already in the assignment pool.`);
      await auditSvc.log(db, guildId, interaction.user.id, 'autoassign.add_pool', { userId: user.id });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '✅  Added to Pool', description: `${user} will now receive automatic ticket assignments.`, color: '#10B981' })
          .setFooter({ text: 'Wave Network  •  Auto-Assign', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      const user    = interaction.options.getUser('user');
      const removed = await autoAssignSvc.removeFromPool(db, guildId, user.id);
      if (!removed) return errorMessage(client, interaction, `${user} is not in the assignment pool.`);
      await auditSvc.log(db, guildId, interaction.user.id, 'autoassign.remove_pool', { userId: user.id });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '🗑️  Removed from Pool', description: `${user} has been removed from auto-assignment.`, color: '#EF4444' })
          .setFooter({ text: 'Wave Network  •  Auto-Assign', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'status') {
      const cfg    = await autoAssignSvc.getConfig(db, guildId);
      const counts = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};

      const poolLines = cfg.pool.length
        ? await Promise.all(cfg.pool.map(async uid => {
            const load   = counts[uid] || 0;
            const member = interaction.guild.members.cache.get(uid);
            const status = member?.presence?.status === 'online' ? '🟢' : member?.presence?.status === 'idle' ? '🟡' : '⚫';
            return `${status} <@${uid}> — \`${load}\` open ticket${load !== 1 ? 's' : ''}`;
          }))
        : ['*No staff in pool. Add with `/auto-assign add <user>`.*'];

      const icons = { round_robin: '🔄', load_balanced: '⚖️', off: '❌' };
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `${icons[cfg.mode] || '⚙️'}  Auto-Assign Status`,
          description: [
            `**Mode:** \`${cfg.mode}\``,
            `**Pool size:** \`${cfg.pool.length}\``,
            ``,
            `**Staff Pool:**`,
            poolLines.join('\n'),
          ].join('\n'),
          color: '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  Auto-Assign', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
