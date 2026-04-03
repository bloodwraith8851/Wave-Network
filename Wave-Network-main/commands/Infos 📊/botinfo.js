/**
 * botinfo.js — /botinfo
 * Displays detailed bot statistics, uptime, and system info.
 */
const {
  EmbedBuilder,
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return [
    d > 0 ? `${d}d` : null,
    h % 24 > 0 ? `${h % 24}h` : null,
    m % 60 > 0 ? `${m % 60}m` : null,
    `${s % 60}s`
  ].filter(Boolean).join(' ');
}

module.exports = {
  name: 'botinfo',
  description: 'View detailed bot statistics and system info.',
  category: 'Infos 📊',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const { heapUsed, rss } = process.memoryUsage();
    const memUsed  = (heapUsed / 1024 / 1024).toFixed(2);
    const memTotal = (rss / 1024 / 1024).toFixed(2);
    const ping     = client.ws.ping;
    const uptime   = formatUptime(client.uptime);
    const guilds   = client.guilds.cache.size;
    const users    = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
    const channels = client.channels.cache.size;
    const cmds     = client.commands.size;

    const embed = premiumEmbed(client, {
      title: `🤖  ${client.user.username} — Bot Info`,
      color: '#7C3AED'
    })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields([
        {
          name: '📊  General',
          value: [
            `> **Servers:** \`${guilds.toLocaleString()}\``,
            `> **Users:** \`${users.toLocaleString()}\``,
            `> **Channels:** \`${channels.toLocaleString()}\``,
            `> **Commands:** \`${cmds}\``
          ].join('\n'),
          inline: true
        },
        {
          name: '⚙️  System',
          value: [
            `> **Node.js:** \`${process.version}\``,
            `> **Discord.js:** \`v${require('discord.js').version}\``,
            `> **Platform:** \`${process.platform} ${process.arch}\``,
            `> **Memory:** \`${memUsed} MB / ${memTotal} MB\``
          ].join('\n'),
          inline: true
        },
        {
          name: '📡  Status',
          value: [
            `> **Uptime:** \`${uptime}\``,
            `> **Ping:** \`${ping}ms\``,
            `> **Shards:** \`${client.shard ? client.shard.count : 1}\``,
            `> **Version:** \`v${require(`${process.cwd()}/package.json`).version}\``
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({
        text: `Requested by ${interaction.user.tag}  •  Wave Network`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite Bot').setEmoji('📨').setURL(client.config.discord.invite),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji('💬').setURL(client.config.discord.server_support)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  }
};
