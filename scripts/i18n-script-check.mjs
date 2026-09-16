#!/usr/bin/env node
/**
 * Script-integrity gate for the two mobile dictionaries.
 *
 * `i18n-coverage.mjs` already answers "is a key present, and do its placeholders
 * match English". It cannot answer the question that matters once translations
 * arrive in bulk from outside this repo: is the text actually in the language it
 * claims to be?
 *
 * Two things go wrong with a two-thousand-string import and neither is visible
 * by reading a diff. A block gets pasted one row off and Tamil lands in the
 * Telugu column — both are Indic, both look plausible, and every existing gate
 * stays green. Or a cell comes back untranslated and ships English under a
 * Bengali key, which reads to a shopper as the app simply not being translated.
 *
 * So: every value in a language block must contain at least one character of
 * that language's own script. Latin-only values are reported separately from
 * wrong-script ones, because they are different mistakes with different fixes.
 *
 * ALLOWED to be Latin-only: brand and technical tokens the product deliberately
 * never translates. Kept as an explicit list rather than a loose heuristic, so
 * adding one is a decision somebody makes on purpose.
 */
import fs from 'node:fs';
import { BRAND_KEYS } from './lib/i18n-brand-keys.mjs';

const RANGES = {
  hi: [[0x0900, 0x097f]], mr: [[0x0900, 0x097f]],            // Devanagari
  bn: [[0x0980, 0x09ff]],                                     // Bengali
  gu: [[0x0a80, 0x0aff]],                                     // Gujarati
  ta: [[0x0b80, 0x0bff]],                                     // Tamil
  te: [[0x0c00, 0x0c7f]],                                     // Telugu
  kn: [[0x0c80, 0x0cff]],                                     // Kannada
  ml: [[0x0d00, 0x0d7f]],                                     // Malayalam
  ur: [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]], // Arabic
};
// Values that are legitimately Latin in every language.
const ALLOW_LATIN = new Set([
  'UPI', 'WhatsApp', 'OTP', 'PIN', 'CSV', 'SMS', 'km', 'kg', 'Smart Khata',
  'EN', 'Razorpay', 'QR',
]);
// Keys whose value is a proper noun or an external system's own field name, and
// is therefore the same in every language. The Razorpay fields are labelled here
// exactly as Razorpay's own console labels them: a shopkeeper copying a key
// across is matching the words on the other screen, and translating them would
// make that harder, not easier.
// Shared with the web translation verifier — see scripts/lib/i18n-brand-keys.mjs.
const ALLOW_KEYS = BRAND_KEYS;

const FILES = [
  ['consumer', 'mobile-app/src/consumer/i18n.js'],
  ['owner', 'mobile-app/src/i18n.js'],
];

function blocks(src) {
  const out = {};
  const re = /\nconst ([a-z]{2}) = \{/g;
  const starts = [];
  let m;
  while ((m = re.exec(src))) starts.push([m[1], m.index]);
  starts.forEach(([code, pos], i) => {
    const end = i + 1 < starts.length ? starts[i + 1][1] : src.length;
    const body = src.slice(pos, end);
    const kv = {};
    const kre = /'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'/g;
    let k;
    while ((k = kre.exec(body))) kv[k[1]] = k[2];
    out[code] = kv;
  });
  return out;
}

const inScript = (s, ranges) => {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ranges.some(([lo, hi]) => c >= lo && c <= hi)) return true;
  }
  return false;
};
const hasAnyIndic = (s) => Object.values(RANGES).some((r) => inScript(s, r));

let wrong = 0;
let latin = 0;
let checked = 0;

for (const [name, path] of FILES) {
  const B = blocks(fs.readFileSync(path, 'utf8'));
  console.log(`\n${path}`);
  for (const [code, ranges] of Object.entries(RANGES)) {
    const kv = B[code];
    if (!kv) continue;
    const bad = [];
    const plain = [];
    for (const [k, v] of Object.entries(kv)) {
      // Strip placeholders AND punctuation/symbols. What is left is the only
      // part that COULD carry a script. A string like "{item} — {before} →
      // {after}" is pure format: there is nothing in it to translate, and
      // flagging it would train a reader to ignore this gate.
      const t = v
        .replace(/\{\w+\}/g, ' ')
        .replace(/[\s\p{P}\p{S}\d]+/gu, '')
        .trim();
      if (!t) continue;
      if (ALLOW_KEYS.has(k)) continue;
      checked += 1;
      if (inScript(t, ranges)) continue;
      if (ALLOW_LATIN.has(t)) continue;
      // Script of a DIFFERENT Indic language is the dangerous one: a row-shifted
      // paste. Latin-only is the other mistake: an untranslated cell shipped.
      if (hasAnyIndic(t)) bad.push([k, v]);
      else plain.push([k, v]);
    }
    wrong += bad.length;
    latin += plain.length;
    const verdict = bad.length || plain.length ? '' : ' ok';
    console.log(`  ${code}  ${String(Object.keys(kv).length).padStart(4)} values` +
      `  wrong-script ${bad.length}  latin-only ${plain.length}${verdict}`);
    bad.slice(0, 5).forEach(([k, v]) => console.log(`      WRONG SCRIPT  ${k} = ${v}`));
    plain.slice(0, 5).forEach(([k, v]) => console.log(`      LATIN ONLY    ${k} = ${v}`));
  }
}

console.log(`\n${checked} values checked.`);
if (wrong || latin) {
  console.log(`${wrong} in the wrong script, ${latin} left in Latin.`);
  console.log('A value must contain its own language\'s script, or be an allowed brand token.');
  process.exit(1);
}
console.log('Every value is in its own script (or an allowed brand token).');
