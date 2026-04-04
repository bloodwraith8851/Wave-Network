/**
 * ecosystem.config.js — PM2 process configuration for production
 *
 * Commands:
 *   pm2 start ecosystem.config.js          ← start/restart
 *   pm2 logs wave-network                  ← live logs
 *   pm2 monit                              ← resource monitor
 *   pm2 save                               ← persist across reboots
 *   pm2 startup                            ← enable auto-start on boot
 *
 * The ShardingManager (shard.js) is the ONLY process PM2 manages.
 * It then spawns each bot shard as child processes internally.
 */
module.exports = {
  apps: [
    {
      name:              'wave-network',
      script:            'shard.js',             // ShardingManager entry point
      instances:         1,                      // ONE ShardingManager per server
      exec_mode:         'fork',                 // NOT cluster — ShardingManager does its own
      autorestart:       true,
      watch:             false,
      max_memory_restart: '1G',

      // Restart behaviour
      restart_delay:     5000,                   // Wait 5s before restarting
      max_restarts:      10,
      min_uptime:        '30s',                  // Must stay up 30s to count as successful

      // Environment
      env: {
        NODE_ENV:     'production',
        HEALTH_PORT:  '8989',
        // SHARD_COUNT: '2',   ← uncomment to override auto-detection
      },
      env_development: {
        NODE_ENV:     'development',
        HEALTH_PORT:  '8989',
      },

      // Logging
      error_file:  './logs/pm2-error.log',
      out_file:    './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:  true,

      // Graceful shutdown
      kill_timeout:   8000,                      // Give processes 8s to exit cleanly
      listen_timeout: 10000,

      // Node.js arguments
      node_args: '--max-old-space-size=512',     // Limit heap per process
    },
  ],
};
