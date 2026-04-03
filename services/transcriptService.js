/**
 * transcriptService.js — Enhanced transcript generation & delivery
 * Wraps discord-html-transcripts with premium delivery (DM + log channel)
 */

const Transcript = require('discord-html-transcripts');
const { premiumEmbed } = require('../functions/functions');

/**
 * Generate and deliver a ticket transcript.
 * @param {object} client
 * @param {import('discord.js').TextChannel} channel  — the ticket channel
 * @param {import('discord.js').GuildMember} requester — staff member requesting
 * @param {string} reason — 'closed' | 'deleted'
 * @returns {Promise<import('discord.js').AttachmentBuilder|null>}
 */
async function generateAndDeliver(client, channel, requester, reason = 'closed') {
  const db    = client.db;
  const guild = channel.guild;

  let file = null;
  try {
    file = await Transcript.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `transcript-${channel.name}-${Date.now()}.html`,
      saveImages: false,
      footerText: `Exported {number} message{s} from ${channel.name}`,
      poweredBy: false
    });
  } catch (e) {
    console.error('[Transcript] Failed to generate transcript:', e.message);
    return null;
  }

  // Build info embed
  const ownerId = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
  const category = (await db.get(`guild_${guild.id}.ticket.category_${channel.id}`)) || 'Unknown';
  const createdAt = await db.get(`guild_${guild.id}.ticket.created_at_${channel.id}`);

  const infoEmbed = premiumEmbed(client, {
    title: `📄  Ticket Transcript`,
    description: [
      `**Ticket:** \`${channel.name}\``,
      `**Guild:** ${guild.name}`,
      `**Category:** \`${category}\``,
      `**Owner:** ${ownerId ? `<@${ownerId}>` : 'Unknown'}`,
      `**Closed By:** ${requester.user}`,
      `**Reason:** \`${reason}\``,
      createdAt ? `**Opened:** <t:${Math.floor(createdAt / 1000)}:R>` : '',
      `**Closed:** <t:${Math.floor(Date.now() / 1000)}:R>`
    ].filter(Boolean).join('\n'),
    color: reason === 'deleted' ? '#EF4444' : '#F59E0B'
  });

  // ── Send to ticket owner's DM ─────────────────────────────────────────────
  if (ownerId) {
    try {
      const owner = await guild.members.fetch(ownerId).catch(() => null);
      if (owner) {
        await owner.send({
          files: [file],
          embeds: [infoEmbed]
        });
      }
    } catch { /* DMs may be closed */ }
  }

  // ── Send to transcript/log channel ───────────────────────────────────────
  const transcriptChId = await db.get(`guild_${guild.id}.ticket.settings.transcript_channel`);
  const logChId        = await db.get(`guild_${guild.id}.modlog`);
  const targetChId     = transcriptChId || logChId;

  if (targetChId) {
    const targetCh = guild.channels.cache.get(targetChId);
    if (targetCh) {
      await targetCh.send({
        files: [file],
        embeds: [infoEmbed]
      }).catch(() => null);
    }
  }

  return file;
}

module.exports = { generateAndDeliver };
