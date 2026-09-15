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
  consumer: { hi: 306, bn: 162, ta: 225, te: 225, kn: 225, ml: 225, mr: 162, gu: 162, ur: 225 },
  owner: { hi: 325, bn: 315, ta: 123, te: 123, kn: 123, ml: 123, mr: 315, gu: 315, ur: 123 },
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
