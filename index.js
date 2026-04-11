require('dotenv').config();

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Options,
} = require('discord.js');
const { ClusterClient, getInfo } = require('discord-hybrid-sharding');
const { QuickDB, JSONDriver } = require('quick.db');
const config           = require(`${process.cwd()}/storage/config.js`);
const Logger           = require(`${process.cwd()}/utils/logger`);
const UIEngine         = require(`${process.cwd()}/core/UIEngine`);
const CacheLayer       = require(`${process.cwd()}/core/CacheLayer`);
const ServiceContainer = require(`${process.cwd()}/core/ServiceContainer`);
const { CommandEngine } = require(`${process.cwd()}/core/CommandEngine`);
const fs               = require('fs');


// ── Cluster Identity ────────────────────────────────────────────────────────────
let CLUSTER_INFO = null;
try { Object.keys(process.env).forEach(k => k.startsWith('CLUSTER') && (CLUSTER_INFO = getInfo())); } catch(e) {}
const SHARD_ID         = CLUSTER_INFO ? CLUSTER_INFO.CLUSTER : 'standalone';
const SHARDING_ENABLED = !!CLUSTER_INFO;

// ── Database ──────────────────────────────────────────────────────────────────
// Optimized: Returning to JSONDriver for build compatibility.
// Performance is maintained via the new Caching Layer and Activity Tracking.
const db = new QuickDB({ 
  driver: new JSONDriver('database.json') 
});

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({
  restRequestTimeout: 15000,
  ...(CLUSTER_INFO ? { shards: CLUSTER_INFO.SHARD_LIST, shardCount: CLUSTER_INFO.TOTAL_SHARDS } : {}),
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
  // RAM Optimization: aggressively cull cached items
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    GuildMemberManager: {
      maxSize: 200,
      keepOverLimit: member => member.id === member.client.user.id,
    },
    ThreadManager: 10,
    PresenceManager: 0,
    ReactionManager: 0,
  }),
  // Prevent long-term memory leaks
  sweepers: {
    messages: {
      interval: 3600, // Sweep every hour
      lifetime: 7200, // Remove messages older than 2 hours
    },
    threads: {
      interval: 3600,
      lifetime: 7200,
    },
  },
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
client.cluster    = new ClusterClient(client);

// ── Core Engine Layer ─────────────────────────────────────────────────────────
// CacheLayer: write-batching + read-through TTL cache (replaces raw db.get)
const cache = new CacheLayer(db);
cache.start();
client.cache = cache;

// UIEngine: global embed factory + design system
client.ui = UIEngine.init(client);

// CommandEngine: unified middleware pipeline dispatcher
client.commandEngine = new CommandEngine(client);

// ServiceContainer: DI container for all 24 services
const container = new ServiceContainer();
container
  .register('ticket',           require('./services/ticketService'))
  .register('analytics',        require('./services/analyticsService'))
  .register('cache',            cache)
  .register('permission',       require('./services/permissionService'))
  .register('transcript',       require('./services/transcriptService'))
  .register('rating',           require('./services/ratingService'))
  .register('antiAbuse',        require('./services/antiAbuseService'))
  .register('autoReply',        require('./services/autoReplyService'))
  .register('autoAssign',       require('./services/autoAssignService'))
  .register('duplicate',        require('./services/duplicateService'))
  .register('webhook',          require('./services/webhookService'))
  .register('kb',               require('./services/kbService'))
  .register('verification',     require('./services/verificationService'))
  .register('sla',              require('./services/slaService'))
  .register('escalation',       require('./services/escalationService'))
  .register('scheduledMessage', require('./services/scheduledMessageService'))
  .register('audit',            require('./services/auditService'))
  .register('blacklist',        require('./services/blacklistService'))
  .register('reminder',         require('./services/reminderService'))
  .register('autoClose',        require('./services/autoCloseService'))
  .register('weeklyReport',     require('./services/weeklyReportService'))
  .register('canned',           require('./services/cannedService'))
  .register('moderation',       require('./services/moderationService'));

client.services = container;

// ── Shared Collections / Maps ────────────────────────────────────────────────
client.Commands   = client.commands; // backward-compat alias
client.guildCache = new Map();       // legacy cache map (kept for compatibility)
client.inviteData = new Map();       // used by verificationService

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
  Logger.boot(`Authenticating with Discord  [Shard#${SHARD_ID}]`);

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
client.once('clientReady', async () => {
  try {
    const shardGuilds = client.guilds.cache.size;
    Logger.ok(`Shard#${SHARD_ID}`, `Logged in as ${client.user.tag}  •  Guilds: ${shardGuilds}  •  Ping: ${client.ws.ping}ms`);

  // ── Start all services via ServiceContainer ───────────────────────────────
    await container.startAll(client);

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
