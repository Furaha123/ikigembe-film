#!/usr/bin/env node
/**
 * Translation checks (npm run i18n:check).
 *
 *  1. Keys in en.json but not rw.json (or the reverse)        → error
 *  2. Static keys used in templates/code but missing in en.json → error
 *     ('key' | translate, translate.instant('key'), translate.get('key'), titleKey: 'key', …Key: 'key')
 *  3. rw.json values still identical to English               → reported per section (pending translation)
 *
 * Keys built at runtime ('a.' + status) can't be checked statically; keep their families complete by hand.
 * Exit code 1 when (1) or (2) finds anything. `--list` prints every untranslated key.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const en = JSON.parse(readFileSync(join(root, 'src/assets/i18n/en.json'), 'utf8'));
const rw = JSON.parse(readFileSync(join(root, 'src/assets/i18n/rw.json'), 'utf8'));
const listAll = process.argv.includes('--list');

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, String(v));
  }
  return out;
}

const enKeys = flatten(en);
const rwKeys = flatten(rw);
const missingInRw = [...enKeys.keys()].filter(k => !rwKeys.has(k));
const missingInEn = [...rwKeys.keys()].filter(k => !enKeys.has(k));

// Sections whose keys are prefixes (e.g. 'admin.finance.status.' + p.status) count as dynamic families.
const isPrefixOfSomeKey = (k) => [...enKeys.keys()].some(x => x.startsWith(k + '.'));

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts')) files.push(p);
  }
  return files;
}

const patterns = [
  /'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'\s*\|\s*translate/g,
  /"([a-zA-Z][\w-]*(?:\.[\w-]+)+)"\s*\|\s*translate/g,
  /\b(?:instant|get|stream)\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g,
  /\b\w*Key\s*:\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g,
  /\(\s*\w+\(\)\s*\?\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'\s*:\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'\s*\)\s*\|\s*translate/g,
];

const unknownUses = [];
for (const file of walk(join(root, 'src/app'))) {
  const text = readFileSync(file, 'utf8');
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      for (const key of m.slice(1).filter(Boolean)) {
        if (key.endsWith('.')) continue;                         // a dynamic family prefix
        if (!enKeys.has(key) && !isPrefixOfSomeKey(key)) {
          unknownUses.push(`${relative(root, file)}: ${key}`);
        }
      }
    }
  }
}

// Untranslated: same text as English, ignoring values without letters or that are only placeholders/brand.
const untranslated = [...enKeys].filter(([k, v]) => {
  const r = rwKeys.get(k);
  if (r === undefined || r !== v) return false;
  const stripped = v.replace(/\{\{[^}]+\}\}/g, '').replace(/Ikigembe|RWF|Frw|MoMo|PDF|CSV|HLS|DPO|PawaPay|MTN|Airtel|OK|ID/g, '');
  return /[A-Za-z]{3,}/.test(stripped);
}).map(([k]) => k);

const bySection = new Map();
for (const k of untranslated) {
  const section = k.split('.').slice(0, 2).join('.');
  bySection.set(section, (bySection.get(section) ?? 0) + 1);
}

let failed = false;
const report = (title, items) => {
  if (!items.length) return;
  failed = true;
  console.error(`\n✖ ${title} (${items.length})`);
  for (const i of items.slice(0, 200)) console.error(`  ${i}`);
};
report('Keys in en.json missing from rw.json', missingInRw);
report('Keys in rw.json missing from en.json', missingInEn);
report('Keys used in code but missing from en.json', [...new Set(unknownUses)]);

const total = enKeys.size;
const pct = ((1 - untranslated.length / total) * 100).toFixed(1);
console.log(`\nKeys: ${total}. Kinyarwanda differs from English for ${total - untranslated.length} (${pct} %).`);
console.log(`Pending Kinyarwanda translation: ${untranslated.length} keys`);
for (const [section, n] of [...bySection].sort((a, b) => b[1] - a[1]).slice(0, listAll ? 1000 : 25)) {
  console.log(`  ${section.padEnd(40)} ${n}`);
}
if (listAll) for (const k of untranslated) console.log(`    ${k}`);
if (!failed) console.log('\n✔ en/rw key sets match and every static key used in code exists.');
process.exit(failed ? 1 : 0);
