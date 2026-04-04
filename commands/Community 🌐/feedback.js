/**
 * feedback.js — /feedback command
 * Formal feedback submission + trend analysis for ongoing issues.
 *
 * Members:
 *   /feedback submit <message>  — submit feedback about the support experience
 *
 * Staff+:
 *   /feedback trends             — view recent feedback themes (keyword frequency)
 *   /feedback list               — browse recent raw submissions
 *
 * DB key: guild_<id>.feedback → FeedbackEntry[]
 * FeedbackEntry: { id, userId, text, sentiment, createdAt }
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const MAX_FEEDBACK = 500;
const PAGE_SIZE    = 5;

// Very lightweight sentiment: counts positive/negative/neutral keyword hits
const POS_WORDS = ['great','good','excellent','amazing','helpful','fast','awesome','perfect','love','thank','resolved','satisfied','smooth','friendly'];
const NEG_WORDS = ['bad','slow','poor','issue','problem','broken','unhelpful','rude','wrong','error','bug','confused','delayed','ignored','frustrat'];

function detectSentiment(text) {
  const lower = text.toLowerCase();
  const pos   = POS_WORDS.filter(w => lower.includes(w)).length;
  const neg   = NEG_WORDS.filter(w => lower.includes(w)).length;
  if (pos > neg) return { label: '🟢 Positive', value: 'positive', score: pos - neg };
  if (neg > pos) return { label: '🔴 Negative', value: 'negative', score: neg - pos };
  return { label: '🟡 Neutral', value: 'neutral', score: 0 };
}

module.exports = {
  name: 'feedback',
  description: 'Submit feedback or view satisfaction trends.',
  category: 'Community 🌐',
  cooldown: 30,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'submit',
      description: 'Submit feedback about your support experience.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'message', description: 'Your feedback (max 500 chars).', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'trends',
      description: 'View feedback themes and sentiment analysis (Staff+).',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'list',
      description: 'Browse recent raw feedback submissions (Staff+).',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;
    const sub     = interaction.options.getSubcommand();

    // ── SUBMIT ───────────────────────────────────────────────────────────────
    if (sub === 'submit') {
      const text = interaction.options.getString('message').trim().slice(0, 500);
      if (text.length < 10) return errorMessage(client, interaction, 'Feedback must be at least 10 characters.');

      const all = (await db.get(`guild_${guildId}.feedback`)) || [];
      if (all.length >= MAX_FEEDBACK) all.shift(); // rotating window

      const sentiment = detectSentiment(text);
      const entry = {
        id:        Date.now(),
        userId:    interaction.user.id,
        text,
        sentiment: sentiment.value,
        createdAt: Date.now(),
      };
      all.push(entry);
      await db.set(`guild_${guildId}.feedback`, all);

      // Forward to mod log if configured
      const logId = await db.get(`guild_${guildId}.modlog`);
      const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
      if (logCh) {
        await logCh.send({
          embeds: [premiumEmbed(client, {
            title: `${sentiment.label}  New Feedback`,
            description: `> ${text.slice(0, 400)}`,
            color: sentiment.value === 'positive' ? '#10B981' : sentiment.value === 'negative' ? '#EF4444' : '#F59E0B',
          })
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setFooter({ text: 'Wave Network  •  Feedback', iconURL: interaction.guild.iconURL({ dynamic: true }) })
            .setTimestamp()],
        }).catch(() => null);
      }

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Feedback Submitted',
          description: 'Thank you for your feedback! Our team will review it shortly.',
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  Your feedback matters', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // Staff-only below
    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.stats', client.config, interaction, errorMessage);
    if (denied) return;

    const all = (await db.get(`guild_${guildId}.feedback`)) || [];

    // ── TRENDS ───────────────────────────────────────────────────────────────
    if (sub === 'trends') {
      if (!all.length) return interaction.reply({
        embeds: [premiumEmbed(client, { title: '📊  Feedback Trends', description: '*No feedback data yet.*', color: '#6B7280' })],
        ephemeral: true,
      });

      const posCount = all.filter(f => f.sentiment === 'positive').length;
      const negCount = all.filter(f => f.sentiment === 'negative').length;
      const neuCount = all.filter(f => f.sentiment === 'neutral').length;
      const total    = all.length;

      // Top keywords (excluding common stop words)
      const stopWords = new Set(['the','a','an','is','it','in','of','to','and','or','was','for','on','at','my','i','we','me','be','do','have','that','this','with','are','not','but','can','you']);
      const wordFreq  = {};
      for (const f of all) {
        for (const w of f.text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w))) {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        }
      }
      const topWords = Object.entries(wordFreq).sort(([,a],[,b]) => b - a).slice(0, 10);
      const maxFreq  = topWords[0]?.[1] || 1;

      const bar = (n, max, l = 10) => {
        const f = Math.round((n / max) * l);
        return `${'█'.repeat(f)}${'░'.repeat(l - f)}`;
      };

      const wordLines = topWords.map(([w, c]) => `\`${bar(c, maxFreq)}\` **${w}** (${c})`).join('\n') || '*No data*';

      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '📊  Feedback Trends', color: '#7C3AED' })
          .addFields([
            {
              name: '😊  Sentiment Split',
              value: [
                `> 🟢 **Positive:** \`${posCount}\`  (${Math.round((posCount/total)*100)}%)  ${bar(posCount, total)}`,
                `> 🟡 **Neutral:** \`${neuCount}\`  (${Math.round((neuCount/total)*100)}%)  ${bar(neuCount, total)}`,
                `> 🔴 **Negative:** \`${negCount}\`  (${Math.round((negCount/total)*100)}%)  ${bar(negCount, total)}`,
                `> **Total:** \`${total}\` submissions`,
              ].join('\n'),
              inline: false,
            },
            { name: '🔑  Top Keywords', value: wordLines, inline: false },
          ])
          .setFooter({ text: `Wave Network  •  Feedback Analysis  •  Last ${total} entries`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp()],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      if (!all.length) return interaction.reply({
        embeds: [premiumEmbed(client, { title: '💬  Feedback', description: '*No feedback submitted yet.*', color: '#6B7280' })],
        ephemeral: true,
      });

      const recent = [...all].reverse();
      const pages  = Math.ceil(recent.length / PAGE_SIZE);
      let   page   = 0;

      const sentIcon = { positive: '🟢', negative: '🔴', neutral: '🟡' };

      const buildEmbed = (p) => {
        const slice = recent.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
        const lines = slice.map(f =>
          `${sentIcon[f.sentiment] || '🟡'} <@${f.userId}> · <t:${Math.floor(f.createdAt / 1000)}:R>\n> ${f.text.slice(0, 100)}${f.text.length > 100 ? '…' : ''}`
        );
        return premiumEmbed(client, {
          title: `💬  Feedback  ·  ${all.length} total`,
          description: lines.join('\n\n'),
          color: '#7C3AED',
        }).setFooter({ text: `Page ${p + 1}/${pages}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
      };

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const buildRow = (p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('fb_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('fb_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages - 1),
      );

      await interaction.reply({ embeds: [buildEmbed(0)], components: pages > 1 ? [buildRow(0)] : [], ephemeral: true });
      const msg = await interaction.fetchReply();
      if (pages > 1) {
        const col = msg.createMessageComponentCollector({ time: 120000 });
        col.on('collect', async btn => {
          if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not your session.', ephemeral: true });
          if (btn.customId === 'fb_prev') page--;
          if (btn.customId === 'fb_next') page++;
          await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
        });
        col.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
      }
    }
  },
};
