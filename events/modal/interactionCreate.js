const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  PermissionsBitField
} = require("discord.js");
const { errorMessage, premiumEmbed, ticketControlRow, logMessage } = require(`${process.cwd()}/functions/functions`);
const transcriptService = require(`${process.cwd()}/services/transcriptService`);
const analyticsService  = require(`${process.cwd()}/services/analyticsService`);

module.exports = async (client, interaction) => {
try {
  if (!interaction.isModalSubmit()) return;

  // ── Bug Report Modal ─────────────────────────────────────────────────────
  if (interaction.customId === 'reporting') {
    const choice  = interaction.fields.getTextInputValue('report');
    const guild   = client.guilds.cache.get(client.config.discord.server_id);
    const channel = guild?.channels?.cache?.get(client.config.discord.server_channel_report);
    if (!channel) return interaction.reply({ content: '❌ Report channel not configured.', ephemeral: true });
    if ([' ', '  '].includes(choice)) return errorMessage(client, interaction, 'Please write full content for reporting.');

    let invite;
    try { invite = await interaction.channel.createInvite({ maxAge: 0, maxUses: 5 }); } catch { /* */ }

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTitle(`📣  Report from \`${interaction.guild.name}\``)
      .setColor('#EF4444')
      .addFields([
        { name: '🏠  Guild',   value: `${interaction.guild.name} | \`${interaction.guild.id}\`${invite ? ` | [Join](${invite.url})` : ''}`, inline: false },
        { name: '👤  User',    value: `${interaction.user} | \`${interaction.user.tag}\` | \`${interaction.user.id}\``, inline: false },
        { name: '📅  Date',    value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false },
        { name: '📩  Message', value: choice.slice(0, 1000), inline: false }
      ])
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await interaction.reply({
      ephemeral: true,
      embeds: [premiumEmbed(client, {
        title: '✅  Report Sent',
        description: 'Your report has been delivered to our team. Thank you for helping us improve!',
        color: '#10B981'
      })]
    });
  }

  // ── Close Ticket Modal ───────────────────────────────────────────────────
  if (interaction.customId === 'close_ticket_modal') {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;
    const userId    = interaction.user.id;

    const reason    = interaction.fields.getTextInputValue('close_reason') || 'No reason provided.';
    const note      = interaction.fields.getTextInputValue('close_note')   || null;
    const ownerId   = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    const adminRole = await db.get(`guild_${guildId}.ticket.admin_role`);
    const log       = await db.get(`guild_${guildId}.modlog`);
    const logsCh    = log ? interaction.guild.channels.cache.get(log) : null;

    await interaction.deferReply();

    // Close channel perms
    const perms = [{ id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }];
    if (ownerId) perms.push({ id: ownerId, deny: [PermissionsBitField.Flags.ViewChannel] });
    if (adminRole) perms.push({ id: adminRole, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
    await interaction.channel.permissionOverwrites.set(perms).catch(() => null);

    // Rich closed embed
    const closeTs  = Math.floor(Date.now() / 1000);
    const fields   = [
      { name: '🔐  Closed by',   value: `${interaction.user}`,            inline: true },
      { name: '👤  Ticket owner', value: ownerId ? `<@${ownerId}>` : '—', inline: true },
      { name: '📋  Reason',       value: reason,                           inline: false }
    ];
    if (note) fields.push({ name: '💬  Message to user', value: note, inline: false });

    const closedEmbed = premiumEmbed(client, {
      title: '🔒  Ticket Closed',
      color: '#F59E0B'
    })
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .addFields(fields)
      .setFooter({ text: `Wave Network  •  Ticket System  •  <t:${closeTs}:f>`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.editReply({
      embeds: [closedEmbed],
      components: [ticketControlRow({ state: 'closed', disableClose: true })]
    });

    // If note, ping the user
    if (note && ownerId) {
      await interaction.channel.send({ content: `<@${ownerId}> — **Note from staff:** ${note}` }).catch(() => null);
    }

    // Analytics
    const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${channelId}`);
    if (createdAt) {
      await analyticsService.trackEvent(db, guildId, 'first_response', {
        responseTime: Date.now() - createdAt, staffId: userId
      });
    }
    await analyticsService.trackEvent(db, guildId, 'ticket_closed', { staffId: userId, channelId, timestamp: Date.now(), reason });

    // Track staff close count
    await db.add(`guild_${guildId}.analytics.staff_${userId}_closed`, 1).catch(() => null);

    // Transcript
    await transcriptService.generateAndDeliver(client, interaction.channel, interaction.member, 'closed');
    if (logsCh) logMessage(client, interaction, logsCh, `${interaction.user.tag} closed <@${ownerId}>'s ticket.\n**Reason:** ${reason}`, 'Ticket Closed', '🔒');
  }

} catch (e) {
  console.error('[Modal] Error:', e);
}
};
