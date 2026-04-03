/**
 * announce.js — /announce <message> [channel] [ping]
 * Post a rich announcement embed to a target channel.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'announce',
  description: 'Post a rich announcement to a channel.',
  category: 'Community 🌐',
  cooldown: 10,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'MentionEveryone'],
  options: [
    { name: 'message', description: 'The announcement content.', type: ApplicationCommandOptionType.String, required: true },
    { name: 'channel', description: 'Channel to post in (defaults to current).', type: ApplicationCommandOptionType.Channel, required: false },
    {
      name: 'ping',
      description: 'Who to mention.',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: 'No ping', value: 'none' },
        { name: '@everyone', value: '@everyone' },
        { name: '@here', value: '@here' }
      ]
    },
    { name: 'color', description: 'Embed color hex (e.g. #FF0000).', type: ApplicationCommandOptionType.String, required: false },
    { name: 'image', description: 'Image URL to attach to announcement.', type: ApplicationCommandOptionType.String, required: false }
  ],

  run: async (client, interaction) => {
    const content   = interaction.options.getString('message');
    const target    = interaction.options.getChannel('channel') || interaction.channel;
    const ping      = interaction.options.getString('ping') || 'none';
    const colorHex  = interaction.options.getString('color') || '#7C3AED';
    const image     = interaction.options.getString('image');

    if (!target.permissionsFor(interaction.guild.members.me)?.has('SendMessages')) {
      return errorMessage(client, interaction, `I don't have permission to send messages in ${target}.`);
    }

    const embed = premiumEmbed(client, {
      title: `📢  Announcement`,
      description: content,
      color: /^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#7C3AED'
    })
      .setAuthor({ name: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setFooter({ text: `${interaction.guild.name}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    if (image) embed.setImage(image);

    const pingContent = ping === 'none' ? null : ping;

    await target.send({ content: pingContent, embeds: [embed] });
    await interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Announcement Posted', description: `Successfully posted in ${target}!`, color: '#10B981' })], ephemeral: true });
  }
};
