/**
 * shift.js — /shift command
 * Staff duty management — go on/off duty with tracked shift duration.
 *
 * DB keys:
 *   guild_<id>.shift.on_<userId>     → { startedAt: timestamp }
 *   guild_<id>.shift.log_<userId>    → ShiftLog[]
 *   guild_<id>.shift.active          → userId[]  (currently on-duty staff)
 *
 * ShiftLog: { startedAt, endedAt, durationMs }
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc = require(`${process.cwd()}/services/permissionService`);

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000)   / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  name: 'shift',
  description: 'Manage your on-duty status and track shift hours.',
  category: 'Staff 🛡️',
  cooldown: 5,
  userPermissions: ['SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'on',
      description: 'Set yourself as on-duty / start your shift.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'off',
      description: 'Set yourself as off-duty / end your shift.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'status',
      description: 'View current on-duty staff.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'history',
      description: 'View your shift history.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'user', description: 'View another staff member\'s history (Admin+).', type: ApplicationCommandOptionType.User, required: false },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const guildId = interaction.guild.id;
    const userId  = interaction.user.id;
    const sub     = interaction.options.getSubcommand();

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'staff.shift', client.config, interaction, errorMessage);
    if (denied) return;

    // ── ON ───────────────────────────────────────────────────────────────────
    if (sub === 'on') {
      const existing = await db.get(`guild_${guildId}.shift.on_${userId}`);
      if (existing) {
        const elapsed = fmtDuration(Date.now() - existing.startedAt);
        return errorMessage(client, interaction, `You are already **on duty** — started ${elapsed} ago.\nUse \`/shift off\` to end your shift first.`);
      }

      const startedAt = Date.now();
      await db.set(`guild_${guildId}.shift.on_${userId}`, { startedAt });

      // Track in active list
      const active = (await db.get(`guild_${guildId}.shift.active`)) || [];
      if (!active.includes(userId)) { active.push(userId); await db.set(`guild_${guildId}.shift.active`, active); }

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🟢  Shift Started',
          description: `${interaction.user} is now **on duty** and accepting tickets.\n\n**Started:** <t:${Math.floor(startedAt / 1000)}:R>`,
          color: '#10B981',
        })
          .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setFooter({ text: 'Wave Network  •  Shift Tracker', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }

    // ── OFF ──────────────────────────────────────────────────────────────────
    if (sub === 'off') {
      const shift = await db.get(`guild_${guildId}.shift.on_${userId}`);
      if (!shift) return errorMessage(client, interaction, 'You are not currently on duty. Use `/shift on` to start your shift.');

      const endedAt    = Date.now();
      const durationMs = endedAt - shift.startedAt;
      const duration   = fmtDuration(durationMs);

      // Log shift
      const log = (await db.get(`guild_${guildId}.shift.log_${userId}`)) || [];
      log.push({ startedAt: shift.startedAt, endedAt, durationMs });
      if (log.length > 100) log.splice(0, log.length - 100); // keep last 100 shifts
      await db.set(`guild_${guildId}.shift.log_${userId}`, log);

      // Remove from active
      await db.delete(`guild_${guildId}.shift.on_${userId}`);
      const active = ((await db.get(`guild_${guildId}.shift.active`)) || []).filter(id => id !== userId);
      await db.set(`guild_${guildId}.shift.active`, active);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🔴  Shift Ended',
          description: `${interaction.user} has gone **off duty**.\n\n**Duration:** \`${duration}\`\n**Total shifts:** \`${log.length}\``,
          color: '#EF4444',
        })
          .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setFooter({ text: 'Wave Network  •  Shift Tracker', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }

    // ── STATUS ───────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const active = (await db.get(`guild_${guildId}.shift.active`)) || [];
      if (!active.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '🛡️  On-Duty Staff',
            description: '*No staff are currently on duty.*\n\nStaff can use `/shift on` to go on duty.',
            color: '#6B7280',
          }).setFooter({ text: 'Wave Network  •  Shift Tracker', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        });
      }

      const lines = await Promise.all(active.map(async uid => {
        const shift   = await db.get(`guild_${guildId}.shift.on_${uid}`);
        const elapsed = shift ? fmtDuration(Date.now() - shift.startedAt) : 'Unknown';
        return `🟢 <@${uid}> — on duty for \`${elapsed}\``;
      }));

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🛡️  On-Duty Staff  ·  ${active.length} active`,
          description: lines.join('\n'),
          color: '#10B981',
        }).setFooter({ text: 'Wave Network  •  Shift Tracker', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
      });
    }

    // ── HISTORY ──────────────────────────────────────────────────────────────
    if (sub === 'history') {
      const target     = interaction.options.getUser('user') || interaction.user;

      // Only admins can view others' history
      if (target.id !== userId) {
        const memberLevel = await permSvc.getMemberLevel(db, interaction.guild, interaction.member, client.config);
        if (memberLevel < 3) return errorMessage(client, interaction, 'You need **Admin** level to view other staff members\' shift history.');
      }

      const log = (await db.get(`guild_${guildId}.shift.log_${target.id}`)) || [];
      if (!log.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: `📋  Shift History — ${target.username}`,
            description: 'No shift history recorded yet.',
            color: '#6B7280',
          })],
          ephemeral: true,
        });
      }

      const recentShifts   = log.slice(-10).reverse();
      const totalMs        = log.reduce((s, l) => s + l.durationMs, 0);
      const lines          = recentShifts.map((l, i) =>
        `\`${i+1}.\` <t:${Math.floor(l.startedAt / 1000)}:d> — \`${fmtDuration(l.durationMs)}\``
      );

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📋  Shift History — ${target.username}`,
          description: lines.join('\n'),
          color: '#7C3AED',
        })
          .addFields([
            { name: '⏱️ Total Tracked', value: `\`${fmtDuration(totalMs)}\``, inline: true },
            { name: '📊 Total Shifts',  value: `\`${log.length}\``,           inline: true },
          ])
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: `Wave Network  •  Shift Tracker  •  Last 10 shown`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
