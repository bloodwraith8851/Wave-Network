/**
 * ticket-add-user.js — /ticket-add-user
 * Adds a member to the current ticket channel.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-add-user',
  description: 'Add a user to the current ticket channel.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'user',
      description: 'The user to add to this ticket.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staff     = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or the **ticket admin role** to use this command.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const target = interaction.options.getMember('user');
    if (!target) return errorMessage(client, interaction, 'Could not find that user in this server.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot add yourself.');

    // Grant permissions
    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    const embed = premiumEmbed(client, {
      title: `📥  User Added to Ticket`,
      description: `${target} has been added to this ticket by ${interaction.user}.`,
      color: '#10B981'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} added ${target.user.tag} to ticket ${interaction.channel.name}.`, 'Ticket Invte People', client.emotes.add);
  }
};
