/**
 * ticket-forward.js — /ticket-forward command
 * Re-route a ticket to a different category channel.
 *
 * Moves the ticket channel to the new category and updates permissions.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ChannelType,
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'ticket-forward',
  description: 'Forward this ticket to a different category/department.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'category',
      description: 'The category channel to forward this ticket to.',
      type: ApplicationCommandOptionType.Channel,
      required: true,
      // channelTypes filtered in handler for better UX
    },
    {
      name: 'reason',
      description: 'Reason for forwarding (optional).',
      type: ApplicationCommandOptionType.String,
      required: false,
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;

    // Must be inside a ticket
    const ownerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    if (!ownerId) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'ticket.forward', client.config, interaction, errorMessage);
    if (denied) return;

    const targetCategory = interaction.options.getChannel('category');
    const reason         = interaction.options.getString('reason') || 'No reason provided';

    if (targetCategory.type !== ChannelType.GuildCategory) {
      return errorMessage(client, interaction, 'You must select a **category** (not a text/voice channel).');
    }

    if (interaction.channel.parentId === targetCategory.id) {
      return errorMessage(client, interaction, `This ticket is already in **${targetCategory.name}**.`);
    }

    const oldCategoryName = interaction.channel.parent?.name || 'Unknown';
    await interaction.channel.setParent(targetCategory.id, { lockPermissions: false });

    // Update category in DB
    await db.set(`guild_${guildId}.ticket.category_${channelId}`, targetCategory.name);

    await auditSvc.log(db, guildId, interaction.user.id, 'ticket.forward', {
      channelId,
      from: oldCategoryName,
      to: targetCategory.name,
      reason,
    });

    const embed = premiumEmbed(client, {
      title: '📤  Ticket Forwarded',
      description: [
        `This ticket has been forwarded to **${targetCategory.name}**.`,
        ``,
        `**From:** \`${oldCategoryName}\``,
        `**To:** \`${targetCategory.name}\``,
        `**By:** ${interaction.user}`,
        `**Reason:** ${reason}`,
      ].join('\n'),
      color: '#3B82F6',
    })
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setFooter({ text: `Wave Network  •  Ticket Management`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Log to mod log
    const logId = await db.get(`guild_${guildId}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh,
      `${interaction.user.tag} forwarded ticket from \`${oldCategoryName}\` to \`${targetCategory.name}\`. Reason: ${reason}`,
      'Ticket Forwarded', '📤'
    );
  },
};
