/**
 * ticket-transfer.js — /ticket-transfer
 * Transfer a ticket to another staff member.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  PermissionsBitField
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-transfer',
  description: 'Transfer this ticket to another staff member.',
  category: 'Staff 🛡️',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  options: [
    {
      name: 'staff',
      description: 'Staff member to transfer the ticket to.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staffCheck = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staffCheck) return errorMessage(client, interaction, 'You need **Manage Channels** or the **ticket admin role** to transfer tickets.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const target = interaction.options.getMember('staff');
    if (!target) return errorMessage(client, interaction, 'That user is not in this server.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot transfer the ticket to yourself.');

    const targetIsStaff = await isStaff(db, interaction.guild, target, adminRole);
    if (!targetIsStaff) return errorMessage(client, interaction, `${target} is not a staff member (needs **Manage Channels** or the admin role).`);

    // Grant the new staff member access
    await interaction.channel.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    // Update claim
    await db.set(`guild_${interaction.guild.id}.ticket.claimed_${interaction.channel.id}`, target.id);

    // Update channel topic
    const currentTopic = interaction.channel.topic || '';
    const stripped     = currentTopic.replace(/\s*\|\s*🙋 Claimed by: [^|]+/g, '');
    await interaction.channel.setTopic(`${stripped}  |  🙋 Claimed by: ${target.user.tag}`).catch(() => null);

    const embed = premiumEmbed(client, {
      title: `🔄  Ticket Transferred`,
      description: `This ticket has been transferred from ${interaction.user} → ${target}.\n\n${target}, this ticket is now assigned to you!`,
      color: '#F59E0B'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} transferred ticket ${interaction.channel.name} to ${target.user.tag}.`, 'Ticket Renamed', client.emotes.setting);
  }
};
