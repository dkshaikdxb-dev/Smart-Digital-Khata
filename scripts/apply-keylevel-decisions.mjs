// Apply the owner's per-key decisions for bn / gu / mr.
//
// 'app' takes the app string, 'web' is a no-op, anything else is an explicit
// string the decision supplied. A key absent from the file is untouched — there
// is no default, and no heuristic decides anything here.
//
// The Gujarati orthographic normalisation is applied to EVERY Gujarati string,
// web and app, because the decision was explicitly corpus-wide. It is safe
// precisely because it cannot alter meaning: these are two spellings of one
// vowel in loanwords.
//
// TWO CODEPOINTS, not one. Gujarati writes candra-O as the independent letter ઑ
// (U+0A91) in ઑર્ડર and as the dependent sign ૉ (U+0AC9) in લૉગ. Normalising
// only the letter left લૉગ આઉટ untouched while the decision's own example spells
// it લોગ આઉટ — 66 strings would have kept the old spelling and the corpus would
// have been left half-converted, which is worse than not starting.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const DEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/keylevel-decisions.json'), 'utf8'));
const LANGS = ['bn', 'gu', 'mr'];

const reg = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const src = Object.fromEntries(APPS.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const blockOf = (f, l) => {
  const m = src[f].match(new RegExp(`\\nconst ${l} = \\{`));
  if (!m) return null;
  const nx = src[f].indexOf('\nconst ', m.index + 10);
  return [m.index, nx > 0 ? nx : src[f].length];
};
const appGet = (f, l, k) => {
  const b = blockOf(f, l); if (!b) return null;
  const m = src[f].slice(b[0], b[1]).match(new RegExp(`'${k.replace(/\./g, '\\.')}':\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1] : null;
};
const appSetAll = (l, k, v) => {
  let n = 0;
  for (const f of APPS) {
    const b = blockOf(f, l); if (!b) continue;
    const blk = src[f].slice(b[0], b[1]);
    const re = new RegExp(`('${k.replace(/\./g, '\\.')}':\\s*)'((?:[^'\\\\]|\\\\.)*)'`);
    if (!re.test(blk)) continue;
    src[f] = src[f].slice(0, b[0]) + blk.replace(re, `$1'${v}'`) + src[f].slice(b[1]);
    n++;
  }
  return n;
};

const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join('|');
const changes = [], skipped = [], problems = [];

for (const lang of LANGS) {
  for (const [key, verdict] of Object.entries(DEC[lang] || {})) {
    if (key.startsWith('_') || verdict === 'web') continue;
    const cur = (reg[lang] || {})[key];
    let want;
    if (verdict === 'app') {
      want = appGet(APPS[0], lang, key) ?? appGet(APPS[1], lang, key);
      if (want == null) { skipped.push([lang, key, 'decision says adopt the app string, but the app has no such key']); continue; }
    } else want = verdict;
    if (cur == null) { skipped.push([lang, key, 'not present in the web dictionary']); continue; }
    if (cur === want) continue;
    // Placeholders are checked against the ENGLISH, which is the contract.
    const en = staticValue('en', key) || '';
    if (ph(en) !== ph(want)) { problems.push([lang, key, `placeholders: english ${ph(en) || 'none'}, chosen ${ph(want) || 'none'}`]); continue; }
    changes.push({ lang, key, from: cur, to: want, how: verdict === 'app' ? 'app' : 'explicit' });
  }
}

// Gujarati orthography, corpus-wide.
const orth = [];
for (const [key, v] of Object.entries(reg.gu || {})) {
  const to = v.replace(/ઑ/g, 'ઓ').replace(/ૉ/g, 'ો');
  if (to !== v) orth.push({ lang: 'gu', key, from: v, to, how: 'orthography(web)' });
}
let orthApp = 0;
for (const f of APPS) {
  const b = blockOf(f, 'gu'); if (!b) continue;
  const blk = src[f].slice(b[0], b[1]);
  orthApp += (blk.match(/[ઑૉ]/g) || []).length;
}

console.log(`key-level changes: ${changes.length}`);
console.log(`gujarati orthography: ${orth.length} web strings, ${orthApp} app occurrences`);
if (skipped.length) { console.log(`\nskipped (${skipped.length}):`); skipped.slice(0, 12).forEach((s) => console.log('  ' + s.join(' — '))); }
if (problems.length) { console.log(`\nPLACEHOLDER PROBLEMS (${problems.length}) — refused:`); problems.forEach((p) => console.log('  ' + p.join(' — '))); }

if (!process.argv.includes('--apply')) {
  console.log('\nsample:');
  for (const c of changes.slice(0, 8)) console.log(`  ${c.lang} ${c.key}\n     - ${c.from}\n     + ${c.to}`);
  console.log('\n(dry run — pass --apply to write)');
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) { console.log('\nrefusing to apply while placeholders disagree'); process.exit(1); }

const before = Object.fromEntries(LANGS.map((l) => [l, Object.keys(reg[l]).length]));
for (const c of changes) { reg[c.lang][c.key] = c.to; if (c.how === 'explicit') appSetAll(c.lang, c.key, c.to); }
for (const c of orth) reg.gu[c.key] = c.to;
for (const f of APPS) {
  const b = blockOf(f, 'gu'); if (!b) continue;
  src[f] = src[f].slice(0, b[0]) + src[f].slice(b[0], b[1]).replace(/ઑ/g, 'ઓ').replace(/ૉ/g, 'ો') + src[f].slice(b[1]);
}
for (const l of LANGS) { const o = {}; for (const k of Object.keys(reg[l]).sort()) o[k] = reg[l][k]; reg[l] = o; }
for (const l of LANGS) if (Object.keys(reg[l]).length !== before[l]) { console.log('REFUSING: key count changed for ' + l); process.exit(1); }
fs.writeFileSync(REGP, JSON.stringify(reg, null, 2) + '\n', 'utf8');
for (const f of APPS) fs.writeFileSync(path.join(ROOT, f), src[f], 'utf8');
console.log(`\napplied ${changes.length} key-level changes + ${orth.length} orthography`);
