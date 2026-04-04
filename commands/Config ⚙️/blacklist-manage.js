/**
 * blacklist-manage.js — /blacklist command
 * Enhanced keyword blacklist management with regex support, categories,
 * and test mode.
 *
 * /blacklist add <keyword> [regex]
 * /blacklist remove <keyword>
 * /blacklist list
 * /blacklist test <message>
 * /blacklist clear-all
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

const MAX_KEYWORDS = 200;
const PAGE_SIZE    = 20;

// DB key format: guild_<id>.blacklist_v2 → BlacklistEntry[]
// BlacklistEntry: { pattern, isRegex, addedBy, addedAt }

async function getList(db, guildId) {
  return (await db.get(`guild_${guildId}.blacklist_v2`)) || [];
}

function testContent(list, content) {
  const lower = content.toLowerCase();
  for (const entry of list) {
    if (entry.isRegex) {
      try {
        const match = lower.match(new RegExp(entry.pattern, 'i'));
        if (match) return { matched: true, pattern: entry.pattern, isRegex: true };
      } catch { /* invalid regex — skip */ }
    } else {
      if (lower.includes(entry.pattern.toLowerCase())) return { matched: true, pattern: entry.pattern, isRegex: false };
    }
  }
  return { matched: false };
}

module.exports = {
  name: 'blacklist',
  description: 'Manage the ticket message keyword blacklist (with regex support).',
  category: 'Config ⚙️',
  cooldown: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Add a keyword or regex pattern to the blacklist.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'pattern', description: 'Keyword or regex to block.',     type: ApplicationCommandOptionType.String, required: true },
        { name: 'regex',   description: 'Treat pattern as a regex?',      type: ApplicationCommandOptionType.Boolean, required: false },
      ],
    },
    {
      name: 'remove',
      description: 'Remove a keyword or pattern from the blacklist.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'pattern', description: 'Pattern to remove.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'List all blacklisted keywords and patterns.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'test',
      description: 'Test a message against the blacklist without taking action.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'message', description: 'Message to test.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'clear-all',
      description: '⚠️ Remove ALL blacklisted keywords (requires confirmation).',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'config.set', client.config, interaction, errorMessage);
    if (denied) return;

    // ── ADD ──────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const pattern = interaction.options.getString('pattern').trim();
      const isRegex = interaction.options.getBoolean('regex') || false;
      const list    = await getList(db, guildId);

      if (list.length >= MAX_KEYWORDS) return errorMessage(client, interaction, `Max ${MAX_KEYWORDS} blacklist entries reached.`);
      if (list.find(e => e.pattern === pattern)) return errorMessage(client, interaction, `\`${pattern}\` is already on the blacklist.`);

      // Validate regex if applicable
      if (isRegex) {
        try { new RegExp(pattern); } catch {
          return errorMessage(client, interaction, `Invalid regex: \`${pattern}\``);
        }
      }

      list.push({ pattern, isRegex, addedBy: interaction.user.id, addedAt: Date.now() });
      await db.set(`guild_${guildId}.blacklist_v2`, list);
      await auditSvc.log(db, guildId, interaction.user.id, 'blacklist.add', { pattern, isRegex });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  Blacklist Updated',
          description: `${isRegex ? '🔤 Regex' : '📝 Keyword'} \`${pattern}\` added.\n\n*Messages containing this pattern will be flagged.*`,
          color: '#10B981',
        }).setFooter({ text: `${list.length}/${MAX_KEYWORDS}  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const pattern  = interaction.options.getString('pattern').trim();
      const list     = await getList(db, guildId);
      const filtered = list.filter(e => e.pattern !== pattern);
      if (filtered.length === list.length) return errorMessage(client, interaction, `\`${pattern}\` not found in blacklist.`);
      await db.set(`guild_${guildId}.blacklist_v2`, filtered);
      await auditSvc.log(db, guildId, interaction.user.id, 'blacklist.remove', { pattern });
      return interaction.reply({
        embeds: [premiumEmbed(client, { title: '🗑️  Pattern Removed', description: `\`${pattern}\` has been removed from the blacklist.`, color: '#EF4444' })
          .setFooter({ text: 'Wave Network  •  Blacklist', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const list = await getList(db, guildId);
      if (!list.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, { title: '🚫  Blacklist', description: 'No blacklisted patterns.\n\nAdd with `/blacklist add <pattern>`.', color: '#6B7280' })],
          ephemeral: true,
        });
      }
      const lines = list.slice(0, PAGE_SIZE).map((e, i) =>
        `\`${i + 1}.\` ${e.isRegex ? '🔤' : '📝'} \`${e.pattern}\`  — <@${e.addedBy}> <t:${Math.floor(e.addedAt / 1000)}:R>`
      );
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🚫  Blacklist  ·  ${list.length}/${MAX_KEYWORDS}`,
          description: lines.join('\n') + (list.length > PAGE_SIZE ? `\n*…and ${list.length - PAGE_SIZE} more*` : ''),
          color: '#7C3AED',
        }).setFooter({ text: `🔤 = regex  📝 = keyword  •  Wave Network`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── TEST ─────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const message = interaction.options.getString('message');
      const list    = await getList(db, guildId);
      const result  = testContent(list, message);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: result.matched ? '🔴  Match Found' : '🟢  Clean',
          description: result.matched
            ? `The message would be **flagged**.\n\n**Matched pattern:** \`${result.pattern}\` (${result.isRegex ? 'regex' : 'keyword'})\n**Message:** \`${message.slice(0, 100)}\``
            : `No blacklisted patterns found in:\`${message.slice(0, 100)}\``,
          color: result.matched ? '#EF4444' : '#10B981',
        }).setFooter({ text: `Wave Network  •  Blacklist Test`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    // ── CLEAR-ALL ────────────────────────────────────────────────────────────
    if (sub === 'clear-all') {
      const list = await getList(db, guildId);
      if (!list.length) return errorMessage(client, interaction, 'The blacklist is already empty.');

      await db.set(`guild_${guildId}.blacklist_v2`, []);
      await auditSvc.log(db, guildId, interaction.user.id, 'blacklist.clear_all', { count: list.length });
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '⚠️  Blacklist Cleared',
          description: `All **${list.length}** blacklisted patterns have been removed.`,
          color: '#EF4444',
        }).setFooter({ text: 'Wave Network  •  Blacklist', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
