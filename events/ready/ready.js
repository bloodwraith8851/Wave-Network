/**
 * ready.js — Discord 'ready' client event
 *
 * Fires when the bot shard is fully connected and operational.
 * Prints the beautiful readyPanel and sets rotating presence.
 */
'use strict';
const { ActivityType } = require('discord.js');
const Logger           = require(`${process.cwd()}/utils/logger`);

module.exports = async (client) => {
  try {
    const totalUsers   = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
    const guilds       = client.guilds.cache.size;
    const mem          = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const shardId      = client.shard?.ids?.[0] ?? 0;
    const totalShards  = client.shard?.count ?? 1;
    const pkg          = require(`${process.cwd()}/package.json`);

    Logger.readyPanel({
      tag:         client.user.tag,
      guilds,
      users:       totalUsers.toLocaleString(),
      commands:    client.commands.size,
      ping:        client.ws.ping,
      shardId,
      totalShards,
      version:     pkg.version,
      djsVersion:  require('discord.js').version,
      node:        process.version,
      platform:    `${process.platform} ${process.arch}`,
      memory:      mem,
    });

    // ── Rotating presence ──────────────────────────────────────────────────
    const updatePresence = () => {
      let userDisplay  = totalUsers > 1000 ? `${(totalUsers / 1000).toFixed(1)}K` : totalUsers;
      let guildDisplay = guilds     > 1000 ? `${(guilds     / 1000).toFixed(1)}K` : guilds;

      const activities = [
        `/help  |  Wave Network`,
        `/ticket  |  Wave Network`,
        `${guildDisplay} Servers  |  Wave Network`,
        `${userDisplay} Users  |  Wave Network`,
      ];
      const statuses = ['dnd', 'idle'];

      client.user.setPresence({
        activities: [{
          name: activities[Math.floor(Math.random() * activities.length)],
          type: [ActivityType.Watching, ActivityType.Streaming][Math.floor(Math.random() * 2)],
          url:  'https://www.twitch.tv/sobhan_srza',
        }],
        status: statuses[Math.floor(Math.random() * statuses.length)],
      });
    };

    updatePresence();
    setInterval(updatePresence, 60000);

    Logger.ok('Ready', 'Presence rotation started');

  } catch (e) {
    Logger.error('Ready', 'Error in ready event handler', e);
  }
};
