const {
  ApplicationCommandType,
  EmbedBuilder,
} = require('discord.js');

module.exports = {
  name:            'ping',
  description:     'View real-time bot performance metrics — latency, memory, shards, cache.',
  category:        'Infos 📊',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: [],
  botPermissions:  ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    // ── Step 1: Initial loading state ────────────────────────────────────────
    const sent = await interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription('⏳  Calculating latency…')],
      fetchReply: true,
    });

    // ── Step 2: Collect metrics ───────────────────────────────────────────────
    const apiLatency = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency  = Math.round(client.ws.ping);

    // Memory
    const mem        = process.memoryUsage();
    const rssM       = (mem.rss          / 1024 / 1024).toFixed(1);
    const heapUsedM  = (mem.heapUsed     / 1024 / 1024).toFixed(1);
    const heapTotalM = (mem.heapTotal    / 1024 / 1024).toFixed(1);

    // Uptime
    const uptimeSec  = Math.floor(process.uptime());
    const days       = Math.floor(uptimeSec / 86400);
    const hrs        = Math.floor((uptimeSec % 86400) / 3600);
    const mins       = Math.floor((uptimeSec % 3600)  / 60);
    const secs       = uptimeSec % 60;
    const uptimeStr  = [
      days ? `${days}d` : '',
      hrs  ? `${hrs}h`  : '',
      mins ? `${mins}m` : '',
      `${secs}s`,
    ].filter(Boolean).join(' ');

    // DB read latency
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await client.db.get(`_ping_test_${Date.now()}`);
      dbLatency = Date.now() - dbStart;
    } catch { dbLatency = -1; }

    // Cache stats
    const cacheStats = client.cache?.stats?.() || { hitRate: 'N/A', entries: 0, sizeKB: 0 };

    // Shard info
    const shardId     = client.shardId ?? 0;
    const totalShards = client.shard?.count ?? 1;

    // Cross-shard avg ping (if sharding enabled)
    let shardPings = `\`#${shardId}\` — \`${wsLatency}ms\``;
    try {
      if (client.shard) {
        const pings = await client.shard.broadcastEval(c => c.ws.ping);
        shardPings  = pings.map((p, i) => `\`#${i}\` — \`${p}ms\``).join('\n');
      }
    } catch { /* standalone */ }

    // Color logic: green < 150ms, yellow < 300ms, red >= 300ms
    const latColor = (ms) =>
      ms  < 0   ? '❓' :
      ms  < 100 ? '🟢' :
      ms  < 300 ? '🟡' :
                  '🔴';

    // ── Step 3: Build result embed ────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(
        apiLatency < 100 ? '#10B981' :
        apiLatency < 300 ? '#F59E0B' :
                           '#EF4444'
      )
      .setTitle('🏓  Wave Network — Performance Monitor')
      .setDescription('Real-time metrics for this bot instance.')
      .addFields([
        // ── Latency ──
        {
          name:  '📡  Latency',
          value: [
            `${latColor(apiLatency)} **API Round-trip:** \`${apiLatency}ms\``,
            `${latColor(wsLatency)}  **WebSocket:**        \`${wsLatency}ms\``,
            `${latColor(dbLatency)}  **DB Read:**          \`${dbLatency < 0 ? 'Error' : dbLatency + 'ms'}\``,
          ].join('\n'),
          inline: false,
        },
        // ── Memory ──
        {
          name:  '💾  Memory',
          value: [
            `**RSS:**        \`${rssM} MB\``,
            `**Heap Used:**  \`${heapUsedM} MB\``,
            `**Heap Total:** \`${heapTotalM} MB\``,
          ].join('\n'),
          inline: true,
        },
        // ── Cache ──
        {
          name:  '⚡  Cache',
          value: [
            `**Hit Rate:**  \`${cacheStats.hitRate}\``,
            `**Entries:**   \`${cacheStats.entries}\``,
            `**Size:**      \`${cacheStats.sizeKB} KB\``,
          ].join('\n'),
          inline: true,
        },
        // ── System ──
        {
          name:  '🖥️  System',
          value: [
            `**Uptime:**    \`${uptimeStr}\``,
            `**Node.js:**   \`${process.version}\``,
            `**Platform:**  \`${process.platform}\``,
          ].join('\n'),
          inline: true,
        },
        // ── Shards ──
        {
          name:  `🧩  Shards (${totalShards} total)`,
          value: shardPings || `\`#${shardId}\` — \`${wsLatency}ms\``,
          inline: false,
        },
      ])
      .setFooter({
        text:    `Wave Network  •  v${require(`${process.cwd()}/package.json`).version}  •  Shard #${shardId}`,
        iconURL: client.user.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
