const { 
    ApplicationCommandType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    StringSelectMenuBuilder
} = require('discord.js');
const { 
    premiumEmbed, 
    errorMessage, 
    successMessage,
    loadingState 
} = require(`${process.cwd()}/functions/functions`);
const permissionService = require(`${process.cwd()}/services/permissionService`);

module.exports = {
    name: 'setup',
    category: 'Setup 💻',
    type: ApplicationCommandType.ChatInput,
    description: "Launch the Premium Setup Wizard to configure Wave Network.",
    userPermissions: ["ManageGuild"],
    botPermissions: ["ManageChannels", "EmbedLinks"],
    run: async (client, interaction) => {
        const db = client.db;
        const guild = interaction.guild;

        if (await permissionService.requirePermission(db, guild, interaction.member, 'settings.set', client.config, interaction, errorMessage)) return;

        const renderMain = async (m = interaction) => {
            const embed = premiumEmbed(client, {
                title: '⚡ Wave Network • Premium Setup Wizard',
                description: [
                    'Welcome to the ultimate setup experience. Use the controls below to configure your ticket system in seconds.',
                    '',
                    '**1. 🛡️ Role System** (Admin, Mod, Staff)',
                    '**2. 📍 Channel System** (Logs, Category, Transcripts)',
                    '**3. ⚙️ Automation** (Auto-Assign, SLA, Verification)',
                    '**4. 🎨 Branding** (Colors, Footers, Emotes)'
                ].join('\n'),
                color: client.colors?.primary
            }).setThumbnail(guild.iconURL({ dynamic: true }));

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup_roles').setLabel('Roles').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('setup_channels').setLabel('Channels').setEmoji('📍').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('setup_auto').setLabel('Automation').setEmoji('⚙️').setStyle(ButtonStyle.Primary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('setup_branding').setLabel('Branding').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('setup_overview').setLabel('Overview').setEmoji('📊').setStyle(ButtonStyle.Success)
            );

            const payload = { embeds: [embed], components: [row1, row2], flags: 64 };
            if (m.replied || m.deferred) return await m.editReply(payload);
            return await m.reply(payload);
        };

        const msg = await renderMain();
        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) return errorMessage(client, i, 'This setup session is not for you.');

            if (i.customId === 'setup_roles') {
                const embed = premiumEmbed(client, {
                    title: '🛡️ Role Configuration',
                    description: 'Select the roles that will have access to manage tickets and staff commands.',
                    color: client.colors?.info
                });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_admin_role').setLabel('Set Admin').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('set_mod_role').setLabel('Set Moderator').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('set_staff_role').setLabel('Set Staff').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('back_main').setLabel('Back').setStyle(ButtonStyle.Danger)
                );
                await i.update({ embeds: [embed], components: [row] });
            }

            if (i.customId === 'back_main') {
                await renderMain(i);
                return;
            }

            // Role Sub-selection
            if (i.customId.startsWith('set_') && i.customId.endsWith('_role')) {
                const level = i.customId.split('_')[1]; // admin, mod, staff
                const menu = new RoleSelectMenuBuilder().setCustomId(`confirm_role_${level}`).setPlaceholder(`Select the ${level} role...`);
                await i.update({ components: [new ActionRowBuilder().addComponents(menu)] });
            }

            if (i.customId.startsWith('confirm_role_')) {
                const level = i.customId.split('_')[2];
                const roleId = i.values[0];
                await db.set(`guild_${guild.id}.permissions.roles.${level}`, roleId);
                if (level === 'admin') await db.set(`guild_${guild.id}.ticket.admin_role`, roleId); // Backwards compatibility
                await i.update({ embeds: [premiumEmbed(client, { title: '✅ Role Set', description: `The **${level}** role has been successfully updated.`, color: client.colors?.success })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_main').setLabel('Return Home').setStyle(ButtonStyle.Success))] });
            }

            // ... more handlers for other categories ...
            if (i.customId === 'setup_overview') {
                const admin = await db.get(`guild_${guild.id}.permissions.roles.admin`);
                const mod = await db.get(`guild_${guild.id}.permissions.roles.moderator`);
                const staff = await db.get(`guild_${guild.id}.permissions.roles.staff`);
                const log = await db.get(`guild_${guild.id}.modlog`);

                const embed = premiumEmbed(client, {
                    title: '📊 Configuration Overview',
                    fields: [
                        { name: '🛡️ Roles', value: `Admin: ${admin ? `<@&${admin}>` : '❌'}\nMod: ${mod ? `<@&${mod}>` : '❌'}\nStaff: ${staff ? `<@&${staff}>` : '❌'}`, inline: true },
                        { name: '📍 Channels', value: `Logs: ${log ? `<#${log}>` : '❌'}\nCategory: ${await db.get(`guild_${guild.id}.ticket.category`) ? `<#${await db.get(`guild_${guild.id}.ticket.category`)}>` : '❌'}`, inline: true }
                    ],
                    color: client.colors?.primary
                });
                await i.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_main').setLabel('Back').setStyle(ButtonStyle.Danger))] });
            }
        });
    }
};
