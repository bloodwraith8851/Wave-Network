/**
 * ticket-lock.js — /ticket-lock [reason]
 * Prevent the user from typing in their own ticket (staff-controlled).
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-lock',
  description: 'Lock/unlock the ticket — prevent/allow the owner from typing.',
  category: 'Staff 🛡️',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['ManageChannels', 'SendMessages', 'EmbedLinks'],
  options: [
    { name: 'reason', description: 'Reason for locking the ticket.', type: ApplicationCommandOptionType.String, required: false }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const staff     = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to lock/unlock tickets.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used inside a ticket channel.');

    const ownerId = await db.get(`guild_${interaction.guild.id}.ticket.control_${interaction.channel.id}`);
    if (!ownerId) return errorMessage(client, interaction, 'Could not find the ticket owner.');

    const reason     = interaction.options.getString('reason') || 'No reason provided.';
    const isLocked   = await db.get(`guild_${interaction.guild.id}.ticket.locked_${interaction.channel.id}`);
    const newLocked  = !isLocked;

    await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: !newLocked });
    await db.set(`guild_${interaction.guild.id}.ticket.locked_${interaction.channel.id}`, newLocked);

    const embed = premiumEmbed(client, {
      title: newLocked ? `🔒  Ticket Locked` : `🔓  Ticket Unlocked`,
      description: newLocked
        ? `This ticket has been **locked** by ${interaction.user}.\n**Reason:** ${reason}\n\nThe ticket owner can no longer send messages.`
        : `This ticket has been **unlocked** by ${interaction.user}. The ticket owner can now reply again.`,
      color: newLocked ? '#EF4444' : '#10B981'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    return interaction.reply({ embeds: [embed] });
  }
};
