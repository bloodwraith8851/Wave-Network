const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'faq-rules',
  description:     'Manage configurable auto-reply rules for this server.',
  category:        'Config ⚙️',
  cooldown:        3,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'add',
      description: 'Add a keyword trigger + auto-reply response.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'keyword', description: 'Trigger keyword or phrase.',
          type: ApplicationCommandOptionType.String, required: true,
        },
        {
          name: 'response', description: 'Auto-reply message when keyword is detected.',
          type: ApplicationCommandOptionType.String, required: true,
        },
      ],
    },
    {
      name:        'list',
      description: 'List all configured FAQ auto-reply rules.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'remove',
      description: 'Remove a keyword rule.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name: 'keyword', description: 'Keyword to remove.',
        type: ApplicationCommandOptionType.String, required: true,
      }],
    },
    {
      name:        'test',
      description: 'Test what auto-reply a message would trigger.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name: 'message', description: 'Message to test.',
        type: ApplicationCommandOptionType.String, required: true,
      }],
    },
    {
      name:        'clear',
      description: 'Remove all FAQ rules for this server.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const keyword  = interaction.options.getString('keyword').toLowerCase().trim();
      const response = interaction.options.getString('response').trim();

      if (keyword.length  < 2  || keyword.length  > 80)  return errorMessage(client, interaction, 'Keyword must be 2–80 characters.');
      if (response.length < 5  || response.length > 500) return errorMessage(client, interaction, 'Response must be 5–500 characters.');

      const rules = (await db.get(`guild_${gid}.autoReply.customRules`)) || {};
      if (Object.keys(rules).length >= 100) return errorMessage(client, interaction, 'Max 100 rules per server. Remove some first.');

      rules[keyword] = response;
      await db.set(`guild_${gid}.autoReply.customRules`, rules);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Rule Added',
          description: `**Keyword:** \`${keyword}\`\n**Response:** ${response}\n\n**Total rules:** ${Object.keys(rules).length}/100`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'list') {
      const rules = (await db.get(`guild_${gid}.autoReply.customRules`)) || {};
      const entries = Object.entries(rules);

      if (entries.length === 0) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '📋  FAQ Rules',
            description: 'No rules configured. Use `/faq-rules add` to create your first rule.',
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      const PAGE    = 10;
      const display = entries.slice(0, PAGE).map(([k, v], i) =>
        `**${i + 1}.** \`${k}\`\n└ ${v.slice(0, 80)}${v.length > 80 ? '…' : ''}`
      ).join('\n\n');

      const more = entries.length > PAGE ? `\n\n*...and ${entries.length - PAGE} more rules.*` : '';

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       `📋  FAQ Rules (${entries.length} total)`,
          description: display + more,
          color:       '#7C3AED',
        })],
        flags: 64,
      });
    }

    if (sub === 'remove') {
      const keyword = interaction.options.getString('keyword').toLowerCase().trim();
      const rules   = (await db.get(`guild_${gid}.autoReply.customRules`)) || {};

      if (!rules[keyword]) return errorMessage(client, interaction, `No rule found for keyword \`${keyword}\`.`);

      delete rules[keyword];
      await db.set(`guild_${gid}.autoReply.customRules`, rules);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Rule Removed',
          description: `The rule for \`${keyword}\` has been removed.\n**Remaining rules:** ${Object.keys(rules).length}`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'test') {
      const message = interaction.options.getString('message').toLowerCase();
      const rules   = (await db.get(`guild_${gid}.autoReply.customRules`)) || {};

      const match = Object.entries(rules).find(([k]) => message.includes(k));
      if (!match) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '🔍  Test Result',
            description: `**Input:** \`${message.slice(0, 100)}\`\n\n**Result:** No rule matched. This message would not trigger an auto-reply.`,
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Rule Matched',
          description: `**Input:** \`${message.slice(0, 100)}\`\n\n**Matched keyword:** \`${match[0]}\`\n**Auto-reply:** ${match[1]}`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'clear') {
      await db.delete(`guild_${gid}.autoReply.customRules`);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Rules Cleared',
          description: 'All FAQ auto-reply rules have been removed.',
          color:       '#10B981',
        })],
        flags: 64,
      });
    }
  },
};
