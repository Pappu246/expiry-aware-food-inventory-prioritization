'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const output = path.join(root, 'public');
const sources = ['index.html', 'app.js', 'styles.css', 'config.js'];
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of sources) {
  const source = path.join(root, name);
  if (!fs.statSync(source).isFile()) throw new Error('Required FreshTrack asset missing: ' + name);
  fs.copyFileSync(source, path.join(output, name));
}
console.log('FreshTrack static build complete: ' + sources.length + ' assets copied to public/.');
