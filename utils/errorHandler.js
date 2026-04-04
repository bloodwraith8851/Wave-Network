/**
 * errorHandler.js — Centralised process-level error handler
 *
 * Catches:
 *  • uncaughtException
 *  • unhandledRejection
 *  • SIGTERM / SIGINT
 *  • process warnings
 *
 * All output goes through Logger for consistent, beautiful formatting.
 * Every error shows: message, code, full stack trace, and cause.
 */
'use strict';
const Logger = require('./logger');

// ── Known non-fatal patterns (log but do NOT exit) ───────────────────────────
const NON_FATAL_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /EADDRINUSE/i,      // port already in use — log but don't crash
  /EACCES/i,          // permission denied on port — log but don't crash
  /AbortError/i,
  /Unknown Message/i,
  /Unknown Channel/i,
  /Unknown Guild/i,
  /Cannot send messages to this user/i,
  /Missing Permissions/i,
  /Missing Access/i,
  /Interaction has already been acknowledged/i,
  /Unknown interaction/i,
  /The reply to this interaction/i,
  /You are being rate limited/i,
  /Request timed out/i,
];

function isNonFatal(err) {
  const str = String(err?.message || err);
  return NON_FATAL_PATTERNS.some(re => re.test(str));
}

// ── Structured log line (via Logger) ─────────────────────────────────────────
function logError(label, err, isFatal) {
  if (isFatal) {
    Logger.fatal(label, String(err?.message || err), err instanceof Error ? err : new Error(String(err)));
  } else {
    Logger.warn(label, String(err?.message || err), err instanceof Error ? err : undefined);
  }
}

// ── Post critical errors to Discord error-log channel ────────────────────────
async function postToErrorChannel(client, label, err) {
  try {
    if (!client?.isReady?.()) return;
    const channelId = client.config?.discord?.error_log_channel;
    if (!channelId) return;
    const ch = client.channels.cache.get(channelId);
    if (!ch) return;
    const { EmbedBuilder } = require('discord.js');
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor('#EF4444')
        .setTitle(`🚨  ${label}`)
        .setDescription([
          '```',
          String(err?.message || err).slice(0, 1500),
          '```',
        ].join('\n'))
        .addFields([
          { name: 'Code',  value: `\`${err?.code || 'N/A'}\``,             inline: true },
          { name: 'Time',  value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
          { name: 'Stack', value: `\`\`\`${(err?.stack || '').slice(0, 800)}\`\`\``, inline: false },
        ])
        .setFooter({ text: 'Wave Network  •  Error Monitor' })
        .setTimestamp()
      ]
    });
  } catch { /* never crash inside error handler */ }
}

// ── Install all global handlers ───────────────────────────────────────────────
function install(client) {

  // Unhandled promise rejections
  process.on('unhandledRejection', async (reason) => {
    const isFatal = !isNonFatal(reason);
    logError('UnhandledRejection', reason, isFatal);
    if (isFatal) await postToErrorChannel(client, 'Unhandled Rejection', reason);
  });

  // Synchronous thrown errors
  process.on('uncaughtException', async (err) => {
    const isFatal = !isNonFatal(err);
    logError('UncaughtException', err, isFatal);
    if (isFatal) {
      await postToErrorChannel(client, 'Uncaught Exception', err);
      await new Promise(r => setTimeout(r, 2000));
      Logger.fatal('Process', 'Restarting in 5s — Railway/PM2 will respawn…');
      await new Promise(r => setTimeout(r, 5000));
      process.exit(1);
    }
  });

  // Graceful shutdown
  ['SIGTERM', 'SIGINT'].forEach(sig => {
    process.once(sig, async () => {
      Logger.warn('Process', `${sig} received — graceful shutdown…`);
      try { await client.destroy(); } catch { /* */ }
      Logger.ok('Process', 'Shutdown complete.');
      process.exit(0);
    });
  });

  // Suppress MaxListenersExceededWarning; show everything else
  process.on('warning', (warn) => {
    if (warn.name === 'MaxListenersExceededWarning') return;
    Logger.warn('NodeWarning', `${warn.name}: ${warn.message}`);
  });

  Logger.ok('ErrorHandler', 'Global error handlers installed ✅');
}

module.exports = { install, isNonFatal, logError };
