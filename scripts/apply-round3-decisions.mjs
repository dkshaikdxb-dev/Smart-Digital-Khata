// Round three of the owner's terminology decisions, including three reversals.
//
// THE ORTHOGRAPHY REVERSAL CANNOT BE DONE AS A SUBSTITUTION. The forward pass
// (ઑ -> ઓ) was safe because candra-O appears only in English loanwords. The
// reverse is NOT: plain ઓ/ો occurs 1,076 times in ordinary Gujarati — ફોન,
// પ્રોફાઇલ, લોડ, કરો — and a blanket swap would corrupt every one of them.
//
// So the reversal is TOKEN-level, and the authority is the corpus as it stood
// before the forward pass: 21 distinct words were historically spelled with
// candra-O, and only those 21 get it back.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const LANGS = ['bn', 'gu', 'mr'];

const reg = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const src = Object.fromEntries(APPS.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const blockOf = (f, l) => {
  const m = src[f].match(new RegExp(`\\nconst ${l} = \\{`));
  if (!m) return null;
  const nx = src[f].indexOf('\nconst ', m.index + 10);
  return [m.index, nx > 0 ? nx : src[f].length];
};
const mapBlock = (l, fn) => {
  for (const f of APPS) {
    const b = blockOf(f, l); if (!b) continue;
    src[f] = src[f].slice(0, b[0]) + fn(src[f].slice(b[0], b[1])) + src[f].slice(b[1]);
  }
};
const counts = {};
const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };

/* 1. GUJARATI ORTHOGRAPHY — back to candra-O, token by token. */
{
  const CAND = JSON.parse(fs.readFileSync('/tmp/candra-tokens.json', 'utf8'))
    .map((t) => [t.replace(/ઑ/g, 'ઓ').replace(/ૉ/g, 'ો'), t])
    .filter(([plain, cand]) => plain !== cand)
    .sort((a, b) => b[0].length - a[0].length);   // longest first, so લોગિન is not eaten by લોગ
  const restore = (s) => CAND.reduce((acc, [plain, cand]) => acc.split(plain).join(cand), s);
  for (const [k, v] of Object.entries(reg.gu)) { const t = restore(v); if (t !== v) { reg.gu[k] = t; bump('gu orthography (web)'); } }
  mapBlock('gu', (blk) => { const t = restore(blk); if (t !== blk) bump('gu orthography (app)'); return t; });
}

/* 2. RAZORPAY — capital S, reversing the lower-case form from the last round. */
{
  const T = {
    'set.keySecret': { bn: 'Key Secret', gu: 'Key Secret', mr: 'Key Secret' },
    'set.webhookSecret': { bn: 'Webhook Secret', gu: 'Webhook Secret', mr: 'Webhook Secret' },
    'set.noKeySecret': { bn: 'Key Secret নেই', gu: 'Key Secret નથી', mr: 'Key Secret नाही' },
    'set.noWebhookSecret': { bn: 'Webhook Secret নেই', gu: 'Webhook Secret નથી', mr: 'Webhook Secret नाही' },
  };
  for (const [key, per] of Object.entries(T)) for (const l of LANGS) {
    if (reg[l]?.[key] != null && reg[l][key] !== per[l]) { reg[l][key] = per[l]; bump('razorpay'); }
  }
  // and inside the app, where the lower-case form was written
  for (const l of LANGS) mapBlock(l, (b) => b.replace(/Key secret/g, 'Key Secret').replace(/Webhook secret/g, 'Webhook Secret'));
}

/* 3. STATUS — Gujarati back to the bare participle. Third statement of this
      one; the intervening breakdown had asked for the inflected સ્વીકાર્યો. */
{
  for (const key of ['ostatus.accepted', 'dash.orderStatus.accepted']) {
    if (reg.gu[key] !== 'સ્વીકારેલ') { reg.gu[key] = 'સ્વીકારેલ'; bump('gu status'); }
    if (reg.mr[key] !== 'स्वीकृत') { reg.mr[key] = 'स्वीकृत'; bump('mr status'); }
  }
  mapBlock('gu', (b) => b.replace(/'સ્વીકાર્યો'/g, "'સ્વીકારેલ'"));
  mapBlock('mr', (b) => b.replace(/'स्वीकारले'/g, "'स्वीकृत'"));
}

/* 4. PRODUCT WORD — gu વસ્તુ, mr वस्तू. Deprecates ઉત્પાદન / उत्पादन. સામાન is
      kept only where the English is a bulk/collective noun, per the decision. */
{
  const SUB = {
    gu: [[/ઉત્પાદનો/g, 'વસ્તુઓ'], [/ઉત્પાદન/g, 'વસ્તુ']],
    mr: [[/उत्पादने/g, 'वस्तू'], [/उत्पादनां/g, 'वस्तूं'], [/उत्पादन/g, 'वस्तू']],
  };
  for (const l of ['gu', 'mr']) {
    const f = (s) => SUB[l].reduce((a, [re, to]) => a.replace(re, to), s);
    for (const [k, v] of Object.entries(reg[l])) { const t = f(v); if (t !== v) { reg[l][k] = t; bump(l + ' product word'); } }
    mapBlock(l, f);
  }
}

/* 5. Two explicit strings the decision supplied. */
{
  const EX = [['bn', 'c.deliverTo', 'যেখানে ডেলিভারি হবে'], ['mr', 'c.locationNotSet', 'लोकेशन सेट केलेले नाही']];
  for (const [l, k, v] of EX) if (reg[l]?.[k] != null && reg[l][k] !== v) { reg[l][k] = v; bump('explicit string'); }
}

/* 6. NATIVE DIGITS — the out-of-queue sweep, all three languages, both
      surfaces. A code-length hint in ४ on a screen whose keypad gives 4. */
{
  const D = { bn: 0x09E6, gu: 0x0AE6, mr: 0x0966 };
  const sweep = (l) => (s) => [...s].map((c) => {
    const cp = c.codePointAt(0);
    return (cp >= D[l] && cp <= D[l] + 9) ? String(cp - D[l]) : c;
  }).join('');
  for (const l of LANGS) {
    const f = sweep(l);
    for (const [k, v] of Object.entries(reg[l])) { const t = f(v); if (t !== v) { reg[l][k] = t; bump(l + ' native digits (web)'); } }
    mapBlock(l, (b) => { const t = f(b); if (t !== b) bump(l + ' native digits (app)'); return t; });
  }
}

/* ------------------------------------------------------------------ verify */
const before = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
// {s} glued to a word — "{n} item{s}" — is the ENGLISH plural suffix, and these
// languages do not mark plurals with one. Dropping it is the correct
// translation, decided earlier; a standalone {s} is a status word and must
// survive. Same rule as scripts/web-i18n-verify.mjs.
const droppable = (en) => (/\w\{s\}/.test(en) ? new Set(['{s}']) : new Set());
let broke = 0;
for (const l of LANGS) for (const [k, v] of Object.entries(reg[l])) {
  const en = staticValue('en', k) || '';
  const opt = droppable(en);
  const want = ph(en).filter((x) => !opt.has(x)).join('|');
  const got = ph(v).filter((x) => !opt.has(x)).join('|');
  if (want !== got) { console.log('PLACEHOLDER BREAK ' + l + ' ' + k + '  en=' + ph(en).join(' ') + ' got=' + ph(v).join(' ')); broke++; }
  if (Object.keys(before[l]).length !== Object.keys(reg[l]).length) { console.log('KEY COUNT CHANGED ' + l); broke++; }
}
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
if (broke) { console.log('\nREFUSING — ' + broke + ' problem(s)'); process.exit(1); }

if (!process.argv.includes('--apply')) { console.log('\n(dry run — pass --apply to write)'); process.exit(0); }
for (const l of LANGS) { const o = {}; for (const k of Object.keys(reg[l]).sort()) o[k] = reg[l][k]; reg[l] = o; }
fs.writeFileSync(REGP, JSON.stringify(reg, null, 2) + '\n', 'utf8');
for (const f of APPS) fs.writeFileSync(path.join(ROOT, f), src[f], 'utf8');
console.log('\napplied');
