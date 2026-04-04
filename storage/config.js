/**
 * config.js — Wave Network Bot Configuration
 *
 * All sensitive values come from environment variables.
 * On Railway: set these in the Railway dashboard → Variables tab.
 * Locally:    create a .env file (see .env.example).
 *
 * Railway automatically provides the PORT variable — never hardcode it.
 */

// Load .env locally (no-op in production where Railway sets vars directly)
try { require('dotenv').config(); } catch { /* dotenv not required in prod */ }

module.exports = {
  source: {
    // Railway provides PORT automatically. Fall back to 3000 for local dev.
    port: parseInt(process.env.PORT || '3000'),

    // Legacy Replit options — disabled for Railway
    anti_crash: false,   // We use Railway's restart policy + our errorHandler instead
    keep_alive: true,    // true = spin up the Express health server Railway pings

    website: {
      support: process.env.SUPPORT_URL || 'https://discord.gg/zeWbHEgNhB',
      domain:  process.env.DOMAIN      || '',
    },

    // OAuth2 (optional — only needed if you use the web dashboard)
    secret:    process.env.USER_SECRET_ID || '',
    client_id: process.env.CLIENT_ID     || '',
    callback:  process.env.OAUTH_CALLBACK || '',
  },

  discord: {
    token:   process.env.TOKEN,
    prefix:  process.env.PREFIX || '!',

    // Invite & support links — override via env vars for flexibility
    invite:         process.env.INVITE_URL
                      || `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot+applications.commands`,
    server_support: process.env.SUPPORT_URL || 'https://discord.gg/zeWbHEgNhB',

    // Your main guild + log channels
    server_id:             process.env.SERVER_ID             || '',
    server_channel_report: process.env.REPORT_CHANNEL_ID     || '',
    server_channel_status: process.env.STATUS_CHANNEL_ID     || '',

    // Optional: channel for critical bot errors (from errorHandler.js)
    error_log_channel:     process.env.ERROR_LOG_CHANNEL_ID  || '',
  },

  vip_role: (process.env.VIP_ROLE_IDS || '').split(',').filter(Boolean),

  owner: (process.env.OWNER_IDS || '829301078687612938').split(',').filter(Boolean),

  whitelist_guilds: (process.env.WHITELIST_GUILD_IDS || '').split(',').filter(Boolean),

  // Sharding — override auto-detection if needed
  shards: process.env.SHARD_COUNT ? parseInt(process.env.SHARD_COUNT) : 'auto',

  // Health check port for ShardingManager (Railway uses PORT, shard.js uses HEALTH_PORT)
  health_port: parseInt(process.env.PORT || process.env.HEALTH_PORT || '3000'),
};
