// Snapshot the CURRENT value of every string a REVIEW decision governs, into
// that decision's `protected` block.
//
// A REVIEW row is one a native speaker has not read yet. Until they do, nothing
// may change it — not a reconciliation script, not a terminology sweep, not a
// well-meaning find-and-replace. The gate can only enforce that if it knows what
// the value is supposed to be, and before this the registry recorded that for
// exactly two decisions out of eight. The 36 machine-authored FAQ translations,
// the loudest thing in the queue, had no record at all.
//
// A decision says what it protects in one of two shapes:
//
//   protects: { keys: [...], langs: [...] }   a rectangle — every key in every
//                                             language. Right when the decision
//                                             really is that shape, as the FAQ
//                                             one is: four keys, ten languages.
//
//   protects: { rows: [{lang, web, app}] }    an explicit list. The native review
//                                             queue is NOT a rectangle: the three
//                                             ledgers queued different keys in
//                                             different languages, and the app
//                                             side of a row usually lives under a
//                                             DIFFERENT key name — web c.pay is
//                                             app khata.pay, web c.locationNotSet
//                                             is app shops.noLocation. A rectangle
//                                             pinned 36 values nobody had queued
//                                             and missed 11 that were the actual
//                                             subject of the question.
//
// `protects.surfaces` narrows either shape to the surfaces the decision is
// about. consumer-faq-app-variants gives the native app its own FAQ answers; the
// web strings it diverges FROM were never part of that decision, and pinning
// them made a REVIEW decision immutable over 40 rows it does not claim.
//
// A value that a LOCKED decision already names is never snapshotted. Status is
// not additive: a row cannot both be settled and be waiting to be read, and
// LOCKED is the one that was decided by a person. Where a queued row has since
// been answered, the row lives on in `superseded_rows` as provenance.
//
// This writes ONLY the `protected` blocks. It never touches a dictionary, a
// decision's status, its scope, or any other field — run it, and `git diff`
// should show scripts/i18n-decisions.json and nothing else.
//
// Run it again after a native review lands and the new wording is applied, so
// the snapshot tracks the approved text rather than the superseded one.
//
//   node scripts/i18n-review-snapshot.mjs            # preview
//   node scripts/i18n-review-snapshot.mjs --apply    # write
import fs from 'fs';
import path from 'path';
import { ruleLockedRows } from './lib/i18n-governed-keys.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'scripts/i18n-decisions.json');
const APPS = [
  ['app/consumer', 'mobile-app/src/consumer/i18n.js'],
  ['app/owner', 'mobile-app/src/i18n.js'],
];

const registry = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const WEB = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'));

// Values are written with either quote style — a string containing an apostrophe
// is double-quoted — so both have to be read or the snapshot silently misses one.
const kvOf = (blk) => {
  const o = {};
  for (const m of (blk || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  for (const m of (blk || '').matchAll(/'([^']+)':\s*"((?:[^"\\]|\\.)*)"/g)) o[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return o;
};
function appDict(rel) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const a = m.index, b = s.indexOf('\nconst ', a + 10);
    out[m[1]] = kvOf(s.slice(a, b > 0 ? b : s.length));
  }
  return out;
}
const APP = Object.fromEntries(APPS.map(([id, rel]) => [id, appDict(rel)]));
const DASH = {};
{
  const s = fs.readFileSync(path.join(ROOT, 'admin-dashboard/src/lib/i18n.js'), 'utf8');
  for (const m of s.matchAll(/\n {2}([a-z]{2}): \{/g)) {
    const a = m.index, b = s.indexOf('\n  },', a);
    DASH[m[1]] ||= {};
    for (const [k, v] of Object.entries(kvOf(s.slice(a, b > 0 ? b : s.length)))) if (!(k in DASH[m[1]])) DASH[m[1]][k] = v;
  }
}
const webValue = (lang, key) => (WEB[lang] && key in WEB[lang] ? WEB[lang][key] : DASH[lang]?.[key]);
const valueOn = (surface, lang, key) => (surface === 'web' ? webValue(lang, key) : APP[surface][lang]?.[key]);

// Every (lang, key) a LOCKED decision holds a value for. These are settled;
// REVIEW may not also claim them. Three of those decisions state a rule and
// name no values of their own, and their strings are pinned by the queue rows
// they retired — same source the gate checks, so the two cannot disagree about
// which rows are settled.
const LOCKED = new Set();
for (const d of Object.values(registry.decisions)) {
  if (d.status !== 'LOCKED' || !d.values) continue;
  for (const [lang, kv] of Object.entries(d.values)) for (const key of Object.keys(kv)) LOCKED.add(`${lang}|${key}`);
}
for (const r of ruleLockedRows(registry)) LOCKED.add(`${r.lang}|${r.key}`);

let rows = 0;
let lockedSkips = 0;
const report = [];
for (const [id, d] of Object.entries(registry.decisions)) {
  if (d.status !== 'REVIEW') continue;
  const scope = d.protects;
  const rectangular = scope && scope.keys && scope.langs;
  if (!scope || (!rectangular && !scope.rows)) { report.push(`  ${id}: no 'protects' scope — skipped`); continue; }

  // Both shapes reduce to the same thing: a list of (surface, lang, key) to pin.
  // Deduplicated, because one app key can be the app side of several web keys —
  // gu tab.orders answers ctab.orders, dash.kpi.orders, dl.orders and nav.orders.
  const wanted = new Map();
  const want = (surface, lang, key) => { if (valueOn(surface, lang, key) !== undefined) wanted.set(`${surface}|${lang}|${key}`, { surface, lang, key }); };
  const surfaces = scope.surfaces || ['web', ...APPS.map(([sid]) => sid)];
  if (rectangular) {
    for (const lang of scope.langs) for (const key of scope.keys) for (const s of surfaces) want(s, lang, key);
  } else {
    for (const r of scope.rows) {
      if (surfaces.includes('web')) want('web', r.lang, r.web);
      for (const [sid] of APPS) if (surfaces.includes(sid)) want(sid, r.lang, r.app);
    }
  }

  const prot = {};
  let skipped = 0;
  for (const { surface, lang, key } of wanted.values()) {
    if (LOCKED.has(`${lang}|${key}`)) { skipped += 1; lockedSkips += 1; continue; }
    (prot[surface] ||= {})[lang] ||= {};
    prot[surface][lang][key] = valueOn(surface, lang, key);
    rows += 1;
  }
  const n = Object.values(prot).reduce((s, byLang) => s + Object.values(byLang).reduce((t, kv) => t + Object.keys(kv).length, 0), 0);
  d.protected = prot;
  report.push(`  ${id.padEnd(32)} ${String(n).padStart(4)} values across ${Object.keys(prot).join(', ') || '(none found)'}`
    + (skipped ? `   (${skipped} left to a LOCKED decision)` : ''));
}

console.log(report.join('\n'));
console.log(`\n${rows} REVIEW values snapshotted${lockedSkips ? `, ${lockedSkips} left to a LOCKED decision` : ''}.`);
if (!process.argv.includes('--apply')) { console.log('preview only — pass --apply to write'); process.exit(0); }
fs.writeFileSync(REGP, JSON.stringify(registry, null, 2) + '\n', 'utf8');
console.log('written to scripts/i18n-decisions.json');
