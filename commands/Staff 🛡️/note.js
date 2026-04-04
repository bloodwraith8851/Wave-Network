/**
 * note.js — /note command
 * Internal staff notes on tickets. Visible only to staff (ephemeral output).
 *
 * /note add <text>
 * /note list
 * /note delete <index>
 *
 * DB key: guild_<id>.ticket.notes_<channelId> → Note[]
 * Note: { text, authorId, authorTag, createdAt }
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);

const MAX_NOTES   = 25;
const MAX_LEN     = 800;

module.exports = {
  name: 'note',
  description: 'Add or view internal staff notes on this ticket (invisible to users).',
  category: 'Staff 🛡️',
  cooldown: 3,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Attach an internal note to this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'text', description: 'Note content (max 800 chars).', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'View all internal notes on this ticket.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'delete',
      description: 'Delete a note by its number.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'number', description: 'Note number (from /note list).', type: ApplicationCommandOptionType.Integer, required: true, minValue: 1 },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;
    const sub       = interaction.options.getSubcommand();

    // Must be inside a ticket
    const ownerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    if (!ownerId) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.note', client.config, interaction, errorMessage);
    if (denied) return;

    const noteKey = `guild_${guildId}.ticket.notes_${channelId}`;

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const text  = interaction.options.getString('text').trim();
      if (text.length > MAX_LEN) return errorMessage(client, interaction, `Note must be ${MAX_LEN} characters or less.`);

      const notes = (await db.get(noteKey)) || [];
      if (notes.length >= MAX_NOTES) return errorMessage(client, interaction, `Max ${MAX_NOTES} notes per ticket.`);

      notes.push({
        text,
        authorId:  interaction.user.id,
        authorTag: interaction.user.tag,
        createdAt: Date.now(),
      });
      await db.set(noteKey, notes);

      // Small non-ephemeral indicator in channel so staff know a note was added
      await interaction.channel.send({
        embeds: [premiumEmbed(client, {
          title: '📝  Staff Note Added',
          description: `${interaction.user} added an internal note. Use \`/note list\` to view.`,
          color: '#7C3AED',
        }).setFooter({ text: 'Wave Network  •  Visible to staff only', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      }).catch(() => null);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Note Saved',
          description: `> ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}`,
          color: '#10B981',
        }).setFooter({ text: `Note #${notes.length}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const notes = (await db.get(noteKey)) || [];
      if (!notes.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '📝  Staff Notes',
            description: 'No notes on this ticket yet.\n\nAdd one with `/note add <text>`.',
            color: '#6B7280',
          })],
          ephemeral: true,
        });
      }

      const lines = notes.map((n, i) => {
        const ts = Math.floor(n.createdAt / 1000);
        return `**#${i + 1}** · \`${n.authorTag}\` · <t:${ts}:R>\n> ${n.text.slice(0, 120)}${n.text.length > 120 ? '…' : ''}`;
      });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📝  Staff Notes  ·  ${notes.length}/${MAX_NOTES}`,
          description: lines.join('\n\n'),
          color: '#7C3AED',
        })
          .setFooter({ text: `Wave Network  •  Staff Notes  •  Confidential`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const num   = interaction.options.getInteger('number') - 1; // 0-indexed
      const notes = (await db.get(noteKey)) || [];
      if (num < 0 || num >= notes.length) return errorMessage(client, interaction, `No note #${num + 1} on this ticket.`);

      const removed = notes.splice(num, 1)[0];
      await db.set(noteKey, notes);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🗑️  Note Deleted',
          description: `Note **#${num + 1}** by \`${removed.authorTag}\` has been removed.`,
          color: '#EF4444',
        }).setFooter({ text: `Wave Network  •  Staff Notes`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
