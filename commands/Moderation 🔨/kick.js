const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'kick',
  description:     'Kick a member from the server.',
  category:        'Moderation 🔨',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['KickMembers'],
  botPermissions:  ['KickMembers'],
  options: [
    {
      name:        'user',
      description: 'The member to kick.',
      type:        ApplicationCommandOptionType.User,
      required:    true,
    },
    {
      name:        'reason',
      description: 'Reason for the kick.',
      type:        ApplicationCommandOptionType.String,
      required:    false,
    },
  ],

  run: async (client, interaction) => {
    const db     = client.db;
    const guild  = interaction.guild;
    const actor  = interaction.member;
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    // ── Validation ────────────────────────────────────────────────────────────
    if (!target) return errorMessage(client, interaction, 'That user is not in this server.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot kick yourself.');
    if (target.id === client.user.id) return errorMessage(client, interaction, 'I cannot kick myself.');
    if (!target.kickable) return errorMessage(client, interaction, 'I cannot kick this user — they may outrank me.');
    if (actor.roles.highest.position <= target.roles.highest.position && guild.ownerId !== interaction.user.id) {
      return errorMessage(client, interaction, 'You cannot kick someone with an equal or higher role.');
    }

    // ── Confirmation ──────────────────────────────────────────────────────────
    const confirmEmbed = premiumEmbed(client, {
      title:       '👢  Confirm Kick',
      description: `Kick **${target.user.tag}** from the server?\n\n**Reason:** ${reason}`,
      color:       '#F59E0B',
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('confirm_kick').setLabel('Confirm Kick').setEmoji('👢').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('cancel_kick').setLabel('Cancel').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 });

    const msg       = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      max: 1,
      time: 30_000,
    });

    collector.on('collect', async (i) => {
      if (i.customId === 'cancel_kick') {
        return i.update({
          embeds: [premiumEmbed(client, { title: '✅  Kick Cancelled', description: 'No action was taken.', color: '#10B981' })],
          components: [],
        });
      }

      // DM user
      await target.user.send({
        embeds: [premiumEmbed(client, {
          title:       `👢  Kicked from ${guild.name}`,
          description: `You have been **kicked** from **${guild.name}**.\n\n**Reason:** ${reason}`,
          color:       '#F59E0B',
        })],
      }).catch(() => null);

      try {
        await target.kick(`${interaction.user.tag}: ${reason}`);
      } catch {
        return i.update({
          embeds: [premiumEmbed(client, { title: '⛔  Kick Failed', description: 'Failed to kick. Check my permissions.', color: '#EF4444' })],
          components: [],
        });
      }

      // Modlog
      const logCh = guild.channels.cache.get(await db.get(`guild_${guild.id}.modlog`));
      if (logCh) {
        await logCh.send({
          embeds: [(client.ui || { log: () => premiumEmbed(client, {}) }).log(
            'Member Kicked',
            `${interaction.user.tag} (\`${interaction.user.id}\`)`,
            `${target.user.tag} (\`${target.id}\`)`,
            `**Reason:** ${reason}`,
          )],
        }).catch(() => null);
      }

      await i.update({
        embeds: [premiumEmbed(client, {
          title:       '✅  Member Kicked',
          description: `**${target.user.tag}** has been kicked.\n\n**Reason:** ${reason}`,
          color:       '#10B981',
        })],
        components: [],
      });
    });

    collector.on('end', (_, r) => {
      if (r === 'time') interaction.editReply({
        embeds: [premiumEmbed(client, { title: '⏱️  Timed Out', description: 'Kick confirmation expired.', color: '#6B7280' })],
        components: [],
      }).catch(() => null);
    });
  },
};
