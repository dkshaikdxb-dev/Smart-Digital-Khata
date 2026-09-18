// Does the registry gate actually refuse things, or does it only say OK?
//
// A gate is a claim about what cannot happen. The only way to know the claim
// holds is to make the thing happen and watch it get refused. This copies the
// dictionaries to a throwaway directory, breaks them one way at a time, and
// asserts the gate fails with the right rule each time.
//
// It exists because the first version of that gate passed its own repo cleanly
// while being unable to see half of the app: it merged the two mobile
// dictionaries and kept whichever value it read first, so a LOCKED value could
// drift in mobile-app/src/i18n.js and the gate would read the consumer copy and
// report OK. Nothing in a green run said so. Case 2 below is that bug.
//
// No dependencies, run directly: node scripts/i18n-registry-check.test.mjs
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GATE = path.join(ROOT, 'scripts/i18n-registry-check.mjs');
const FILES = [
  'scripts/i18n-decisions.json',
  'scripts/keylevel-decisions.json',
  'backend/src/data/regional-i18n.json',
  'admin-dashboard/src/lib/i18n.js',
  'mobile-app/src/consumer/i18n.js',
  'mobile-app/src/i18n.js',
];
const CONSUMER = 'mobile-app/src/consumer/i18n.js';
const OWNER = 'mobile-app/src/i18n.js';

const box = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-gate-'));
for (const rel of FILES) {
  const dest = path.join(box, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dest);
}
const pristine = Object.fromEntries(FILES.map((rel) => [rel, fs.readFileSync(path.join(box, rel), 'utf8')]));
const restore = () => { for (const [rel, s] of Object.entries(pristine)) fs.writeFileSync(path.join(box, rel), s, 'utf8'); };

function gate() {
  try {
    execFileSync('node', [GATE], { encoding: 'utf8', env: { ...process.env, I18N_ROOT: box }, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: '' };
  } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; }
}
const webSet = (lang, key, v) => {
  const p = path.join(box, 'backend/src/data/regional-i18n.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j[lang][key] = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
};
const appSet = (rel, lang, key, v) => {
  const p = path.join(box, rel);
  const s = fs.readFileSync(p, 'utf8');
  const a = s.indexOf(`\nconst ${lang} = {`);
  if (a < 0) throw new Error(`no ${lang} block in ${rel}`);
  const b = s.indexOf('\nconst ', a + 10);
  const end = b > 0 ? b : s.length;
  const blk = s.slice(a, end);
  const re = new RegExp(`('${key.replace(/\./g, '\\.')}':\\s*)'((?:[^'\\\\]|\\\\.)*)'`);
  if (!re.test(blk)) throw new Error(`no ${lang} ${key} in ${rel}`);
  fs.writeFileSync(p, s.slice(0, a) + blk.replace(re, `$1'${v}'`) + s.slice(end), 'utf8');
};
const editRegistry = (fn) => {
  const p = path.join(box, 'scripts/i18n-decisions.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  fn(j);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
};

// Gujarati strings used below, by codepoint so this file stays readable in any editor.
const GU = {
  cancelledInflected: 'રદ થયો',
  preparingAgreeing: 'તૈયાર થઈ રહ્યો છે',
  massAddProduct: 'સામાન ઉમેરો',
  deprecatedProduct: 'ઉત્પાદન ઉમેરો',
  outForDeliveryNeuter: 'ડિલિવરી માટે નીકળ્યું',
};

const cases = [
  // --- both mobile dictionaries are covered, independently -----------------
  ['LOCKED drift in the OWNER dictionary alone is caught',
   () => appSet(OWNER, 'gu', 'ostatus.cancelled', GU.cancelledInflected), 'gu-status-form', 'app/owner'],

  ['LOCKED drift in the CONSUMER dictionary alone is caught',
   () => appSet(CONSUMER, 'gu', 'ostatus.cancelled', GU.cancelledInflected), 'gu-status-form', 'app/consumer'],

  ['LOCKED drift in the OWNER dictionary is caught for Marathi too',
   () => appSet(OWNER, 'mr', 'ostatus.pending', 'प्रलंबित'), 'mr-status-register', 'app/owner'],

  ['REVIEW row changed in the OWNER dictionary alone is caught',
   () => appSet(OWNER, 'gu', 'ostatus.out_for_delivery', GU.outForDeliveryNeuter), 'gu-out-for-delivery-form', 'app/owner'],

  // --- product-item scope comes from the ENGLISH, not from the key list ----
  ['a countable-item key that is NOT in product-item.values still fails',
   () => appSet(OWNER, 'gu', 'cat.addProduct', GU.massAddProduct), 'countable in English', 'app/owner'],

  ['the deprecated product word cannot come back',
   () => appSet(OWNER, 'gu', 'cat.addProduct', GU.deprecatedProduct), 'deprecated term', 'app/owner'],

  ['a declared mass-key exception is load-bearing: remove it and the gate fires',
   () => editRegistry((j) => { delete j.decisions['product-item'].scope.mass_keys['coedit.cash']; }), 'coedit.cash', null],

  // --- everything the previous suite already proved, still proved ----------
  ['LOCKED cannot drift on the web',
   () => webSet('gu', 'set.noKeySecret', 'Key secret નથી'), 'razorpay-casing', null],

  ['REVIEW cannot be overwritten on the web',
   () => webSet('gu', 'status.accepted', 'સ્વીકાર્યું'), 'gu-accepted-wording', null],

  ['INTENTIONAL_DIVERGENCE cannot be reconciled from the web side',
   () => webSet('gu', 'stmt.title', 'ખાતાનું વિવરણ'), 'divergences', null],

  ['INTENTIONAL_DIVERGENCE cannot be reconciled from the app side',
   () => appSet(OWNER, 'gu', 'cat.loadMore', 'વધુ લોડ કરો'), 'divergences', null],

  ['UNDECIDED cannot be auto-reconciled',
   () => webSet('bn', 'ostatus.completed', 'সম্পূর্ণ'), 'divergences', null],

  ['a NEW divergence must be recorded before it ships',
   () => webSet('gu', 'ostatus.ready', 'તૈયાર છે'), 'divergences', null],

  ['gu orthography holds as a corpus invariant, not a token list',
   () => { webSet('gu', 'cat.loadMore', 'બ્રૉડકાસ્ટ');
           webSet('gu', 'cat.myRange', 'બ્રોડકાસ્ટ'); }, 'gu-orthography', null],

  ['a protected brand term cannot be re-cased inside a sentence',
   () => webSet('bn', 'set.noKeySecret', 'key secret নেই'), 'brand-registry-split', null],

  ['native digits cannot come back',
   () => webSet('gu', 'cat.loadMore', 'વધુ ૧ લોડ કરો'), 'native-digits-latin', null],

  // --- REVIEW is now pinned per surface and per language -------------------
  // Before the snapshot these were unenforceable: the registry recorded a value
  // for two decisions out of eight, and for none of the 36 machine-authored FAQ
  // translations. Each case below passed silently until 2026-09-18.
  ['a machine-authored FAQ translation cannot be rewritten (te)',
   () => appSet(CONSUMER, 'te', 'chelp.e9.a', 'ఏదో మారింది'), 'consumer-faq-app-variants', 'app/consumer'],

  ['the same, in a language the divergence guard never compared (ml)',
   () => appSet(CONSUMER, 'ml', 'chelp.e1.a', 'എന്തോ മാറി'), 'consumer-faq-app-variants', 'app/consumer'],

  ['the APPROVED English source of a REVIEW decision is pinned too',
   () => appSet(CONSUMER, 'en', 'chelp.e9.q', 'Can I change the theme?'), 'consumer-faq-app-variants', 'app/consumer'],

  ['a parked Urdu WhatsApp string cannot be quietly Latinised',
   () => appSet(CONSUMER, 'ur', 'login.otpHint', 'WhatsApp'), 'whatsapp-latin-urdu', 'app/consumer'],

  ['a parked ta/te/kn/ml/ur credential string cannot be changed',
   () => webSet('ta', 'set.noKeySecret', 'Key Secret illai'), 'razorpay-casing-other-languages', 'web'],

  ['a native-speaker-queue row cannot be resolved by a tool',
   () => webSet('bn', 'c.pay', 'পে করুন'), 'native-speaker-queue', 'web'],

  ['deleting a REVIEW row is caught, not only changing it',
   () => { const p = path.join(box, CONSUMER); const s2 = fs.readFileSync(p, 'utf8');
           fs.writeFileSync(p, s2.replace(/\n\s*'chelp\.e9\.q': '[^']*',/, ''), 'utf8'); },
   'REVIEW row disappeared', null],

  // --- divergence coverage now spans every web language --------------------
  // ta/te/kn/ml/ur were never compared before 2026-09-18, so both of these
  // passed silently: 191 pairs in those five could converge or appear unseen.
  ['an UNDECIDED row in a NEWLY covered language cannot be reconciled (te)',
   // te common.balance is web "nilva" / app "bakaayi" and nobody has ruled.
   // Making the web match the app is exactly the auto-reconciliation the
   // registry forbids.
   () => { const p2 = path.join(box, CONSUMER); const src = fs.readFileSync(p2, 'utf8');
           const a = src.indexOf("\nconst te = {"), b = src.indexOf('\nconst ', a + 10);
           const m = src.slice(a, b).match(/'common\.balance':\s*'((?:[^'\\]|\\.)*)'/);
           webSet('te', 'common.balance', m[1]); },
   'divergences', null],

  ['a NEW divergence in a newly covered language must be recorded (kn)',
   // kn stmt.title agrees on both surfaces today, so changing one side creates
   // a divergence that appears in no decision.
   () => webSet('kn', 'stmt.title', 'ಬದಲಾದ ಶೀರ್ಷಿಕೆ'), 'divergences', null],
];

let pass = 0, fail = 0;
const base = gate();
if (!base.ok) { console.error('the untouched copy does not pass the gate — nothing below means anything\n' + base.out); process.exit(1); }
console.log('baseline: the untouched copy passes\n');

for (const [name, mutate, expectRule, expectWhere] of cases) {
  restore();
  try { mutate(); } catch (e) { console.log(`  SETUP FAILED  ${name}\n                ${e.message}`); fail++; continue; }
  const r = gate();
  const hitRule = !r.ok && r.out.includes(expectRule);
  const hitWhere = !expectWhere || r.out.includes(expectWhere);
  if (hitRule && hitWhere) { pass++; console.log(`  refused   ${name}`); }
  else {
    fail++;
    console.log(`  *** ALLOWED ***  ${name}`);
    console.log(`                   expected "${expectRule}"${expectWhere ? ` reported against ${expectWhere}` : ''}`);
    console.log(`                   gate said: ${r.ok ? 'OK' : r.out.split('\n').filter(Boolean).slice(0, 4).join(' / ')}`);
  }
}
restore();
if (!gate().ok) { console.error('\nthe copy did not restore cleanly'); fail++; }
fs.rmSync(box, { recursive: true, force: true });

console.log(`\n${pass} refused, ${fail} allowed.`);
if (fail) { console.error('the gate does not refuse everything it claims to.'); process.exit(1); }
console.log('Every rule the registry claims to enforce was proven by breaking it.');
