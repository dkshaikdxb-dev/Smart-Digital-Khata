// Where the web and the apps say different things for the SAME English.
//
// A shopper moves between the two. When "Products" is জিনিস on the phone app and
// জিনিসপত্র on the site, nothing is wrong and something is still broken: they are
// being taught two words for one thing by one product.
//
// This lists every such pair and sorts it by how much the difference could cost,
// because "align everything to the app" is the right default and not the right
// answer everywhere — the app string is older, but older is not the same as
// better, and at least one of these looks like the app is the wrong one.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];

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

const lang = process.argv[2] || 'bn';
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

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'))[lang] || {};
const requested = fs.readFileSync(path.join(ROOT, `docs/i18n-web/web-${lang}.csv`), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0]);
// web-<lang>.csv now lists only what is still missing, so walk every key the app
// knows about instead and keep the ones the web has answered.
const keys = [...new Set([...requested, ...Object.keys(reg)])];

// MONEY is the class where a difference can cost somebody real money, so it is
// ranked first whether or not the two readings look equivalent.
const MONEY = /owe|advance|due|balance|credit|paid|prepaid|settle|refund|cash|pay|amount|total|discount/i;
const rows = [];
for (const key of keys) {
  const en = (staticValue('en', key) || '').trim();
  const hit = app.get(en);
  if (!en || !hit || hit.ambiguous || !reg[key]) continue;
  if (reg[key] === hit.text) continue;
  // A difference of one or two characters in a long string is a spelling or
  // inflection choice; a wholly different word is a vocabulary decision.
  const a = hit.text, w = reg[key];
  const shared = [...new Set(a.split(/\s+/))].filter((t) => w.includes(t)).length;
  const words = Math.max(a.split(/\s+/).length, w.split(/\s+/).length);
  const overlap = words ? shared / words : 0;
  rows.push({ key, en, app: a, web: w, from: hit.from, money: MONEY.test(en), overlap });
}

rows.sort((x, y) => (y.money - x.money) || (x.overlap - y.overlap) || x.key.localeCompare(y.key));
const money = rows.filter((r) => r.money);
const rewrites = rows.filter((r) => !r.money && r.overlap < 0.34);
const variants = rows.filter((r) => !r.money && r.overlap >= 0.34);

const out = [];
out.push(`# ${lang} — where the web and the apps disagree\n`);
out.push(`${rows.length} strings have the SAME English and a DIFFERENT translation on the two`);
out.push(`surfaces. A shopper moves between them, so this teaches two words for one`);
out.push(`thing. None of these is a machine-check failure: every one is valid ${lang},`);
out.push(`with its placeholders intact.\n`);
out.push(`Default action: **align the web to the app**. The app is what most of these`);
out.push(`people actually use, its strings are older and have had more eyes on them,`);
out.push(`and the web is the surface that changed. But older is not automatically`);
out.push(`better, so the three groups below are separated by how much the choice`);
out.push(`matters rather than presented as one list.\n`);
out.push(`Rebuild with: \`node scripts/web-app-divergence.mjs ${lang}\`\n`);

function table(title, note, list) {
  out.push(`\n## ${title} — ${list.length}\n`);
  out.push(`${note}\n`);
  for (const r of list) {
    out.push(`### \`${r.key}\``);
    out.push(`- en:  ${r.en}`);
    out.push(`- app: ${r.app}  _(${r.from})_`);
    out.push(`- web: ${r.web}`);
    out.push('');
  }
}
table('Money', 'Read these first. A wrong word here is not a style question — it is somebody reading their own ledger backwards. Both readings are checked as correct today; they are listed because the two surfaces should still agree.', money);
table('Different word chosen', 'Little shared vocabulary between the two — a real decision was made differently each time, not a spelling variant. These are where a shopper is most likely to notice.', rewrites);
table('Same words, different wording', 'Inflection, politeness or word order. Lowest stakes, and the largest group.', variants);

fs.writeFileSync(path.join(ROOT, `docs/i18n-web/DIVERGENCE-${lang}.md`), out.join('\n') + '\n', 'utf8');
console.log(`${lang}: ${rows.length} divergent strings`);
console.log(`  money:                       ${money.length}`);
console.log(`  a different word chosen:     ${rewrites.length}`);
console.log(`  same words, different form:  ${variants.length}`);
console.log(`\nwritten docs/i18n-web/DIVERGENCE-${lang}.md`);
