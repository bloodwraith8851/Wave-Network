const { 
  ApplicationCommandType, 
  ApplicationCommandOptionType, 
  ChannelType, 
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { 
  premiumEmbed, 
  errorMessage, 
  successMessage, 
  loadingState,
  ticketControlRow 
} = require(`${process.cwd()}/functions/functions`);
const ticketService = require(`${process.cwd()}/services/ticketService`);
const permissionService = require(`${process.cwd()}/services/permissionService`);
const transcriptService = require(`${process.cwd()}/services/transcriptService`);

module.exports = {
  name: 'ticket',
  description: "Master command for managing tickets.",
  category: 'Ticket 🎫',
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: "create",
      description: "Create a new ticket channel manually.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "category", description: "Select a category", type: ApplicationCommandOptionType.String, required: false },
        { name: "reason", description: "The reason for creating this ticket", type: ApplicationCommandOptionType.String, required: false }
      ]
    },
    {
      name: "close",
      description: "Close the current ticket.",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "claim",
      description: "Claim the current ticket.",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "rename",
      description: "Rename the current ticket channel.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "name", description: "New name for the channel", type: ApplicationCommandOptionType.String, required: true }
      ]
    },
    {
      name: "invite",
      description: "Invite a user to this ticket.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "member", description: "Member to invite", type: ApplicationCommandOptionType.User, required: true }
      ]
    },
    {
      name: "transcript",
      description: "Generate a transcript of this ticket.",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "priority",
      description: "Set the priority level of this ticket.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "level",
          description: "Priority level",
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: "🔴 High", value: "high" },
            { name: "🟡 Medium", value: "medium" },
            { name: "🟢 Low", value: "low" }
          ]
        }
      ]
    },
    {
      name: "move",
      description: "Move this ticket to another category.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "category", description: "The new category value/name", type: ApplicationCommandOptionType.String, required: true },
        { name: "panel-id", description: "Optional panel ID if moving between panels", type: ApplicationCommandOptionType.String, required: false }
      ]
    },
    {
      name: "alert",
      description: "Alert staff if you've been waiting for a response.",
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: "stats",
      description: "View real-time statistics for this ticket.",
      type: ApplicationCommandOptionType.Subcommand
    }
  ],

  run: async (client, interaction) => {
    const db = client.db;
    const sub = interaction.options.getSubcommand();
    const { guild, channel, user, member } = interaction;

    // ── 🎫 Validation: Must be in a ticket for most subcommands ──────────────
    const isTicket = await ticketService.isTicketChannel(db, guild, channel);
    if (!isTicket && sub !== 'create') {
      return errorMessage(client, interaction, 'This command can only be used inside a ticket channel.');
    }

    switch (sub) {
      case 'create': {
        await interaction.deferReply({ flags: 64 });
        const category = interaction.options.getString('category') || 'General Support';
        const reason   = interaction.options.getString('reason')   || 'Manual creation by staff/admin.';
        const ticketChannel = await ticketService.createTicket(client, interaction, category, null, reason);
        if (ticketChannel) {
          await successMessage(client, interaction, `Your ticket has been created: ${ticketChannel}`);
        }
        break;
      }

      case 'close': {
        // Trigger the button logic flow manually for consistency
        const isStaff = await permissionService.checkPermission(db, guild, member, 'ticket.close', client.config);
        const ownerId = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
        if (!isStaff.allowed && ownerId !== user.id) {
          return errorMessage(client, interaction, 'You do not have permission to close this ticket.');
        }

        const embed = premiumEmbed(client, {
          title: '🔒  Close Ticket',
          description: 'Are you sure you want to close this ticket? This will restrict access for the user.',
          color: client.colors?.warning
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close').setLabel('Confirm Close').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('dont_do').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        break;
      }

      case 'claim': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.claim', client.config, interaction, errorMessage)) return;
        
        const currentClaim = await db.get(`guild_${guild.id}.ticket.claimed_${channel.id}`);
        if (currentClaim) return errorMessage(client, interaction, `This ticket is already claimed by <@${currentClaim}>.`);

        await db.set(`guild_${guild.id}.ticket.claimed_${channel.id}`, user.id);
        await successMessage(client, interaction, 'You have claimed this ticket.');
        await channel.setTopic(`${channel.topic} | 🙋 Claimed by: ${user.tag}`).catch(() => null);
        break;
      }

      case 'rename': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.rename', client.config, interaction, errorMessage)) return;

        const newNameRaw = interaction.options.getString('name');
        const newName = newNameRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 90);
        
        await loadingState(interaction, `Renaming to \`${newName}\`...`);
        await channel.setName(newName);
        
        const ownerId = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
        if (ownerId) await db.set(`guild_${guild.id}.ticket.name_${ownerId}`, newName);
        
        await successMessage(client, interaction, `Channel renamed to \`${newName}\`.`);
        break;
      }

      case 'invite': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.invite', client.config, interaction, errorMessage)) return;

        const target = interaction.options.getMember('member');
        await channel.permissionOverwrites.create(target, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });

        await successMessage(client, interaction, `${target} has been invited to the ticket.`);
        break;
      }

      case 'transcript': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.transcript', client.config, interaction, errorMessage)) return;

        await loadingState(interaction, 'Generating transcript...');
        await transcriptService.generateAndDeliver(client, channel, member, 'manual');
        await successMessage(client, interaction, 'Transcript has been generated and delivered to your DMs.');
        break;
      }

      case 'priority': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.priority', client.config, interaction, errorMessage)) return;
        
        const level = interaction.options.getString('level');
        await ticketService.setPriority(db, guild.id, channel, level);
        
        const embed = premiumEmbed(client, {
          title: '⚡ Priority Updated',
          description: `This ticket has been marked as **${level.toUpperCase()}** priority.`,
          color: level === 'high' ? '#EF4444' : (level === 'medium' ? '#F59E0B' : '#10B981')
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'move': {
        if (await permissionService.requirePermission(db, guild, member, 'ticket.transfer', client.config, interaction, errorMessage)) return;
        
        const newCat = interaction.options.getString('category');
        const pId    = interaction.options.getString('panel-id');
        
        await loadingState(interaction, `Transferring ticket to \`${newCat}\`...`);
        const success = await ticketService.moveTicket(client, db, guild, channel, newCat, pId);
        
        if (success) {
          await successMessage(client, interaction, `Ticket has been successfully moved to the **${newCat}** department.`);
        } else {
          await errorMessage(client, interaction, 'Failed to move ticket. Ensure the category and panel ID are valid.');
        }
        break;
      }

      case 'alert': {
        // Cooldown for alert
        const lastAlert = await db.get(`guild_${guild.id}.ticket.last_alert_${channel.id}`) || 0;
        const cooldown  = 300000; // 5 minutes
        if (Date.now() - lastAlert < cooldown) {
          const remaining = Math.ceil((cooldown - (Date.now() - lastAlert)) / 60000);
          return errorMessage(client, interaction, `Staff have already been alerted recently. Please wait **${remaining}m**.`);
        }

        const staffRole = await db.get(`guild_${guild.id}.permissions.roles.staff`);
        const modRole   = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
        
        await db.set(`guild_${guild.id}.ticket.last_alert_${channel.id}`, Date.now());
        
        const embed = premiumEmbed(client, {
          title: '🚨  Staff Alert',
          description: `The user is requesting an update on this ticket.\n\n**Requested By:** ${user}`,
          color: '#EF4444'
        });
        
        await channel.send({ content: `${staffRole ? `<@&${staffRole}>` : ''} ${modRole ? `<@&${modRole}>` : ''}`, embeds: [embed] });
        await successMessage(client, interaction, 'Staff have been notified of your request for an update.');
        break;
      }

      case 'stats': {
        const createdAt = await db.get(`guild_${guild.id}.ticket.created_at_${channel.id}`);
        const category  = await db.get(`guild_${guild.id}.ticket.category_${channel.id}`);
        const claimedBy = await db.get(`guild_${guild.id}.ticket.claimed_${channel.id}`);
        const priority  = await db.get(`guild_${guild.id}.ticket.priority_${channel.id}`) || 'MEDIUM';
        
        const durationMs = Date.now() - (createdAt || Date.now());
        const hours = Math.floor(durationMs / 3600000);
        const mins  = Math.floor((durationMs % 3600000) / 60000);

        const embed = premiumEmbed(client, {
          title: '📊 Ticket Statistics',
          fields: [
            { name: '📂 Category', value: `\`${category || 'Unknown'}\``, inline: true },
            { name: '⚡ Priority', value: `\`${priority.toUpperCase()}\``, inline: true },
            { name: '🙋 Claimed By', value: claimedBy ? `<@${claimedBy}>` : '`Unclaimed`', inline: true },
            { name: '🕙 Duration', value: `\`${hours}h ${mins}m\``, inline: true },
            { name: '👤 Owner', value: `<@${user.id}>`, inline: true }
          ],
          color: client.colors?.info
        });
        
        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  }
};
