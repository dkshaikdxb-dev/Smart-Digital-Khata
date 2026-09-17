// Gujarati web/app reconciliation — audit first, apply only what a ledger says.
//
// The Bengali run is the METHOD reference, not a linguistic one. Every check
// below was derived from the Gujarati strings themselves, and the first thing
// that survey showed is why that matters: ના is the Bengali negative particle,
// and in this Gujarati corpus it is never a negation at all — it is the
// genitive postposition (ઑર્ડરના, "of the order") or part of નામ / નાની / નાખો.
// Importing Bengali's rule would have flagged noise and missed the real thing.
// Gujarati negates with નથી and નહીં, and those are what is counted.
//
// Nothing is applied by this file unless --apply is passed AND the ledger has a
// decision for the row. There is no default: a row with no decision is not
// touched, in either direction.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REG = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const LEDGER_JSON = path.join(ROOT, 'scripts/gu-reconcile-decisions.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];

/* ---------------------------------------------------------------- extract */
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
const app = new Map();
for (const file of APPS) {
  const b = blocks(file);
  const en = pairs(b.en);
  const tr = pairs(b.gu);
  for (const [k, v] of Object.entries(en)) {
    if (!tr[k]) continue;
    const key = v.trim();
    if (app.has(key) && app.get(key).text !== tr[k]) { app.get(key).ambiguous = true; continue; }
    if (!app.has(key)) app.set(key, { text: tr[k], from: `${path.basename(file, '.js')}:${k}` });
  }
}
const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const gu = reg.gu;

/* --------------------------------------------------- Gujarati-aware checks */
// Explicit boundaries. JavaScript \b is ASCII-only: beside Gujarati it matches
// at every letter, so \b-based rules are silently meaningless here.
const L = '[\\u0A80-\\u0AFF]';                      // any Gujarati letter
const EDGE_L = `(?:^|[^\\u0A80-\\u0AFF])`;          // not preceded by one
const EDGE_R = `(?![\\u0A80-\\u0AFF])`;             // not followed by one
const tok = (w) => new RegExp(`${EDGE_L}${w}${EDGE_R}`, 'g');

const NEG = [tok('નથી'), tok('નહીં'), tok('નહિ')];
const negCount = (s) => NEG.reduce((n, re) => n + ((String(s).match(re) || []).length), 0);

const GU_SCRIPT = /[઀-૿]/;
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
const nums = (s) => (String(s).match(/[0-9]+/g) || []).join(',');
const urls = (s) => (String(s).match(/https?:\/\/\S+/g) || []).join(' ');
const rupee = (s) => (String(s).match(/₹/g) || []).length;
const latin = (s) => (String(s).match(/[A-Za-z]{2,}/g) || []).sort().join(' ');
// Gujarati writes native digits ૦-૯; the app renders every number in Latin.
const nativeDigits = (s) => [...String(s)].filter((c) => c >= '૦' && c <= '૯');

// Operation vocabulary, read off the strings rather than assumed.
const OPS = [
  { name: 'cancel',   re: tok('રદ') },
  { name: 'accept',   re: new RegExp(`${EDGE_L}સ્વીકાર`, 'g') },
  { name: 'approve',  re: new RegExp(`${EDGE_L}મંજૂર`, 'g') },
  { name: 'return',   re: new RegExp(`${EDGE_L}પરત`, 'g') },
  { name: 'pending',  re: new RegExp(`${EDGE_L}(પેન્ડિંગ|બાકી)`, 'g') },
  { name: 'pay',      re: new RegExp(`${EDGE_L}ચૂકવ`, 'g') },
  { name: 'product',  re: new RegExp(`${EDGE_L}(ઉત્પાદન|સામાન|વસ્તુ)`, 'g') },
  { name: 'catalogue',re: new RegExp(`${EDGE_L}(કૅટલૉગ|કેટલોગ|યાદી)`, 'g') },
  { name: 'ready',    re: new RegExp(`${EDGE_L}તૈયાર`, 'g') },
  { name: 'delivered',re: new RegExp(`${EDGE_L}(પહોંચ|ડિલિવર)`, 'g') },
];
const sig = (s, re) => [...new Set(String(s).match(re) || [])].map((x) => x.trim()).sort().join(' ');

// ઑ (U+0A91) vs ઓ (U+0A93) is a systematic ORTHOGRAPHIC split between the two
// surfaces — ઑર્ડર/ઓર્ડર, ઑનલાઇન/ઓનલાઇન. It is a house-style choice, not a
// meaning change, so it is detected separately and never counted as semantic.
const orthOnly = (a, b) => a.replace(/ઑ/g, 'ઓ') === b.replace(/ઑ/g, 'ઓ');

/* ------------------------------------------------------ classify and audit */
const rows = [];
for (const key of Object.keys(gu)) {
  const en = (staticValue('en', key) || '').trim();
  const hit = app.get(en);
  if (!en || !hit || hit.ambiguous) continue;
  const web = gu[key], appv = hit.text;
  if (web === appv) continue;

  const flags = [];
  const hard = (kind, detail) => flags.push({ kind, detail, hard: true });
  const soft = (kind, detail) => flags.push({ kind, detail, hard: false });

  if (ph(en).join('|') !== ph(appv).join('|')) hard('PLACEHOLDER', `app has ${ph(appv).join(' ') || 'none'}, english has ${ph(en).join(' ') || 'none'}`);
  if (nums(web) !== nums(appv)) hard('NUMBERS', `web "${nums(web) || '—'}" vs app "${nums(appv) || '—'}"`);
  if (urls(web) !== urls(appv)) hard('URL', `web "${urls(web) || '—'}" vs app "${urls(appv) || '—'}"`);
  if (rupee(web) !== rupee(appv)) hard('CURRENCY', `₹ appears ${rupee(web)}x on web, ${rupee(appv)}x in app`);
  if (negCount(web) !== negCount(appv)) hard('NEGATION', `web ${negCount(web)}, app ${negCount(appv)}`);
  if (latin(web) !== latin(appv)) soft('LATIN/BRAND', `web [${latin(web) || '—'}] vs app [${latin(appv) || '—'}]`);
  if (nativeDigits(appv).length) hard('NATIVE DIGITS', `app uses ${nativeDigits(appv).join('')}`);
  if (!GU_SCRIPT.test(appv) && GU_SCRIPT.test(web)) hard('SCRIPT', 'app string has no Gujarati');
  for (const o of OPS) {
    const sw = sig(web, o.re), sa = sig(appv, o.re);
    if (sw !== sa) hard(o.name.toUpperCase(), `web [${sw || '—'}] vs app [${sa || '—'}]`);
  }
  const ratio = appv.length / Math.max(1, web.length);
  if (ratio < 0.7) hard('CONTENT LOST', `app is ${Math.round((1 - ratio) * 100)}% shorter`);
  if (ratio > 1.45) soft('CONTENT ADDED', `app is ${Math.round((ratio - 1) * 100)}% longer`);

  const orth = orthOnly(web, appv);
  const hardFlags = flags.filter((f) => f.hard);
  // CLASSIFY. Orthography-only differences are A by construction. Anything with
  // a hard flag is C — a possible meaning change — and never aligns on its own.
  // Everything else starts as B: a translation choice, which a person decides.
  const cls = orth ? 'A' : hardFlags.length ? 'C' : 'B';
  rows.push({ key, en, web, app: appv, from: hit.from, cls, orth, flags });
}

const by = (c) => rows.filter((r) => r.cls === c);
console.log(`Gujarati divergences: ${rows.length}`);
console.log(`  A  orthography only (ઑ/ઓ etc): ${by('A').length}`);
console.log(`  B  translation choice:          ${by('B').length}`);
console.log(`  C  possible meaning change:     ${by('C').length}`);

if (process.argv.includes('--dump')) {
  fs.writeFileSync('/tmp/gu-rows.json', JSON.stringify(rows, null, 1));
  console.log('\nwrote /tmp/gu-rows.json');
}
/* ------------------------------------------------ decide, guard and apply */
const DEC = fs.existsSync(LEDGER_JSON) ? JSON.parse(fs.readFileSync(LEDGER_JSON, 'utf8')) : { app: {}, web: {} };
for (const r of rows) {
  // NO DEFAULT. A row the ledger does not name is left alone in both
  // directions. Overlap, naturalness, and what another language chose are not
  // reasons to change a live string.
  if (DEC.app && DEC.app[r.key]) { r.decision = 'app'; r.meta = DEC.app[r.key]; }
  else if (DEC.web && DEC.web[r.key]) { r.decision = 'web'; r.meta = DEC.web[r.key]; }
  else { r.decision = 'review'; r.meta = null; }
}
const toApply = rows.filter((r) => r.decision === 'app');

// GUARDS. Every one of these refuses the whole run rather than skipping a row:
// a guard that quietly drops what it does not like teaches nobody anything.
function guard(r) {
  const fail = [];
  const enPh = ph(r.en).join('|');
  if (ph(r.app).join('|') !== enPh) fail.push(`placeholders: english has ${enPh || 'none'}, app string has ${ph(r.app).join('|') || 'none'}`);
  if (!r.app || !r.app.trim()) fail.push('app string is empty');
  if (!GU_SCRIPT.test(r.app) && GU_SCRIPT.test(r.web)) fail.push('app string has no Gujarati');
  if (urls(r.en) !== urls(r.app)) fail.push('url changed');
  if (rupee(r.en) !== rupee(r.app)) fail.push(`₹ count: english ${rupee(r.en)}, app ${rupee(r.app)}`);
  if (nums(r.en) !== nums(r.app)) fail.push(`numbers: english "${nums(r.en) || '—'}", app "${nums(r.app) || '—'}"`);
  if (nativeDigits(r.app).length) fail.push('app string contains native Gujarati digits');
  return fail;
}

if (process.argv.includes('--ledger')) writeLedger();

if (process.argv.includes('--apply')) {
  const before = Object.keys(gu).length;
  const problems = [];
  for (const r of toApply) { const f = guard(r); if (f.length) problems.push([r.key, f]); }
  if (problems.length) {
    console.log('\nREFUSING TO APPLY — guards failed:');
    for (const [k, f] of problems) console.log(`  ${k}: ${f.join('; ')}`);
    process.exit(1);
  }
  for (const r of toApply) gu[r.key] = r.app;
  if (Object.keys(gu).length !== before) { console.log('\nREFUSING: key count changed'); process.exit(1); }
  const ordered = {};
  for (const k of Object.keys(gu).sort()) ordered[k] = gu[k];
  reg.gu = ordered;
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  console.log(`\napplied ${toApply.length} strings; ${rows.length - toApply.length - rows.filter((r) => r.decision === 'web').length} left for review, ${rows.filter((r) => r.decision === 'web').length} keeping the web string`);
} else if (!process.argv.includes('--show')) {
  console.log(`\ndecisions: ${toApply.length} take the app string, ${rows.filter((r) => r.decision === 'web').length} keep the web, ${rows.filter((r) => r.decision === 'review').length} await a Gujarati reader`);
  console.log('(dry run — pass --apply to write)');
}

function writeLedger() {
  const L = [];
  L.push('# Gujarati web/app reconciliation — decision ledger\n');
  L.push('Built before anything was applied, and read BY the apply step: a row this');
  L.push('file does not name is not touched, in either direction.\n');
  L.push(`| | rows |`);
  L.push(`|---|---|`);
  L.push(`| divergences found | ${rows.length} |`);
  L.push(`| take the app string | ${toApply.length} |`);
  L.push(`| keep the web string | ${rows.filter((r) => r.decision === 'web').length} |`);
  L.push(`| await a Gujarati reader | ${rows.filter((r) => r.decision === 'review').length} |`);
  const row = (r) => {
    L.push(`### \`${r.key}\``);
    L.push(`- en:  ${r.en}`);
    L.push(`- web: ${r.web}`);
    L.push(`- app: ${r.app}  _(${r.from})_`);
    L.push(`- class: **${r.cls}**${r.orth ? ' (orthography only)' : ''}  ·  decision: **${r.decision}**`);
    if (r.meta) L.push(`- confidence: ${r.meta.confidence}  ·  native review: ${r.meta.native_review ? 'yes' : 'no'}`);
    if (r.meta) L.push(`- reason: ${r.meta.reason}`);
    if (r.flags.length) L.push(`- flags: ${r.flags.map((f) => `${f.hard ? '!!' : '~'} ${f.kind}`).join(', ')}`);
    L.push('');
  };
  L.push('\n## Applied — take the app string\n');
  for (const r of toApply) row(r);
  L.push('\n## Applied — keep the web string\n');
  for (const r of rows.filter((x) => x.decision === 'web')) row(r);
  L.push('\n## Awaiting a Gujarati reader\n');
  L.push('Grouped into themes in scripts/gu-reconcile-decisions.json: about eight');
  L.push('questions, not one per row. The web string stays live until answered.\n');
  for (const r of rows.filter((x) => x.decision === 'review')) row(r);
  fs.writeFileSync(path.join(ROOT, 'docs/i18n-web/LEDGER-gu-reconcile.md'), L.join('\n') + '\n', 'utf8');
  console.log('\nwrote docs/i18n-web/LEDGER-gu-reconcile.md');
}

if (process.argv.includes('--show')) {
  for (const c of ['C', 'B']) {
    console.log(`\n===== ${c} =====`);
    for (const r of by(c)) {
      console.log(`\n${r.key}`);
      console.log(`  en : ${r.en.slice(0, 110)}`);
      console.log(`  web: ${r.web.slice(0, 90)}`);
      console.log(`  app: ${r.app.slice(0, 90)}`);
      for (const f of r.flags) console.log(`  ${f.hard ? '!!' : '~ '} ${f.kind}: ${f.detail}`);
    }
  }
}
