const fs = require('fs');
const path = require('path');
const dirs = ['core', 'events', 'commands', 'services', 'start', 'handlers'];
let errorCount = 0;

function check(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      check(full);
    } else if (f.endsWith('.js')) {
      try {
        require('./' + full.replace(/\\/g, '/'));
      } catch (e) {
        // We only care about MODULE_NOT_FOUND to check requiring linkages
        if (e.code === 'MODULE_NOT_FOUND' && e.message.includes('require')) {
           console.log(`[Link Error] in ${full}: ${e.message}`);
           errorCount++;
        }
      }
    }
  }
}

dirs.forEach(check);
if (errorCount === 0) console.log('Wiring Check Passed: All dependencies resolved successfully.');
else process.exit(1);
