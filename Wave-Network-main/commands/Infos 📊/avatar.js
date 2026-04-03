/**
 * avatar.js — /avatar [@user]
 */
const { ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'avatar',
  description: "View a user's avatar in full size.",
  category: 'Infos 📊',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [{ name: 'user', description: 'User to view avatar of (defaults to yourself).', type: ApplicationCommandOptionType.User, required: false }],

  run: async (client, interaction) => {
    const target = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(target.id);
    const serverAvatar = member?.displayAvatarURL({ dynamic: true, size: 4096 });
    const globalAvatar = target.displayAvatarURL({ dynamic: true, size: 4096 });

    const embed = premiumEmbed(client, {
      title: `🖼️  ${target.tag}'s Avatar`,
      color: '#7C3AED'
    })
      .setImage(serverAvatar || globalAvatar)
      .setFooter({ text: `Requested by ${interaction.user.tag}  •  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download (Global)').setEmoji('🌐').setURL(globalAvatar),
      ...(serverAvatar && serverAvatar !== globalAvatar
        ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download (Server)').setEmoji('🏠').setURL(serverAvatar)]
        : [])
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  }
};
