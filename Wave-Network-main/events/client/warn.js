let clc = require('cli-color');
module.exports = (client, error) => {
    console.log(clc.redBright(String(error)))
}
