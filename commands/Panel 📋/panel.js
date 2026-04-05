/**
 * panel.js — /panel command
 * Full ticket panel management: create, send, list, delete.
 * Each panel supports multiple categories with per-category role routing.
 */
const {
  ApplicationCommandType,
  ApplicationCommandOptionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { premiumEmbed, errorMessage } = require(`${process.cwd()}/functions/functions`);
const { isStaff } = require(`${process.cwd()}/services/ticketService`);
const crypto = require('crypto');

module.exports = {
  name: 'panel',
  description: 'Manage ticket panels for your server.',
  category: 'Panel 📋',
  cooldown: 3,
  userPermissions: ['ManageChannels', 'SendMessages'],
  botPermissions: ['SendMessages', 'EmbedLinks', 'ManageChannels'],
  type: ApplicationCommandType.ChatInput,
  options: [
    {
      name: 'create',
      description: 'Create a new ticket panel with categories.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'name', description: 'Panel name (internal label).', type: ApplicationCommandOptionType.String, required: true },
        { name: 'title', description: 'Embed title shown to users.', type: ApplicationCommandOptionType.String, required: true },
        { name: 'description', description: 'Embed description.', type: ApplicationCommandOptionType.String, required: true },
        { name: 'color', description: 'Embed hex color (e.g. #7C3AED).', type: ApplicationCommandOptionType.String, required: false }
      ]
    },
    {
      name: 'add-category',
      description: 'Add a category to an existing panel.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'panel-name', description: 'Name of the panel to add to.', type: ApplicationCommandOptionType.String, required: true },
        { name: 'label', description: 'Category label (displayed in menu).', type: ApplicationCommandOptionType.String, required: true },
        { name: 'value', description: 'Category internal value (no spaces).', type: ApplicationCommandOptionType.String, required: true },
        { name: 'description', description: 'Short description in dropdown.', type: ApplicationCommandOptionType.String, required: false },
        { name: 'emoji', description: 'Emoji for this category.', type: ApplicationCommandOptionType.String, required: false },
        { name: 'role', description: 'Role to auto-assign for this category.', type: ApplicationCommandOptionType.Role, required: false }
      ]
    },
    {
      name: 'send',
      description: 'Send a panel embed to a channel.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'panel-name', description: 'Name of the panel to send.', type: ApplicationCommandOptionType.String, required: true },
        {
          name: 'channel',
          description: 'Channel to send it to (defaults to current).',
          type: ApplicationCommandOptionType.Channel,
          channelTypes: [ChannelType.GuildText],
          required: false
        },
        {
          name: 'style',
          description: 'The deployment style (Dropdown menu or Buttons).',
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: '📂 Select Menu (Default)', value: 'menu' },
            { name: '🔘 Buttons', value: 'button' }
          ]
        }
      ]
    },
    {
      name: 'list',
      description: 'List all panels configured in this server.',
      type: ApplicationCommandOptionType.Subcommand
    },
    {
      name: 'delete',
      description: 'Delete a panel.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: 'panel-name', description: 'Name of the panel to delete.', type: ApplicationCommandOptionType.String, required: true }
      ]
    }
  ],

  run: async (client, interaction) => {
    const db  = client.db;
    const sub = interaction.options.getSubcommand();
    const guildKey = `guild_${interaction.guild.id}.panels`;

    // ─── Permission check ───────────────────────────────────────────────────
    const staff = await isStaff(db, interaction.guild, interaction.member);
    if (!staff) return errorMessage(client, interaction, 'You need **Manage Channels** or a **Staff Role** to manage panels.');

    // ─── /panel create ──────────────────────────────────────────────────────
    if (sub === 'create') {
      const pName = interaction.options.getString('name').slice(0, 50);
      const panels = (await db.get(guildKey)) || [];

      if (panels.find(p => p.name.toLowerCase() === pName.toLowerCase())) {
        return errorMessage(client, interaction, `A panel named \`${pName}\` already exists. Use \`/panel add-category\` to extend it.`);
      }
      if (panels.length >= 10) {
        return errorMessage(client, interaction, 'Maximum of **10 panels** per server reached.');
      }

      const newPanel = {
        id: crypto.randomBytes(4).toString('hex'),
        name: pName,
        embed: {
          title: interaction.options.getString('title').slice(0, 256),
          description: interaction.options.getString('description').slice(0, 4096),
          color: interaction.options.getString('color') || '#7C3AED'
        },
        categories: [],
        createdAt: Date.now(),
        createdBy: interaction.user.id
      };

      panels.push(newPanel);
      await db.set(guildKey, panels);

      const embed = premiumEmbed(client, {
        title: `📋  Panel Created`,
        description: [
          `**Panel Name:** \`${pName}\``,
          `**Panel ID:** \`${newPanel.id}\``,
          ``,
          `Now add categories with \`/panel add-category panel-name:${pName}\``,
          `Then send it with \`/panel send panel-name:${pName}\``
        ].join('\n'),
        color: client.colors?.success || '#10B981'
      }).setFooter({ text: `Wave Network  •  Panel System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ─── /panel add-category ────────────────────────────────────────────────
    if (sub === 'add-category') {
      const pName  = interaction.options.getString('panel-name');
      const panels = (await db.get(guildKey)) || [];
      const panel  = panels.find(p => p.name.toLowerCase() === pName.toLowerCase());
      if (!panel) return errorMessage(client, interaction, `No panel named \`${pName}\` found. Use \`/panel create\` first.`);
      if (panel.categories.length >= 25) return errorMessage(client, interaction, 'Maximum of **25 categories** per panel (Discord limit).');

      const catValue = interaction.options.getString('value').replace(/\s+/g, '_').slice(0, 90);
      if (panel.categories.find(c => c.value === catValue)) {
        return errorMessage(client, interaction, `Category with value \`${catValue}\` already exists in this panel.`);
      }

      const role = interaction.options.getRole('role');
      const category = {
        label: interaction.options.getString('label').slice(0, 100),
        value: catValue,
        description: (interaction.options.getString('description') || '').slice(0, 100) || undefined,
        emoji: interaction.options.getString('emoji') || undefined,
        role: role?.id || undefined
      };

      panel.categories.push(category);
      await db.set(guildKey, panels);

      const embed = premiumEmbed(client, {
        title: `📂  Category Added`,
        description: [
          `**Panel:** \`${panel.name}\``,
          `**Category:** \`${category.label}\` (\`${category.value}\`)`,
          role ? `**Routed Role:** ${role}` : '**Role Routing:** None (all staff can see)',
          ``,
          `Panel now has **${panel.categories.length}** categor${panel.categories.length === 1 ? 'y' : 'ies'}.`
        ].join('\n'),
        color: client.colors?.success || '#10B981'
      }).setFooter({ text: `Wave Network  •  Panel System`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // ─── /panel send ────────────────────────────────────────────────────────
    if (sub === 'send') {
      const pName   = interaction.options.getString('panel-name');
      const panels  = (await db.get(guildKey)) || [];
      const panel   = panels.find(p => p.name.toLowerCase() === pName.toLowerCase());
      if (!panel) return errorMessage(client, interaction, `No panel named \`${pName}\` found.`);
      if (panel.categories.length === 0) return errorMessage(client, interaction, `Panel \`${pName}\` has no categories. Add some with \`/panel add-category\`.`);

      const target = interaction.options.getChannel('channel') || interaction.channel;

      // Build the premium panel embed
      const panelEmbed = premiumEmbed(client, {
        title: `🔱  ${panel.embed.title || 'Wave Network | Support Center'}`,
        description: [
          `${panel.embed.description || 'Welcome to our specialized support portal.'}`,
          ``,
          `**How it works:**`,
          `1️⃣ Select the appropriate category below.`,
          `2️⃣ Describe your issue in the popup modal.`,
          `3️⃣ A staff member will be with you shortly.`,
          ``,
          `> *All interactions are logged for quality and security purposes.*`
        ].join('\n'),
        color: panel.embed.color || client.colors?.primary,
        fields: [
          { name: '🕒  Avg. Response', value: '`⚡ < 15 Mins`', inline: true },
          { name: '🛡️  Privacy', value: '`🔒 Encrypted`', inline: true },
          { name: '👥  Active Staff', value: '`🛡️ Available`', inline: true }
        ]
      })
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setImage(panel.embed.image || null)
      .setFooter({ text: `${interaction.guild.name}  •  Premium Support Hub`, iconURL: interaction.guild.iconURL({ dynamic: true }) });

      const style = interaction.options.getString('style') || 'menu';

      let components = [];
      if (style === 'menu') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`panel_select`)
          .setPlaceholder(`🎫  Select a category to open a ticket`)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(panel.categories.map(cat => {
            const opt = { label: cat.label, value: `${panel.id}__${cat.value}` };
            if (cat.description) opt.description = cat.description;
            if (cat.emoji) opt.emoji = cat.emoji;
            return opt;
          }));
        components = [new ActionRowBuilder().addComponents(selectMenu)];
      } else {
        // Build Buttons (max 5 per row, max 25 total)
        for (let i = 0; i < panel.categories.length; i += 5) {
          const row = new ActionRowBuilder();
          const chunk = panel.categories.slice(i, i + 5);
          chunk.forEach(cat => {
            const btn = new ButtonBuilder()
              .setCustomId(`panel_button:${panel.id}:${cat.value}`)
              .setLabel(cat.label)
              .setStyle(ButtonStyle.Success); // Premium default
            if (cat.emoji) btn.setEmoji(cat.emoji);
            row.addComponents(btn);
          });
          components.push(row);
        }
      }

      await target.send({ embeds: [panelEmbed], components });

      const confirm = premiumEmbed(client, {
        title: `✅  Panel Sent`,
        description: `Panel \`${panel.name}\` sent to ${target}.`,
        color: client.colors?.success || '#10B981'
      });
      return interaction.reply({ embeds: [confirm], flags: 64 });
    }

    // ─── /panel list ────────────────────────────────────────────────────────
    if (sub === 'list') {
      const panels = (await db.get(guildKey)) || [];
      if (panels.length === 0) {
        return interaction.reply({
          embeds: [premiumEmbed(client, { title: '📋  No Panels', description: 'Create your first panel with `/panel create`.', color: client.colors?.primary || '#7C3AED' })],
          flags: 64
        });
      }

      const lines = panels.map((p, i) =>
        `\`#${i + 1}\` **${p.name}** \`ID: ${p.id}\` — ${p.categories.length} categor${p.categories.length === 1 ? 'y' : 'ies'}`
      ).join('\n');

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `📋  Server Panels (${panels.length}/10)`,
          description: lines,
          color: client.colors?.primary || '#7C3AED'
        }).setFooter({ text: `Wave Network  •  Panel System`, iconURL: interaction.guild.iconURL({ dynamic: true }) })],
        flags: 64
      });
    }

    // ─── /panel delete ──────────────────────────────────────────────────────
    if (sub === 'delete') {
      const pName  = interaction.options.getString('panel-name');
      let panels   = (await db.get(guildKey)) || [];
      const idx    = panels.findIndex(p => p.name.toLowerCase() === pName.toLowerCase());
      if (idx === -1) return errorMessage(client, interaction, `No panel named \`${pName}\` found.`);

      panels.splice(idx, 1);
      await db.set(guildKey, panels);

      return interaction.reply({
        embeds: [premiumEmbed(client, {
          title: `🗑️  Panel Deleted`,
          description: `Panel \`${pName}\` has been deleted.`,
          color: client.colors?.error || '#EF4444'
        })],
        flags: 64
      });
    }
  }
};
