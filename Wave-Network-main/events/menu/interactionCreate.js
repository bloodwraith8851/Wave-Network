/**
 * events/menu/interactionCreate.js
 * Handles:
 *   - ticket_menu (legacy category select)
 *   - panel_select (new multi-panel system)
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { logMessage, errorMessage, premiumEmbed } = require(`${process.cwd()}/functions/functions`);
const { createTicket, hasOpenTicket }            = require(`${process.cwd()}/services/ticketService`);
const { runAllChecks, setCooldown }              = require(`${process.cwd()}/services/antiAbuseService`);

module.exports = async (client, interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  const db = client.db;

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY: ticket_menu (kept for backward compatibility with old setup)
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.customId === 'ticket_menu') {
    const value = interaction.values[0];

    // Anti-abuse checks
    const check = await runAllChecks(db, interaction.guild, interaction.user.id);
    if (!check.allowed) {
      const reasons = {
        spam:        `🚫 You're clicking too fast! Please slow down.`,
        cooldown:    `⏳ You must wait **${check.remaining}s** before opening another ticket.`,
        max_tickets: `📌 You already have **${check.count}/${check.max}** open ticket(s). Please close one first.`
      };
      return errorMessage(client, interaction, reasons[check.reason] || 'Ticket creation blocked.');
    }

    // Already has a ticket?
    const alreadyOpen = await hasOpenTicket(db, interaction.guild, interaction.user.id);
    if (alreadyOpen) {
      const ticketChName = await db.get(`guild_${interaction.guild.id}.ticket.name_${interaction.user.id}`);
      const existing = interaction.guild.channels.cache.find(c => c.name === ticketChName);
      return errorMessage(client, interaction, `You already have an open ticket: ${existing || '(not found)'}.`);
    }

    // Defer update then create
    await interaction.deferUpdate();
    const channel = await createTicket(client, interaction, value, null);
    if (!channel) return;

    // Set cooldown after success
    await setCooldown(db, interaction.guild.id, interaction.user.id);

    // Update the original message
    await interaction.editReply({
      content: '',
      embeds: [premiumEmbed(client, {
        title: `${client.emotes.success}  Ticket Ready!`,
        description: `Your ticket has been created: ${channel}\n\n**Category:** \`${value}\``,
        color: '#10B981'
      }).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
       .setTimestamp()
       .setFooter({ text: `${interaction.guild.name}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Ticket Created').setEmoji(client.emotes.mail).setCustomId('create_need_help_ticket').setDisabled(true)
        )
      ]
    }).catch(() => null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW: panel_select — multi-panel category selection
  // ─────────────────────────────────────────────────────────────────────────
  if (interaction.customId === 'panel_select') {
    const rawValue = interaction.values[0]; // format: "panelId__categoryValue"
    const separatorIdx = rawValue.indexOf('__');
    if (separatorIdx === -1) return;

    const panelId  = rawValue.slice(0, separatorIdx);
    const catValue = rawValue.slice(separatorIdx + 2);

    // Load panel info
    const panels = (await db.get(`guild_${interaction.guild.id}.panels`)) || [];
    const panel  = panels.find(p => p.id === panelId);
    if (!panel) return errorMessage(client, interaction, 'This panel no longer exists.');

    const cat = panel.categories.find(c => c.value === catValue);
    const categoryLabel = cat ? cat.label : catValue;

    // Anti-abuse checks
    const check = await runAllChecks(db, interaction.guild, interaction.user.id);
    if (!check.allowed) {
      const reasons = {
        spam:        `🚫 You're clicking too fast! Please slow down.`,
        cooldown:    `⏳ You must wait **${check.remaining}s** before opening another ticket.`,
        max_tickets: `📌 You already have **${check.count}/${check.max}** open ticket(s). Close one first.`
      };
      return interaction.reply({ content: reasons[check.reason] || 'Blocked.', ephemeral: true });
    }

    // Already has a ticket?
    const alreadyOpen = await hasOpenTicket(db, interaction.guild, interaction.user.id);
    if (alreadyOpen) {
      const existingName = await db.get(`guild_${interaction.guild.id}.ticket.name_${interaction.user.id}`);
      const existing = interaction.guild.channels.cache.find(c => c.name === existingName);
      return interaction.reply({
        content: `You already have an open ticket: ${existing || '`not found`'}. Please close it first.`,
        ephemeral: true
      });
    }

    // Acknowledge immediately (ephemeral)
    await interaction.reply({
      embeds: [premiumEmbed(client, {
        title: `⏳  Creating Your Ticket...`,
        description: `Setting up your \`${categoryLabel}\` ticket. Please wait!`,
        color: '#7C3AED'
      })],
      ephemeral: true
    });

    // Create ticket
    const channel = await createTicket(client, interaction, categoryLabel, panelId);
    if (!channel) {
      return interaction.editReply({ content: '❌ Failed to create ticket. Please try again.' }).catch(() => null);
    }

    // Set cooldown
    await setCooldown(db, interaction.guild.id, interaction.user.id);

    // Edit the ephemeral confirmation
    await interaction.editReply({
      embeds: [premiumEmbed(client, {
        title: `✅  Ticket Created`,
        description: `Your ticket is ready: ${channel}\n\n**Category:** \`${categoryLabel}\``,
        color: '#10B981'
      }).setFooter({ text: `${interaction.guild.name}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })]
    }).catch(() => null);
  }
};
