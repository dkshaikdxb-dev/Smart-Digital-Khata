// Apply the A/B/C decision ledger for the Bengali web/app divergence.
//
// A  136 wording variants   -> align the web to the app, mechanically.
// B   78 word choices/money -> per-key decision from bn-divergence-decisions.json.
// C   c.catDalPulses        -> handled on its own, as a correctness bug.
//
// Dry by default. --apply writes; --ledger writes the decision record. The
// ledger is produced from the SAME data the change is, so it cannot describe
// something other than what happens.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';
import { guardedWrite } from './lib/i18n-governed-keys.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REG = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const DECISIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/bn-divergence-decisions.json'), 'utf8'));

function blocks(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const start = m.index;
    const next = s.indexOf('\nconst ', start + 10);
    out[m[1]] = s.slice(start, next > 0 ? next : s.length);
  }
  return out;
}
const pairs = (b) => {
  const o = {};
  for (const m of (b || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2];
  return o;
};
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).slice().sort().join('|');

const app = new Map();
for (const file of APPS) {
  const b = blocks(file);
  const en = pairs(b.en);
  const tr = pairs(b.bn);
  for (const [k, v] of Object.entries(en)) {
    if (!tr[k]) continue;
    const key = v.trim();
    if (app.has(key) && app.get(key).text !== tr[k]) { app.get(key).ambiguous = true; continue; }
    if (!app.has(key)) app.set(key, { text: tr[k], from: k });
  }
}

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const bn = reg.bn;
const MONEY = /owe|advance|due|balance|credit|paid|prepaid|settle|refund|cash|pay|amount|total|discount/i;

const A = [], B = [], skipped = [], groupC = [];
for (const key of Object.keys(bn)) {
  const en = (staticValue('en', key) || '').trim();
  const hit = app.get(en);
  if (!en || !hit || hit.ambiguous) continue;
  if (bn[key] === hit.text) continue;
  // GROUP C is excluded from both A and B. These keys differ because one side
  // is WRONG, and aligning mechanically propagates the wrong string to the
  // surface that had it right — which is what the first run of this script did
  // to c.catDalPulses, overwriting the correct web value with the app's bug.
  if (DECISIONS._group_c && DECISIONS._group_c[key]) { groupC.push({ key, en, app: hit.text, web: bn[key] }); continue; }

  // A placeholder difference means the two strings are not interchangeable and
  // aligning would break one of them. Never silently swap those.
  if (ph(en) !== ph(hit.text)) { skipped.push({ key, en, why: 'app string has different placeholders' }); continue; }

  const a = hit.text, w = bn[key];
  const shared = [...new Set(a.split(/\s+/))].filter((t) => w.includes(t)).length;
  const words = Math.max(a.split(/\s+/).length, w.split(/\s+/).length);
  const overlap = words ? shared / words : 0;
  const row = { key, en, app: a, web: w, from: hit.from, money: MONEY.test(en) };
  if (row.money || overlap < 0.34) B.push(row); else A.push(row);
}

// Decide.
// EVERY row consults the decision file, group A included. The first version
// hard-coded decision='app' for A on the theory that a wording variant needs no
// decision — and the semantic audit then found five A rows that were not
// wording variants at all (bare নিন for "Accept", a missing classifier in
// "{n} items"). A row that has been reclassified must be honoured wherever it
// happens to sit, or the reclassification is a comment rather than a change.
function decide(r, group) {
  r.group = group;
  if (DECISIONS.keep_web[r.key]) { r.decision = 'web'; r.why = DECISIONS.keep_web[r.key]; return; }
  if (DECISIONS.review[r.key]) { r.decision = 'review'; r.why = DECISIONS.review[r.key]; return; }
  r.decision = 'app';
  r.why = DECISIONS.align_to_app_because[r.key]
    || (group === 'A' ? 'wording variant — aligned mechanically' : 'no reason to prefer the web wording — aligned to the app');
}
for (const r of A) decide(r, 'A');
for (const r of B) decide(r, 'B');
// A row named in the decision file is a decided row, whatever the overlap
// heuristic called it. Report it where it was decided, not where it landed.
const RECLASSIFIED = new Set(Object.keys(DECISIONS.keep_web)
  .concat(Object.keys(DECISIONS.review), Object.keys(DECISIONS.align_to_app_because)));
const movedFromA = A.filter((r) => RECLASSIFIED.has(r.key));
for (const r of movedFromA) r.group = 'A->B';

const all = [...A, ...B];
const changing = all.filter((r) => r.decision === 'app');
const keepingWeb = all.filter((r) => r.decision === 'web');
const forReview = all.filter((r) => r.decision === 'review');

console.log(`A (wording variants):        ${A.length - movedFromA.length}  -> aligned to the app`);
console.log(`A -> B (semantic audit):     ${movedFromA.length}  -> ${movedFromA.filter(r=>r.decision==='web').length} keep the web, ${movedFromA.filter(r=>r.decision==='app').length} aligned with a stated reason`);
console.log(`B (word choices + money):    ${B.length}  -> ${B.filter(r=>r.decision==='app').length} aligned, ${keepingWeb.length} keep the web, ${forReview.length} for human review`);
console.log(`C (correctness bugs, excluded):  ${groupC.length}`);
console.log(`skipped (placeholders differ): ${skipped.length}`);
console.log(`\nstrings that will CHANGE: ${changing.length}`);

if (process.argv.includes('--ledger')) {
  const L = [];
  L.push('# Bengali web/app divergence — decision ledger\n');
  L.push('Generated from the same data the change is applied from, so it cannot');
  L.push('describe something other than what happened. Rebuild with');
  L.push('`node scripts/bn-divergence-apply.mjs --ledger`.\n');
  L.push(`| group | rows | outcome |`);
  L.push(`|---|---|---|`);
  L.push(`| A — wording variants | ${A.length} | aligned to the app |`);
  L.push(`| B — word choices and money | ${B.length} | ${B.filter(r=>r.decision==='app').length} aligned, ${keepingWeb.length} keep the web, ${forReview.length} for review |`);
  for (const c of groupC) L.push(`| C — \`${c.key}\` | 1 | correctness bug — excluded from A/B, fixed at source |`);
  L.push(`| skipped | ${skipped.length} | placeholders differ, not interchangeable |`);
  const section = (t, note, list, showWhy) => {
    L.push(`\n## ${t} — ${list.length}\n`);
    if (note) L.push(note + '\n');
    for (const r of list) {
      L.push(`### \`${r.key}\`  _(group ${r.group})_`);
      L.push(`- en:  ${r.en}`);
      L.push(`- app: ${r.app}`);
      L.push(`- web: ${r.web}`);
      L.push(`- **${r.decision === 'app' ? 'web changes to the app string' : r.decision === 'web' ? 'web string kept' : 'NOT CHANGED — needs a Bengali reader'}**${showWhy ? ` — ${r.why}` : ''}`);
      L.push('');
    }
  };
  section('Kept the web string', 'The web wording is closer to what the English actually says.', keepingWeb, true);
  section('Left for human review', 'Neither string ships a change until somebody who speaks Bengali answers. The web string stays live meanwhile.', forReview, true);
  section('Aligned to the app, for a stated reason', 'These are not style calls — the web string lost content, confused two actions, or doubled a currency word.', B.filter((r) => r.decision === 'app' && DECISIONS.align_to_app_because[r.key]), true);
  section('Aligned to the app (group B, no strong preference)', 'Word choices where neither is more accurate, so the app wins as the default.', B.filter((r) => r.decision === 'app' && !DECISIONS.align_to_app_because[r.key]), false);
  section('Aligned to the app (group A, wording variants)', 'Inflection, politeness and word order.', A, false);
  if (skipped.length) {
    L.push(`\n## Skipped — ${skipped.length}\n`);
    for (const s of skipped) L.push(`- \`${s.key}\` — ${s.why}`);
  }
  fs.writeFileSync(path.join(ROOT, 'docs/i18n-web/LEDGER-bn-divergence.md'), L.join('\n') + '\n', 'utf8');
  console.log('\nwrote docs/i18n-web/LEDGER-bn-divergence.md');
}

if (!process.argv.includes('--apply')) { console.log('\n(dry run — pass --apply to write)'); process.exit(0); }

for (const r of changing) {
  if (ph(r.en) !== ph(r.app)) throw new Error('refusing to write a placeholder mismatch: ' + r.key);
  bn[r.key] = r.app;
}
const ordered = {};
for (const k of Object.keys(bn).sort()) ordered[k] = bn[k];
reg.bn = ordered;
guardedWrite(REG, JSON.stringify(reg, null, 2) + '\n');
console.log(`\napplied ${changing.length} strings`);
