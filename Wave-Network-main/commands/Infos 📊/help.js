const {
  ButtonBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  ApplicationCommandType,
  ApplicationCommandOptionType
} = require('discord.js');
const { HelpCategoryEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

// ── Category config ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'Infos',      value: 'Infos 📊',       emoji: '📊', color: '#6366F1' },
  { label: 'Setup',      value: 'Setup 💻',        emoji: '💻', color: '#8B5CF6' },
  { label: 'Ticket',     value: 'Ticket 🎫',       emoji: '🎫', color: '#7C3AED' },
  { label: 'Staff',      value: 'Staff 🛡️',       emoji: '🛡️', color: '#EC4899' },
  { label: 'Panel',      value: 'Panel 📋',        emoji: '📋', color: '#3B82F6' },
  { label: 'Moderation', value: 'Moderation 🔨',  emoji: '🔨', color: '#EF4444' },
  { label: 'Community',  value: 'Community 🌐',   emoji: '🌐', color: '#10B981' },
  { label: 'Config',     value: 'Config ⚙️',       emoji: '⚙️', color: '#F59E0B' },
  { label: 'Premium',    value: 'Premium 💎',      emoji: '💎', color: '#F59E0B' },
];
const OWNER_CAT = { label: 'Owner', value: 'Owner 👑', emoji: '👑', color: '#EF4444' };

module.exports = {
  name: 'help',
  description: 'Browse all bot commands by category.',
  category: 'Infos 📊',
  type: ApplicationCommandType.ChatInput,
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [{
    name: 'command',
    description: 'Look up a specific command by name.',
    type: ApplicationCommandOptionType.String,
    required: false
  }],

  run: async (client, interaction) => {
    const commandName = interaction.options.getString('command');
    const isOwner     = client.config.owner.some(id => id === interaction.user.id);

    // ── /help <command> — single command info ──────────────────────────────
    if (commandName) {
      const cmd = client.commands.get(commandName.toLowerCase());
      if (!cmd) return interaction.reply({ content: `❌  \`${commandName}\` is not a valid command.`, ephemeral: true });
      if (cmd.category === 'Owner 👑' && !isOwner) return errorMessage(client, interaction, 'You do not have permission to view this command.');

      const cm = client.application.commands.cache.find(c => c.name === cmd.name);
      if (!cm) return interaction.reply({ content: `❌  Command not yet registered. Please wait a moment.`, ephemeral: true });

      const opts    = cm.options || [];
      const hasSubs = opts.some(o => o.type === ApplicationCommandOptionType.Subcommand);
      const lines   = [];

      lines.push(`> ${cm.description}`);
      lines.push('');

      if (hasSubs) {
        lines.push('**Subcommands**');
        opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand).forEach((sub, i, arr) => {
          const params  = (sub.options || []).map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
          const prefix  = i === arr.length - 1 ? '╰' : '├';
          lines.push(`\`${prefix} ${sub.name}${params ? ' ' + params : ''}\` — ${sub.description}`);
        });
      } else {
        const params = opts.filter(o => o.type !== 2).map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
        if (params) lines.push(`**Usage**\n\`/${cm.name} ${params}\``);
        if (opts.length) {
          lines.push('');
          lines.push('**Options**');
          opts.filter(o => o.type > 2).forEach(o => {
            lines.push(`\`${o.required ? '●' : '○'} ${o.name}\` — ${o.description}`);
          });
        }
      }
      if (cmd.userPermissions?.length) lines.push(`\n**Permissions** — ${cmd.userPermissions.map(p => `\`${p}\``).join(' ')}`);
      if (cmd.cooldown) lines.push(`**Cooldown** — \`${cmd.cooldown}s\``);

      const catConfig = [...CATEGORIES, OWNER_CAT].find(c => c.value === cmd.category);

      const embed = new EmbedBuilder()
        .setColor(catConfig?.color || '#7C3AED')
        .setAuthor({ name: `/${cm.name}  ·  ${cmd.category}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Requested by ${interaction.user.tag}  ·  Wave Network`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

      return interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(client.config.discord.invite),
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(client.config.discord.server_support)
        )]
      });
    }

    // ── /help — category browser ───────────────────────────────────────────
    const cats     = isOwner ? [...CATEGORIES, OWNER_CAT] : CATEGORIES;
    const totalCmds = client.commands.size;

    // Count per category
    const catCounts = {};
    for (const [, cmd] of client.commands) {
      catCounts[cmd.category] = (catCounts[cmd.category] || 0) + 1;
    }

    // ── Build beautiful landing embed ─────────────────────────────────────
    const guilds    = client.guilds.cache.size;
    const users     = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);

    const catLines = cats
      .filter(c => c.value !== 'Premium 💎')
      .map(c => {
        const count = catCounts[c.value] || 0;
        return `${c.emoji}  **${c.label}** \`${count}\``;
      })
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
        { name: '🏠  Servers',   value: `\`${guilds}\``,    inline: true },
        { name: '👥  Users',     value: `\`${users}\``,     inline: true },
        { name: '⚡  Commands',  value: `\`${totalCmds}\``, inline: true }
      ])
      .setFooter({ text: `Requested by ${interaction.user.tag}  ·  Wave Network  ·  /help <command> for details`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    // Build select menu
    const help_menu = new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setMaxValues(1)
      .setMinValues(1)
      .setPlaceholder('📂  Select a category...')
      .addOptions(cats.map(c => ({ label: c.label, value: c.value, emoji: c.emoji })));

    const home_btn = new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Home').setEmoji('🏠').setCustomId('home_page');
    const inv_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Invite').setURL(client.config.discord.invite);
    const sup_btn  = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setURL(client.config.discord.server_support);

    const makeComponents = (homeDisabled) => [
      new ActionRowBuilder().addComponents(help_menu.setDisabled(false)),
      new ActionRowBuilder().addComponents(home_btn.setDisabled(homeDisabled), inv_btn, sup_btn)
    ];

    await interaction.reply({ embeds: [help], components: makeComponents(true) });
    const embedMessage = await interaction.fetchReply();

    const collector = embedMessage.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async m => {
      if (m.user.id !== interaction.user.id) {
        return m.reply({ content: `❌ Only ${interaction.user} can use this menu.`, ephemeral: true });
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
  }
};
