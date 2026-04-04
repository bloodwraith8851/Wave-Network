/**
 * analytics.js — /analytics command
 * Premium ASCII-art dashboard showing ticket trends, category breakdown,
 * staff leaderboard, and rating summary.
 *
 * /analytics overview   — full dashboard embed
 * /analytics trend      — 7-day ticket volume trend (ASCII chart)
 * /analytics categories — category-by-category breakdown
 * /analytics ratings    — satisfaction & top-rated staff
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc       = require(`${process.cwd()}/services/permissionService`);
const analyticsSvc  = require(`${process.cwd()}/services/analyticsService`);
const ratingSvc     = require(`${process.cwd()}/services/ratingService`);

// ── Render a horizontal ASCII bar for a count relative to a max ──────────────
function asciiBar(value, maxVal, len = 16) {
  const filled = maxVal > 0 ? Math.round((value / maxVal) * len) : 0;
  return `${'█'.repeat(filled)}${'░'.repeat(len - filled)}`;
}

// ── Format milliseconds human-readable ───────────────────────────────────────
function fmtMs(ms) {
  if (!ms) return 'N/A';
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

// ── Build 7-day trend data from event log ─────────────────────────────────────
function buildTrend(events) {
  const days  = 7;
  const now   = Date.now();
  const counts = Array(days).fill(0);
  const labels = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
  }

  for (const e of events) {
    if (e.event !== 'ticket_created' || !e.timestamp) continue;
    const daysAgo = Math.floor((now - e.timestamp) / 86400000);
    if (daysAgo >= 0 && daysAgo < days) counts[days - 1 - daysAgo]++;
  }

  return { counts, labels };
}

module.exports = {
  name: 'analytics',
  description: 'View detailed ticket analytics, trends, and staff performance.',
  category: 'Infos 📊',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    { name: 'overview',    description: 'Full analytics dashboard.',                        type: ApplicationCommandOptionType.Subcommand },
    { name: 'trend',       description: '7-day ticket volume trend chart.',                 type: ApplicationCommandOptionType.Subcommand },
    { name: 'categories',  description: 'Category-by-category ticket breakdown.',           type: ApplicationCommandOptionType.Subcommand },
    { name: 'ratings',     description: 'Satisfaction scores and top-rated staff.',         type: ApplicationCommandOptionType.Subcommand },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guild   = interaction.guild;
    const guildId = guild.id;
    const sub     = interaction.options.getSubcommand();

    const denied = await permSvc.requirePermission(db, guild, interaction.member, 'staff.stats', client.config, interaction, errorMessage);
    if (denied) return;

    await interaction.deferReply();

    const stats  = await analyticsSvc.getStats(db, guild);
    const events = (await db.get(`guild_${guildId}.analytics.events`)) || [];

    // ── OVERVIEW ─────────────────────────────────────────────────────────────
    if (sub === 'overview') {
      const openTickets   = guild.channels.cache.filter(c => c.type === 0 && c.name.startsWith('ticket-')).size;
      const resolveRate   = stats.totalCreated > 0 ? Math.round((stats.totalClosed / stats.totalCreated) * 100) : 0;
      const staffOnDuty  = ((await db.get(`guild_${guildId}.shift.active`)) || []).length;

      // Top categories
      const catEntries = Object.entries(stats.catBreakdown).sort(([, a], [, b]) => b - a).slice(0, 4);
      const catMax     = catEntries[0]?.[1] || 1;
      const catLines   = catEntries.map(([cat, count]) =>
        `\`${asciiBar(count, catMax, 10)}\` **${cat}** — \`${count}\``
      ).join('\n') || '*No data yet*';

      // Top staff
      const staffLines = stats.staffLeaderboard.map(([id, count], i) =>
        `${['🥇', '🥈', '🥉'][i] || `\`${i + 1}.\``} <@${id}> — \`${count}\` closed`
      ).join('\n') || '*No data yet*';

      const embed = premiumEmbed(client, { title: `📊  Analytics Dashboard — ${guild.name}`, color: '#7C3AED' })
        .addFields([
          {
            name: '🎫  Ticket Volume',
            value: [
              `> **Total Created:** \`${stats.totalCreated}\``,
              `> **Total Closed:** \`${stats.totalClosed}\``,
              `> **Currently Open:** \`${openTickets}\``,
              `> **Resolve Rate:** \`${resolveRate}%\`  ${asciiBar(resolveRate, 100, 10)}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '⚡  Performance',
            value: [
              `> **Avg Response:** \`${fmtMs(stats.avgResponse)}\``,
              `> **Staff On Duty:** \`${staffOnDuty}\``,
            ].join('\n'),
            inline: true,
          },
          { name: '📂  Top Categories', value: catLines, inline: false },
          { name: '🏆  Top Staff (Closures)', value: staffLines, inline: false },
        ])
        .setFooter({ text: `Wave Network  •  Analytics  •  All-time data`, iconURL: guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── TREND ────────────────────────────────────────────────────────────────
    if (sub === 'trend') {
      const { counts, labels } = buildTrend(events);
      const maxCount = Math.max(...counts, 1);

      // Build vertical ASCII chart (7 rows tall)
      const height   = 6;
      const chartRows = [];
      for (let row = height; row >= 1; row--) {
        const threshold = Math.ceil((row / height) * maxCount);
        const bars      = counts.map(c => c >= threshold ? `█` : ` `);
        const rowLabel  = row === height ? `${maxCount} ┤` : row === 1 ? ` 0 ┤` : `   ┤`;
        chartRows.push(`${rowLabel} ${bars.join('  ')} │`);
      }
      const xAxis = `    └${'──'.repeat(counts.length * 2)}`;
      const xLabels = `      ${labels.map(l => l.slice(0, 2)).join('  ')}`;

      const totalWeek = counts.reduce((a, b) => a + b, 0);
      const peak      = Math.max(...counts);
      const peakDay   = labels[counts.indexOf(peak)] || 'N/A';

      const embed = premiumEmbed(client, {
        title: '📈  7-Day Ticket Volume Trend',
        description: [
          '```',
          chartRows.join('\n'),
          xAxis,
          xLabels,
          '```',
          `**This week:** \`${totalWeek}\` tickets  ·  **Peak:** \`${peak}\` on **${peakDay}**`,
        ].join('\n'),
        color: '#3B82F6',
      }).setFooter({ text: `Wave Network  •  Trend Chart`, iconURL: guild.iconURL({ dynamic: true }) }).setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── CATEGORIES ───────────────────────────────────────────────────────────
    if (sub === 'categories') {
      const catEntries = Object.entries(stats.catBreakdown).sort(([, a], [, b]) => b - a);
      if (!catEntries.length) {
        return interaction.editReply({
          embeds: [premiumEmbed(client, { title: '📂  Category Breakdown', description: '*No ticket data yet.*', color: '#6B7280' })],
        });
      }

      const total  = catEntries.reduce((s, [, c]) => s + c, 0);
      const maxVal = catEntries[0][1];
      const lines  = catEntries.slice(0, 10).map(([cat, count]) => {
        const pct = Math.round((count / total) * 100);
        return `**${cat}**\n\`${asciiBar(count, maxVal, 18)}\` \`${count}\` (${pct}%)`;
      });

      const embed = premiumEmbed(client, {
        title: `📂  Category Breakdown  ·  ${catEntries.length} categories`,
        description: lines.join('\n\n'),
        color: '#7C3AED',
      }).setFooter({ text: `${total} total tickets  •  Wave Network`, iconURL: guild.iconURL({ dynamic: true }) }).setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── RATINGS ──────────────────────────────────────────────────────────────
    if (sub === 'ratings') {
      const allRatings = (await db.get(`guild_${guildId}.ratings`)) || [];
      if (!allRatings.length) {
        return interaction.editReply({
          embeds: [premiumEmbed(client, { title: '⭐  Satisfaction Ratings', description: '*No ratings data yet.*', color: '#6B7280' })],
        });
      }

      const totalRatings   = allRatings.length;
      const avgRating      = allRatings.reduce((s, r) => s + r.rating, 0) / totalRatings;
      const satisfaction   = Math.round((allRatings.filter(r => r.rating >= 4).length / totalRatings) * 100);

      // Star distribution
      const dist = [1, 2, 3, 4, 5].map(star => {
        const count = allRatings.filter(r => r.rating === star).length;
        const pct   = Math.round((count / totalRatings) * 100);
        return `${'⭐'.repeat(star)}  \`${asciiBar(count, totalRatings, 10)}\` \`${pct}%\` (${count})`;
      }).reverse();

      // Top rated staff
      const topRated = await ratingSvc.getTopRated(db, guildId, guild, 3);
      const topLines = topRated.map((r, i) =>
        `${['🥇', '🥈', '🥉'][i]} ${r.member}  \`${r.avg}/5\` (${r.count} ratings)`
      ).join('\n') || '*No data*';

      const embed = premiumEmbed(client, { title: '⭐  Satisfaction Dashboard', color: '#F59E0B' })
        .addFields([
          {
            name: '📊  Overall Stats',
            value: [
              `> **Avg Rating:** \`${avgRating.toFixed(1)}/5.0\` ${'⭐'.repeat(Math.round(avgRating))}`,
              `> **Total Ratings:** \`${totalRatings}\``,
              `> **Satisfaction:** \`${satisfaction}%\` ${asciiBar(satisfaction, 100, 10)}`,
            ].join('\n'),
            inline: false,
          },
          { name: '📈  Distribution', value: dist.join('\n'), inline: false },
          { name: '🏆  Top Rated Staff', value: topLines, inline: false },
        ])
        .setFooter({ text: `Wave Network  •  Rating Analytics`, iconURL: guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
