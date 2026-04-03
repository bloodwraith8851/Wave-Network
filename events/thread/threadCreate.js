const clc = require('cli-color');
module.exports = async (client, thread) => {
 try{
  if (thread.joinable) await thread.join();
 }catch (error){
     console.log(clc.redBright(error))
 }
}
