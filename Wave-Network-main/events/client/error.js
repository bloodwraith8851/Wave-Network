let clc = require('cli-color');
module.exports = (client, error) => {
  console.warn(error + " occured");
  client.destroy();
  client.login(client.token);
  console.log(clc.redBright(String(error)))
}
