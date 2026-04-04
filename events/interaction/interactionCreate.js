const {
  ButtonBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder, 
  ButtonStyle,
  ChannelType,
  Collection,
  PermissionsBitField,
  ApplicationCommandOptionType,
} = require("discord.js");
const {
    errorMessage, premiumEmbed
} = require(`${process.cwd()}/functions/functions`);
const clc = require("cli-color");
module.exports = async (client, interaction) => {
 try {
    let db = client.db;
    if(!interaction.channel.permissionsFor(interaction.guild.members.me).has([PermissionsBitField.Flags.SendMessages])) return interaction.user.send({ content: `${client.emotes.error}| I am missing the Permission to \`SendMessages\` in ${interaction.channel}` });
    if(!interaction.channel.permissionsFor(interaction.guild.members.me).has([PermissionsBitField.Flags.EmbedLinks])) return interaction.reply({ content: `${client.emotes.error}| I am missing the Permission to \`EmbedLinks\` in ${interaction.channel}`, flags: 64 });

    // ── Phase 4c: Standalone button handlers ──────────────────────────────
    if (interaction.isButton()) {

      // Captcha verification button
      if (interaction.customId === 'verify_captcha') {
        const verifySvc = require(`${process.cwd()}/services/verificationService`);
        await verifySvc.markVerified(db, interaction.guild.id, interaction.user.id);
        return interaction.reply({
          embeds: [premiumEmbed(client, {
            title: '✅  Verified!',
            description: 'You have been verified and can now open support tickets.\n\nClick the ticket panel button to open a ticket.',
            color: '#10B981',
          }).setFooter({ text: 'Wave Network  •  Verification', iconURL: interaction.guild.iconURL({ dynamic: true }) })],
          flags: 64,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────

     if(interaction.isCommand()){
      const command = client.commands.get(interaction.commandName);
      if (command){
            const args = [];

            for (let option of interaction.options.data) {
                if (option.type === ApplicationCommandOptionType.Subcommand) {
                    if (option.name) args.push(option.name);
                    option.options?.forEach((x) => {
                        if (x.value) args.push(x.value);
                    })
                } else if (option.value) args.push(option.value);
            }
            if (command.toggleOff) {
                    return await interaction.reply({
                        embeds: [new EmbedBuilder().setTitle(`${client.emotes.badage}| **That Command Has Been Disabled By The Developers! Please Try Later.**`).setColor(client.colors.red)],
                        flags: 64
                    }).catch((e) => {
                        console.log(e)
                    });
            }  
            let bot_perms = [];
            command.botPermissions.forEach(perm=> bot_perms.push(PermissionsBitField.Flags[perm]))
            let user_perms = [];
            command.userPermissions.forEach(perm=> user_perms.push(PermissionsBitField.Flags[perm]))

            // BUG FIX #2: Was `.has([bot_perms] || [])` which wraps the array in another array,
            // so .has() always received a non-empty array (truthy) and always passed.
            // Fixed to `.has(bot_perms)` and `.has(user_perms)` — the flat array Discord.js expects.
            if (!interaction.guild.members.me.permissions.has(bot_perms)) return await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`${client.emotes.x}| **I don't have permission to respond </${client.application.commands.cache.find(c => c.name === command.name).name}:${client.application.commands.cache.find(c => c.name === command.name).id}> command!! \nPermissions need: [${command.botPermissions.map(p=>`\`${p}\``).join(" , ")}]**`).setColor(client.colors.orange)], flags: 64 }).catch((e) => { console.log(e) });
            if (!interaction.member.permissions.has(user_perms)) return await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`${client.emotes.error}| **You don't have  permission to use </${client.application.commands.cache.find(c => c.name === command.name).name}:${client.application.commands.cache.find(c => c.name === command.name).id}> command!! \nPermissions need: [${command.userPermissions.map(p=>`\`${p}\``).join(" , ")}]**`).setColor(client.colors.red)], flags: 64 }).catch((e) => { console.log(e) });
        
            //======== Slash Command Cooldown ========
            if (!client.cooldowns.has(command.name)) {
                 client.cooldowns.set(command.name, new Collection());
            }
            const now = Date.now();
            const timestamps = client.cooldowns.get(command.name);
            const cooldownAmount = (command.cooldown || 5) * 1000;
            if (timestamps.has(interaction.user.id)) {
              const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
              if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({
                  embeds: [new EmbedBuilder().setColor(client.colors.none).setDescription(`**${client.emotes.alert}| Please wait <t:${Math.floor((new Date().getTime() + Math.floor(timeLeft * 1000))/1000)}:R> before reusing the </${client.application.commands.cache.find(c => c.name === command.name).name}:${client.application.commands.cache.find(c => c.name === command.name).id}> command!**`)],
                  flags: 64
                })
              }
            }
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        
          //======== Slash Command Handler ========
          command.run(client, interaction, args);
       } else {
           return;
       }
     }
     if(interaction.isUserContextMenuCommand()){
        const command = client.Commands.get(interaction.commandName);
        if(command) command.run(client, interaction);
     }
 } catch(e) {
   // ── Structured error logging ─────────────────────────────────────────────
   const ts         = new Date().toISOString();
   const cmdName    = interaction.commandName || interaction.customId || 'unknown';
   const userId     = interaction.user?.id   || 'unknown';
   const guildId    = interaction.guild?.id  || 'DM';
   const errStr     = String(e?.message || e);

   console.error(`[${ts}] [InteractionError] cmd=${cmdName} user=${userId} guild=${guildId}`);
   console.error(e?.stack || e);

   // ── Non-fatal patterns: just log, no user message ───────────────────────
   const { isNonFatal } = require(`${process.cwd()}/utils/errorHandler`);
   const silentPatterns = [
     /Unknown interaction/i,
     /Interaction has already been acknowledged/i,
     /The reply to this interaction/i,
     /Cannot send messages to this user/i,
   ];
   if (silentPatterns.some(r => r.test(errStr))) return;

   // ── User-facing error message (clean, no stack trace) ──────────────────
   const friendly = isNonFatal(e)
     ? 'A temporary network issue occurred. Please try again in a moment.'
     : 'An unexpected error occurred while running this command. Our team has been notified.';

   errorMessage(client, interaction, friendly);
 }
}


