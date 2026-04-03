let clc = require('cli-color');
module.exports = async (client, rateLimitData) => {
    client.logger(clc.cyanBright(JSON.stringify(rateLimitData)));
}
