/**
 * note.js — /note command
 * Global user-based staff notes. Persistent across all tickets.
 * Matches the Dyno-style behavior: /note <user> <text>
 */
const { 
  ApplicationCommandType, 
  ApplicationCommandOptionType 
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'note',
  description: 'Add an internal staff note for a specific user.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'user',
      description: 'The user to add a note for.',
      type: ApplicationCommandOptionType.User,
      required: true
    },
    {
      name: 'message',
      description: 'The note content.',
      type: ApplicationCommandOptionType.String,
      required: true
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const target    = interaction.options.getUser('user');
    const text      = interaction.options.getString('message').trim().slice(0, 500);

    // Permission check
    const staff = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Staff Roles** to add user notes.');

    const noteKey = `guild_${guildId}.user_notes_${target.id}`;
    const notes   = (await db.get(noteKey)) || [];

    notes.push({
      text,
      moderatorId:   interaction.user.id,
      moderatorTag:  interaction.user.tag,
      createdAt:     Date.now(),
    });

    await db.set(noteKey, notes);

    // Response matching the image: ✅ Note added for <username>..
    return interaction.reply({
      content: `✅ Note added for **${target.username}**..`,
      ephemeral: false 
    });
  },
};
