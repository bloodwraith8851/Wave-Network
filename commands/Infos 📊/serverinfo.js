/**
 * serverinfo.js — /serverinfo
 * Shows detailed information about the current server.
 */
const {
  EmbedBuilder,
  ApplicationCommandType,
  ChannelType
} = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'serverinfo',
  description: 'View detailed information about this server.',
  category: 'Infos 📊',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const guild = interaction.guild;
    await guild.fetch(); // ensure fresh data

    const owner     = await guild.fetchOwner().catch(() => null);
    const roles     = guild.roles.cache.size - 1; // -1 for @everyone
    const emojis    = guild.emojis.cache.size;
    const textChs   = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChs  = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const catChs    = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
    const totalChs  = guild.channels.cache.size;
    const boosters  = guild.premiumSubscriptionCount || 0;
    const boostTier = guild.premiumTier;

    const verifyMap = ['None', 'Low', 'Medium', 'High', 'Very High'];
    const boostTierMap = { 0: 'None', 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' };

    const embed = premiumEmbed(client, {
      title: `🏠  ${guild.name}`,
      color: '#7C3AED'
    })
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: '📋  General',
          value: [
            `> **ID:** \`${guild.id}\``,
            `> **Owner:** ${owner?.user || 'Unknown'}`,
            `> **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`,
            `> **Verification:** \`${verifyMap[guild.verificationLevel] || 'Unknown'}\``
          ].join('\n'),
          inline: false
        },
        {
          name: '👥  Members',
          value: [
            `> **Total:** \`${guild.memberCount}\``,
            `> **Humans:** \`${guild.members.cache.filter(m => !m.user.bot).size}\``,
            `> **Bots:** \`${guild.members.cache.filter(m => m.user.bot).size}\``
          ].join('\n'),
          inline: true
        },
        {
          name: '💬  Channels',
          value: [
            `> **Total:** \`${totalChs}\``,
            `> **Text:** \`${textChs}\``,
            `> **Voice:** \`${voiceChs}\``,
            `> **Categories:** \`${catChs}\``
          ].join('\n'),
          inline: true
        },
        {
          name: '✨  Other',
          value: [
            `> **Roles:** \`${roles}\``,
            `> **Emojis:** \`${emojis}\``,
            `> **Boosts:** \`${boosters}\` (${boostTierMap[boostTier] || 'None'})`,
          ].join('\n'),
          inline: true
        }
      ])
      .setImage(guild.bannerURL({ size: 1024 }) || null)
      .setFooter({
        text: `Requested by ${interaction.user.tag}  •  Wave Network`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      });

    return interaction.reply({ embeds: [embed] });
  }
};
