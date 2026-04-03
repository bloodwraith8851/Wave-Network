const clc = require('cli-color');
module.exports = async (client, id) => {
  try {
    client.logger(clc.greenBright(`Shard #${id} Ready`));
  } catch(e) { console.error(e) }
}
