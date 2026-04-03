require('dotenv').config()
module.exports = {
    source: {
        website : {
            support: "https://discord.gg/zeWbHEgNhB",
            domain: ""//you need get your repl.co link in replit with keepAlive code, then replace the link
        },   
        anti_crash: true,//turn on or off the antiCrash file
        keep_alive: true,//turn on or off the keepAlive file
        port: 1528,//don't need to touch or changed
        callback: '',//you need get your repl.co link in replit with keepAlive code, then replace the link right behind of /callback
        secret: process.env.USER_SECRET_ID,//bot secret id, you can get it in discord developer portal
        client_id: process.env.CLIENT_ID,//bot client id, you can get it in discord server or in discord developer portal
    },
    discord: {
        token: process.env.TOKEN,
        prefix: process.env.PREFIX,
        invite: `https://discord.com/oauth2/authorize?client_id=1360664640908038355`,
        server_support: "https://discord.gg/zeWbHEgNhB",
        server_id: "1311389947642515577",
        server_channel_report: "1360685916502495505",
        server_channel_status: "",      
    },
    vip_role: [
        ''
    ],
    owner: [
        '829301078687612938', 
        ''
    ],
    whitelist_guilds: [
      '1311389947642515577',
      '',
      '',
      ''
    ],
};
