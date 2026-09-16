// Check a returned shop-name lexicon before it renders anybody's shop sign.
//
// A transliteration can be checked far harder than a translation can, and this
// is the one place that is true: the answer is supposed to SOUND like the
// English key, so converting the native script BACK to Roman and comparing the
// consonant skeletons catches a wrong letter that reads perfectly fluently.
//
// কিরানা and কিসানা are both ordinary-looking Bengali. Only the round trip says
// one of them is "kisana" and the shop is a kirana store.
//
// Vowels are dropped before comparing, because English spelling is not
// phonetic and the vowels are where the legitimate variation lives (kumar ->
// কুমার is kumaara). Consonants are folded for the handful of equivalences that
// are always fine: c/k/s, v/b (Bengali has no v), z/j, w/v, aspiration, and
// doubled letters. What survives all that is a real mismatch.
//
// Output is a REPORT, not a gate: transliteration is lossy and a native reader
// makes the final call. But a flagged row is worth a human's ten seconds.
import fs from 'fs';
import path from 'path';
import Sanscript from '../backend/node_modules/@indic-transliteration/sanscript/sanscript.js';

const SCHEME = { bn: 'bengali', gu: 'gujarati', mr: 'devanagari', hi: 'devanagari' };
const SCRIPT_RE = {
  bn: /[ঀ-৿]/, gu: /[઀-૿]/, mr: /[ऀ-ॿ]/, hi: /[ऀ-ॿ]/,
};

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/shopname-lexicon-verify.mjs <file.csv>'); process.exit(2); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const filePath = path.isAbsolute(file) ? file : path.join(ROOT, file);
const lang = path.basename(filePath, '.csv').split(/[-_.]/).find((s) => SCHEME[s]);
if (!lang) { console.error('no language code in filename:', path.basename(filePath)); process.exit(2); }

// What the request asked for, read from the module itself so the two cannot drift.
const SRC = fs.readFileSync(path.join(ROOT, 'backend/src/utils/shop-name-i18n.js'), 'utf8');
function entries(constName) {
  const i = SRC.indexOf('const ' + constName);
  const j = SRC.indexOf('hi: Object.freeze({', i);
  const end = SRC.indexOf('}),', j);
  return [...SRC.slice(j, end).matchAll(/([a-z0-9_]+):\s*'([^']*)'/g)]
    .filter((m) => m[1] !== 'hi').map((m) => m[1]);
}
const WORDS = entries('BUSINESS_LEXICON');
const NAMES = entries('SURNAMES');
const ASKED = [...WORDS, ...NAMES];

const rows = [];
for (const raw of fs.readFileSync(filePath, 'utf8').split('\n')) {
  const line = raw.replace(/\r$/, '');
  if (!line.trim() || line.startsWith('#')) continue;
  const i = line.indexOf(',');
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  if (k === 'english') continue;
  rows.push([k, line.slice(i + 1).trim()]);
}

// Consonant skeleton, after folding the equivalences that are always legitimate.
function skeleton(s) {
  // ANUSVARA FIRST, while case still distinguishes it. সিং reads back from
  // ITRANS as "siM" — a nasal written as a diacritic, where the English spells
  // out ng/n. Folding it here rather than as a trailing-m rule matters: the
  // trailing-m rule also rewrote the real final m of "emporium" and flagged a
  // correct answer.
  return s.replace(/M/g, 'n')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    // SOFT c AND g, before they are folded as hard ones. English spelling is the
    // problem this whole module exists for: "centre" is /s/ and "general" is
    // /dʒ/, and a checker that folds them to k and g flags every correct answer.
    // "-tion" is said "-shon". Bengali writes what it hears (কালেকশন), so
    // comparing against the English SPELLING flags a correct answer.
    .replace(/tion/g, 'shon')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/kh|gh|ch|jh|th|dh|ph|bh/g, (m) => m[0])   // aspiration is not a consonant change
    .replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/f/g, 'p')                                  // one letter ফ carries both
    .replace(/v/g, 'b')                                  // Bengali has no v
    .replace(/z/g, 'j')                                  // nor z
    .replace(/sh|s\.h/g, 's')
    // GLIDES. w and y are written in Bengali as ওয়া / য়, which read back as
    // vowel clusters rather than consonants — "hardware" is হার্ডওয়্যার and round
    // trips without a w. Dropping them on BOTH sides is the only honest
    // comparison.
    .replace(/[wy]/g, '')
    .replace(/ng/g, 'n')
    .replace(/[aeiou]/g, '')
    .replace(/(.)\1+/g, '$1');                           // doubled letters
}
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const seen = new Map();
const problems = [];
const flagged = [];
for (const [en, native] of rows) {
  if (!ASKED.includes(en)) { problems.push([en, 'not a key that was asked for']); continue; }
  seen.set(en, native);
  if (!native) { problems.push([en, 'empty']); continue; }
  if (/[A-Za-z]/.test(native)) { problems.push([en, `Latin left in the answer: ${native}`]); continue; }
  if (!SCRIPT_RE[lang].test(native)) { problems.push([en, `not in the ${lang} script: ${native}`]); continue; }

  let roman = '';
  try { roman = Sanscript.t(native, SCHEME[lang], 'itrans'); } catch { /* reported below */ }
  if (!roman) { problems.push([en, 'could not be transliterated back']); continue; }
  const a = skeleton(en), b = skeleton(roman);
  const d = distance(a, b);
  if (d > 0) flagged.push({ en, native, roman, a, b, d });
}

const missing = ASKED.filter((k) => !seen.has(k));
console.log(`${path.basename(filePath)}: ${rows.length} rows — ${ASKED.length} asked, ${seen.size} answered`);
if (missing.length) console.log(`  MISSING (${missing.length}): ${missing.join(', ')}`);
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const [k, why] of problems) console.log(`  ${k}: ${why}`);
}
flagged.sort((x, y) => y.d - x.d);
if (flagged.length) {
  console.log(`\nSOUND MISMATCH — the native form read back does not match the English (worst first):`);
  for (const f of flagged) {
    console.log(`  ${f.en.padEnd(14)} ${f.native.padEnd(16)} reads back as "${f.roman}"   [${f.a} vs ${f.b}, distance ${f.d}]`);
  }
}
if (!missing.length && !problems.length && !flagged.length) console.log('\nEverything round-trips.');
