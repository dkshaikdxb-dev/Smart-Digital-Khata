// Build the per-language translation request for the WEB console.
//
// The 2,101 strings closed in the four earlier batches were the two NATIVE
// dictionaries (mobile-app/src/i18n.js and src/consumer/i18n.js). The web
// dictionary (admin-dashboard/src/lib/i18n.js + i18nSupply.js) is a separate
// body of text and was never part of them, so a Bengali shopkeeper who opens the
// owner console still reads 494 of its 869 strings in English.
//
// ONE FILE PER LANGUAGE, deliberately. The consolidated 15-language sheet that
// came back from the last round had rows with the scripts mixed between
// languages (Tamil text in a Malayalam row); the safety checks caught it, but
// the fix is not to run that shape again.
//
// Every string is delivered back through backend/src/data/regional-i18n.json ->
// i18n_overrides, which translate() consults BEFORE the built-in dictionary for
// every language. So one delivery path covers all nine, and no giant JS
// dictionary file has to be hand-edited.
import fs from 'fs';
import path from 'path';
import { getAllKeys, staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'admin-dashboard', 'src');
const PAGES = path.join(SRC, 'pages');
const OUT = path.join(ROOT, 'docs', 'i18n-web');

const LANGS = [
  { code: 'bn', name: 'Bengali', script: 'Bengali' },
  { code: 'gu', name: 'Gujarati', script: 'Gujarati' },
  { code: 'mr', name: 'Marathi', script: 'Devanagari' },
  { code: 'ta', name: 'Tamil', script: 'Tamil' },
  { code: 'te', name: 'Telugu', script: 'Telugu' },
  { code: 'kn', name: 'Kannada', script: 'Kannada' },
  { code: 'ml', name: 'Malayalam', script: 'Malayalam' },
  { code: 'ur', name: 'Urdu', script: 'Arabic' },
  { code: 'hi', name: 'Hindi', script: 'Devanagari' },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const cache = new Map();
const read = (f) => { if (!cache.has(f)) cache.set(f, fs.readFileSync(f, 'utf8')); return cache.get(f); };

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function closure(entry) {
  const seen = new Set(); const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/(?:import[^'"]*from\s*|require\(\s*)['"]([^'"]+)['"]/g)) {
      if (/\/i18n(Supply)?(\.js)?$/.test(m[1])) continue; // it names every key
      const r = resolveImport(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return seen;
}

const KEYS = getAllKeys();
const known = new Set(KEYS);
const keysIn = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/['"`]([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9_.]+)['"`]/g)) if (known.has(m[1])) out.add(m[1]);
  return out;
};

// key -> the human-readable surfaces that show it.
const SURFACE = new Map();
const AUD = new Map();
const label = (rel) => {
  const stem = rel.replace(/\.js$/, '');
  if (rel.startsWith('admin')) {
    // 'admin.js' stems to 'admin' and 'admin/ads.js' to 'admin/ads'; stripping
    // the prefix off the former left an empty label reading just "Admin: ".
    const tail = stem.replace(/^admin[\/\\]?/, '') || 'overview';
    return 'Admin: ' + tail;
  }
  if (rel.startsWith('c/') || rel.startsWith('c\\')) return 'Shopper: ' + stem.slice(2);
  return 'Shopkeeper: ' + stem;
};
for (const page of walk(PAGES)) {
  const rel = path.relative(PAGES, page);
  if (rel.startsWith('_')) continue;
  const aud = rel.startsWith('admin') ? 'admin' : (rel.startsWith('c' + path.sep) ? 'shopper' : 'shopkeeper');
  for (const mod of closure(page)) {
    for (const k of keysIn(read(mod))) {
      if (!SURFACE.has(k)) SURFACE.set(k, new Set());
      SURFACE.get(k).add(label(rel));
      if (!AUD.has(k)) AUD.set(k, new Set());
      AUD.get(k).add(aud);
    }
  }
}

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'));
const has = (lang, k) => Boolean((reg[lang] || {})[k]) || Boolean(staticValue(lang, k));
const placeholders = (s) => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]);

// Admin-only chrome is English-first by design and is NOT requested. Keys no
// page reaches are skipped too: no context can be given for them, and some are
// dead.
function wanted(k) {
  const a = AUD.get(k);
  if (!a) return false;
  return a.has('shopkeeper') || a.has('shopper');
}

const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

fs.mkdirSync(OUT, { recursive: true });
const summary = [];
for (const L of LANGS) {
  const rows = KEYS.filter(wanted).filter((k) => !has(L.code, k)).sort();
  if (rows.length === 0) { summary.push({ ...L, n: 0 }); continue; }
  const lines = ['key,english,placeholders,where_it_appears,translation'];
  for (const k of rows) {
    const en = staticValue('en', k);
    const ph = placeholders(en).join(' ');
    // Shopkeeper and shopper surfaces first. A string that BOTH an admin desk
    // and the owner console show was listing its admin pages only (they sort
    // first), which tells a translator the opposite of the truth about who
    // reads it.
    const rank = (x) => (x.startsWith('Shopkeeper') ? 0 : x.startsWith('Shopper') ? 1 : 2);
    const where = [...(SURFACE.get(k) || [])]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .slice(0, 3).join('; ');
    lines.push([k, en, ph, where, ''].map(csvCell).join(','));
  }
  const file = path.join(OUT, `web-${L.code}.csv`);
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  summary.push({ ...L, n: rows.length, file: path.relative(ROOT, file) });
}

console.log('language   strings needed   file');
for (const s of summary) {
  console.log(String(s.name + ' (' + s.code + ')').padEnd(18), String(s.n).padStart(6), '   ', s.file || '—');
}
console.log();
console.log('total strings to translate:', summary.reduce((a, b) => a + b.n, 0));
