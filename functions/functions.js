const {
  ButtonBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonStyle,
  ChannelType,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  MessageFlags
} = require("discord.js");

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM EMBED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a premium-styled EmbedBuilder.
 * @param {object} client
 * @param {{ title?: string, description?: string, color?: string }} options
 * @returns {EmbedBuilder}
 */
function premiumEmbed(client, { title, description, color } = {}) {
  const embed = new EmbedBuilder()
    .setColor(color || '#7C3AED')
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  return embed;
}

/**
 * Returns a priority badge string with emoji.
 * @param {'high'|'medium'|'low'} priority
 */
function priorityBadge(priority = 'medium') {
  const map = {
    high:   '🔴 **HIGH**',
    medium: '🟡 **MEDIUM**',
    low:    '🟢 **LOW**'
  };
  return map[priority.toLowerCase()] || map.medium;
}

/**
 * Returns a ticket control ActionRow based on current state.
 * @param {{ state: 'open'|'closed', disableClose?: boolean, disableOpen?: boolean }} opts
 */
function ticketControlRow({ state = 'open', disableClose = false, disableOpen = false } = {}) {
  const isOpen = state === 'open';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableClose || !isOpen),
    new ButtonBuilder()
      .setCustomId('open')
      .setLabel('Re-open Ticket')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disableOpen || isOpen),
    new ButtonBuilder()
      .setCustomId('delete')
      .setLabel('Delete Ticket')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Returns an error embed response.
 */
async function errorMessage(client, interaction, error) {
  let member;
  try { member = interaction.guild?.members?.cache?.get(interaction.member?.id); } catch { /* */ }

  const msg = String(error);

  // ── Contextual error type detection ──────────────────────────────────────
  let title = '⛔  Error';
  let color = '#EF4444';
  let hint  = '';

  if (/permission|manage|administrator|missing access|missing permissions/i.test(msg)) {
    title = '🔒  Permission Denied'; color = '#8B5CF6';
    hint  = '\n\n> You lack the required permissions for this action.';
  } else if (/cooldown|wait|seconds/i.test(msg)) {
    title = '⏱️  Cooldown Active'; color = '#F59E0B';
    hint  = '\n\n> Please wait before using this command again.';
  } else if (/not found|invalid|no .*found|doesn.t exist/i.test(msg)) {
    title = '🔍  Not Found'; color = '#6B7280';
    hint  = '\n\n> The requested resource could not be found.';
  } else if (/config|setup|settings|not set|not configured/i.test(msg)) {
    title = '⚙️  Configuration Required'; color = '#F97316';
    hint  = '\n\n> Run `/settings` to set this up first.';
  } else if (/staff|admin role|ticket admin/i.test(msg)) {
    title = '🛡️  Staff Only'; color = '#EC4899';
    hint  = '\n\n> This action requires Staff/Admin level or higher.';
  } else if (/ticket/i.test(msg) && /already|open|exist/i.test(msg)) {
    title = '🎫  Ticket Already Exists'; color = '#F59E0B';
    hint  = '\n\n> You already have an open ticket.';
  } else if (/rate.?limit/i.test(msg)) {
    title = '🌐  Rate Limited'; color = '#06B6D4';
    hint  = '\n\n> The bot is being rate-limited. Please try again shortly.';
  } else if (/database|db|quick.?db/i.test(msg)) {
    title = '🗄️  Database Error'; color = '#EF4444';
    hint  = '\n\n> A database error occurred. Please try again.';
  } else if (/network|econnreset|etimedout|econnrefused/i.test(msg)) {
    title = '📡  Network Error'; color = '#6B7280';
    hint  = '\n\n> A network issue occurred. Please try again shortly.';
  } else if (/inside a ticket/i.test(msg)) {
    title = '🎫  Not In a Ticket'; color = '#6B7280';
    hint  = '\n\n> This command must be used inside a ticket channel.';
  } else if (/blacklist/i.test(msg)) {
    title = '🚫  Blacklisted Content'; color = '#EF4444';
    hint  = '\n\n> Your message contains a flagged keyword.';
  } else if (/max|limit|reached/i.test(msg)) {
    title = '📦  Limit Reached'; color = '#F97316';
    hint  = '\n\n> You have reached the maximum allowed for this feature.';
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(`${msg}${hint}`)
    .setFooter({
      text: `${member?.user?.tag || interaction.user?.tag || 'Unknown'}  •  Wave Network`,
      iconURL: (member?.user || interaction.user)?.displayAvatarURL({ dynamic: true })
    })
    .setTimestamp();

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Error').setEmoji('⚠️').setCustomId('error_btn').setDisabled(true)
    )
  ];

  const payload = { embeds: [embed], components, flags: MessageFlags.Ephemeral };

  // ── Safe reply: handles deferred, already-replied, and expired interactions ──
  try {
    if (interaction.deferred && !interaction.replied) {
      return await interaction.editReply(payload).catch(() => null);
    }
    if (interaction.replied) {
      return await interaction.followUp(payload).catch(() => null);
    }
    return await interaction.reply(payload).catch(() => null);
  } catch {
    return null;
  }
}


/**
 * Log to the mod log channel with a premium embed.
 * @param {object} client
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').TextChannel} channel  — log channel
 * @param {string} message
 * @param {string} reason
 * @param {string} emote
 * @param {boolean} [has_file]
 * @param {object} [file]
 */
async function logMessage(client, interaction, channel, message, reason, emote, has_file, file) {
  const member = interaction.guild?.members?.cache?.get(interaction.member?.id);

  // Color map based on reason type
  const colorMap = {
    'Ticket Created':  '#10B981',
    'Ticket Closed':   '#F59E0B',
    'Ticket Deleted':  '#EF4444',
    'Ticket Opened':   '#3B82F6',
    'Ticket Renamed':  '#8B5CF6',
    'Ticket Invte People': '#06B6D4',
  };
  const color = colorMap[reason] || '#7C3AED';

  const embed = new EmbedBuilder()
    .setTitle(`${emote}  ${reason}`)
    .setColor(color)
    .setThumbnail(member?.user?.displayAvatarURL({ format: 'png', dynamic: true }) || null)
    .setDescription(message)
    .setTimestamp()
    .addFields([
      { name: '👤 Requested By', value: `${member?.user || 'Unknown'} | \`${member?.user?.tag || 'N/A'}\``, inline: true },
      { name: '📌 Channel', value: `${interaction.channel} | \`${interaction.channel?.name}\``, inline: true },
      { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false },
    ])
    .setFooter({ text: `${interaction.guild?.name}  •  Logs`, iconURL: interaction.guild?.iconURL({ dynamic: true }) });

  if (has_file && file) {
    return channel.send({ files: [file], embeds: [embed] });
  }
  return channel.send({ embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY / UTILITY HELPERS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function HelpCategoryEmbed(commands, CategoryName, client, message, component) {
  const member = message.guild.members.cache.get(message.member.id);

  const catEmoji = {
    'Infos 📊': '📊', 'Setup 💻': '💻', 'Ticket 🎫': '🎫',
    'Staff 🛡️': '🛡️', 'Panel 📋': '📋', 'Moderation 🔨': '🔨',
    'Community 🌐': '🌐', 'Config ⚙️': '⚙️', 'Premium 💎': '💎', 'Owner 👑': '👑'
  };
  const catColor = {
    'Infos 📊': '#6366F1', 'Setup 💻': '#8B5CF6', 'Ticket 🎫': '#7C3AED',
    'Staff 🛡️': '#EC4899', 'Panel 📋': '#3B82F6', 'Moderation 🔨': '#EF4444',
    'Community 🌐': '#10B981', 'Config ⚙️': '#F59E0B', 'Premium 💎': '#F59E0B', 'Owner 👑': '#EF4444'
  };

  const emoji = catEmoji[CategoryName] || '📋';
  const color = catColor[CategoryName] || '#7C3AED';

  const filteredCmds = [...commands.values()].filter(c => c.category === CategoryName);
  if (filteredCmds.length === 0) {
    const embed = new EmbedBuilder().setColor(color).setTitle(`${emoji}  ${CategoryName}`)
      .setDescription('No commands in this category yet.').setTimestamp();
    return message.update({ embeds: [embed], components: component });
  }

  // Build clean compact lines
  const lines = [];
  for (const cmd of filteredCmds) {
    // Try Discord cache first; fall back to local file definition
    const cm   = client.application.commands.cache.find(c => c.name === cmd.name);
    const name = cmd.name;
    const desc = cm?.description || cmd.description || 'No description.';
    const opts = cm?.options || cmd.options || [];

    const hasSubs = opts.some(o =>
      o.type === ApplicationCommandOptionType.Subcommand || o.type === 1
    );

    // Build slash mention or fallback to code block
    const mention = cm ? `</${name}:${cm.id}>` : `\`/${name}\``;

    if (hasSubs) {
      lines.push(mention);
      opts
        .filter(o => o.type === ApplicationCommandOptionType.Subcommand || o.type === 1)
        .forEach((sub, i, arr) => {
          const subParams = (sub.options || [])
            .map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
          const prefix = i === arr.length - 1 ? '╰' : '├';
          lines.push(`\`${prefix} ${sub.name}${subParams ? ' ' + subParams : ''}\` — ${sub.description}`);
        });
    } else {
      const params = opts
        .filter(o => o.type !== 1 && o.type !== 2)
        .map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
      const usage = params ? `\`${params}\`` : '';
      const cd    = cmd.cooldown ? ` · \`${cmd.cooldown}s\`` : '';
      lines.push(`${mention} ${usage} — ${desc}${cd}`);
    }
    lines.push(''); // spacing
  }

  // Remove trailing empty line
  if (lines[lines.length - 1] === '') lines.pop();

  const desc = lines.join('\n').slice(0, 4000);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${client.user.username}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
    .setTitle(`${emoji}  ${CategoryName}  ·  ${filteredCmds.length} command${filteredCmds.length !== 1 ? 's' : ''}`)
    .setDescription(desc)
    .setFooter({
      text: `<required>  [optional]  ·  /help <command> for details  ·  Wave Network`,
      iconURL: member?.user?.displayAvatarURL({ dynamic: true })
    })
    .setTimestamp();

  return message.update({ embeds: [embed], components: component });
}

// BUG FIX #3: Was a busy-wait spin loop that blocked the entire Node.js event loop.
// Replaced with a non-blocking Promise+setTimeout so other handlers keep running.
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function epochDateNow() {
  return Date.parse(new Date()) / 1000;
}

async function epochDateCustom(date) {
  return Date.parse(date) / 1000;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US').format(date);
}

async function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  // Premium new helpers
  premiumEmbed,
  priorityBadge,
  ticketControlRow,
  // Existing helpers (preserved)
  logMessage,
  errorMessage,
  HelpCategoryEmbed,
  wait,
  epochDateNow,
  epochDateCustom,
  formatDate,
  randomRange,
};
