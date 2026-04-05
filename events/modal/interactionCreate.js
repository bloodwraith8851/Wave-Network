/**
 * events/modal/interactionCreate.js
 * Handles modal submissions with premium design and webhook integration.
 */
const { 
  EmbedBuilder, 
  PermissionsBitField,
} = require("discord.js");
const { 
  errorMessage, 
  successMessage,
  premiumEmbed, 
  ticketControlRow,
  loadingState
} = require(`${process.cwd()}/functions/functions`);

const transcriptService = require(`${process.cwd()}/services/transcriptService`);
const analyticsService  = require(`${process.cwd()}/services/analyticsService`);
const webhookService    = require(`${process.cwd()}/services/webhookService`);
const cache             = require(`${process.cwd()}/services/cacheService`);
const ratingService      = require(`${process.cwd()}/services/ratingService`);

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isModalSubmit()) return;

    const db = client.db;
    const { guild, channel, user, member, customId } = interaction;
    const guildId = guild.id;
    const channelId = channel.id;

    // ── 🔒 Close Ticket Modal ──────────────────────────────────────────────────
    if (customId === 'close_ticket_modal') {
      const reason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided.';
      const ownerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
      
      const adminRole = await db.get(`guild_${guildId}.permissions.roles.admin`);
      const modRole   = await db.get(`guild_${guildId}.permissions.roles.moderator`);
      const staffRole = await db.get(`guild_${guildId}.permissions.roles.staff`);

      await loadingState(interaction, 'Closing ticket...');

      // Update permissions to restrict view
      const perms = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }
      ];
      [adminRole, modRole, staffRole].forEach(id => {
        if (id) perms.push({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory] });
      });
      await channel.permissionOverwrites.set(perms).catch(() => null);

      const embed = premiumEmbed(client, {
        title: '🔒  Ticket Closed',
        description: `This ticket has been closed by ${user}.\n\n**Reason:** ${reason}`,
        color: client.colors?.warning
      }).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) });

      await interaction.editReply({ 
        embeds: [embed], 
        components: [ticketControlRow({ state: 'closed', disableClose: true })] 
      });

      // ── Analytics ────────────────────────────────────────────────────────
      const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${channelId}`);
      if (createdAt) {
        await analyticsService.trackEvent(db, guildId, 'ticket_closed', {
          staffId: user.id,
          channelId,
          duration: Date.now() - createdAt,
          reason
        });
      }

      // ── Webhooks ─────────────────────────────────────────────────────────
      await webhookService.dispatch(db, guildId, 'ticket_close', {
        channelId,
        staffId: user.id,
        reason,
        timestamp: Date.now()
      });

      // ── Transcript ───────────────────────────────────────────────────────
      await transcriptService.generateAndDeliver(client, channel, member, 'closed');
      
      // ── Rating Feature ───────────────────────────────────────────────────
      const ratingsEnabled = (await db.get(`guild_${guildId}.ticket.settings.ratings_enabled`)) ?? true;
      if (ratingsEnabled && ownerId) {
        await ratingService.sendRatingRequest(client, guild, ownerId, channel.name, user.id);
      }
      
      return;
    }

    // ── 📣 Report Modal ────────────────────────────────────────────────────────
    if (customId === 'reporting') {
      const report = interaction.fields.getTextInputValue('report');
      const logChannelId = client.config.discord.server_channel_report;
      const logChannel = client.guilds.cache.get(client.config.discord.server_id)?.channels.cache.get(logChannelId);

      if (!logChannel) return errorMessage(client, interaction, 'Report channel is not configured correctly.');

      const embed = premiumEmbed(client, {
        title: '📣  Bug/Issue Report',
        description: report,
        color: client.colors?.error
      }).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .addFields([{ name: '📍 Source Guild', value: `${guild.name} (\`${guildId}\`)` }]);

      await logChannel.send({ embeds: [embed] });
      
      return successMessage(client, interaction, 'Your report has been successfully submitted to our developers. Thank you!');
    }

  } catch (e) {
    console.error('[Modal Handler Error]', e);
    return errorMessage(client, interaction, 'An unexpected error occurred in the modal handler.');
  }
};
