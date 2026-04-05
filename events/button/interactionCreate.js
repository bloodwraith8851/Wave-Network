/**
 * events/button/interactionCreate.js
 * Handles ALL button interactions for the ticket system with full permission wiring.
 */
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputStyle, 
  TextInputBuilder, 
  PermissionsBitField 
} = require('discord.js');
const { 
  errorMessage, 
  successMessage,
  logMessage, 
  premiumEmbed, 
  ticketControlRow,
  loadingState
} = require(`${process.cwd()}/functions/functions`);

const transcriptService = require(`${process.cwd()}/services/transcriptService`);
const analyticsService  = require(`${process.cwd()}/services/analyticsService`);
const permissionService  = require(`${process.cwd()}/services/permissionService`);
const webhookService     = require(`${process.cwd()}/services/webhookService`);
const cache             = require(`${process.cwd()}/services/cacheService`);
const ratingService     = require(`${process.cwd()}/services/ratingService`);
const ticketService     = require(`${process.cwd()}/services/ticketService`);
const antiAbuseService  = require(`${process.cwd()}/services/antiAbuseService`);

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;
    
    const db = client.db;
    const { guild, channel, user, member } = interaction;
    const guildId = guild.id;
    const channelId = channel.id;

    // ── 🛡️ Permission Layer ──────────────────────────────────────────────────
    const ticketOwnerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    const isOwner = ticketOwnerId === user.id;

    // ── 🔒 Close Ticket ──────────────────────────────────────────────────────
    if (interaction.customId === 'close') {
      // Allow owner or staff to close
      const isStaff = await permissionService.checkPermission(db, guild, member, 'ticket.close', client.config);
      if (!isStaff.allowed && !isOwner) {
        return errorMessage(client, interaction, 'You do not have permission to close this ticket.');
      }

      const modal = new ModalBuilder()
        .setCustomId('close_ticket_modal')
        .setTitle('🔒  Close Ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('close_reason')
              .setLabel('Reason for closing')
              .setPlaceholder('Describe why this ticket is being closed...')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return interaction.showModal(modal);
    }

    // ── 🔓 Re-open Ticket ────────────────────────────────────────────────────
    if (interaction.customId === 'open') {
      if (await permissionService.requirePermission(db, guild, member, 'ticket.reopen', client.config, interaction, errorMessage)) return;

      await loadingState(interaction, 'Re-opening ticket...');
      
      const adminRole = await db.get(`guild_${guildId}.permissions.roles.admin`);
      const modRole   = await db.get(`guild_${guildId}.permissions.roles.moderator`);
      const staffRole = await db.get(`guild_${guildId}.permissions.roles.staff`);

      const perms = [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];
      if (ticketOwnerId) perms.push({ id: ticketOwnerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });

      [adminRole, modRole, staffRole].forEach(id => {
        if (id) perms.push({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      });

      await channel.permissionOverwrites.set(perms);
      
      const embed = premiumEmbed(client, {
        title: '🔓  Ticket Re-opened',
        description: `This ticket has been re-opened by ${user}.`,
        color: client.colors?.success
      });
      
      await interaction.editReply({ embeds: [embed], components: [ticketControlRow({ state: 'open' })] });
      if (client.config.discord.logs_channel) {
         logMessage(client, interaction, guild.channels.cache.get(client.config.discord.logs_channel), `${user.tag} re-opened ticket #${channel.name}`, 'Ticket Re-opened', '🔓');
      }
      return;
    }

    // ── 🗑️ Delete Ticket ─────────────────────────────────────────────────────
    if (interaction.customId === 'delete') {
      if (await permissionService.requirePermission(db, guild, member, 'ticket.delete', client.config, interaction, errorMessage)) return;

      const embed = premiumEmbed(client, {
        title: '🗑️  Confirm Deletion',
        description: 'Are you sure you want to permanently delete this ticket channel and all its data?',
        color: client.colors?.error
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('delete_confirm').setLabel('Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('dont_do').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }

    if (interaction.customId === 'delete_confirm') {
      if (await permissionService.requirePermission(db, guild, member, 'ticket.delete', client.config, interaction, errorMessage)) return;

      await loadingState(interaction, 'Deleting ticket in 5 seconds...');
      
      // Webhook dispatch
      await webhookService.dispatch(db, guildId, 'ticket_delete', {
        channelId,
        staffId: user.id,
        timestamp: Date.now()
      });

      // Transcript
      await transcriptService.generateAndDeliver(client, channel, member, 'deleted');

      setTimeout(async () => {
        await channel.delete().catch(() => null);
        // DB Cleanup
        await db.delete(`guild_${guildId}.ticket.control_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.name_${ticketOwnerId}`);
      }, 5000);
      return;
    }

    // ── 🙋 Claim Ticket ──────────────────────────────────────────────────────
    if (interaction.customId === 'claim') {
      if (await permissionService.requirePermission(db, guild, member, 'ticket.claim', client.config, interaction, errorMessage)) return;

      const currentClaim = await db.get(`guild_${guildId}.ticket.claimed_${channelId}`);
      if (currentClaim) return errorMessage(client, interaction, `This ticket is already claimed by <@${currentClaim}>.`);

      await db.set(`guild_${guildId}.ticket.claimed_${channelId}`, user.id);
      
      const embed = premiumEmbed(client, {
        title: '🙋  Ticket Claimed',
        description: `This ticket is now being handled by ${user}.`,
        color: client.colors?.info
      });

      await interaction.reply({ embeds: [embed] });
      
      // Update Topic
      const topic = channel.topic || '';
      await channel.setTopic(`${topic} | 🙋 Claimed by: ${user.tag}`).catch(() => null);
      
      return;
    }

    // ── 🎫 Panel Button / Create Ticket (V3) ──────────────────────────────────
    if (interaction.customId.startsWith('panel_button') || interaction.customId === 'create_ticket' || interaction.customId === 'ticket_create') {
      
      // If NOT a multi-panel button (generic): Show the CATEGORY MENU
      if (interaction.customId === 'create_ticket' || interaction.customId === 'ticket_create') {
        const embed = premiumEmbed(client, {
          title: '🎫  Select a Ticket Category',
          description: 'Please select the category that best fits your issue from the menu below.',
          color: client.colors?.info
        });

        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type_select')
          .setPlaceholder('🎫  Select a ticket type...')
          .addOptions([
            { label: 'Login Issue', value: 'Login Issue', emoji: '🔐', description: 'Difficulty logging into the server/network.' },
            { label: 'Payment Issue', value: 'Payment Issue', emoji: '💳', description: 'Store, billing, or donation related support.' },
            { label: 'General Support', value: 'General Support', emoji: '⚙️', description: 'Basic questions or common issues.' },
            { label: 'Other', value: 'Other', emoji: '🔘', description: 'Custom problem not listed above.' }
          ]);

        return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], flags: 64 });
      }

      // If it IS a multi-panel button: Already has category, show Modal directly
      let panelId  = 'default';
      let catValue = 'General Support';
      if (interaction.customId.includes(':')) {
        const parts = interaction.customId.split(':');
        panelId  = parts[1];
        catValue = parts[2];
      }

      const modal = new ModalBuilder()
        .setCustomId(`ticket_create_modal:${panelId}:${catValue}`)
        .setTitle(`🎫  Open a Support Ticket`);

      const reasonInput = new TextInputBuilder()
        .setCustomId('ticket_reason')
        .setLabel('Primary Reason / Issue Details')
        .setPlaceholder('Describe exactly what you need help with (e.g. login error code, store ID, etc.)')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(1000)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return await interaction.showModal(modal);
    }

    // ── ⭐ Rating Handler ───────────────────────────────────────────────────
    if (interaction.customId.startsWith('rating_')) {
      const parts = interaction.customId.split('_'); // rating_N_staffId_guildId
      const rating = parseInt(parts[1]);
      const staffId = parts[2];
      const gId     = parts[3];

      await ratingService.processRating(db, gId, staffId, user.id, rating);

      const embed = premiumEmbed(client, {
        title: '⭐  Thank You!',
        description: `Your rating of **${rating} ★** has been recorded. We appreciate your feedback!`,
        color: ratingService.COLORS[rating - 1]
      });

      return interaction.update({ embeds: [embed], components: [] });
    }

    // ── ✖️ Cancel action ──────────────────────────────────────────────────────
    if (interaction.customId === 'dont_do') {
      return interaction.update({
        embeds: [premiumEmbed(client, { title: '✖️  Action Cancelled', description: 'The current process has been aborted.', color: client.colors?.neutral })],
        components: []
      });
    }

  } catch (e) {
    console.error('[Button Handler Error]', e);
    return errorMessage(client, interaction, 'An unexpected error occurred in the interaction handler.');
  }
};
