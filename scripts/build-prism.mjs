#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, '..', 'node_modules', 'prismjs', 'components');
const outFile = join(here, '..', 'node_modules', 'prismjs', 'prism.js');

const explicit = [
  'prism-core',
  'prism-markup',
  'prism-clike',
  'prism-c',
  'prism-javascript',
  'prism-css',
  'prism-ruby',
  'prism-cpp',
];

const all = new Set(explicit);
for (const file of readdirSync(componentsDir)) {
  if (
    file.startsWith('prism-') &&
    file.endsWith('.js') &&
    !file.endsWith('.min.js') &&
    file !== 'prism-autoloader.js' &&
    file !== 'prism-keep-markup.js'
  ) {
    all.add(file.replace(/\.js$/, ''));
  }
}

const ordered = [...explicit, ...[...all].filter((n) => !explicit.includes(n))];
const concatenated = ordered
  .map((name) => readFileSync(join(componentsDir, `${name}.js`), 'utf8'))
  .join('\n');

writeFileSync(outFile, concatenated);
console.log(`Wrote ${outFile} (${ordered.length} components)`);
