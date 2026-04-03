/**
 * banner.js — /banner [@user]
 */
const { ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'banner',
  description: "View a user's profile banner.",
  category: 'Infos 📊',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [{ name: 'user', description: 'User to view banner of (defaults to yourself).', type: ApplicationCommandOptionType.User, required: false }],

  run: async (client, interaction) => {
    const target = interaction.options.getUser('user') || interaction.user;
    const fetched = await target.fetch().catch(() => null);
    if (!fetched) return errorMessage(client, interaction, 'Could not fetch user data.');

    const banner = fetched.bannerURL({ dynamic: true, size: 4096 });
    if (!banner) {
      const accent = fetched.accentColor ? `#${fetched.accentColor.toString(16).padStart(6, '0')}` : '#7C3AED';
      const embed = premiumEmbed(client, {
        title: `🎨  ${target.tag}'s Banner`,
        description: `This user has no banner set.\n**Profile Color:** \`${accent}\``,
        color: accent
      }).setFooter({ text: `Requested by ${interaction.user.tag}  •  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
      return interaction.reply({ embeds: [embed] });
    }

    const embed = premiumEmbed(client, {
      title: `🎨  ${target.tag}'s Banner`,
      color: '#7C3AED'
    })
      .setImage(banner)
      .setFooter({ text: `Requested by ${interaction.user.tag}  •  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download Banner').setEmoji('⬇️').setURL(banner)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  }
};
