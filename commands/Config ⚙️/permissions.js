const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permissionService = require(`${process.cwd()}/services/permissionService`);

const LEVELS = [
  { name: '0 — Member (Everyone)',   value: '0' },
  { name: '1 — Staff',              value: '1' },
  { name: '2 — Moderator',          value: '2' },
  { name: '3 — Admin',              value: '3' },
  { name: '4 — Owner (Bot owners)', value: '4' },
];

module.exports = {
  name:            'permissions',
  description:     'Manage the 5-tier permission system for this server.',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'view',
      description: 'View the current permission configuration.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'set-role',
      description: 'Assign a role to a permission level.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name:        'level',
          description: 'Permission level to assign.',
          type:        ApplicationCommandOptionType.String,
          required:    true,
          choices: [
            { name: 'Staff (Level 1)',     value: 'staff' },
            { name: 'Moderator (Level 2)', value: 'moderator' },
            { name: 'Admin (Level 3)',     value: 'admin' },
          ],
        },
        {
          name:        'role',
          description: 'Role to assign to this level.',
          type:        ApplicationCommandOptionType.Role,
          required:    true,
        },
      ],
    },
    {
      name:        'remove-role',
      description: 'Remove the role assignment for a permission level.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name:        'level',
          description: 'Level to remove.',
          type:        ApplicationCommandOptionType.String,
          required:    true,
          choices: [
            { name: 'Staff',     value: 'staff' },
            { name: 'Moderator', value: 'moderator' },
            { name: 'Admin',     value: 'admin' },
          ],
        },
      ],
    },
    {
      name:        'set-feature',
      description: 'Set the minimum permission level required for a specific feature.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name:        'feature',
          description: 'Feature to configure (e.g. ticket.close, ticket.claim)',
          type:        ApplicationCommandOptionType.String,
          required:    true,
        },
        {
          name:        'level',
          description: 'Minimum level required.',
          type:        ApplicationCommandOptionType.String,
          required:    true,
          choices: LEVELS,
        },
      ],
    },
    {
      name:        'reset-feature',
      description: 'Reset a specific feature to its default permission level.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name:        'feature',
          description: 'Feature to reset.',
          type:        ApplicationCommandOptionType.String,
          required:    true,
        },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db    = client.db;
    const guild = interaction.guild;
    const sub   = interaction.options.getSubcommand();
    const gid   = guild.id;

    if (sub === 'view') {
      const [adminRole, modRole, staffRole] = await Promise.all([
        db.get(`guild_${gid}.ticket.admin_role`),
        db.get(`guild_${gid}.permissions.roles.moderator`),
        db.get(`guild_${gid}.permissions.roles.staff`),
      ]);

      const roleStr = (id) => id ? `<@&${id}>` : '`Not Set`';

      const embed = premiumEmbed(client, {
        title:       '🔐  Permission Configuration',
        description: 'Current 5-tier permission role assignments for this server.',
        color:       '#7C3AED',
        fields: [
          { name: '👑 Level 4 — Owner',     value: `Bot owners in config`,           inline: false },
          { name: '🛡️ Level 3 — Admin',     value: roleStr(adminRole),               inline: true },
          { name: '⚒️ Level 2 — Moderator', value: roleStr(modRole),                 inline: true },
          { name: '🔧 Level 1 — Staff',     value: roleStr(staffRole),               inline: true },
          { name: '👤 Level 0 — Member',    value: 'Everyone (default)',             inline: true },
        ],
      });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (sub === 'set-role') {
      const level  = interaction.options.getString('level');
      const role   = interaction.options.getRole('role');

      const keyMap = {
        admin:     `guild_${gid}.ticket.admin_role`,
        moderator: `guild_${gid}.permissions.roles.moderator`,
        staff:     `guild_${gid}.permissions.roles.staff`,
      };

      await db.set(keyMap[level], role.id);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Permission Role Updated',
          description: `**${level.charAt(0).toUpperCase() + level.slice(1)}** role set to ${role}.`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'remove-role') {
      const level  = interaction.options.getString('level');
      const keyMap = {
        admin:     `guild_${gid}.ticket.admin_role`,
        moderator: `guild_${gid}.permissions.roles.moderator`,
        staff:     `guild_${gid}.permissions.roles.staff`,
      };

      await db.delete(keyMap[level]);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Role Removed',
          description: `The **${level}** role assignment has been removed.`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'set-feature') {
      const feature = interaction.options.getString('feature');
      const level   = parseInt(interaction.options.getString('level'));

      // Sanitize feature key (prevent injection)
      if (!/^[a-z._-]{2,50}$/i.test(feature)) {
        return errorMessage(client, interaction, 'Invalid feature key format. Use alphanumerics, dots, and hyphens only.');
      }

      await db.set(`guild_${gid}.permissions.features.${feature.replace(/\./g, '_')}`, level);
      client.cache?.invalidate?.(gid);

      const levelNames = ['Member', 'Staff', 'Moderator', 'Admin', 'Owner'];
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Feature Permission Set',
          description: `Feature \`${feature}\` now requires **${levelNames[level]} (Level ${level})**  or higher.`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'reset-feature') {
      const feature = interaction.options.getString('feature');
      if (!/^[a-z._-]{2,50}$/i.test(feature)) {
        return errorMessage(client, interaction, 'Invalid feature key format.');
      }

      await db.delete(`guild_${gid}.permissions.features.${feature.replace(/\./g, '_')}`);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Feature Reset',
          description: `Feature \`${feature}\` has been reset to its default permission level.`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }
  },
};
