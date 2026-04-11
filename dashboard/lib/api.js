export async function fetchWithAuth(endpoint, options = {}) {
  // If we had session tokens we'd pass them, but here we use the universal API_SECRET
  // to talk to our bot's apiServer.js. In production, requests from the browser
  // route through Next.js proxy (/api/* -> http://localhost:8989/api/*)
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.API_SECRET || ''}`,
    ...options.headers,
  };

  const res = await fetch(endpoint, { ...options, headers });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `API Error: ${res.status}`);
  }
  
  return res.json();
}

/** Fetch public bot health */
export async function getBotHealth() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BOT_URL || 'http://localhost:8989'}/health`);
  return res.json();
}

/** Fetch config for a specific guild */
export async function getGuildConfig(guildId) {
  // Proxied via next.config.js
  return fetchWithAuth(`/api/guild/${guildId}`);
}

/** Save config for a specific guild */
export async function updateGuildConfig(guildId, data) {
  return fetchWithAuth(`/api/guild/${guildId}/settings`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
