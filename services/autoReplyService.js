/**
 * autoReplyService.js — Rule-based FAQ auto-suggestion system
 * Matches ticket categories/messages to pre-written help suggestions.
 */

const FAQ_RULES = [
  {
    keywords: ['login', 'login issue', 'sign in', 'signin', 'access', 'account', 'password', 'forgot'],
    response: 'Try resetting your password via the **Forgot Password** link. If locked out, share your username and we\'ll assist you.'
  },
  {
    keywords: ['payment', 'billing', 'charge', 'invoice', 'refund', 'subscription', 'purchase'],
    response: 'For billing issues, please provide your **order/transaction ID**. Refund requests are processed within 3–5 business days.'
  },
  {
    keywords: ['bug', 'bug report', 'error', 'crash', 'broken', 'glitch', 'not working'],
    response: 'Please describe the bug with **steps to reproduce** it and attach any screenshots or error messages.'
  },
  {
    keywords: ['ban appeal', 'ban', 'unban', 'appeal', 'muted', 'kicked', 'punish'],
    response: 'Please provide your **username, the date of the ban**, and the reason shown. Appeals are reviewed within 48 hours.'
  },
  {
    keywords: ['partner', 'partnership', 'collab', 'collaboration', 'affiliate'],
    response: 'Include your **server/community stats** and what kind of partnership you are proposing.'
  },
  {
    keywords: ['feature', 'suggestion', 'request', 'idea', 'add', 'improve'],
    response: 'Describe your feature idea in detail. Our team reviews all suggestions weekly!'
  },
  {
    keywords: ['general', 'other', 'other_issue', 'help', 'question'],
    response: 'Please describe your issue clearly. A staff member will assist you shortly!'
  }
];

/**
 * Get a suggestion based on ticket category/reason and an optional message.
 * @param {string} category — ticket reason/category label
 * @param {string} [message=''] — optional user message for deeper matching
 * @returns {string|null}
 */
function getSuggestion(category = '', message = '') {
  const combined = `${category} ${message}`.toLowerCase();

  for (const rule of FAQ_RULES) {
    if (rule.keywords.some(k => combined.includes(k))) {
      return rule.response;
    }
  }
  return null;
}

/**
 * Get all available FAQ topics as a list.
 */
function getFAQList() {
  return FAQ_RULES.map((r, i) => ({
    index: i + 1,
    keywords: r.keywords.slice(0, 3),
    response: r.response.slice(0, 80) + '...'
  }));
}

module.exports = { getSuggestion, getFAQList };
