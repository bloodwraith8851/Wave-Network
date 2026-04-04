/**
 * kb.js — /kb command — Knowledge Base
 * A mini-wiki built from resolved tickets.
 *
 * /kb add <title> <content> [tags]
 * /kb search <query>
 * /kb list
 * /kb view <title>
 * /kb delete <title>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const kbSvc   = require(`${process.cwd()}/services/kbService`);
const permSvc = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const PAGE_SIZE = 6;

module.exports = {
  name: 'kb',
  description: 'Access the server\'s knowledge base — searchable articles built from resolved tickets.',
  category: 'Community 🌐',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Add a new knowledge base article (Staff+).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'title',   description: 'Article title.',            type: ApplicationCommandOptionType.String, required: true },
        { name: 'content', description: 'Article content.',          type: ApplicationCommandOptionType.String, required: true },
        { name: 'tags',    description: 'Comma-separated tags.',     type: ApplicationCommandOptionType.String, required: false },
      ],
    },
    {
      name: 'search',
      description: 'Search knowledge base articles.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'query', description: 'Search query.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'List all knowledge base articles.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'view',
      description: 'View a specific article by title.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'title', description: 'Article title to view.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'delete',
      description: 'Delete a knowledge base article (Moderator+).',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'title', description: 'Article title to delete.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'kb.add', client.config, interaction, errorMessage);
      if (denied) return;

      const title   = interaction.options.getString('title');
      const content = interaction.options.getString('content');
      const tagStr  = interaction.options.getString('tags') || '';
      const tags    = tagStr.split(',').map(t => t.trim()).filter(Boolean);

      const result  = await kbSvc.add(db, guildId, title, content, interaction.user.id, tags);
      if (!result.success) return errorMessage(client, interaction, result.msg);

      await auditSvc.log(db, guildId, interaction.user.id, 'kb.add', { title: result.msg });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Article Added',
          description: `**"${result.msg}"** has been added to the knowledge base.\n\nFind it with \`/kb search ${title.split(' ')[0]}\``,
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  Knowledge Base`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── SEARCH ───────────────────────────────────────────────────────────────
    if (sub === 'search') {
      const query   = interaction.options.getString('query');
      const results = await kbSvc.search(db, guildId, query);

      if (!results.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '🔍  No Results Found',
            description: `No articles matched **"${query}"**.\n\nTry a different search term or browse with \`/kb list\`.`,
            color: '#6B7280',
          })],
          ephemeral: true,
        });
      }

      const lines = results.slice(0, 5).map((a, i) =>
        `**${i + 1}.** 📄 **${a.title}**${a.tags.length ? `  🏷️ ${a.tags.slice(0, 3).map(t => `\`${t}\``).join(' ')}` : ''}\n> ${a.content.slice(0, 100)}${a.content.length > 100 ? '…' : ''}`
      );

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🔍  KB Search: "${query}"  ·  ${results.length} result${results.length !== 1 ? 's' : ''}`,
          description: lines.join('\n\n'),
          color: '#7C3AED',
        })
          .addFields([{ name: '💡  Tip', value: 'Use `/kb view <title>` to read a full article.', inline: false }])
          .setFooter({ text: `Wave Network  •  Knowledge Base`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const articles = await kbSvc.getAll(db, guildId);
      if (!articles.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '📚  Knowledge Base',
            description: 'No articles yet.\n\nStaff can add articles with `/kb add <title> <content>`.',
            color: '#6B7280',
          })],
          ephemeral: true,
        });
      }

      const totalPages = Math.ceil(articles.length / PAGE_SIZE);
      let   page       = 0;

      function buildEmbed(p) {
        const slice = articles.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
        const lines = slice.map((a, i) =>
          `\`${p * PAGE_SIZE + i + 1}.\` 📄 **${a.title}**  👁️ \`${a.views}\`${a.tags.length ? `  🏷️ ${a.tags.slice(0, 2).map(t => `\`${t}\``).join(' ')}` : ''}`
        );
        return premiumEmbed(client, {
          title: `📚  Knowledge Base  ·  ${articles.length}/${kbSvc.MAX_ARTICLES} articles`,
          description: lines.join('\n'),
          color: '#7C3AED',
        }).setFooter({ text: `Page ${p + 1}/${totalPages}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
      }

      function buildRow(p) {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('kb_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
          new ButtonBuilder().setCustomId('kb_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1),
        );
      }

      await interaction.reply({ embeds: [buildEmbed(0)], components: totalPages > 1 ? [buildRow(0)] : [], ephemeral: true });
      const msg = await interaction.fetchReply();

      if (totalPages > 1) {
        const collector = msg.createMessageComponentCollector({ time: 120000 });
        collector.on('collect', async btn => {
          if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not your session.', ephemeral: true });
          if (btn.customId === 'kb_prev') page--;
          if (btn.customId === 'kb_next') page++;
          await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
        });
        collector.on('end', () => interaction.editReply({ components: [] }).catch(() => null));
      }
    }

    // ── VIEW ─────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const title   = interaction.options.getString('title');
      const article = await kbSvc.getAndView(db, guildId, title);
      if (!article) return errorMessage(client, interaction, `No article found matching \`${title}\`.\n\nSearch with \`/kb search ${title}\`.`);

      const addedBy = article.createdBy ? `<@${article.createdBy}>` : 'Unknown';

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📄  ${article.title}`,
          description: article.content.slice(0, 4000),
          color: '#7C3AED',
        })
          .addFields([
            { name: '🏷️  Tags',    value: article.tags.length ? article.tags.map(t => `\`${t}\``).join(' ') : '*None*', inline: true },
            { name: '👁️  Views',   value: `\`${article.views}\``, inline: true },
            { name: '✍️  Added by', value: addedBy, inline: true },
          ])
          .setFooter({ text: `Wave Network  •  Knowledge Base`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTimestamp(article.createdAt)],
        ephemeral: true,
      });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'kb.delete', client.config, interaction, errorMessage);
      if (denied) return;

      const title   = interaction.options.getString('title');
      const removed = await kbSvc.remove(db, guildId, title);
      if (!removed) return errorMessage(client, interaction, `No article found matching \`${title}\`.`);

      await auditSvc.log(db, guildId, interaction.user.id, 'kb.delete', { title });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🗑️  Article Deleted',
          description: `Article **"${title}"** has been removed from the knowledge base.`,
          color: '#EF4444',
        }).setFooter({ text: `Wave Network  •  Knowledge Base`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
