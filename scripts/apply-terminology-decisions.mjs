// Apply the owner's cross-language terminology decisions.
//
// Each decision is SCOPED by what the English says, not by finding the word and
// replacing it. That distinction is the whole job here: of the nine strings
// whose translation contains the word for "list", only three are about the
// catalogue. The rest say "List my shop so nearby customers can find you" and
// "hidden from lists". A term swap would have written "catalogue" into all of
// them.
//
// Preview by default. --apply writes. Two decisions are deliberately NOT
// implemented and are reported instead: #4 product/item and #6
// balance/outstanding were not answered.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const LANGS = ['bn', 'gu', 'mr'];

const reg = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const appSrc = Object.fromEntries(APPS.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
function appBlock(file, lang) {
  const s = appSrc[file];
  const m = s.match(new RegExp(`\\nconst ${lang} = \\{`));
  if (!m) return null;
  const start = m.index;
  const next = s.indexOf('\nconst ', start + 10);
  return [start, next > 0 ? next : s.length];
}
function appGet(file, lang, key) {
  const b = appBlock(file, lang); if (!b) return null;
  const blk = appSrc[file].slice(b[0], b[1]);
  const m = blk.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'((?:[^'\\\\]|\\\\.)*)'`));
  return m ? m[1] : null;
}
function appSet(file, lang, key, value) {
  const b = appBlock(file, lang); if (!b) return false;
  const blk = appSrc[file].slice(b[0], b[1]);
  const re = new RegExp(`('${key.replace(/\./g, '\\.')}':\\s*)'((?:[^'\\\\]|\\\\.)*)'`);
  if (!re.test(blk)) return false;
  appSrc[file] = appSrc[file].slice(0, b[0]) + blk.replace(re, `$1'${value}'`) + appSrc[file].slice(b[1]);
  return true;
}

const changes = [];   // {decision, lang, surface, key, from, to, file?}
const notes = [];
const push = (decision, lang, surface, key, from, to, file) => {
  if (from == null || from === to) return;
  changes.push({ decision, lang, surface, key, from, to, file });
};
const enOf = (k) => (staticValue('en', k) || '').trim();
const everyKey = [...new Set(LANGS.flatMap((l) => Object.keys(reg[l] || {})))];

/* 1. PREPAID — name the mechanism. */
{
  const T = { bn: 'অনলাইন', gu: 'ઓનલાઇન', mr: 'ऑनलाइन' };
  for (const key of ['c.prepaid', 'pmode.prepaid']) {
    for (const l of LANGS) push('1 prepaid', l, 'web', key, (reg[l] || {})[key], T[l]);
  }
}

/* 2. CATALOGUE — the loanword, ONLY where the English says catalog. */
{
  const T = { bn: 'ক্যাটালগ', gu: 'કૅટલૉગ', mr: 'कॅटलॉग' };
  const LIST = { bn: /তালিকা/g, gu: /યાદી/g, mr: /यादी/g };
  const keys = everyKey.filter((k) => /catalog/i.test(enOf(k)));
  notes.push(`catalogue: ${keys.length} keys whose ENGLISH says catalog — ${keys.join(', ')}`);
  for (const l of LANGS) {
    for (const key of keys) {
      const cur = (reg[l] || {})[key];
      if (cur) push('2 catalogue', l, 'web', key, cur, cur.replace(LIST[l], T[l]));
      for (const f of APPS) {
        const a = appGet(f, l, key);
        if (a) push('2 catalogue', l, 'app', key, a, a.replace(LIST[l], T[l]), f);
      }
    }
    // the app's own catalogue tab, which has no web twin
    for (const f of APPS) {
      const a = appGet(f, l, 'tab.catalog');
      if (a) push('2 catalogue', l, 'app', 'tab.catalog', a, a.replace(LIST[l], T[l]), f);
    }
  }
}

/* 3. RAZORPAY — Latin, and no parenthetical gloss. */
{
  const T = { 'set.razorpayKeyId': 'Razorpay Key ID', 'set.keySecret': 'Key Secret', 'set.webhookSecret': 'Webhook Secret' };
  for (const [key, val] of Object.entries(T)) for (const l of LANGS) push('3 razorpay', l, 'web', key, (reg[l] || {})[key], val);
  // The status strings keep their own sentence; only the TERM becomes Latin.
  const NO = {
    'set.noKeySecret':     { bn: 'Key Secret নেই', gu: 'Key Secret નથી', mr: 'Key Secret नाही' },
    'set.noWebhookSecret': { bn: 'Webhook Secret নেই', gu: 'Webhook Secret નથી', mr: 'Webhook Secret नाही' },
  };
  for (const [key, per] of Object.entries(NO)) for (const l of LANGS) push('3 razorpay', l, 'web', key, (reg[l] || {})[key], per[l]);
}

/* 5. UNIT — the counter, but ONLY where the English means a selling unit.
      The owner's rule reserves the abstract word for measurement dimensions,
      and cat.unitPlaceholder is exactly that: "Unit (kg, piece…)" asks the
      shopkeeper which dimension they sell in. It is left alone. */
{
  const T = { bn: 'টি', gu: 'નંગ', mr: 'नग' };
  const LIT = { bn: /একক/g, gu: /એકમ/g, mr: /एकक/g };
  const counterKeys = ['c.unit', 'common.unit'];
  for (const l of LANGS) {
    if (!T[l]) continue;
    for (const key of counterKeys) {
      const cur = (reg[l] || {})[key];
      if (cur) push('5 unit', l, 'web', key, cur, cur.replace(LIT[l], T[l]));
    }
  }
  notes.push('unit: cat.unitPlaceholder and ord.unitPrice NOT changed — "Unit (kg, piece…)" and "Unit price" are the measurement sense the decision reserves the abstract word for.');
  notes.push('unit: Bengali resolved to টি by the follow-up decision.');
}

/* 6. BALANCE vs OUTSTANDING — decided as a PAIR so the two can never collide.
      Bengali already satisfies the rule (ব্যালেন্স vs বাকি) and is untouched. */
{
  const BAL = { gu: 'બેલેન્સ', mr: 'शिल्लक' };
  const OUT = { gu: 'બાકી રકમ', mr: 'उधारी' };
  for (const l of ['gu', 'mr']) {
    push('6 balance/outstanding', l, 'web', 'common.balance', (reg[l] || {})['common.balance'], BAL[l]);
    push('6 balance/outstanding', l, 'web', 'common.outstanding', (reg[l] || {})['common.outstanding'], OUT[l]);
    for (const f of APPS) {
      for (const [key, val] of [['common.balance', BAL[l]], ['common.outstanding', OUT[l]]]) {
        const a = appGet(f, l, key); if (a) push('6 balance/outstanding', l, 'app', key, a, val, f);
      }
    }
  }
  // A collision check on the result, since that is the whole point of the pair.
  for (const l of ['gu', 'mr']) if (BAL[l] === OUT[l]) throw new Error('balance and outstanding collide in ' + l);
}

/* 8. STATUS CHIPS — bare, uninflected. 'Cancelled' is ALREADY bare in both
      languages (રદ / रद्द), so only 'Accepted' changes. */
{
  const ACC = { gu: 'સ્વીકારેલ', mr: 'स्वीकृत' };
  for (const l of ['gu', 'mr']) {
    for (const key of ['ostatus.accepted', 'dash.orderStatus.accepted']) {
      push('8 status', l, 'web', key, (reg[l] || {})[key], ACC[l]);
      for (const f of APPS) { const a = appGet(f, l, key); if (a) push('8 status', l, 'app', key, a, ACC[l], f); }
    }
  }
  notes.push('8 status: સ્વીકારેલ and स्वीकृत appear in NEITHER surface today — they are new words the decision introduces, not a choice between two existing ones. Applied on the owner\'s explicit instruction, given twice; no native speaker has read them.');
  notes.push('8 status: TWO MORE CHIPS have the same inflection and were NOT named — out_for_delivery (ડિલિવરી માટે નીકળ્યું / डिलिव्हरीसाठी निघाले) and preparing (તૈયાર થાય છે / तयार होत आहे). Left alone rather than invented.');
}

/* 9. WHATSAPP — Latin everywhere. The postposition differs per language and is
      preserved: Bengali attaches -এ, Marathi -वर, Gujarati writes પર apart. */
{
  const SUB = {
    bn: [[/হোয়াটসঅ্যাপে/g, 'WhatsApp-এ'], [/হোয়াটসঅ্যাপ/g, 'WhatsApp']],
    gu: [[/વોટ્સએપ/g, 'WhatsApp'], [/વ્હોટ્સએપ/g, 'WhatsApp']],
    mr: [[/व्हॉट्सअॅपवर/g, 'WhatsApp वर'], [/व्हॉट्सॲपवर/g, 'WhatsApp वर'], [/व्हॉट्सअॅप/g, 'WhatsApp'], [/व्हॉट्सॲप/g, 'WhatsApp']],
  };
  for (const l of LANGS) {
    const apply = (s) => SUB[l].reduce((acc, [re, to]) => acc.replace(re, to), s);
    for (const [key, v] of Object.entries(reg[l] || {})) push('9 whatsapp', l, 'web', key, v, apply(v));
    for (const f of APPS) {
      const b = appBlock(f, l); if (!b) continue;
      const blk = appSrc[f].slice(b[0], b[1]);
      for (const m of blk.matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) push('9 whatsapp', l, 'app', m[1], m[2], apply(m[2]), f);
    }
  }
}

/* 10. AMOUNT — the word for amount, not for money. */
{
  const T = { bn: 'পরিমাণ (₹)', gu: 'રકમ (₹)', mr: 'रक्कम (₹)' };
  for (const l of LANGS) {
    for (const f of APPS) {
      for (const key of ['shopkhata.amountRupees', 'common.amountRs']) {
        const a = appGet(f, l, key);
        if (a) push('10 amount', l, 'app', key, a, T[l], f);
      }
    }
    push('10 amount', l, 'web', 'common.amountRs', (reg[l] || {})['common.amountRs'], T[l]);
  }
}

/* 7 and 8 are reported, not applied — see the summary. */
notes.push('7 pay: the CTA/label split is already correct in every string checked (c.pay imperative, c.payment noun) EXCEPT gu/mr c.payOnline, handled below.');
{
  const T = { gu: 'ઓનલાઇન ચૂકવો', mr: 'ऑनलाइन भरा' };
  for (const l of ['gu', 'mr']) {
    for (const f of APPS) { const a = appGet(f, l, 'c.payOnline') ?? appGet(f, l, 'pay.payOnline'); if (a) push('7 pay', l, 'app', 'pay.payOnline', a, T[l], f); }
  }
}

notes.push('4 product/item: still NOT answered, so NOT touched.');

/* ------------------------------------------------------------------ output */
const byDecision = {};
for (const c of changes) (byDecision[c.decision] ||= []).push(c);
console.log(`proposed changes: ${changes.length}\n`);
for (const [d, list] of Object.entries(byDecision)) {
  console.log(`--- ${d} — ${list.length} ---`);
  for (const c of list.slice(0, process.argv.includes('--full') ? 999 : 6)) {
    console.log(`  ${c.lang} ${c.surface.padEnd(3)} ${c.key}`);
    console.log(`     - ${c.from}`);
    console.log(`     + ${c.to}`);
  }
  if (list.length > 6 && !process.argv.includes('--full')) console.log(`  … ${list.length - 6} more`);
}
console.log('\nNOTES');
for (const n of notes) console.log('  * ' + n);

if (process.argv.includes('--apply')) {
  const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join('|');
  const bad = changes.filter((c) => ph(c.from) !== ph(c.to));
  if (bad.length) { console.log('\nREFUSING — placeholder drift:'); bad.forEach((c) => console.log('  ' + c.key)); process.exit(1); }
  for (const c of changes) {
    if (c.surface === 'web') reg[c.lang][c.key] = c.to;
    else if (!appSet(c.file, c.lang, c.key, c.to)) { console.log('FAILED to write ' + c.key); process.exit(1); }
  }
  for (const l of LANGS) { const o = {}; for (const k of Object.keys(reg[l]).sort()) o[k] = reg[l][k]; reg[l] = o; }
  fs.writeFileSync(REGP, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  for (const f of APPS) fs.writeFileSync(path.join(ROOT, f), appSrc[f], 'utf8');
  console.log(`\napplied ${changes.length} changes`);
}
