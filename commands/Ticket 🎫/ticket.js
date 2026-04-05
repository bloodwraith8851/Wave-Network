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
        { name: "category", description: "Select a category", type: ApplicationCommandOptionType.String, required: false }
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
        const ticketChannel = await ticketService.createTicket(client, interaction, category);
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
    }
  }
};
