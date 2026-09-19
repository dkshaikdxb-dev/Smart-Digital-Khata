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
// Delete a key from ONE language block. The blunt global replace used for the
// chelp.e9.q case below hits whichever block comes first, which is fine there
// and wrong here: these keys exist in several languages and only one is pinned.
const appDelete = (rel, lang, key) => {
  const p = path.join(box, rel);
  const s = fs.readFileSync(p, 'utf8');
  const a = s.indexOf(`\nconst ${lang} = {`);
  if (a < 0) throw new Error(`no ${lang} block in ${rel}`);
  const b = s.indexOf('\nconst ', a + 10);
  const end = b > 0 ? b : s.length;
  const blk = s.slice(a, end);
  const re = new RegExp(`\\n\\s*'${key.replace(/\./g, '\\.')}':\\s*'(?:[^'\\\\]|\\\\.)*',`);
  if (!re.test(blk)) throw new Error(`no ${lang} ${key} in ${rel}`);
  fs.writeFileSync(p, s.slice(0, a) + blk.replace(re, '') + s.slice(end), 'utf8');
};
const editRegistry = (fn) => {
  const p = path.join(box, 'scripts/i18n-decisions.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  fn(j);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n', 'utf8');
};

// Strings used below, by codepoint so this file stays readable in any editor.
const BN = {
  // The cancel word, as bn already writes it in ostatus.cancelled — the exact
  // conflation reject-not-cancel exists to prevent, not a new translation.
  cancelWord: 'বাতিল',
};
const MR = {
  // The mr chelp.e7.a sentence with the approve-word swapped for the accept-word
  // the ostatus.accepted chip uses. Every other word is the live string.
  e7CollapsedToAccept: 'ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबितपासून स्वीकारले, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते.',
  // A revision that changes the prose but keeps the approve-word: permitted by
  // approve-not-accept, still refused by the REVIEW owner of the string.
  e7RevisedKeepingApprove: 'ऑर्डर टॅब उघडा. प्रत्येक ऑर्डर प्रलंबितपासून मंजूर, मग तयार किंवा पूर्ण होते.',
};
const GU = {
  e7CollapsedToAccept: 'ઑર્ડર ટૅબ ખોલો અને દરેક ઑર્ડરને પેન્ડિંગથી સ્વીકારેલ, પછી તૈયાર કે પૂરો થતો જુઓ. દરેક પગલે તમને અપડેટ મળે છે.',
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
   // dash.orderStatus.accepted, not status.accepted: the latter turned out to be
   // LOCKED by gu-status-form as well, and a row may now hold only one status.
   () => webSet('gu', 'dash.orderStatus.accepted', 'સ્વીકાર્યું'), 'gu-accepted-wording', null],

  ['a row that moved from REVIEW to LOCKED is still refused, under the LOCKED decision',
   () => webSet('gu', 'status.accepted', 'સ્વીકાર્યું'), 'gu-status-form', null],

  ['INTENTIONAL_DIVERGENCE cannot be reconciled from the web side',
   // ord.cancelConfirm: the two surfaces differ because their ENGLISH differs —
   // the owner app's says "This cannot be undone." and the web's does not.
   () => webSet('gu', 'ord.cancelConfirm', 'આ ઑર્ડર રદ કરવો? આ પાછું નહીં આવે.'), 'divergences', null],

  ['INTENTIONAL_DIVERGENCE cannot be reconciled from the app side',
   () => appSet(OWNER, 'mr', 'cat.addFromCatalogue', 'कॅटलॉगमधून जोडा'), 'divergences', null],

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

  // --- a landed native review is LOCKED, and holds both key names -----------
  // This is what the queue was FOR. The answers arrived per surface — three
  // converge the two, one keeps them deliberately apart — and each side is held
  // under the key name that surface actually uses.
  ['an answered review is LOCKED, not still under review',
   () => webSet('bn', 'c.pay', 'পে করুন'), 'bn-native-review-1', 'web bn c.pay'],

  ['the app side of an answered review is held under its OWN key name',
   () => appSet(CONSUMER, 'bn', 'khata.pay', 'পে করুন'), 'bn-native-review-1', 'app/consumer bn khata.pay'],

  ['an answer that keeps the surfaces DIFFERENT holds each one separately',
   // c.deliverTo names the thing; orderdetail.deliverTo instructs. The reviewer
   // kept both, so changing either is a violation of the same decision.
   () => appSet(CONSUMER, 'bn', 'orderdetail.deliverTo', 'যেখানে পৌঁছে দিতে হবে:'), 'bn-native-review-1', 'app/consumer bn orderdetail.deliverTo'],

  ['a converged answer cannot drift apart again',
   () => appSet(OWNER, 'bn', 'open.tomorrowAt', 'কাল {time}-এ'), 'bn-native-review-1', 'app/owner bn open.tomorrowAt'],

  // --- the queue is a row list now, not a key/lang rectangle ---------------
  // The app side of a queued row usually lives under a DIFFERENT key name. The
  // rectangle could not express that, so it pinned the web string of a question
  // and left the app string — the thing the question was actually about —
  // writable by anything. These four passed silently until 2026-09-18.
  ['a row closed on its existing wording is still held — closing is not approval',
   // gu acc.logout was closed as-is under gu-wording-kept: nobody Gujarati read
   // it, and it is LOCKED precisely so nothing drifts it while that is true.
   () => appSet(CONSUMER, 'gu', 'account.logout', 'બહાર નીકળો'), 'gu-wording-kept', 'app/consumer gu account.logout'],

  // --- the three LOCKED decisions that state a rule and name no values -----
  // unit-counter, catalogue-loanword and prepaid-mechanism each settled a
  // terminology question and recorded no values, so rule 1 skipped them
  // entirely: 14 strings a LOCKED decision claimed to hold, that any sweep
  // could rewrite with every gate green. Each case below passed silently until
  // 2026-09-18.
  ['unit-counter holds its web string, though the decision names no values',
   () => webSet('bn', 'c.unit', 'একক'), 'unit-counter', 'web bn c.unit'],

  ['unit-counter holds the app string too, under the app\'s own key name',
   () => appSet(CONSUMER, 'mr', 'shopdetail.unit', 'एकक'), 'unit-counter', 'app/consumer mr shopdetail.unit'],

  ['catalogue-loanword holds its web string',
   () => webSet('mr', 'nav.catalog', 'यादी'), 'catalogue-loanword', 'web mr nav.catalog'],

  ['catalogue-loanword holds the owner app\'s tab label',
   () => appSet(OWNER, 'bn', 'tab.catalog', 'তালিকা'), 'catalogue-loanword', 'app/owner bn tab.catalog'],

  ['prepaid-mechanism holds its web string',
   () => webSet('gu', 'c.prepaid', 'અગાઉથી ચૂકવેલ'), 'prepaid-mechanism', 'web gu c.prepaid'],

  ['prepaid-mechanism holds BOTH app copies, not whichever is read first',
   () => appSet(OWNER, 'mr', 'pmode.prepaid', 'आगाऊ भरलेले'), 'prepaid-mechanism', 'app/owner mr pmode.prepaid'],

  ['a rule-based LOCKED string DISAPPEARING is caught, not only changing',
   () => appDelete(CONSUMER, 'mr', 'shopdetail.unit'), 'LOCKED row disappeared', 'unit-counter'],

  // --- LOCKED is per SURFACE, because `values` can be per surface -----------
  // gu chelp.e7.a is the one value in the registry written as {app: …}:
  // gu-orthography respelled the app's loanword and says nothing about the web
  // sentence. The guard read that key-level and answered LOCKED for BOTH
  // surfaces, so the snapshot skipped pinning the web row as already settled and
  // the string ended up held by nothing — a rewrite of it passed this gate
  // cleanly until 2026-09-18.
  ['the APP surface of an app-only LOCKED value is still held',
   () => appSet(CONSUMER, 'gu', 'chelp.e7.a', 'કંઈક સાવ જુદું.'), 'gu-orthography', 'app/consumer gu chelp.e7.a'],

  ['the WEB surface of that same key is held too — by the decision that does claim it',
   () => webSet('gu', 'chelp.e7.a', 'ઑર્ડર ટૅબ ખોલો — કંઈક સાવ જુદું.'), 'status-mentions-in-prose', 'web gu chelp.e7.a'],

  ['the same shape in the other decision that uses it (product-item, gu chelp.e2.a)',
   () => appSet(CONSUMER, 'gu', 'chelp.e2.a', 'કંઈક સાવ જુદું.'), 'product-item', 'app/consumer gu chelp.e2.a'],

  // --- reject-not-cancel now owns its twelve values -------------------------
  // The decision said "Reject and Cancel may not share a word" and named nothing,
  // so the conflation it was made to end could come back: swapping the four
  // orej.* strings to the cancel word on BOTH surfaces left this gate reporting
  // OK, because the divergence check only sees a change when the surfaces
  // disagree. Every one of the twelve is generated below rather than sampled.
  ...['orej.reject', 'orej.confirm', 'orej.title', 'orej.done', 'oalert.decide', 'oalert.setHelp']
    .flatMap((key) => [
      [`reject-not-cancel holds ${key} on the web`,
       () => webSet('bn', key, BN.cancelWord), 'reject-not-cancel', `web bn ${key}`],
      [`reject-not-cancel holds ${key} in the owner app`,
       () => appSet(OWNER, 'bn', key, BN.cancelWord), 'reject-not-cancel', `app/owner bn ${key}`],
    ]),

  // --- approve-not-accept constrains an open review without owning it -------
  // It pins no value: status-mentions-in-prose owns the exact strings and a
  // native speaker may still rewrite them. What it rules out is settling the
  // prose/chip mismatch by collapsing the approve-word into the accept-word.
  ['the gu FAQ prose may not collapse the approve-word into the accept-word',
   () => webSet('gu', 'chelp.e7.a', GU.e7CollapsedToAccept), 'approve-not-accept', 'web gu chelp.e7.a'],

  ['the same in Marathi',
   () => webSet('mr', 'chelp.e7.a', MR.e7CollapsedToAccept), 'approve-not-accept', 'web mr chelp.e7.a'],

  // --- rows released from the undecided set ---------------------------------
  // Seven rows were held back because converging them would resolve one of the
  // 274. Released explicitly. The web side is now the review's, and the app side
  // of two of them stays product-item's — one row, one owner per surface.
  ['a row released from the undecided set is held on the web',
   () => webSet('gu', 'chelp.e6.q', 'મારું ખાતું કેવી રીતે કામ કરે છે?'), 'gu-native-review-1', 'web gu chelp.e6.q'],

  ['releasing it did not take the app side from the decision that owned it',
   () => appSet(CONSUMER, 'gu', 'chelp.e2.a', 'કંઈક સાવ જુદું.'), 'product-item', 'app/consumer gu chelp.e2.a'],

  ['a value cannot be claimed by TWO REVIEW decisions either',
   // Eight rows were, briefly: gu ostatus.accepted sat in the Gujarati queue and
   // in gu-accepted-wording, which asks whether that word is right at all.
   // Answering the queue would have closed a question it does not own.
   () => editRegistry((j) => {
     j.decisions['rangeEmpty-rewording'].protected = { web: { gu: { 'ostatus.accepted': 'સ્વીકારેલ' } } };
   }), 'pinned by TWO REVIEW decisions', null],

  ['a value cannot be claimed by REVIEW and LOCKED at once',
   () => editRegistry((j) => {
     j.decisions['gu-orthography'].values.gu['ostatus.accepted'] = 'સ્વીકારેલ';
   }), 'pinned as REVIEW and LOCKED', null],

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
// --- what a rule must NOT claim ------------------------------------------
// A scope is two statements: what is inside it and what is not. The cases above
// prove the first. These mutate a row the decision explicitly excludes and
// assert the gate never reports it under that decision — whether the gate
// passes or fails for some other reason is not the point.
const nonAttribution = [
  ['promo moderation is outside reject-not-cancel',
   () => webSet('bn', 'promo.stRejected', 'ফিরিয়ে দেওয়া হয়েছে'), 'reject-not-cancel'],

  ['photo moderation is outside it too',
   () => webSet('bn', 'set.photoRejected', 'ফিরিয়ে দেওয়া হয়েছে'), 'reject-not-cancel'],

  ['orej.help is excluded pending the ENGLISH fix, so its cancel word is not a violation',
   () => webSet('bn', 'orej.help', 'গ্রাহককে কারণ জানান — বাতিলের সাথে এটা যাবে।'), 'reject-not-cancel'],

  ['a revision that KEEPS the approve-word is not an approve-not-accept violation',
   // Still refused — status-mentions-in-prose owns the string — but by that
   // decision, not this one. The constraint bounds the answer; it is not a pin.
   () => webSet('mr', 'chelp.e7.a', MR.e7RevisedKeepingApprove), 'approve-not-accept'],
];
for (const [name, mutate, mustNotFire] of nonAttribution) {
  restore();
  try { mutate(); } catch (e) { console.log(`  SETUP FAILED  ${name}\n                ${e.message}`); fail++; continue; }
  const r = gate();
  if (r.out.includes(`--- ${mustNotFire} `)) {
    fail++;
    console.log(`  *** CLAIMED ***  ${name}`);
    console.log(`                   ${mustNotFire} reported a row it declares out of scope`);
  } else { pass++; console.log(`  not claimed  ${name}`); }
}

restore();
if (!gate().ok) { console.error('\nthe copy did not restore cleanly'); fail++; }

// --- what the registry must NOT claim ------------------------------------
// The cases above all prove a refusal. Narrowing a scope is the opposite claim
// — that a value is no longer pinned — and a mutation test cannot show it,
// because "the gate said OK" is also what a hole looks like. These read the
// registry directly and assert the shape.
{
  const reg = JSON.parse(fs.readFileSync(path.join(box, 'scripts/i18n-decisions.json'), 'utf8'));
  const pinnedBy = (lang, key) => Object.entries(reg.decisions)
    .filter(([, d]) => d.status === 'REVIEW' && d.protected
      && Object.values(d.protected).some((byLang) => byLang[lang]?.[key] !== undefined))
    .map(([id]) => id);
  const claims = [
    // acc.dob is queued in Gujarati and nowhere else — 60 of the open rows are
    // like that. Under the old rectangle every one of them was pinned in all
    // three languages, which is the shape this replaced.
    // The three queues are empty. What has to hold is that nothing fell out of
    // them: every row each one ever held is accounted for exactly once, and the
    // decision that took it exists.
    ['every queue is empty and every row it held is accounted for, once', () => ['bn', 'gu', 'mr'].every((l) => {
      const q = reg.decisions[`native-speaker-queue-${l}`];
      if (!q || q.protects.rows.length) return false;
      const all = [...(q.resolved_rows || []), ...(q.superseded_rows || [])];
      const seen = new Set();
      return all.every((x) => {
        const at = `${x.web}|${x.app}`;
        if (seen.has(at)) return false;                       // no row counted twice
        seen.add(at);
        const owner = x.answered_by || x.deferred_to;
        return !!owner && !!reg.decisions[owner];             // and its owner is real
      });
    })],
    ['the catalogue repair took strings that already existed, and says what it could not fix', () => {
      const d = reg.decisions['catalogue-loanword-repair'];
      if (!d || d.status !== 'LOCKED' || d.applies !== 'catalogue-loanword') return false;
      // every repaired row names the web key it was taken from
      const took = d.rows.every((x) => /^web /.test(x.taken_from || ''));
      // and the ones it could not repair are listed with what they need
      return took && d.not_repaired.rows.length === 6 && !!d.not_repaired.needs;
    }],
    // What a landed review looks like from the registry's side.
    ['an answered queue holds no rows and keeps every answer as provenance', () => {
      const q = reg.decisions['native-speaker-queue-bn'];
      const d = reg.decisions['bn-native-review-1'];
      if (q.protects.rows.length !== 0) return false;                    // nothing left to review
      if (!q.resolved_rows || q.resolved_rows.length !== 6) return false;  // and nothing dropped
      if (d.status !== 'LOCKED') return false;
      // every answered row is named on BOTH its key names, and each has a value
      return q.resolved_rows.every((r) => r.answered_by === 'bn-native-review-1'
        && d.values.bn[r.web] !== undefined
        && d.values.bn[r.app] !== undefined);
    }],
    ['converging a divergence removed it from the intentional set, on the record', () => {
      const d = reg.divergences.INTENTIONAL_DIVERGENCE;
      const resolved = (d.resolved || []).find((x) => x.by === 'bn-native-review-1');
      if (!resolved) return false;
      // it is gone from the live set, and the count moved with it
      return resolved.keys.every((k) => !(d.keys.bn || []).includes(k))
        && d.count === Object.values(d.keys).reduce((n, ks) => n + ks.length, 0);
    }],
    ['the FAQ decision pins app/consumer only', () => {
      const s = Object.keys(reg.decisions['consumer-faq-app-variants'].protected);
      return s.length === 1 && s[0] === 'app/consumer';
    }],
    ['the FAQ decision does not pin the web strings it diverges from', () => {
      const d = reg.decisions['consumer-faq-app-variants'].protected;
      return d.web === undefined;
    }],
    ['the queue is split per language and none of them is rectangular', () => ['bn', 'gu', 'mr'].every((l) => {
      const d = reg.decisions[`native-speaker-queue-${l}`];
      return d && d.status === 'REVIEW' && Array.isArray(d.protects?.rows) && !d.protects.keys;
    })],
    ['every superseded row names the LOCKED decision that answered it', () => Object.values(reg.decisions)
      .flatMap((d) => d.superseded_rows || [])
      .every((r) => reg.decisions[r.answered_by]?.status === 'LOCKED')],
    // The point of the exercise: LOCKED has to mean the same thing for all of
    // them. A decision is enforceable if rule 1 can check its values, if this
    // gate names it and evaluates its rule directly, or if the rows it retired
    // pinned its strings. Three of the fifteen had none of those.
    // The provenance IS the enforcement for these three, so it is load-bearing:
    // drop a superseded_rows entry and the string it pinned goes back to being
    // governed by nothing. Nothing else covers it — web bn c.unit has no app
    // twin under that name, so even the divergence check cannot see it.
    // The bug, stated directly: ownership is (surface, lang, key), not (lang, key).
    ['an app-only LOCKED value does not claim the web surface', () => {
      const spec = reg.decisions['gu-orthography'].values.gu['chelp.e7.a'];
      const appOnly = typeof spec === 'object' && spec.app !== undefined && spec.web === undefined;
      const webPinned = reg.decisions['status-mentions-in-prose'].protected?.web?.gu?.['chelp.e7.a'] !== undefined;
      const appPinnedAsReview = reg.decisions['status-mentions-in-prose'].protected?.['app/consumer']?.gu?.['chelp.e7.a'] !== undefined;
      // app side LOCKED and therefore NOT also REVIEW; web side REVIEW because no
      // LOCKED decision names it. Both halves have to hold, or the fix is half done.
      return appOnly && webPinned && !appPinnedAsReview;
    }],
    ['a superseded row records only the surfaces its LOCKED decision claims', () => Object.values(reg.decisions)
      .flatMap((d) => d.superseded_rows || [])
      .every((r) => {
        const owner = reg.decisions[r.answered_by];
        if (!owner?.values) return true;              // rule-based: every surface it recorded
        const spec = owner.values[r.lang]?.[r.key ?? r.web] ?? owner.values[r.lang]?.[r.app];
        if (typeof spec !== 'object' || spec === null) return true;
        // {app: …} may not carry a web value_at_retirement, and vice versa.
        return Object.keys(r.value_at_retirement || {})
          .every((sfc) => (sfc === 'web' ? spec.web !== undefined : spec.app !== undefined));
      })],
    // approve-not-accept constrains a review without becoming a competing owner.
    ['approve-not-accept owns no values and does not take the rows from its REVIEW owner', () => {
      const a = reg.decisions['approve-not-accept'];
      if (a.status !== 'LOCKED') return false;
      if (a.values && Object.keys(a.values).length) return false;          // never a value owner
      const c = a.constrains;
      if (!c || c.decision !== 'status-mentions-in-prose') return false;    // says what it constrains
      const owner = reg.decisions[c.decision];
      if (owner.status !== 'REVIEW') return false;
      // the rows it names are still pinned by that REVIEW decision, on its surface
      return c.langs.every((l) => c.keys.every((k) => c.surfaces
        .every((sfc) => owner.protected?.[sfc]?.[l]?.[k] !== undefined)));
    }],
    ['the constraint records what it forbids, in terms taken from live strings', () => {
      const c = reg.decisions['approve-not-accept'].constrains;
      const chip = { gu: 'ostatus.accepted', mr: 'ostatus.accepted' };
      // the forbidden stem must actually be the stem of the accept-word in use,
      // or the constraint is about a word this product does not say
      return c.langs.every((l) => {
        const live = reg.decisions['mr-status-register'].values?.[l]?.[chip[l]]
          ?? reg.decisions['gu-accepted-wording'].protected?.web?.[l]?.[chip[l]];
        return typeof c.forbidden_stems?.[l] === 'string' && live && live.startsWith(c.forbidden_stems[l]);
      });
    }],
    ['reject-not-cancel names its six keys and declares what it excludes', () => {
      const d = reg.decisions['reject-not-cancel'];
      const KEYS = ['orej.reject', 'orej.confirm', 'orej.title', 'orej.done', 'oalert.decide', 'oalert.setHelp'];
      const EXCLUDED = ['promo.refundNote', 'promo.stRejected', 'set.photoRejected', 'orej.help'];
      const inScope = KEYS.every((k) => d.scope.keys.includes(k) && d.values.bn[k] !== undefined);
      const outOfScope = EXCLUDED.every((k) => typeof d.scope.exclusions?.[k] === 'string'
        && !d.scope.keys.includes(k) && d.values.bn[k] === undefined);
      // every key it claims is in the order-rejection families and nowhere else
      const domain = d.scope.keys.every((k) => k.startsWith('orej.') || k.startsWith('oalert.'));
      return inScope && outOfScope && domain;
    }],
    ['the orej.help ENGLISH defect is recorded, and recorded as an English one', () => {
      const e = reg.decisions['reject-not-cancel'].english_source_defect;
      return e?.key === 'orej.help' && /English source defect/i.test(e.status)
        && !reg.decisions['reject-not-cancel'].values.bn['orej.help'];
    }],
    ['every row released from the undecided set left it, and says who released it', () => {
      const U = reg.divergences.UNDECIDED;
      const released = (U.resolved || []).filter((x) => /native-review/.test(x.by));
      if (!released.length) return false;
      // gone from the live set, owned by the decision that released it, and the
      // count moved with them
      return released.every((x) => x.keys.every((k) => !(U.keys[x.lang] || []).includes(k)
               && reg.decisions[x.by].values[x.lang][k] !== undefined))
        && U.count === Object.values(U.keys).reduce((n, ks) => n + ks.length, 0);
    }],
    ['a released row does not claim a surface another LOCKED decision owns', () => {
      // gu chelp.e2.a and chelp.e3.a: product-item holds the app copy, so the
      // review took the web only. A plain string here would claim both.
      const v = reg.decisions['gu-native-review-1'].values.gu;
      return ['chelp.e2.a', 'chelp.e3.a'].every((k) => typeof v[k] === 'object' && v[k].web !== undefined && v[k].app === undefined);
    }],
    ['the three rule-based decisions pin exactly the 14 values, and nothing else does', () => {
      const RULE_BASED = ['unit-counter', 'catalogue-loanword', 'prepaid-mechanism'];
      const pinned = Object.values(reg.decisions)
        .flatMap((d) => d.superseded_rows || [])
        .filter((r) => RULE_BASED.includes(r.answered_by))
        .flatMap((r) => Object.keys(r.value_at_retirement || {}));
      const claimedElsewhere = Object.values(reg.decisions)
        .filter((d) => d.status === 'REVIEW' && d.protected)
        .flatMap((d) => Object.values(d.protected))
        .flatMap((byLang) => Object.entries(byLang))
        .flatMap(([lang, kv]) => Object.keys(kv).map((k) => `${lang}|${k}`));
      const ours = Object.values(reg.decisions)
        .flatMap((d) => d.superseded_rows || [])
        .filter((r) => RULE_BASED.includes(r.answered_by))
        .flatMap((r) => Object.keys(r.value_at_retirement || {})
          .map((sfc) => `${r.lang}|${r.key ?? (sfc === 'web' ? r.web : r.app)}`));
      return pinned.length === 14 && ours.every((x) => !claimedElsewhere.includes(x));
    }],
    ['every LOCKED decision is enforceable by something', () => {
      const gateSrc = fs.readFileSync(GATE, 'utf8');
      const pinned = new Set(Object.values(reg.decisions)
        .flatMap((d) => d.superseded_rows || [])
        .filter((r) => r.value_at_retirement && Object.keys(r.value_at_retirement).length)
        .map((r) => r.answered_by));
      // Empty, and it has to stay empty. The last two descriptive decisions were
      // resolved by a human: reject-not-cancel now names its six keys, and
      // approve-not-accept is evaluated as a constraint. A NEW valueless LOCKED
      // decision fails this check rather than joining a list.
      const KNOWN_DESCRIPTIVE = [];
      const unenforced = Object.entries(reg.decisions)
        .filter(([id, d]) => d.status === 'LOCKED'
          && !(d.values && Object.keys(d.values).length)
          && !gateSrc.includes(`'${id}'`)
          && !pinned.has(id))
        .map(([id]) => id);
      const unexpected = unenforced.filter((id) => !KNOWN_DESCRIPTIVE.includes(id));
      if (unexpected.length) console.log(`                   newly unenforced: ${unexpected.join(', ')}`);
      return unexpected.length === 0;
    }],
  ];
  for (const [name, ok] of claims) {
    if (ok()) { pass++; console.log(`  holds    ${name}`); }
    else { fail++; console.log(`  *** BROKEN ***  ${name}`); }
  }
}
fs.rmSync(box, { recursive: true, force: true });

console.log(`\n${pass} checks passed, ${fail} failed.`);
if (fail) { console.error('the gate does not refuse everything it claims to.'); process.exit(1); }
console.log('Every rule the registry claims to enforce was proven by breaking it.');
