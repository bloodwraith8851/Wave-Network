/**
 * poll.js — /poll <question> <option1> <option2> [option3] [option4] [option5]
 * Creates a poll with emoji vote reactions.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

const EMOJIS = ['🇦', '🇧', '🇨', '🇩', '🇪'];

module.exports = {
  name: 'poll',
  description: 'Create a poll with up to 5 options.',
  category: 'Community 🌐',
  cooldown: 10,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'AddReactions'],
  options: [
    { name: 'question', description: 'The poll question.', type: ApplicationCommandOptionType.String, required: true },
    { name: 'option1',  description: 'First option.',      type: ApplicationCommandOptionType.String, required: true },
    { name: 'option2',  description: 'Second option.',     type: ApplicationCommandOptionType.String, required: true },
    { name: 'option3',  description: 'Third option.',      type: ApplicationCommandOptionType.String, required: false },
    { name: 'option4',  description: 'Fourth option.',     type: ApplicationCommandOptionType.String, required: false },
    { name: 'option5',  description: 'Fifth option.',      type: ApplicationCommandOptionType.String, required: false },
    {
      name: 'duration',
      description: 'How long before the poll closes.',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: '5 minutes', value: '300' },
        { name: '30 minutes', value: '1800' },
        { name: '1 hour', value: '3600' },
        { name: '6 hours', value: '21600' },
        { name: '24 hours', value: '86400' },
        { name: 'No expiry', value: '0' }
      ]
    }
  ],

  run: async (client, interaction) => {
    const question = interaction.options.getString('question');
    const duration = parseInt(interaction.options.getString('duration') || '0');

    const options = [
      interaction.options.getString('option1'),
      interaction.options.getString('option2'),
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
      interaction.options.getString('option5')
    ].filter(Boolean);

    const optionLines = options.map((opt, i) => `${EMOJIS[i]}  ${opt}`).join('\n');
    const expiry = duration > 0 ? `\n\n🕐 **Closes in:** <t:${Math.floor((Date.now() + duration * 1000) / 1000)}:R>` : '';

    const embed = premiumEmbed(client, {
      title: `📊  ${question}`,
      description: optionLines + expiry,
      color: '#7C3AED'
    })
      .setAuthor({ name: `Poll by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setFooter({ text: `Vote using the reactions below  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();

    // Add reactions
    for (let i = 0; i < options.length; i++) {
      await msg.react(EMOJIS[i]).catch(() => null);
    }

    // Auto-close if duration set
    if (duration > 0) {
      setTimeout(async () => {
        const fresh = await msg.fetch().catch(() => null);
        if (!fresh) return;
        const results = options.map((opt, i) => {
          const count = (fresh.reactions.cache.get(EMOJIS[i])?.count || 1) - 1;
          return `${EMOJIS[i]}  **${opt}** — \`${count} votes\``;
        }).join('\n');

        const resultEmbed = premiumEmbed(client, {
          title: `📊  Poll Closed — Results`,
          description: `**${question}**\n\n${results}`,
          color: '#10B981'
        }).setFooter({ text: `Poll by ${interaction.user.tag}  •  Wave Network` }).setTimestamp();

        await fresh.edit({ embeds: [resultEmbed] }).catch(() => null);
        await fresh.reactions.removeAll().catch(() => null);
      }, duration * 1000);
    }
  }
};
