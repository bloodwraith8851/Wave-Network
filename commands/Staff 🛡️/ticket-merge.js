/**
 * ticket-merge.js — /ticket-merge command
 * Merge two tickets into one: copies transcript of the merged ticket,
 * deletes the source ticket, keeping the target open.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, errorMessage, logMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'ticket-merge',
  description: 'Merge another ticket into this one (copies transcript, closes the other).',
  category: 'Staff 🛡️',
  cooldown: 10,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'ticket',
      description: 'The other ticket channel to merge INTO this one.',
      type: ApplicationCommandOptionType.Channel,
      required: true,
    },
    {
      name: 'reason',
      description: 'Reason for merging.',
      type: ApplicationCommandOptionType.String,
      required: false,
    },
  ],

  run: async (client, interaction) => {
    const db        = client.db;
    const guildId   = interaction.guild.id;
    const channelId = interaction.channel.id;

    // Must be inside a ticket
    const myOwnerId = await db.get(`guild_${guildId}.ticket.control_${channelId}`);
    if (!myOwnerId) return errorMessage(client, interaction, 'This command can only be used **inside a ticket channel**.');

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'ticket.merge', client.config, interaction, errorMessage);
    if (denied) return;

    const otherChannel = interaction.options.getChannel('ticket');
    const reason       = interaction.options.getString('reason') || 'No reason provided';

    if (otherChannel.id === interaction.channel.id) {
      return errorMessage(client, interaction, 'You cannot merge a ticket with itself.');
    }

    const otherOwnerId = await db.get(`guild_${guildId}.ticket.control_${otherChannel.id}`);
    if (!otherOwnerId) {
      return errorMessage(client, interaction, `${otherChannel} does not appear to be a ticket channel.`);
    }

    // Confirmation prompt
    await interaction.reply({
      embeds: [premiumEmbed(client, {
        title: '🔀  Confirm Ticket Merge',
        description: [
          `You are about to merge ${otherChannel} **into** ${interaction.channel}.`,
          ``,
          `**What happens:**`,
          `> • A transcript of ${otherChannel} is posted here`,
          `> • ${otherChannel} will be permanently deleted`,
          `> • The owner <@${otherOwnerId}> will be granted access here`,
          ``,
          `**Reason:** ${reason}`,
          `⚠️ This action **cannot be undone**.`,
        ].join('\n'),
        color: '#F59E0B',
      }).setFooter({ text: 'Wave Network  •  Ticket Merge', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Merge').setCustomId('merge_confirm').setEmoji('🔀'),
        new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Cancel').setCustomId('merge_cancel').setEmoji('❌'),
      )],
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 30000, max: 1 });

    collector.on('collect', async btn => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: 'Not your merge request.', ephemeral: true });
      }

      if (btn.customId === 'merge_cancel') {
        return btn.update({
          embeds: [premiumEmbed(client, { title: '❌  Merge Cancelled', description: 'No changes were made.', color: '#6B7280' })],
          components: [],
        });
      }

      await btn.update({
        embeds: [premiumEmbed(client, { title: '🔄  Merging...', description: 'Generating transcript and merging tickets...', color: '#7C3AED' })],
        components: [],
      });

      try {
        // Fetch message history from the other ticket
        const messages = [];
        let   lastId;
        while (true) {
          const fetched = await otherChannel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
          if (!fetched || fetched.size === 0) break;
          messages.unshift(...fetched.values());
          lastId = fetched.last()?.id;
          if (fetched.size < 100) break;
        }

        // Build a summary of the merged ticket
        const summary = messages
          .filter(m => !m.author.bot)
          .slice(0, 20)
          .map(m => `**${m.author.tag}** [<t:${Math.floor(m.createdTimestamp / 1000)}:d>]: ${m.content.slice(0, 120)}`)
          .join('\n') || '*No user messages found.*';

        // Post merge transcript in current channel
        await interaction.channel.send({
          embeds: [premiumEmbed(client, {
            title: `📋  Merged from #${otherChannel.name}`,
            description: [
              `**Merged ticket owner:** <@${otherOwnerId}>`,
              `**Reason:** ${reason}`,
              `**Merged by:** ${interaction.user}`,
              ``,
              `**Message summary from merged ticket:**`,
              summary,
            ].join('\n').slice(0, 4000),
            color: '#8B5CF6',
          }).setFooter({ text: 'Wave Network  •  Ticket Merge', iconURL: interaction.guild.iconURL({ dynamic: true }) }).setTimestamp()],
        });

        // Grant merged ticket owner access to current channel
        await interaction.channel.permissionOverwrites.create(otherOwnerId, {
          SendMessages: true,
          ViewChannel:  true,
        }).catch(() => null);

        // Cleanup the other ticket DB keys
        await db.delete(`guild_${guildId}.ticket.control_${otherChannel.id}`);
        await db.delete(`guild_${guildId}.ticket.name_${otherOwnerId}`);
        await db.delete(`guild_${guildId}.ticket.category_${otherChannel.id}`);
        await db.delete(`guild_${guildId}.ticket.created_at_${otherChannel.id}`);
        await db.delete(`guild_${guildId}.ticket.tags_${otherChannel.id}`);

        // Delete the other channel
        await otherChannel.delete(`Merged into #${interaction.channel.name} by ${interaction.user.tag}`).catch(() => null);

        await auditSvc.log(db, guildId, interaction.user.id, 'ticket.merge', {
          into: interaction.channel.name,
          from: otherChannel.name,
          reason,
        });

        await btn.editReply({
          embeds: [premiumEmbed(client, {
            title: '✅  Tickets Merged',
            description: `Successfully merged the ticket into ${interaction.channel}.\n<@${otherOwnerId}> now has access here.`,
            color: '#10B981',
          }).setFooter({ text: 'Wave Network  •  Ticket Merge', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
          components: [],
        });

        const logId = await db.get(`guild_${guildId}.modlog`);
        const logCh = logId ? interaction.guild.channels.cache.get(logId) : null;
        if (logCh) logMessage(client, interaction, logCh,
          `${interaction.user.tag} merged \`${otherChannel.name}\` into \`${interaction.channel.name}\`.`,
          'Ticket Merged', '🔀'
        );
      } catch (e) {
        console.error('[Merge]', e);
        await btn.editReply({
          embeds: [premiumEmbed(client, { title: '❌  Merge Failed', description: `An error occurred: \`${e.message}\``, color: '#EF4444' })],
          components: [],
        });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({
          embeds: [premiumEmbed(client, { title: '⏱️  Merge Timed Out', description: 'Merge was cancelled due to no response.', color: '#6B7280' })],
          components: [],
        }).catch(() => null);
      }
    });
  },
};
