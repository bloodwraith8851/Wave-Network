/**
 * rateLimit.js — Discord client 'rateLimit' event
 *
 * Fires whenever a route is rate-limited by the Discord API.
 * Logs the route, timeout, and HTTP method so you can see if
 * a particular command is hammering the API.
 */
const clc = require('cli-color');

module.exports = async (client, rateLimitData) => {
  const ts = new Date().toISOString();
  console.warn(clc.cyanBright(
    `[${ts}] [RateLimit] Route: ${rateLimitData.route}  ` +
    `Method: ${rateLimitData.method}  ` +
    `Timeout: ${rateLimitData.timeout}ms  ` +
    `Global: ${rateLimitData.global}`
  ));
};
