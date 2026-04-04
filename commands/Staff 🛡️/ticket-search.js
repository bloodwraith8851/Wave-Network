/**
 * ticket-search.js — /ticket-search command
 * Search & filter tickets by user, category, status, tag, or date.
 * Returns paginated results with clickable channel links.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);

const PAGE_SIZE = 8;

module.exports = {
  name: 'ticket-search',
  description: 'Search and filter tickets by user, category, tag, or status.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    { name: 'user',     description: 'Filter by ticket owner.', type: ApplicationCommandOptionType.User,   required: false },
    { name: 'category', description: 'Filter by ticket category.',  type: ApplicationCommandOptionType.String, required: false },
    { name: 'tag',      description: 'Filter by tag label.',     type: ApplicationCommandOptionType.String, required: false },
    { name: 'status',   description: 'Filter by status.',         type: ApplicationCommandOptionType.String, required: false,
      choices: [{ name: 'Open', value: 'open' }, { name: 'Closed (locked)', value: 'closed' }] },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'ticket.search', client.config, interaction, errorMessage);
    if (denied) return;

    await interaction.deferReply({ ephemeral: true });

    const filterUser     = interaction.options.getUser('user');
    const filterCategory = interaction.options.getString('category')?.toLowerCase();
    const filterTag      = interaction.options.getString('tag')?.toLowerCase();
    const filterStatus   = interaction.options.getString('status');

    // Gather all ticket channels
    const ticketChannels = interaction.guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText && c.name.startsWith('ticket-')
    );

    const results = [];
    for (const [, ch] of ticketChannels) {
      const ownerId  = await db.get(`guild_${guildId}.ticket.control_${ch.id}`);
      if (!ownerId) continue;

      const category  = (await db.get(`guild_${guildId}.ticket.category_${ch.id}`))  || 'Unknown';
      const tags      = (await db.get(`guild_${guildId}.ticket.tags_${ch.id}`))       || [];
      const createdAt = (await db.get(`guild_${guildId}.ticket.created_at_${ch.id}`)) || 0;

      // Determine open/closed by checking if owner can view the channel
      const ownerPerms = ch.permissionsFor(ownerId);
      const isOpen     = ownerPerms?.has('ViewChannel') ?? true;
      const status     = isOpen ? 'open' : 'closed';

      // Apply filters
      if (filterUser     && ownerId !== filterUser.id)               continue;
      if (filterCategory && !category.toLowerCase().includes(filterCategory)) continue;
      if (filterTag      && !tags.includes(filterTag))               continue;
      if (filterStatus   && status !== filterStatus)                  continue;

      results.push({ ch, ownerId, category, tags, createdAt, status });
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt - a.createdAt);

    if (!results.length) {
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title: '🔍  No Tickets Found',
          description: 'No tickets matched your search filters.\n\nTry broadening the search criteria.',
          color: '#6B7280',
        })],
      });
    }

    // Paginate
    let page = 0;
    const totalPages = Math.ceil(results.length / PAGE_SIZE);

    function buildEmbed(p) {
      const slice  = results.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      const lines  = slice.map((r, i) => {
        const num    = p * PAGE_SIZE + i + 1;
        const ts     = r.createdAt ? `<t:${Math.floor(r.createdAt / 1000)}:d>` : 'Unknown';
        const tagStr = r.tags.length ? ` 🏷️ ${r.tags.slice(0, 3).map(t => `\`${t}\``).join(' ')}` : '';
        const status = r.status === 'open' ? '🟢' : '🔴';
        return `${status} \`${num}.\` ${r.ch}  •  \`${r.category}\`  •  <@${r.ownerId}>  •  ${ts}${tagStr}`;
      });

      return premiumEmbed(client, {
        title: `🔍  Ticket Search  ·  ${results.length} result${results.length !== 1 ? 's' : ''}`,
        description: lines.join('\n'),
        color: '#7C3AED',
      })
        .addFields([{ name: '🔎 Filters', value: [
          filterUser     ? `User: <@${filterUser.id}>`   : null,
          filterCategory ? `Category: \`${filterCategory}\`` : null,
          filterTag      ? `Tag: \`${filterTag}\``       : null,
          filterStatus   ? `Status: \`${filterStatus}\`` : null,
        ].filter(Boolean).join('  ·  ') || 'None', inline: false }])
        .setFooter({ text: `Page ${p + 1}/${totalPages}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) });
    }

    function buildRow(p) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('search_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId('search_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1),
      );
    }

    const msg = await interaction.editReply({ embeds: [buildEmbed(0)], components: [buildRow(0)] });

    // Pagination collector
    const collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id) return btn.reply({ content: 'Not your search.', ephemeral: true });
      if (btn.customId === 'search_prev') page--;
      if (btn.customId === 'search_next') page++;
      await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    });
    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => null);
    });
  },
};
