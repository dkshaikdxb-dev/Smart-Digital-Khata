// Build the request that would let bn / gu / mr render a shop's NAME natively.
//
// Everything else a Bengali shopkeeper sees is now Bengali — the console, the
// storefront, the catalogue — and the shop's own name is still Latin. The
// localizer excludes bn/gu/mr with the comment "no script mapping and no
// catalog transliteration today", and that reason has expired: the
// transliteration engine already ships `bengali`, `gujarati` and `devanagari`
// schemes, and Marathi IS Devanagari, the same script Hindi already uses.
//
// What is genuinely missing is the CURATED half. The module is a hybrid on
// purpose: raw Latin->Indic transliteration turns "Store" into স্তোরে, so the
// recurring business words are looked up in a human-picked lexicon first and
// only the proper nouns go through the engine. That lexicon has no bn/gu/mr
// column, and inventing one here is exactly what the review process exists to
// prevent.
//
// 43 shop words + 70 surnames per language. The two are different jobs and are
// asked for differently: a shop word is TRANSLATED the way shopkeepers say it,
// a surname is TRANSLITERATED so it sounds right when read aloud.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'backend/src/utils/shop-name-i18n.js'), 'utf8');
const OUT = path.join(ROOT, 'docs', 'i18n-shopnames');

const LANGS = {
  bn: { name: 'Bengali', script: 'Bengali' },
  gu: { name: 'Gujarati', script: 'Gujarati' },
  mr: { name: 'Marathi', script: 'Devanagari' },
};

function entries(constName, lang) {
  const i = SRC.indexOf('const ' + constName);
  const j = SRC.indexOf(`${lang}: Object.freeze({`, i);
  if (j < 0) return [];
  const end = SRC.indexOf('}),', j);
  return [...SRC.slice(j, end).matchAll(/([a-z0-9_]+):\s*'([^']*)'/g)]
    .filter((m) => m[1] !== lang)
    .map((m) => [m[1], m[2]]);
}

// Hindi is the reference column: it is review-grade per the module's own
// comment, and for Marathi it is the SAME SCRIPT, so showing it turns most of
// that language's job into "confirm or correct" rather than "write from
// scratch".
const words = entries('BUSINESS_LEXICON', 'hi');
const names = entries('SURNAMES', 'hi');

fs.mkdirSync(OUT, { recursive: true });
for (const [code, L] of Object.entries(LANGS)) {
  const sameScriptAsHindi = L.script === 'Devanagari';
  const body = `SHOP-NAME WORDS — ${L.name.toUpperCase()} (${code})

HOW TO USE
  ${words.length + names.length} short entries. Paste everything between the two
  lines below into Gemini in one go, and save the reply.

------------------------------- PASTE FROM HERE -------------------------------

Smart Digital Khata shows a kirana shop's own name to customers in their
language. A name like "Sri Balaji General Stores" or "Das Family Store" is
rendered by looking up the recurring business words in a curated list and
transliterating the rest, so the two lists below are what that lookup needs.

Write each entry in ${L.name}, in the ${L.script} script.

Return a CSV with exactly two columns: english and ${code}. One row per input
row, same order, english copied exactly. Return nothing but the CSV.

SECTION A — SHOP WORDS (${words.length}). These are TRANSLATED, not spelled out
letter by letter: write what a shopkeeper in a ${L.name}-speaking town would
actually paint on their board. Where the real word on the board is the English
loanword (store, general, medical), write that loanword in ${L.script} rather
than a pure word nobody uses.

SECTION B — SURNAMES (${names.length}). These are TRANSLITERATED, not
translated: a family name has no meaning to render, only a sound. Write each so
that a ${L.name} reader saying it aloud produces the name its owner answers to.

Rules for both:
  - Every character in ${L.script}, with no Latin left in any answer.
  - Lower case ASCII keys in the english column stay exactly as given.
  - No entry should be left blank or marked "same as English".
${sameScriptAsHindi
  ? `  - A Hindi column is included. Marathi uses the SAME SCRIPT, so many entries
    will be identical — copy them where they are right, and change them where
    Marathi genuinely differs (किराणा, not किराना). Do not change one merely to
    look different.`
  : `  - A Hindi column is included ONLY as a sense check of what each word means
    in a shop; it is a different script, so never copy from it.`}

After the CSV, list any entry you were unsure about.

english,hi${sameScriptAsHindi ? ' (same script — confirm or correct)' : ' (meaning reference only)'},${code}
${[['# SECTION A — shop words', ''], ...words, ['# SECTION B — surnames', ''], ...names]
  .map(([k, hi]) => (k.startsWith('#') ? k : `${k},${hi},`))
  .join('\n')}

-------------------------------- TO HERE --------------------------------------
`;
  fs.writeFileSync(path.join(OUT, `PASTE-shopwords-${code}.txt`), body, 'utf8');
  console.log(`${L.name.padEnd(10)} ${words.length} shop words + ${names.length} surnames  ->  docs/i18n-shopnames/PASTE-shopwords-${code}.txt`);
}
