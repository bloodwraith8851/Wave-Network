const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed } = require(`${process.cwd()}/functions/functions`);

module.exports = {
  name:            'auto-assign',
  description:     'Configure round-robin ticket auto-assignment.',
  category:        'Config ⚙️',
  cooldown:        5,
  type:            ApplicationCommandType.ChatInput,
  userPermissions: ['ManageGuild'],
  botPermissions:  ['SendMessages', 'EmbedLinks'],
  options: [
    {
      name:        'mode',
      description: 'Set the auto-assignment mode.',
      type:        ApplicationCommandOptionType.String,
      required:    true,
      choices: [
        { name: 'Disabled',               value: 'off' },
        { name: 'Round Robin (All Staff)', value: 'round_robin' },
        { name: 'Load Balanced (Least busy)', value: 'load_balance' },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db   = client.db;
    const gid  = interaction.guild.id;
    const mode = interaction.options.getString('mode');

    await db.set(`guild_${gid}.autoAssign.mode`, mode);
    client.cache?.invalidate?.(gid);

    const descMap = {
      off:          'Auto-assignment disabled. Tickets must be manually claimed.',
      round_robin:  'Tickets will be assigned strictly sequentially to online staff.',
      load_balance: 'Tickets will be assigned to the online staff member with the fewest open tickets.',
    };

    return interaction.reply({
      embeds: [premiumEmbed(client, {
        title:       '✅  Auto-Assign Configured',
        description: `**Mode:** \`${mode}\`\n\n> ${descMap[mode]}`,
        color:       '#10B981',
      })],
      flags: 64,
    });
  },
};
