/**
 * warnings.js — /warnings @user
 * View all warnings for a user.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { getWarnings, formatWarnTime } = require(`${process.cwd()}/services/warningService`);

module.exports = {
  name: 'warnings',
  description: 'View all warnings for a member.',
  category: 'Moderation 🔨',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    { name: 'user', description: 'Member to check warnings for.', type: ApplicationCommandOptionType.User, required: true }
  ],

  run: async (client, interaction) => {
    const db     = client.db;
    const target = interaction.options.getMember('user') || interaction.options.getUser('user');
    if (!target) return errorMessage(client, interaction, 'User not found.');

    const user     = target.user || target;
    const warnings = await getWarnings(db, interaction.guild.id, user.id);

    const embed = premiumEmbed(client, {
      title: `⚠️  Warnings — ${user.tag}`,
      description: warnings.length === 0
        ? `✅ ${user.username} has **no warnings**. Clean record!`
        : `${user.username} has **${warnings.length}** warning(s):`,
      color: warnings.length === 0 ? '#10B981' : warnings.length >= 3 ? '#EF4444' : '#F59E0B'
    })
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  Moderation`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    if (warnings.length > 0) {
      warnings.slice(-10).forEach(w => {
        embed.addFields({
          name: `⚠️ Warning #${w.id}`,
          value: [
            `> **Reason:** ${w.reason}`,
            `> **By:** <@${w.staffId}>`,
            `> **When:** ${formatWarnTime(w.timestamp)}`
          ].join('\n'),
          inline: false
        });
      });
      if (warnings.length > 10) {
        embed.setDescription(`${user.username} has **${warnings.length}** warnings. Showing latest 10:`);
      }
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
