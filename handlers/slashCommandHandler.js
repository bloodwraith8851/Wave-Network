/**
 * slashCommandHandler.js — Loads & registers all slash commands.
 * Uses the premium Logger for all output.
 */
const { readdirSync } = require('fs');
const Logger          = require(`${process.cwd()}/utils/logger`);

module.exports = async (bot) => {
  try {
    Logger.divider('Loading Commands');

    let amount               = 0;
    const slashCommandsArray = [];
    const seenNames          = new Set();
    const failed             = [];
    const skipped            = [];

    readdirSync(`${process.cwd()}/commands/`).forEach(dir => {
      const files = readdirSync(`${process.cwd()}/commands/${dir}/`)
        .filter(f => f.endsWith('.js'));

      for (const file of files) {
        try {
          const pull = require(`${process.cwd()}/commands/${dir}/${file}`);

          if (!pull.name) {
            // No name exported — intentionally skipped (e.g. blacklist.js stub)
            Logger.debug('CmdLoader', `No name exported: ${dir}/${file} — skipped`);
            continue;
          }

          // Overwrite Map so last-loaded wins
          bot.commands.set(pull.name, pull);
          if (['MESSAGE', 'USER'].includes(pull.type)) delete pull.description;

          if (seenNames.has(pull.name)) {
            Logger.warn('CmdLoader', `Duplicate name "${pull.name}" — ${file} will NOT be registered with Discord`);
            skipped.push(pull.name);
          } else {
            seenNames.add(pull.name);
            slashCommandsArray.push(pull);
            Logger.cmd(pull.name, `Loaded  ${dir}/${file}`);
          }
          amount++;
        } catch (e) {
          failed.push(`${dir}/${file}`);
          Logger.error('CmdLoader', `Failed to load ${dir}/${file}`, e);
        }
      }
    });

    Logger.divider();
    Logger.loadedBox('Commands', slashCommandsArray.length);

    if (skipped.length)  Logger.warn('CmdLoader', `${skipped.length} duplicate(s) skipped: ${skipped.join(', ')}`);
    if (failed.length)   Logger.error('CmdLoader', `${failed.length} command(s) failed to load: ${failed.join(', ')}`);

    // Register with Discord once bot is ready
    bot.on('ready', async () => {
      try {
        Logger.info('CmdLoader', 'Registering commands with Discord API…');
        await bot.application.commands.set(slashCommandsArray);
        Logger.ok('CmdLoader', `${slashCommandsArray.length} slash commands registered globally ✅`);
      } catch (e) {
        Logger.error('CmdLoader', 'Failed to register commands with Discord API', e);
      }
    });

  } catch (e) {
    Logger.fatal('CmdLoader', 'Critical failure in command loader', e);
  }
};
