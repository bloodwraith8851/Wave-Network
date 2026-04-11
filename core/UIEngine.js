'use strict';
/**
 * UIEngine.js — Wave Network Global Embed Factory & Design System
 *
 * Single source of truth for ALL visual output in the bot.
 * Every embed, color, and response shape is standardized here.
 *
 * Usage:
 *   const UI = require('./core/UIEngine');
 *   UI.init(client);                          // once in index.js
 *   const ui = UI.get();                      // anywhere else
 *   await ui.replySuccess(interaction, 'Done!');
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const pkg = require('../package.json');

// ─────────────────────────── Design Tokens ────────────────────────────────────
const COLORS = {
  primary:  '#7C3AED',  // brand violet
  success:  '#10B981',  // emerald green
  warning:  '#F59E0B',  // amber
  error:    '#EF4444',  // red
  info:     '#3B82F6',  // blue
  neutral:  '#6B7280',  // gray
  ticket:   '#8B5CF6',  // purple — ticket actions
  mod:      '#EC4899',  // pink  — moderation
  staff:    '#06B6D4',  // cyan  — staff actions
  dark:     '#2B2D31',  // dark  — loading states
};

const TYPE_COLOR = {
  success: COLORS.success,
  error:   COLORS.error,
  warning: COLORS.warning,
  info:    COLORS.info,
  ticket:  COLORS.ticket,
  mod:     COLORS.mod,
  staff:   COLORS.staff,
  neutral: COLORS.neutral,
  primary: COLORS.primary,
};

const TYPE_ICON = {
  success: '✅',
  error:   '⛔',
  warning: '⚠️',
  info:    'ℹ️',
  ticket:  '🎫',
  mod:     '🔨',
  staff:   '🛡️',
  neutral: '📋',
  primary: '🌊',
};

// ─────────────────── Error Auto-Classifier ────────────────────────────────────
function classifyError(msg) {
  const m = String(msg);
  if (/permission|manage|administrator|missing access|missing permissions/i.test(m))
    return { title: '🔒  Permission Denied',       color: COLORS.ticket,  hint: '\n\n> You lack the required permissions for this action.' };
  if (/cooldown|wait|seconds/i.test(m))
    return { title: '⏱️  Cooldown Active',          color: COLORS.warning, hint: '\n\n> Please wait before using this command again.' };
  if (/not found|invalid|no .*found|doesn.t exist/i.test(m))
    return { title: '🔍  Not Found',                color: COLORS.neutral, hint: '\n\n> The requested resource could not be found.' };
  if (/config|setup|settings|not set|not configured/i.test(m))
    return { title: '⚙️  Configuration Required',   color: '#F97316',      hint: '\n\n> Run `/settings` to configure this first.' };
  if (/staff|admin role|ticket admin/i.test(m))
    return { title: '🛡️  Staff Only',               color: COLORS.mod,     hint: '\n\n> This action requires Staff/Admin level or higher.' };
  if (/ticket/i.test(m) && /already|open|exist/i.test(m))
    return { title: '🎫  Ticket Already Exists',    color: COLORS.warning, hint: '\n\n> You already have an open ticket.' };
  if (/rate.?limit/i.test(m))
    return { title: '🌐  Rate Limited',             color: COLORS.info,    hint: '\n\n> The bot is rate-limited. Please retry shortly.' };
  if (/database|db|quick.?db/i.test(m))
    return { title: '🗄️  Database Error',            color: COLORS.error,   hint: '\n\n> A database error occurred. Please try again.' };
  if (/inside a ticket/i.test(m))
    return { title: '🎫  Not In a Ticket',          color: COLORS.neutral, hint: '\n\n> Use this command inside a ticket channel.' };
  if (/blacklist/i.test(m))
    return { title: '🚫  Blacklisted',              color: COLORS.error,   hint: '\n\n> Your message contains a flagged keyword.' };
  if (/max|limit|reached/i.test(m))
    return { title: '📦  Limit Reached',            color: '#F97316',      hint: '\n\n> The maximum allowed limit has been reached.' };
  if (/network|econnreset|etimedout/i.test(m))
    return { title: '📡  Network Error',            color: COLORS.neutral, hint: '\n\n> A network issue occurred. Please try again.' };
  if (/verified|verification/i.test(m))
    return { title: '🔐  Verification Required',   color: COLORS.info,    hint: '\n\n> You must verify before using this feature.' };
  return { title: '⛔  Error', color: COLORS.error, hint: '' };
}

// ───────────────────────── UIEngine Class ─────────────────────────────────────
class UIEngine {
  constructor(client) {
    this.client = client;
    this.COLORS = COLORS;
    this.VERSION = pkg.version;
  }

  // ── Branded base embed ────────────────────────────────────────────────────
  _base(color) {
    return new EmbedBuilder()
      .setColor(color || COLORS.primary)
      .setTimestamp()
      .setFooter({
        text:    `Wave Network  •  v${this.VERSION}`,
        iconURL: this.client?.user?.displayAvatarURL({ dynamic: true }) || null,
      });
  }

  // ── Generic typed embed ───────────────────────────────────────────────────
  embed(type = 'info', { title, description, fields = [], thumbnail, image, author } = {}) {
    const color = TYPE_COLOR[type] || COLORS.primary;
    const icon  = TYPE_ICON[type]  || '';
    const e     = this._base(color);

    if (title)         e.setTitle(`${icon}  ${title}`);
    if (description)   e.setDescription(description);
    if (thumbnail)     e.setThumbnail(thumbnail);
    if (image)         e.setImage(image);
    if (author)        e.setAuthor(author);
    if (fields.length) e.addFields(fields);

    return e;
  }

  // ── Shortcut builders ─────────────────────────────────────────────────────

  /** Green success embed */
  success(text, fields = []) {
    return this.embed('success', { title: 'Success', description: text, fields });
  }

  /** Auto-classifying error embed */
  error(text) {
    const { title, color, hint } = classifyError(text);
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(`${text}${hint}`)
      .setTimestamp()
      .setFooter({ text: `Wave Network  •  v${this.VERSION}`, iconURL: this.client?.user?.displayAvatarURL({ dynamic: true }) || null });
  }

  /** Amber warning embed */
  warning(title, text) {
    return this.embed('warning', { title, description: text });
  }

  /** Blue info embed */
  info(title, text, fields = []) {
    return this.embed('info', { title, description: text, fields });
  }

  /** Purple ticket-themed embed */
  ticket(title, desc, fields = []) {
    return this.embed('ticket', { title, description: desc, fields });
  }

  /** Pink moderation embed */
  mod(title, desc, fields = []) {
    return this.embed('mod', { title, description: desc, fields });
  }

  /** Cyan staff embed */
  staff(title, desc, fields = []) {
    return this.embed('staff', { title, description: desc, fields });
  }

  /** Dark loading state embed */
  loading(text = 'Processing request…') {
    return new EmbedBuilder()
      .setColor(COLORS.dark)
      .setDescription(`⏳  ${text}`)
      .setTimestamp();
  }

  /**
   * Moderation audit-log embed
   * @param {string} action   — e.g. 'Member Banned'
   * @param {string} actor    — staff tag or mention
   * @param {string} target   — target user tag or mention
   * @param {string} details  — reason or extra context
   */
  log(action, actor, target, details = 'No details provided.') {
    const colorMap = {
      'Ticket Created':  COLORS.success,
      'Ticket Closed':   COLORS.warning,
      'Ticket Deleted':  COLORS.error,
      'Ticket Opened':   COLORS.info,
      'Ticket Renamed':  COLORS.ticket,
      'Member Banned':   COLORS.error,
      'Member Kicked':   COLORS.mod,
      'Member Warned':   COLORS.warning,
      'Member Timeout':  COLORS.warning,
      'Messages Purged': COLORS.neutral,
      'Member Unbanned': COLORS.success,
    };

    return new EmbedBuilder()
      .setColor(colorMap[action] || COLORS.primary)
      .setTitle(`📋  ${action}`)
      .setDescription(details)
      .addFields([
        { name: '👤 Actor',  value: String(actor),  inline: true },
        { name: '🎯 Target', value: String(target), inline: true },
        { name: '📅 Time',   value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false },
      ])
      .setTimestamp()
      .setFooter({ text: `Wave Network  •  Audit Log`, iconURL: this.client?.user?.displayAvatarURL({ dynamic: true }) || null });
  }

  /**
   * Confirmation embed — returns { embed, row } with Confirm + Cancel buttons
   */
  confirm(title, desc, { confirmId = 'confirm_action', cancelId = 'dont_do', danger = true } = {}) {
    const embed = this.embed('warning', { title, description: desc });
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Confirm')
        .setEmoji('✅')
        .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setEmoji('✖️')
        .setStyle(ButtonStyle.Secondary),
    );
    return { embed, row };
  }

  // ─────────────────── Safe Reply Helpers ───────────────────────────────────

  /**
   * Send a reply, handling deferred/replied states gracefully.
   * @param {Interaction} interaction
   * @param {EmbedBuilder}  embed
   * @param {{ components?, ephemeral? }} opts
   */
  async reply(interaction, embed, { components = [], ephemeral = false } = {}) {
    const payload = {
      embeds:     [embed],
      components,
      ...(ephemeral ? { flags: 64 } : {}),
    };
    try {
      if (interaction.deferred && !interaction.replied) return await interaction.editReply(payload);
      if (interaction.replied) return await interaction.followUp({ ...payload, flags: 64 });
      return await interaction.reply(payload);
    } catch { return null; }
  }

  /** Send ephemeral reply */
  async replyEphemeral(interaction, embed, components = []) {
    return this.reply(interaction, embed, { components, ephemeral: true });
  }

  /** Ephemeral success reply */
  async replySuccess(interaction, text, fields = []) {
    return this.replyEphemeral(interaction, this.success(text, fields));
  }

  /** Ephemeral error reply with error indicator button */
  async replyError(interaction, text) {
    const embed = this.error(text);
    const row   = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Danger)
        .setLabel('Error')
        .setEmoji('⚠️')
        .setCustomId('error_btn')
        .setDisabled(true),
    );
    return this.replyEphemeral(interaction, embed, [row]);
  }

  /** Loading state reply (non-ephemeral by default) */
  async replyLoading(interaction, text = 'Processing request…') {
    const payload = { embeds: [this.loading(text)], components: [], flags: 64 };
    try {
      if (interaction.deferred && !interaction.replied) return await interaction.editReply(payload);
      return await interaction.reply(payload);
    } catch { return null; }
  }

  /** Ephemeral info reply */
  async replyInfo(interaction, title, text, fields = []) {
    return this.replyEphemeral(interaction, this.info(title, text, fields));
  }

  /**
   * Send to a modlog channel (non-interaction)
   */
  async sendLog(channel, action, actor, target, details) {
    if (!channel?.send) return null;
    return channel.send({ embeds: [this.log(action, actor, target, details)] }).catch(() => null);
  }
}

// ── Singleton management ──────────────────────────────────────────────────────
let _instance = null;

function init(client) {
  _instance = new UIEngine(client);
  return _instance;
}

function get() {
  if (!_instance) throw new Error('[UIEngine] Not initialized. Call UIEngine.init(client) first.');
  return _instance;
}

module.exports = { UIEngine, COLORS, TYPE_COLOR, TYPE_ICON, init, get, classifyError };
