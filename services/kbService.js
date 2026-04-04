/**
 * kbService.js — Knowledge Base System
 *
 * A mini-wiki system built from resolved tickets.
 * Staff can add articles; users can search them.
 *
 * DB key: guild_<id>.knowledge_base → KBArticle[]
 * KBArticle: { id, title, content, tags, createdBy, createdAt, views }
 */

const MAX_ARTICLES = 200;

/**
 * Get all knowledge base articles.
 */
async function getAll(db, guildId) {
  return (await db.get(`guild_${guildId}.knowledge_base`)) || [];
}

/**
 * Add a new KB article.
 * @returns {{ success: boolean, msg: string, article?: object }}
 */
async function add(db, guildId, title, content, createdBy, tags = []) {
  const articles = await getAll(db, guildId);
  if (articles.length >= MAX_ARTICLES) {
    return { success: false, msg: `Max ${MAX_ARTICLES} knowledge base articles reached.` };
  }

  const normalized = title.trim();
  if (articles.find(a => a.title.toLowerCase() === normalized.toLowerCase())) {
    return { success: false, msg: `An article titled \`${normalized}\` already exists.` };
  }

  const article = {
    id:        Date.now(),
    title:     normalized,
    content:   content.trim(),
    tags:      tags.map(t => t.toLowerCase().trim()),
    createdBy,
    createdAt: Date.now(),
    views:     0,
  };

  articles.push(article);
  await db.set(`guild_${guildId}.knowledge_base`, articles);
  return { success: true, msg: normalized, article };
}

/**
 * Delete a KB article by title or ID.
 * @returns {boolean}
 */
async function remove(db, guildId, titleOrId) {
  const articles = await getAll(db, guildId);
  const filtered  = articles.filter(a =>
    a.title.toLowerCase() !== titleOrId.toLowerCase() && String(a.id) !== String(titleOrId)
  );
  if (filtered.length === articles.length) return false;
  await db.set(`guild_${guildId}.knowledge_base`, filtered);
  return true;
}

/**
 * Search articles by query (title + content + tags fuzzy match).
 * @param {string} query
 * @returns {KBArticle[]} sorted by relevance
 */
async function search(db, guildId, query) {
  const articles = await getAll(db, guildId);
  const terms    = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = articles.map(a => {
    let score = 0;
    const haystack = `${a.title} ${a.content} ${a.tags.join(' ')}`.toLowerCase();
    for (const term of terms) {
      if (a.title.toLowerCase().includes(term)) score += 3;       // title match = high
      else if (a.tags.some(t => t.includes(term))) score += 2;    // tag match = medium
      else if (haystack.includes(term)) score += 1;               // content match = low
    }
    return { ...a, score };
  }).filter(a => a.score > 0);

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Get a single article and increment view count.
 */
async function getAndView(db, guildId, titleOrId) {
  const articles = await getAll(db, guildId);
  const idx      = articles.findIndex(a =>
    a.title.toLowerCase() === titleOrId.toLowerCase() || String(a.id) === String(titleOrId)
  );
  if (idx === -1) return null;
  articles[idx].views = (articles[idx].views || 0) + 1;
  await db.set(`guild_${guildId}.knowledge_base`, articles);
  return articles[idx];
}

/**
 * Auto-suggest relevant KB articles for a new ticket message.
 * Returns up to 3 matching articles.
 */
async function suggest(db, guildId, ticketMessage) {
  const results = await search(db, guildId, ticketMessage);
  return results.slice(0, 3);
}

module.exports = { getAll, add, remove, search, getAndView, suggest, MAX_ARTICLES };
