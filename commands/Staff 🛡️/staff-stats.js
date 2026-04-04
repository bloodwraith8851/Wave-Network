/**
 * staff-stats.js — /staff-stats command
 * View detailed per-staff performance metrics.
 *
 * /staff-stats [user]   — view metrics for a specific staff member (or self)
 * /staff-stats leaderboard — top performers
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);

/**
 * Build a simple ASCII bar for a percentage value.
 */
function bar(pct, len = 14) {
  const filled = Math.round((pct / 100) * len);
  return `[${'█'.repeat(filled)}${'░'.repeat(len - filled)}] ${pct}%`;
}

/**
 * Format milliseconds to a human-readable duration.
 */
function fmtDuration(ms) {
  if (!ms || ms <= 0) return 'N/A';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

module.exports = {
  name: 'staff-stats',
  description: 'View detailed performance metrics for staff members.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'view',
      description: 'View performance metrics for a staff member.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'user', description: 'Staff member to view (leave empty for yourself).', type: ApplicationCommandOptionType.User, required: false },
      ],
    },
    {
      name: 'leaderboard',
      description: 'View top-performing staff leaderboard.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;
    const sub     = interaction.options.getSubcommand();

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.stats', client.config, interaction, errorMessage);
    if (denied) return;

    await interaction.deferReply({ ephemeral: true });

    // Load analytics data
    const analytics = (await db.get(`guild_${guildId}.analytics`)) || {};
    const ratings   = (await db.get(`guild_${guildId}.ratings`)) || {};
    const autoAssign = (await db.get(`guild_${guildId}.autoassign.counts`)) || {};

    if (sub === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const staffId    = targetUser.id;

      // Gather data from analytics
      const staffEvents  = (analytics.events || []).filter(e => e.staffId === staffId);
      const closedCount  = staffEvents.filter(e => e.type === 'ticket_closed').length;
      const deletedCount = staffEvents.filter(e => e.type === 'ticket_deleted').length;
      const claimedCount = staffEvents.filter(e => e.type === 'ticket_claimed').length;

      // First response times
      const firstRespEvents = staffEvents.filter(e => e.type === 'first_response' && e.responseTime);
      const avgResponse     = firstRespEvents.length
        ? firstRespEvents.reduce((sum, e) => sum + e.responseTime, 0) / firstRespEvents.length
        : 0;

      // Ratings
      const staffRatings    = ratings[staffId] || [];
      const ratingCount     = staffRatings.length;
      const avgRating       = ratingCount
        ? staffRatings.reduce((sum, r) => sum + r, 0) / ratingCount
        : 0;
      const satisfaction    = ratingCount
        ? Math.round((staffRatings.filter(r => r >= 4).length / ratingCount) * 100)
        : 0;

      // Open tickets currently assigned
      const openAssigned = autoAssign[staffId] || 0;

      // Rating bar
      const ratingBar   = ratingCount ? '⭐'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating)) : '☆☆☆☆☆';

      const embed = premiumEmbed(client, {
        title: `📊  Staff Stats — ${targetUser.username}`,
        color: '#7C3AED',
      })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(`Performance metrics for ${targetUser}`)
        .addFields([
          {
            name: '🎫  Ticket Activity',
            value: [
              `> **Closed:**  \`${closedCount}\``,
              `> **Deleted:** \`${deletedCount}\``,
              `> **Claimed:** \`${claimedCount}\``,
              `> **Currently Open:** \`${openAssigned}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '⏱️  Response Time',
            value: [
              `> **Avg First Response:**`,
              `> \`${fmtDuration(avgResponse)}\``,
              `> **Samples:** \`${firstRespEvents.length}\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '⭐  Satisfaction',
            value: [
              `> ${ratingBar}`,
              `> **Avg Rating:** \`${avgRating.toFixed(1)}/5.0\``,
              `> **Ratings:** \`${ratingCount}\``,
              `> **Satisfaction:** ${bar(satisfaction)}`,
            ].join('\n'),
            inline: false,
          },
        ])
        .setFooter({ text: `Wave Network  •  Staff Dashboard`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'leaderboard') {
      // Aggregate all staff from analytics events
      const events    = analytics.events || [];
      const staffMap  = {};

      for (const e of events) {
        if (!e.staffId) continue;
        if (!staffMap[e.staffId]) staffMap[e.staffId] = { closed: 0, claimed: 0, totalRating: 0, ratingCount: 0 };
        if (e.type === 'ticket_closed')  staffMap[e.staffId].closed++;
        if (e.type === 'ticket_claimed') staffMap[e.staffId].claimed++;
      }

      for (const [uid, ratingArr] of Object.entries(ratings)) {
        if (!staffMap[uid]) staffMap[uid] = { closed: 0, claimed: 0, totalRating: 0, ratingCount: 0 };
        staffMap[uid].totalRating  = ratingArr.reduce((s, r) => s + r, 0);
        staffMap[uid].ratingCount  = ratingArr.length;
      }

      const sorted = Object.entries(staffMap)
        .map(([uid, s]) => ({
          uid,
          score: s.closed * 3 + s.claimed * 1 + (s.ratingCount ? (s.totalRating / s.ratingCount) * 2 : 0),
          ...s,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      if (!sorted.length) {
        return interaction.editReply({
          embeds: [premiumEmbed(client, { title: '📊  Staff Leaderboard', description: 'No staff data available yet.', color: '#6B7280' })],
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lines  = sorted.map((s, i) => {
        const avgR = s.ratingCount ? (s.totalRating / s.ratingCount).toFixed(1) : 'N/A';
        const medal = medals[i] || `\`${i+1}.\``;
        return `${medal} <@${s.uid}>\n> Closed: \`${s.closed}\`  Claimed: \`${s.claimed}\`  Rating: \`${avgR}/5\``;
      });

      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: '🏆  Staff Leaderboard',
          description: lines.join('\n\n'),
          color: '#F59E0B',
        }).setFooter({ text: 'Wave Network  •  Staff Performance', iconURL: interaction.guild.iconURL({ dynamic: true }) }).setTimestamp()],
      });
    }
  },
};
