/**
 * ticket-claim.js — /ticket-claim
 * Staff claim a ticket — assigns themselves and notifies the ticket owner.
 */
const {
  ApplicationCommandType,
  PermissionsBitField
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-claim',
  description: 'Claim this ticket — assigns you as the handler.',
  category: 'Staff 🛡️',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staff     = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or the **ticket admin role** to claim tickets.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    // Check if already claimed
    const currentClaim = await db.get(`guild_${interaction.guild.id}.ticket.claimed_${interaction.channel.id}`);
    if (currentClaim && currentClaim !== interaction.user.id) {
      const claimer = interaction.guild.members.cache.get(currentClaim);
      return errorMessage(client, interaction, `This ticket is already claimed by ${claimer || `<@${currentClaim}>`}.`);
    }

    // Set claim
    await db.set(`guild_${interaction.guild.id}.ticket.claimed_${interaction.channel.id}`, interaction.user.id);

    // Update channel topic to show claimer
    const currentTopic = interaction.channel.topic || '';
    const stripped     = currentTopic.replace(/\s*\|\s*🙋 Claimed by: [^|]+/g, '');
    await interaction.channel.setTopic(`${stripped}  |  🙋 Claimed by: ${interaction.user.tag}`.trim().slice(0, 1024)).catch(() => null);

    const ownerId = await db.get(`guild_${interaction.guild.id}.ticket.control_${interaction.channel.id}`);

    const embed = premiumEmbed(client, {
      title: `🙋  Ticket Claimed`,
      description: [
        `${interaction.user} has **claimed** this ticket.`,
        ownerId ? `\n<@${ownerId}> — your ticket is now being handled!` : ''
      ].join(''),
      color: '#10B981'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} claimed ticket ${interaction.channel.name}.`, 'Ticket Opened', client.emotes.add);
  }
};
