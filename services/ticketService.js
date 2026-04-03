/**
 * ticketService.js — Core ticket creation & management logic
 * Centralises all ticket CRUD so button/menu/command handlers stay thin.
 */

const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { premiumEmbed, ticketControlRow } = require('../functions/functions');
const analyticsService = require('./analyticsService');
const autoReplyService = require('./autoReplyService');

/**
 * Creates a ticket channel.
 * @param {object} client
 * @param {import('discord.js').Interaction} interaction
 * @param {string} category   — ticket category/reason label
 * @param {string|null} panelId — panel id if created from a panel
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function createTicket(client, interaction, category, panelId = null) {
  const db = client.db;
  const guild = interaction.guild;
  const user  = interaction.user;

  // ── resolve DB keys ──────────────────────────────────────────────────────
  const cmd            = client.application?.commands?.cache?.find(c => c.name === 'ticket');
  const admin_role_has = await db.has(`guild_${guild.id}.ticket.admin_role`);
  const admin_role     = await db.get(`guild_${guild.id}.ticket.admin_role`);
  const cat_has        = await db.has(`guild_${guild.id}.ticket.category`);
  const cat_id         = await db.get(`guild_${guild.id}.ticket.category`);
  const log_id         = await db.get(`guild_${guild.id}.modlog`);
  const logsChannel    = guild.channels.cache.get(log_id);

  // Resolve per-category assigned role from panel or settings
  let categoryRole = null;
  if (panelId) {
    const panels = (await db.get(`guild_${guild.id}.panels`)) || [];
    const panel  = panels.find(p => p.id === panelId);
    if (panel) {
      const cat = panel.categories.find(c => c.value === category);
      if (cat?.role) categoryRole = cat.role;
    }
  } else {
    categoryRole = await db.get(`guild_${guild.id}.ticket.category_role_${category}`);
  }

  // ── channel permissions ───────────────────────────────────────────────────
  const permOverwrites = [
    {
      id: user.id,
      allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
    },
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];
  if (admin_role_has) {
    permOverwrites.push({
      id: admin_role,
      allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }
  if (categoryRole && categoryRole !== admin_role) {
    permOverwrites.push({
      id: categoryRole,
      allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
    });
  }

  // ── create channel ────────────────────────────────────────────────────────
  const channelName  = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || `ticket-${user.id}`;
  const topicParts   = [`👤 ${user.tag}`, `🆔 ${user.id}`, `📂 ${category}`];
  if (cmd) topicParts.push(`Close: /${cmd.name} close`);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: topicParts.join('  |  '),
    reason: `Ticket created by ${user.tag} — ${category}`
  });

  if (cat_has && cat_id) await channel.setParent(cat_id, { lockPermissions: false });
  await channel.permissionOverwrites.set(permOverwrites);

  // ── persist DB ────────────────────────────────────────────────────────────
  await db.set(`guild_${guild.id}.ticket.name_${user.id}`,      channel.name);
  await db.set(`guild_${guild.id}.ticket.control_${channel.id}`, user.id);
  await db.set(`guild_${guild.id}.ticket.category_${channel.id}`, category);
  await db.set(`guild_${guild.id}.ticket.created_at_${channel.id}`, Date.now());
  if (panelId) await db.set(`guild_${guild.id}.ticket.panel_${channel.id}`, panelId);

  // ── analytics ─────────────────────────────────────────────────────────────
  await analyticsService.trackEvent(db, guild.id, 'ticket_created', {
    userId: user.id,
    category,
    channelId: channel.id,
    panelId,
    timestamp: Date.now()
  });

  // ── auto-reply suggestion ─────────────────────────────────────────────────
  const suggestion = autoReplyService.getSuggestion(category, '');

  // ── welcome message ───────────────────────────────────────────────────────
  const welcomeEmbed = premiumEmbed(client, {
    title: `${client.emotes.success}  Ticket Created`,
    description: [
      `Welcome, <@${user.id}>! Please describe your issue in detail.`,
      `A staff member will assist you shortly.`,
      ``,
      `**Category:** \`${category}\``,
      `**Priority:** \`Medium\` (default)`,
      suggestion ? `\n> 💡 **Suggestion:** ${suggestion}` : ''
    ].filter(Boolean).join('\n'),
    color: '#7C3AED'
  })
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setFooter({
      text: `Ticket  •  ${guild.name}  •  ${client.embed?.footerText || 'Wave Network'}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    });

  const controlRow = ticketControlRow({ state: 'open' });

  const msg = await channel.send({
    content: `<@${user.id}>`,
    embeds: [welcomeEmbed],
    components: [controlRow]
  });
  await channel.messages.pin(msg.id).catch(() => null);

  // ── log ───────────────────────────────────────────────────────────────────
  if (logsChannel) {
    const logEmbed = premiumEmbed(client, {
      title: `${client.emotes.ticket}  Ticket Created`,
      description: `**User:** <@${user.id}> \`${user.tag}\`\n**Channel:** ${channel} \`${channel.name}\`\n**Category:** \`${category}\`${panelId ? `\n**Panel:** \`${panelId}\`` : ''}`,
      color: '#10B981'
    }).setTimestamp();
    await logsChannel.send({ embeds: [logEmbed] }).catch(() => null);
  }

  return channel;
}

/**
 * Checks if a user already has an open ticket.
 */
async function hasOpenTicket(db, guild, userId) {
  const name = await db.get(`guild_${guild.id}.ticket.name_${userId}`);
  if (!name) return false;
  return !!guild.channels.cache.find(c => c.name === name);
}

/**
 * Resolves whether a member has staff privileges.
 */
async function isStaff(db, guild, member, adminRoleId) {
  if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return true;
  if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
  return false;
}

/**
 * Checks if the current channel is a ticket channel.
 */
async function isTicketChannel(db, guild, channel) {
  const control = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
  return !!control || channel.name.startsWith('ticket-');
}

module.exports = { createTicket, hasOpenTicket, isStaff, isTicketChannel };
