/**
 * logger.js — Wave Network Premium Logger
 *
 * A unified, beautiful, structured logger for every part of the bot.
 *
 * Features:
 *  • Full timestamp on every line
 *  • Colour-coded levels: BOOT · INFO · OK · WARN · ERROR · FATAL · DEBUG · SHARD
 *  • Shard-ID prefix auto-injected when running under ShardingManager
 *  • Full stack traces on ERROR / FATAL — nothing is hidden
 *  • ASCII art startup banner
 *  • Stat table helpers for ready / loaded summaries
 *  • Drop-in replacements: Logger replaces console.log/warn/error globally (optional)
 */

'use strict';
const clc = require('cli-color');

// ── Detect shard context ──────────────────────────────────────────────────────
const SHARD_TAG = process.env.SHARDING_ENABLED === 'true'
  ? clc.magenta(`[Shard#${process.env.SHARDS ?? '?'}]`)
  : '';

// ── Padding helper ────────────────────────────────────────────────────────────
function padEnd(str, len) {
  // Strip ANSI escape codes for real length calculation
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - clean.length));
}

// ── Timestamp ─────────────────────────────────────────────────────────────────
function ts() {
  return clc.blackBright(new Date().toISOString());
}

// ── Level badges ─────────────────────────────────────────────────────────────
const BADGES = {
  boot:  clc.bgMagenta.white(' BOOT  '),
  info:  clc.bgCyan.black(   ' INFO  '),
  ok:    clc.bgGreen.black(  '  OK   '),
  warn:  clc.bgYellow.black( ' WARN  '),
  error: clc.bgRed.white(    ' ERROR '),
  fatal: clc.bgRed.white(    ' FATAL '),
  debug: clc.bgBlack.white(  ' DEBUG '),
  shard: clc.bgMagenta.white(' SHARD '),
  cmd:   clc.bgBlue.white(   '  CMD  '),
  event: clc.bgCyan.black(   ' EVENT '),
  db:    clc.bgYellow.black( '  DB   '),
};

// ── Core print ────────────────────────────────────────────────────────────────
function print(level, tag, msg, err) {
  const badge  = BADGES[level] ?? BADGES.info;
  const tagStr = tag ? clc.cyan(`[${tag}]`) : '';
  const line   = `${ts()} ${badge} ${SHARD_TAG}${SHARD_TAG ? ' ' : ''}${tagStr}${tagStr ? ' ' : ''}${msg}`;
  const out    = (level === 'error' || level === 'fatal' || level === 'warn')
    ? console.error
    : console.log;

  out(line);

  // Full error detail — always show everything
  if (err) {
    if (err.message) console.error(clc.red(`  ↳ Message : ${err.message}`));
    if (err.code)    console.error(clc.red(`  ↳ Code    : ${err.code}`));
    if (err.stack) {
      const frames = err.stack.split('\n').slice(1).map(f => `     ${f.trim()}`);
      console.error(clc.yellow(`  ↳ Stack:`));
      frames.forEach(f => console.error(clc.blackBright(f)));
    }
    if (err.cause)   console.error(clc.red(`  ↳ Cause   : ${err.cause}`));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
const Logger = {
  boot:  (msg, err)        => print('boot',  null,  msg, err),
  info:  (tag, msg, err)   => print('info',  tag,   msg, err),
  ok:    (tag, msg)        => print('ok',    tag,   msg),
  warn:  (tag, msg, err)   => print('warn',  tag,   msg, err),
  error: (tag, msg, err)   => print('error', tag,   msg, err),
  fatal: (tag, msg, err)   => print('fatal', tag,   msg, err),
  debug: (tag, msg)        => { if (process.env.DEBUG === 'true') print('debug', tag, msg); },
  shard: (id,  msg, err)   => print('shard', `Shard#${id}`, msg, err),
  cmd:   (name, msg)       => print('cmd',   name,  msg),
  event: (name, msg)       => print('event', name,  msg),
  db:    (msg, err)        => print('db',    'DB',  msg, err),

  // ── Divider rule ────────────────────────────────────────────────────────
  divider: (label = '') => {
    const line = label
      ? clc.blackBright(`─── ${label} `) + clc.blackBright('─'.repeat(Math.max(0, 60 - label.length - 4)))
      : clc.blackBright('─'.repeat(64));
    console.log(line);
  },

  // ── Stat row (key: value) ──────────────────────────────────────────────
  stat: (key, value, color = clc.cyan) => {
    console.log(`   ${clc.blackBright('│')} ${padEnd(clc.white(key), 26)} ${color(String(value))}`);
  },

  // ── Startup banner ─────────────────────────────────────────────────────
  banner: () => {
    const lines = [
      '',
      clc.magentaBright('  ╔══════════════════════════════════════════════════════════════════╗'),
      clc.magentaBright('  ║') + clc.bold.white('                                                                  ') + clc.magentaBright('║'),
      clc.magentaBright('  ║') +
        '       ' + clc.bold.whiteBright('🌊  W A V E  N E T W O R K') +
        '                          ' +
        clc.magentaBright('║'),
      clc.magentaBright('  ║') + clc.blackBright('          Premium Discord Ticket System  ·  v' + require(`${process.cwd()}/package.json`).version.padEnd(20)) + clc.magentaBright('║'),
      clc.magentaBright('  ║') + clc.bold.white('                                                                  ') + clc.magentaBright('║'),
      clc.magentaBright('  ╚══════════════════════════════════════════════════════════════════╝'),
      '',
    ];
    lines.forEach(l => console.log(l));
  },

  // ── Loaded summary box ─────────────────────────────────────────────────
  loadedBox: (label, count, color = clc.cyanBright) => {
    const W   = 64;
    const msg = `  ${label}  ${color(String(count))}  loaded`;
    const pad = ' '.repeat(Math.max(0, W - msg.replace(/\x1b\[[0-9;]*m/g, '').length - 4));
    console.log(clc.blackBright('  ┌' + '─'.repeat(W) + '┐'));
    console.log(clc.blackBright('  │') + '  ' + msg + pad + clc.blackBright('  │'));
    console.log(clc.blackBright('  └' + '─'.repeat(W) + '┘'));
  },

  // ── Ready stats panel ──────────────────────────────────────────────────
  readyPanel: (data) => {
    // data = { tag, guilds, users, commands, ping, version, djsVersion, node, platform, memory, shardId, totalShards }
    console.log('');
    console.log(clc.greenBright('  ╔══════════════════════════════════════════════════════════════════╗'));
    console.log(clc.greenBright('  ║') + clc.bold.greenBright('           ✅  BOT ONLINE AND READY            ') + clc.black('                 ') + clc.greenBright('║'));
    console.log(clc.greenBright('  ╠══════════════════════════════════════════════════════════════════╣'));

    const row = (k, v, vc = clc.whiteBright) => {
      const key  = clc.blackBright(('  ║  ' + k).padEnd(30));
      const val  = vc(String(v));
      const clean = ('  ║  ' + k).padEnd(30).length + String(v).length;
      const pad  = ' '.repeat(Math.max(0, 69 - clean));
      console.log(key + val + pad + clc.greenBright('║'));
    };

    row('🤖  Bot',         data.tag,          clc.cyanBright);
    row('🏠  Guilds',       data.guilds,        clc.yellowBright);
    row('👥  Users',        data.users,         clc.yellowBright);
    row('⚡  Commands',     data.commands,      clc.magentaBright);
    row('📡  WS Ping',      `${data.ping}ms`,   data.ping < 150 ? clc.greenBright : clc.red);
    row('🧩  Shard',        `#${data.shardId} / ${data.totalShards}`, clc.magentaBright);
    row('📦  Version',      `v${data.version}`, clc.whiteBright);
    row('📚  Discord.js',   `v${data.djsVersion}`, clc.whiteBright);
    row('🟢  Node.js',      data.node,          clc.greenBright);
    row('💾  Memory',       `${data.memory} MB`, data.memory > 400 ? clc.red : clc.whiteBright);
    row('🖥️  Platform',     data.platform,      clc.whiteBright);

    console.log(clc.greenBright('  ╚══════════════════════════════════════════════════════════════════╝'));
    console.log('');
  },

  // ── Shard manager panel ────────────────────────────────────────────────
  shardPanel: (shards, totalGuilds) => {
    console.log('');
    console.log(clc.magentaBright('  ╔══════════════════════════════════════════════════════════════════╗'));
    console.log(clc.magentaBright('  ║') + clc.bold.white('          🌊  SHARD METRICS                                       ') + clc.magentaBright('║'));
    console.log(clc.magentaBright('  ╠══════════════════════════════════════════════════════════════════╣'));
    for (const s of shards) {
      const pingColor = s.ping < 150 ? clc.greenBright : s.ping < 300 ? clc.yellow : clc.red;
      const stateColor = s.state === 'ready' ? clc.greenBright : clc.yellow;
      const row = `  #${String(s.shardId).padEnd(3)} state:${stateColor(String(s.state).padEnd(12))} ping:${pingColor(`${s.ping}ms`.padEnd(8))} guilds:${clc.cyan(String(s.guilds).padEnd(6))} mem:${clc.yellow(`${s.mem}MB`)}`;
      const clean = row.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = ' '.repeat(Math.max(0, 66 - clean.length));
      console.log(clc.magentaBright('  ║') + row + pad + clc.magentaBright('║'));
    }
    console.log(clc.magentaBright('  ╠══════════════════════════════════════════════════════════════════╣'));
    const total = `  Total Guilds: ${totalGuilds}   Shards: ${shards.length}`;
    console.log(clc.magentaBright('  ║') + clc.whiteBright(total) + ' '.repeat(Math.max(0, 66 - total.length)) + clc.magentaBright('║'));
    console.log(clc.magentaBright('  ╚══════════════════════════════════════════════════════════════════╝'));
    console.log('');
  },
};

module.exports = Logger;
