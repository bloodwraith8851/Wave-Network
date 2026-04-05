/**
 * branding.js — /branding command
 * Let each server customize embed colors, footer text, thumbnail globally.
 *
 * DB keys:
 *   guild_<id>.branding.color     → hex string
 *   guild_<id>.branding.footer    → string
 *   guild_<id>.branding.thumbnail → URL string
 *   guild_<id>.branding.author_icon → URL string
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EmbedBuilder,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const DEFAULT_COLOR     = '#7C3AED';
const DEFAULT_FOOTER    = 'Wave Network  •  Ticket System';
const COLOR_REGEX       = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const URL_REGEX         = /^https?:\/\/.+/;

module.exports = {
  name: 'branding',
  description: 'Customize embed appearance — colors, footer text, and thumbnails.',
  category: 'Config ⚙️',
  cooldown: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'preview',
      description: 'Preview how embeds will look with current branding.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'set',
      description: 'Set a branding property.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'property', description: 'Which property to set.', required: true, type: ApplicationCommandOptionType.String,
          choices: [
            { name: '🎨 Embed Color',   value: 'color' },
            { name: '📝 Footer Text',   value: 'footer' },
            { name: '🖼️ Thumbnail URL', value: 'thumbnail' },
            { name: '👤 Author Icon URL', value: 'author_icon' },
          ] },
        { name: 'value', description: 'Value to set (#hex color, text, or image URL).', required: true, type: ApplicationCommandOptionType.String },
      ],
    },
    {
      name: 'reset',
      description: 'Reset all branding to default.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'branding.set', client.config, interaction, errorMessage);
    if (denied) return;

    const getBranding = async () => ({
      color:       (await db.get(`guild_${guildId}.branding.color`))       || DEFAULT_COLOR,
      footer:      (await db.get(`guild_${guildId}.branding.footer`))      || DEFAULT_FOOTER,
      thumbnail:   (await db.get(`guild_${guildId}.branding.thumbnail`))   || null,
      author_icon: (await db.get(`guild_${guildId}.branding.author_icon`)) || null,
    });

    // ── PREVIEW ──────────────────────────────────────────────────────────────
    if (sub === 'preview') {
      const b = await getBranding();
      const embed = new EmbedBuilder()
        .setColor(b.color)
        .setTitle('🎨  Branding Preview')
        .setDescription(`This is a **live preview** of your current embed branding.\n\nAll bot embeds will adopt these settings.`)
        .addFields([
          { name: '🎨 Color',       value: `\`${b.color}\``, inline: true },
          { name: '📝 Footer',      value: `\`${b.footer.slice(0, 50)}\``, inline: true },
          { name: '🖼️ Thumbnail',   value: b.thumbnail ? `[Link](${b.thumbnail})` : '`Default`', inline: true },
          { name: '👤 Author Icon', value: b.author_icon ? `[Link](${b.author_icon})` : '`Default`', inline: true },
        ])
        .setFooter({ text: b.footer, iconURL: b.author_icon || interaction.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      if (b.thumbnail) embed.setThumbnail(b.thumbnail);

      if (b.thumbnail) embed.setThumbnail(b.thumbnail);

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ── SET ──────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const prop  = interaction.options.getString('property');
      const value = interaction.options.getString('value').trim();

      // Validate
      if (prop === 'color' && !COLOR_REGEX.test(value)) {
        return errorMessage(client, interaction, `Invalid hex color. Use format \`#RRGGBB\` (e.g. \`#7C3AED\`).`);
      }
      if ((prop === 'thumbnail' || prop === 'author_icon') && !URL_REGEX.test(value)) {
        return errorMessage(client, interaction, `Invalid URL. Must start with \`http://\` or \`https://\`.`);
      }
      if (prop === 'footer' && value.length > 100) {
        return errorMessage(client, interaction, 'Footer text must be 100 characters or less.');
      }

      const old = await db.get(`guild_${guildId}.branding.${prop}`);
      await db.set(`guild_${guildId}.branding.${prop}`, value);
      await auditSvc.log(db, guildId, interaction.user.id, `branding.set_${prop}`, { oldValue: old, newValue: value });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Branding Updated',
          description: `**${prop}** has been updated to:\n\`\`\`${value}\`\`\`\nRun \`/branding preview\` to see how it looks.`,
          color: prop === 'color' ? value : (client.colors?.success || '#10B981'),
        }).setFooter({ text: `Wave Network  •  Branding`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }

    // ── RESET ────────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      await db.delete(`guild_${guildId}.branding.color`);
      await db.delete(`guild_${guildId}.branding.footer`);
      await db.delete(`guild_${guildId}.branding.thumbnail`);
      await db.delete(`guild_${guildId}.branding.author_icon`);
      await auditSvc.log(db, guildId, interaction.user.id, 'branding.reset', {});

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🔄  Branding Reset',
          description: 'All branding settings have been reset to **default Wave Network** appearance.',
          color: client.colors?.primary || DEFAULT_COLOR,
        }).setFooter({ text: DEFAULT_FOOTER, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64,
      });
    }
  },
};
