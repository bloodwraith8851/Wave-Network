const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'purge',
  description:     'Bulk delete 1–100 messages in this channel.',
  category:        'Moderation 🔨',
  cooldown:        10,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions:  ['ManageMessages', 'ReadMessageHistory'],
  options: [
    {
      name:        'amount',
      description: 'Number of messages to delete (1–100).',
      type:        ApplicationCommandOptionType.Integer,
      required:    true,
      min_value:   1,
      max_value:   100,
    },
    {
      name:        'user',
      description: 'Only delete messages from this user.',
      type:        ApplicationCommandOptionType.User,
      required:    false,
    },
  ],

  run: async (client, interaction) => {
    const amount    = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');
    const channel   = interaction.channel;

    // ── Fetch messages ────────────────────────────────────────────────────────
    await interaction.deferReply({ flags: 64 });

    let messages;
    try {
      messages = await channel.messages.fetch({ limit: 100 });
    } catch {
      return interaction.editReply({
        embeds: [premiumEmbed(client, { title: '⛔  Fetch Failed', description: 'Could not fetch messages.', color: '#EF4444' })],
      });
    }

    // Filter by target user if provided
    if (filterUser) {
      messages = messages.filter(m => m.author.id === filterUser.id);
    }

    // Discord only allows bulk-delete for messages < 14 days old
    const twoWeeks = Date.now() - 14 * 24 * 60 * 60 * 1_000;
    const deletable = [...messages.values()]
      .filter(m => m.createdTimestamp > twoWeeks)
      .slice(0, amount);

    const oldCount = messages.size - deletable.length;

    if (deletable.length === 0) {
      return interaction.editReply({
        embeds: [premiumEmbed(client, {
          title:       '⚠️  Nothing to Delete',
          description: 'No messages found within the 14-day bulk-delete window.\n\n> Discord prevents bulk-deleting messages older than 14 days.',
          color:       '#F59E0B',
        })],
      });
    }

    // ── Bulk delete ───────────────────────────────────────────────────────────
    let deleted;
    try {
      deleted = await channel.bulkDelete(deletable, true);
    } catch {
      return interaction.editReply({
        embeds: [premiumEmbed(client, { title: '⛔  Delete Failed', description: 'Bulk delete failed. Check my permissions.', color: '#EF4444' })],
      });
    }

    // ── Modlog ────────────────────────────────────────────────────────────────
    const logCh = channel.guild.channels.cache.get(
      await client.db.get(`guild_${channel.guild.id}.modlog`)
    );
    if (logCh) {
      await logCh.send({
        embeds: [(client.ui || { log: () => premiumEmbed(client, {}) }).log(
          'Messages Purged',
          `${interaction.user.tag} (\`${interaction.user.id}\`)`,
          filterUser ? `${filterUser.tag} messages in ${channel}` : `${channel}`,
          `**Deleted:** ${deleted.size} message(s)\n**Requested:** ${amount}\n` +
          (oldCount > 0 ? `**Skipped (>14d):** ${oldCount} message(s)` : ''),
        )],
      }).catch(() => null);
    }

    // ── Reply (auto-deletes after 5s to keep channel clean) ──────────────────
    const lines = [
      `✅  Deleted **${deleted.size}** message(s) in ${channel}.`,
      filterUser ? `\n📌  Filtered to messages from **${filterUser.tag}**.` : '',
      oldCount > 0 ? `\n⚠️  **${oldCount}** message(s) were skipped (older than 14 days).` : '',
    ].filter(Boolean).join('');

    const reply = await interaction.editReply({
      embeds: [premiumEmbed(client, {
        title:       '🗑️  Purge Complete',
        description: lines,
        color:       '#10B981',
      })],
    });

    // Auto-delete the confirmation after 6s
    setTimeout(() => interaction.deleteReply().catch(() => null), 6_000);
  },
};
