/**
 * userinfo.js — /userinfo
 * Shows detailed information about a user or yourself.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType
} = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'userinfo',
  description: 'View detailed information about a user.',
  category: 'Infos 📊',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name: 'user',
      description: 'The user to look up (defaults to yourself).',
      type: ApplicationCommandOptionType.User,
      required: false
    }
  ],

  run: async (client, interaction) => {
    const target = interaction.options.getMember('user') || interaction.member;
    const user   = target.user;

    const roles = target.roles.cache
      .filter(r => r.id !== interaction.guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .slice(0, 10)
      .join(' ') || '`None`';

    const permsMap = [];
    if (target.permissions.has('Administrator'))          permsMap.push('Administrator');
    if (target.permissions.has('ManageGuild'))            permsMap.push('Manage Server');
    if (target.permissions.has('ManageChannels'))         permsMap.push('Manage Channels');
    if (target.permissions.has('ManageRoles'))            permsMap.push('Manage Roles');
    if (target.permissions.has('ManageMessages'))         permsMap.push('Manage Messages');
    if (target.permissions.has('KickMembers'))            permsMap.push('Kick Members');
    if (target.permissions.has('BanMembers'))             permsMap.push('Ban Members');
    if (target.permissions.has('MuteMembers'))            permsMap.push('Mute Members');

    const badges = [];
    if (user.flags?.has('Staff'))                         badges.push('Discord Staff');
    if (user.flags?.has('Partner'))                       badges.push('Partnered Server Owner');
    if (user.flags?.has('HypeSquadOnlineHouse1'))         badges.push('HypeSquad Bravery');
    if (user.flags?.has('HypeSquadOnlineHouse2'))         badges.push('HypeSquad Brilliance');
    if (user.flags?.has('HypeSquadOnlineHouse3'))         badges.push('HypeSquad Balance');
    if (user.flags?.has('PremiumEarlySupporter'))         badges.push('Early Supporter');
    if (user.bot)                                         badges.push('Bot');

    const embed = premiumEmbed(client, {
      title: `👤  ${user.tag}`,
      color: target.displayHexColor !== '#000000' ? target.displayHexColor : '#7C3AED'
    })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: '📋  General',
          value: [
            `> **ID:** \`${user.id}\``,
            `> **Username:** \`${user.username}\``,
            `> **Display Name:** \`${target.displayName}\``,
            `> **Bot:** \`${user.bot ? 'Yes' : 'No'}\``,
            `> **Account Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
          ].join('\n'),
          inline: false
        },
        {
          name: '🏠  Server',
          value: [
            `> **Joined:** <t:${Math.floor(target.joinedTimestamp / 1000)}:R>`,
            `> **Nickname:** \`${target.nickname || 'None'}\``,
            `> **Booster:** \`${target.premiumSinceTimestamp ? 'Yes' : 'No'}\``,
            `> **Top Role:** ${target.roles.highest}`
          ].join('\n'),
          inline: false
        },
        {
          name: `🏷️  Roles (${target.roles.cache.size - 1})`,
          value: roles,
          inline: false
        },
        ...(permsMap.length ? [{
          name: '🔑  Key Permissions',
          value: permsMap.map(p => `\`${p}\``).join(' '),
          inline: false
        }] : []),
        ...(badges.length ? [{
          name: '🏅  Badges',
          value: badges.map(b => `\`${b}\``).join(' '),
          inline: false
        }] : [])
      ])
      .setFooter({
        text: `Requested by ${interaction.user.tag}  •  Wave Network`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      });

    return interaction.reply({ embeds: [embed] });
  }
};
