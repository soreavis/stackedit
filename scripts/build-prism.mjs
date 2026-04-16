#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prismRoot = join(here, '..', 'node_modules', 'prismjs');
const componentsDir = join(prismRoot, 'components');
const outFile = join(prismRoot, 'prism.js');
const meta = JSON.parse(readFileSync(join(prismRoot, 'components.json'), 'utf8'));

const skipPlugins = new Set(['autoloader', 'keep-markup', 'jsonp']);
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const langs = meta.languages;
const wanted = new Set();
for (const name of Object.keys(langs)) {
  if (name === 'meta' || skipPlugins.has(name)) continue;
  if (existsSync(join(componentsDir, `prism-${name}.js`))) wanted.add(name);
}

const visited = new Set();
const order = [];
const visit = (name) => {
  if (visited.has(name) || !wanted.has(name)) return;
  visited.add(name);
  const def = langs[name] || {};
  for (const dep of [...toArr(def.require), ...toArr(def.modify)]) visit(dep);
  order.push(name);
};

['markup', 'clike', 'c', 'javascript', 'css', 'ruby', 'cpp'].forEach(visit);
[...wanted].sort().forEach(visit);

const concatenated = [
  readFileSync(join(componentsDir, 'prism-core.js'), 'utf8'),
  ...order.map((name) => readFileSync(join(componentsDir, `prism-${name}.js`), 'utf8')),
].join('\n');

writeFileSync(outFile, concatenated);
console.log(`Wrote ${outFile} (prism-core + ${order.length} languages)`);
