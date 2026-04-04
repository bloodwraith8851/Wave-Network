/**
 * warn.js — Discord client 'warn' event
 *
 * Discord.js emits this for non-critical issues like rate limit warnings
 * or deprecated API usage. We log them with structured output.
 */
const clc = require('cli-color');

// Suppress noisy known warnings we don't need to act on
const SUPPRESS_PATTERNS = [
  /Already been acknowledged/i,
  /Unrecognized guild member flags/i,
];

module.exports = (client, warning) => {
  const msg = String(warning);
  if (SUPPRESS_PATTERNS.some(r => r.test(msg))) return;
  const ts = new Date().toISOString();
  console.warn(clc.yellow(`[${ts}] [ClientWarn] ${msg}`));
};
