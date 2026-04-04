/**
 * ticket-tag.js — /ticket-tag command
 * Add, remove, and list labels/tags on the current ticket.
 *
 * DB key: guild_<id>.ticket.tags_<channelId> → string[]
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);

module.exports = {
  name: 'ticket-tag',
  description: 'Add, remove, or list tags on the current ticket channel.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Add a tag to this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'tag', description: 'Tag to add (e.g. urgent, bug, waiting).', type: ApplicationCommandOptionType.String, required: true }],
    },
    {
      name: 'remove',
      description: 'Remove a tag from this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'tag', description: 'Tag to remove.', type: ApplicationCommandOptionType.String, required: true }],
    },
    {
      name: 'list',
      description: 'List all tags on this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const sub       = interaction.options.getSubcommand();
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;

    // Check it's a ticket
    const isTicket = await db.get(`guild_${guildId}.ticket.control_${channelId}`) || interaction.channel.name.startsWith('ticket-');
    if (!isTicket) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    // Require Staff+
    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'ticket.tag', client.config, interaction, errorMessage);
    if (denied) return;

    const key  = `guild_${guildId}.ticket.tags_${channelId}`;
    let tags   = (await db.get(key)) || [];

    if (sub === 'add') {
      const tag = interaction.options.getString('tag').toLowerCase().trim().replace(/\s+/g, '-').slice(0, 30);
      if (!tag) return errorMessage(client, interaction, 'Invalid tag name.');
      if (tags.includes(tag)) return errorMessage(client, interaction, `Tag \`${tag}\` is already on this ticket.`);
      if (tags.length >= 10) return errorMessage(client, interaction, 'Max 10 tags per ticket. Remove one first.');
      tags.push(tag);
      await db.set(key, tags);

      // Update channel topic to show tags
      const topicBase = interaction.channel.topic?.split('|  🏷️')[0].trim() || interaction.channel.topic || '';
      await interaction.channel.setTopic(`${topicBase}  |  🏷️ ${tags.join(' ')}`).catch(() => null);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🏷️  Tag Added',
          description: `Tag \`${tag}\` has been added to this ticket.\n\n**All tags:** ${tags.map(t => `\`${t}\``).join(', ')}`,
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  Ticket Tags`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }

    if (sub === 'remove') {
      const tag = interaction.options.getString('tag').toLowerCase().trim().replace(/\s+/g, '-');
      if (!tags.includes(tag)) return errorMessage(client, interaction, `Tag \`${tag}\` is not on this ticket.`);
      tags = tags.filter(t => t !== tag);
      await db.set(key, tags);

      const topicBase = interaction.channel.topic?.split('|  🏷️')[0].trim() || '';
      const newTopic  = tags.length ? `${topicBase}  |  🏷️ ${tags.join(' ')}` : topicBase;
      await interaction.channel.setTopic(newTopic).catch(() => null);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🏷️  Tag Removed',
          description: `Tag \`${tag}\` has been removed.\n\n**Remaining:** ${tags.length ? tags.map(t => `\`${t}\``).join(', ') : '*None*'}`,
          color: '#EF4444',
        }).setFooter({ text: `Wave Network  •  Ticket Tags`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }

    if (sub === 'list') {
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🏷️  Tags on \`${interaction.channel.name}\``,
          description: tags.length ? tags.map(t => `• \`${t}\``).join('\n') : '*No tags on this ticket.*\n\nUse `/ticket-tag add <tag>` to add one.',
          color: '#7C3AED',
        }).setFooter({ text: `Wave Network  •  Ticket Tags`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
