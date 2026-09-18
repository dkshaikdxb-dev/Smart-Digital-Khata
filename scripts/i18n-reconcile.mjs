// Web/app reconciliation for one language: audit first, apply only what a
// ledger says, never a default.
//
// ONE script with per-language PROFILES rather than a copy per language. This
// codebase has been bitten repeatedly by a second copy of a list drifting from
// the first, and gu-reconcile.mjs was on its way to becoming the first of nine.
//
// A profile is DERIVED from the language's own strings, never inherited. That
// is not a style preference, it is the thing that decides whether the audit
// works at all:
//
//   Bengali  না  IS the negative particle.
//   Gujarati ના  is the genitive postposition — ઑર્ડરના, "of the order".
//   Marathi  ना  is a case suffix — दुकानाला, जणांना — and part of नाव, सूचना.
//
// Counting ना as a negation in Gujarati or Marathi produces noise and misses
// the real negation (નથી / नाही). Each profile below records what a survey of
// that corpus actually found.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';
import { guardedWrite } from './lib/i18n-governed-keys.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REG = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];

// A Unicode-class boundary. JavaScript \b is ASCII-only: beside Indic text it
// matches at nearly every letter, so any \b-based rule here is meaningless.
const bounded = (cls, w) => new RegExp(`(?:^|[^${cls}])(${w})(?![${cls}])`, 'g');

const PROFILES = {
  gu: {
    name: 'Gujarati',
    cls: '\\u0A80-\\u0AFF',
    script: /[઀-૿]/,
    digits: [0x0AE6, 0x0AEF],
    // Survey: નથી 26, નહીં 6. ના appears 11 times and is the genitive every time.
    negations: ['નથી', 'નહીં', 'નહિ'],
    // ઑ (U+0A91) vs ઓ (U+0A93): the corpus is split 57/84, the app is all ઓ.
    orthography: { from: /ઑ/g, to: 'ઓ', label: 'ઑ vs ઓ' },
    ops: {
      cancel: 'રદ', accept: 'સ્વીકાર', approve: 'મંજૂર', return: 'પરત',
      pending: '(પેન્ડિંગ|બાકી)', pay: 'ચૂકવ', product: '(ઉત્પાદન|સામાન|વસ્તુ)',
      catalogue: '(કૅટલૉગ|કેટલોગ|યાદી)', ready: 'તૈયાર', delivered: '(પહોંચ|ડિલિવર)',
    },
  },
  mr: {
    name: 'Marathi',
    cls: '\\u0900-\\u097F',
    script: /[ऀ-ॿ]/,
    digits: [0x0966, 0x096F],
    // Survey: नाही 26, all standalone. ना appears 46 times and is a case suffix
    // or part of a word every time (दुकानाला, जणांना, नाव, सूचना). The bare न
    // particle: 0 standalone, 62 word-final — so न is never counted.
    negations: ['नाही', 'नाहीत', 'नका', 'नये'],
    // ऑ vs ओ is NOT split here: 94 web strings use ऑ and none use ओ, and the
    // app agrees. Zero orthography-only divergences, so no normalisation.
    orthography: null,
    // LIMITATION, stated rather than hidden: Marathi and Hindi share Devanagari,
    // so a Hindi string pasted into Marathi is invisible to a script check.
    // Only a reader catches that one.
    sharesScriptWith: 'hi',
    ops: {
      cancel: 'रद्द', accept: 'स्वीकार', approve: 'मंजूर', return: 'परत',
      pending: 'प्रलंबित', pay: '(भर|देण|द्याय)', outstanding: '(बाकी|उधारी)',
      balance: 'शिल्लक', product: '(वस्तू|माल|सामान|उत्पादन)', ready: 'तयार',
      delivered: '(पोहोच|डिलिव्हर)',
    },
  },
};

const lang = process.argv[2];
const P = PROFILES[lang];
if (!P) { console.error('usage: node scripts/i18n-reconcile.mjs <gu|mr> [--ledger] [--apply] [--show]'); process.exit(2); }
const LEDGER_JSON = path.join(ROOT, `scripts/${lang}-reconcile-decisions.json`);

/* ------------------------------------------------------------------ extract */
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
  const tr = pairs(b[lang]);
  for (const [k, v] of Object.entries(en)) {
    if (!tr[k]) continue;
    const key = v.trim();
    if (app.has(key) && app.get(key).text !== tr[k]) { app.get(key).ambiguous = true; continue; }
    if (!app.has(key)) app.set(key, { text: tr[k], from: `${path.basename(file, '.js')}:${k}` });
  }
}
const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
const dict = reg[lang];

/* -------------------------------------------------------------------- checks */
const NEG = P.negations.map((w) => bounded(P.cls, w));
const negCount = (s) => NEG.reduce((n, re) => n + ((String(s).match(re) || []).length), 0);
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
const nums = (s) => (String(s).match(/[0-9]+/g) || []).join(',');
const urls = (s) => (String(s).match(/https?:\/\/\S+/g) || []).join(' ');
const rupee = (s) => (String(s).match(/₹/g) || []).length;
const latin = (s) => (String(s).match(/[A-Za-z]{2,}/g) || []).sort().join(' ');
const nativeDigits = (s) => [...String(s)].filter((c) => c.codePointAt(0) >= P.digits[0] && c.codePointAt(0) <= P.digits[1]);
// A LEFT boundary alone is not enough: माल (goods) sits inside मालक (owner), so
// "Shop owner" was flagged as a product-word difference. Stems still need to
// match inflected forms (भर -> भरा, भरणा), so the right side allows the
// language's own vowel signs and virama but not a fresh consonant.
const OPS = Object.entries(P.ops).map(([name, w]) => ({
  name,
  re: new RegExp(`(?:^|[^${P.cls}])(${w})(?![\u0915-\u0939\u0995-\u09B9\u0A95-\u0AB9])`, 'g'),
}));
const sig = (s, re) => [...new Set((String(s).match(re) || []).map((x) => x.replace(new RegExp(`^[^${P.cls}]`), '')))].sort().join(' ');
const normOrth = (s) => (P.orthography ? s.replace(P.orthography.from, P.orthography.to) : s);

/* ------------------------------------------------------- classify and audit */
const rows = [];
for (const key of Object.keys(dict)) {
  const en = (staticValue('en', key) || '').trim();
  const hit = app.get(en);
  if (!en || !hit || hit.ambiguous) continue;
  const web = dict[key], appv = hit.text;
  if (web === appv) continue;

  const flags = [];
  const hard = (k, d) => flags.push({ kind: k, detail: d, hard: true });
  const soft = (k, d) => flags.push({ kind: k, detail: d, hard: false });

  if (ph(en).join('|') !== ph(appv).join('|')) hard('PLACEHOLDER', `english ${ph(en).join(' ') || 'none'}, app ${ph(appv).join(' ') || 'none'}`);
  if (nums(web) !== nums(appv)) hard('NUMBERS', `web "${nums(web) || '—'}" vs app "${nums(appv) || '—'}"`);
  if (urls(web) !== urls(appv)) hard('URL', 'differs');
  if (rupee(web) !== rupee(appv)) hard('CURRENCY', `₹ web ${rupee(web)}, app ${rupee(appv)}`);
  if (negCount(web) !== negCount(appv)) hard('NEGATION', `web ${negCount(web)}, app ${negCount(appv)}`);
  if (nativeDigits(appv).length) hard('NATIVE DIGITS', `app has ${nativeDigits(appv).join('')}`);
  if (nativeDigits(web).length) hard('NATIVE DIGITS (web)', `web has ${nativeDigits(web).join('')}`);
  if (!P.script.test(appv) && P.script.test(web)) hard('SCRIPT', `app string has no ${P.name}`);
  if (latin(web) !== latin(appv)) soft('LATIN/BRAND', `web [${latin(web) || '—'}] vs app [${latin(appv) || '—'}]`);
  for (const o of OPS) {
    const sw = sig(web, o.re), sa = sig(appv, o.re);
    if (sw !== sa) hard(o.name.toUpperCase(), `web [${sw || '—'}] vs app [${sa || '—'}]`);
  }
  const ratio = appv.length / Math.max(1, web.length);
  if (ratio < 0.7) hard('CONTENT LOST', `app ${Math.round((1 - ratio) * 100)}% shorter`);
  if (ratio > 1.45) soft('CONTENT ADDED', `app ${Math.round((ratio - 1) * 100)}% longer`);

  const orth = normOrth(web) === normOrth(appv);
  const cls = orth ? 'A' : flags.some((f) => f.hard) ? 'C' : 'B';
  rows.push({ key, en, web, app: appv, from: hit.from, cls, orth, flags });
}

/* ----------------------------------------------------------- decide + apply */
const DEC = fs.existsSync(LEDGER_JSON) ? JSON.parse(fs.readFileSync(LEDGER_JSON, 'utf8')) : { app: {}, web: {} };
for (const r of rows) {
  // NO DEFAULT. A row the ledger does not name is untouched in both directions.
  if (DEC.app && DEC.app[r.key]) { r.decision = 'app'; r.meta = DEC.app[r.key]; }
  else if (DEC.web && DEC.web[r.key]) { r.decision = 'web'; r.meta = DEC.web[r.key]; }
  else { r.decision = 'review'; r.meta = null; }
}
const toApply = rows.filter((r) => r.decision === 'app');
const keepWeb = rows.filter((r) => r.decision === 'web');
const review = rows.filter((r) => r.decision === 'review');

function guard(r) {
  const f = [];
  if (ph(r.app).join('|') !== ph(r.en).join('|')) f.push('placeholders differ from the english');
  if (!r.app || !r.app.trim()) f.push('empty');
  if (!P.script.test(r.app) && P.script.test(r.web)) f.push(`no ${P.name} in the app string`);
  if (urls(r.en) !== urls(r.app)) f.push('url changed');
  if (rupee(r.en) !== rupee(r.app)) f.push('₹ count differs from the english');
  if (nums(r.en) !== nums(r.app)) f.push('numbers differ from the english');
  if (nativeDigits(r.app).length) f.push('native digits');
  return f;
}

const by = (c) => rows.filter((r) => r.cls === c);
console.log(`${P.name} divergences: ${rows.length}`);
console.log(`  A  same meaning / style${P.orthography ? ' (incl. ' + P.orthography.label + ')' : ''}: ${by('A').length}`);
console.log(`  B  translation choice:   ${by('B').length}`);
console.log(`  C  possible meaning change: ${by('C').length}`);
console.log(`decisions: ${toApply.length} app, ${keepWeb.length} web, ${review.length} review`);

if (process.argv.includes('--ledger')) {
  const L = [`# ${P.name} web/app reconciliation — decision ledger\n`];
  L.push('Written before anything is applied, and read BY the apply step: a row this');
  L.push('file does not name is not touched, in either direction.\n');
  L.push(`Linguistic checks were derived from the ${P.name} corpus, not inherited.`);
  L.push(`Negation: ${P.negations.join(', ')}.`);
  if (P.orthography) L.push(`Orthography normalised for classification only: ${P.orthography.label}.`);
  else L.push('No orthographic split found in this corpus.');
  if (P.sharesScriptWith) L.push(`\n**Limitation:** ${P.name} shares its script with \`${P.sharesScriptWith}\`, so a string in that language cannot be detected here by script. Only a reader catches it.`);
  L.push(`\n| | rows |\n|---|---|`);
  L.push(`| divergences | ${rows.length} |`);
  L.push(`| A / B / C | ${by('A').length} / ${by('B').length} / ${by('C').length} |`);
  L.push(`| take the app string | ${toApply.length} |`);
  L.push(`| keep the web string | ${keepWeb.length} |`);
  L.push(`| await a ${P.name} reader | ${review.length} |`);
  const row = (r) => {
    L.push(`### \`${r.key}\``);
    L.push(`- en:  ${r.en}`);
    L.push(`- web: ${r.web}`);
    L.push(`- app: ${r.app}  _(${r.from})_`);
    L.push(`- class: **${r.cls}**  ·  decision: **${r.decision}**`);
    if (r.meta) L.push(`- confidence: ${r.meta.confidence}  ·  native review: ${r.meta.native_review ? 'yes' : 'no'}\n- reason: ${r.meta.reason}`);
    if (r.flags.length) L.push(`- flags: ${r.flags.map((f) => `${f.hard ? '!!' : '~'} ${f.kind}`).join(', ')}`);
    L.push('');
  };
  L.push('\n## Applied — take the app string\n'); toApply.forEach(row);
  L.push('\n## Applied — keep the web string\n'); keepWeb.forEach(row);
  L.push(`\n## Awaiting a ${P.name} reader\n`); review.forEach(row);
  fs.writeFileSync(path.join(ROOT, `docs/i18n-web/LEDGER-${lang}-reconcile.md`), L.join('\n') + '\n', 'utf8');
  console.log(`wrote docs/i18n-web/LEDGER-${lang}-reconcile.md`);
}

if (process.argv.includes('--show')) {
  for (const c of ['C', 'B', 'A']) {
    if (!by(c).length) continue;
    console.log(`\n===== ${c} =====`);
    for (const r of by(c)) {
      console.log(`\n${r.key}  [${r.decision}]`);
      console.log(`  en : ${r.en.slice(0, 110)}`);
      console.log(`  web: ${r.web.slice(0, 95)}`);
      console.log(`  app: ${r.app.slice(0, 95)}`);
      for (const f of r.flags) console.log(`  ${f.hard ? '!!' : '~ '} ${f.kind}: ${f.detail}`);
    }
  }
}

if (process.argv.includes('--apply')) {
  const before = Object.keys(dict).length;
  const bad = toApply.map((r) => [r.key, guard(r)]).filter(([, f]) => f.length);
  if (bad.length) {
    console.log('\nREFUSING TO APPLY — guards failed:');
    for (const [k, f] of bad) console.log(`  ${k}: ${f.join('; ')}`);
    process.exit(1);
  }
  for (const r of toApply) dict[r.key] = r.app;
  if (Object.keys(dict).length !== before) { console.log('REFUSING: key count changed'); process.exit(1); }
  const ordered = {};
  for (const k of Object.keys(dict).sort()) ordered[k] = dict[k];
  reg[lang] = ordered;
  guardedWrite(REG, JSON.stringify(reg, null, 2) + '\n');
  console.log(`\napplied ${toApply.length} strings`);
} else {
  console.log('(dry run — pass --apply to write)');
}
