/**
 * ping.js — /ping
 * Shows current shard WS latency, API round-trip, and cross-shard average.
 */
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ApplicationCommandType,
} = require('discord.js');
const { getAveragePing, getCurrentShardId, getShardCount } = require(`${process.cwd()}/utils/shardUtils`);

function pingColor(ms) {
  if (ms < 100)  return '#10B981'; // green
  if (ms < 250)  return '#F59E0B'; // yellow
  return '#EF4444';                // red
}

function pingLabel(ms) {
  if (ms < 100)  return '🟢 Excellent';
  if (ms < 200)  return '🟢 Good';
  if (ms < 350)  return '🟡 Acceptable';
  if (ms < 500)  return '🟠 High';
  return '🔴 Critical';
}

module.exports = {
  name: 'ping',
  description: 'Check bot latency — API round-trip, WebSocket, and cross-shard average.',
  category: 'Infos 📊',
  type: ApplicationCommandType.ChatInput,
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const sentAt     = Date.now();
    const wsPing     = client.ws.ping;
    const shardId    = getCurrentShardId(client);
    const totalShards = getShardCount(client);

    // First reply to get API round-trip time
    await interaction.reply({ embeds: [new EmbedBuilder().setColor('#6B7280').setDescription('`🏓 Measuring…`')], ephemeral: true });

    const apiPing  = Date.now() - sentAt;
    const avgPing  = await getAveragePing(client);
    const color    = pingColor(wsPing);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${client.user.username}  ·  Pong! 🏓`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
      .addFields([
        {
          name: '📶  API Round-trip',
          value: `\`${apiPing}ms\`  ${pingLabel(apiPing)}`,
          inline: true,
        },
        {
          name: '🌐  WebSocket (this shard)',
          value: `\`${wsPing}ms\`  ${pingLabel(wsPing)}`,
          inline: true,
        },
        {
          name: '🧩  Cross-shard Average',
          value: totalShards > 1
            ? `\`${avgPing}ms\`  ${pingLabel(avgPing)}  ·  ${totalShards} shards`
            : `*Standalone mode — 1 shard*`,
          inline: false,
        },
      ])
      .setFooter({ text: `Shard #${shardId}  ·  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pong_done')
        .setLabel('Pong!')
        .setEmoji('🏓')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};
