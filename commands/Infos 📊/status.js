/**
 * status.js — /status  (upgraded)
 * Live grid layout system health page.
 */
const { ApplicationCommandType } = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

function statusDot(ok, latency) {
  if (!ok)        return '🔴';
  if (latency > 250) return '🔴';
  if (latency > 100) return '🟡';
  return '🟢';
}

function bar(value, max, width = 10) {
  const filled = Math.min(Math.round((value / max) * width), width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d > 0 ? `${d}d` : null, `${h}h`, `${m}m`, `${s % 60}s`].filter(Boolean).join(' ');
}

module.exports = {
  name: 'status',
  description: 'View bot system health and live status grid.',
  category: 'Infos 📊',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const start = Date.now();
    await interaction.deferReply();
    const apiPing = Date.now() - start;
    const wsPing  = client.ws.ping;
    const uptime  = client.uptime;

    const { heapUsed, heapTotal } = process.memoryUsage();
    const memUsed  = Math.round(heapUsed  / 1024 / 1024);
    const memTotal = Math.round(heapTotal / 1024 / 1024);
    const memPct   = Math.round((memUsed / memTotal) * 100);

    // DB health check
    let dbOk = true;
    try {
      await client.db.set('_healthcheck', 1);
      await client.db.delete('_healthcheck');
    } catch { dbOk = false; }

    const wsOk  = wsPing >= 0;
    const cmdOk = client.commands.size > 0;

    // Overall health score
    const checks    = [wsOk, dbOk, cmdOk, wsPing < 250, apiPing < 500];
    const passing   = checks.filter(Boolean).length;
    const healthPct = Math.round((passing / checks.length) * 100);
    const healthBar = bar(passing, checks.length, 10);
    const overallDot = healthPct === 100 ? '🟢' : healthPct >= 60 ? '🟡' : '🔴';
    const overallLbl = healthPct === 100 ? 'All Systems Operational' : healthPct >= 60 ? 'Partial Degradation' : 'System Issues';

    const wsLabel  = wsPing < 100 ? 'Excellent' : wsPing < 250 ? 'Good' : 'Degraded';
    const apiLabel = apiPing < 200 ? 'Fast' : apiPing < 500 ? 'Normal' : 'Slow';

    const embed = premiumEmbed(client, {
      title: `🖥️  System Status  ·  ${overallDot} ${overallLbl}`,
      color: healthPct === 100 ? '#10B981' : healthPct >= 60 ? '#F59E0B' : '#EF4444'
    })
      .setDescription(`\`${healthBar}\` **${healthPct}%** health score  (${passing}/${checks.length} checks passing)`)
      .addFields([
        {
          name: '🌐  Gateway & API',
          value: [
            `${statusDot(wsOk, wsPing)} **WebSocket** \`${wsPing}ms\` — ${wsLabel}`,
            `${statusDot(true, apiPing)} **API Latency** \`${apiPing}ms\` — ${apiLabel}`,
            `🔷 **Shards** \`${client.shard ? client.shard.count : 1}\``
          ].join('\n'),
          inline: true
        },
        {
          name: '💾  Resources',
          value: [
            `${dbOk ? '🟢' : '🔴'} **Database** — ${dbOk ? 'Healthy' : 'Error'}`,
            `📦 **Memory** \`${memUsed}/${memTotal} MB\``,
            `\`${bar(memUsed, memTotal, 8)}\` ${memPct}%`
          ].join('\n'),
          inline: true
        },
        {
          name: '⚡  Bot',
          value: [
            `${cmdOk ? '🟢' : '🔴'} **Commands** \`${client.commands.size}\` loaded`,
            `🏠 **Servers** \`${client.guilds.cache.size}\``,
            `⏱️ **Uptime** \`${formatUptime(uptime)}\``,
            `📅 Online since <t:${Math.floor((Date.now() - uptime) / 1000)}:R>`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({
        text: `Wave Network  ·  ${new Date().toUTCString()}`,
        iconURL: client.user.displayAvatarURL({ dynamic: true })
      });

    return interaction.editReply({ embeds: [embed] });
  }
};
