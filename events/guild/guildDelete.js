const {
  EmbedBuilder,
  ChannelType
} = require('discord.js');
module.exports = async (client, guild) => {
    let Sguild = client.guilds.cache.get(client.config.discord.server_id);
    let channel = Sguild.channels.cache.get(client.config.discord.server_channel_status);
    let owner = await guild.fetchOwner();
    let embed = new EmbedBuilder()
     .setAuthor({
        name: guild.name,
        iconURL: owner.user.displayAvatarURL({ dynamic: true })
     })
     .setDescription(`I have kicked from \`${guild.name}\` and my guilds count is: \`${client.guilds.cache.size}\``)
     .addFields([{
       name: `👑| Owner Tag: `,
       value: `${client.emotes.reply}\`${owner.user.tag}\``,
       inline: true
     },{
       name: `👓| Owner ID: `,
       value: `${client.emotes.reply}\`${owner.user.id}\``,
       inline: true
     },{
       name: `👥| Total Members:`, 
       value: `${client.emotes.reply}\`${guild.members.cache.size}\``, 
       inline: true
     },{
       name: `📬| Server Invite: `,
       value: `${client.emotes.reply}**can't create it :(**`,
       inline: true
     },{
       name: `🆔| Guild ID:`, 
       value: `${client.emotes.reply}**\`${guild.id}\`**`, 
       inline: true
     },{
       name: `📅| Created at:`, 
       value: `${client.emotes.reply}**<t:${Date.parse(guild.createdAt) / 1000}:D> | <t:${Date.parse(guild.createdAt) / 1000}:R>**`, 
       inline: true
     }])
     .setColor(client.colors.none)
     .setThumbnail(guild.iconURL({ dynamic: true }))
     .setFooter({ 
       text: client.user.tag, 
       iconURL: client.user.displayAvatarURL({ dynamic: true })
     })
     .setTimestamp(Date.now())
  
    channel.send({
        embeds: [embed]
    })
}
