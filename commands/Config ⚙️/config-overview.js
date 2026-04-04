/**
 * config-overview.js — /config-overview command
 * A read-only snapshot of every guild setting in one paginated embed.
 * Useful for admins to audit the current configuration at a glance.
 */
const {
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);
const slaSvc  = require(`${process.cwd()}/services/slaService`);
const i18nSvc = require(`${process.cwd()}/services/i18nService`);
const { LOCALES, PERM } = require(`${process.cwd()}/utils/constants`);

module.exports = {
  name: 'config-overview',
  description: 'View a complete snapshot of all bot settings for this server.',
  category: 'Config ⚙️',
  cooldown: 10,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.view', client.config, interaction, errorMessage);
    if (denied) return;

    await interaction.deferReply({ ephemeral: true });

    // ── Collect all settings ──────────────────────────────────────────────────
    const [
      adminRoleId,
      modRoleId,
      staffRoleId,
      modlogId,
      autoCloseHours,
      reminderMin,
      ratingsEnabled,
      verifyMode,
      verifyRoleId,
      minAccountAge,
      assignMode,
      slaDefault,
      escalationHours,
      language,
      brandingColor,
      brandingFooter,
      duplicateSens,
    ] = await Promise.all([
      db.get(`guild_${guildId}.permissions.roles.admin`),
      db.get(`guild_${guildId}.permissions.roles.moderator`),
      db.get(`guild_${guildId}.permissions.roles.staff`),
      db.get(`guild_${guildId}.modlog`),
      db.get(`guild_${guildId}.ticket.settings.auto_close_hours`),
      db.get(`guild_${guildId}.ticket.settings.reminder_minutes`),
      db.get(`guild_${guildId}.ticket.settings.ratings_enabled`),
      db.get(`guild_${guildId}.ticket.settings.verification_mode`),
      db.get(`guild_${guildId}.ticket.settings.verification_role`),
      db.get(`guild_${guildId}.ticket.settings.min_account_age_days`),
      db.get(`guild_${guildId}.autoassign.mode`),
      slaSvc.getSLAMinutes(db, guildId, null),
      db.get(`guild_${guildId}.ticket.settings.escalation_hours`),
      i18nSvc.getLocale(db, guildId),
      db.get(`guild_${guildId}.branding.color`),
      db.get(`guild_${guildId}.branding.footer`),
      db.get(`guild_${guildId}.ticket.settings.duplicate_threshold`),
    ]);

    const role   = id => id ? `<@&${id}>` : '`Not set`';
    const ch     = id => id ? `<#${id}>`   : '`Not set`';
    const on     = v  => v ? '✅ On'        : '❌ Off';
    const val    = v  => v !== null && v !== undefined ? `\`${v}\`` : '`Default`';

    // ── Build pages ───────────────────────────────────────────────────────────
    const pages = [
      // Page 1 — Roles & Channels
      premiumEmbed(client, { title: '⚙️  Config Overview  ·  Page 1/4  — Roles & Channels', color: '#7C3AED' })
        .addFields([
          {
            name: '👑  Roles',
            value: [
              `> **Admin Role:**     ${role(adminRoleId)}`,
              `> **Moderator Role:** ${role(modRoleId)}`,
              `> **Staff Role:**     ${role(staffRoleId)}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '📋  Channels',
            value: `> **Mod Log:** ${ch(modlogId)}`,
            inline: false,
          },
          {
            name: '🌐  Language',
            value: `> ${LOCALES.NAMES[language] || '🇬🇧 English (default)'}`,
            inline: true,
          },
          {
            name: '🎨  Branding',
            value: [
              `> **Color:** ${val(brandingColor)}`,
              `> **Footer:** ${val(brandingFooter)}`,
            ].join('\n'),
            inline: true,
          },
        ])
        .setFooter({ text: `Wave Network  •  Config Overview  •  1/4`, iconURL: interaction.guild.iconURL({ dynamic: true }) }),

      // Page 2 — Ticket Settings
      premiumEmbed(client, { title: '⚙️  Config Overview  ·  Page 2/4  — Ticket Settings', color: '#7C3AED' })
        .addFields([
          {
            name: '🎫  Auto-Close & Reminders',
            value: [
              `> **Auto-Close Hours:** ${val(autoCloseHours ?? 48)}`,
              `> **Reminder:** ${val(reminderMin ?? 720)} min`,
              `> **Rating DMs:** ${on(ratingsEnabled !== false)}`,
            ].join('\n'),
            inline: false,
          },
          {
            name: '👤  Auto-Assign',
            value: `> **Mode:** \`${assignMode || 'off'}\``,
            inline: true,
          },
          {
            name: '⏱️  SLA',
            value: [
              `> **Default Target:** \`${slaDefault}min\``,
              `> **Escalation Hours:** \`${escalationHours || 24}h\``,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🔍  Duplicate Detection',
            value: `> **Sensitivity:** \`${duplicateSens || 'medium'}\``,
            inline: false,
          },
        ])
        .setFooter({ text: `Wave Network  •  Config Overview  •  2/4`, iconURL: interaction.guild.iconURL({ dynamic: true }) }),

      // Page 3 — Security & Verification
      premiumEmbed(client, { title: '⚙️  Config Overview  ·  Page 3/4  — Security', color: '#7C3AED' })
        .addFields([
          {
            name: '🔒  Verification Gate',
            value: [
              `> **Mode:** \`${verifyMode || 'none'}\``,
              verifyMode === 'role' ? `> **Required Role:** ${role(verifyRoleId)}` : '',
              verifyMode === 'age'  ? `> **Min Account Age:** \`${minAccountAge || 7} days\`` : '',
            ].filter(Boolean).join('\n'),
            inline: false,
          },
        ])
        .setFooter({ text: `Wave Network  •  Config Overview  •  3/4`, iconURL: interaction.guild.iconURL({ dynamic: true }) }),

      // Page 4 — Data Counts
      async () => {
        const [cannedCount, webhookCount, blacklistCount, faqCount, kbCount] = await Promise.all([
          db.get(`guild_${guildId}.canned_responses`).then(r => (r || []).length),
          db.get(`guild_${guildId}.webhooks`).then(r => (r || []).length),
          db.get(`guild_${guildId}.blacklist_v2`).then(r => (r || []).length),
          db.get(`guild_${guildId}.faq_entries`).then(r => (r || []).length),
          db.get(`guild_${guildId}.knowledge_base`).then(r => (r || []).length),
        ]);
        return premiumEmbed(client, { title: '⚙️  Config Overview  ·  Page 4/4  — Data Counts', color: '#7C3AED' })
          .addFields([
            {
              name: '📦  Stored Data',
              value: [
                `> **Canned Responses:** \`${cannedCount}\``,
                `> **FAQ Entries:** \`${faqCount}\``,
                `> **KB Articles:** \`${kbCount}\``,
                `> **Webhooks:** \`${webhookCount}\``,
                `> **Blacklist Patterns:** \`${blacklistCount}\``,
              ].join('\n'),
              inline: false,
            },
          ])
          .setFooter({ text: `Wave Network  •  Config Overview  •  4/4`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
      },
    ];

    // Resolve async page
    const resolvedPages = await Promise.all(pages.map(p => typeof p === 'function' ? p() : p));

    let page = 0;
    const buildRow = (p) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cov_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
      new ButtonBuilder().setCustomId('cov_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= resolvedPages.length - 1),
    );

    await interaction.editReply({ embeds: [resolvedPages[0]], components: [buildRow(0)] });
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not your session.', ephemeral: true });
      if (btn.customId === 'cov_prev') page--;
      if (btn.customId === 'cov_next') page++;
      await btn.update({ embeds: [resolvedPages[page]], components: [buildRow(page)] });
    });
    collector.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
  },
};
