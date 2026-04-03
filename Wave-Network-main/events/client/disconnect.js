let clc = require('cli-color');
module.exports = async (client) => {
    client.logger(clc.redBright(`You have been disconnected at ${new Date()}.`));
    setInterval(() => {
     if(!client || !client.user) {
      console.log("The Client Didn't Login Proccesing Kill 1")
        process.kill(1);
    } else {
   }
  }, 10000); 
}
