/**
 * ticket-stats.js — /ticket-stats
 * Rich analytics with ASCII progress bars, category breakdown, and staff leaderboard.
 */
const { ApplicationCommandType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff }       = require(`${process.cwd()}/services/ticketService`);
const analyticsService   = require(`${process.cwd()}/services/analyticsService`);
const { getStaffRating } = require(`${process.cwd()}/services/ratingService`);

// ── ASCII bar builder ────────────────────────────────────────────────────────
function bar(value, max, width = 10) {
  if (!max || max === 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(value, max) {
  if (!max) return '0%';
  return `${Math.round((value / max) * 100)}%`;
}

function responseColor(ms) {
  if (!ms) return '⚪';
  const h = ms / 3600000;
  if (h < 1)  return '🟢';
  if (h < 6)  return '🟡';
  return '🔴';
}

module.exports = {
  name: 'ticket-stats',
  description: 'View detailed ticket analytics with visual charts.',
  category: 'Staff 🛡️',
  cooldown: 10,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const db        = client.db;
    const staff     = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to view statistics.');

    await interaction.deferReply();

    const stats   = await analyticsService.getStats(db, interaction.guild);
    const total   = Math.max(stats.totalCreated, 1);
    const avgResp = analyticsService.formatDuration(stats.avgResponse);
    const rCol    = responseColor(stats.avgResponse);

    // ── Volume bars
    const openBar   = bar(stats.openTickets,   total);
    const closedBar = bar(stats.totalClosed,   total);

    // ── Category breakdown
    const catEntries = Object.entries(stats.catBreakdown).sort(([,a],[,b]) => b - a).slice(0, 5);
    const catMax     = catEntries[0]?.[1] || 1;
    const catLines   = catEntries.length
      ? catEntries.map(([cat, n]) =>
          `\`${bar(n, catMax, 8)}\` **${n}**  ${cat}`
        ).join('\n')
      : '`No data yet`';

    // ── Staff leaderboard (top 5)
    const staffEntries = stats.staffLeaderboard.slice(0, 5);
    const staffMax     = staffEntries[0]?.[1] || 1;
    const MEDALS       = ['🥇', '🥈', '🥉', '4.', '5.'];
    const staffLines   = staffEntries.length
      ? (await Promise.all(staffEntries.map(async ([id, n], i) => {
          const m = await interaction.guild.members.fetch(id).catch(() => null);
          const { avg } = await getStaffRating(db, interaction.guild.id, id);
          const ratingStr = avg ? `  ⭐ ${avg}` : '';
          return `${MEDALS[i]} ${m ? m.user.tag : `<@${id}>`}\n\`${bar(n, staffMax, 8)}\` **${n}** closed${ratingStr}`;
        }))).join('\n')
      : '`No closures recorded yet`';

    const embed = premiumEmbed(client, {
      title: `📊  Ticket Analytics — ${interaction.guild.name}`,
      color: '#7C3AED'
    })
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .addFields([
        {
          name: '📈  Volume',
          value: [
            `\`Open   \` \`${openBar}\` **${stats.openTickets}** ${pct(stats.openTickets, total)}`,
            `\`Closed \` \`${closedBar}\` **${stats.totalClosed}** ${pct(stats.totalClosed, total)}`,
            `\`Created\` **${stats.totalCreated}** total`,
            `${rCol} \`Avg Response\` **${avgResp}**`
          ].join('\n'),
          inline: false
        },
        {
          name: '🏷️  By Category',
          value: catLines,
          inline: true
        },
        {
          name: '🏆  Staff Leaderboard',
          value: staffLines,
          inline: true
        }
      ])
      .setFooter({
        text: `${interaction.guild.name}  •  Wave Network  •  All-time stats`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      });

    return interaction.editReply({ embeds: [embed] });
  }
};
