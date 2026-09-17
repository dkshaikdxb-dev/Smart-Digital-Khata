// Semantic audit of the rows that were aligned MECHANICALLY.
//
// Group A was defined by lexical overlap: two strings sharing most of their
// words were called a wording variant. High overlap does not mean same meaning.
// Two sentences can share nine words out of ten and differ on the one that says
// whether something was accepted or rejected, added or removed, allowed or
// forbidden.
//
// So this re-reads every A row for the ways a wording difference can change
// what a person does:
//
//   NEGATION      a dropped না/নেই/নয় reverses a sentence outright. This is the
//                 one that can silently tell a shopkeeper the opposite thing.
//   LENGTH        a large drop is content lost; a large gain is content added.
//                 open.hoursHelp lost a sentence and only showed up as length.
//   ACTION VERBS  reject/cancel, accept/approve, add/remove, pay/payment are
//                 distinct operations in this product, and this app treats
//                 reject and cancel as genuinely different actions.
//   COUNTING      quantity vs item, and the Bengali classifier টি, decide
//                 whether a sentence is about how MANY or about WHICH.
//   DIGITS        a number that appears in one string and not the other.
//
// Nothing is rewritten here. The job is to say which rows were never safe to
// align, so they can be moved to B or C and decided one at a time.
import fs from 'fs';
import path from 'path';
import { staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const before = JSON.parse(fs.readFileSync('/tmp/before-audit.json', 'utf8')).bn;
const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8')).bn;
const DECISIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/bn-divergence-decisions.json'), 'utf8'));

// Bengali negation and absence. A count difference is a candidate reversal.
// \b is an ASCII word boundary: next to Bengali it matches almost anywhere and
// almost nowhere, so the first version of this counter reported "web has 1, app
// has 0" for two strings that both negate. Boundaries are spelled out instead.
// না is a free particle, but it is also the last two letters of রওনা, কেনা,
// দেওয়া-না constructions and a dozen other ordinary words. Requiring only a
// boundary AFTER it flagged "Out for delivery" and "Purchase" as reversals. It
// has to be a standalone token: a boundary on BOTH sides.
const EDGE = '(?=$|[\\s।,.;:!?“”"\'\\-—])';
const START = '(?:^|(?<=[\\s।,.;:!?“”"\'\\-—]))';
const NEG = new RegExp(`${START}না${EDGE}|নেই|${START}নয়${EDGE}|নি${EDGE}|বিনা|ছাড়া`, 'g');
// নি is the negative verb suffix (হয়নি, করিনি) — and also the last two letters
// of আপনি, তিনি, কিনি. Counting those flagged five rows where both strings say
// exactly the same thing. The pronouns are removed before counting.
const PRONOUNS = /আপনি|তিনি|কিনি|জানি|মানি/g;
const negCount = (s) => (String(s).replace(PRONOUNS, ' ').match(NEG) || []).length;
const digits = (s) => (String(s).match(/\d+/g) || []).join(',');

// Operations this product keeps apart. The Bengali is what each app string
// actually uses for them, gathered from the dictionaries rather than guessed.
const ACTIONS = [
  { name: 'reject vs cancel', re: /ফিরিয়ে|প্রত্যাখ্যান|বাতিল|নাকচ/g },
  { name: 'accept vs approve', re: new RegExp(`গ্রহণ|মেনে|নিন${EDGE}|অনুমোদ|স্বীকার`, 'g') },
  { name: 'pay vs payment',   re: new RegExp(`পরিশোধ|পেমেন্ট|দিন${EDGE}|দেওয়া|টাকা দ`, 'g') },
  { name: 'add vs remove',    re: /যোগ|সরান|বাদ|মুছ|কমান|বাড়ান/g },
  { name: 'quantity vs item', re: new RegExp(`পরিমাণ|সংখ্যা|জিনিস|টি${EDGE}|একক`, 'g') },
  { name: 'status/state',     re: /চালু|বন্ধ|খোলা|অপেক্ষ|সম্পন্ন|তৈরি|প্রস্তুত/g },
];
const sig = (s, re) => [...new Set(String(s).match(re) || [])].sort().join(' ');

const rows = [];
for (const key of Object.keys(before)) {
  if (before[key] === after[key]) continue;                    // untouched
  if (DECISIONS.keep_web[key] || DECISIONS.review[key]) continue; // not aligned
  const en = (staticValue('en', key) || '').trim();
  const web = before[key];   // what the web said
  const app = after[key];    // what it says now
  const groupB = Boolean(DECISIONS.align_to_app_because[key]);

  const flags = [];
  if (negCount(web) !== negCount(app)) {
    flags.push({ kind: 'NEGATION', detail: `web has ${negCount(web)}, app has ${negCount(app)} — a sentence may have been reversed` });
  }
  const ratio = app.length / Math.max(1, web.length);
  if (ratio < 0.72) flags.push({ kind: 'CONTENT LOST', detail: `the app string is ${Math.round((1 - ratio) * 100)}% shorter` });
  if (ratio > 1.4) flags.push({ kind: 'CONTENT ADDED', detail: `the app string is ${Math.round((ratio - 1) * 100)}% longer` });
  if (digits(web) !== digits(app)) flags.push({ kind: 'DIGITS', detail: `web "${digits(web) || 'none'}" vs app "${digits(app) || 'none'}"` });
  for (const a of ACTIONS) {
    const sw = sig(web, a.re), sa = sig(app, a.re);
    if (sw !== sa) flags.push({ kind: a.name.toUpperCase(), detail: `web [${sw || '—'}] vs app [${sa || '—'}]` });
  }
  if (flags.length) rows.push({ key, en, web, app, groupB, flags });
}

// An operational key deserves attention whether or not a pattern fired.
const OPERATIONAL = /^(orej|oalert|ostatus|oedit|coedit|eta|pay|ord|open)\./;
const operational = rows.filter((r) => OPERATIONAL.test(r.key));
const other = rows.filter((r) => !OPERATIONAL.test(r.key));

console.log(`aligned rows re-read: ${Object.keys(before).filter((k) => before[k] !== after[k]).length}`);
console.log(`rows with at least one flag: ${rows.length}  (operational: ${operational.length}, other: ${other.length})`);
console.log(`of those, already decided in group B with a reason: ${rows.filter((r) => r.groupB).length}\n`);

for (const list of [['OPERATIONAL', operational], ['OTHER', other]]) {
  if (!list[1].length) continue;
  console.log(`===== ${list[0]} =====`);
  for (const r of list[1]) {
    console.log(`\n${r.key}${r.groupB ? '   [already group B]' : ''}`);
    console.log(`  en : ${r.en}`);
    console.log(`  web: ${r.web}`);
    console.log(`  app: ${r.app}`);
    for (const f of r.flags) console.log(`  !! ${f.kind}: ${f.detail}`);
  }
}
