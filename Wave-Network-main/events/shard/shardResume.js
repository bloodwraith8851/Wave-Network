const clc = require('cli-color');
module.exports = async (client, id, replayedEvents) => {
  client.logger(clc.green(`Shard #${id} Resumed`))
}
