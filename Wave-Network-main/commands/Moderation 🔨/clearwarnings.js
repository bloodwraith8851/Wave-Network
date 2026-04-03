/**
 * clearwarnings.js — /clearwarnings @user
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { getWarnings, clearWarnings, removeWarning } = require(`${process.cwd()}/services/warningService`);

module.exports = {
  name: 'clearwarnings',
  description: 'Clear warnings for a member (all or a specific one).',
  category: 'Moderation 🔨',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    { name: 'user', description: 'Member to clear warnings for.', type: ApplicationCommandOptionType.User, required: true },
    { name: 'id', description: 'Specific warning ID to remove (leave empty to clear all).', type: ApplicationCommandOptionType.Integer, required: false }
  ],

  run: async (client, interaction) => {
    const db     = client.db;
    const target = interaction.options.getMember('user') || interaction.options.getUser('user');
    const warnId = interaction.options.getInteger('id');
    if (!target) return errorMessage(client, interaction, 'User not found.');
    const user = target.user || target;

    const before  = await getWarnings(db, interaction.guild.id, user.id);
    if (before.length === 0) return errorMessage(client, interaction, `${user.username} has no warnings to clear.`);

    if (warnId) {
      const exists = before.find(w => w.id === warnId);
      if (!exists) return errorMessage(client, interaction, `Warning #${warnId} not found for ${user.username}.`);
      await removeWarning(db, interaction.guild.id, user.id, warnId);
    } else {
      await clearWarnings(db, interaction.guild.id, user.id);
    }

    const after = await getWarnings(db, interaction.guild.id, user.id);

    const embed = premiumEmbed(client, {
      title: `✅  Warnings Cleared`,
      description: warnId
        ? `Removed **Warning #${warnId}** from ${user}.\n${user.username} now has **${after.length}** warning(s).`
        : `Cleared all **${before.length}** warning(s) from ${user}.`,
      color: '#10B981'
    }).setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  Moderation`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} cleared warnings for ${user.tag} (${warnId ? `#${warnId}` : 'all'}).`, 'Warnings Cleared', client.emotes.success);
  }
};
