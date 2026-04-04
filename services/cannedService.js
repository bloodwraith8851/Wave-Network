/**
 * cannedService.js — Canned Response / Template system
 *
 * CRUD for reusable response templates with variable substitution.
 * Variables: {user}, {ticket}, {category}, {staff}
 * Limit: 50 responses per guild
 * DB key: guild_<id>.canned_responses → Array<CannedResponse>
 */

const MAX_RESPONSES = 50;

/**
 * Get all canned responses for a guild.
 */
async function getAll(db, guildId) {
  return (await db.get(`guild_${guildId}.canned_responses`)) || [];
}

/**
 * Add a new canned response.
 * @returns {{ success: boolean, msg: string }}
 */
async function add(db, guildId, name, content) {
  const list = await getAll(db, guildId);
  if (list.length >= MAX_RESPONSES) {
    return { success: false, msg: `Max ${MAX_RESPONSES} canned responses reached. Delete one first.` };
  }
  const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
  if (list.find(r => r.name === normalized)) {
    return { success: false, msg: `A response named \`${normalized}\` already exists.` };
  }
  list.push({ name: normalized, content: content.trim(), createdAt: Date.now() });
  await db.set(`guild_${guildId}.canned_responses`, list);
  return { success: true, msg: normalized };
}

/**
 * Delete a canned response by name.
 * @returns {boolean}
 */
async function remove(db, guildId, name) {
  const list    = await getAll(db, guildId);
  const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
  const filtered   = list.filter(r => r.name !== normalized);
  if (filtered.length === list.length) return false;
  await db.set(`guild_${guildId}.canned_responses`, filtered);
  return true;
}

/**
 * Get a single canned response by name (partial match).
 */
async function get(db, guildId, name) {
  const list = await getAll(db, guildId);
  const normalized = name.toLowerCase().trim().replace(/\s+/g, '-');
  return list.find(r => r.name === normalized || r.name.includes(normalized)) || null;
}

/**
 * Apply variable substitution to a canned response content.
 * @param {string} content
 * @param {{ user?: string, ticket?: string, category?: string, staff?: string }} vars
 */
function applyVars(content, vars = {}) {
  return content
    .replace(/\{user\}/gi,     vars.user     || '{user}')
    .replace(/\{ticket\}/gi,   vars.ticket   || '{ticket}')
    .replace(/\{category\}/gi, vars.category || '{category}')
    .replace(/\{staff\}/gi,    vars.staff    || '{staff}');
}

module.exports = { getAll, add, remove, get, applyVars, MAX_RESPONSES };
