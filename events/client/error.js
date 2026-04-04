/**
 * error.js — Discord client 'error' event
 *
 * Called when the WebSocket encounters an error.
 * Does NOT crash — lets Discord.js auto-reconnect.
 */
const clc = require('cli-color');
const { logError, isNonFatal } = require(`${process.cwd()}/utils/errorHandler`);

module.exports = async (client, error) => {
  const fatal = !isNonFatal(error);
  logError('ClientError', error, fatal);

  // Allow Discord.js to handle reconnection automatically.
  // Only force-restart on truly unknown fatal errors.
  if (fatal) {
    console.error(clc.bgRed.white('[ClientError] Attempting reconnect in 5s…'));
    await new Promise(r => setTimeout(r, 5000));
    try {
      client.destroy();
      await client.login(client.token);
      console.log(clc.greenBright('[ClientError] Reconnected successfully.'));
    } catch (e) {
      console.error(clc.red('[ClientError] Reconnect failed: ' + e.message));
    }
  }
};
