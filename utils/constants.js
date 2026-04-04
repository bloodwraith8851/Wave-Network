/**
 * constants.js — Centralized application constants
 *
 * Single source of truth for magic numbers, key names, and enums.
 * Import anywhere with: const C = require('./utils/constants');
 */

// ── Ticket limits ─────────────────────────────────────────────────────────────
const TICKET = {
  MAX_PER_USER:            5,     // max concurrent open tickets per user
  COOLDOWN_SECONDS:       30,     // minimum seconds between ticket creations
  MAX_TAGS:               10,     // max tags per ticket
  DEFAULT_AUTO_CLOSE_HOURS: 48,   // auto-close after X hours of inactivity
  DEFAULT_REMINDER_MINUTES: 720,  // remind staff after X minutes of inactivity
  PRIORITY_LEVELS: ['low', 'medium', 'high', 'critical'],
  PRIORITY_COLORS: {
    low:      '#6B7280',
    medium:   '#F59E0B',
    high:     '#EF4444',
    critical: '#7C3AED',
  },
};

// ── Permission levels ─────────────────────────────────────────────────────────
const PERM = {
  MEMBER:     0,
  STAFF:      1,
  MODERATOR:  2,
  ADMIN:      3,
  OWNER:      4,
  NAMES: ['Member', 'Staff', 'Moderator', 'Admin', 'Owner'],
  EMOJIS: ['👤', '🛡️', '🔨', '⚙️', '👑'],
};

// ── Default SLA times (minutes) ───────────────────────────────────────────────
const SLA = {
  DEFAULT_MINUTES:     60,
  WARNING_THRESHOLD:   0.75,   // 75% → yellow warning
  BREACH_THRESHOLD:    1.0,    // 100% → red breach
  CHECK_INTERVAL_MS:   5 * 60 * 1000,   // 5 minutes
};

// ── Escalation ────────────────────────────────────────────────────────────────
const ESCALATION = {
  DEFAULT_HOURS:        24,
  CHECK_INTERVAL_MS:    30 * 60 * 1000,  // 30 minutes
};

// ── Scheduler ────────────────────────────────────────────────────────────────
const SCHEDULER = {
  TICK_INTERVAL_MS:     60 * 1000,   // 1 minute
  MAX_PER_TICKET:       10,
  MAX_DELAY_MS:         7 * 24 * 60 * 60 * 1000,  // 7 days
  MIN_DELAY_MS:         60 * 1000,                 // 1 minute
};

// ── Limits ────────────────────────────────────────────────────────────────────
const LIMITS = {
  CANNED_RESPONSES:     50,
  FAQ_ENTRIES:          100,
  KB_ARTICLES:          200,
  AUDIT_LOG_SIZE:       200,
  WEBHOOK_MAX:          10,
  BLACKLIST_MAX:        200,
  ANALYTICS_EVENTS:     500,
  SHIFT_LOG:            100,
};

// ── Branding defaults ─────────────────────────────────────────────────────────
const BRANDING = {
  DEFAULT_COLOR:        '#7C3AED',
  DEFAULT_FOOTER:       'Wave Network',
};

// ── Auto-assign modes ─────────────────────────────────────────────────────────
const ASSIGN = {
  MODES: ['off', 'round_robin', 'load_balanced'],
};

// ── Verification modes ────────────────────────────────────────────────────────
const VERIFY = {
  MODES:        ['none', 'role', 'age', 'captcha'],
  DEFAULT_MODE: 'none',
  DEFAULT_AGE:  7,  // days
};

// ── Duplicate detection ───────────────────────────────────────────────────────
const DUPLICATE = {
  THRESHOLD_LOW:    0.6,
  THRESHOLD_MEDIUM: 0.35,
  THRESHOLD_HIGH:   0.2,
  DEFAULT:          'medium',
};

// ── Webhook events ────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  'ticket_create',
  'ticket_close',
  'ticket_delete',
  'ticket_escalate',
  'ticket_assigned',
  'rating_received',
  'ticket_tag_added',
];

// ── i18n supported locales ────────────────────────────────────────────────────
const LOCALES = {
  SUPPORTED: ['en', 'es', 'fr', 'de', 'pt', 'hi', 'ja'],
  DEFAULT:   'en',
  NAMES: {
    en: '🇬🇧 English',
    es: '🇪🇸 Spanish',
    fr: '🇫🇷 French',
    de: '🇩🇪 German',
    pt: '🇧🇷 Portuguese',
    hi: '🇮🇳 Hindi',
    ja: '🇯🇵 Japanese',
  },
};

// ── Embed colors (semantic palette) ──────────────────────────────────────────
const COLORS = {
  success:  '#10B981',
  error:    '#EF4444',
  warning:  '#F59E0B',
  info:     '#3B82F6',
  purple:   '#7C3AED',
  gray:     '#6B7280',
  premium:  '#7C3AED',
};

module.exports = {
  TICKET, PERM, SLA, ESCALATION, SCHEDULER, LIMITS,
  BRANDING, ASSIGN, VERIFY, DUPLICATE, WEBHOOK_EVENTS, LOCALES, COLORS,
};
