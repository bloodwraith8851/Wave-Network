//======== Packages ========
require('dotenv').config()
const { 
  Client, 
  Collection,
  IntentsBitField,
  Partials
} = require('discord.js');
const { 
  QuickDB,
  JSONDriver
} = require(`quick.db`);
const config = require(`${process.cwd()}/storage/config.js`);
const clc = require("cli-color");
const fs = require('fs');
const db = new QuickDB({ 
  driver: new JSONDriver() 
});
const client = new Client({
    restRequestTimeout: 15000,
    intents: new IntentsBitField(32767),
    partials: [
       Partials.Message,
       Partials.Channel,
       Partials.User,
       Partials.GuildMember
    ],
    shards: 'auto',
    allowedMentions: {
      parse: ["roles", "users", "everyone"],
      repliedUser: false,
    },
    ws:{
        properties: {
            browser: "Discord Android",
            os: "Android"
        },
    },
});
client.db = db;
client.config = config;
client.prefix = client.config.discord.prefix;
client.token = client.config.discord.token;
client.emotes = require(`${process.cwd()}/storage/emotes.json`);
client.colors = require(`${process.cwd()}/storage/colors.json`);
client.embed = require(`${process.cwd()}/storage/embed.json`);
client.categories = fs.readdirSync(`${process.cwd()}/commands`);
client.commands = new Collection();
client.cooldowns = new Collection();

//======== Loading Starts =========
let starts = fs.readdirSync(`${process.cwd()}/start`).filter(file => file.endsWith('.js'));
let counter = 0;
let stringlength = 69;
starts.forEach((file) => {
  require(`${process.cwd()}/start/${file}`)(client);
  counter += 1;
});
try {
  console.log("\n")
  console.log(clc.yellowBright(`     ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`))
  console.log(clc.yellowBright(`     ┃ `) + " ".repeat(-1 + stringlength - ` ┃ `.length) + clc.yellowBright("┃"))
  console.log(clc.yellowBright(`     ┃ `) + clc.greenBright(`                   ${clc.magentaBright(counter)} Starts Is Loaded!!`) + " ".repeat(-1 + stringlength - ` ┃ `.length - `                   ${counter} Starts Is Loaded!!`.length) + clc.yellowBright("┃"))
  console.log(clc.yellowBright(`     ┃ `) + " ".repeat(-1 + stringlength - ` ┃ `.length) + clc.yellowBright("┃"))
  console.log(clc.yellowBright(`     ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`))
  console.log("\n")
} catch { /* */ }

//======== Login ========
if(client.token){
    client.login(client.token).catch(e => {
     console.log(clc.red("The Bot Token You Entered Into Your Project Is Incorrect Or Your Bot's INTENTS Are OFF!\n" + e))
   })
  } else {
   console.log(clc.red("Please Write Your Bot Token Opposite The Token In The config.js File In Your Project!"))   
  }

//========== Auto-Services (start after ready) ==========
client.once('clientReady', () => {
  try {
    const autoCloseService   = require('./services/autoCloseService');
    const reminderService    = require('./services/reminderService');
    const weeklyReportService = require('./services/weeklyReportService');
    autoCloseService.start(client);
    reminderService.start(client);
    weeklyReportService.start(client);
  } catch (e) {
    console.error('[AutoServices] Failed to start:', e.message);
  }
});

//========== Login Health Check (Windows-compatible) ==========
// NOTE: process.kill(1) was replaced with process.exit(1).
// On Windows, PID 1 does not exist → process.kill(1) throws ESRCH in an infinite loop.
setInterval(() => {
  if (!client || !client.user) {
    const msg = "The Client didn't login. Check TOKEN in .env and enable ALL Intents in the Discord Developer Portal.";
    if (typeof client.logger === 'function') {
      client.logger(msg);
    } else {
      console.log(clc.red(msg));
    }
    process.exit(1);
  }
}, 10000);
