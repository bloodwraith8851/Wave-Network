/**
 * report.js — /report @user <reason>
 * Creates a private staff report ticket automatically.
 */
const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { createTicket } = require(`${process.cwd()}/services/ticketService`);
const { runAllChecks } = require(`${process.cwd()}/services/antiAbuseService`);

module.exports = {
  name: 'report',
  description: 'Report a user to staff — creates a private report ticket.',
  category: 'Community 🌐',
  cooldown: 60,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  options: [
    { name: 'user', description: 'The user you are reporting.', type: ApplicationCommandOptionType.User, required: true },
    { name: 'reason', description: 'Reason for the report.', type: ApplicationCommandOptionType.String, required: true }
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const target  = interaction.options.getMember('user') || interaction.options.getUser('user');
    const reason  = interaction.options.getString('reason');
    const user    = target?.user || target;

    if (!user) return errorMessage(client, interaction, 'User not found.');
    if (user.id === interaction.user.id) return errorMessage(client, interaction, 'You cannot report yourself.');
    if (user.bot) return errorMessage(client, interaction, 'You cannot report bots.');

    await interaction.deferReply({ ephemeral: true });

    // Anti-abuse check
    const check = await runAllChecks(db, interaction.guild, interaction.user.id);
    if (!check.ok) {
      return interaction.editReply({ content: `❌ ${check.reason === 'cooldown' ? 'Please wait before submitting another report.' : check.reason}` });
    }

    const channel = await createTicket(client, interaction, `Report — ${user.tag}`, null);
    if (!channel) return interaction.editReply({ content: '❌ Failed to create report ticket.' });

    // Post report summary inside
    const embed = premiumEmbed(client, {
      title: `⚠️  User Report`,
      description: [
        `**Reported User:** ${user} \`${user.tag}\``,
        `**Reported By:** ${interaction.user}`,
        `**Reason:**`,
        `> ${reason}`
      ].join('\n'),
      color: '#EF4444'
    }).setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  Report System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    await channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `✅ Your report has been submitted in ${channel}. Staff will review it shortly.` });
  }
};
