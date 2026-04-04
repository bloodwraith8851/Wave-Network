/**
 * help.js — /help command
 *
 * Category browser with dropdown + paginated embeds.
 * Now includes all Phase 3–4d commands:
 *   Config:    permissions, branding, faq-rules, sla, auto-assign, webhook,
 *              verify, language, config-export, config-overview, blacklist
 *   Staff:     canned, ticket-tag, ticket-search, shift, note, staff-stats
 *   Community: faq, kb, poll, announce, report, suggest, feedback
 *   Ticket:    ticket-forward, ticket-merge, schedule-close
 *   Infos:     analytics, status, uptime, botinfo, serverinfo, userinfo, ping
 */
const {
  ButtonBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { HelpCategoryEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

// ── Category config (order matters — sets dropdown order) ────────────────────
const CATEGORIES = [
  { label: 'Infos',       value: 'Infos 📊',        emoji: '📊', color: '#6366F1',
    desc: 'Bot info, analytics, status, uptime, server/user info' },
  { label: 'Setup',       value: 'Setup 💻',         emoji: '💻', color: '#8B5CF6',
    desc: 'Initial bot setup and settings configuration' },
  { label: 'Ticket',      value: 'Ticket 🎫',        emoji: '🎫', color: '#7C3AED',
    desc: 'Create, manage, merge, forward, and schedule tickets' },
  { label: 'Staff',       value: 'Staff 🛡️',        emoji: '🛡️', color: '#EC4899',
    desc: 'Canned responses, notes, tags, search, shift tracker, stats' },
  { label: 'Panel',       value: 'Panel 📋',         emoji: '📋', color: '#3B82F6',
    desc: 'Ticket panels and UI creation' },
  { label: 'Moderation',  value: 'Moderation 🔨',   emoji: '🔨', color: '#EF4444',
    desc: 'Warn, timeout, slowmode, warnings management' },
  { label: 'Community',   value: 'Community 🌐',    emoji: '🌐', color: '#10B981',
    desc: 'FAQ, knowledge base, polls, suggestions, feedback' },
  { label: 'Config',      value: 'Config ⚙️',        emoji: '⚙️', color: '#F59E0B',
    desc: 'SLA, auto-assign, verification, webhooks, branding, i18n, blacklist' },
  { label: 'Premium',     value: 'Premium 💎',       emoji: '💎', color: '#F59E0B',
    desc: 'Premium exclusive features' },
];
const OWNER_CAT = { label: 'Owner', value: 'Owner 👑', emoji: '👑', color: '#EF4444', desc: 'Owner-only commands' };

// ── New command quick-reference per category (shown in landing embed) ────────
const NEW_COMMANDS = {
  'Config ⚙️':    '`/sla` `/auto-assign` `/webhook` `/verify` `/language` `/config-export` `/config-overview` `/blacklist` `/permissions` `/branding`',
  'Staff 🛡️':    '`/note` `/shift` `/staff-stats` `/canned` `/ticket-tag` `/ticket-search` `/ticket-forward` `/ticket-merge` `/ticket-claim` `/ticket-priority` `/schedule-close` `/schedule-message`',
  'Community 🌐': '`/feedback` `/faq` `/kb` `/poll` `/suggest` `/announce` `/report`',
  'Infos 📊':     '`/analytics` overview · trend · categories · ratings',
  'Moderation 🔨':'`/warn` `/warnings` `/clearwarnings` `/timeout` `/slowmode`',
};


module.exports = {
  name: 'help',
  description: 'Browse all bot commands by category, or look up a specific command.',
  category: 'Infos 📊',
  type: ApplicationCommandType.ChatInput,
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [{
    name: 'command',
    description: 'Look up a specific command by name.',
    type: ApplicationCommandOptionType.String,
    required: false,
  }],

  run: async (client, interaction) => {
    const commandName = interaction.options.getString('command');
    const isOwner     = client.config.owner.some(id => id === interaction.user.id);

    // ── /help <command> — single command detail ───────────────────────────
    if (commandName) {
      const cmd = client.commands.get(commandName.toLowerCase());
      if (!cmd) return interaction.reply({ content: `❌  \`/${commandName}\` is not a recognised command. Use \`/help\` to browse.`, flags: 64 });
      if (cmd.category === 'Owner 👑' && !isOwner) return errorMessage(client, interaction, 'You do not have permission to view this command.');

      const cm = client.application.commands.cache.find(c => c.name === cmd.name);
      if (!cm) return interaction.reply({ content: `❌  Command not yet synced with Discord. Please wait a moment.`, flags: 64 });

      const opts    = cm.options || [];
      const hasSubs = opts.some(o => o.type === ApplicationCommandOptionType.Subcommand || o.type === 1);
      const lines   = [];

      lines.push(`> ${cm.description}`);
      lines.push('');

      if (hasSubs) {
        lines.push('**Subcommands**');
        opts
          .filter(o => o.type === ApplicationCommandOptionType.Subcommand || o.type === 1)
          .forEach((sub, i, arr) => {
            const params = (sub.options || []).map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
            const prefix = i === arr.length - 1 ? '╰' : '├';
            lines.push(`\`${prefix} ${sub.name}${params ? ' ' + params : ''}\` — ${sub.description}`);
          });
      } else {
        const params = opts.filter(o => o.type > 2).map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
        if (params) lines.push(`**Usage**\n\`/${cm.name} ${params}\``);
        if (opts.length) {
          lines.push('');
          lines.push('**Options**');
          opts.filter(o => o.type > 2).forEach(o => {
            lines.push(`\`${o.required ? '●' : '○'} ${o.name}\` — ${o.description}`);
          });
        }
      }

      if (cmd.userPermissions?.length) lines.push(`\n**Required Permissions** — ${cmd.userPermissions.map(p => `\`${p}\``).join(' ')}`);
      if (cmd.cooldown) lines.push(`**Cooldown** — \`${cmd.cooldown}s\``);
      if (cmd.category)  lines.push(`**Category** — ${cmd.category}`);

      const catConfig = [...CATEGORIES, OWNER_CAT].find(c => c.value === cmd.category);

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(catConfig?.color || '#7C3AED')
            .setAuthor({ name: `/${cm.name}  ·  ${cmd.category}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
            .setDescription(lines.join('\n'))
            .setFooter({ text: `<required>  [optional]  ·  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(client.config.discord.invite),
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(client.config.discord.server_support),
        )],
      });
    }

    // ── /help — full category browser ────────────────────────────────────
    const cats      = isOwner ? [...CATEGORIES, OWNER_CAT] : CATEGORIES;
    const totalCmds = client.commands.size;

    // Count per category
    const catCounts = {};
    for (const [, cmd] of client.commands) {
      catCounts[cmd.category] = (catCounts[cmd.category] || 0) + 1;
    }

    const guilds = client.guilds.cache.size;
    const users  = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);

    // ── Category summary table (Two Columns) ───────────────────────────────
    const filteredCats = cats.filter(c => c.value !== 'Premium 💎' && c.value !== 'Owner 👑');
    const catChunks = filteredCats.map(c => {
      const count = catCounts[c.value] || 0;
      return `**${c.emoji} ${c.label}** (\`${count}\`)\n└ *${c.desc.slice(0, 42)}...*`;
    });

    const col1 = catChunks.filter((_, i) => i % 2 === 0).join('\n\n');
    const col2 = catChunks.filter((_, i) => i % 2 !== 0).join('\n\n');

    // ── Highlight new Phase 4 commands ────────────────────────────────────
    const highlightLines = Object.entries(NEW_COMMANDS)
      .map(([cat, cmds]) => `**${cat}**\n└ ${cmds.split(' ').map(c => c.startsWith('`') ? c : `*${c}*`).join(' ')}`)
      .join('\n\n');

    const help = new EmbedBuilder()
      .setColor('#7C3AED')
      .setAuthor({ name: `${client.user.username}  ·  Command Center`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setDescription([
        `## Welcome to Wave Network 👋`,
        `Your complete **SaaS-level** Discord ticketing solution. Featuring advanced SLA tracking, intuitive staff panels, deep analytics, and native multilanguage support.`,
        ``,
        `**Quick Navigation:**`,
        `> 📂 Use the **Dropdown Menu** to seamlessly browse categories.`,
        `> 🔍 Use \`/help <command>\` to view deep-dive documentation on any command.`
      ].join('\n'))
      .addFields([
        { name: '╭──  Core Modules', value: col1 || 'Loading…', inline: true },
        { name: '╭──  Extensions', value: col2 || 'Loading…', inline: true },
        { name: '\u200B', value: '────────────────────────────────────────', inline: false }, 
        { name: '✨  Latest Command Additions', value: highlightLines, inline: false },
        { name: '\u200B', value: '────────────────────────────────────────', inline: false }, 
        { name: '📈  Network Statistics', value: `**Servers Hosted:** \`${guilds}\`  |  **Total Users:** \`${users}\`  |  **Active Commands:** \`${totalCmds}\``, inline: false },
      ])
      .setFooter({ text: `Wave Network v4.0.0  ·  Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    // Build dropdown
    const help_menu = new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setMaxValues(1)
      .setMinValues(1)
      .setPlaceholder('📂  Select a category…')
      .addOptions(cats.map(c => ({
        label:       c.label,
        value:       c.value,
        emoji:       c.emoji,
        description: c.desc?.slice(0, 50),
      })));

    const home_btn = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Home').setEmoji('🏠').setCustomId('home_page');
    const inv_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(client.config.discord.invite);
    const sup_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(client.config.discord.server_support);

    const makeComponents = (homeDisabled) => [
      new ActionRowBuilder().addComponents(help_menu),
      new ActionRowBuilder().addComponents(
        home_btn.setDisabled(homeDisabled),
        inv_btn,
        sup_btn,
      ),
    ];

    await interaction.reply({ embeds: [help], components: makeComponents(true) });
    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async m => {
      if (m.user.id !== interaction.user.id) {
        return m.reply({ content: `❌  Only ${interaction.user} can use this menu.`, flags: 64 });
      }
      if (m.isButton() && m.customId === 'home_page') {
        return m.update({ embeds: [help], components: makeComponents(true) });
      }
      if (m.isStringSelectMenu() && m.customId === 'help_menu') {
        return HelpCategoryEmbed(client.commands, m.values[0], client, m, makeComponents(false));
      }
    });

    collector.on('end', () => {
      msg.edit({
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('exp').setLabel('Expired — run /help again').setStyle(ButtonStyle.Secondary).setDisabled(true),
          inv_btn,
          sup_btn,
        )],
      }).catch(() => null);
    });
  },
};
