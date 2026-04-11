const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const pkg = require(`${process.cwd()}/package.json`);

// ─────────────────── Category metadata ───────────────────────────────────────
const CAT_META = {
  'Infos 📊':      { emoji: '📊', desc: 'Bot info, stats, and server information.',   minLevel: 0 },
  'Ticket 🎫':     { emoji: '🎫', desc: 'Manage your support tickets.',               minLevel: 0 },
  'Community 🌐':  { emoji: '🌐', desc: 'Community features and engagement tools.',    minLevel: 0 },
  'Panel 📋':      { emoji: '📋', desc: 'Create and manage ticket panels.',            minLevel: 1 },
  'Moderation 🔨': { emoji: '🔨', desc: 'Moderation actions (ban, kick, warn…).',     minLevel: 2 },
  'Staff 🛡️':      { emoji: '🛡️', desc: 'Staff tools and ticket management.',         minLevel: 1 },
  'Config ⚙️':     { emoji: '⚙️', desc: 'Configure permissions, branding, and rules.', minLevel: 2 },
  'Setup 💻':      { emoji: '💻', desc: 'Initial bot setup and settings dashboard.',   minLevel: 3 },
  'Owner 👑':      { emoji: '👑', desc: 'Bot owner commands (restricted).',            minLevel: 4 },
};

const LEVEL_NAMES = ['Member', 'Staff', 'Moderator', 'Admin', 'Owner'];
const COMMANDS_PER_PAGE = 8;

// ─────────────────── Helpers ──────────────────────────────────────────────────

/** Resolve calling user's permission level (0-4) */
async function getUserLevel(client, interaction) {
  if (!interaction.guild) return 0;

  const ownerIds = client.config?.discord?.owner_ids || process.env.OWNER_IDS?.split(',') || [];
  if (ownerIds.includes(interaction.user.id) || interaction.guild.ownerId === interaction.user.id) return 4;

  try {
    const db       = client.db;
    const gid      = interaction.guild.id;
    const member   = interaction.member;
    const memberRoles = member.roles.cache;

    const [adminRole, modRole, staffRole] = await Promise.all([
      db.get(`guild_${gid}.ticket.admin_role`),
      db.get(`guild_${gid}.permissions.roles.moderator`),
      db.get(`guild_${gid}.permissions.roles.staff`),
    ]);

    if (adminRole && memberRoles.has(adminRole)) return 3;
    if (modRole   && memberRoles.has(modRole))   return 2;
    if (staffRole && memberRoles.has(staffRole)) return 1;

    // Fallbacks for native Discord Permissions
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return 3;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return 2;
    if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return 1;

  } catch { /* fallback */ }

  return 0;
}

/** Get all commands grouped by category, filtered by user level */
function getFilteredCategories(client, userLevel) {
  const byCategory = {};

  for (const [, cmd] of client.commands) {
    const cat      = cmd.category || 'Uncategorized';
    const catMeta  = CAT_META[cat];
    const minLevel = catMeta?.minLevel ?? cmd.minPermLevel ?? 0;

    if (userLevel < minLevel) continue;

    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(cmd);
  }

  return byCategory;
}

/** Build the landing embed with live stats */
function buildLandingEmbed(client, interaction, userLevel, categoryCounts) {
  const mem        = process.memoryUsage();
  const memMB      = (mem.rss / 1024 / 1024).toFixed(0);
  const upSec      = Math.floor(process.uptime());
  const upStr      = [
    Math.floor(upSec / 86400) ? `${Math.floor(upSec / 86400)}d ` : '',
    Math.floor((upSec % 86400) / 3600) ? `${Math.floor((upSec % 86400) / 3600)}h ` : '',
    `${Math.floor((upSec % 3600) / 60)}m`,
  ].join('');

  const cacheStats = client.cache?.stats?.() || { hitRate: 'N/A' };
  const totalCmds  = client.commands?.size ?? 0;
  const visibleCmds = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const shardId    = client.shardId ?? 0;
  const wsPing     = client.ws?.ping ?? -1;

  const catList = Object.entries(categoryCounts).map(([cat, count]) => {
    const meta = CAT_META[cat];
    return `${meta?.emoji || '📁'}  **${cat}** — ${count} command${count !== 1 ? 's' : ''}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle('🌊  Wave Network — Help Center')
    .setDescription(
      `Welcome, **${interaction.user.displayName}**! You have **${LEVEL_NAMES[userLevel]}** level access.\n` +
      `Use the dropdown below to browse command categories.\n\u200b`
    )
    .addFields([
      {
        name:  '📂  Available Categories',
        value: catList || '_No categories accessible._',
        inline: false,
      },
      {
        name:  '📡  API Latency',
        value: `\`${wsPing >= 0 ? wsPing + 'ms' : 'N/A'}\``,
        inline: true,
      },
      {
        name:  '💾  Memory',
        value: `\`${memMB} MB\``,
        inline: true,
      },
      {
        name:  '⏱️  Uptime',
        value: `\`${upStr}\``,
        inline: true,
      },
      {
        name:  '⚡  Cache',
        value: `\`${cacheStats.hitRate}\``,
        inline: true,
      },
      {
        name:  '🧩  Shard',
        value: `\`#${shardId}\``,
        inline: true,
      },
      {
        name:  '🤖  Commands',
        value: `\`${visibleCmds}/${totalCmds}\``,
        inline: true,
      },
    ])
    .setThumbnail(client.user?.displayAvatarURL({ dynamic: true }) ?? null)
    .setFooter({
      text:    `Wave Network  •  v${pkg.version}  •  Use the dropdown to browse`,
      iconURL: client.user?.displayAvatarURL({ dynamic: true }) ?? null,
    })
    .setTimestamp();
}

/** Build a category embed for page N */
function buildCategoryEmbed(client, category, commands, page = 0) {
  const meta       = CAT_META[category] || { emoji: '📁', desc: '' };
  const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);
  const slice      = commands.slice(page * COMMANDS_PER_PAGE, (page + 1) * COMMANDS_PER_PAGE);

  const fields = slice.map(cmd => {
    const perm = cmd.userPermissions?.join(', ') || 'None';
    const cool = cmd.cooldown ? `${cmd.cooldown}s` : '3s';
    const examples = cmd.examples?.slice(0, 2).join('\n') || `\`/${cmd.name}\``;
    const badge     = cmd.beta ? ' 🧪' : '';

    return {
      name:   `/${cmd.name}${badge}`,
      value:  `${cmd.description}\n**Cooldown:** \`${cool}\`  **Requires:** \`${perm}\`\n**Examples:**\n${examples}`,
      inline: false,
    };
  });

  return new EmbedBuilder()
    .setColor('#7C3AED')
    .setTitle(`${meta.emoji}  ${category}`)
    .setDescription(`${meta.desc}\n\n**Showing ${slice.length} of ${commands.length} commands.**`)
    .addFields(fields)
    .setFooter({
      text:    `Wave Network  •  v${pkg.version}  •  Page ${page + 1}/${totalPages}`,
      iconURL: client.user?.displayAvatarURL({ dynamic: true }) ?? null,
    })
    .setTimestamp();
}

/** Build pagination buttons */
function buildPagButtons(page, totalPages, category) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_prev_${category}_${page - 1}`)
      .setLabel('◀  Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`help_next_${category}_${page + 1}`)
      .setLabel('Next  ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('help_home')
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Primary),
  );
}

/** Build category dropdown */
function buildCatDropdown(categories, currentCat) {
  const options = Object.entries(categories)
    .slice(0, 25)
    .map(([cat, cmds]) => {
      const meta = CAT_META[cat] || { emoji: '📁' };
      return {
        label:       cat,
        description: `${cmds.length} command${cmds.length !== 1 ? 's' : ''}`,
        value:       cat,
        emoji:       meta.emoji || '📁',
        default:     cat === currentCat,
      };
    });

  if (options.length === 0) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('📂  Browse a command category…')
      .addOptions(options),
  );
}

// ─────────────────── Command ──────────────────────────────────────────────────
module.exports = {
  name:            'help',
  description:     'Browse all commands, search by name, or view detailed command info.',
  category:        'Infos 📊',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: [],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  examples: ['/help', '/help command:ban', '/help search:ticket'],
  options: [
    {
      name:        'command',
      description: 'Get detailed info about a specific command.',
      type:        ApplicationCommandOptionType.String,
      required:    false,
    },
    {
      name:        'search',
      description: 'Search commands by keyword.',
      type:        ApplicationCommandOptionType.String,
      required:    false,
    },
  ],

  run: async (client, interaction) => {
    const commandArg = interaction.options.getString('command')?.toLowerCase().trim();
    const searchArg  = interaction.options.getString('search')?.toLowerCase().trim();

    // ── Mode A: Specific command lookup ────────────────────────────────────
    if (commandArg) {
      const cmd = client.commands.get(commandArg) ||
        [...client.commands.values()].find(c => c.name.includes(commandArg) || c.description?.toLowerCase().includes(commandArg));

      if (!cmd) {
        return errorMessage(client, interaction, `No command found for \`${commandArg}\`. Use \`/help\` to browse all commands.`);
      }

      const perm      = cmd.userPermissions?.join(', ')  || 'None';
      const botPerm   = cmd.botPermissions?.join(', ')   || 'None';
      const cool      = cmd.cooldown ? `${cmd.cooldown}s` : '3s';
      const examples  = cmd.examples?.join('\n')         || `\`/${cmd.name}\``;
      const opts      = cmd.options?.map(o => {
        const req = o.required ? '**required**' : '*optional*';
        return `\`${o.name}\` — ${o.description} (${req})`;
      }).join('\n') || 'None';
      const subs = cmd.options?.filter(o => o.type === 1)
        .map(o => `\`/${cmd.name} ${o.name}\` — ${o.description}`).join('\n') || null;

      const embed = new EmbedBuilder()
        .setColor('#7C3AED')
        .setTitle(`🔍  /${cmd.name}`)
        .setDescription(cmd.description || 'No description.')
        .addFields([
          { name: '📂 Category',          value: cmd.category || 'Uncategorized', inline: true },
          { name: '⏱️ Cooldown',           value: `\`${cool}\``,                  inline: true },
          { name: '🔑 User Permissions',  value: `\`${perm}\``,                   inline: true },
          { name: '🤖 Bot Permissions',   value: `\`${botPerm}\``,                inline: true },
          subs ? { name: '🗂️ Subcommands', value: subs, inline: false } : null,
          { name: '⚙️ Options',            value: opts,                            inline: false },
          { name: '💡 Examples',           value: examples,                        inline: false },
        ].filter(Boolean))
        .setFooter({ text: `Wave Network  •  v${pkg.version}`, iconURL: client.user?.displayAvatarURL({ dynamic: true }) ?? null })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── Mode B: Search ─────────────────────────────────────────────────────
    if (searchArg) {
      if (searchArg.length < 2) return errorMessage(client, interaction, 'Search query must be at least 2 characters.');

      const results = [...client.commands.values()].filter(c =>
        c.name.includes(searchArg) ||
        c.description?.toLowerCase().includes(searchArg) ||
        c.category?.toLowerCase().includes(searchArg)
      ).slice(0, 15);

      if (results.length === 0) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title:       '🔍  No Results',
            description: `No commands matched \`${searchArg}\`.\n\nTry a shorter search term or browse with \`/help\`.`,
            color:       '#6B7280',
          })],
          flags: 64,
        });
      }

      const lines = results.map(c => `**/${c.name}** — ${c.description || 'No description.'}`).join('\n');

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`🔍  Search: "${searchArg}"  (${results.length} found)`)
          .setDescription(lines)
          .setFooter({
            text:    `Wave Network  •  v${pkg.version}  •  Use /help command:<name> for details`,
            iconURL: client.user?.displayAvatarURL({ dynamic: true }) ?? null,
          })
          .setTimestamp()],
        flags: 64,
      });
    }

    // ── Mode C: Full browser (landing + dropdown) ──────────────────────────
    const userLevel  = await getUserLevel(client, interaction);
    const categories = getFilteredCategories(client, userLevel);

    const categoryCounts = {};
    for (const [cat, cmds] of Object.entries(categories)) categoryCounts[cat] = cmds.length;

    const landingEmbed = buildLandingEmbed(client, interaction, userLevel, categoryCounts);
    const catRow       = buildCatDropdown(categories, null);

    if (!catRow) {
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '📭  No Commands Available',
          description: 'No commands are available for your permission level in this server.',
          color:       '#6B7280',
        })],
        flags: 64,
      });
    }

    const homeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('help_home').setLabel('🏠 Home').setStyle(ButtonStyle.Primary).setDisabled(true),
    );

    await interaction.reply({
      embeds:     [landingEmbed],
      components: [catRow, homeRow],
      flags:      64,
    });

    // ── Collector: handle dropdown + navigation buttons ────────────────────
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time:   5 * 60 * 1000, // 5 minutes
    });

    // Track current state per session
    let currentCategory = null;
    let currentPage     = 0;

    collector.on('collect', async (i) => {
      try {
        // Category select
        if (i.isStringSelectMenu() && i.customId === 'help_category') {
          currentCategory = i.values[0];
          currentPage     = 0;
          const cmds      = categories[currentCategory] || [];
          const totalPgs  = Math.ceil(cmds.length / COMMANDS_PER_PAGE);
          const catEmbed  = buildCategoryEmbed(client, currentCategory, cmds, 0);
          const newCatRow = buildCatDropdown(categories, currentCategory);
          const pageBtns  = totalPgs > 1 ? buildPagButtons(0, totalPgs, currentCategory) : null;

          const components = [newCatRow, pageBtns].filter(Boolean);
          // Always add home button if no pagination
          if (!pageBtns) {
            components.push(new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('help_home').setLabel('🏠 Home').setStyle(ButtonStyle.Primary),
            ));
          }

          return i.update({ embeds: [catEmbed], components });
        }

        // Home button
        if (i.isButton() && i.customId === 'help_home') {
          currentCategory = null;
          currentPage     = 0;
          const freshCatRow = buildCatDropdown(categories, null);
          const freshHome   = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_home').setLabel('🏠 Home').setStyle(ButtonStyle.Primary).setDisabled(true),
          );
          return i.update({
            embeds:     [buildLandingEmbed(client, interaction, userLevel, categoryCounts)],
            components: [freshCatRow, freshHome],
          });
        }

        // Prev / Next pagination buttons
        if (i.isButton() && (i.customId.startsWith('help_prev_') || i.customId.startsWith('help_next_'))) {
          const parts = i.customId.split('_');
          const dir   = parts[1];           // 'prev' | 'next'
          // Category may have spaces — join everything between index 2 and last token
          const newPage = parseInt(parts[parts.length - 1]);
          // Recover category from customId: everything between dir_ and _pageNum
          const catKey  = parts.slice(2, -1).join('_');

          currentCategory = catKey;
          currentPage     = newPage;

          const cmds     = categories[currentCategory] || [];
          const totalPgs = Math.ceil(cmds.length / COMMANDS_PER_PAGE);
          const catEmbed = buildCategoryEmbed(client, currentCategory, cmds, newPage);
          const newCatRow = buildCatDropdown(categories, currentCategory);
          const pageBtns  = buildPagButtons(newPage, totalPgs, currentCategory);

          return i.update({ embeds: [catEmbed], components: [newCatRow, pageBtns] });
        }

      } catch { /* ignore stale collects */ }
    });

    collector.on('end', () => {
      // Disable all components on timeout
      interaction.editReply({
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('help_expired')
              .setPlaceholder('⏱️  Session expired — run /help again')
              .setDisabled(true)
              .addOptions([{ label: 'Expired', value: 'expired' }]),
          ),
        ],
      }).catch(() => null);
    });
  },
};
