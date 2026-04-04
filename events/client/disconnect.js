/**
 * disconnect.js — Discord client 'disconnect' event
 *
 * Called when the WebSocket closes. We log it, wait briefly,
 * then let the process manager (PM2 / systemd) handle restart
 * rather than calling process.kill() immediately.
 */
const clc = require('cli-color');

module.exports = async (client) => {
  const ts = new Date().toISOString();
  console.error(clc.redBright(`[${ts}] [Disconnect] WebSocket disconnected. Waiting for auto-reconnect…`));

  // Give Discord.js 30 seconds to reconnect on its own (it uses exponential backoff internally)
  await new Promise(r => setTimeout(r, 30000));

  // Check if reconnected
  if (client?.isReady?.()) {
    console.log(clc.greenBright(`[Disconnect] Reconnected successfully.`));
    return;
  }

  // Still not connected — try manual reconnect once
  console.warn(clc.yellow(`[Disconnect] Still disconnected. Attempting manual reconnect…`));
  try {
    await client.login(client.token);
    console.log(clc.greenBright(`[Disconnect] Manual reconnect succeeded.`));
  } catch (e) {
    console.error(clc.red(`[Disconnect] Manual reconnect failed: ${e.message}. Exiting for process manager restart.`));
    process.exit(1);
  }
};
