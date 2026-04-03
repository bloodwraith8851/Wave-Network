const clc = require('cli-color');
module.exports = async (client, id) => {
  client.logger(clc.yellowBright(`Shard #${id} Reconnecting`));
  // NOTE: No process.kill here — reconnecting is normal and the shard will resume.
  // process.kill(1) was crashing on Windows (ESRCH) and caused an infinite crash loop.
}
