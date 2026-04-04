/**
 * notes.js — /notes command
 * View global staff history for a user.
 * Matches the Dyno-style layout shown in reference image.
 */
const { 
  ApplicationCommandType, 
  ApplicationCommandOptionType, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);

module.exports = {
  name: 'notes',
  description: 'View internal staff history and notes for a user.',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'user',
      description: 'The user to view notes for.',
      type: ApplicationCommandOptionType.User,
      required: true
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const target    = interaction.options.getUser('user');

    // Permission check
    const staff = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Staff Roles** to view user notes.');

    const noteKey = `guild_${guildId}.user_notes_${target.id}`;
    const notes   = (await db.get(noteKey)) || [];

    if (!notes.length) {
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📝  Notes for ${target.tag}`,
          description: `No notes found for this user in this server.`,
          color: '#6B7280'
        })],
        ephemeral: true
      });
    }

    // Build description: Moderator: <tag>.\n<text> - <t:ts:R>
    const lines = notes.map((n, i) => {
      const ts = Math.floor(n.createdAt / 1000);
      return `**Moderator: ${n.moderatorTag}.**\n${n.text} - <t:${ts}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor('#EF4444') // Matches the red border in the image
      .setAuthor({ 
        name: `Notes for ${target.username}#${target.discriminator} (${target.id})`, 
        iconURL: target.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(lines.slice(0, 4000))
      .setTimestamp();

    // Red "Delete a note" button
    const deleteBtn = new ButtonBuilder()
      .setStyle(ButtonStyle.Danger)
      .setLabel('Delete a note')
      .setEmoji('🗑️')
      .setCustomId(`delete_note_list_${target.id}`);

    const row = new ActionRowBuilder().addComponents(deleteBtn);

    return interaction.reply({ 
      embeds: [embed], 
      components: [row],
      ephemeral: false 
    });
  },
};
