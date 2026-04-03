const clc = require('cli-color');
module.exports = async (client, error, id) => {
  client.logger(clc.redBright(`Shard #${id} Errored: ${error?.message || error}`));
  // NOTE: No process.kill here — shard errors are recoverable.
  // process.kill(1) was crashing on Windows (ESRCH) and caused an infinite crash loop.
}
