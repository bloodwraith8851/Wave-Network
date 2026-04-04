/**
 * away.js — /away
 * Toggle staff away mode — skip in round-robin, notify in tickets.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'away',
  description: 'Toggle your away mode — pauses ticket assignments while away.',
  category: 'Staff 🛡️',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    { name: 'reason', description: 'Away reason (e.g. lunch, off-duty).', type: ApplicationCommandOptionType.String, required: false }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staff     = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staff) return errorMessage(client, interaction, 'Only staff members can toggle away mode.');

    const key      = `guild_${interaction.guild.id}.staff_away_${interaction.user.id}`;
    const isAway   = await db.get(key);
    const newAway  = !isAway;
    const reason   = interaction.options.getString('reason') || 'No reason given';

    if (newAway) {
      await db.set(key, { since: Date.now(), reason });
    } else {
      await db.delete(key);
    }

    const embed = premiumEmbed(client, {
      title: newAway ? `🌙  Away Mode Enabled` : `✅  Back Online`,
      description: newAway
        ? `You are now **away**.\n**Reason:** ${reason}\n\nTickets will not be auto-assigned to you while away.`
        : `You are now **back online**!\nTicket assignments are resumed.`,
      color: newAway ? '#8B5CF6' : '#10B981'
    }).setFooter({ text: `Wave Network  •  Staff Away System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
};
