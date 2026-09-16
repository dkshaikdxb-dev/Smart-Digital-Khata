// Who actually SEES each web string, and in which languages does it come out in
// English? The raw DICT count mixes three audiences: the shopkeeper's owner
// console, the shopper's consumer PWA, and the platform admin's desk — and the
// admin desk is English-first on purpose, so counting it as translation debt
// would overstate the problem badly.
//
// Attribution is by reachability, not by one file: a key is attributed to every
// audience whose pages can reach the component that names it, following imports
// from each page entry point.
import fs from 'fs';
import path from 'path';
import { getAllKeys, staticValue } from '../admin-dashboard/src/lib/i18n.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = path.join(REPO, 'admin-dashboard', 'src');
const PAGES = path.join(ROOT, 'pages');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Resolve a relative import to a real file under src.
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

const srcCache = new Map();
const read = (f) => {
  if (!srcCache.has(f)) srcCache.set(f, fs.readFileSync(f, 'utf8'));
  return srcCache.get(f);
};

// Every module reachable from an entry point.
function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = read(f);
    for (const m of src.matchAll(/(?:import[^'"]*from\s*|require\(\s*)['"]([^'"]+)['"]/g)) {
      // The dictionary itself is excluded: it NAMES every key, so following it
      // would attribute all 1871 keys to every page and answer nothing.
      if (/\/i18n(Supply)?(\.js)?$/.test(m[1])) continue;
      const r = resolveImport(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return seen;
}

// t('key') / translate(lang,'key') / any string literal that looks like a key.
function keysIn(src, known) {
  const out = new Set();
  for (const m of src.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)['"`]/g)) {
    if (known.has(m[1])) out.add(m[1]);
  }
  return out;
}

const KEYS = getAllKeys();
const known = new Set(KEYS);

function audienceOf(page) {
  const rel = path.relative(PAGES, page);
  if (rel.startsWith('admin')) return 'admin';
  if (rel.startsWith('c' + path.sep) || rel === 'c.js') return 'consumer';
  if (['_app.js', '_document.js', 'login.js', 'register.js', 'index.js'].includes(rel)) return 'shared';
  return 'owner';
}

const byAudience = { owner: new Set(), consumer: new Set(), admin: new Set(), shared: new Set() };
for (const page of walk(PAGES)) {
  const aud = audienceOf(page);
  for (const mod of closure(page)) {
    for (const k of keysIn(read(mod), known)) byAudience[aud].add(k);
  }
}

const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'backend/src/data/regional-i18n.json'), 'utf8'));
const has = (lang, k) => Boolean((reg[lang] || {})[k]) || Boolean(staticValue(lang, k));

// A key an admin page shows AND an owner page shows counts as owner-facing:
// a real shopkeeper reads it.
const shopkeeper = new Set([...byAudience.owner, ...byAudience.shared]);
const shopper = new Set([...byAudience.consumer, ...byAudience.shared]);
const adminOnly = new Set([...byAudience.admin].filter((k) => !shopkeeper.has(k) && !shopper.has(k)));
const unreferenced = KEYS.filter((k) => !byAudience.owner.has(k) && !byAudience.consumer.has(k) && !byAudience.admin.has(k) && !byAudience.shared.has(k));

console.log('Web dictionary:', KEYS.length, 'keys');
console.log('  reachable from OWNER console pages   :', shopkeeper.size);
console.log('  reachable from CONSUMER PWA pages    :', shopper.size);
console.log('  ADMIN-only (English-first by design) :', adminOnly.size);
console.log('  not reached by any page (dead/dynamic):', unreferenced.length);
console.log();

const LANGS = ['hi', 'bn', 'mr', 'ta', 'te', 'gu', 'kn', 'ml', 'ur'];
for (const [label, set] of [['SHOPKEEPER (owner console)', shopkeeper], ['SHOPPER (consumer PWA)', shopper]]) {
  const arr = [...set];
  console.log(label + ' — ' + arr.length + ' strings');
  for (const lang of LANGS) {
    const n = arr.filter((k) => has(lang, k)).length;
    const missing = arr.length - n;
    const bar = '█'.repeat(Math.round(20 * n / arr.length)).padEnd(20, '·');
    console.log(`  ${lang}  ${bar} ${(100 * n / arr.length).toFixed(1).padStart(5)}%   ${String(missing).padStart(4)} in English`);
  }
  console.log();
}

// What a Bengali shopkeeper specifically loses.
const bnMiss = [...shopkeeper].filter((k) => !has('bn', k));
const byArea = {};
for (const k of bnMiss) { const p = k.split('.')[0]; (byArea[p] ||= []).push(k); }
console.log('Bengali shopkeeper — English areas (top 15 by count):');
for (const [p, ks] of Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  console.log('  ' + p.padEnd(10), String(ks.length).padStart(4), '  e.g. ' + ks.slice(0, 2).join(', '));
}
