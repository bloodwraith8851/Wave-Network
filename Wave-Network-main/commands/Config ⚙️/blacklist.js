/**
 * blacklist.js — /blacklist add|remove|list
 * Manage the keyword blacklist for auto-moderation.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { addKeyword, removeKeyword, getBlacklist } = require(`${process.cwd()}/services/blacklistService`);

module.exports = {
  name: 'blacklist',
  description: 'Manage the keyword blacklist for auto-moderation.',
  category: 'Config ⚙️',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name: 'add',
      description: 'Add a keyword to the blacklist.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'word', description: 'Keyword to block.', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
      name: 'remove',
      description: 'Remove a keyword from the blacklist.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'word', description: 'Keyword to unblock.', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
      name: 'list',
      description: 'View all blacklisted keywords.',
      type: ApplicationCommandOptionType.Subcommand
    }
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'add') {
      const word = interaction.options.getString('word').toLowerCase().trim();
      if (word.length < 2) return errorMessage(client, interaction, 'Keyword must be at least 2 characters.');
      const added = await addKeyword(db, gid, word);
      if (!added) return errorMessage(client, interaction, `\`${word}\` is already in the blacklist.`);
      return interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Keyword Added', description: `\`${word}\` has been added to the blacklist.\nMessages containing this word will be auto-deleted.`, color: '#10B981' })], ephemeral: true });
    }

    if (sub === 'remove') {
      const word    = interaction.options.getString('word').toLowerCase().trim();
      const removed = await removeKeyword(db, gid, word);
      if (!removed) return errorMessage(client, interaction, `\`${word}\` was not in the blacklist.`);
      return interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Keyword Removed', description: `\`${word}\` has been removed from the blacklist.`, color: '#10B981' })], ephemeral: true });
    }

    if (sub === 'list') {
      const list = await getBlacklist(db, gid);
      const embed = premiumEmbed(client, {
        title: `🚫  Blacklisted Keywords (${list.length})`,
        description: list.length
          ? list.map(w => `\`${w}\``).join(', ')
          : '`No keywords blacklisted yet.`',
        color: '#EF4444'
      }).setFooter({ text: `Wave Network  •  Keyword Blacklist`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
