const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);

const VALID_COLORS = /^#[0-9A-Fa-f]{6}$/;

module.exports = {
  name:            'branding',
  description:     'Customize embed colors and footer text for this server.',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'preview',
      description: 'Preview how embeds look with current branding.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
    {
      name:        'set-color',
      description: 'Set the primary embed color (hex code).',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'color',
        description: 'Hex color code (e.g. #7C3AED).',
        type:        ApplicationCommandOptionType.String,
        required:    true,
      }],
    },
    {
      name:        'set-footer',
      description: 'Set custom footer text on all embeds.',
      type:        ApplicationCommandOptionType.Subcommand,
      options: [{
        name:        'text',
        description: 'Text to show in the footer (max 100 characters).',
        type:        ApplicationCommandOptionType.String,
        required:    true,
        max_length:  100,
      }],
    },
    {
      name:        'reset',
      description: 'Reset all branding to Wave Network defaults.',
      type:        ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const gid = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'preview') {
      const color  = (await db.get(`guild_${gid}.branding.color`))  || '#7C3AED';
      const footer = (await db.get(`guild_${gid}.branding.footer`)) || `Wave Network  •  ${interaction.guild.name}`;

      const preview = premiumEmbed(client, {
        title:       '🎨  Branding Preview',
        description: `This is how your embeds will look with your current branding settings.\n\n**Everything looks great!** Users will see this color and footer on all bot responses.`,
        color,
        fields: [
          { name: '🎨 Embed Color',  value: `\`${color}\``,    inline: true },
          { name: '📝 Footer Text',  value: `\`${footer}\``,   inline: true },
        ],
      }).setFooter({ text: footer, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [preview], flags: 64 });
    }

    if (sub === 'set-color') {
      const color = interaction.options.getString('color').trim();
      if (!VALID_COLORS.test(color)) {
        return errorMessage(client, interaction, 'Invalid hex color. Use format `#RRGGBB` (e.g. `#7C3AED`).');
      }

      await db.set(`guild_${gid}.branding.color`, color);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Color Updated',
          description: `Embed color set to \`${color}\`.`,
          color,
        })],
        flags: 64,
      });
    }

    if (sub === 'set-footer') {
      const text = interaction.options.getString('text').trim();
      await db.set(`guild_${gid}.branding.footer`, text);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Footer Updated',
          description: `Footer text set to: \`${text}\``,
          color:       '#10B981',
        })],
        flags: 64,
      });
    }

    if (sub === 'reset') {
      await Promise.all([
        db.delete(`guild_${gid}.branding.color`),
        db.delete(`guild_${gid}.branding.footer`),
      ]);
      client.cache?.invalidate?.(gid);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title:       '✅  Branding Reset',
          description: 'All branding settings have been reset to Wave Network defaults.',
          color:       '#10B981',
        })],
        flags: 64,
      });
    }
  },
};
