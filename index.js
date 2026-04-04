require('dotenv').config();

const {
  Client,
  Collection,
  IntentsBitField,
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
// Each shard shares the same JSON file — quick.db uses file-level locking.
// For production with many shards consider migrating to PostgreSQL or Redis.
const db = new QuickDB({ driver: new JSONDriver() });

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({
  restRequestTimeout: 15000,
  intents: new IntentsBitField(32767),
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

// ── Logger helper (shard-aware, via unified Logger) ──────────────────────────
client.logger = (msg) => Logger.info(`Shard#${SHARD_ID}`, String(msg));


// ── Global error handler ──────────────────────────────────────────────────────
require(`${process.cwd()}/utils/errorHandler`).install(client);

// ── Load start scripts ────────────────────────────────────────────────────────
const starts  = fs.readdirSync(`${process.cwd()}/start`).filter(f => f.endsWith('.js'));
let   counter = 0;
const SL      = 69;

starts.forEach(file => {
  require(`${process.cwd()}/start/${file}`)(client);
  counter++;
});

Logger.loadedBox('Start scripts', counter);


// ── Login ─────────────────────────────────────────────────────────────────────
if (client.token) {
  // Show a masked token prefix so you can confirm the right token is loaded
  const tokenPreview = client.token.split('.')[0] + '.***';
  Logger.boot(`Authenticating with Discord  [token: ${tokenPreview}]  [Shard#${SHARD_ID}]`);

  client.login(client.token)
    .then(() => {
      // Discord accepted the token — WebSocket handshake now in progress
      Logger.ok('Login', `✅  Token accepted — waiting for Gateway READY  [Shard#${SHARD_ID}]`);
    })
    .catch(e => {
      Logger.fatal('Login', `❌  Login FAILED [Shard#${SHARD_ID}] — check TOKEN and ensure ALL Privileged Intents are enabled in the Discord Developer Portal`, e);
      process.exit(1);
    });
} else {
  Logger.fatal('Config', '❌  TOKEN not set — add TOKEN to your Railway Variables (or .env for local dev)');
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
