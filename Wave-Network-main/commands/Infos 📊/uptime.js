/**
 * uptime.js — /uptime
 * Shows the bot's current uptime and ping.
 */
const { ApplicationCommandType } = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days)    parts.push(`${days}d`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

module.exports = {
  name: 'uptime',
  description: 'Check the bot\'s uptime and current ping.',
  category: 'Infos 📊',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const start = Date.now();
    await interaction.deferReply();
    const apiPing = Date.now() - start;
    const wsPing  = client.ws.ping;

    const embed = premiumEmbed(client, {
      title: `📡  Uptime & Latency`,
      description: [
        `> **Uptime:** \`${formatUptime(client.uptime)}\``,
        `> **WebSocket Ping:** \`${wsPing}ms\``,
        `> **API Latency:** \`${apiPing}ms\``,
        `> **Status:** ${wsPing < 100 ? '🟢 Excellent' : wsPing < 250 ? '🟡 Good' : '🔴 High latency'}`
      ].join('\n'),
      color: wsPing < 100 ? '#10B981' : wsPing < 250 ? '#F59E0B' : '#EF4444'
    }).setFooter({
      text: `Requested by ${interaction.user.tag}  •  Wave Network`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true })
    });

    return interaction.editReply({ embeds: [embed] });
  }
};
