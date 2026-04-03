const clc = require('cli-color');
module.exports = async (client, event, id) => {
  client.logger(clc.redBright(`Shard #${id} Disconnected`));
  // NOTE: No process.kill here — disconnects are handled automatically by discord.js.
  // process.kill(1) was crashing on Windows (ESRCH) and caused an infinite crash loop.
}
