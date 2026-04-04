/**
 * verificationService.js — Gate ticket creation behind verification
 *
 * Modes:
 *   'none'    — no verification (default)
 *   'role'    — user must have a specific role
 *   'age'     — account must be older than N days
 *   'captcha' — user must click a button challenge before ticket creation
 *
 * DB keys:
 *   guild_<id>.ticket.settings.verification_mode      → 'none'|'role'|'age'|'captcha'
 *   guild_<id>.ticket.settings.verification_role      → roleId
 *   guild_<id>.ticket.settings.min_account_age_days   → number
 *   guild_<id>.verification.solved_<userId>           → boolean (captcha passed)
 */

const MODES = ['none', 'role', 'age', 'captcha'];

/**
 * Get the verification config for a guild.
 */
async function getConfig(db, guildId) {
  return {
    mode:    (await db.get(`guild_${guildId}.ticket.settings.verification_mode`))    || 'none',
    roleId:  (await db.get(`guild_${guildId}.ticket.settings.verification_role`))    || null,
    minAge:  (await db.get(`guild_${guildId}.ticket.settings.min_account_age_days`)) || 7,
  };
}

/**
 * Check if a member passes the verification gate.
 *
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<{ passed: boolean, reason?: string }>}
 */
async function checkVerification(db, guildId, member) {
  try {
    const cfg = await getConfig(db, guildId);

    if (cfg.mode === 'none') return { passed: true };

    if (cfg.mode === 'role') {
      if (!cfg.roleId) return { passed: true }; // misconfigured — allow
      if (!member.roles.cache.has(cfg.roleId)) {
        const role = member.guild.roles.cache.get(cfg.roleId);
        return { passed: false, reason: `🔒 You need the **${role?.name || 'required'}** role to open a ticket.` };
      }
      return { passed: true };
    }

    if (cfg.mode === 'age') {
      const accountAgeMs   = Date.now() - member.user.createdTimestamp;
      const accountAgeDays = accountAgeMs / 86400000;
      if (accountAgeDays < cfg.minAge) {
        return {
          passed: false,
          reason: `🔒 Your account must be at least **${cfg.minAge} days old** to open a ticket.\nYour account is **${Math.floor(accountAgeDays)} days old**.`,
        };
      }
      return { passed: true };
    }

    if (cfg.mode === 'captcha') {
      const solved = await db.get(`guild_${guildId}.verification.solved_${member.id}`);
      if (!solved) {
        return { passed: false, reason: '🔒 You must complete verification before opening a ticket.\n\nClick the **Verify** button in the verification channel.' };
      }
      return { passed: true };
    }

    return { passed: true };
  } catch {
    return { passed: true }; // fail-open on errors
  }
}

/**
 * Mark a user as verified (captcha mode).
 */
async function markVerified(db, guildId, userId) {
  await db.set(`guild_${guildId}.verification.solved_${userId}`, true);
}

/**
 * Check if a user is alt-account suspicious.
 * Flags: new account (<7 days) opening first ticket, or join date immediately after ban date.
 *
 * @returns {{ flagged: boolean, accountAgeDays: number, joinAgeDays: number }}
 */
async function checkAltSuspicion(db, guildId, member, sensitivity = 'medium') {
  try {
    const accountAgeMs   = Date.now() - member.user.createdTimestamp;
    const accountAgeDays = accountAgeMs / 86400000;
    const joinAgeMs      = Date.now() - member.joinedTimestamp;
    const joinAgeDays    = joinAgeMs / 86400000;

    const thresholds = {
      low:    { account: 3,  join: 1 },
      medium: { account: 7,  join: 3 },
      high:   { account: 30, join: 7 },
    };
    const t = thresholds[sensitivity] || thresholds.medium;

    const flagged = accountAgeDays < t.account || (joinAgeDays < t.join && accountAgeDays < 30);
    return { flagged, accountAgeDays: Math.floor(accountAgeDays), joinAgeDays: Math.floor(joinAgeDays) };
  } catch {
    return { flagged: false, accountAgeDays: 0, joinAgeDays: 0 };
  }
}

module.exports = { getConfig, checkVerification, markVerified, checkAltSuspicion, MODES };
