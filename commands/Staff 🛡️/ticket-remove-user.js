/**
 * ticket-remove-user.js — /ticket-remove-user
 * Removes a member from the current ticket channel.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  PermissionsBitField
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-remove-user',
  description: 'Remove a user from the current ticket channel.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'user',
      description: 'The user to remove from this ticket.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const staff     = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to remove users from tickets.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const target = interaction.options.getMember('user');
    if (!target) return errorMessage(client, interaction, 'Could not find that user in this server.');

    // Protect ticket owner
    const ownerId = await db.get(`guild_${interaction.guild.id}.ticket.control_${interaction.channel.id}`);
    if (target.id === ownerId) return errorMessage(client, interaction, 'You cannot remove the **ticket owner**.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot remove yourself.');

    // Remove channel permission overwrite
    await interaction.channel.permissionOverwrites.delete(target.id).catch(() => null);

    const embed = premiumEmbed(client, {
      title: `📤  User Removed from Ticket`,
      description: `${target} has been removed from this ticket by ${interaction.user}.`,
      color: '#EF4444'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} removed ${target.user.tag} from ticket ${interaction.channel.name}.`, 'Ticket Invte People', client.emotes.trash);
  }
};
