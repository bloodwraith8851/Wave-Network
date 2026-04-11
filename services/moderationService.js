'use strict';
/**
 * moderationService.js — Centralized moderation action logger.
 *
 * Provides a unified interface for logging moderation actions (ban, kick, warn,
 * timeout, purge) to the guild modlog channel with consistent embed formatting.
 *
 * Integrated into ServiceContainer as 'moderation'.
 */

const Logger = require('../utils/logger');

async function log(client, guildId, action, actorId, targetId, details = '') {
  if (!guildId || !client?.guilds) return;

  try {
    const guild  = client.guilds.cache.get(guildId);
    if (!guild) return;

    const logId  = await client.db.get(`guild_${guildId}.modlog`);
    if (!logId)  return;

    const logCh  = guild.channels.cache.get(logId);
    if (!logCh)  return;

    // Use UIEngine if available, fallback to basic embed
    if (client.ui) {
      const embed = client.ui.log(action, `<@${actorId}>`, `<@${targetId}>`, details);
      await logCh.send({ embeds: [embed] }).catch(() => null);
    } else {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor('#EF4444')
        .setTitle(`📋  ${action}`)
        .addFields([
          { name: 'Actor',  value: `<@${actorId}>`,  inline: true },
          { name: 'Target', value: `<@${targetId}>`, inline: true },
          { name: 'Details', value: details || 'N/A', inline: false },
        ])
        .setTimestamp();
      await logCh.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (e) {
    Logger.error('moderationService', 'Failed to post modlog entry', e);
  }
}

module.exports = { log };
