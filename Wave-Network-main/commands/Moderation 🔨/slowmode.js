/**
 * slowmode.js — /slowmode <seconds>
 * Set or disable slowmode in the current or target channel.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'slowmode',
  description: 'Set slowmode in this or another channel.',
  category: 'Moderation 🔨',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageChannels'],
  botPermissions: ['ManageChannels', 'SendMessages', 'EmbedLinks'],
  options: [
    {
      name: 'seconds',
      description: 'Slowmode duration in seconds (0 to disable).',
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: [
        { name: 'Off (0s)', value: 0 },
        { name: '5 seconds', value: 5 },
        { name: '10 seconds', value: 10 },
        { name: '30 seconds', value: 30 },
        { name: '1 minute', value: 60 },
        { name: '5 minutes', value: 300 },
        { name: '10 minutes', value: 600 },
        { name: '1 hour', value: 3600 }
      ]
    },
    {
      name: 'channel',
      description: 'Channel to apply slowmode to (defaults to current).',
      type: ApplicationCommandOptionType.Channel,
      required: false
    }
  ],

  run: async (client, interaction) => {
    const seconds = interaction.options.getInteger('seconds');
    const target  = interaction.options.getChannel('channel') || interaction.channel;

    await target.setRateLimitPerUser(seconds, `Set by ${interaction.user.tag}`).catch(e => {
      return errorMessage(client, interaction, `Failed to set slowmode: ${e.message}`);
    });

    const embed = premiumEmbed(client, {
      title: seconds === 0 ? `✅  Slowmode Disabled` : `🐌  Slowmode Active`,
      description: seconds === 0
        ? `Slowmode has been **disabled** in ${target}.`
        : `Slowmode set to **${seconds}s** in ${target}.\nUsers must wait ${seconds} seconds between messages.`,
      color: seconds === 0 ? '#10B981' : '#F59E0B'
    }).setFooter({ text: `Set by ${interaction.user.tag}  •  Wave Network` });

    return interaction.reply({ embeds: [embed] });
  }
};
