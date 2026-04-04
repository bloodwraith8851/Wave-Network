/**
 * ticket-note.js — /ticket-note add | list
 * Staff-only internal notes with visual priority styling and pinning.
 */
const { ApplicationCommandType, ApplicationCommandOptionType, EmbedBuilder } = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff, isTicketChannel } = require(`${process.cwd()}/services/ticketService`);

const NOTE_COLORS    = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
const PRIORITY_LABEL = ['🟢 Low', '🔵 Info', '✅ Resolved', '🟡 Important', '🔴 Urgent'];

module.exports = {
  name: 'ticket-note',
  description: 'Add or view internal staff notes in this ticket.',
  category: 'Staff 🛡️',
  cooldown: 3,
  type: ApplicationCommandType.ChatInput,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageMessages'],
  options: [
    {
      name: 'add',
      description: 'Add an internal staff note.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'note', description: 'The note content.', type: ApplicationCommandOptionType.String, required: true },
        {
          name: 'priority',
          description: 'Note priority level.',
          type: ApplicationCommandOptionType.Integer,
          required: false,
          choices: [
            { name: '🟢 Low',       value: 0 },
            { name: '🔵 Info',      value: 1 },
            { name: '✅ Resolved',  value: 2 },
            { name: '🟡 Important', value: 3 },
            { name: '🔴 Urgent',    value: 4 }
          ]
        }
      ]
    },
    {
      name: 'list',
      description: 'List all staff notes in this ticket.',
      type: ApplicationCommandOptionType.Subcommand
    }
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const staff     = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to add ticket notes.');

    const inTicket = await isTicketChannel(db, interaction.guild, interaction.channel);
    if (!inTicket) return errorMessage(client, interaction, 'This command can only be used inside a ticket channel.');

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const text      = interaction.options.getString('note').slice(0, 1000);
      const priority  = interaction.options.getInteger('priority') ?? 0;
      const color     = NOTE_COLORS[priority];
      const pLabel    = PRIORITY_LABEL[priority];
      const noteKey   = `guild_${interaction.guild.id}.ticket.notes_${interaction.channel.id}`;
      const notes     = (await db.get(noteKey)) || [];
      const noteNum   = notes.length + 1;
      const ts        = Math.floor(Date.now() / 1000);

      notes.push({ text, priority, authorId: interaction.user.id, ts });
      await db.set(noteKey, notes);

      const embed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `📌  Staff Note #${noteNum}  ·  ${pLabel}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setDescription(`\`\`\`\n${text}\n\`\`\``)
        .addFields([
          { name: '✍️  By',        value: `${interaction.user}`, inline: true },
          { name: '🕐  Added',     value: `<t:${ts}:R>`,         inline: true },
          { name: '🏷️  Priority',  value: pLabel,                inline: true }
        ])
        .setFooter({ text: `Internal Staff Note  •  Wave Network  •  Not visible to ticket owner unless staff channels are shared`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      await interaction.deferReply({ ephemeral: false });
      const msg = await interaction.editReply({ embeds: [embed] });
      await msg.pin().catch(() => null);
    }

    if (sub === 'list') {
      const noteKey = `guild_${interaction.guild.id}.ticket.notes_${interaction.channel.id}`;
      const notes   = (await db.get(noteKey)) || [];

      if (!notes.length) {
        return interaction.reply({ embeds: [premiumEmbed(client, { title: '📝  Staff Notes', description: 'No notes have been added to this ticket yet.', color: '#6B7280' })], ephemeral: true });
      }

      const lines = notes.map((n, i) => {
        const pLabel = PRIORITY_LABEL[n.priority ?? 0];
        return `**Note #${i + 1}** ${pLabel} · <@${n.authorId}> · <t:${n.ts}:R>\n> ${n.text.slice(0, 150)}${n.text.length > 150 ? '...' : ''}`;
      }).join('\n\n');

      const embed = premiumEmbed(client, {
        title: `📝  Staff Notes  ·  ${notes.length} total`,
        description: lines.slice(0, 4000),
        color: '#8B5CF6'
      }).setFooter({ text: `Wave Network  •  Internal Notes`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
