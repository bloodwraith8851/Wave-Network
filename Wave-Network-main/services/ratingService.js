/**
 * ratingService.js — Ticket satisfaction rating system
 * Sends 1-5 star rating DM after ticket close. Stores results per staff member.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { premiumEmbed } = require('../functions/functions');

const STARS = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];
const LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981'];

/**
 * Send rating DM to ticket owner after close.
 */
async function sendRatingRequest(client, guild, ownerId, channelName, staffId) {
  try {
    const owner = await guild.members.fetch(ownerId).catch(() => null);
    if (!owner) return;

    const embed = premiumEmbed(client, {
      title: `⭐  How was your support experience?`,
      description: [
        `Your ticket **\`${channelName}\`** has been closed.`,
        `Please rate the support you received — it only takes a second!`,
        ``,
        `Your feedback helps us improve our team.`
      ].join('\n'),
      color: '#F59E0B'
    }).setFooter({ text: `${guild.name}  •  Wave Network  •  This expires in 10 minutes`, iconURL: guild.iconURL({ dynamic: true }) });

    const row = new ActionRowBuilder().addComponents(
      ...[1, 2, 3, 4, 5].map(n =>
        new ButtonBuilder()
          .setCustomId(`rating_${n}_${staffId}_${guild.id}`)
          .setLabel(`${n} ★`)
          .setStyle(n <= 2 ? ButtonStyle.Danger : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Success)
      )
    );

    await owner.send({ embeds: [embed], components: [row] });
  } catch { /* User may have DMs disabled */ }
}

/**
 * Process a rating button click in DMs.
 */
async function processRating(db, guildId, staffId, userId, rating) {
  try {
    const key = `guild_${guildId}.ratings`;
    const ratings = (await db.get(key)) || [];
    ratings.push({ staffId, userId, rating, timestamp: Date.now() });
    if (ratings.length > 1000) ratings.shift();
    await db.set(key, ratings);

    // Update staff avg
    await db.push(`guild_${guildId}.staff_ratings_${staffId}`, rating);
    return true;
  } catch { return false; }
}

/**
 * Get rating stats for a staff member.
 */
async function getStaffRating(db, guildId, staffId) {
  const list = (await db.get(`guild_${guildId}.staff_ratings_${staffId}`)) || [];
  if (!list.length) return { avg: null, count: 0 };
  const avg = list.reduce((a, b) => a + b, 0) / list.length;
  return { avg: avg.toFixed(1), count: list.length };
}

/**
 * Get top rated staff.
 */
async function getTopRated(db, guildId, guild, limit = 5) {
  const staff = guild.members.cache.filter(m => !m.user.bot);
  const results = [];
  for (const [, member] of staff) {
    const { avg, count } = await getStaffRating(db, guildId, member.id);
    if (avg !== null && count >= 1) results.push({ member, avg, count });
  }
  return results.sort((a, b) => b.avg - a.avg).slice(0, limit);
}

module.exports = { sendRatingRequest, processRating, getStaffRating, getTopRated, STARS, LABELS, COLORS };
