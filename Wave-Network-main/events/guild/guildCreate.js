const {
  EmbedBuilder,
  ChannelType
} = require('discord.js');
module.exports = async (client, guild) => {
  try {
    // Guard: bot's own support server may not be in cache yet
    const Sguild = client.guilds.cache.get(client.config.discord.server_id);
    const channel = Sguild?.channels?.cache?.get(client.config.discord.server_channel_status);

    // Create an invite from any available text channel
    const textChannels = guild.channels.cache.filter(x => x.type === ChannelType.GuildText);
    const firstChannel = textChannels.random(1)?.[0];
    const invite = firstChannel
      ? await firstChannel.createInvite({ maxAge: 0, maxUses: 5 }).catch(() => null)
      : null;

    const owner = await guild.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
     .setAuthor({
        name: guild.name,
        iconURL: owner?.user?.displayAvatarURL({ dynamic: true })
     })
     .setDescription(`I have been added to \`${guild.name}\` — total guilds: \`${client.guilds.cache.size}\``)
     .addFields([{
       name: `👑| Owner Tag: `,
       value: `${client.emotes.reply}\`${owner?.user?.tag || 'Unknown'}\``,
       inline: true
     },{
       name: `👓| Owner ID: `,
       value: `${client.emotes.reply}\`${owner?.user?.id || 'Unknown'}\``,
       inline: true
     },{
       name: `👥| Total Members:`, 
       value: `${client.emotes.reply}\`${guild.memberCount}\``, 
       inline: true
     },{
       name: `📬| Server Invite: `,
       value: `${client.emotes.reply}**${invite ? invite.url : "Can't create invite"}**`,
       inline: true
     },{
       name: `🆔| Guild ID:`, 
       value: `${client.emotes.reply}**\`${guild.id}\`**`, 
       inline: true
     },{
       name: `📅| Created at:`, 
       value: `${client.emotes.reply}**<t:${Math.floor(guild.createdTimestamp / 1000)}:D> | <t:${Math.floor(guild.createdTimestamp / 1000)}:R>**`, 
       inline: true
     }])
     .setColor(client.colors.none)
     .setThumbnail(guild.iconURL({ dynamic: true }))
     .setFooter({ 
       text: client.user.tag, 
       iconURL: client.user.displayAvatarURL({ dynamic: true })
     })
     .setTimestamp();
  
    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (e) {
    console.error('[guildCreate] Error:', e.message);
  }
}
