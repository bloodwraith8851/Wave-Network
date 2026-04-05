require('dotenv').config();

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const { QuickDB, JSONDriver } = require('quick.db');
const config = require(`${process.cwd()}/storage/config.js`);
const Logger = require(`${process.cwd()}/utils/logger`);
const fs     = require('fs');


// ── Shard identity ────────────────────────────────────────────────────────────
const SHARD_ID         = process.env.SHARDING_ENABLED === 'true'
  // When launched by ShardingManager, discord.js injects SHARDS env var
  ? (process.env.SHARDS ?? 'N/A')
  : 'standalone';
const SHARDING_ENABLED = process.env.SHARDING_ENABLED === 'true';

// ── Database ──────────────────────────────────────────────────────────────────
// Optimized: Returning to JSONDriver for build compatibility.
// Performance is maintained via the new Caching Layer and Activity Tracking.
const db = new QuickDB({ 
  driver: new JSONDriver('database.json') 
});

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({
  restRequestTimeout: 15000,
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.User,
    Partials.GuildMember,
  ],
  // DO NOT set `shards` here — it is handled by the ShardingManager in shard.js
  allowedMentions: {
    parse:       ['roles', 'users', 'everyone'],
    repliedUser: false,
  },
  ws: {
    properties: {
      browser: 'Discord Android',
      os:      'Android',
    },
  },
});

// ── Cache ─────────────────────────────────────────────────────────────────────
// Global cache for guild settings to avoid redundant DB reads
client.guildCache = new Map();

// ── Config Validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['TOKEN', 'CLIENT_ID'];
const missing = REQUIRED_ENV.filter(key => !process.env[key] && !config.discord[key.toLowerCase()]);
if (missing.length > 0) {
  Logger.fatal('Config', `❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Attach globals to client ──────────────────────────────────────────────────
client.db         = db;
client.config     = config;
client.prefix     = config.discord.prefix;
client.token      = config.discord.token;
client.emotes     = require(`${process.cwd()}/storage/emotes.json`);
client.colors     = require(`${process.cwd()}/storage/colors.json`);
client.embed      = require(`${process.cwd()}/storage/embed.json`);
client.categories = fs.readdirSync(`${process.cwd()}/commands`);
client.commands   = new Collection();
client.cooldowns  = new Collection();
client.shardId    = SHARD_ID;

// ── Shared Collections / Maps (Phase 1 Fixes) ────────────────────────────────
client.Commands   = client.commands; // Internal alias for legacy compatibility
client.inviteData = new Map();       // Used by verificationService

// ── Logger helper (shard-aware, via unified Logger) ──────────────────────────
client.logger = (msg) => Logger.info(`Shard#${SHARD_ID}`, String(msg));


// ── Global error handler ──────────────────────────────────────────────────────
require(`${process.cwd()}/utils/errorHandler`).install(client);

// ── Load start scripts ────────────────────────────────────────────────────────
const starts  = fs.readdirSync(`${process.cwd()}/start`).filter(f => f.endsWith('.js'));
let   counter = 0;

starts.forEach(file => {
  try {
    require(`${process.cwd()}/start/${file}`)(client);
    counter++;
  } catch (e) {
    Logger.error('Start', `Failed to load start script: ${file}`, e);
  }
});

Logger.loadedBox('Start scripts', counter);


// ── Login ─────────────────────────────────────────────────────────────────────
if (client.token) {
  // Show a masked token prefix so you can confirm the right token is loaded
  const tokenPreview = client.token.split('.')[0].slice(0, 5) + '...';
  Logger.boot(`Authenticating with Discord  [token: ${tokenPreview}]  [Shard#${SHARD_ID}]`);

  client.login(client.token)
    .then(() => {
      Logger.ok('Login', `✅  Token accepted — waiting for Gateway READY  [Shard#${SHARD_ID}]`);
    })
    .catch(e => {
      Logger.fatal('Login', `❌  Login FAILED [Shard#${SHARD_ID}] — check TOKEN and ensure ALL Privileged Intents are enabled`, e);
      process.exit(1);
    });
} else {
  Logger.fatal('Config', '❌  TOKEN not set — check your environment variables.');
  process.exit(1);
}



// ── Services: start ONCE per shard after bot is ready ────────────────────────
// Note: Discord.js v14 renamed 'ready' → 'clientReady'. Using clientReady avoids the DeprecationWarning.
client.once('clientReady', () => {
  try {
    const shardGuilds = client.guilds.cache.size;
    Logger.ok(`Shard#${SHARD_ID}`, `Logged in as ${client.user.tag}  •  Guilds: ${shardGuilds}  •  Ping: ${client.ws.ping}ms`);

    // ── Core autonomous services ───────────────────────────────────────────
    require('./services/autoCloseService').start(client);
    require('./services/reminderService').start(client);
    require('./services/weeklyReportService').start(client);

    // ── Phase 4b services ──────────────────────────────────────────────────
    require('./services/slaService').startSLAMonitor(client);
    require('./services/escalationService').startEscalationMonitor(client);
    require('./services/scheduledMessageService').init(client);

    Logger.ok('Services', `All background services started ✅  [Shard#${SHARD_ID}]`);

    // Report health to ShardingManager
    try {
      process.send?.({
        _type:   'shard_ping',
        shardId: SHARD_ID,
        guilds:  shardGuilds,
        ping:    client.ws.ping,
      });
    } catch { /* standalone mode */ }

  } catch (e) {
    Logger.error('Services', `Failed to start background services on Shard#${SHARD_ID}`, e);
  }
});

// ── Health check: 30s grace before enforcing login ───────────────────────────
let _healthSkips  = 0;
const GRACE_COUNT = 3;   // 3 × 10s = 30s grace
setInterval(() => {
  if (_healthSkips < GRACE_COUNT) { _healthSkips++; return; }
  if (!client?.user) {
    Logger.fatal(`Shard#${SHARD_ID}`, 'Client not logged in after grace period — check TOKEN and Intents. Exiting.');
    process.exit(1);
  }
}, 10000);

// ── Inter-shard keep-alive ping every 2 minutes ───────────────────────────────
setInterval(() => {
  if (!client?.user) return;
  try {
    process.send?.({
      _type:   'shard_ping',
      shardId: SHARD_ID,
      guilds:  client.guilds.cache.size,
      ping:    client.ws.ping,
    });
  } catch { /* standalone mode — no IPC */ }
}, 2 * 60 * 1000);
