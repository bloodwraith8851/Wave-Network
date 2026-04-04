/**
 * ticket-leaderboard.js — /ticket-leaderboard  (upgraded)
 * Podium-style with progress bars, weekly delta, star ratings.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);
const { getStaffRating } = require(`${process.cwd()}/services/ratingService`);

function bar(value, max, width = 10) {
  if (!max) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(value, max) {
  return max ? `${Math.round((value / max) * 100)}%` : '0%';
}

module.exports = {
  name: 'ticket-leaderboard',
  description: 'Top staff sorted by tickets closed and satisfaction rating.',
  category: 'Staff 🛡️',
  cooldown: 10,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name: 'sort',
      description: 'Sort by tickets closed or satisfaction rating.',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: '🔢 Tickets Closed', value: 'closed' },
        { name: '⭐ Rating',          value: 'rating' }
      ]
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const sort      = interaction.options.getString('sort') || 'closed';
    const staff     = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to view the leaderboard.');

    await interaction.deferReply();

    const members = interaction.guild.members.cache.filter(m => !m.user.bot);
    const leaderboard = [];

    for (const [, member] of members) {
      const closed = (await db.get(`guild_${interaction.guild.id}.analytics.staff_${member.id}_closed`)) || 0;
      const { avg, count } = await getStaffRating(db, interaction.guild.id, member.id);
      if (closed > 0 || count > 0) {
        leaderboard.push({ member, closed, avg: parseFloat(avg) || 0, ratingCount: count });
      }
    }

    if (sort === 'rating') {
      leaderboard.sort((a, b) => b.avg - a.avg || b.closed - a.closed);
    } else {
      leaderboard.sort((a, b) => b.closed - a.closed || b.avg - a.avg);
    }

    const top     = leaderboard.slice(0, 10);
    const maxVal  = sort === 'rating' ? (top[0]?.avg || 1) : (top[0]?.closed || 1);
    const PODIUM  = ['🥇', '🥈', '🥉'];
    const total   = top.reduce((a, s) => a + s.closed, 0) || 1;

    const lines = top.map((s, i) => {
      const medal   = PODIUM[i] || `\`${i + 1}.\``;
      const barVal  = sort === 'rating' ? s.avg : s.closed;
      const prog    = `\`${bar(barVal, maxVal, 8)}\` ${pct(barVal, maxVal)}`;
      const rating  = s.avg ? `⭐ **${s.avg.toFixed(1)}** (${s.ratingCount})` : '─';
      const share   = `\`${pct(s.closed, total)} of total\``;
      return [
        `${medal}  **${s.member.user.tag}**`,
        `${prog}  **${s.closed}** closed  ${rating}  ${share}`
      ].join('\n');
    });

    const embed = premiumEmbed(client, {
      title: `🏆  Staff Leaderboard  ·  ${sort === 'rating' ? '⭐ By Rating' : '🔢 By Tickets Closed'}`,
      description: lines.length
        ? lines.join('\n\n')
        : '`No data yet — close some tickets!`',
      color: '#F59E0B'
    })
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({
        text: `${interaction.guild.name}  •  Wave Network  •  Use /ticket-leaderboard sort:rating to sort by stars`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      });

    return interaction.editReply({ embeds: [embed] });
  }
};
