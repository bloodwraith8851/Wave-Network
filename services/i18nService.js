/**
 * i18nService.js — Internationalization / multi-language support
 *
 * Supported locales: en (default), es, fr, de, pt, hi, ja
 *
 * DB key: guild_<id>.language → locale string
 * Locale files: storage/locales/<locale>.json
 *
 * Usage:
 *   const t = await i18n.t(db, guildId);
 *   t('ticket.create.title')  → "New Ticket"  (or translated string)
 */

const path = require('path');
const fs   = require('fs');

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'pt', 'hi', 'ja'];
const DEFAULT_LOCALE    = 'en';

// Cache loaded locale files in memory
const _cache = {};

function _loadLocale(locale) {
  if (_cache[locale]) return _cache[locale];
  const filePath = path.join(process.cwd(), 'storage', 'locales', `${locale}.json`);
  try {
    const data    = fs.readFileSync(filePath, 'utf8');
    _cache[locale] = JSON.parse(data);
    return _cache[locale];
  } catch {
    return {};
  }
}

/**
 * Resolve a dot-path key in an object.
 * e.g. get(obj, 'ticket.create.title') → obj.ticket.create.title
 */
function _get(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

/**
 * Get the translation function for a guild.
 *
 * @param {object} db
 * @param {string} guildId
 * @returns {Promise<(key: string, vars?: object) => string>}
 */
async function t(db, guildId) {
  const locale  = (await db.get(`guild_${guildId}.language`)) || DEFAULT_LOCALE;
  const strings = _loadLocale(locale);
  const fallback = _loadLocale(DEFAULT_LOCALE);

  return (key, vars = {}) => {
    let value = _get(strings, key) ?? _get(fallback, key) ?? key;
    // Variable substitution: {varName} → vars.varName
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return value;
  };
}

/**
 * Get the locale for a guild.
 */
async function getLocale(db, guildId) {
  return (await db.get(`guild_${guildId}.language`)) || DEFAULT_LOCALE;
}

/**
 * Set the locale for a guild.
 */
async function setLocale(db, guildId, locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return false;
  await db.set(`guild_${guildId}.language`, locale);
  return true;
}

module.exports = { t, getLocale, setLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE };
