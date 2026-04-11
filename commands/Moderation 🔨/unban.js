const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage, successMessage } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'unban',
  description:     'Unban a user from the server by their ID.',
  category:        'Moderation 🔨',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['BanMembers'],
  botPermissions:  ['BanMembers'],
  options: [
    {
      name:        'user_id',
      description: 'The Discord user ID to unban.',
      type:        ApplicationCommandOptionType.String,
      required:    true,
    },
    {
      name:        'reason',
      description: 'Reason for the unban.',
      type:        ApplicationCommandOptionType.String,
      required:    false,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guild   = interaction.guild;
    const userId  = interaction.options.getString('user_id').trim();
    const reason  = interaction.options.getString('reason') || 'No reason provided.';

    // ── Validate ID format ────────────────────────────────────────────────────
    if (!/^\d{17,19}$/.test(userId)) {
      return errorMessage(client, interaction, 'Invalid user ID. Discord IDs are 17–19 digits.');
    }

    // ── Check actually banned ─────────────────────────────────────────────────
    let banEntry;
    try {
      banEntry = await guild.bans.fetch(userId);
    } catch {
      return errorMessage(client, interaction, `User \`${userId}\` is not currently banned from this server.`);
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    try {
      await guild.bans.remove(userId, `${interaction.user.tag}: ${reason}`);
    } catch {
      return errorMessage(client, interaction, 'Failed to unban the user. Check my permissions.');
    }

    // ── Modlog ────────────────────────────────────────────────────────────────
    const logCh = guild.channels.cache.get(await db.get(`guild_${guild.id}.modlog`));
    if (logCh) {
      await logCh.send({
        embeds: [(client.ui || { log: () => premiumEmbed(client, {}) }).log(
          'Member Unbanned',
          `${interaction.user.tag} (\`${interaction.user.id}\`)`,
          `\`${userId}\``,
          `**Reason:** ${reason}`,
        )],
      }).catch(() => null);
    }

    // ── Success ───────────────────────────────────────────────────────────────
    return interaction.reply({
      embeds: [premiumEmbed(client, {
        title:       '✅  Member Unbanned',
        description: `User \`${userId}\` (${banEntry.user?.tag ?? 'Unknown'}) has been **unbanned**.\n\n**Reason:** ${reason}`,
        color:       '#10B981',
      })],
      flags: 64,
    });
  },
};
