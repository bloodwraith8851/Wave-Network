/**
 * verify.js — /verify command
 * Configure and manage the verification gate for ticket creation.
 *
 * /verify setup <mode>   — set verification mode
 * /verify panel          — post verification button panel in a channel
 * /verify check <user>   — check a user's verification status + alt suspicion
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc    = require(`${process.cwd()}/services/permissionService`);
const verifySvc  = require(`${process.cwd()}/services/verificationService`);
const auditSvc   = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'verify',
  description: 'Configure the verification gate for ticket creation.',
  category: 'Config ⚙️',
  cooldown: 5,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'setup',
      description: 'Configure the verification mode.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'mode', description: 'Verification requirement mode.', type: ApplicationCommandOptionType.String, required: true,
          choices: [
            { name: 'None (off)',              value: 'none' },
            { name: 'Role Required',           value: 'role' },
            { name: 'Account Age Check',       value: 'age' },
            { name: 'Captcha Button Click',    value: 'captcha' },
          ] },
        { name: 'role',    description: '[role mode] Required role.',         type: ApplicationCommandOptionType.Role,    required: false },
        { name: 'min_age', description: '[age mode] Minimum account age (days).', type: ApplicationCommandOptionType.Integer, required: false },
      ],
    },
    {
      name: 'panel',
      description: 'Post a verification button panel in the current channel.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'check',
      description: 'Check a user\'s verification status and alt suspicion.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'user', description: 'User to check.', type: ApplicationCommandOptionType.User, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.set', client.config, interaction, errorMessage);
    if (denied) return;

    // ── SETUP ─────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const mode   = interaction.options.getString('mode');
      const role   = interaction.options.getRole('role');
      const minAge = interaction.options.getInteger('min_age') || 7;

      await db.set(`guild_${guildId}.ticket.settings.verification_mode`, mode);
      if (mode === 'role' && role) await db.set(`guild_${guildId}.ticket.settings.verification_role`, role.id);
      if (mode === 'age') await db.set(`guild_${guildId}.ticket.settings.min_account_age_days`, minAge);

      await auditSvc.log(db, guildId, interaction.user.id, 'verify.setup', { mode });

      const descriptions = {
        none:    '❌ **No verification** — anyone can open tickets.',
        role:    `✅ **Role Required** — users need ${role || 'the configured role'} to open tickets.`,
        age:     `✅ **Account Age** — accounts must be at least **${minAge} days old**.`,
        captcha: '✅ **Captcha** — users must click a verification button before opening tickets.\n\nUse `/verify panel` to post the verification button.',
      };

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🔒  Verification Mode: ${mode.toUpperCase()}`,
          description: descriptions[mode],
          color: mode === 'none' ? '#6B7280' : '#10B981',
        }).setFooter({ text: 'Wave Network  •  Verification', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }

    // ── PANEL ─────────────────────────────────────────────────────────────────
    if (sub === 'panel') {
      const embed = premiumEmbed(client, {
        title: '🔒  Verification Required',
        description: [
          `Before you can open a support ticket, you must verify yourself.`,
          ``,
          `**Click the button below to verify.** ✅`,
          ``,
          `> This is a one-time process. Once verified, you can open tickets freely.`,
        ].join('\n'),
        color: '#7C3AED',
      })
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${interaction.guild.name}  •  Verification Gate`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setImage('https://i.imgur.com/placeholder.png'); // Can be replaced with custom image

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_captcha')
          .setLabel('✅  Click to Verify')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔒')
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Verification panel posted!', flags: 64 });
    }

    // ── CHECK ─────────────────────────────────────────────────────────────────
    if (sub === 'check') {
      const targetUser   = interaction.options.getUser('user');
      const member       = interaction.guild.members.cache.get(targetUser.id)
        || await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!member) return errorMessage(client, interaction, 'Could not find that user in this server.');

      const cfg         = await verifySvc.getConfig(db, guildId);
      const result      = await verifySvc.checkVerification(db, guildId, member);
      const altCheck    = await verifySvc.checkAltSuspicion(db, guildId, member);
      const isVerified  = await db.get(`guild_${guildId}.verification.solved_${targetUser.id}`) || false;

      const accountAge  = Math.floor((Date.now() - targetUser.createdTimestamp) / 86400000);
      const joinAge     = Math.floor((Date.now() - member.joinedTimestamp)      / 86400000);

      const embed = premiumEmbed(client, {
        title: `🔍  Verification Check — ${targetUser.username}`,
        color: altCheck.flagged ? '#EF4444' : (result.passed ? '#10B981' : '#F59E0B'),
      })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields([
          {
            name: '🔒  Gate Status',
            value: result.passed ? '✅ Passes verification' : `❌ Would be **blocked**\n> ${result.reason}`,
            inline: false,
          },
          {
            name: '📅  Account Info',
            value: [
              `> **Account Age:** \`${accountAge} days\`  (<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>)`,
              `> **Join Age:** \`${joinAge} days\`  (<t:${Math.floor(member.joinedTimestamp / 1000)}:D>)`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '🤖  Alt Detection',
            value: altCheck.flagged
              ? `⚠️ **Suspicious** — account \`${accountAge}d\` old, joined server \`${joinAge}d\` ago`
              : `✅ Looks legitimate`,
            inline: true,
          },
          {
            name: '🎯  Captcha',
            value: isVerified ? '✅ Verified' : '❌ Not verified',
            inline: true,
          },
          {
            name: '⚙️  Mode',
            value: `\`${cfg.mode}\``,
            inline: true,
          },
        ])
        .setFooter({ text: 'Wave Network  •  Verification', iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  },
};
