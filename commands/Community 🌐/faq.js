/**
 * faq.js — /faq
 * Interactive FAQ browser from the auto-reply rules.
 */
const { ApplicationCommandType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);
const autoReplyService = require(`${process.cwd()}/services/autoReplyService`);

// Full rule list (mirrors autoReplyService rules but human readable)
const FAQ_ITEMS = [
  { id: 'login',    emoji: '🔑', title: 'Login / Password Issues',    answer: 'Please try resetting your password using the "Forgot Password" link on the login page. If the issue persists, open a ticket with your account email so staff can investigate.' },
  { id: 'payment',  emoji: '💳', title: 'Payment / Billing',          answer: 'All payment issues must be opened via a Billing ticket. Include your order ID, payment method, and the exact amount charged. We respond within 24 hours.' },
  { id: 'bug',      emoji: '🐛', title: 'Bug Reports',                 answer: 'To report a bug, please describe the steps to reproduce it, what you expected to happen, and what actually happened. Screenshots or screen recordings are very helpful.' },
  { id: 'ban',      emoji: '⚖️',  title: 'Ban / Mute Appeals',         answer: 'Appeals must be submitted through the Appeals ticket category. Provide your username, when the action was taken, and why you believe it should be reversed.' },
  { id: 'partner',  emoji: '🤝', title: 'Partnership Requests',       answer: 'Partnership requests are reviewed weekly. Please provide: your server invite, member count, type of community, and why you\'d like to partner.' },
  { id: 'feature', emoji: '✨', title: 'Feature Requests',            answer: 'Use the `/suggest` command to submit features! We review all suggestions and implement popular ones in future updates.' },
  { id: 'general',  emoji: '❓', title: 'General Support',             answer: 'For anything not covered here, open a General Support ticket and describe your issue in as much detail as possible.' }
];

module.exports = {
  name: 'faq',
  description: 'Browse frequently asked questions interactively.',
  category: 'Community 🌐',
  cooldown: 5,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],

  run: async (client, interaction) => {
    const embed = premiumEmbed(client, {
      title: `❓  Frequently Asked Questions`,
      description: [
        `Select a topic from the dropdown below to see the answer.`,
        ``,
        FAQ_ITEMS.map(f => `${f.emoji} **${f.title}**`).join('\n')
      ].join('\n'),
      color: '#7C3AED'
    })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Wave Network  •  FAQ System  •  Select a topic below`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('faq_select')
      .setPlaceholder('📖  Select a question...')
      .addOptions(FAQ_ITEMS.map(f => ({ label: f.title, value: f.id, emoji: f.emoji })));

    const row = new ActionRowBuilder().addComponents(menu);
    const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

    const collector = msg.createMessageComponentCollector({ time: 120000 });
    collector.on('collect', async m => {
      if (m.user.id !== interaction.user.id) {
        return m.reply({ content: '❌ Only the command user can interact with this.', ephemeral: true });
      }
      const selected = FAQ_ITEMS.find(f => f.id === m.values[0]);
      if (!selected) return;

      const answerEmbed = premiumEmbed(client, {
        title: `${selected.emoji}  ${selected.title}`,
        description: selected.answer,
        color: '#10B981'
      }).setFooter({ text: `Wave Network  •  FAQ  •  Still need help? Open a ticket!`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      await m.update({ embeds: [answerEmbed], components: [row] });
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => null);
    });
  }
};
