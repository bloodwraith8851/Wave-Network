/**
 * events/button/interactionCreate.js
 * Handles ALL button interactions for the ticket system.
 * Preserved: all original button IDs and behaviours.
 * New: premium embeds, transcript service, analytics tracking.
 */
const {
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputStyle,
  TextInputBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  errorMessage,
  logMessage,
  premiumEmbed,
  ticketControlRow
} = require(`${process.cwd()}/functions/functions`);
const transcriptService = require(`${process.cwd()}/services/transcriptService`);
const analyticsService  = require(`${process.cwd()}/services/analyticsService`);
const cache             = require(`${process.cwd()}/services/cacheService`);

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;

    const db            = client.db;
    const guildId       = interaction.guild.id;
    const userId        = interaction.user.id;
    const channelId     = interaction.channel.id;

    const [
      ticketName,
      log,
      admin_role,
      mod_role,
      staff_role,
      ticket_menu_opt,
      ticket_menu_has,
      ticket_control
    ] = await Promise.all([
      db.get(`guild_${guildId}.ticket.name_${userId}`),
      cache.get(client, guildId, 'modlog'),
      cache.get(client, guildId, 'ticket.admin_role'),
      cache.get(client, guildId, 'permissions.roles.moderator'),
      cache.get(client, guildId, 'permissions.roles.staff'),
      db.get(`guild_${guildId}.ticket.menu_option`),
      db.has(`guild_${guildId}.ticket.menu_option`),
      db.get(`guild_${guildId}.ticket.control_${channelId}`)
    ]);

    const logsChannel = log ? interaction.guild.channels.cache.get(log) : null;

    // ── Staff permission helper ──────────────────────────────────────────────
    const isStaff = () =>
      (admin_role && interaction.member.roles.cache.has(admin_role)) ||
      (mod_role && interaction.member.roles.cache.has(mod_role)) ||
      (staff_role && interaction.member.roles.cache.has(staff_role)) ||
      interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

    // ── Channel permission sets ──────────────────────────────────────────────
    const buildPerms = (type) => {
      const perms = {
        close: [
          { id: ticket_control, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
        ],
        open: [
          { id: ticket_control, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
        ],
        invite: [
          { id: ticket_control, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
          { id: null, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] }, // new_member placeholder
          { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
        ]
      };
      if (admin_role) {
        perms.close.push({ id: admin_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.open.push({ id: admin_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.invite.push({ id: admin_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
      }
      if (mod_role && mod_role !== admin_role) {
        perms.close.push({ id: mod_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.open.push({ id: mod_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.invite.push({ id: mod_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
      }
      if (staff_role && staff_role !== admin_role && staff_role !== mod_role) {
        perms.close.push({ id: staff_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.open.push({ id: staff_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
        perms.invite.push({ id: staff_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });
      }
      return perms[type] || [];
    };

    // ─────────────────────────────────────────────────────────────────────────
    // ⭐ RATING BUTTONS (from DM after ticket close)
    // ─────────────────────────────────────────────────────────────────────────
    if (interaction.customId.startsWith('rating_')) {
      const parts   = interaction.customId.split('_'); // rating_<n>_<staffId>_<guildId>
      const rating  = parseInt(parts[1]);
      const staffId = parts[2];
      const gid     = parts[3];
      const ratingService = require(`${process.cwd()}/services/ratingService`);
      const saved = await ratingService.processRating(db, gid, staffId, userId, rating);
      const stars = ratingService.STARS[rating - 1];
      const label = ratingService.LABELS[rating - 1];
      const color = ratingService.COLORS[rating - 1];
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(color).setTitle(`${stars}  Thank You!`).setDescription(`You rated your support experience **${rating}/5 — ${label}**.\n\nYour feedback has been recorded!`).setFooter({ text: 'Wave Network  •  Rating System' }).setTimestamp()],
        components: []
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 💡 SUGGESTION BUTTONS (upvote, downvote, approve, deny)
    // ─────────────────────────────────────────────────────────────────────────
    if (interaction.customId.startsWith('suggest_')) {
      const parts  = interaction.customId.split('_'); // suggest_<action>_<id>
      const action = parts[1];
      const sugId  = parseInt(parts[2]);
      const data   = await db.get(`guild_${guildId}.suggest_${sugId}`);
      if (!data) return interaction.reply({ content: '❌ Suggestion not found.', flags: 64 });

      if (action === 'up' || action === 'down') {
        const key = action === 'up' ? 'upvotes' : 'downvotes';
        const other = action === 'up' ? 'downvotes' : 'upvotes';
        if (data[key].includes(userId)) return interaction.reply({ content: '❌ You already voted!', flags: 64 });
        data[key].push(userId);
        data[other] = data[other].filter(id => id !== userId);
        await db.set(`guild_${guildId}.suggest_${sugId}`, data);

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.spliceFields(0, 3,
          { name: '👍  Upvotes',   value: `\`${data.upvotes.length}\``,   inline: true },
          { name: '👎  Downvotes', value: `\`${data.downvotes.length}\``, inline: true },
          { name: '📊  Status',    value: `\`${data.status.charAt(0).toUpperCase() + data.status.slice(1)}\``, inline: true }
        );
        return interaction.update({ embeds: [embed] });
      }

      // Approve / Deny — staff only
      const adminRole = await db.get(`guild_${guildId}.ticket.admin_role`);
      const isAdmin   = (adminRole && interaction.member.roles.cache.has(adminRole)) || interaction.member.permissions.has('ManageMessages');
      if (!isAdmin) return interaction.reply({ content: '❌ Only staff can approve/deny suggestions.', flags: 64 });

      data.status = action === 'approve' ? 'approved' : 'denied';
      await db.set(`guild_${guildId}.suggest_${sugId}`, data);

      const color = action === 'approve' ? 0x10B981 : 0xEF4444;
      const label = action === 'approve' ? '✅ Approved' : '❌ Denied';
      const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(color);
      embed.spliceFields(2, 1, { name: '📊  Status', value: `\`${label}\``, inline: true });
      return interaction.update({ embeds: [embed] });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔲 PREMIUM / MISC BUTTONS
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'premium') {
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: `${client.emotes.premium}  Premium Info`, description: `Premium features are **enabled** on this bot.\n\nIncludes: Advanced Panels, Analytics, Anti-Abuse, Auto-Reply, Priority Tags and more!`, color: '#F59E0B' })],
        flags: 64
      });
    }

    if (interaction.customId === 'cancel' || interaction.customId === 'dont_do') {
      return interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.x}  Process Cancelled`,
          description: `The action has been cancelled. Nothing was changed.`,
          color: '#6B7280'
        }).setAuthor({ name: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
         .setFooter({ text: `Cancelled  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Cancelled').setCustomId('dont_close').setEmoji(client.emotes.x).setDisabled(true)
        )]
      });
    }

    if (interaction.customId === 'report') {
      const modal = new ModalBuilder()
        .setCustomId('reporting')
        .setTitle('📣  Report a Bug or Issue')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('report')
              .setLabel('What do you want to report?')
              .setRequired(true)
              .setPlaceholder('Describe the bug or issue in detail...')
              .setStyle(TextInputStyle.Paragraph)
          )
        );
      return interaction.showModal(modal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🎫 TICKET CREATION BUTTONS (legacy create / create_ticket)
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'create') {
      // ticket already open?
      if (interaction.guild.channels.cache.find(x => x.name === ticketName)) {
        return errorMessage(client, interaction, `You already have an open ticket: ${interaction.guild.channels.cache.find(x => x.name === ticketName)}.`);
      }
      // Show category menu
      const options = ticket_menu_has
        ? ticket_menu_opt
        : [
            { label: 'Login Issue', value: 'Login_Issue', emoji: client.emotes.tickets },
            { label: 'Payment Issue', value: 'Payment_Issue', emoji: client.emotes.tickets },
            { label: 'Bug Report', value: 'Bug_Report', emoji: client.emotes.tickets },
            { label: 'Ban Appeal', value: 'Ban_Appeal', emoji: client.emotes.tickets },
            { label: 'Other', value: 'Other_Issue', emoji: client.emotes.tickets }
          ];
      return interaction.update({
        content: '',
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.tickets}  Select Ticket Category`,
          description: 'Please select a category for your ticket from the menu below.',
          color: '#7C3AED'
        })],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setPlaceholder(`${client.emotes.ticket}  Select Your Ticket Category`)
              .setOptions(options)
              .setMinValues(1).setMaxValues(1)
              .setCustomId('ticket_menu')
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Cancel').setCustomId('dont_do').setEmoji(client.emotes.x),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji(client.emotes.help).setURL(client.config.discord.server_support)
          )
        ]
      });
    }

    if (interaction.customId === 'create_ticket') {
      if (interaction.guild.channels.cache.find(x => x.name === ticketName)) {
        return errorMessage(client, interaction, `You already have an open ticket: ${interaction.guild.channels.cache.find(x => x.name === ticketName)}.`);
      }
      const options = ticket_menu_has
        ? ticket_menu_opt
        : [
            { label: 'Login Issue', value: 'Login_Issue', emoji: client.emotes.tickets },
            { label: 'Payment Issue', value: 'Payment_Issue', emoji: client.emotes.tickets },
            { label: 'Bug Report', value: 'Bug_Report', emoji: client.emotes.tickets },
            { label: 'Ban Appeal', value: 'Ban_Appeal', emoji: client.emotes.tickets },
            { label: 'Other', value: 'Other_Issue', emoji: client.emotes.tickets }
          ];
      return interaction.reply({
        content: '',
        flags: 64,
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.tickets}  Select Ticket Category`,
          description: 'Please select a category for your ticket from the menu below.',
          color: '#7C3AED'
        })],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setPlaceholder(`${client.emotes.ticket}  Select Your Ticket Category`)
              .setOptions(options)
              .setMinValues(1).setMaxValues(1)
              .setCustomId('ticket_menu')
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Cancel').setCustomId('dont_do').setEmoji(client.emotes.x),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji(client.emotes.help).setURL(client.config.discord.server_support)
          )
        ]
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔒 CLOSE TICKET CONFIRMATION BUTTON
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'close') {
      // Show modal with reason + optional message to user
      const modal = new ModalBuilder()
        .setCustomId('close_ticket_modal')
        .setTitle('🔒  Close Ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('close_reason')
              .setLabel('Reason for closing')
              .setPlaceholder('e.g. Issue resolved, No response from user...')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('close_note')
              .setLabel('Message to user (optional)')
              .setPlaceholder('e.g. Feel free to open a new ticket if you need more help!')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
          )
        );
      return interaction.showModal(modal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✅ CONFIRM CLOSE (configTicket)
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'configTicket') {
      await interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.close}  Ticket Closed`,
          description: `This ticket (owner: <@!${ticket_control}>) was closed by <@!${userId}>.\n\nA transcript has been generated and delivered.`,
          color: '#F59E0B'
        }).setAuthor({ name: `Closed by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
         .addFields([{ name: '📋 Reason:', value: '```Closed by staff```' }])
         .setFooter({ text: `Wave Network  •  Ticket System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [
          ticketControlRow({ state: 'closed', disableClose: true })
        ]
      });

      // Set channel perms to closed
      await interaction.channel.permissionOverwrites.set(buildPerms('close'));

      // Analytics
      const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${channelId}`);
      if (createdAt) {
        await analyticsService.trackEvent(db, guildId, 'first_response', {
          responseTime: Date.now() - createdAt,
          staffId: userId
        });
      }
      await analyticsService.trackEvent(db, guildId, 'ticket_closed', {
        staffId:   userId,
        channelId,
        timestamp: Date.now()
      });

      // Transcript
      await transcriptService.generateAndDeliver(client, interaction.channel, interaction.member, 'closed');

      if (logsChannel) logMessage(client, interaction, logsChannel, `${interaction.user.tag} closed <@!${ticket_control}>'s ticket.`, 'Ticket Closed', client.emotes.close);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🗑️ DELETE TICKET FLOW
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'delete') {
      const owner = ticket_control ? `<@${ticket_control}>` : 'Unknown';
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.trash}  Delete Ticket?`,
          description: `Are you sure you want to **permanently delete** this ticket?\n**Owner:** ${owner}\n\nThis action **cannot be undone**.`,
          color: '#EF4444'
        })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId('cancel').setEmoji(client.emotes.x).setLabel("Don't Delete"),
          new ButtonBuilder().setStyle(ButtonStyle.Danger).setCustomId('deleteTicket').setEmoji(client.emotes.trash).setLabel('Delete It')
        )]
      });
    }

    if (interaction.customId === 'deleteTicket') {
      if (!isStaff()) return errorMessage(client, interaction, '```js\nYou do not have permission.\nNeed: "ManageChannels"\n```');

      await interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.trash}  Ticket Deleted`,
          description: `<@!${ticket_control}>'s ticket was deleted by ${interaction.user} <t:${Math.floor((Date.now() + 5000) / 1000)}:R>.`,
          color: '#EF4444'
        }).addFields([{ name: '📋 Reason:', value: '```Deleted by staff```' }])
         .setFooter({ text: `Wave Network  •  Ticket System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Danger).setEmoji(client.emotes.trash).setLabel('Deleting...').setCustomId('deleteTicket').setDisabled(true)
        )]
      });

      // Generate transcript before deletion
      const file = await transcriptService.generateAndDeliver(client, interaction.channel, interaction.member, 'deleted');

      // Analytics
      await analyticsService.trackEvent(db, guildId, 'ticket_deleted', {
        staffId: userId, channelId, timestamp: Date.now()
      });

      if (logsChannel) logMessage(client, interaction, logsChannel, `${interaction.user.tag} deleted <@!${ticket_control}>'s ticket.`, 'Ticket Deleted', client.emotes.trash, !!file, file);

      // Cleanup DB & delete channel
      setTimeout(async () => {
        await interaction.channel.delete().catch(() => null);
        await db.delete(`guild_${guildId}.ticket.name_${ticket_control}`);
        await db.delete(`guild_${guildId}.ticket.control_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.category_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.created_at_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.priority_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.panel_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.new_member_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.rename_${channelId}`);
        await db.delete(`guild_${guildId}.ticket.message_${channelId}`);
      }, 5000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 🔓 OPEN / REOPEN
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'open') {
      const owner = ticket_control ? `<@${ticket_control}>` : 'Unknown';
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.open}  Re-open Ticket?`,
          description: `Are you sure you want to re-open ${owner}'s ticket?`,
          color: '#10B981'
        })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Danger).setCustomId('cancel').setEmoji(client.emotes.x).setLabel("Don't Open"),
          new ButtonBuilder().setStyle(ButtonStyle.Success).setCustomId('reopenTicket').setEmoji(client.emotes.open).setLabel('Open It')
        )]
      });
    }

    if (interaction.customId === 'reopenTicket') {
      if (!isStaff()) return errorMessage(client, interaction, '```js\nYou do not have permission.\nNeed: "ManageChannels"\n```');
      await interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.open}  Ticket Re-opened`,
          description: `<@!${ticket_control}>'s ticket was re-opened by <@!${userId}>.`,
          color: '#10B981'
        }).addFields([{ name: '📋 Reason:', value: '```Re-opened by staff```' }])
         .setFooter({ text: `Wave Network  •  Ticket System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [ticketControlRow({ state: 'open', disableOpen: true })]
      });
      await interaction.channel.permissionOverwrites.set(buildPerms('open'));
      if (logsChannel) logMessage(client, interaction, logsChannel, `${interaction.user.tag} re-opened <@!${ticket_control}>'s ticket.`, 'Ticket Opened', client.emotes.open);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ✏️ RENAME (legacy confirmation button)
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'renameTicketTrue') {
      if (!isStaff()) return errorMessage(client, interaction, '```js\nYou do not have permission.\nNeed: "ManageChannels"\n```');
      const newName = await db.get(`guild_${guildId}.ticket.rename_${channelId}`);
      if (!newName) return errorMessage(client, interaction, 'Rename data expired. Please re-run `/ticket rename`.');
      await interaction.channel.setName(newName);
      await db.set(`guild_${guildId}.ticket.name_${ticket_control}`, newName);
      await interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.rename}  Ticket Renamed`,
          description: `Channel name changed to \`${newName}\` by ${interaction.user}.`,
          color: '#8B5CF6'
        }).setAuthor({ name: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
         .setFooter({ text: `Wave Network  •  Ticket System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Success).setEmoji(client.emotes.rename).setLabel('Renamed').setCustomId('renameTicketTrue').setDisabled(true)
        )]
      });
      if (logsChannel) logMessage(client, interaction, logsChannel, `${interaction.user.tag} renamed ticket to \`${newName}\`.`, 'Ticket Renamed', client.emotes.rename);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 👤 ADD MEMBER (legacy)
    // ─────────────────────────────────────────────────────────────────────────

    if (interaction.customId === 'addmemberTicket') {
      if (!isStaff()) return errorMessage(client, interaction, '```js\nYou do not have permission.\nNeed: "ManageChannels"\n```');
      const newMemberId = await db.get(`guild_${guildId}.ticket.new_member_${channelId}`);
      if (!newMemberId) return errorMessage(client, interaction, 'Session expired. Please re-run `/ticket invite`.');

      const invitePerms = [
        { id: ticket_control, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
        { id: newMemberId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
      ];
      if (admin_role) invitePerms.push({ id: admin_role, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] });

      await interaction.channel.permissionOverwrites.set(invitePerms);
      const txt = `<@${newMemberId}>`;
      await interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.plus}  Member Added`,
          description: `${txt} was added to this ticket by ${interaction.user}.`,
          color: '#06B6D4'
        }).setAuthor({ name: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
         .setFooter({ text: `Wave Network  •  Ticket System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Success).setEmoji(client.emotes.plus).setLabel('Member Added').setCustomId('addmemberTicket').setDisabled(true)
        )]
      });
      if (logsChannel) logMessage(client, interaction, logsChannel, `${interaction.user.tag} added ${txt} to ticket.`, 'Ticket Invte People', client.emotes.plus);
    }

    if (interaction.customId.startsWith('delete_note_list_')) {
      const targetUserId = interaction.customId.split('_').slice(-1)[0];
      const targetUser   = await client.users.fetch(targetUserId).catch(() => null);
      if (!isStaff()) return errorMessage(client, interaction, '```js\nYou do not have permission.\nNeed: "ManageChannels"\n```');

      const notes = await db.get(`guild_${guildId}.user_notes_${targetUserId}`) || [];
      if (!notes.length) return interaction.reply({ content: '❌ No notes found for this user.', flags: 64 });

      const options = notes.map((n, i) => ({
        label: `Note #${i + 1} (${n.moderatorTag})`,
        description: n.text.slice(0, 50),
        value: `${targetUserId}_${i}` // targetUserId_index
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('delete_note_confirm')
        .setPlaceholder('Select a note to delete...')
        .setOptions(options.slice(0, 25));

      return interaction.reply({
        content: `Select which note you want to delete for **${targetUser?.tag || targetUserId}**:`,
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: 64
      });
    }

    if (interaction.customId === 'canceladdmemberTicket') {
      await db.delete(`guild_${guildId}.ticket.new_member_${channelId}`);
      return interaction.update({
        embeds: [premiumEmbed(client, {
          title: `${client.emotes.x}  Add Member Cancelled`,
          description: 'The add-member action was cancelled.',
          color: '#6B7280'
        }).setAuthor({ name: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
         .setFooter({ text: `Cancelled  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Cancelled').setCustomId('dont_close').setEmoji(client.emotes.x).setDisabled(true)
        )]
      });
    }

  } catch (e) {
    console.error('[Button Handler]', e);
  }
};
