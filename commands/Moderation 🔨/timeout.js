/**
 * timeout.js — /timeout @user <duration> <reason>
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);

const DURATIONS = {
  '60s':  60,
  '5m':   300,
  '10m':  600,
  '30m':  1800,
  '1h':   3600,
  '6h':   21600,
  '12h':  43200,
  '1d':   86400,
  '7d':   604800
};

module.exports = {
  name: 'timeout',
  description: 'Timeout (mute) a member for a set duration.',
  category: 'Moderation 🔨',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers', 'SendMessages', 'EmbedLinks'],
  options: [
    { name: 'user', description: 'Member to timeout.', type: ApplicationCommandOptionType.User, required: true },
    {
      name: 'duration',
      description: 'How long to timeout.',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: Object.keys(DURATIONS).map(k => ({ name: k, value: k }))
    },
    { name: 'reason', description: 'Reason for the timeout.', type: ApplicationCommandOptionType.String, required: false }
  ],

  run: async (client, interaction) => {
    const db       = client.db;
    const target   = interaction.options.getMember('user');
    const duration = interaction.options.getString('duration');
    const reason   = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) return errorMessage(client, interaction, 'That user is not in this server.');
    if (target.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot timeout yourself.');
    if (!target.manageable) return errorMessage(client, interaction, 'I cannot timeout this member — they may have a higher role than me.');
    if (target.permissions.has('Administrator')) return errorMessage(client, interaction, 'Administrators cannot be timed out.');

    const seconds = DURATIONS[duration];
    const until   = new Date(Date.now() + seconds * 1000);

    await target.timeout(seconds * 1000, reason).catch(e => {
      return errorMessage(client, interaction, `Failed to timeout: ${e.message}`);
    });

    const embed = premiumEmbed(client, {
      title: `⏱️  Member Timed Out`,
      description: [
        `**User:** ${target} \`${target.user.tag}\``,
        `**Duration:** \`${duration}\``,
        `**Until:** <t:${Math.floor(until.getTime() / 1000)}:F>`,
        `**Moderator:** ${interaction.user}`,
        `**Reason:** ${reason}`
      ].join('\n'),
      color: '#F97316'
    }).setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  Moderation`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await interaction.reply({ embeds: [embed] });

    // DM user
    try {
      await target.send({ embeds: [premiumEmbed(client, {
        title: `⏱️  You have been timed out in ${interaction.guild.name}`,
        description: `**Duration:** ${duration}\n**Until:** <t:${Math.floor(until.getTime() / 1000)}:F>\n**Reason:** ${reason}`,
        color: '#F97316'
      })] });
    } catch { /* DMs closed */ }

    const logId = await db.get(`guild_${interaction.guild.id}.modlog`);
    const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
    if (logCh) logMessage(client, interaction, logCh, `${interaction.user.tag} timed out ${target.user.tag} for ${duration} — ${reason}`, 'Member Timed Out', client.emotes.error);
  }
};
