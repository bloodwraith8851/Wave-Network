const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'sla',
  description:     'Configure SLA (Service Level Agreement) response targets.',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'set',
      description: 'Set the target SLA time (in minutes).',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'minutes',
        description: 'Target response time (e.g. 15 for 15 minutes).',
        type:        ApplicationCommandOptionType.Integer,
        required:    true,
        min_value:   1,
        max_value:   10080, // 1 week
      }],
    },
    {
      name:        'view',
      description: 'View current SLA target and metrics.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'reset',
      description: 'Disable the SLA target.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const minutes = interaction.options.getInteger('minutes');
      await db.set(`guild_${gid}.sla.target_minutes`, minutes);
      client.cache?.invalidate?.(gid);

      const hours = (minutes / 60).toFixed(1);
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  SLA Configured',
          description: `Target response time set to **${minutes} minutes** (${hours} hours).\n\nTickets exceeding this wait time will be flagged.`,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'view') {
      const target = await db.get(`guild_${gid}.sla.target_minutes`);
      if (!target) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '⏱️  SLA Configuration',
            description: 'No SLA target is currently configured. Use `/sla set` to define one.',
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      // Fetch limited analytics for context
      const stats = await db.get(`guild_${gid}.analytics.response_times`) || [];
      const avgMs = stats.length ? stats.reduce((a, b) => a + b, 0) / stats.length : null;
      const avgStr = avgMs ? `${(avgMs / 60000).toFixed(1)} mins` : 'N/A';

      const breached = (await db.get(`guild_${gid}.sla.breaches_total`)) || 0;

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '⏱️  SLA Configuration',
          description: `**Target:** ${target} minutes\n\n**Current Avg Response:** ${avgStr}\n**Total Breaches:** ${breached}`,
          color:       '#7C3AED',
        })],
        flags: 64,
      });
    }

    if (sub === 'reset') {
      await db.delete(`guild_${gid}.sla.target_minutes`);
      client.cache?.invalidate?.(gid);
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  SLA Disabled',
          description: 'SLA targeting has been removed.',
          color:       '#10B981',
        })],
        flags: 64,
      });
    }
  },
};
