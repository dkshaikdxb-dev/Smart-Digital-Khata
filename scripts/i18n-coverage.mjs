#!/usr/bin/env node
/**
 * Translation coverage ratchet for the two NATIVE dictionaries.
 *
 * Run:  node scripts/i18n-coverage.mjs        (from the repo root)
 *
 * mobile-app/src/consumer/i18n.js and mobile-app/src/i18n.js each hold a flat
 * `const <lang> = { ... }` block per language, merged into DICTS at the bottom.
 * `en` is the source of truth and a missing key silently falls back to it, which
 * is the right run-time behaviour and a terrible property to develop against: a
 * language can lose strings, or gain English ones, and nothing anywhere says so.
 * A shopkeeper on Bengali finds out instead, by reading an English button.
 *
 * So this is a ratchet, in the spirit of admin-dashboard/scripts/contrast-audit.mjs:
 * plain Node, no dependencies, no test runner, exits non-zero on a regression. The
 * FLOORS below are the counts as measured when this script landed. Coverage may go
 * up freely — raise the floor in the same commit — but it may never go down.
 *
 * It deliberately does NOT demand 100%. Most of these languages are partial and
 * honestly so; the only thing being defended is that they never go backwards.
 *
 * Three further structural checks, because a key can be present and still wrong:
 *   - orphan keys: a key in a language block that `en` does not have is dead
 *     weight at best and a typo'd key name at worst;
 *   - placeholder drift: `t()` interpolates {var}, so a translation whose {tokens}
 *     differ from the English one renders a literal "{amt}" to a real customer;
 *   - block integrity: every language in LANGUAGES has a block, and every block
 *     parses.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const LANGS = ['en', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'ur'];

const TARGETS = [
  { id: 'consumer', file: 'mobile-app/src/consumer/i18n.js' },
  { id: 'owner', file: 'mobile-app/src/i18n.js' },
];

/**
 * Translated-key floors, per dictionary, per language: how many of `en`'s keys
 * that language carried when this ratchet was set. Absolute counts, not
 * percentages, so adding an English key never retroactively fails a language
 * that has not been translated yet — it just widens the honest gap.
 */
const FLOORS = {
  // Batch PARITY raised every floor that moved. The native consumer app gained
  // the account features the web already had (gender/DOB, number change, account
  // statement, invite & earn, Help & FAQ) plus in-shop search and brand/size
  // chips, and the strings for them were COPIED VERBATIM out of the web
  // dictionary (admin-dashboard/src/lib/i18n.js) rather than authored here —
  // every one of those features is already translated on the web.
  //
  // en went 237 -> 334 keys: 71 copied from the web, plus 26 genuinely new
  // English-only strings (the update-status card, and the handful of controls
  // the web has no equivalent for) that every other language falls back on.
  //
  // The web dictionary carries only en/hi/ta/te/kn/ml/ur, so only those gained:
  // hi +71, and ta/te/kn/ml/ur +45 each. A copied value that was byte-identical
  // to the English one was NOT copied — several of the web's own non-English
  // blocks still hold English placeholders for these keys, and carrying those
  // across would change nothing a shopper sees (the dictionary already falls
  // back to en) while inflating this very ratchet. bn, mr and gu gained nothing
  // and their floors are unchanged; their percentage fell only because en grew,
  // which is the honest gap widening, not a regression.
  //
  // Batch TABS added ONE English key to the consumer dictionary, 'tab.products'
  // — the native app gained the Products tab the web has had all along — taking
  // en from 334 to 335 keys. The floors here are ABSOLUTE counts of translated
  // keys, not percentages, so an en-only key never moves one; what moved these
  // six is that the word itself was COPIED VERBATIM out of the web dictionary's
  // 'ctab.products' (admin-dashboard/src/lib/i18n.js), where a human had already
  // translated the very same tab: hi/ta/te/kn/ml/ur +1 each. bn, mr and gu have
  // no block in the web dictionary, so they gained nothing, fall back to
  // English, and keep their floors — the honest gap widening by one key.
  //
  // Batch SHELF rebuilt the consumer product-search screen and took the
  // category chips off keywords and onto real catalogue shelves. en went
  // 335 -> 343 keys: three new chip labels (cat.dalPulses, cat.spices,
  // cat.cookingOils) and five English-only strings for the screen itself
  // (psearch.voiceIn / buyAgain / recent / clearRecent / browse), which need a
  // translator and fall back to English until they get one.
  //
  // The three CHIP LABELS were not authored here. Every non-English value was
  // copied byte-for-byte out of the shipped catalogue translations
  // (backend/src/data/catalog-i18n.json), whose subcategory rows already name
  // "Spices", "Dal & Pulses" and "Cooking Oils" in all nine languages — the
  // same human-written text a shopper reads on those shelves in the catalogue.
  // So every language gained those three: hi/ta/te/kn/ml/ur +3.
  //
  // bn, mr and gu gained FIVE. They had no cat.* keys at all — they are the
  // three languages the web dictionary, which every earlier copy came from, has
  // no block for — so alongside the three new labels they also picked up
  // cat.household and cat.personalCare, copied the same way from that file's
  // top-level CATEGORY rows. cat.attaRice is the one chip label they still fall
  // back to English for: "Atta & Rice" is this app's own phrasing and is not a
  // catalogue term, so there was nothing in the repo to copy and a translator
  // is owed it.
  //
  // Batch INDOARYAN closed the consumer dictionary's gaps for the five
  // Indo-Aryan languages this repo carries, taking each of them to 341 of en's
  // 343 keys: hi 310 -> 341, bn 167 -> 341, mr 167 -> 341, gu 167 -> 341,
  // ur 229 -> 341. Unlike every raise recorded above it, this one was NOT
  // copied out of human-written text. Where the same English already had a
  // translation in the owner dictionary or the shipped catalogue that wording
  // was reused verbatim, but the large majority of these 665 values were
  // MACHINE-AUTHORED and no native speaker has read them. Each language block
  // says so in a comment above the strings, and the review sheet — generated
  // from the shipped values and ordered worst-first, money and khata strings
  // at the top — is docs/i18n-review-consumer-indo-aryan.md. Until a reviewer
  // works through that file, these five are honest coverage of unreviewed text,
  // which is a different thing from reviewed coverage.
  //
  // All five stop two keys short of en, and the same two: 'upd.runtime' and
  // 'upd.channel'. Those label the Expo build tokens on the update card, whose
  // VALUES are themselves English identifiers, so they fall back to en on
  // purpose — no translation beats a transliterated one that reads as noise.
  //
  // ta/te/kn/ml were not in this batch, keep their floors, and their percentage
  // is unchanged because en did not grow.
  // Batch DRAVIDIAN-URDU moved the OWNER floors only. ta/te/kn/ml/ur sat at 123
  // of en's 325 keys — 37.8%, so a shopkeeper who picked Tamil got an app that
  // was mostly English, with editing an order, the new-order alert, shop hours,
  // ready-times, families and settings never translated at all. This batch
  // AUTHORED the 197 strings each of those five was missing, in the register and
  // with the vocabulary of that language's own existing block, taking them to
  // 320 (98.5%). Unlike every earlier owner-app batch, nothing here was copied
  // from a human source: the web dictionary has no ta/te/kn/ml/ur rows for these
  // features, so these are machine-authored and await a native speaker —
  // docs/i18n-review-owner-app.md is the review sheet and the source of truth.
  //
  // bn, mr and gu gained exactly ONE, 'open.timePlaceholder': Hindi spells the
  // shop-hours field hint out as घंटा:मिनट rather than leaving it "HH:MM", and
  // these three now do the same in their own script.
  //
  // The five keys ta/te/kn/ml/ur still fall back on, and the nine bn/mr/gu do,
  // are deliberate and are the same ones this file's header describes: the two
  // app names and the dashboard title (all "Smart Khata"), 'txn.upi',
  // 'set.razorpayKeyId' / 'set.keySecret' / 'set.webhookSecret' — brand and
  // console labels — and 'oedit.historyReduced' / 'oedit.historyBy', which are
  // nothing but placeholders and punctuation. A row there would change nothing
  // on screen while inflating this ratchet, so it stays absent.
  //
  // Batch DRAVIDIAN-CONSUMER closed the last gap in the SHOPPER dictionary. The
  // four Dravidian languages sat at 229 of en's 343 keys — 66.8%, so a shopper
  // who picked Tamil, Telugu, Kannada or Malayalam read English for the order
  // the shop had reduced, for every shop-closed and ready-by line, for every
  // error message, for the account statement and for the whole update card. This
  // batch AUTHORED the 112 strings each of those four was missing, in the
  // register and with the vocabulary of that language's own existing block,
  // taking each to 341 (99.4%) — level with the five the INDOARYAN batch raised.
  //
  // Like that batch and unlike every copy recorded above it, these values are
  // MACHINE-AUTHORED and no native speaker has read them. Where the same English
  // already had a translation in the owner dictionary the wording was reused
  // verbatim — the shop-hours and ready-time lines, and '{item} — removed' — but
  // the large majority of these 448 values were written here. Each of the four
  // blocks says so in a comment above the strings, and the review sheet,
  // generated from the shipped values and ordered worst-first with money and
  // khata at the top, is docs/i18n-review-consumer-dravidian.md.
  //
  // All four stop two keys short of en, and the same two the Indo-Aryan five do:
  // 'upd.runtime' and 'upd.channel', whose VALUES are English Expo identifiers.
  // Nothing else in this file moved; hi/bn/mr/gu/ur keep their floors, and both
  // owner rows are untouched.
  //
  // Batch ORDER-REFUSAL added TWO consumer keys, 'cart.khataFull' and
  // 'cart.itemGone', in English only — every language's percentage falls from
  // 99.4 to 98.8 and the floors are unchanged, which is the honest record of a
  // gap rather than a regression. They are the two answers a shopper gets when
  // an order is refused, and no human translation of either exists anywhere in
  // this codebase to reuse; machine-writing them into nine languages is exactly
  // what the review process is for. Until they come back, those nine read the
  // English — which is still strictly better than what they read before, which
  // was a TRANSLATED sentence that told them nothing ("Something in that was
  // not right") when the truth was "this is over your khata limit here".
  //
  // Batch READ-ALOUD added THREE more consumer keys and they ARE translated in
  // every language, because none was authored here: 'voice.rupees' and
  // 'voice.speak' are copied verbatim from the web consumer khata, which has
  // spoken a balance for a while, and 'common.stop' from the owner app, whose
  // order alert already offers exactly this Stop. Every language +3.
  // Batch FAQ-VOICE added one CONSUMER key, 'help.listen', for the read-aloud
  // button the web FAQ has had and this screen did not. Not authored here: it
  // is the label the web already shows, copied verbatim in all ten languages
  // (admin-dashboard's dictionary for en/hi, regional-i18n.json for the rest),
  // so both surfaces say the same word and nothing new needs review. Every
  // language gains it, so every consumer floor moves together.
  // Batch FAQ-APP-VARIANTS added four CONSUMER keys — chelp.e1.a, chelp.e8.a,
  // chelp.e9.q and chelp.e9.a — so the app can answer those three questions in
  // its own words instead of the web's, which name controls this app does not
  // have. The English is approved; the nine translations of each are
  // MACHINE-AUTHORED and carry REVIEW status in scripts/i18n-decisions.json.
  // Every language gains all four. chelp.e1.q and chelp.e8.q come too, copied
  // verbatim from the web because the app never carried them and the entries
  // would otherwise print their key names; their wording is unchanged, so they
  // are not part of the REVIEW set. Six keys per language in all.
  consumer: { hi: 351, bn: 351, ta: 351, te: 351, kn: 351, ml: 351, mr: 351, gu: 351, ur: 351 },
  //
  // Batch MORE-ROUTES added three OWNER keys — 'more.staff', 'more.suppliers'
  // and 'more.transactions' — for the Staff / Suppliers / Transactions rows the
  // app could not reach at all. None of these values was authored here: each is
  // the string the WEB console already shows for that same page, copied
  // verbatim (nav.staff and nav.transactions from admin-dashboard's dictionary,
  // sup.nav from i18nSupply, and the bn/gu/mr ones from regional-i18n.json), so
  // the app and the site say the same word and nothing new needs review.
  //
  // bn/gu/mr gain two of the three, not three: 'sup.nav' has no Bengali,
  // Gujarati or Marathi anywhere in the codebase, so "Suppliers" falls back to
  // English for them until docs/i18n-web/web-{bn,gu,mr}.csv comes back. That is
  // not a regression — the row did not exist for them before, and every string
  // on the page it opens is already English for these three.
  owner: { hi: 328, bn: 318, ta: 323, te: 323, kn: 323, ml: 323, mr: 318, gu: 318, ur: 323 },
};

/* ------------------------------------------------------- dictionary reading */
// Brace matcher that steps over strings, template literals and comments, so a
// `{` inside a translated string or a comment cannot close a block early.
function matchBrace(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i); if (i < 0) return -1; i += 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i += 1;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') i += 1; i += 1; }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

// These modules import React and expo-secure-store, so they cannot simply be
// imported here — and CI has no node_modules for mobile-app anyway. Lift the
// object literals out textually and evaluate each one on its own instead.
function readDict(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  const re = /^const ([a-z]{2}) = \{/gm;
  let m;
  while ((m = re.exec(src))) {
    if (!LANGS.includes(m[1])) continue;
    const open = src.indexOf('{', m.index);
    const end = matchBrace(src, open);
    if (end < 0) throw new Error(`${file}: unterminated block for "${m[1]}"`);
    out[m[1]] = vm.runInNewContext(`(${src.slice(open, end + 1)})`);
  }
  return out;
}

const TOKEN = /\{(\w+)\}/g;
const tokensOf = (s) => [...new Set(String(s).match(TOKEN) || [])].sort().join(',');

/* ------------------------------------------------------------------ report */
const pad = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));
let failures = 0;
const fail = (msg) => { console.log(`FAIL  ${msg}`); failures += 1; };

for (const { id, file } of TARGETS) {
  console.log(`\n${file}`);
  let dict;
  try {
    dict = readDict(file);
  } catch (err) {
    fail(`${file}: ${err.message}`);
    continue;
  }

  if (!dict.en) { fail(`${file}: no en block`); continue; }
  const enKeys = Object.keys(dict.en);
  const floors = FLOORS[id] || {};

  console.log(`  ${pad('lang', 6)}${pad('have', 6, true)}${pad('of en', 7, true)}${pad('pct', 7, true)}${pad('floor', 7, true)}  verdict`);
  for (const lang of LANGS) {
    const block = dict[lang];
    if (!block) { fail(`${file}: language "${lang}" has no block`); continue; }
    if (lang === 'en') continue;

    const have = enKeys.filter((k) => block[k] !== undefined).length;
    const floor = floors[lang];
    const pct = ((have / enKeys.length) * 100).toFixed(1);
    let verdict;
    if (floor === undefined) { verdict = 'NO FLOOR'; fail(`${file}: "${lang}" has no recorded floor`); }
    else if (have < floor) { verdict = 'REGRESSED'; fail(`${file}: "${lang}" fell from ${floor} translated keys to ${have}`); }
    else verdict = have > floor ? `ok  (+${have - floor}, raise the floor)` : 'ok';
    console.log(`  ${pad(lang, 6)}${pad(have, 6, true)}${pad(enKeys.length, 7, true)}${pad(pct, 7, true)}${pad(floor ?? '-', 7, true)}  ${verdict}`);

    for (const k of Object.keys(block)) {
      if (dict.en[k] === undefined) fail(`${file}: "${lang}" has key "${k}" that en does not`);
    }
    for (const k of enKeys) {
      if (block[k] === undefined) continue;
      if (tokensOf(block[k]) !== tokensOf(dict.en[k])) {
        fail(`${file}: "${lang}" key "${k}" interpolates ${tokensOf(block[k]) || '(nothing)'}, en interpolates ${tokensOf(dict.en[k]) || '(nothing)'}`);
      }
    }
  }
}

console.log('');
if (failures) {
  console.log(`${failures} problem(s). A language may never carry fewer strings than the floor in`);
  console.log('scripts/i18n-coverage.mjs. If you deliberately raised coverage, raise the floor too.');
} else {
  console.log('No language regressed; no orphan keys; every placeholder matches en.');
}
process.exit(failures ? 1 : 0);
