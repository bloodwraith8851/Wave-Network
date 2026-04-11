const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'blacklist',
  description:     'Manage the server word blacklist / content filter.',
  category:        'Config ⚙️',
  cooldown:        3,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'add',
      description: 'Add a word or phrase to the blacklist.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'word',
        description: 'Word or phrase to block.',
        type:        ApplicationCommandOptionType.String,
        required:    true,
      }],
    },
    {
      name:        'remove',
      description: 'Remove a word or phrase from the blacklist.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'word',
        description: 'Word or phrase to remove.',
        type:        ApplicationCommandOptionType.String,
        required:    true,
      }],
    },
    {
      name:        'list',
      description: 'View all blacklisted words for this server.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'clear',
      description: 'Clear the entire blacklist.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const word = interaction.options.getString('word').toLowerCase().trim();
      if (word.length < 2 || word.length > 100) {
        return errorMessage(client, interaction, 'Word must be 2–100 characters.');
      }

      const list = (await db.get(`guild_${gid}.blacklist.words`)) || [];
      if (list.includes(word)) {
        return errorMessage(client, interaction, `\`${word}\` is already on the blacklist.`);
      }
      if (list.length >= 500) {
        return errorMessage(client, interaction, 'Blacklist is full (max 500 entries). Remove some first.');
      }

      list.push(word);
      await db.set(`guild_${gid}.blacklist.words`, list);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Word Added',
          description: `\`${word}\` has been added to the blacklist.\n\n**Total entries:** ${list.length}/500`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'remove') {
      const word = interaction.options.getString('word').toLowerCase().trim();
      let list = (await db.get(`guild_${gid}.blacklist.words`)) || [];

      if (!list.includes(word)) {
        return errorMessage(client, interaction, `\`${word}\` is not on the blacklist.`);
      }

      list = list.filter(w => w !== word);
      await db.set(`guild_${gid}.blacklist.words`, list);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Word Removed',
          description: `\`${word}\` has been removed from the blacklist.\n\n**Remaining entries:** ${list.length}`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'list') {
      const list = (await db.get(`guild_${gid}.blacklist.words`)) || [];

      if (list.length === 0) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '📋  Blacklist',
            description: 'The blacklist is empty. Use `/blacklist add` to add words.',
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      // Paginate 30 per page, show first page
      const PAGE   = 30;
      const total  = list.length;
      const page1  = list.slice(0, PAGE);
      const hidden = total > PAGE ? `\n\n*...and ${total - PAGE} more entries.*` : '';
      const text   = page1.map(w => `\`${w}\``).join(', ') + hidden;

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       `📋  Blacklist (${total} entries)`,
          description: text,
          color:       '#7C3AED',
        })],
        flags: 64,
      });
    }

    if (sub === 'clear') {
      await db.delete(`guild_${gid}.blacklist.words`);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Blacklist Cleared',
          description: 'All entries have been removed from the blacklist.',
          color:       '#10B981',
        })],
        flags: 64,
      });
    }
  },
};
