'use strict';
/**
 * CommandEngine.js — Unified Slash Command Dispatcher with Middleware Pipeline
 *
 * Replaces the scattered permission/cooldown/logging logic previously inlined
 * across interactionCreate.js.
 *
 * Pipeline for every slash command:
 *   [Guard: DM check]
 *   → [Guard: Bot permissions]
 *   → [Guard: User permissions (legacy flags)]
 *   → [Middleware: Cooldown enforcement]
 *   → [Middleware: ...global middleware (use())]
 *   → [Execute: command.run(ctx)]
 *   → [Error boundary: typed error → UIEngine.replyError()]
 *
 * New command schema additions (all optional):
 *   defer:          boolean  — auto-defer before run() if true
 *   ephemeral:      boolean  — defer as ephemeral
 *   cooldown:       number   — seconds between uses (default: 3)
 *   minPermLevel:   number   — 0=member…4=owner (enforced by permissionService)
 *   examples:       string[] — used by /help
 *   beta:           boolean  — shown with 🧪 in /help
 *
 * Usage:
 *   const { CommandEngine } = require('./core/CommandEngine');
 *   const engine = new CommandEngine(client);
 *   // in interactionCreate event:
 *   engine.execute(interaction);
 */

const { PermissionsBitField } = require('discord.js');
const Logger = require('../utils/logger');

// ─────────────────── Typed Error Classes ──────────────────────────────────────
class CommandError    extends Error { constructor(m) { super(m); this.name = 'CommandError'; } }
class PermissionError extends CommandError { constructor(m = 'You do not have permission to use this command.') { super(m); this.name = 'PermissionError'; } }
class CooldownError   extends CommandError { constructor(m) { super(m); this.name = 'CooldownError'; } }
class NotFoundError   extends CommandError { constructor(m) { super(m); this.name = 'NotFoundError'; } }
class ConfigError     extends CommandError { constructor(m) { super(m); this.name = 'ConfigError'; } }
class ValidationError extends CommandError { constructor(m) { super(m); this.name = 'ValidationError'; } }

// ─────────────────── Cooldown Store ───────────────────────────────────────────
// commandName → Map(userId → expiresAt timestamp)
const cooldowns = new Map();

// ─────────────────── CommandEngine ────────────────────────────────────────────
class CommandEngine {
  /**
   * @param {import('discord.js').Client} client
   */
  constructor(client) {
    this.client            = client;
    this._globalMiddleware = [];
  }

  /**
   * Register a global middleware applied to every command.
   * Middleware signature: async (ctx, next) => { ... await next(); ... }
   */
  use(fn) {
    this._globalMiddleware.push(fn);
    return this;
  }

  /**
   * Execute the full middleware chain for an incoming interaction.
   * @param {import('discord.js').Interaction} interaction
   */
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { client } = this;
    const command    = client.commands?.get(interaction.commandName);
    if (!command) return;

    // ── Build context ──────────────────────────────────────────────────────
    const ctx = {
      client,
      interaction,
      db:       client.db,
      cache:    client.cache,
      services: client.services,
      guild:    interaction.guild    ?? null,
      channel:  interaction.channel  ?? null,
      user:     interaction.user,
      member:   interaction.member   ?? null,
      command,
    };

    // ── Build pipeline ─────────────────────────────────────────────────────
    const pipeline = [
      dmGuard,
      botPermGuard,
      userPermGuard,
      cooldownMiddleware,
      ...this._globalMiddleware,
      async (ctx, next) => {
        await command.run(ctx.client, ctx.interaction, ctx);
        await next();
      },
    ];

    // ── Auto-defer ─────────────────────────────────────────────────────────
    try {
      if (command.defer && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: command.ephemeral ? 64 : undefined });
      }
    } catch { /* already deferred */ }

    // ── Run pipeline ───────────────────────────────────────────────────────
    try {
      await runPipeline(pipeline, ctx);
    } catch (err) {
      await handleError(ctx, err);
    }
  }
}

// ─────────────────── Built-in Middleware ──────────────────────────────────────

/** Block commands used in DMs unless explicitly allowed */
async function dmGuard(ctx, next) {
  if (!ctx.guild && !ctx.command.dmAllowed) {
    throw new ValidationError('⚠️  This command can only be used inside a server.');
  }
  await next();
}

/** Check the bot has the required Discord permissions */
async function botPermGuard(ctx, next) {
  const { guild, command } = ctx;
  const perms              = command.botPermissions;

  if (!guild || !perms?.length) return await next();

  const flags = perms
    .map(p => PermissionsBitField.Flags[p])
    .filter(Boolean);

  const me = guild.members.me;
  if (!me) return await next(); // can't check — skip

  if (!me.permissions.has(flags)) {
    throw new PermissionError(
      `I am missing required permissions: \`${perms.join(', ')}\`\n\n` +
      `> Please grant me the listed permissions and try again.`
    );
  }

  await next();
}

/** Check the user has the required Discord permissions */
async function userPermGuard(ctx, next) {
  const { member, command } = ctx;
  const perms               = command.userPermissions;

  if (!member || !perms?.length) return await next();

  const flags = perms
    .map(p => PermissionsBitField.Flags[p])
    .filter(Boolean);

  if (!member.permissions.has(flags)) {
    throw new PermissionError(
      `You are missing required permissions: \`${perms.join(', ')}\``
    );
  }

  await next();
}

/** Per-user cooldown enforcement via in-memory store (no DB hits) */
async function cooldownMiddleware(ctx, next) {
  const { user, command } = ctx;
  const cooldownSec       = command.cooldown ?? 3;
  const now               = Date.now();

  if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Map());
  const stamps = cooldowns.get(command.name);

  if (stamps.has(user.id)) {
    const expiresAt = stamps.get(user.id);
    if (now < expiresAt) {
      const left = ((expiresAt - now) / 1000).toFixed(1);
      throw new CooldownError(`Please wait **${left}s** before using \`/${command.name}\` again.`);
    }
  }

  stamps.set(user.id, now + cooldownSec * 1_000);
  setTimeout(() => stamps.delete(user.id), cooldownSec * 1_000);

  await next();
}

// ─────────────────── Pipeline Runner ──────────────────────────────────────────
async function runPipeline(chain, ctx) {
  let i = 0;
  async function next() {
    if (i < chain.length) {
      const fn = chain[i++];
      await fn(ctx, next);
    }
  }
  await next();
}

// ─────────────────── Error Handler ────────────────────────────────────────────
async function handleError(ctx, err) {
  const { interaction, client, command } = ctx;

  // Structured log
  Logger.error(
    'CommandEngine',
    `cmd=/${command?.name ?? '?'}  user=${interaction.user?.id ?? '?'}  ` +
    `guild=${interaction.guild?.id ?? 'DM'}  error=${err.message}`
  );

  if (!(err instanceof CommandError)) {
    Logger.error('CommandEngine', err.stack || String(err));
  }

  // Reply with UIEngine if available, otherwise raw fallback
  try {
    if (client.ui) {
      await client.ui.replyError(interaction, err.message || 'An unexpected error occurred.');
    } else {
      const payload = { content: `⛔  ${err.message || 'An unexpected error occurred.'}`, flags: 64 };
      if (interaction.deferred && !interaction.replied) await interaction.editReply(payload).catch(() => null);
      else if (!interaction.replied) await interaction.reply(payload).catch(() => null);
    }
  } catch { /* already failed — don't double-crash */ }
}

// ─────────────────── Exports ──────────────────────────────────────────────────
module.exports = {
  CommandEngine,
  CommandError,
  PermissionError,
  CooldownError,
  NotFoundError,
  ConfigError,
  ValidationError,
};
