/**
 * warn.js — /warn @user <reason>
 * Add a warning to a user. Notifies the user via DM. Auto-alerts at 3+ warnings.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const { addWarning, getWarnings } = require(`${process.cwd()}/services/warningService`);

module.exports = {
  name: 'warn',
  description: 'Warn a member and log the reason.',
  category: 'Moderation 🔨',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ManageMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  options: [
    { name: 'user', description: 'Member to warn.', type: ApplicationCommandOptionType.User, required: true },
    { name: 'reason', description: 'Reason for the warning.', type: ApplicationCommandOptionType.String, required: true }
  ],

  run: async (client, interaction) => {
    const db     = client.db;
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) return errorMessage(client, interaction, 'That user is not in this server.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot warn yourself.');
    if (target.user.bot) return errorMessage(client, interaction, 'You cannot warn bots.');
    if (target.permissions.has('ManageMessages') && !interaction.member.permissions.has('Administrator')) {
      return errorMessage(client, interaction, 'You cannot warn staff members.');
    }

    await interaction.deferReply();

    const warn     = await addWarning(db, interaction.guild.id, target.id, interaction.user.id, reason);
    const allWarns = await getWarnings(db, interaction.guild.id, target.id);

    const embed = premiumEmbed(client, {
      title: `⚠️  Member Warned`,
      description: [
        `**User:** ${target} \`${target.user.tag}\``,
        `**Moderator:** ${interaction.user}`,
        `**Reason:** ${reason}`,
        `**Warning #:** \`${warn.id}\` (Total: \`${allWarns.length}\`)`
      ].join('\n'),
      color: '#F59E0B'
    }).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  Moderation`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.editReply({ embeds: [embed] });

    // DM the warned user
    try {
      const dmEmbed = premiumEmbed(client, {
        title: `⚠️  You received a warning in ${interaction.guild.name}`,
        description: `**Reason:** ${reason}\n**Warning #${warn.id}** — You now have **${allWarns.length}** warning(s).`,
        color: '#F59E0B'
      }).setFooter({ text: `${interaction.guild.name}  •  Wave Network` });
      await target.send({ embeds: [dmEmbed] });
    } catch { /* DMs closed */ }

    // Log
    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} warned ${target.user.tag} — ${reason} (Warning #${warn.id}, Total: ${allWarns.length})`, 'Member Warned', client.emotes.error);

    // Auto-alert admin at threshold
    const THRESHOLD = 3;
    if (allWarns.length >= THRESHOLD) {
      const adminRole = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
      const modRole   = await db.get(`guild_${interaction.guild.id}.permissions.roles.moderator`);
      const staffRole = await db.get(`guild_${interaction.guild.id}.permissions.roles.staff`);
      
      let roles = [adminRole, modRole, staffRole].filter(Boolean);
      const mention = roles.length > 0 ? roles.map(r => `<@&${r}>`).join(' ') : '@here';

      if (logCh) {
        await logCh.send({
          content: mention,
          embeds: [premiumEmbed(client, {
            title: `🚨  Warning Threshold Reached`,
            description: `${target} has reached **${allWarns.length} warnings**.\nConsider taking further action!`,
            color: '#EF4444'
          })]
        }).catch(() => null);
      }
    }
  }
};
