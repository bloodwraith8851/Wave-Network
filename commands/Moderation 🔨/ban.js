const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require('discord.js');
const { premiumEmbed, errorMessage, successMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'ban',
  description:     'Ban a member from the server with an optional reason.',
  category:        'Moderation 🔨',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['BanMembers'],
  botPermissions:  ['BanMembers'],
  options: [
    {
      name:        'user',
      description: 'The member to ban.',
      type:        ApplicationCommandOptionType.User,
      required:    true,
    },
    {
      name:        'reason',
      description: 'Reason for the ban.',
      type:        ApplicationCommandOptionType.String,
      required:    false,
    },
    {
      name:        'delete_messages',
      description: 'Delete recent messages (days 0–7).',
      type:        ApplicationCommandOptionType.Integer,
      required:    false,
      choices: [
        { name: "Don't delete any", value: 0 },
        { name: '1 day',            value: 1 },
        { name: '3 days',           value: 3 },
        { name: '7 days',           value: 7 },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db     = client.db;
    const ui     = client.ui;
    const guild  = interaction.guild;
    const actor  = interaction.member;
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const days   = interaction.options.getInteger('delete_messages') ?? 0;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!target) {
      return errorMessage(client, interaction, 'That user is not in this server.');
    }
    if (target.id === interaction.user.id) {
      return errorMessage(client, interaction, 'You cannot ban yourself.');
    }
    if (target.id === client.user.id) {
      return errorMessage(client, interaction, 'I cannot ban myself.');
    }
    if (!target.bannable) {
      return errorMessage(client, interaction, 'I cannot ban this user — they may have a higher role than me.');
    }
    if (actor.roles.highest.position <= target.roles.highest.position && guild.ownerId !== interaction.user.id) {
      return errorMessage(client, interaction, 'You cannot ban someone with a role equal to or higher than yours.');
    }

    // ── Confirmation ──────────────────────────────────────────────────────────
    const confirmEmbed = premiumEmbed(client, {
      title:       '🔨  Confirm Ban',
      description: `Are you sure you want to ban **${target.user.tag}**?\n\n**Reason:** ${reason}\n**Delete Messages:** ${days}d\n\n> ⚠️ This action is reversible with \`/unban\`.`,
      color:       '#EF4444',
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_ban').setLabel('Confirm Ban').setEmoji('🔨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_ban').setLabel('Cancel').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      max: 1,
      time: 30_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'cancel_ban') {
        return i.update({
          embeds: [premiumEmbed(client, { title: '✅  Ban Cancelled', description: 'No action was taken.', color: '#10B981' })],
          components: [],
        });
      }

      // ── Execute ban ────────────────────────────────────────────────────────
      // DM user before ban (may fail if DMs closed)
      await target.user.send({
        embeds: [premiumEmbed(client, {
          title:       `🔨  Banned from ${guild.name}`,
          description: `You have been **banned** from **${guild.name}**.\n\n**Reason:** ${reason}`,
          color:       '#EF4444',
        })],
      }).catch(() => null);

      try {
        await guild.bans.create(target.id, {
          reason:                  `${interaction.user.tag}: ${reason}`,
          deleteMessageSeconds:    days * 86400,
        });
      } catch {
        return i.update({
          embeds: [premiumEmbed(client, { title: '⛔  Ban Failed', description: 'Failed to ban the user. Check my permissions and role hierarchy.', color: '#EF4444' })],
          components: [],
        });
      }

      // ── Modlog ────────────────────────────────────────────────────────────
      const logId  = await db.get(`guild_${guild.id}.modlog`);
      const logCh  = logId ? guild.channels.cache.get(logId) : null;
      if (logCh) {
        await logCh.send({
          embeds: [(client.ui || { log: () => premiumEmbed(client, {}) }).log(
            'Member Banned',
            `${interaction.user.tag} (\`${interaction.user.id}\`)`,
            `${target.user.tag} (\`${target.id}\`)`,
            `**Reason:** ${reason}\n**Delete Messages:** ${days} day(s)`,
          )],
        }).catch(() => null);
      }

      // ── Analytics ─────────────────────────────────────────────────────────
      try {
        require(`${process.cwd()}/services/analyticsService`).trackEvent(
          db, guild.id, 'member_banned', { actorId: interaction.user.id, targetId: target.id, reason }
        );
      } catch { /* non-critical */ }

      await i.update({
        embeds: [premiumEmbed(client, {
          title:       '✅  Member Banned',
          description: `**${target.user.tag}** has been successfully banned.\n\n**Reason:** ${reason}`,
          color:       '#10B981',
        })],
        components: [],
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({
          embeds: [premiumEmbed(client, { title: '⏱️  Timed Out', description: 'Ban confirmation timed out. No action taken.', color: '#6B7280' })],
          components: [],
        }).catch(() => null);
      }
    });
  },
};
