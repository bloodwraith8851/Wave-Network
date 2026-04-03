/**
 * config.js — /config view | reset | set <key> <value>
 * View and manage all server configuration in one place.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name: 'config',
  description: 'View or reset all bot settings for this server.',
  category: 'Config ⚙️',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name: 'view',
      description: 'View all current settings.',
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: 'reset',
      description: '⚠️ Reset ALL bot settings to default for this server.',
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: 'set',
      description: 'Set a specific bot config value.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'key',
          description: 'Config key to set.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: [
            { name: 'Suggestion Channel', value: 'suggest_channel' },
            { name: 'Auto-Close Hours (0=off)', value: 'auto_close_hours' },
            { name: 'Reminder Minutes (0=off)', value: 'reminder_minutes' },
            { name: 'Reopen Limit (0=unlimited)', value: 'reopen_limit' }
          ]
        },
        { name: 'value', description: 'Value to set (channel mention or number).', type: ApplicationCommandOptionType.String, required: true }
      ]
    }
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'view') {
      const adminRole       = await db.get(`guild_${gid}.ticket.admin_role`);
      const category        = await db.get(`guild_${gid}.ticket.category`);
      const modlog          = await db.get(`guild_${gid}.modlog`);
      const transcriptCh    = await db.get(`guild_${gid}.ticket.settings.transcript_channel`);
      const maxTickets      = await db.get(`guild_${gid}.ticket.settings.max_tickets`) || 1;
      const cooldown        = await db.get(`guild_${gid}.ticket.settings.cooldown_seconds`) || 300;
      const autoCloseHours  = await db.get(`guild_${gid}.ticket.settings.auto_close_hours`) ?? 24;
      const remindMin       = await db.get(`guild_${gid}.ticket.settings.reminder_minutes`) ?? 30;
      const suggestCh       = await db.get(`guild_${gid}.suggest_channel`);
      const reopenLimit     = await db.get(`guild_${gid}.ticket.settings.reopen_limit`) || 0;
      const blacklist       = (await db.get(`guild_${gid}.blacklist`) || []).length;

      const ch = (id) => id ? `<#${id}>` : '`Not set`';
      const role = (id) => id ? `<@&${id}>` : '`Not set`';

      const embed = premiumEmbed(client, {
        title: `⚙️  Server Config — ${interaction.guild.name}`,
        description: 'Current bot configuration for this server.',
        color: '#7C3AED'
      })
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .addFields([
          { name: '🎫  Ticket System', value: [`> **Admin Role:** ${role(adminRole)}`, `> **Ticket Category:** ${category ? `<#${category}>` : '`Not set`'}`, `> **Mod Log:** ${ch(modlog)}`, `> **Transcript Channel:** ${ch(transcriptCh)}`, `> **Max Open Tickets:** \`${maxTickets}\``, `> **Cooldown:** \`${cooldown}s\``].join('\n'), inline: false },
          { name: '🤖  Automation', value: [`> **Auto-Close:** \`${autoCloseHours ? `${autoCloseHours}h` : 'Disabled'}\``, `> **Reminder:** \`${remindMin ? `${remindMin}m` : 'Disabled'}\``, `> **Reopen Limit:** \`${reopenLimit || 'Unlimited'}\``].join('\n'), inline: true },
          { name: '🌐  Community', value: [`> **Suggest Channel:** ${ch(suggestCh)}`, `> **Blacklisted Words:** \`${blacklist}\``].join('\n'), inline: true }
        ])
        .setFooter({ text: `Use /settings to change ticket settings  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'reset') {
      // List all guild keys and delete them
      const keys = [
        `guild_${gid}.ticket.admin_role`, `guild_${gid}.ticket.category`, `guild_${gid}.modlog`,
        `guild_${gid}.ticket.settings`, `guild_${gid}.suggest_channel`,
        `guild_${gid}.blacklist`, `guild_${gid}.panels`
      ];
      for (const k of keys) await db.delete(k).catch(() => null);

      const embed = premiumEmbed(client, {
        title: '⚠️  Config Reset',
        description: 'All server settings have been **reset to default**.\nPlease run `/settings` to reconfigure the bot.',
        color: '#EF4444'
      }).setFooter({ text: `Wave Network  •  Config Reset`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'set') {
      const key   = interaction.options.getString('key');
      const value = interaction.options.getString('value');

      if (key === 'suggest_channel') {
        const chId = value.replace(/[<#>]/g, '');
        const ch   = interaction.guild.channels.cache.get(chId);
        if (!ch) return errorMessage(client, interaction, 'Invalid channel. Mention a valid channel.');
        await db.set(`guild_${gid}.suggest_channel`, chId);
        return interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Config Updated', description: `Suggestion channel set to ${ch}.`, color: '#10B981' })], ephemeral: true });
      }

      const numMap = {
        auto_close_hours: `guild_${gid}.ticket.settings.auto_close_hours`,
        reminder_minutes: `guild_${gid}.ticket.settings.reminder_minutes`,
        reopen_limit:     `guild_${gid}.ticket.settings.reopen_limit`
      };

      if (numMap[key]) {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) return errorMessage(client, interaction, 'Value must be a non-negative number.');
        await db.set(numMap[key], num);
        return interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Config Updated', description: `**${key}** set to \`${num}\`.`, color: '#10B981' })], ephemeral: true });
      }
    }
  }
};
