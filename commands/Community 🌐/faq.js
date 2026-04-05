/**
 * faq.js — /faq command (Phase 4b upgrade)
 * Full-featured FAQ system: search, add, list, delete.
 * Preserves the existing interactive browser behaviour as a subcommand.
 *
 * /faq search <query>
 * /faq add <question> <answer>   (Staff+)
 * /faq list
 * /faq browse                    (legacy interactive menu)
 * /faq delete <id>               (Staff+)
 *
 * DB key: guild_<id>.faq_entries → FAQ[]
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const PAGE_SIZE = 5;
const MAX_FAQS  = 100;

async function getAll(db, guildId) {
  return (await db.get(`guild_${guildId}.faq_entries`)) || [];
}

function scoredSearch(faqs, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return faqs.map(f => {
    let score = 0;
    for (const t of terms) {
      if (f.question.toLowerCase().includes(t)) score += 2;
      if (f.answer.toLowerCase().includes(t))   score += 1;
    }
    return { ...f, score };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score);
}

// Built-in fallback FAQ items shown in /faq browse
const BUILTIN_FAQS = [
  { id: 'login',   emoji: '🔑', title: 'Login / Password Issues',  answer: 'Try resetting your password via the "Forgot Password" link. Persistent issues? Open a ticket with your account email.' },
  { id: 'payment', emoji: '💳', title: 'Payment / Billing',         answer: 'Open a Billing ticket. Include your order ID, payment method, and the exact amount charged. Response within 24h.' },
  { id: 'bug',     emoji: '🐛', title: 'Bug Reports',               answer: 'Describe steps to reproduce, expected vs actual behaviour. Screenshots/recordings help a lot.' },
  { id: 'ban',     emoji: '⚖️',  title: 'Ban / Mute Appeals',       answer: 'Submit via the Appeals ticket category. Include your username, when the action was taken, and why it should be reversed.' },
  { id: 'feature', emoji: '✨',  title: 'Feature Requests',          answer: 'Use `/suggest` to submit feature ideas. We review all suggestions and implement popular ones.' },
  { id: 'general', emoji: '❓',  title: 'General Support',           answer: 'For anything not covered, open a General Support ticket and describe your issue in detail.' },
];

module.exports = {
  name: 'faq',
  description: 'Browse, search, and manage frequently asked questions.',
  category: 'Community 🌐',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'browse',
      description: 'Browse FAQs interactively via dropdown menu.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'search',
      description: 'Search FAQ entries by keyword.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'query', description: 'Search query.', type: ApplicationCommandOptionType.String, required: true }],
    },
    {
      name: 'add',
      description: 'Add a new FAQ entry (Staff+).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'question', description: 'The FAQ question.', type: ApplicationCommandOptionType.String, required: true },
        { name: 'answer',   description: 'The FAQ answer.',   type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'Browse all FAQ entries with pagination.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'delete',
      description: 'Delete an FAQ entry by ID (Staff+).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: 'id', description: 'FAQ entry ID.', type: ApplicationCommandOptionType.Integer, required: true }],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── BROWSE (legacy interactive dropdown) ─────────────────────────────────
    if (sub === 'browse') {
      const dbFaqs    = await getAll(db, guildId);
      const browseItems = dbFaqs.length
        ? dbFaqs.slice(0, 25).map(f => ({ id: String(f.id), emoji: '❓', title: f.question.slice(0, 80), answer: f.answer }))
        : BUILTIN_FAQS;

      const embed = premiumEmbed(client, {
        title: '❓  Frequently Asked Questions',
        description: browseItems.map(f => `${f.emoji} **${f.title}**`).join('\n'),
        color: '#7C3AED',
      })
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Wave Network  •  FAQ — Select a topic below', iconURL: interaction.guild.iconURL({ dynamic: true }) });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('faq_select')
        .setPlaceholder('📖  Select a question...')
        .addOptions(browseItems.map(f => ({ label: f.title.slice(0, 80), value: f.id, emoji: f.emoji })));

      const msg = await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], withResponse: true });

      const collector = msg.createMessageComponentCollector({ time: 120000 });
      collector.on('collect', async m => {
        if (m.user.id !== interaction.user.id) return m.reply({ content: '❌ Not your FAQ session.', ephemeral: true });
        const selected = browseItems.find(f => f.id === m.values[0]);
        if (!selected) return;
        await m.update({
          embeds: [premiumEmbed(client, { title: `${selected.emoji}  ${selected.title}`, description: selected.answer, color: '#10B981' })
            .setFooter({ text: 'Wave Network  •  FAQ  •  Still need help? Open a ticket!', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
          components: [new ActionRowBuilder().addComponents(menu)],
        });
      });
      collector.on('end', () => msg.edit({ components: [] }).catch(() => null));
      return;
    }

    // ── SEARCH ───────────────────────────────────────────────────────────────
    if (sub === 'search') {
      const query   = interaction.options.getString('query');
      const faqs    = await getAll(db, guildId);
      const results = scoredSearch(faqs, query);

      if (!results.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, { title: '🔍  No Results', description: `No FAQ entries matched **"${query}"**.\n\nTry \`/faq browse\` or open a ticket.`, color: '#6B7280' })],
          ephemeral: true,
        });
      }
      const lines = results.slice(0, 5).map((f, i) =>
        `**${i+1}. ❓ ${f.question}**\n> ${f.answer.slice(0, 120)}${f.answer.length > 120 ? '…' : ''}`
      );
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: `🔍  FAQ: "${query}"  ·  ${results.length} result${results.length !== 1 ? 's' : ''}`, description: lines.join('\n\n'), color: '#7C3AED' })
          .setFooter({ text: 'Wave Network  •  FAQ', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'faq.add', client.config, interaction, errorMessage);
      if (denied) return;
      const faqs = await getAll(db, guildId);
      if (faqs.length >= MAX_FAQS) return errorMessage(client, interaction, `Max ${MAX_FAQS} FAQ entries reached.`);
      const question = interaction.options.getString('question').trim();
      const answer   = interaction.options.getString('answer').trim();
      const id       = (faqs[faqs.length - 1]?.id || 0) + 1;
      faqs.push({ id, question, answer, createdBy: interaction.user.id, createdAt: Date.now() });
      await db.set(`guild_${guildId}.faq_entries`, faqs);
      await auditSvc.log(db, guildId, interaction.user.id, 'faq.add', { id, question: question.slice(0, 50) });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '✅  FAQ Added', description: `**#${id} ${question}**\n\n${answer.slice(0, 200)}`, color: '#10B981' })
          .setFooter({ text: 'Wave Network  •  FAQ', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const faqs = await getAll(db, guildId);
      if (!faqs.length) return interaction.reply({
        embeds: [premiumEmbed(client, { title: '📋  FAQ Entries', description: 'No FAQ entries yet. Use `/faq add` to create one.', color: '#6B7280' })],
        ephemeral: true,
      });

      const totalPages = Math.ceil(faqs.length / PAGE_SIZE);
      let page = 0;
      const buildEmbed = (p) => {
        const lines = faqs.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)
          .map(f => `**#${f.id} ❓ ${f.question}**\n> ${f.answer.slice(0, 100)}${f.answer.length > 100 ? '…' : ''}`);
        return premiumEmbed(client, { title: `📋  FAQ  ·  ${faqs.length}/${MAX_FAQS}`, description: lines.join('\n\n'), color: '#7C3AED' })
          .setFooter({ text: `Page ${p + 1}/${totalPages}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
      };
      const buildRow = (p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('faq_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('faq_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1),
      );
      await interaction.reply({ embeds: [buildEmbed(0)], components: totalPages > 1 ? [buildRow(0)] : [], ephemeral: true });
      const msg = await interaction.fetchReply();
      if (totalPages > 1) {
        const col = msg.createMessageComponentCollector({ time: 120000 });
        col.on('collect', async btn => {
          if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not yours.', ephemeral: true });
          if (btn.customId === 'faq_prev') page--;
          if (btn.customId === 'faq_next') page++;
          await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
        });
        col.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
      }
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'faq.add', client.config, interaction, errorMessage);
      if (denied) return;
      const id   = interaction.options.getInteger('id');
      let   faqs = await getAll(db, guildId);
      const prev = faqs.length;
      faqs       = faqs.filter(f => f.id !== id);
      if (faqs.length === prev) return errorMessage(client, interaction, `No FAQ entry with ID \`${id}\`.`);
      await db.set(`guild_${guildId}.faq_entries`, faqs);
      await auditSvc.log(db, guildId, interaction.user.id, 'faq.delete', { id });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '🗑️  FAQ Deleted', description: `FAQ #${id} has been removed.`, color: '#EF4444' })
          .setFooter({ text: 'Wave Network  •  FAQ', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
