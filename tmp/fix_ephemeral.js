const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.js')) results.push(file);
        }
    });
    return results;
}

const files = walk('d:\\Wave-Network-main\\commands');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('ephemeral: true')) {
        console.log(`Updating ${file}`);
        content = content.replace(/ephemeral: true/g, 'flags: 64');
        fs.writeFileSync(file, content, 'utf8');
    }
});
