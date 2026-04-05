/**
 * permissions.js — /permissions command
 * Manage the 5-tier permission system per guild.
 *
 * Subcommands:
 *   /permissions view
 *   /permissions set-role <level> <role>
 *   /permissions remove-role <level>
 *   /permissions set-feature <feature> <level>
 *   /permissions reset-feature <feature>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const LEVELS = { owner: 4, admin: 3, moderator: 2, mod: 2, staff: 1, member: 0 };

module.exports = {
  name: 'permissions',
  description: 'Manage the 5-tier permission system for this server.',
  category: 'Config ⚙️',
  cooldown: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    // ── /permissions view ──────────────────────────────────────────────────
    {
      name: 'view',
      description: 'View current role assignments and feature permission overrides.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    // ── /permissions set-role ──────────────────────────────────────────────
    {
      name: 'set-role',
      description: 'Assign a Discord role to a permission level (admin / moderator / staff).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'level',
          description: 'Permission level to assign the role to.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: '👑 Admin (Level 3)',     value: 'admin' },
            { name: '⚒️ Moderator (Level 2)',  value: 'moderator' },
            { name: '🛡️ Staff (Level 1)',      value: 'staff' },
          ],
        },
        {
          name: 'role',
          description: 'The Discord role to assign.',
          type: ApplicationCommandOptionType.Role,
          required: true,
        },
      ],
    },
    // ── /permissions remove-role ───────────────────────────────────────────
    {
      name: 'remove-role',
      description: 'Remove the role assignment from a permission level.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'level',
          description: 'Permission level to clear.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: '👑 Admin (Level 3)',     value: 'admin' },
            { name: '⚒️ Moderator (Level 2)',  value: 'moderator' },
            { name: '🛡️ Staff (Level 1)',      value: 'staff' },
          ],
        },
      ],
    },
    // ── /permissions set-feature ───────────────────────────────────────────
    {
      name: 'set-feature',
      description: 'Override the minimum permission level required for a specific feature.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'feature',
          description: 'Feature to configure (e.g. ticket.close, config.set).',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
        {
          name: 'level',
          description: 'Minimum permission level required (0=Member … 3=Admin).',
          type: ApplicationCommandOptionType.Integer,
          required: true,
          choices: [
            { name: '0 — Member (everyone)',   value: 0 },
            { name: '1 — Staff',               value: 1 },
            { name: '2 — Moderator',           value: 2 },
            { name: '3 — Admin',               value: 3 },
          ],
        },
      ],
    },
    // ── /permissions reset-feature ─────────────────────────────────────────
    {
      name: 'reset-feature',
      description: 'Reset a feature permission override back to its default.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'feature',
          description: 'Feature to reset.',
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Only admins/owners can manage permissions
    const memberLevel = await permSvc.getMemberLevel(db, interaction.guild, interaction.member, client.config);
    if (memberLevel < 3) {
      return errorMessage(client, interaction, '🔒 **Permission Denied** — You need **Admin** level (Level 3+) to manage permissions.');
    }

    // ── VIEW ───────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const roles     = await permSvc.getRoleAssignments(db, guildId);
      const overrides = await permSvc.getFeatureOverrides(db, guildId);

      const roleLine = (level, roleId) => {
        const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
        return role ? `${role}  \`${role.name}\`` : '`Not set`';
      };

      const overrideLines = Object.entries(overrides).length
        ? Object.entries(overrides).map(([f, l]) =>
            `\`${f}\` → **${permSvc.LEVEL_EMOJIS[l]} ${permSvc.LEVEL_NAMES[l]}**`
          ).join('\n')
        : '*No feature overrides set — using defaults.*';

      const embed = premiumEmbed(client, {
        title: '🔐  Permission System Overview',
        color: '#8B5CF6',
      })
        .setDescription([
          `**Tier Levels:**`,
          `> 🌟 **Owner** (4) — Bot owner IDs + Guild owner`,
          `> 👑 **Admin** (3) — Configured role or \`ManageGuild\``,
          `> ⚒️ **Moderator** (2) — Configured role or \`ManageMessages\``,
          `> 🛡️ **Staff** (1) — Configured role or \`ManageChannels\``,
          `> 👤 **Member** (0) — Everyone else`,
        ].join('\n'))
        .addFields([
          {
            name: '🎭  Role Assignments',
            value: [
              `> 👑 **Admin:** ${roleLine(3, roles.admin)}`,
              `> ⚒️ **Moderator:** ${roleLine(2, roles.moderator)}`,
              `> 🛡️ **Staff:** ${roleLine(1, roles.staff)}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: `📋  Feature Overrides (${Object.keys(overrides).length})`,
            value: overrideLines.slice(0, 1000),
            inline: false,
          },
        ])
        .setFooter({
          text: `${interaction.guild.name}  •  Use /permissions set-role to assign roles`,
          iconURL: interaction.guild.iconURL({ dynamic: true }),
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── SET-ROLE ───────────────────────────────────────────────────────────
    if (sub === 'set-role') {
      const level = interaction.options.getString('level'); // admin|moderator|staff
      const role  = interaction.options.getRole('role');

      const oldId = await db.get(`guild_${guildId}.permissions.roles.${level}`);
      await db.set(`guild_${guildId}.permissions.roles.${level}`, role.id);

      // Also sync to legacy admin_role key for backward compat
      if (level === 'admin') {
        await db.set(`guild_${guildId}.ticket.admin_role`, role.id);
      }

      await auditSvc.log(db, guildId, interaction.user.id, 'permissions.set_role', {
        level,
        oldRoleId: oldId,
        newRoleId: role.id,
      });

      const embed = premiumEmbed(client, {
        title: `✅  Permission Role Updated`,
        description: `**${permSvc.LEVEL_EMOJIS[LEVELS[level]]} ${level.charAt(0).toUpperCase() + level.slice(1)}** level is now assigned to ${role}.\n\nMembers with this role will have **Level ${LEVELS[level]}** permissions.`,
        color: client.colors?.success || '#10B981',
      }).setFooter({ text: `Wave Network  •  Permission System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── REMOVE-ROLE ────────────────────────────────────────────────────────
    if (sub === 'remove-role') {
      const level = interaction.options.getString('level');
      const oldId = await db.get(`guild_${guildId}.permissions.roles.${level}`);
      await db.delete(`guild_${guildId}.permissions.roles.${level}`);

      await auditSvc.log(db, guildId, interaction.user.id, 'permissions.remove_role', {
        level, removedRoleId: oldId,
      });

      const embed = premiumEmbed(client, {
        title: `🗑️  Permission Role Removed`,
        description: `Role assignment for **${level}** has been cleared.\n\nFallback: Discord's built-in permissions will now be used for this level.`,
        color: client.colors?.error || '#EF4444',
      }).setFooter({ text: `Wave Network  •  Permission System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── SET-FEATURE ────────────────────────────────────────────────────────
    if (sub === 'set-feature') {
      const feature = interaction.options.getString('feature').toLowerCase().trim();
      const level   = interaction.options.getInteger('level');

      // Validate feature exists
      if (!(feature in permSvc.FEATURE_DEFAULTS)) {
        const available = Object.keys(permSvc.FEATURE_DEFAULTS).join(', ');
        return errorMessage(client, interaction,
          `❌ Unknown feature \`${feature}\`.\n\nAvailable: \`\`\`${available.slice(0, 800)}\`\`\``
        );
      }

      const defaultLevel = permSvc.FEATURE_DEFAULTS[feature];
      await db.set(`guild_${guildId}.permissions.features.${feature}`, level);

      await auditSvc.log(db, guildId, interaction.user.id, 'permissions.set_feature', {
        feature,
        oldLevel: defaultLevel,
        newLevel: level,
      });

      const embed = premiumEmbed(client, {
        title: `✅  Feature Permission Updated`,
        description: [
          `**Feature:** \`${feature}\``,
          `**Required level:** ${permSvc.LEVEL_EMOJIS[level]} **${permSvc.LEVEL_NAMES[level]}** (Level ${level})`,
          `**Default was:** ${permSvc.LEVEL_EMOJIS[defaultLevel]} ${permSvc.LEVEL_NAMES[defaultLevel]} (Level ${defaultLevel})`,
        ].join('\n'),
        color: client.colors?.info || '#3B82F6',
      }).setFooter({ text: `Wave Network  •  Permission System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── RESET-FEATURE ──────────────────────────────────────────────────────
    if (sub === 'reset-feature') {
      const feature = interaction.options.getString('feature').toLowerCase().trim();
      await db.delete(`guild_${guildId}.permissions.features.${feature}`);

      const defaultLevel = permSvc.FEATURE_DEFAULTS[feature] ?? 1;

      await auditSvc.log(db, guildId, interaction.user.id, 'permissions.reset_feature', {
        feature, restoredLevel: defaultLevel,
      });

      const embed = premiumEmbed(client, {
        title: `🔄  Feature Permission Reset`,
        description: `Feature \`${feature}\` has been reset to its default level:\n${permSvc.LEVEL_EMOJIS[defaultLevel]} **${permSvc.LEVEL_NAMES[defaultLevel]}** (Level ${defaultLevel})`,
        color: client.colors?.primary || '#8B5CF6',
      }).setFooter({ text: `Wave Network  •  Permission System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
