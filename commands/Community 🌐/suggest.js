/**
 * suggest.js — /suggest <idea>  (upgraded)
 * Visual vote progress bars, auto-color based on vote ratio.
 */
const { ApplicationCommandType, ApplicationCommandOptionType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

// ── Vote bar builder ────────────────────────────────────────────────────────
function voteBar(value, total, width = 12) {
  const filled = total > 0 ? Math.round((value / total) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function voteColor(up, down) {
  const total = up + down;
  if (!total) return '#7C3AED';
  const ratio = up / total;
  if (ratio >= 0.6)  return '#10B981'; // green
  if (ratio >= 0.4)  return '#F59E0B'; // yellow
  return '#EF4444';                   // red
}

function statusBadge(status) {
  return { pending: '🟡 Pending', approved: '✅ Approved', denied: '❌ Denied' }[status] || '🟡 Pending';
}

module.exports = {
  name: 'suggest',
  description: 'Submit a suggestion to the server.',
  category: 'Community 🌐',
  cooldown: 30,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    { name: 'idea', description: 'Your suggestion or idea.', type: ApplicationCommandOptionType.String, required: true }
  ],

  run: async (client, interaction) => {
    const db          = client.db;
    const idea        = interaction.options.getString('idea').slice(0, 1000);
    const suggestChId = await db.get(`guild_${interaction.guild.id}.suggest_channel`);
    const suggestCh   = suggestChId
      ? interaction.guild.channels.cache.get(suggestChId)
      : interaction.channel;

    if (!suggestCh) return errorMessage(client, interaction, 'No suggestion channel configured. Ask an admin to run `/config set suggestion-channel`.');

    const count = (await db.get(`guild_${interaction.guild.id}.suggest_count`) || 0) + 1;
    await db.set(`guild_${interaction.guild.id}.suggest_count`, count);

    const embed = buildSuggestEmbed(client, interaction, { id: count, idea, status: 'pending', upvotes: [], downvotes: [] });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`suggest_up_${count}`).setLabel('Upvote').setEmoji('👍').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`suggest_down_${count}`).setLabel('Downvote').setEmoji('👎').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`suggest_approve_${count}`).setLabel('Approve').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`suggest_deny_${count}`).setLabel('Deny').setStyle(ButtonStyle.Secondary)
    );

    const msg = await suggestCh.send({ embeds: [embed], components: [row] });
    await db.set(`guild_${interaction.guild.id}.suggest_${count}`, {
      id: count, idea, authorId: interaction.user.id, messageId: msg.id, channelId: suggestCh.id,
      upvotes: [], downvotes: [], status: 'pending'
    });

    if (interaction.channel.id !== suggestCh.id) {
      return interaction.reply({ embeds: [premiumEmbed(client, { title: '✅  Suggestion Submitted!', description: `Your suggestion has been posted in ${suggestCh}!`, color: '#10B981' })], ephemeral: true });
    }
    return interaction.reply({ content: '✅ Suggestion posted!', ephemeral: true });
  }
};

/**
 * Build a suggestion embed with visual vote bars.
 */
function buildSuggestEmbed(client, ctx, data) {
  const up    = data.upvotes.length;
  const down  = data.downvotes.length;
  const total = up + down;
  const color = voteColor(up, down);

  const upPct   = total ? `${Math.round((up / total) * 100)}%` : '0%';
  const downPct = total ? `${Math.round((down / total) * 100)}%` : '0%';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`💡  Suggestion #${data.id}`)
    .setDescription(`> ${data.idea}`)
    .setAuthor({
      name: ctx.user?.tag || ctx.author?.tag || 'Unknown',
      iconURL: (ctx.user || ctx.author)?.displayAvatarURL({ dynamic: true })
    })
    .addFields([
      {
        name: '📊  Votes',
        value: [
          `👍 \`${voteBar(up, total)}\` **${up}** (${upPct})`,
          `👎 \`${voteBar(down, total)}\` **${down}** (${downPct})`
        ].join('\n'),
        inline: true
      },
      {
        name: '📌  Status',
        value: statusBadge(data.status),
        inline: true
      }
    ])
    .setFooter({ text: `ID: #${data.id}  •  Wave Network  •  Suggestion System` })
    .setTimestamp();
}

module.exports.buildSuggestEmbed = buildSuggestEmbed;
