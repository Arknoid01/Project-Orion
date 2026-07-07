const fs = require('fs');
const path = require('path');

function extractLangKeys(src, lang) {
  const start = src.indexOf(lang + ': {');
  if (start < 0) return [];
  const nextLang = lang === 'fr'
    ? src.indexOf('en: {', start + 1)
    : src.indexOf('\n};', start + 1);
  const block = src.slice(start, nextLang);
  return [...block.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
}

function reportPair(name, src) {
  const frKeys = extractLangKeys(src, 'fr');
  const enKeys = extractLangKeys(src, 'en');
  const frSet = new Set(frKeys);
  const enSet = new Set(enKeys);
  const onlyFr = frKeys.filter(k => !enSet.has(k));
  const onlyEn = enKeys.filter(k => !frSet.has(k));
  console.log(`\n=== ${name} ===`);
  console.log(`FR: ${frKeys.length}  EN: ${enKeys.length}`);
  if (onlyFr.length) {
    console.log(`Missing in EN (${onlyFr.length}):`);
    onlyFr.forEach(k => console.log(`  - ${k}`));
  }
  if (onlyEn.length) {
    console.log(`Missing in FR (${onlyEn.length}):`);
    onlyEn.forEach(k => console.log(`  + ${k}`));
  }
  if (!onlyFr.length && !onlyEn.length) console.log('OK: FR/EN key sets match');
  return { frSet, enSet };
}

const i18nSrc = fs.readFileSync('js/i18n.js', 'utf8');
const main = reportPair('js/i18n.js', i18nSrc);

if (fs.existsSync('js/storyI18n.js')) {
  reportPair('js/storyI18n.js', fs.readFileSync('js/storyI18n.js', 'utf8'));
}

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      walk(p, files);
    } else if (ent.name.endsWith('.js') && ent.name !== 'i18n.js' && !ent.name.includes('pixi')) {
      files.push(p);
    }
  }
  return files;
}

const used = new Set();
const keyRe = /\bt\(\s*['"]([^'"]+)['"]/g;
for (const file of walk('js')) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = keyRe.exec(src))) used.add(m[1]);
}

const allKeys = new Set([...main.frSet, ...main.enSet]);
const missingBoth = [...used].filter(k => !allKeys.has(k)).sort();
console.log('\n=== t() keys used but absent from js/i18n.js ===');
console.log(`Count: ${missingBoth.length}`);
missingBoth.forEach(k => console.log(`  ? ${k}`));
