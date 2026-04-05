/**
 * ticketService.js — Core ticket creation & management logic
 * Centralizes all ticket CRUD and integrates with all secondary services.
 */

const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  premiumEmbed,
  errorMessage,
  ticketControlRow
} = require(`${process.cwd()}/functions/functions`);

const cache = require('./cacheService');
const autoReplyService      = require('./autoReplyService');
const analyticsService      = require('./analyticsService');
const autoAssignService     = require('./autoAssignService');
const duplicateService      = require('./duplicateService');
const webhookService       = require('./webhookService');
const kbService            = require('./kbService');
const verificationService  = require('./verificationService');

/**
 * Creates a ticket channel with full feature wiring.
 */
async function createTicket(client, interaction, category, panelId = null, reason = 'No reason provided.') {
  const db = client.db;
  const guild = interaction.guild;
  const user  = interaction.user;
  const member = interaction.member;

  // ── 🛡️ Verification Gate ──────────────────────────────────────────────────
  const vCheck = await verificationService.checkVerification(db, guild.id, member);
  if (!vCheck.passed) return errorMessage(client, interaction, vCheck.reason);

  // ── 🎫 Duplicate Detection ────────────────────────────────────────────────
  const hasOpen = await hasOpenTicket(db, guild, user.id);
  if (hasOpen) return errorMessage(client, interaction, 'You already have an open ticket.');

  // ── ⚙️ Resolve Roles / Config ──────────────────────────────────────────────
  const admin_role     = await db.get(`guild_${guild.id}.ticket.admin_role`);
  const mod_role       = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
  const staff_role     = await db.get(`guild_${guild.id}.permissions.roles.staff`);
  const cat_id         = await db.get(`guild_${guild.id}.ticket.category`);
  const log_id         = await db.get(`guild_${guild.id}.modlog`);
  const logsChannel    = guild.channels.cache.get(log_id);

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

  // ── 📝 Channel Name & Permissions ─────────────────────────────────────────
  const ticketTypeFormat = (await db.get(`guild_${guild.id}.ticket.type`)) || "ticket-username";
  let formattedName = `ticket-${user.username}`;
  
  if (ticketTypeFormat === 'category-username') {
    formattedName = `${category.replace(/[^a-z0-9]/gi, '')}-${user.username}`;
  } else if (ticketTypeFormat === 'ticket-id') {
    formattedName = `ticket-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  const channelName  = formattedName.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
  const topicParts   = [`👤 ${user.tag}`, `🆔 ${user.id}`, `📂 ${category}`, `📝 ${reason.slice(0, 50)}...`];

  const permOverwrites = [
    { id: user.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] },
    { id: guild.members.me.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels] },
    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
  ];

  [admin_role, mod_role, staff_role, categoryRole].forEach(roleId => {
    if (roleId) permOverwrites.push({ id: roleId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] });
  });

  // ── 🔨 Create Channel ─────────────────────────────────────────────────────
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: topicParts.join('  |  '),
    reason: `Ticket created by ${user.tag} — ${category}`
  });

  if (cat_id) await channel.setParent(cat_id, { lockPermissions: false }).catch(() => null);
  await channel.permissionOverwrites.set(permOverwrites);

  // ── 🗄️ Persistence ────────────────────────────────────────────────────────
  await db.set(`guild_${guild.id}.ticket.name_${user.id}`, channel.name);
  await db.set(`guild_${guild.id}.ticket.control_${channel.id}`, user.id);
  await db.set(`guild_${guild.id}.ticket.category_${channel.id}`, category);
  await db.set(`guild_${guild.id}.ticket.created_at_${channel.id}`, Date.now());
  await db.set(`guild_${guild.id}.ticket.last_activity_at_${channel.id}`, Date.now());

  // ── 🔗 Service Wiring: AI Suggestions & KB ────────────────────────────────
  const autoReply = await autoReplyService.checkAutoReply(db, guild.id, category).catch(() => null);
  const kbArticles = await kbService.suggest(db, guild.id, category).catch(() => []);

  // ── 🎨 Premium Welcome Message ────────────────────────────────────────────
  const kbLines = kbArticles.length 
    ? `\n\n> 💡 **Related KB Articles:**\n${kbArticles.map(a => `· ${a.title}`).join('\n')}`
    : '';

  const welcomeEmbed = premiumEmbed(client, {
    title: `🎫  Ticket Created: ${category}`,
    description: [
      `Welcome, ${user}! Our staff team has been notified.`,
      `Please see your described issue below and wait for a response.`,
      ``,
      `**📄  Reported Issue:**`,
      `> ${reason}`,
      ``,
      autoReply ? `> 💡 **Suggested Solution:**\n> ${autoReply}` : '',
      kbLines
    ].filter(Boolean).join('\n'),
    color: client.colors?.primary
  }).setThumbnail(user.displayAvatarURL({ dynamic: true }));

  const msg = await channel.send({ content: `${user}`, embeds: [welcomeEmbed], components: [ticketControlRow({ state: 'open' })] });
  await channel.messages.pin(msg.id).catch(() => null);

  // ── 🤖 Service Wiring: Auto-Assign ────────────────────────────────────────
  await autoAssignService.assignTicket(client, guild, channel, db);

  // ── 🌐 Service Wiring: Webhooks ───────────────────────────────────────────
  await webhookService.dispatch(db, guild.id, 'ticket_create', {
    user: { id: user.id, tag: user.tag },
    channel: { id: channel.id, name: channel.name },
    category,
    reason,
    timestamp: Date.now()
  });

  // ── 📊 Analytics ──────────────────────────────────────────────────────────
  await analyticsService.trackEvent(db, guild.id, 'ticket_created', {
    userId: user.id, category, channelId: channel.id, timestamp: Date.now(), reason
  });

  // ── 📜 Audit Log ──────────────────────────────────────────────────────────
  if (logsChannel) {
    const logEmbed = premiumEmbed(client, {
      title: '🎫  New Ticket',
      description: `**User:** ${user} (\`${user.id}\`)\n**Channel:** ${channel}\n**Category:** \`${category}\`\n**Reason:** ${reason}`,
      color: client.colors?.success
    });
    await logsChannel.send({ embeds: [logEmbed] }).catch(() => null);
  }

  return channel;
}

/**
 * Update a ticket's priority level.
 */
async function setPriority(db, guildId, channel, level) {
  const priority = level.toLowerCase(); // low, medium, high
  await db.set(`guild_${guildId}.ticket.priority_${channel.id}`, priority);
  
  // Update topic with new highlight
  const currentTopic = channel.topic || '';
  const newTopic = currentTopic.includes('| ⚡ Priority:') 
    ? currentTopic.replace(/\|\s*⚡ Priority:.*$/, `| ⚡ Priority: ${priority.toUpperCase()}`)
    : `${currentTopic} | ⚡ Priority: ${priority.toUpperCase()}`;
    
  await channel.setTopic(newTopic).catch(() => null);
  return true;
}

/**
 * Move a ticket to a new category/panel.
 */
async function moveTicket(client, db, guild, channel, category, panelId = null) {
  // 1. Resolve new roles
  const [admin_role, mod_role, staff_role] = await Promise.all([
    db.get(`guild_${guild.id}.ticket.admin_role`),
    db.get(`guild_${guild.id}.permissions.roles.moderator`),
    db.get(`guild_${guild.id}.permissions.roles.staff`)
  ]);

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

  // 2. Resolve owner
  const ownerId = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
  if (!ownerId) return false;

  // 3. New permission set
  const permOverwrites = [
    { id: ownerId, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] },
    { id: guild.members.me.id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels] },
    { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] }
  ];
  [admin_role, mod_role, staff_role, categoryRole].forEach(id => {
    if (id) permOverwrites.push({ id, allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] });
  });

  await channel.permissionOverwrites.set(permOverwrites);
  
  // 4. Update Database
  await db.set(`guild_${guild.id}.ticket.category_${channel.id}`, category);
  
  // 5. Update Topic
  const topicParts = channel.topic ? channel.topic.split('|').map(s => s.trim()) : [];
  // Assume index 2 is category based on createTicket logic: `[👤 tag, 🆔 id, 📂 category, 📝 reason]`
  if (topicParts.length >= 3) topicParts[2] = `📂 ${category}`;
  else topicParts.push(`📂 ${category}`);
  
  await channel.setTopic(topicParts.join('  |  ')).catch(() => null);
  
  return true;
}

async function hasOpenTicket(db, guild, userId) {
  const name = await db.get(`guild_${guild.id}.ticket.name_${userId}`);
  if (!name) return false;
  return !!guild.channels.cache.find(c => c.name === name);
}

async function isStaff(db, guild, member) {
  if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return true;
  const [admin, mod, staff] = await Promise.all([
    cache.get(member.client, guild.id, 'ticket.admin_role'),
    cache.get(member.client, guild.id, 'permissions.roles.moderator'),
    cache.get(member.client, guild.id, 'permissions.roles.staff')
  ]);
  return [admin, mod, staff].some(id => id && member.roles.cache.has(id));
}

async function isTicketChannel(db, guild, channel) {
  const control = await db.get(`guild_${guild.id}.ticket.control_${channel.id}`);
  return !!control || channel.name.startsWith('ticket-');
}

module.exports = { createTicket, hasOpenTicket, isStaff, isTicketChannel, setPriority, moveTicket };
