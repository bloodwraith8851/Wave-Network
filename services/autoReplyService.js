/**
 * autoReplyService.js — Smart Auto-Reply / FAQ suggestion system
 *
 * Phase 4a Update: Rules are now configurable per-guild via /faq-rules.
 * DB key: guild_<id>.auto_reply_rules → Array<{keyword, response, isRegex}>
 *
 * Fallback: if no DB rules exist, uses built-in default rules.
 */

// ── Default hardcoded rules (fallback when no guild-specific rules are set) ──
const DEFAULT_RULES = [
  {
    keyword: 'password',
    response: '🔐 **Password Reset Help**\nPlease visit https://example.com/reset-password or contact an admin.',
    isRegex: false,
  },
  {
    keyword: 'refund',
    response: '💳 **Refund Policy**\nRefunds are processed within 3-5 business days. Please provide your order ID.',
    isRegex: false,
  },
  {
    keyword: 'ban',
    response: '🔨 **Ban Appeal**\nTo appeal your ban, please state your username, the reason for your ban, and why it should be lifted.',
    isRegex: false,
  },
  {
    keyword: 'slow',
    response: '⚙️ **Performance Issues**\nTry clearing your cache and restarting the application. If the problem persists, provide your system specs.',
    isRegex: false,
  },
  {
    keyword: 'error',
    response: '🔍 **Reporting an Error**\nPlease share the full error message, steps to reproduce, and any relevant screenshots.',
    isRegex: false,
  },
];

/**
 * Check a message against guild auto-reply rules and return a matching response.
 * @param {object} db
 * @param {string} guildId
 * @param {string} content — message content to check
 * @returns {Promise<string|null>} matching response text, or null
 */
async function checkAutoReply(db, guildId, content) {
  try {
    // Load guild-specific rules first
    let rules = (await db.get(`guild_${guildId}.auto_reply_rules`)) || [];

    // Fall back to defaults if no guild rules configured
    if (!rules.length) rules = DEFAULT_RULES;

    const lower = content.toLowerCase();

    for (const rule of rules) {
      let matched = false;
      if (rule.isRegex) {
        try {
          const regexMatch = rule.keyword.match(/^\/(.+)\/([gimsuy]*)$/);
          const pattern = regexMatch ? regexMatch[1] : rule.keyword;
          const flags   = regexMatch ? regexMatch[2] : 'i';
          matched = new RegExp(pattern, flags).test(content);
        } catch {
          // Invalid regex — skip
        }
      } else {
        matched = lower.includes(rule.keyword.toLowerCase());
      }

      if (matched) return rule.response;
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { checkAutoReply, DEFAULT_RULES };
