/**
 * permissionService.js — Centralized 5-tier permission system
 *
 * Levels:
 *   4 = Owner     (bot owner IDs in config + guild owner)
 *   3 = Admin     (configurable role + ManageGuild)
 *   2 = Moderator (configurable role + ManageMessages)
 *   1 = Staff     (configurable role + ManageChannels)
 *   0 = Member    (everyone else)
 *
 * DB keys:
 *   guild_<id>.permissions.roles.admin       → roleId
 *   guild_<id>.permissions.roles.moderator   → roleId
 *   guild_<id>.permissions.roles.staff       → roleId
 *   guild_<id>.permissions.features.<name>  → minLevel (0-4)
 */

const { PermissionsBitField } = require('discord.js');

// ─────────────────────────────────────────────────────────────────────────────
// Default minimum levels for each feature
// Can be overridden per-guild via /permissions set-feature
// ─────────────────────────────────────────────────────────────────────────────
const FEATURE_DEFAULTS = {
  // Ticket management
  'ticket.close':           1, // Staff+
  'ticket.delete':          1,
  'ticket.rename':          1,
  'ticket.reopen':          1,
  'ticket.invite':          1,
  'ticket.transcript':      1,
  'ticket.priority':        1,
  'ticket.claim':           1,
  'ticket.lock':            1,
  'ticket.note':            1,
  'ticket.tag':             1,
  'ticket.transfer':        1,
  'ticket.forward':         2, // Moderator+
  'ticket.merge':           2,
  'ticket.search':          1,
  // Staff commands
  'staff.canned':           1,
  'staff.schedule_close':   1,
  'staff.schedule_message': 1,
  'staff.shift':            1,
  'staff.stats':            2,
  'staff.add_user':         1,
  'staff.remove_user':      1,
  // Config / Admin
  'config.view':            2,
  'config.set':             3, // Admin+
  'config.export':          3,
  'config.import':          3,
  'settings.view':          3,
  'settings.set':           3,
  'panel.manage':           3,
  'permissions.view':       3,
  'permissions.set':        3,
  'audit.view':             2,
  'branding.set':           3,
  // Moderation
  'mod.warn':               2,
  'mod.timeout':            2,
  'mod.slowmode':           2,
  'mod.clearwarn':          2,
  // Community / analytics
  'analytics.view':         2,
  'blacklist.manage':       3,
  'kb.add':                 1,
  'kb.delete':              2,
  'faq.add':                1,
  'faq.rules':              3,
  'webhook.manage':         3,
};

const LEVEL_NAMES = ['Member', 'Staff', 'Moderator', 'Admin', 'Owner'];
const LEVEL_COLORS = ['#6B7280', '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'];
const LEVEL_EMOJIS = ['👤', '🛡️', '⚒️', '👑', '🌟'];

/**
 * Resolve a member's highest permission level (0-4).
 * @param {object} db
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @param {object} clientConfig — client.config object
 * @returns {Promise<number>}
 */
async function getMemberLevel(db, guild, member, clientConfig) {
  try {
    if (!guild || !member) return 0;

    // Level 4 — Owner
    const ownerIds = (clientConfig?.owner || []).filter(Boolean);
    if (ownerIds.includes(member.id) || guild.ownerId === member.id) return 4;

    // Level 3 — Admin
    const adminRoleId = await db.get(`guild_${guild.id}.permissions.roles.admin`)
      || await db.get(`guild_${guild.id}.ticket.admin_role`); // legacy fallback
    if (adminRoleId && member.roles && member.roles.cache.has(adminRoleId)) return 3;
    if (member.permissions && member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return 3;

    // Level 2 — Moderator
    const modRoleId = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
    if (modRoleId && member.roles && member.roles.cache.has(modRoleId)) return 2;
    if (member.permissions && member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return 2;

    // Level 1 — Staff
    const staffRoleId = await db.get(`guild_${guild.id}.permissions.roles.staff`);
    if (staffRoleId && member.roles && member.roles.cache.has(staffRoleId)) return 1;
    if (member.permissions && member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return 1;

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Get the configured minimum level required for a feature.
 * @param {object} db
 * @param {string} guildId
 * @param {string} feature — e.g. 'ticket.close'
 * @returns {Promise<number>}
 */
async function getRequiredLevel(db, guildId, feature) {
  const override = await db.get(`guild_${guildId}.permissions.features.${feature}`);
  if (typeof override === 'number') return override;
  return FEATURE_DEFAULTS[feature] ?? 1;
}

/**
 * Check if a member has permission to use a feature.
 * @param {object} db
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember} member
 * @param {string} feature
 * @param {object} clientConfig
 * @returns {Promise<{ allowed: boolean, memberLevel: number, requiredLevel: number }>}
 */
async function checkPermission(db, guild, member, feature, clientConfig) {
  const memberLevel   = await getMemberLevel(db, guild, member, clientConfig);
  const requiredLevel = await getRequiredLevel(db, guild.id, feature);
  return {
    allowed: memberLevel >= requiredLevel,
    memberLevel,
    requiredLevel
  };
}

/**
 * Quick helper: check and reply with an error if permission denied.
 * Returns true if denied (caller should return after this).
 */
async function requirePermission(db, guild, member, feature, clientConfig, interaction, errorMessageFn) {
  const { allowed, memberLevel, requiredLevel } = await checkPermission(db, guild, member, feature, clientConfig);
  if (!allowed) {
    const need  = LEVEL_NAMES[requiredLevel] || 'Unknown';
    const yours = LEVEL_NAMES[memberLevel]   || 'Unknown';
    await errorMessageFn(interaction.client, interaction,
      `🔒 **Permission Denied**\n\nThis action requires **${LEVEL_EMOJIS[requiredLevel]} ${need}** level or higher.\nYour current level: **${LEVEL_EMOJIS[memberLevel]} ${yours}**\n\n> Ask an Admin to run \`/permissions set-feature\` to adjust this.`
    );
    return true; // denied
  }
  return false; // allowed
}

/**
 * Get all role assignments for a guild.
 */
async function getRoleAssignments(db, guildId) {
  return {
    admin:     await db.get(`guild_${guildId}.permissions.roles.admin`)     || null,
    moderator: await db.get(`guild_${guildId}.permissions.roles.moderator`) || null,
    staff:     await db.get(`guild_${guildId}.permissions.roles.staff`)     || null,
  };
}

/**
 * Get all feature overrides for a guild.
 */
async function getFeatureOverrides(db, guildId) {
  const overrides = {};
  for (const feature of Object.keys(FEATURE_DEFAULTS)) {
    const val = await db.get(`guild_${guildId}.permissions.features.${feature}`);
    if (typeof val === 'number') overrides[feature] = val;
  }
  return overrides;
}

module.exports = {
  getMemberLevel,
  checkPermission,
  getRequiredLevel,
  requirePermission,
  getRoleAssignments,
  getFeatureOverrides,
  FEATURE_DEFAULTS,
  LEVEL_NAMES,
  LEVEL_COLORS,
  LEVEL_EMOJIS,
};
