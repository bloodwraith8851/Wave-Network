/**
 * antiCrash.js — LEGACY (superseded by utils/errorHandler.js)
 *
 * The centralised error handler in utils/errorHandler.js already handles:
 *   • unhandledRejection
 *   • uncaughtException
 *   • SIGTERM / SIGINT
 *   • process warnings
 *
 * This file is intentionally left as a no-op so that enabling
 * `anti_crash: true` in config.js doesn't duplicate process listeners.
 *
 * On Railway: process restarts are managed by Railway's restart policy.
 * On PM2:     process restarts are managed by the PM2 ecosystem config.
 */
var clc = require('cli-color');
module.exports = async (client) => {
  if (typeof client?.logger === 'function') {
    client.logger(clc.yellow('[antiCrash] Skipped — utils/errorHandler.js is active.'));
  }
};
