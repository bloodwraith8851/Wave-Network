const {
    ButtonBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ButtonStyle,
    ChannelType,
    ApplicationCommandType,
    ApplicationCommandOptionType,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    PermissionsBitField,
    TextInputStyle
  } = require('discord.js');
/**
 * Build the main settings dashboard embed with current guild configuration.
 */
async function buildSettingsEmbed(db, guild, client, interaction) {
  const guildId = guild.id;
  const [
    type,
    adminRole,
    modRole,
    staffRole,
    modLog,
    category,
    menuOptions
  ] = await Promise.all([
    db.get(`guild_${guildId}.ticket.type`),
    db.get(`guild_${guildId}.ticket.admin_role`),
    db.get(`guild_${guildId}.permissions.roles.moderator`),
    db.get(`guild_${guildId}.permissions.roles.staff`),
    db.get(`guild_${guildId}.modlog`),
    db.get(`guild_${guildId}.ticket.category`),
    db.get(`guild_${guildId}.ticket.menu_option`)
  ]);

  const fields = [
    { 
      name: `Guild Ticket Type:`, 
      value: type 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply} \`${type}\`` 
        : `${client.emotes.reply} \`Reason - Menu - UserTag\` (Default)`, 
      inline: false 
    },
    { 
      name: `Guild Admin Role:`, 
      value: adminRole 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply}<@&${adminRole}>` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: true 
    },
    { 
      name: `Guild Mod Role:`, 
      value: modRole 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply}<@&${modRole}>` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: true 
    },
    { 
      name: `Guild Staff Role:`, 
      value: staffRole 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply}<@&${staffRole}>` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: true 
    },
    { 
      name: `Guild Mod Log:`, 
      value: modLog 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply} <#${modLog}>` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: false 
    },
    { 
      name: `Guild Parent Channel:`, 
      value: category 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply} <#${category}>` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: false 
    },
    { 
      name: `Guild Ticket Menu Options:`, 
      value: (menuOptions && menuOptions.length) 
        ? `${client.emotes.reply} Enable ${client.emotes.enable1}${client.emotes.enable2}\n${client.emotes.reply}${menuOptions.map(o => `**Name:** \`${o.value}\` | **Emoji:** ${o.emoji || "none"}`).join(`\n${client.emotes.reply}`)}` 
        : `${client.emotes.reply} Disabled ${client.emotes.disable1}${client.emotes.disable2}`, 
      inline: false 
    }
  ];

  return premiumEmbed(client, {
    title: `${client.emotes.setting}| Welcome to the setting`,
    description: `This is __${client.user.username}__ setting from **${guild.name}** and you can setup all things you need for setting up your guild.`,
    fields,
    thumbnail: guild.iconURL({ dynamic: true })
  }).setFooter({ text: `Setting • Requested By ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
}

module.exports = {
  name: 'settings',
  category: 'Setup 💻',
  type: ApplicationCommandType.ChatInput,
  cooldown: 1,
  description: "Show a dashboard of guild setting for you.",
  userPermissions: ["ManageChannels", "ManageGuild", "SendMessages"],
  botPermissions: ["ManageChannels", "SendMessages", "EmbedLinks"],
  run: async (client, interaction) => {
    let db = client.db;
    try {
      await interaction.deferReply({ flags: 64 });

      let menu = new StringSelectMenuBuilder().setCustomId("setup_menu").setMaxValues(1).setMinValues(1).setPlaceholder(`${client.emotes.setting}| Click me to setup !!`).addOptions([
        { label: `Setup Bot Language`,       value: `stlanguage`, emoji: `${client.emotes.language}` },
        { label: `Setup Admin Role`,          value: `stadmin`,    emoji: `${client.emotes.admin}` },
        { label: `Setup Mod Role`,            value: `stmod`,      emoji: `⚒️` },
        { label: `Setup Staff Role`,          value: `ststaff`,    emoji: `🛡️` },
        { label: `Setup Ticket Category`,     value: `stcategory`, emoji: `${client.emotes.category}` },
        { label: `Setup Ticket Log`,          value: `stlog`,      emoji: `${client.emotes.log}` },
        { label: `Setup Ticket Type`,         value: `sttype`,     emoji: `${client.emotes.type}` },
        { label: `Setup Ticket Menu Option`,  value: `stoption`,   emoji: `${client.emotes.option}` },
        { label: `Setup Max Open Tickets`,    value: `stmaxtickets`, emoji: `🎟️` },
        { label: `Setup Ticket Cooldown`,     value: `stcooldown`,   emoji: `⏳` },
        { label: `Setup Transcript Channel`,  value: `sttranscript`, emoji: `📄` },
        { label: `Toggle Auto-Close`,         value: `stAutoClose`,  emoji: `🕒` },
        { label: `Toggle Staff Reminders`,    value: `stReminders`,  emoji: `🔔` },
        { label: `Toggle Rating DMs`,         value: `stRatings`,    emoji: `⭐` },
      ]);
      
      const time = 120000;
      const embed = await buildSettingsEmbed(db, interaction.guild, client, interaction);

      const msg = await interaction.editReply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu), 
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Report').setEmoji(client.emotes.report).setCustomId(`report`), 
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji(client.emotes.help).setURL(`${client.config.discord.server_support}`)
          ), 
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setDisabled(true).setEmoji(client.emotes.home).setCustomId("home_page")
          )
        ],
        withResponse: true
      });
          const collector = msg.createMessageComponentCollector({ time: time });
          
          collector.on('collect', async (m) => {
            if (m.user.id !== interaction.user.id) return errorMessage(client, m, `This message is only for ${interaction.user} and you cannot use it.`);

            if (m.isButton()) {
              if (m.customId === "home_page") {
                const homeEmbed = await buildSettingsEmbed(db, interaction.guild, client, interaction);
                m.update({
                  embeds: [homeEmbed],
                  components: [
                    new ActionRowBuilder().addComponents(menu), 
                    new ActionRowBuilder().addComponents(
                      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Report').setEmoji(client.emotes.report).setCustomId(`report`), 
                      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji(client.emotes.help).setURL(`${client.config.discord.server_support}`)
                    ), 
                    new ActionRowBuilder().addComponents(
                      new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page").setDisabled(true)
                    )
                  ],
                }).catch(() => null);
              }
              if (m.customId === "menu_option") {
                const input_1 = new TextInputBuilder().setCustomId('name').setLabel("Option Name").setPlaceholder('e.g. Technical Support').setRequired(true).setStyle(TextInputStyle.Short);
                const input_2 = new TextInputBuilder().setCustomId('emoji').setLabel("Option Emoji (Optional)").setPlaceholder('e.g. 🛠️').setRequired(false).setStyle(TextInputStyle.Short);
                const modal = new ModalBuilder().setCustomId('menu_option_modal').setTitle('Add Ticket Menu Option').addComponents(new ActionRowBuilder().addComponents(input_1), new ActionRowBuilder().addComponents(input_2));
                await m.showModal(modal);

                const filter = (sub) => sub.customId === 'menu_option_modal' && sub.user.id === interaction.user.id;
                m.awaitModalSubmit({ filter, time: 60000 }).then(async (ms) => {
                  const name = ms.fields.getTextInputValue('name');
                  const emoji = ms.fields.getTextInputValue('emoji');
                  await db.push(`guild_${interaction.guild.id}.ticket.menu_option`, { label: name, value: name, emoji: emoji || null });
                  
                  const success = premiumEmbed(client, {
                    title: `✅  Option Added`,
                    description: `Successfully added **${name}** to the ticket menu.\n**Emoji:** ${emoji || 'None'}`,
                    color: client.colors?.success
                  });
                  ms.update({
                    embeds: [success],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                  }).catch(() => null);
                }).catch(() => null);
              }
              if (m.customId === "remove_admin_role") {
                if (await db.has(`guild_${interaction.guild.id}.ticket.admin_role`)) {
                  await db.delete(`guild_${interaction.guild.id}.ticket.admin_role`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🛡️  Admin Role Disabled`, description: `The **Admin Role** has been successfully removed from the configuration.`, color: client.colors?.error || '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                  }).catch(() => null);
                } else {
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🛡️  Admin Role Setting`, description: `Select a role below to set as the **Admin Role**. This role will have full access to all tickets.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder({ customId: 'admin_role', placeholder: 'Select Admin Role' })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
              }
              if (m.customId === "remove_parent_channel") {
                if (await db.has(`guild_${interaction.guild.id}.ticket.category`)) {
                  await db.delete(`guild_${interaction.guild.id}.ticket.category`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📂  Parent Channel Disabled`, description: `The **Parent Category** has been removed. New tickets will be created outside of any category.`, color: '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                  }).catch(() => null);
                } else {
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📂  Parent Category Setting`, description: `Select a Category below to host new tickets.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder({ customId: 'parent_channel', placeholder: 'Select Category', channelTypes: [ChannelType.GuildCategory] })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
              }
              if (m.customId === "remove_mod_log") {
                if (await db.has(`guild_${interaction.guild.id}.modlog`)) {
                  await db.delete(`guild_${interaction.guild.id}.modlog`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📜  Mod Log Disabled`, description: `Audit logging has been disabled for this guild.`, color: '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                  }).catch(() => null);
                } else {
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📜  Mod Log Setting`, description: `Select a text channel below to receive ticket logs and audit trails.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder({ customId: 'mod_log', placeholder: 'Select Log Channel', channelTypes: [ChannelType.GuildText] })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
              }
              if (m.customId === "remove_menu_option") {
                if (await db.has(`guild_${interaction.guild.id}.ticket.menu_option`)) {
                  await db.delete(`guild_${interaction.guild.id}.ticket.menu_option`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📋  Menu Options Reset`, description: `The ticket menu options have been cleared. Users will now see the default ticket creation button.`, color: '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                  }).catch(() => null);
                } else {
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📋  Menu Options Setting`, description: `Click the button below to add custom choices to your ticket select menu.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Add Menu Option').setEmoji(client.emotes.option).setCustomId(`menu_option`)),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
              }
              if (m.customId === "remove_transcript_channel") {
                await db.delete(`guild_${interaction.guild.id}.ticket.settings.transcript_channel`);
                m.update({
                  embeds: [premiumEmbed(client, { title: `📄  Transcript Channel Removed`, description: `Transcripts will now fall back to the mod log channel.`, color: '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                })
              }
              if (m.customId === 'btn_autoclose_on' || m.customId === 'btn_autoclose_off') {
                const enable = m.customId === 'btn_autoclose_on';
                await db.set(`guild_${interaction.guild.id}.ticket.settings.auto_close_hours`, enable ? 24 : 0);
                m.update({
                  embeds: [premiumEmbed(client, { title: `🕒  Auto-Close ${enable ? 'Enabled' : 'Disabled'}`, description: `Auto-close is now **${enable ? '✅ Enabled (24h default)' : '❌ Disabled'}**.`, color: enable ? '#10B981' : '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })], 
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))] 
                })
              }
              if (m.customId === 'btn_reminders_on' || m.customId === 'btn_reminders_off') {
                const enable = m.customId === 'btn_reminders_on';
                await db.set(`guild_${interaction.guild.id}.ticket.settings.reminder_minutes`, enable ? 30 : 0);
                m.update({
                  embeds: [premiumEmbed(client, { title: `🔔  Staff Reminders ${enable ? 'Enabled' : 'Disabled'}`, description: `Staff reminders are now **${enable ? '✅ Enabled (30min default)' : '❌ Disabled'}**.`, color: enable ? '#10B981' : '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })], 
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))] 
                })
              }
              if (m.customId === 'btn_ratings_on' || m.customId === 'btn_ratings_off') {
                const enable = m.customId === 'btn_ratings_on';
                await db.set(`guild_${interaction.guild.id}.ticket.settings.ratings_enabled`, enable);
                m.update({
                  embeds: [premiumEmbed(client, { title: `⭐  Rating DMs ${enable ? 'Enabled' : 'Disabled'}`, description: `Rating DMs are now **${enable ? '✅ Enabled' : '❌ Disabled'}**.`, color: enable ? '#10B981' : '#EF4444' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })], 
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))] 
                })
              }
            }

            if (m.isStringSelectMenu()) {
              if (m.customId === "setup_menu") {
                if (m.values[0] === "stlanguage") {
                  const curLang = (await db.get(`guild_${interaction.guild.id}.language`)) || "en";
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🌐  Bot Language Selection`, description: `**Current Language:** \`${curLang.toUpperCase()}\`\n\nChoose the default language for bot interactions. Note: Multi-language support auto-translates embeds & ticket menus dynamically.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag} `, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                          .setCustomId('set_language')
                          .setPlaceholder('Select a supported language')
                          .addOptions([
                            { label: "English (Default)", value: "en", emoji: "🇬🇧" },
                            { label: "Spanish", value: "es", emoji: "🇪🇸" },
                            { label: "French", value: "fr", emoji: "🇫🇷" },
                            { label: "German", value: "de", emoji: "🇩🇪" },
                            { label: "Portuguese", value: "pt", emoji: "🇧🇷" },
                            { label: "Hindi", value: "hi", emoji: "🇮🇳" },
                            { label: "Japanese", value: "ja", emoji: "🇯🇵" }
                          ])
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  })
                }
                if (m.values[0] === "stadmin") {
                  const cur = await db.get(`guild_${interaction.guild.id}.ticket.admin_role`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🛡️  Admin Role Setting`, description: `Select the role that will have full administrator control over tickets.\n\n**Current:** ${cur ? `<@&${cur}>` : '`Not Set`'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder({ customId: 'admin_role', placeholder: 'Select Admin Role' })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Admin Role').setEmoji(client.emotes.trash).setCustomId("remove_admin_role"), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
                if (m.values[0] === "stcategory") {
                  const cur = await db.get(`guild_${interaction.guild.id}.ticket.category`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📂  Parent Category Setting`, description: `Select the category where new tickets will be created.\n\n**Current:** ${cur ? `<#${cur}>` : '`Not Set`'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder({ customId: 'parent_channel', placeholder: 'Select Category', channelTypes: [ChannelType.GuildCategory] })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Parent Channel').setEmoji(client.emotes.trash).setCustomId("remove_parent_channel"), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
                if (m.values[0] === "stlog") {
                  const cur = await db.get(`guild_${interaction.guild.id}.modlog`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📜  Mod Log Setting`, description: `Select the channel where ticket actions and logs will be sent.\n\n**Current:** ${cur ? `<#${cur}>` : '`Not Set`'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder({ customId: 'mod_log', placeholder: 'Select Log Channel', channelTypes: [ChannelType.GuildText] })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Mod Log').setEmoji(client.emotes.trash).setCustomId("remove_mod_log"), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
                if (m.values[0] === "stoption") {
                  const cur = await db.get(`guild_${interaction.guild.id}.ticket.menu_option`);
                  m.update({
                    embeds: [premiumEmbed(client, { 
                      title: `📋  Menu Option Setting`, 
                      description: `Setup custom choices for your ticket creation menu.\n\n**Current Options:** ${cur?.length || 0}`, 
                      color: '#3B82F6' 
                    }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Add Menu Option').setEmoji(client.emotes.option).setCustomId(`menu_option`)),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Reset Menu Options').setEmoji(client.emotes.trash).setCustomId("remove_menu_option"), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  }).catch(() => null);
                }
                if (m.values[0] === "sttype") {
                  const curType = (await db.get(`guild_${interaction.guild.id}.ticket.type`)) || "ticket-username";
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🎫  Ticket Naming Format`, description: `**Current Format:** \`${curType}\`\n\nChoose how new ticket channels will be formatted.`, color: '#7C3AED' }).setFooter({ text: `Setting • Requested By ${m.user.tag} `, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('set_ticket_type').setPlaceholder('Select naming convention').setOptions([
                          { label: 'Standard', description: 'ticket-username', value: 'ticket-username', emoji: '🎫' },
                          { label: 'Category Prefix', description: 'support-username', value: 'category-username', emoji: '📂' },
                          { label: 'Anonymous ID', description: 'ticket-189421', value: 'ticket-id', emoji: '🪪' }
                        ])
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  })
                }
                if (m.values[0] === "stmaxtickets") {
                  const cur = (await db.get(`guild_${interaction.guild.id}.ticket.settings.max_tickets`)) || 1;
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🎟️  Max Open Tickets Setting`, description: `**Current limit:** \`${cur}\` ticket(s) per user.\n\nSelect a new limit below.`, color: '#7C3AED' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('set_max_tickets').setPlaceholder('Select max open tickets per user').setOptions([
                          { label: '1 ticket (default)', value: '1' },
                          { label: '2 tickets', value: '2' },
                          { label: '3 tickets', value: '3' },
                          { label: '5 tickets', value: '5' },
                          { label: 'Unlimited (0)', value: '0' }
                        ])
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  })
                }
                if (m.values[0] === "stcooldown") {
                  const cur = (await db.get(`guild_${interaction.guild.id}.ticket.settings.cooldown_seconds`)) ?? 300;
                  m.update({
                    embeds: [premiumEmbed(client, { title: `⏳  Ticket Cooldown Setting`, description: `**Current cooldown:** \`${cur}s\` between tickets per user.\n\nSelect a new cooldown below.`, color: '#7C3AED' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('set_cooldown').setPlaceholder('Select cooldown between tickets').setOptions([
                          { label: 'No cooldown (0s)', value: '0' },
                          { label: '1 minute (60s)', value: '60' },
                          { label: '5 minutes (300s) — default', value: '300' },
                          { label: '10 minutes (600s)', value: '600' },
                          { label: '1 hour (3600s)', value: '3600' }
                        ])
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  })
                }
                if (m.values[0] === "sttranscript") {
                  const curId = await db.get(`guild_${interaction.guild.id}.ticket.settings.transcript_channel`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `📄  Transcript Channel Setting`, description: `**Current:** ${curId ? `<#${curId}>` : '`Not set (uses mod log)`'}\n\nSelect a channel where transcripts will be sent on ticket close/delete.`, color: '#7C3AED' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder({ customId: 'transcript_channel', placeholder: 'Select transcript channel', channelTypes: [ChannelType.GuildText] })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Transcript Channel').setEmoji(client.emotes.trash).setCustomId('remove_transcript_channel'), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))
                    ]
                  })
                }
                if (m.values[0] === 'stmod') {
                  const cur = await db.get(`guild_${interaction.guild.id}.permissions.roles.moderator`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `⚒️  Mod Role Setting`, description: `**Current:** ${cur ? `<@&${cur}>` : '`Not set`'}\n\nSelect the role to assign as **Moderator (Level 2)**.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder({ customId: 'mod_role', placeholder: 'Select Mod Role' })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Mod Role').setEmoji(client.emotes.trash).setCustomId('remove_mod_role'), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))
                    ]
                  })
                }
                if (m.values[0] === 'ststaff') {
                  const cur = await db.get(`guild_${interaction.guild.id}.permissions.roles.staff`);
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🛡️  Staff Role Setting`, description: `**Current:** ${cur ? `<@&${cur}>` : '`Not set`'}\n\nSelect the role to assign as **Staff (Level 1)**.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                    components: [
                      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder({ customId: 'staff_role', placeholder: 'Select Staff Role' })),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Staff Role').setEmoji(client.emotes.trash).setCustomId('remove_staff_role'), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))
                    ]
                  })
                }
                if (m.values[0] === 'stAutoClose') {
                  const cur = (await db.get(`guild_${interaction.guild.id}.ticket.settings.auto_close_hours`)) ?? 24;
                  const enabled = cur !== 0;
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🕒  Auto-Close Settings`, description: `Automatically close inactive tickets after a certain interval.\n\n**Current Status:** ${enabled ? '✅ Enabled' : '❌ Disabled'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Enable').setCustomId('btn_autoclose_on').setDisabled(enabled),
                        new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Disable').setCustomId('btn_autoclose_off').setDisabled(!enabled)
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))
                    ]
                  })
                }
                if (m.values[0] === 'stReminders') {
                  const cur = (await db.get(`guild_${interaction.guild.id}.ticket.settings.reminder_minutes`)) ?? 30;
                  const enabled = cur !== 0;
                  m.update({
                    embeds: [premiumEmbed(client, { title: `🔔  Staff Reminders Settings`, description: `Remind staff when tickets are unhandled.\n\n**Current Status:** ${enabled ? '✅ Enabled' : '❌ Disabled'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Enable').setCustomId('btn_reminders_on').setDisabled(enabled),
                        new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Disable').setCustomId('btn_reminders_off').setDisabled(!enabled)
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))
                    ]
                  })
                }
                if (m.values[0] === 'stRatings') {
                  const cur = (await db.get(`guild_${interaction.guild.id}.ticket.settings.ratings_enabled`)) ?? true;
                  m.update({
                    embeds: [premiumEmbed(client, { title: `⭐  Rating DMs Settings`, description: `Send users a DM to rate the service when a ticket is closed.\n\n**Current Status:** ${cur ? '✅ Enabled' : '❌ Disabled'}`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                    components: [
                      new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('Enable').setCustomId('btn_ratings_on').setDisabled(cur),
                        new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Disable').setCustomId('btn_ratings_off').setDisabled(!cur)
                      ),
                      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))
                    ]
                  })
                }
              }
            }
            if (m.isChannelSelectMenu()) {
              if (m.customId === "parent_channel") {
                const channelId = m.values[0];
                const channel = m.guild.channels.cache.get(channelId);
                await db.set(`guild_${interaction.guild.id}.ticket.category`, channelId);
                m.update({
                  embeds: [premiumEmbed(client, { title: `✅  Category Set`, description: `New tickets will now be created in the **${channel.name}** category.`, color: client.colors?.success || '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                }).catch(() => null);
              }
              if (m.customId === "mod_log") {
                const channelId = m.values[0];
                const channel = m.guild.channels.cache.get(channelId);
                await db.set(`guild_${interaction.guild.id}.modlog`, channelId);
                m.update({
                  embeds: [premiumEmbed(client, { title: `✅  Mod Log Set`, description: `Logging channel set to ${channel}.`, color: client.colors?.success }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                }).catch(() => null);
              }
              if (m.customId === 'transcript_channel') {
                const chId = m.values[0];
                await db.set(`guild_${interaction.guild.id}.ticket.settings.transcript_channel`, chId);
                m.update({
                  embeds: [premiumEmbed(client, { title: `📄  Transcript Channel Set`, description: `Transcripts will now be sent to <#${chId}>.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) }).setThumbnail(m.guild.iconURL({ dynamic: true }))],
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel('Remove Transcript Channel').setEmoji(client.emotes.trash).setCustomId('remove_transcript_channel'), new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                })
              }
            }
            if (m.isStringSelectMenu() && m.customId === 'set_ticket_type') {
              const val = m.values[0];
              await db.set(`guild_${interaction.guild.id}.ticket.type`, val);
              m.update({
                embeds: [premiumEmbed(client, { title: `🎫  Naming Format Updated`, description: `Channel generation format set to \`${val}\`.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
              })
            }
            if (m.isStringSelectMenu() && m.customId === 'set_language') {
              const val = m.values[0];
              await db.set(`guild_${interaction.guild.id}.language`, val);
              m.update({
                embeds: [premiumEmbed(client, { title: `🌐  Language Updated`, description: `Bot language successfully changed to \`${val.toUpperCase()}\`.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
              })
            }
            if (m.isStringSelectMenu() && m.customId === 'set_max_tickets') {
              const val = parseInt(m.values[0]);
              await db.set(`guild_${interaction.guild.id}.ticket.settings.max_tickets`, val);
              m.update({
                embeds: [premiumEmbed(client, { title: `🎟️  Max Tickets Updated`, description: `Max open tickets per user set to \`${val === 0 ? 'Unlimited' : val}\`.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
              })
            }
            if (m.isStringSelectMenu() && m.customId === 'set_cooldown') {
              const val = parseInt(m.values[0]);
              await db.set(`guild_${interaction.guild.id}.ticket.settings.cooldown_seconds`, val);
              m.update({
                embeds: [premiumEmbed(client, { title: `⏳  Cooldown Updated`, description: `Ticket cooldown set to \`${val === 0 ? 'No cooldown' : val + 's'}\`.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
              })
            }
            if (m.isRoleSelectMenu()) {
              if (m.customId === "admin_role") {
                const roleId = m.values[0];
                const role = m.guild.roles.cache.get(roleId);
                await db.set(`guild_${interaction.guild.id}.ticket.admin_role`, roleId);
                await db.set(`guild_${interaction.guild.id}.permissions.roles.admin`, roleId);
                m.update({
                  embeds: [premiumEmbed(client, { title: `✅  Admin Role Set`, description: `The **${role.name}** role has been set as the Ticket Administrator.`, color: client.colors?.success || '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })],
                  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId("home_page"))]
                }).catch(() => null);
              }
              if (m.customId === 'mod_role') {
                const roleId = m.values[0];
                await db.set(`guild_${interaction.guild.id}.permissions.roles.moderator`, roleId);
                m.update({ embeds: [premiumEmbed(client, { title: `⚒️  Mod Role Set`, description: `<@&${roleId}> is now the **Moderator (Level 2)** role.`, color: '#3B82F6' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))] })
              }
              if (m.customId === 'staff_role') {
                const roleId = m.values[0];
                await db.set(`guild_${interaction.guild.id}.permissions.roles.staff`, roleId);
                m.update({ embeds: [premiumEmbed(client, { title: `🛡️  Staff Role Set`, description: `<@&${roleId}> is now the **Staff (Level 1)** role.`, color: '#10B981' }).setFooter({ text: `Setting • Requested By ${m.user.tag}`, iconURL: m.user.displayAvatarURL({ dynamic: true }) })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel('◀ Back to Settings').setEmoji(client.emotes.home).setCustomId('home_page'))] })
              }
            }
          });

          setTimeout(() => {
            interaction.editReply({
              components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('timeout').setEmoji(client.emotes.alert).setLabel('Session Expired').setStyle(ButtonStyle.Primary).setDisabled(true)).addComponents(new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel('Report').setEmoji(client.emotes.report).setCustomId(`report`), new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Support').setEmoji(client.emotes.help).setURL(`${client.config.discord.server_support}`))]
            }).catch(() => null);
          }, time);

      } catch (err) {
        console.error(err);
        errorMessage(client, interaction, err.message);
      }
    }
};
