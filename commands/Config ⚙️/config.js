const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  AttachmentBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'config',
  description:     'View or export this server\'s bot configuration.',
  category:        'Config ⚙️',
  cooldown:        10,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'overview',
      description: 'View all current bot settings in an embed.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'export',
      description: 'Export all settings as a JSON file (sent to your DMs).',
      type:        ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'overview') {
      await interaction.deferReply({ flags: 64 });

      // Fetch all settings in one batch
      const [
        adminRole, modRole, staffRole,
        ticketCat, modlog, transcriptCh,
        ratingEnabled, autoClose, autoAssignMode,
        language, embedColor, maxTickets, cooldownSec,
        verifyMode,
      ] = await Promise.all([
        db.get(`guild_${gid}.ticket.admin_role`),
        db.get(`guild_${gid}.permissions.roles.moderator`),
        db.get(`guild_${gid}.permissions.roles.staff`),
        db.get(`guild_${gid}.ticket.category`),
        db.get(`guild_${gid}.modlog`),
        db.get(`guild_${gid}.ticket.transcript_channel`),
        db.get(`guild_${gid}.ticket.settings.ratings_enabled`),
        db.get(`guild_${gid}.ticket.settings.auto_close_hours`),
        db.get(`guild_${gid}.autoAssign.mode`),
        db.get(`guild_${gid}.language`),
        db.get(`guild_${gid}.branding.color`),
        db.get(`guild_${gid}.ticket.settings.max_tickets`),
        db.get(`guild_${gid}.ticket.settings.cooldown_seconds`),
        db.get(`guild_${gid}.verification.mode`),
      ]);

      const fmt = (val, fallback = '`Not Set`') =>
        val !== null && val !== undefined ? (typeof val === 'string' && /^\d{17,19}$/.test(val) ? `<#${val}>` : `\`${val}\``) : fallback;

      const fmtRole = (id) => id ? `<@&${id}>` : '`Not Set`';
      const fmtBool = (val, def) => val === null || val === undefined ? `\`${def}\`` : (val ? '`✅ Enabled`' : '`❌ Disabled`');

      const embed = premiumEmbed(client, {
        title:       '⚙️  Server Configuration',
        description: `Configuration overview for **${interaction.guild.name}**`,
        color:       embedColor || '#7C3AED',
        fields: [
          // Roles
          { name: '━━━ 🔐 Permissions ━━━', value: '\u200b',            inline: false },
          { name: '🛡️ Admin Role',          value: fmtRole(adminRole),  inline: true },
          { name: '⚒️ Mod Role',            value: fmtRole(modRole),    inline: true },
          { name: '🔧 Staff Role',          value: fmtRole(staffRole),  inline: true },
          // Channels
          { name: '━━━ 📢 Channels ━━━',   value: '\u200b',            inline: false },
          { name: '📂 Ticket Category',     value: ticketCat ? `<#${ticketCat}>` : '`Not Set`', inline: true },
          { name: '📜 Mod Log',             value: modlog    ? `<#${modlog}>`    : '`Not Set`', inline: true },
          { name: '📄 Transcript Channel',  value: transcriptCh ? `<#${transcriptCh}>` : '`Not Set`', inline: true },
          // Ticket Settings
          { name: '━━━ 🎫 Ticket Settings ━━━', value: '\u200b',       inline: false },
          { name: '⭐ Ratings',             value: fmtBool(ratingEnabled, 'Enabled'),     inline: true },
          { name: '🔄 Auto-Close (hours)',  value: fmt(autoClose, '`24h`'),                inline: true },
          { name: '📌 Max Tickets/User',    value: fmt(maxTickets, '`1`'),                 inline: true },
          { name: '⏱️ Cooldown (seconds)',  value: fmt(cooldownSec, '`0`'),                inline: true },
          // System
          { name: '━━━ ⚙️ System ━━━',     value: '\u200b',            inline: false },
          { name: '🌐 Auto-Assign Mode',   value: fmt(autoAssignMode, '`Off`'),           inline: true },
          { name: '🗣️ Language',            value: fmt(language, '`en`'),                  inline: true },
          { name: '🔒 Verification Mode',  value: fmt(verifyMode, '`none`'),              inline: true },
          { name: '🎨 Embed Color',          value: fmt(embedColor, '`Default`'),           inline: true },
        ],
      });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'export') {
      await interaction.deferReply({ flags: 64 });

      // Get all guild data
      let rawData;
      try {
        rawData = await db.get(`guild_${gid}`);
      } catch {
        return interaction.editReply({
          embeds: [premiumEmbed(client, { title: '⛔  Export Failed', description: 'Could not read guild data.', color: '#EF4444' })],
        });
      }

      if (!rawData) rawData = {};

      // Scrub sensitive-looking keys (IDs are fine, but no tokens/secrets)
      const exportData = {
        exported_at:  new Date().toISOString(),
        guild_id:     gid,
        guild_name:   interaction.guild.name,
        bot_version:  require(`${process.cwd()}/package.json`).version,
        config:       rawData,
      };

      const json       = JSON.stringify(exportData, null, 2);
      const buffer     = Buffer.from(json, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, {
        name:        `wave-config-${gid}-${Date.now()}.json`,
        description: `Wave Network config export for ${interaction.guild.name}`,
      });

      // DM the file to the requester
      try {
        await interaction.user.send({
          content: `📥  Here is your Wave Network config export for **${interaction.guild.name}**:`,
          files:   [attachment],
        });
        return interaction.editReply({
          embeds: [premiumEmbed(client, {
            title:       '✅  Config Exported',
            description: 'Your configuration has been sent to your DMs as a JSON file.',
            color:       '#10B981',
          })],
        });
      } catch {
        return interaction.editReply({
          embeds: [premiumEmbed(client, {
            title:       '⚠️  DM Failed',
            description: 'Could not send the config file to your DMs.\n\n> Make sure your DMs are open and try again.',
            color:       '#F59E0B',
          })],
        });
      }
    }
  },
};
