/**
 * weeklyReportService.js — Posts weekly ticket stats to the log channel every Sunday
 */
const { premiumEmbed } = require('../functions/functions');
const analyticsService = require('./analyticsService');
const ratingService    = require('./ratingService');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

function start(client) {
  console.log('[WeeklyReport] Service started.');
  setInterval(() => checkAndPost(client), CHECK_INTERVAL_MS);
}

async function checkAndPost(client) {
  const now  = new Date();
  // Post on Sunday at 09:00 UTC
  if (now.getUTCDay() !== 0 || now.getUTCHours() !== 9) return;

  const db = client.db;
  try {
    for (const [, guild] of client.guilds.cache) {
      // Avoid posting twice in the same day
      const lastPost = await db.get(`guild_${guild.id}.weekly_report_last`);
      if (lastPost) {
        const daysSince = (Date.now() - lastPost) / 86400000;
        if (daysSince < 6) continue;
      }

      const logId = await db.get(`guild_${guild.id}.modlog`);
      const logCh = logId ? guild.channels.cache.get(logId) : null;
      if (!logCh) continue;

      const stats = await analyticsService.getStats(db, guild);

      // Top rated staff
      const topRated = await ratingService.getTopRated(db, guild.id, guild, 3);
      const ratingLines = topRated.length
        ? topRated.map((r, i) => `${['🥇','🥈','🥉'][i]} ${r.member.user.tag} — **${r.avg}★** (${r.count} ratings)`).join('\n')
        : '`No ratings this week`';

      // Staff leaderboard
      const staffLines = (await Promise.all(
        stats.staffLeaderboard.map(async ([id, count], i) => {
          const m = await guild.members.fetch(id).catch(() => null);
          return `${['🥇','🥈','🥉'][i] || `${i+1}.`} ${m ? m.user.tag : `<@${id}>`} — **${count}** closed`;
        })
      )).join('\n') || '`No data`';

      const embed = premiumEmbed(client, {
        title: `📊  Weekly Ticket Report`,
        description: `Here is this week's summary for **${guild.name}**.`,
        color: '#7C3AED'
      })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields([
          {
            name: '📈  This Week',
            value: [
              `> **Total Created:** \`${stats.totalCreated}\``,
              `> **Total Closed:** \`${stats.totalClosed}\``,
              `> **Currently Open:** \`${stats.openTickets}\``,
              `> **Avg Response:** \`${analyticsService.formatDuration(stats.avgResponse)}\``
            ].join('\n'),
            inline: false
          },
          { name: '🏆  Staff Leaderboard', value: staffLines, inline: true },
          { name: '⭐  Top Rated Staff', value: ratingLines,  inline: true }
        ])
        .setFooter({ text: `Weekly Report  •  Wave Network  •  Sent every Sunday`, iconURL: guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      await logCh.send({ embeds: [embed] }).catch(() => null);
      await db.set(`guild_${guild.id}.weekly_report_last`, Date.now());
    }
  } catch (e) {
    console.error('[WeeklyReport] Error:', e.message);
  }
}

module.exports = { start };
