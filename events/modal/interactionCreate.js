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
const ticketService      = require(`${process.cwd()}/services/ticketService`);
const antiAbuseService   = require(`${process.cwd()}/services/antiAbuseService`);

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isModalSubmit()) return;

    const db = client.db;
    const { guild, channel, user, member, customId } = interaction;
    const guildId = guild?.id || 'DM';
    const channelId = channel?.id || 'DM';

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

    // ── 🎫 Ticket Create Modal ──────────────────────────────────────────────
    if (customId.startsWith('ticket_create_modal')) {
      const parts = customId.split(':');
      const panelId  = parts[1];
      const catValue = parts[2];
      const reason   = interaction.fields.getTextInputValue('ticket_reason');

      // 1. Anti-abuse checks
      const check = await antiAbuseService.runAllChecks(db, guild, user.id);
      if (!check.allowed) {
        const reasons = {
          spam:        `🚫 You're clicking too fast! Please slow down.`,
          cooldown:    `⏳ You must wait **${check.remaining}s** before opening another ticket.`,
          max_tickets: `📌 You already have **${check.count}/${check.max}** open ticket(s). Close one first.`
        };
        return interaction.reply({ content: reasons[check.reason] || 'Blocked.', flags: 64 });
      }

      // 2. Duplicate check
      const alreadyOpen = await ticketService.hasOpenTicket(db, guild, user.id);
      if (alreadyOpen) {
        const existingName = await db.get(`guild_${guildId}.ticket.name_${user.id}`);
        const existing = guild.channels.cache.find(c => c.name === existingName);
        return interaction.reply({
          content: `You already have an open ticket: ${existing || '`not found`'}. Please close it first.`,
          flags: 64
        });
      }

      // 3. Acknowledge and Create
      await loadingState(interaction, 'Creating your ticket...');

      // Resolve category label
      let categoryLabel = catValue;
      if (panelId !== 'default') {
        const panels = (await db.get(`guild_${guildId}.panels`)) || [];
        const panel  = panels.find(p => p.id === panelId);
        if (panel) {
          const cat = panel.categories.find(c => c.value === catValue);
          if (cat) categoryLabel = cat.label;
        }
      }

      const ticketChannel = await ticketService.createTicket(client, interaction, categoryLabel, panelId === 'default' ? null : panelId, reason);
      
      if (!ticketChannel) {
        return interaction.editReply({ content: '❌ Failed to create ticket. Please try again.' }).catch(() => null);
      }

      // 4. Finalize
      await antiAbuseService.setCooldown(db, guildId, user.id);
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: `✅  Ticket Created`,
          description: `Your ticket is ready: ${ticketChannel}\n\n**Category:** \`${categoryLabel}\``,
          color: '#10B981'
        }).setFooter({ text: `${guild.name}  •  Wave Network`, iconURL: guild.iconURL({ dynamic: true }) })],
        components: []
      }).catch(() => null);
    }
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
