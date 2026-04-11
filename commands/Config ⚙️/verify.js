const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'verify',
  description:     'Configure the server verification gate.',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'mode',
      description: 'Verification mechanism used before opening tickets.',
      type:        ApplicationCommandOptionType.String,
      required:    true,
      choices: [
        { name: 'None (Disabled)', value: 'none' },
        { name: 'Captcha Button',  value: 'button' },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db   = client.db;
    const gid  = interaction.guild.id;
    const mode = interaction.options.getString('mode');

    await db.set(`guild_${gid}.verification.mode`, mode);
    client.cache?.invalidate?.(gid);

    return interaction.reply({
      embeds: [premiumEmbed(client, {
        title:       '✅  Verification Configured',
        description: `Verification mode set to **${mode}**.\n\n${mode === 'button' ? '> Users must click a verification button before opening tickets.' : '> Verification gate is disabled.'}`,
        color:       '#10B981',
      })],
      flags: 64,
    });
  },
};
