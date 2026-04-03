/**
 * ticket-priority.js — /ticket-priority
 * Sets the priority level of a ticket (high / medium / low).
 * Updates the channel topic prefix and logs the change.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType
} = require('discord.js');
const { premiumEmbed, priorityBadge, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-priority',
  description: 'Set the priority level of this ticket.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'level',
      description: 'Priority level to assign.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: '🔴 High', value: 'high' },
        { name: '🟡 Medium', value: 'medium' },
        { name: '🟢 Low', value: 'low' }
      ]
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staff     = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or the **ticket admin role** to use this command.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const level = interaction.options.getString('level');

    // Store priority
    await db.set(`guild_${interaction.guild.id}.ticket.priority_${interaction.channel.id}`, level);

    // Update channel topic prefix
    const prefixMap = { high: '[🔴 HIGH]', medium: '[🟡 MEDIUM]', low: '[🟢 LOW]' };
    const prefix    = prefixMap[level];
    const existing  = interaction.channel.topic || '';
    // Strip any prior priority prefix
    const stripped  = existing.replace(/^\[🔴 HIGH\]\s*|^\[🟡 MEDIUM\]\s*|^\[🟢 LOW\]\s*/i, '');
    await interaction.channel.setTopic(`${prefix} ${stripped}`.trim().slice(0, 1024)).catch(() => null);

    const embed = premiumEmbed(client, {
      title: `🏷️  Ticket Priority Updated`,
      description: `Priority set to ${priorityBadge(level)} by ${interaction.user}.`,
      color: level === 'high' ? '#EF4444' : level === 'low' ? '#10B981' : '#F59E0B'
    }).setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} set ticket priority to ${level.toUpperCase()} in ${interaction.channel.name}.`, 'Ticket Renamed', client.emotes.setting);
  }
};
