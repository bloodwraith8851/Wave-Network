/**
 * events/interaction/interactionCreate.js
 *
 * Lean routing layer — all heavy logic lives in CommandEngine middleware.
 *
 * Responsibilities here:
 *  1. Null-guard: ensure guild context is present for guild-only checks
 *  2. Bot permission fast-fail (SendMessages / EmbedLinks)
 *  3. Standalone button handler for verify_captcha (not a slash command)
 *  4. Route slash commands → CommandEngine.execute()
 *  5. Route user context menus
 */

const { PermissionsBitField } = require('discord.js');
const { errorMessage }        = require(`${process.cwd()}/functions/functions`);

module.exports = async (client, interaction) => {
  try {

    // ── 1. Bot permission fast-fail (guild context only) ─────────────────────
    if (interaction.guild) {
      const me        = interaction.guild.members.me;
      const channel   = interaction.channel;

      // Guard: members.me may be null in rare reconnect windows
      if (me && channel?.permissionsFor) {
        if (!channel.permissionsFor(me).has(PermissionsBitField.Flags.SendMessages)) {
          return interaction.user.send({
            content: `⛔  I'm missing **SendMessages** permission in ${channel}. Please fix my permissions.`
          }).catch(() => null);
        }
        if (!channel.permissionsFor(me).has(PermissionsBitField.Flags.EmbedLinks)) {
          return interaction.reply({
            content: `⛔  I'm missing **EmbedLinks** permission in ${channel}. Please fix my permissions.`,
            flags: 64
          }).catch(() => null);
        }
      }
    }

    // ── 2. Standalone button: verify_captcha ─────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'verify_captcha') {
      if (!interaction.guild) {
        return errorMessage(client, interaction, 'Verification must be completed within a server.');
      }
      try {
        const verifySvc = require(`${process.cwd()}/services/verificationService`);
        await verifySvc.markVerified(client.db, interaction.guild.id, interaction.user.id);
      } catch { /* service not configured */ }

      return interaction.reply({
        embeds: [(client.ui || require(`${process.cwd()}/core/UIEngine`).get())
          .success('You have been verified! You can now open support tickets.')],
        flags: 64,
      }).catch(() => null);
    }

    // ── 3. Slash commands → CommandEngine ────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      return client.commandEngine.execute(interaction);
    }

    // ── 4. User context menus ─────────────────────────────────────────────────
    if (interaction.isUserContextMenuCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) command.run(client, interaction);
    }

  } catch (e) {
    // ── Structured error log ── (non-fatal patterns silently dropped)
    const { isNonFatal } = require(`${process.cwd()}/utils/errorHandler`);
    if (isNonFatal(e)) return;

    const cmdName = interaction.commandName || interaction.customId || 'unknown';
    const userId  = interaction.user?.id   || 'unknown';
    const guildId = interaction.guild?.id  || 'DM';
    require(`${process.cwd()}/utils/logger`).error(
      'InteractionCreate',
      `cmd=${cmdName} user=${userId} guild=${guildId}: ${e.message}`
    );

    errorMessage(client, interaction, 'An unexpected error occurred. Please try again.');
  }
};
