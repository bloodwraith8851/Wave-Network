/**
 * language.js — /language command
 * Set or view the bot's display language for this server.
 *
 * /language set <locale>
 * /language view
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const i18nSvc  = require(`${process.cwd()}/services/i18nService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);
const { LOCALES } = require(`${process.cwd()}/utils/constants`);

module.exports = {
  name: 'language',
  description: 'Set the bot\'s display language for this server.',
  category: 'Config ⚙️',
  cooldown: 5,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'set',
      description: 'Set the server language.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'locale',
          description: 'Language to use.',
          type: ApplicationCommandOptionType.String,
          required: true,
          choices: LOCALES.SUPPORTED.map(l => ({ name: LOCALES.NAMES[l] || l, value: l })),
        },
      ],
    },
    {
      name: 'view',
      description: 'View the current language setting.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'set') {
      const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.set', client.config, interaction, errorMessage);
      if (denied) return;

      const locale  = interaction.options.getString('locale');
      const success = await i18nSvc.setLocale(db, guildId, locale);
      if (!success) return errorMessage(client, interaction, `Locale \`${locale}\` is not supported.\n\nSupported: \`${LOCALES.SUPPORTED.join(', ')}\``);

      await auditSvc.log(db, guildId, interaction.user.id, 'language.set', { locale });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `✅  Language Set: ${LOCALES.NAMES[locale]}`,
          description: [
            `The bot will now display messages in **${LOCALES.NAMES[locale]}** where translations are available.`,
            ``,
            `> English will be used as a fallback for any missing strings.`,
          ].join('\n'),
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  Language', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'view') {
      const current = await i18nSvc.getLocale(db, guildId);
      const lines   = LOCALES.SUPPORTED.map(l =>
        `${l === current ? '✅' : '◻️'} ${LOCALES.NAMES[l]}  \`${l}\``
      );
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🌐  Language Settings',
          description: [
            `**Current:** ${LOCALES.NAMES[current]}`,
            ``,
            `**Available Languages:**`,
            lines.join('\n'),
          ].join('\n'),
          color: '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  i18n', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
