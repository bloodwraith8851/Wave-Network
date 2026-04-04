/**
 * botinfo.js — /botinfo
 * Displays detailed bot statistics across ALL shards, uptime, system info.
 * Uses shardUtils for cross-shard totals when ShardingManager is active.
 */
const {
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed }                          = require(`${process.cwd()}/functions/functions`);
const { getTotalGuildCount, getTotalUserCount,
        getAveragePing, getShardCount,
        getCurrentShardId, getShardStats }      = require(`${process.cwd()}/utils/shardUtils`);

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return [
    d > 0       ? `${d}d`       : null,
    h % 24 > 0  ? `${h % 24}h` : null,
    m % 60 > 0  ? `${m % 60}m` : null,
    `${s % 60}s`,
  ].filter(Boolean).join(' ');
}

function asciiPing(ping, max = 400, len = 10) {
  const filled = Math.min(Math.round((ping / max) * len), len);
  return `${'█'.repeat(filled)}${'░'.repeat(len - filled)}`;
}

module.exports = {
  name: 'botinfo',
  description: 'View detailed bot statistics and system info (all shards).',
  category: 'Infos 📊',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    await interaction.deferReply();

    const { heapUsed, rss } = process.memoryUsage();
    const memUsed   = (heapUsed / 1024 / 1024).toFixed(1);
    const memTotal  = (rss      / 1024 / 1024).toFixed(1);
    const uptime    = formatUptime(client.uptime);
    const cmds      = client.commands.size;
    const version   = require(`${process.cwd()}/package.json`).version;
    const djsVer    = require('discord.js').version;

    // ── Cross-shard stats ─────────────────────────────────────────────────
    const [totalGuilds, totalUsers, avgPing, shardStats] = await Promise.all([
      getTotalGuildCount(client),
      getTotalUserCount(client),
      getAveragePing(client),
      getShardStats(client),
    ]);
    const totalShards   = getShardCount(client);
    const currentShardId = getCurrentShardId(client);

    // ── Per-shard table ───────────────────────────────────────────────────
    const shardLines = shardStats.map(s =>
      `\`#${String(s.shardId).padEnd(2)}\` ${s.shardId === currentShardId ? '← you' : '     '} `+
      `ping: \`${s.ping}ms\` ${asciiPing(s.ping)}  guilds: \`${s.guilds}\`  mem: \`${s.mem}MB\``
    ).join('\n') || '*Shard data unavailable*';

    const embed = premiumEmbed(client, {
      title: `🤖  ${client.user.username}  ·  Bot Info`,
      color: '#7C3AED',
    })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields([
        {
          name: '📊  Network',
          value: [
            `> **Total Guilds:** \`${totalGuilds.toLocaleString()}\``,
            `> **Total Users:**  \`${totalUsers.toLocaleString()}\``,
            `> **Channels:**     \`${client.channels.cache.size.toLocaleString()}\``,
            `> **Commands:**     \`${cmds}\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⚙️  System',
          value: [
            `> **Node.js:**       \`${process.version}\``,
            `> **Discord.js:**    \`v${djsVer}\``,
            `> **Platform:**      \`${process.platform} ${process.arch}\``,
            `> **Heap / RSS:**    \`${memUsed} / ${memTotal} MB\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📡  Status',
          value: [
            `> **Uptime:**   \`${uptime}\``,
            `> **Avg Ping:** \`${avgPing}ms\``,
            `> **Shards:**   \`${totalShards}\``,
            `> **Version:**  \`v${version}\``,
          ].join('\n'),
          inline: false,
        },
        {
          name: `🧩  Per-shard Breakdown  ·  ${totalShards} shard${totalShards !== 1 ? 's' : ''}`,
          value: shardLines.slice(0, 1000),
          inline: false,
        },
      ])
      .setFooter({
        text: `Requested by ${interaction.user.tag}  ·  Shard #${currentShardId}  ·  Wave Network`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite Bot').setEmoji('📨').setURL(client.config.discord.invite),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji('💬').setURL(client.config.discord.server_support),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },
};
