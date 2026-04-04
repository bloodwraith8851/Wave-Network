/**
 * faq-rules.js — /faq-rules command
 * Configure custom auto-reply rules per guild.
 * Replaces hardcoded rules in autoReplyService.js.
 *
 * DB key: guild_<id>.auto_reply_rules → Array<{keyword, response, regex}>
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const permSvc  = require(`${process.cwd()}/services/permissionService`);
const auditSvc = require(`${process.cwd()}/services/auditService`);

module.exports = {
  name: 'faq-rules',
  description: 'Manage custom auto-reply rules triggered by keywords in new tickets.',
  category: 'Config ⚙️',
  cooldown: 3,
  userPermissions: ['ManageGuild'],
  botPermissions: ['SendMessages', 'EmbedLinks'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'add',
      description: 'Add a keyword trigger with an auto-reply message.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'keyword',  description: 'Keyword or phrase to trigger (supports regex if wrapped in /.../)', type: ApplicationCommandOptionType.String, required: true },
        { name: 'response', description: 'Auto-reply message to send when keyword is matched.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'list',
      description: 'List all configured auto-reply rules.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'remove',
      description: 'Remove an auto-reply rule by keyword.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'keyword', description: 'Keyword to remove.', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
  ],

  run: async (client, interaction) => {
    const db      = client.db;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const denied = await permSvc.requirePermission(db, interaction.guild, interaction.member, 'faq.rules', client.config, interaction, errorMessage);
    if (denied) return;

    const key  = `guild_${guildId}.auto_reply_rules`;
    let rules  = (await db.get(key)) || [];

    if (sub === 'add') {
      const keyword  = interaction.options.getString('keyword').trim();
      const response = interaction.options.getString('response').trim();

      // Detect regex pattern /pattern/flags
      let isRegex = false;
      let pattern = keyword;
      const regexMatch = keyword.match(/^\/(.+)\/([gimsuy]*)$/);
      if (regexMatch) {
        isRegex = true;
        pattern = regexMatch[1];
        try { new RegExp(pattern, regexMatch[2]); } catch {
          return errorMessage(client, interaction, `Invalid regex pattern: \`${keyword}\``);
        }
      }

      if (rules.find(r => r.keyword === keyword)) {
        return errorMessage(client, interaction, `A rule for \`${keyword}\` already exists.`);
      }
      if (rules.length >= 100) {
        return errorMessage(client, interaction, 'Max 100 auto-reply rules reached. Remove one first.');
      }

      rules.push({ keyword, response, isRegex, createdAt: Date.now() });
      await db.set(key, rules);
      await auditSvc.log(db, guildId, interaction.user.id, 'faq_rule.add', { keyword });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '✅  FAQ Rule Added',
          description: `**Trigger:** \`${keyword}\`${isRegex ? ' *(regex)*' : ''}\n**Response:** ${response.slice(0, 100)}${response.length > 100 ? '…' : ''}`,
          color: '#10B981',
        }).setFooter({ text: `Wave Network  •  Auto-Reply Rules`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      if (!rules.length) {
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '📋  FAQ Auto-Reply Rules',
            description: 'No rules configured yet.\n\nUse `/faq-rules add <keyword> <response>` to create one.',
            color: '#6B7280',
          })],
          ephemeral: true,
        });
      }
      const lines = rules.map((r, i) =>
        `\`${String(i+1).padStart(2)}\` ${r.isRegex ? '🔢' : '🔤'} **${r.keyword}**\n> ${r.response.slice(0, 80)}${r.response.length > 80 ? '…' : ''}`
      );
      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📋  FAQ Rules  ·  ${rules.length}/100`,
          description: lines.join('\n\n').slice(0, 4000),
          color: '#7C3AED',
        }).setFooter({ text: `Wave Network  •  Auto-Reply Rules`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      const keyword = interaction.options.getString('keyword').trim();
      const before  = rules.length;
      rules = rules.filter(r => r.keyword !== keyword);
      if (rules.length === before) return errorMessage(client, interaction, `No rule found for keyword \`${keyword}\`.`);
      await db.set(key, rules);
      await auditSvc.log(db, guildId, interaction.user.id, 'faq_rule.remove', { keyword });

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: '🗑️  FAQ Rule Removed',
          description: `Rule for \`${keyword}\` has been deleted.`,
          color: '#EF4444',
        }).setFooter({ text: `Wave Network  •  Auto-Reply Rules`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        ephemeral: true,
      });
    }
  },
};
