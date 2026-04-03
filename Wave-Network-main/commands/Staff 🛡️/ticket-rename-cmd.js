/**
 * ticket-rename-cmd.js — /ticket-rename
 * Clean direct rename without a broken confirmation flow.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-rename',
  description: 'Rename the current ticket channel.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'name',
      description: 'New name for the ticket channel (no spaces, max 90 chars).',
      type: ApplicationCommandOptionType.String,
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

    const rawName  = interaction.options.getString('name');
    const newName  = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 90);
    if (!newName) return errorMessage(client, interaction, 'Invalid channel name. Use letters, numbers and hyphens only.');

    const oldName = interaction.channel.name;
    await interaction.channel.setName(newName);

    // Update DB entry for the ticket owner lookup
    const ownerId = await db.get(`guild_${interaction.guild.id}.ticket.control_${interaction.channel.id}`);
    if (ownerId) {
      await db.set(`guild_${interaction.guild.id}.ticket.name_${ownerId}`, newName);
    }

    const embed = premiumEmbed(client, {
      title: `✏️  Ticket Renamed`,
      description: `Channel renamed from \`${oldName}\` → \`${newName}\` by ${interaction.user}.`,
      color: '#8B5CF6'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} renamed ticket channel \`${oldName}\` → \`${newName}\`.`, 'Ticket Renamed', client.emotes.rename);
  }
};
