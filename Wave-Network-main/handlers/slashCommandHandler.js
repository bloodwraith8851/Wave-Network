const {
  readdirSync
} = require("fs");
var clc = require("cli-color");
module.exports = async (bot) => {
  try {
    let amount = 0;
    const slashCommandsArray = [];
    readdirSync(`${process.cwd()}/commands/`).forEach((dir) => {
      const slashCommands = readdirSync(`${process.cwd()}/commands/${dir}/`).filter((file) => file.endsWith(".js"));
      for (let file of slashCommands) {
        const pull = require(`${process.cwd()}/commands/${dir}/${file}`);
        if (pull.name) {
          bot.commands.set(pull.name, pull);
          if (["MESSAGE", "USER"].includes(pull.type)) delete pull.description;
          slashCommandsArray.push(pull)
          amount++
        } else {
          try {
            console.log(clc.redBright(`Slash Command Not Loaded: ${file}`))
          } catch (e){
            console.log(e)
          }
          continue;
        }
      }
    });
    try {
      const stringlength = 69;
      console.log("\n")
      console.log(clc.yellowBright(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`))
      console.log(clc.yellowBright(`     ┃ `) + " ".repeat(-1 + stringlength - ` ┃ `.length) + clc.yellowBright("┃"))
      console.log(clc.yellowBright(`     ┃ `) + clc.greenBright(`                   ${clc.cyanBright(amount)} Slash Commands Is Loaded!!`) + " ".repeat(-1 + stringlength - ` ┃ `.length - `                   ${amount} Slash Commands Is Loaded!!`.length) + clc.yellowBright("┃"))
      console.log(clc.yellowBright(`     ┃ `) + " ".repeat(-1 + stringlength - ` ┃ `.length) + clc.yellowBright("┃"))
      console.log(clc.yellowBright(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`)) + '\n'
    } catch (e){
      console.log(e)
    }
  
    bot.on("ready", async () => {
        try {
          // For 1 Server Only👇🏻
          // await bot.guilds.cache.get(bot.config.discord.support_server_id).commands.set(slashCommandsArray);
          // For Global Server👇🏻
          await bot.application.commands.set(slashCommandsArray);
          //For remove all /commands on guilds
          //await bot.application.commands.set([])
        } catch (error) {
          console.log(error)
        }
      })
  } catch (e) {
    console.log(e);
  }
}
