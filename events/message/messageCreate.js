const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  Collection,
  ButtonStyle,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require("discord.js");
const {
  HelpCategoryEmbed,
  errorMessage
} = require(`${process.cwd()}/functions/functions`);

module.exports = async (client, message) => {
  const db = client.db;
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  
  // ── Activity Tracking for Tickets ──────────────────────────────────────────
  if (message.channel.name.startsWith('ticket-')) {
    await db.set(`guild_${guildId}.ticket.last_activity_at_${channelId}`, Date.now());

    // Check if author is Staff
    const permSvc = require(`${process.cwd()}/services/permissionService`);
    const analyticsSvc = require(`${process.cwd()}/services/analyticsService`);
    const memberLevel = await permSvc.getMemberLevel(db, message.guild, message.member, client.config);

    if (memberLevel >= 1) {
      // It's a staff member. Check for First Response.
      const firstRespKey = `guild_${guildId}.ticket.first_response_at_${channelId}`;
      const firstResp = await db.get(firstRespKey);

      if (!firstResp) {
        const createdAt = await db.get(`guild_${guildId}.ticket.created_at_${channelId}`);
        if (createdAt) {
          const now = Date.now();
          const duration = now - createdAt;

          await db.set(firstRespKey, now);
          await analyticsSvc.trackEvent(db, guildId, 'first_response', {
            channelId,
            staffId: message.author.id,
            responseTime: duration,
            timestamp: now
          });

          // Log to ModLog if configured
          const logId = await db.get(`guild_${guildId}.modlog`);
          if (logId) {
            const logChannel = message.guild.channels.cache.get(logId);
            if (logChannel) {
              const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);
              const embed = premiumEmbed(client, {
                title: '⏱️  First Response Tracked',
                description: [
                  `**Staff:** ${message.author}`,
                  `**Ticket:** ${message.channel}`,
                  `**Time:** \`${analyticsSvc.formatDuration(duration)}\``
                ].join('\n'),
                color: client.colors?.info || '#3B82F6'
              }).setFooter({ text: `Wave Network  •  Analytics`, iconURL: message.guild.iconURL({ dynamic: true }) });
              await logChannel.send({ embeds: [embed] }).catch(() => null);
            }
          }
        }
      }
    }
  }

  // ── Keyword Blacklist Auto-Moderation ──────────────────────────────────────
  try {
    const blacklistService = require(`${process.cwd()}/services/blacklistService`);
    const matched = await blacklistService.checkMessage(db, message.guild.id, message.content);
    if (matched) {
      await message.delete().catch(() => null);
      const warn = await message.channel.send({
        content: `⚠️ ${message.author}, your message was removed — it contained a **blacklisted word**.`
      });
      setTimeout(() => warn.delete().catch(() => null), 5000);
      return;
    }
  } catch { /* Skip blacklist check on error */ }

  // ── @mention → Help Menu ───────────────────────────────────────────────────
  const contents = [`<@!${client.user.id}>`, `<@${client.user.id}>`];
  if (!contents.includes(message.content)) return;

  // Permission checks
  if (!message.channel.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.SendMessages))
    return message.author.send({ content: `❌ I'm missing \`SendMessages\` in ${message.channel}.` });
  if (!message.channel.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.EmbedLinks))
    return message.reply({ content: `❌ I'm missing \`EmbedLinks\` in ${message.channel}.` });

  const isOwner = client.config.owner.some(id => id === message.author.id);

  // Count commands per category
  const catCounts = {};
  for (const [, c] of client.commands) {
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  }

  const CATS = [
    { label: 'Infos',      value: 'Infos 📊',      emoji: '📊' },
    { label: 'Setup',      value: 'Setup 💻',       emoji: '💻' },
    { label: 'Ticket',     value: 'Ticket 🎫',      emoji: '🎫' },
    { label: 'Staff',      value: 'Staff 🛡️',      emoji: '🛡️' },
    { label: 'Panel',      value: 'Panel 📋',       emoji: '📋' },
    { label: 'Moderation', value: 'Moderation 🔨', emoji: '🔨' },
    { label: 'Community',  value: 'Community 🌐',  emoji: '🌐' },
    { label: 'Config',     value: 'Config ⚙️',      emoji: '⚙️' },
    { label: 'Premium',    value: 'Premium 💎',     emoji: '💎' },
  ];
  if (isOwner) CATS.push({ label: 'Owner', value: 'Owner 👑', emoji: '👑' });

  const guilds = client.guilds.cache.size;
  const users  = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);

  const catLines = CATS
    .filter(c => c.value !== 'Premium 💎')
    .map(c => `${c.emoji}  **${c.label}** \`${catCounts[c.value] || 0}\``)
    .join('  ·  ');

  const help = new EmbedBuilder()
    .setColor('#7C3AED')
    .setAuthor({ name: `${client.user.username}  ·  Help & Commands`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields([
      {
        name: '👋  About Me',
        value: [
          `> Hi👋🏻, I'm **[Wave Network](${client.config.discord.invite}) 🎫**`,
          `> With my help, you can create a completely professional ticket system in your Discord server ⚙️`,
          `> My capabilities and features include fast and strong support, slash commands, message commands, analytics, moderation and much more 🎓`
        ].join('\n'),
        inline: false
      },
      {
        name: '📂  How to See Commands',
        value: '> Select one of the categories from the **dropdown menu below** to see all commands in that section.',
        inline: false
      },
      {
        name: '📊  Categories',
        value: catLines || 'Loading...',
        inline: false
      },
      { name: '🏠  Servers',  value: `\`${guilds}\``,    inline: true },
      { name: '👥  Users',    value: `\`${users}\``,     inline: true },
      { name: '⚡  Commands', value: `\`${client.commands.size}\``, inline: true }
    ])
    .setFooter({ text: `Requested by ${message.author.tag}  ·  Wave Network`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setTimestamp();


  const help_menu = new StringSelectMenuBuilder()
    .setCustomId('help_menu')
    .setMaxValues(1).setMinValues(1)
    .setPlaceholder('📂  Select a category...')
    .addOptions(CATS.map(c => ({ label: c.label, value: c.value, emoji: c.emoji })));

  const home_btn = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Home').setEmoji('🏠').setCustomId('home_page');
  const inv_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(client.config.discord.invite);
  const sup_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(client.config.discord.server_support);

  const makeComponents = (homeDisabled) => [
    new ActionRowBuilder().addComponents(help_menu.setDisabled(false)),
    new ActionRowBuilder().addComponents(home_btn.setDisabled(homeDisabled), inv_btn, sup_btn)
  ];

  const embedMessage = await message.reply({ embeds: [help], components: makeComponents(true) });
  const collector = embedMessage.createMessageComponentCollector({ time: 120000 });

  collector.on('collect', async m => {
    if (m.user.id !== message.author.id) {
      return m.reply({ content: `❌ Only ${message.author} can use this menu.`, ephemeral: true });
    }
    if (m.isButton() && m.customId === 'home_page') {
      return m.update({ embeds: [help], components: makeComponents(true) });
    }
    if (m.isStringSelectMenu() && m.customId === 'help_menu') {
      return HelpCategoryEmbed(client.commands, m.values[0], client, m, makeComponents(false));
    }
  });

  collector.on('end', () => {
    embedMessage.edit({
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('exp').setLabel('Expired').setStyle(ButtonStyle.Secondary).setDisabled(true),
        inv_btn, sup_btn
      )]
    }).catch(() => null);
  });
};
