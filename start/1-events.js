/**
 * 1-events.js — Loads all event listeners from /events/**
 * Uses the premium Logger for all output.
 */
const fs     = require('fs');
const Logger = require(`${process.cwd()}/utils/logger`);

module.exports = async (bot) => {
  try {
    Logger.banner();
    Logger.divider('Loading Events');

    let counter    = 0;
    const failed   = [];

    fs.readdirSync(`${process.cwd()}/events`).forEach(dir => {
      const files = fs.readdirSync(`${process.cwd()}/events/${dir}`)
        .filter(f => f.endsWith('.js'));

      for (const file of files) {
        try {
          const event = require(`${process.cwd()}/events/${dir}/${file}`);
          const name  = file.split('.')[0];
          bot.on(name, event.bind(null, bot));
          Logger.event(name, `Registered  ${dir}/${file}`);
          counter++;
        } catch (e) {
          failed.push(`${dir}/${file}`);
          Logger.error('EventLoader', `Failed to load ${dir}/${file}`, e);
        }
      }
    });

    Logger.divider();
    Logger.loadedBox('Events', counter);

    if (failed.length) {
      Logger.warn('EventLoader', `${failed.length} event(s) failed to load:`);
      failed.forEach(f => Logger.warn('EventLoader', `  ✗ ${f}`));
    }

    Logger.divider('Login');
    Logger.boot('Connecting to Discord Gateway…');

  } catch (e) {
    Logger.fatal('EventLoader', 'Critical failure loading events', e);
  }
};
