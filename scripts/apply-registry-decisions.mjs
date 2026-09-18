// Apply scripts/i18n-decisions.json to the dictionaries.
//
// The registry is the source of truth; this script only carries its values out
// to the four places a string can live. It has NO default: a key that no LOCKED
// decision names with an explicit value is not touched, in either direction.
// REVIEW, INTENTIONAL_DIVERGENCE and UNDECIDED rows are never written.
//
// It also refuses to write a value that is not already in the registry, so
// "what changed" and "what was decided" cannot drift apart: the diff this
// produces is exactly the registry's values map.
//
// Preview by default. --apply writes.
import fs from 'fs';
import path from 'path';
import { guardedWrite } from './lib/i18n-governed-keys.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const DASHP = path.join(ROOT, 'admin-dashboard/src/lib/i18n.js');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-decisions.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const src = Object.fromEntries([DASHP, ...APPS.map((f) => path.join(ROOT, f))].map((p) => [p, fs.readFileSync(p, 'utf8')]));

// Every `const <lang> = {` block, or — the dashboard splits its catalog across
// several merged objects (DICT, PAGE, …) — every `  <lang>: {` entry in any of
// them. A key lives in exactly one, so callers take the block that HAS it
// rather than the first one that matches the language.
function blocks(file, lang) {
  const s = src[file];
  const re = file === DASHP
    ? new RegExp(`\\n  ${lang}: \\{`, 'g')
    : new RegExp(`\\nconst ${lang} = \\{`, 'g');
  const out = [];
  for (const m of s.matchAll(re)) {
    const start = m.index;
    const end = file === DASHP
      ? (s.indexOf('\n  },', start) + 1 || s.length)
      : (s.indexOf('\nconst ', start + 10) + 1 || s.length);
    out.push([start, end]);
  }
  return out;
}
const keyRe = (key) => new RegExp(`('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*)'((?:[^'\\\\]|\\\\.)*)'`);

function get(file, lang, key) {
  for (const [a, b] of blocks(file, lang)) {
    const m = src[file].slice(a, b).match(keyRe(key));
    if (m) return m[2].replace(/\\'/g, "'");
  }
  return null;
}
function set(file, lang, key, value) {
  const esc = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  for (const [a, b] of blocks(file, lang)) {
    const blk = src[file].slice(a, b);
    if (!keyRe(key).test(blk)) continue;
    src[file] = src[file].slice(0, a) + blk.replace(keyRe(key), `$1'${esc}'`) + src[file].slice(b);
    return true;
  }
  return false;
}

const changes = [];
const skipped = [];
const note = (decision, lang, surface, key, from, to, where) => {
  if (from == null) { skipped.push({ decision, lang, surface, key, why: 'key absent' }); return; }
  if (from === to) return;
  changes.push({ decision, lang, surface, key, from, to, where });
};

for (const [id, d] of Object.entries(registry.decisions)) {
  if (d.status !== 'LOCKED') continue;
  if (!d.values) continue;
  // scope.surfaces is binding. product-item-grammar repairs web strings whose
  // app twin is a DIFFERENT string ('Product added.' vs 'Added'), so writing it
  // to both surfaces would overwrite a string the decision never looked at.
  const surfaces = new Set(d.scope?.surfaces ?? ['web', 'app']);
  for (const [lang, kv] of Object.entries(d.values)) {
    for (const [key, spec] of Object.entries(kv)) {
      // A value is either one string for both surfaces, or {web, app} where the
      // two surfaces deliberately say different things — gu chelp.e7.a keeps its
      // intentional divergence and only has its loanword respelled.
      const perSurface = typeof spec === 'string' ? { web: spec, app: spec } : spec;
      // web: the override file owns bn/gu/mr and the five transcribed languages;
      // en and hi live only in the dashboard's own DICT.
      if (surfaces.has('web') && perSurface.web !== undefined) {
        const to = perSurface.web;
        if (reg[lang] && key in reg[lang]) note(id, lang, 'web', key, reg[lang][key], to, 'regional-i18n.json');
        else {
          const cur = get(DASHP, lang, key);
          if (cur != null) note(id, lang, 'web', key, cur, to, 'admin-dashboard');
        }
      }
      if (!surfaces.has('app') || perSurface.app === undefined) continue;
      for (const f of APPS) {
        const p = path.join(ROOT, f);
        const cur = get(p, lang, key);
        if (cur != null) note(id, lang, 'app', key, cur, perSurface.app, path.basename(path.dirname(f)) === 'consumer' ? 'app/consumer' : 'app/owner');
      }
    }
  }
}

const byDecision = {};
for (const c of changes) (byDecision[c.decision] ||= []).push(c);
console.log(`${changes.length} changes across ${Object.keys(byDecision).length} LOCKED decisions\n`);
for (const [id, list] of Object.entries(byDecision)) {
  console.log(`--- ${id} — ${list.length} ---`);
  for (const c of list) console.log(`  [${c.lang} ${c.surface}] ${c.key}\n      - ${c.from}\n      + ${c.to}`);
  console.log('');
}
if (skipped.length) console.log(`(${skipped.length} registry rows had no such key on a surface — expected where a key is web-only or app-only)`);

if (!process.argv.includes('--apply')) {
  console.log('\npreview only — pass --apply to write');
  process.exit(0);
}

for (const c of changes) {
  if (c.where === 'regional-i18n.json') reg[c.lang][c.key] = c.to;
  else if (c.where === 'admin-dashboard') { if (!set(DASHP, c.lang, c.key, c.to)) throw new Error(`dashboard write failed: ${c.lang} ${c.key}`); }
  else {
    const f = path.join(ROOT, c.where === 'app/consumer' ? APPS[0] : APPS[1]);
    if (!set(f, c.lang, c.key, c.to)) throw new Error(`app write failed: ${c.lang} ${c.key}`);
  }
}
// This script IS the sanctioned writer for LOCKED rows — that is its entire
// job — so it is allowed those and nothing else. A REVIEW row, an intentional
// divergence or an undecided pair still stops it dead.
const ALLOW = { allow: ['LOCKED'] };
guardedWrite(REGP, JSON.stringify(reg, null, 2) + '\n', ALLOW);
for (const [p, s] of Object.entries(src)) guardedWrite(p, s, ALLOW);
console.log('\nwritten.');
