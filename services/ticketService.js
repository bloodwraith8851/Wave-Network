/**
 * ticketService.js — Core ticket creation & management logic
 * Centralises all ticket CRUD so button/menu/command handlers stay thin.
 */

const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  premiumEmbed,
  errorMessage,
} = require(`${process.cwd()}/functions/functions`);
const cache = require('./cacheService');
const Transcript = require('discord-html-transcripts');
const autoReplyService  = require('./autoReplyService');
const analyticsService  = require('./analyticsService');

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
  const mod_role       = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
  const staff_role     = await db.get(`guild_${guild.id}.permissions.roles.staff`);
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
      // Ticket owner
      id: user.id,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ]
    },
    {
      // Bot itself — MUST be explicit so welcome message + buttons always send
      id: guild.members.me.id,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ManageChannels,
      ]
    },
    {
      // Everyone else — no view
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];
  if (admin_role) {
    permOverwrites.push({
      id: admin_role,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ]
    });
  }
  if (mod_role && mod_role !== admin_role) {
    permOverwrites.push({
      id: mod_role,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ]
    });
  }
  if (staff_role && staff_role !== admin_role && staff_role !== mod_role) {
    permOverwrites.push({
      id: staff_role,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ]
    });
  }
  if (categoryRole && categoryRole !== admin_role) {
    permOverwrites.push({
      id: categoryRole,
      allow: [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
      ]
    });
  }


  // ── determine channel name ────────────────────────────────────────────────
  const ticketTypeFormat = (await db.get(`guild_${guild.id}.ticket.type`)) || "ticket-username";
  let formattedName = `ticket-${user.username}`;
  
  if (ticketTypeFormat === 'category-username') {
    const rawCatName = category.replace(/[^a-z0-9]/gi, ''); // Clean emojis or spaces out of the category prefix
    formattedName = `${rawCatName}-${user.username}`;
  } else if (ticketTypeFormat === 'ticket-id') {
    const randomId = Math.floor(100000 + Math.random() * 900000);
    formattedName = `ticket-${randomId}`;
  }

  // ── create channel ────────────────────────────────────────────────────────
  const channelName  = formattedName.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || `ticket-${user.id}`;
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

  // ── auto-reply suggestion (async, checks category keyword against guild rules) ──
  const suggestion = await autoReplyService.checkAutoReply(db, guild.id, category).catch(() => null);

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

  // ── send welcome message ──────────────────────────────────────────────────────────────────
  let msg;
  try {
    msg = await channel.send({
      content: `<@${user.id}>`,
      embeds: [welcomeEmbed],
      components: [controlRow]
    });
    await channel.messages.pin(msg.id).catch(() => null);
  } catch (sendErr) {
    // Log but don't crash — the channel was created, the welcome message just failed
    console.error(`[ticketService] Failed to send welcome message in ${channel.name}:`, sendErr?.message);
    // Try a plain text fallback so the user at least sees something
    await channel.send({ content: `<@${user.id}> Welcome! A staff member will assist you shortly. *(buttons failed to load — please refresh Discord)*` }).catch(() => null);
  }

  // ── Set initial activity timestamp ────────────────────────────────────────
  await db.set(`guild_${guild.id}.ticket.last_activity_at_${channel.id}`, Date.now());

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
async function isStaff(db, guild, member) {
  if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return true;
  
  // Use parallel fetching for roles
  const [admin, mod, staff] = await Promise.all([
    cache.get(member.client, guild.id, 'ticket.admin_role'),
    cache.get(member.client, guild.id, 'permissions.roles.moderator'),
    cache.get(member.client, guild.id, 'permissions.roles.staff')
  ]);

  if (admin && member.roles.cache.has(admin)) return true;
  if (mod   && member.roles.cache.has(mod))   return true;
  if (staff && member.roles.cache.has(staff)) return true;

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
