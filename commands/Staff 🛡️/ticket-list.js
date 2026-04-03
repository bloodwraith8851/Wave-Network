/**
 * ticket-list.js — /ticket-list
 * Lists all currently open tickets in the server.
 */
const {
  ApplicationCommandType,
  PermissionsBitField,
  ChannelType
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'ticket-list',
  description: 'List all currently open tickets in this server.',
  category: 'Staff 🛡️',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const db        = client.db;
    const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
    const staff     = await isStaff(db, interaction.guild, interaction.member, adminRole);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or the **ticket admin role** to list tickets.');

    await interaction.deferReply({ ephemeral: true });

    // Find all ticket channels
    const ticketChannels = interaction.guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText && c.name.startsWith('ticket-')
    );

    if (ticketChannels.size === 0) {
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: `🎫  Open Tickets`,
          description: '`No open tickets right now.` Everything is clear! ✅',
          color: '#10B981'
        })]
      });
    }

    // Build list with DB info
    const lines = [];
    for (const [, ch] of ticketChannels) {
      const ownerId  = await db.get(`guild_${interaction.guild.id}.ticket.control_${ch.id}`);
      const category = await db.get(`guild_${interaction.guild.id}.ticket.category_${ch.id}`);
      const priority = await db.get(`guild_${interaction.guild.id}.ticket.priority_${ch.id}`);
      const claimed  = await db.get(`guild_${interaction.guild.id}.ticket.claimed_${ch.id}`);
      const createdAt = await db.get(`guild_${interaction.guild.id}.ticket.created_at_${ch.id}`);

      const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[priority] || '⚪';
      const claimedStr    = claimed ? ` — 🙋 <@${claimed}>` : '';
      const timeStr       = createdAt ? ` — <t:${Math.floor(createdAt / 1000)}:R>` : '';

      lines.push(`${priorityEmoji} ${ch} [\`${ch.name}\`]${ownerId ? ` by <@${ownerId}>` : ''}${claimedStr} • \`${category || 'Unknown'}\`${timeStr}`);
    }

    // Split into chunks of 10
    const chunks = [];
    for (let i = 0; i < lines.length; i += 10) chunks.push(lines.slice(i, i + 10));

    const embed = premiumEmbed(client, {
      title: `🎫  Open Tickets — ${ticketChannels.size}`,
      description: chunks[0].join('\n'),
      color: '#7C3AED'
    })
      .setFooter({
        text: `${ticketChannels.size} open ticket(s)  •  Wave Network`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      });

    return interaction.editReply({ embeds: [embed] });
  }
};
