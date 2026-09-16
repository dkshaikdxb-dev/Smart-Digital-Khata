// Check a returned web-console translation file before any of it ships.
//
// Usage: node scripts/web-i18n-verify.mjs docs/i18n-web/web-bn.csv [--apply]
//
// The last consolidated round came back with rows whose text belonged to a
// DIFFERENT language — Tamil sitting in Malayalam rows. Nothing about a filled
// cell looks wrong on its own; what caught it was that a bled row no longer
// matched the English it claimed to translate. So the first check here is
// identity, not quality: key and english must still be exactly what this repo
// ships. A row failing ANY check is rejected and reported, never repaired
// quietly — a silently "fixed" translation is one nobody reviewed.
//
// --apply merges the accepted rows into backend/src/data/regional-i18n.json,
// which import:i18n loads into i18n_overrides on every deploy.
import fs from 'fs';
import path from 'path';
import { getAllKeys, staticValue } from '../admin-dashboard/src/lib/i18n.js';
import { BRAND_KEYS } from './lib/i18n-brand-keys.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Unicode ranges that ARE the language's own script.
const SCRIPT = {
  bn: /[ঀ-৿]/, gu: /[઀-૿]/, mr: /[ऀ-ॿ]/,
  hi: /[ऀ-ॿ]/, ta: /[஀-௿]/, te: /[ఀ-౿]/,
  kn: /[ಀ-೿]/, ml: /[ഀ-ൿ]/, ur: /[؀-ۿݐ-ݿ]/,
};
// Scripts that are NOT this language's — a row carrying one of these bled in
// from another file. Devanagari is shared by hi and mr, so they never flag
// each other.
const OTHER = {
  bn: ['gu', 'ta', 'te', 'kn', 'ml', 'ur', 'hi'], gu: ['bn', 'ta', 'te', 'kn', 'ml', 'ur', 'hi'],
  mr: ['bn', 'gu', 'ta', 'te', 'kn', 'ml', 'ur'], hi: ['bn', 'gu', 'ta', 'te', 'kn', 'ml', 'ur'],
  ta: ['bn', 'gu', 'te', 'kn', 'ml', 'ur', 'hi'], te: ['bn', 'gu', 'ta', 'kn', 'ml', 'ur', 'hi'],
  kn: ['bn', 'gu', 'ta', 'te', 'ml', 'ur', 'hi'], ml: ['bn', 'gu', 'ta', 'te', 'kn', 'ur', 'hi'],
  ur: ['bn', 'gu', 'ta', 'te', 'kn', 'ml', 'hi'],
};
// Brand tokens and units that may legitimately stay Latin inside a translation.
const LATIN_OK = /^(?:UPI|WhatsApp|Razorpay|Smart Khata|Smart Digital Khata|PDF|CSV|OTP|SMS|QR|GST|PIN|KYC|ETA|km|kg|g|ml|L|%|₹|[\d\s.,:;()/+\-–—×@&'"!?]|\{[a-zA-Z0-9_]+\})+$/;

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('usage: node scripts/web-i18n-verify.mjs <file.csv> [--apply]'); process.exit(2); }
// The language is whichever segment of the filename IS a language code, rather
// than whatever is left after stripping the suffixes I happened to think of.
// Files arrive as web-bn.csv, web-bn-01.csv, web-bn-01b.csv, and whatever a
// re-run gets called next; peeling suffixes one regex at a time fails on the
// first shape nobody predicted, which is how `bn-01b` became an "unknown
// language".
const lang = path.basename(file, '.csv').split(/[-_.]/).find((seg) => SCRIPT[seg]);
if (!lang) { console.error('no language code in filename:', path.basename(file)); process.exit(2); }

// A key,translation reply, parsed by SPLITTING AT THE FIRST COMMA.
//
// General CSV parsing is wrong for this shape. A model returns a field like
//   brand.subtitle,… premium look — colour, tagline, "Premium" badge …
// unquoted, with commas AND quotes inside it, which a correct CSV parser is
// obliged to mangle: the commas split the row and the quote flips it into
// quoted mode. But the KEY can never contain a comma, and there are exactly two
// columns, so the first comma is the only separator that matters and everything
// after it is the translation, verbatim. A surrounding pair of quotes is
// stripped only when it wraps the WHOLE value.
//
// A continuation line (a translation containing a newline) is appended to the
// previous row rather than read as a keyless record.
function parseKeyValue(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    const i = line.indexOf(',');
    const looksLikeRecord = i > 0 && /^[A-Za-z][A-Za-z0-9_.]*$/.test(line.slice(0, i).trim());
    if (!looksLikeRecord) {
      if (out.length) out[out.length - 1][1] += '\n' + line;
      continue;
    }
    // Do NOT trim here. A leading space can be the whole point of a string:
    // lang.betaSuffix is " (beta)", appended to a language name, and trimming
    // it renders "বাংলা(বিটা)". Surrounding quotes are still unwrapped; the
    // decision about whitespace is made later against the English, which is the
    // only thing that knows whether a space belongs.
    let value = line.slice(i + 1).replace(/^\uFEFF/, '');
    const t = value.trim();
    if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) {
      value = t.slice(1, -1).replace(/""/g, '"');
    }
    out.push([line.slice(0, i).trim(), value]);
  }
  return out;
}

const filePath = path.isAbsolute(file) ? file : path.join(ROOT, file);
const raw = fs.readFileSync(filePath, 'utf8');
const firstLine = (raw.split('\n')[0] || '').trim();
const twoCol = /^key\s*,\s*translation\s*$/i.test(firstLine);
const rows = twoCol ? parseKeyValue(raw) : parseCsv(raw);
const head = twoCol ? ['key', 'translation'] : rows.shift().map((h) => h.trim());
if (twoCol && rows.length && rows[0][0] === 'key') rows.shift();
const col = (name, required = true) => {
  const i = head.indexOf(name);
  if (i < 0 && required) { console.error('missing column:', name); process.exit(2); }
  return i;
};
const K = col('key');
const T = col('translation');
// The `english` column is OPTIONAL, because the leaner return we now ask for is
// just key + translation. That is the stronger shape, not a concession: the KEY
// travels with the translation, so a row that shifts cannot silently pair text
// with the wrong string, and the English is read from this repo — the source of
// truth — instead of from a column the model re-emitted and may have reflowed.
// When a file does carry `english` (the original five-column sheets), it is
// still checked, because then a mismatch is real evidence of a shifted row.
const E = col('english', false);

const known = new Set(getAllKeys());
// `{s}` is two different things in this dictionary, and only one of them is a
// value the translation must carry:
//
//   "{n} item{s}"                 -> s: count > 1 ? 's' : ''   ENGLISH PLURAL
//   "This order is {s} — …"       -> s: t('postatus.'+status)  A STATUS WORD
//
// Bengali does not mark plurals with a suffix, so keeping the first would print
// "জিনিসs"; dropping it is the correct translation. Dropping the second loses
// the only word that says what happened to the order. They are told apart by
// what precedes them: a plural marker is GLUED to the word it pluralises
// (item{s}), a value stands alone ( {s} ).
//
// The first real reply got both of these right and my checker rejected it for
// the one it got right — which is how a gate ends up training people to ignore
// it, or worse, to "fix" a correct translation to satisfy it.
function droppablePlural(en) {
  return new Set([...String(en).matchAll(/\w\{s\}/g)].map(() => '{s}'));
}
const phOf = (s) => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort();

const accepted = {}; const rejected = []; let blank = 0;
for (const r of rows) {
  const key = (r[K] || '').trim();
  // Always compare placeholders against the repo's English, never the file's.
  const en = staticValue('en', key) || '';
  // Match the English's own edges: keep a leading/trailing space only where the
  // source has one, so a stray space after the comma is dropped and a
  // deliberate one (" (beta)") survives.
  let tr = String(r[T] || '');
  if (!/^\s/.test(en)) tr = tr.replace(/^\s+/, '');
  if (!/\s$/.test(en)) tr = tr.replace(/\s+$/, '');
  const rej = (why) => rejected.push({ key, why, tr });

  if (!key) { rej('row has no key'); continue; }
  if (!known.has(key)) { rej('key is not in this repo’s dictionary'); continue; }
  // Identity: when the file echoes the English, it must still describe the
  // string it claims to. This is the check that caught a row bled in from
  // another language's file.
  if (E >= 0 && (r[E] || '') !== en) { rej('english no longer matches the repo — row may have shifted'); continue; }
  if (!tr) { blank++; continue; }
  // "Unchanged" is only a defect when there was something to change. A source
  // like "{item} — {before} → {after}" is placeholders and punctuation with no
  // words in it; returning it identical is the correct answer, not a skipped
  // row. Rejecting those told a translator to invent a difference.
  // A brand key is correct BECAUSE it is English — see lib/i18n-brand-keys.mjs.
  if (tr === en && !BRAND_KEYS.has(key) && /[A-Za-z]/.test(en.replace(/\{[a-zA-Z0-9_]+\}/g, ''))) {
    rej('left in English'); continue;
  }
  if (tr.includes('�')) { rej('contains U+FFFD (mojibake)'); continue; }

  // NATIVE-SCRIPT DIGITS. The brief says numerals stay Latin, and they must:
  // every amount, count and date the app renders comes from the code as
  // 1,250.00 and 30, so a hand-written ৯৮ or ৫৬০০০১ inside a label sits next to
  // Latin digits produced a line away. A phone-number example in Bengali digits
  // is also a worked example of what NOT to type into the box below it.
  const nativeDigits = [...tr].filter((c) => /\p{Nd}/u.test(c) && !/[0-9]/.test(c));
  if (nativeDigits.length) { rej(`native-script digits (${[...new Set(nativeDigits)].join('')}) — numerals stay Latin`); continue; }

  const optional = droppablePlural(en);
  const want = phOf(en), got = phOf(tr);
  const missing = want.filter((p) => !got.includes(p) && !optional.has(p));
  const extra = got.filter((p) => !want.includes(p));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`dropped ${missing.join(' ')}`);
    if (extra.length) parts.push(`added ${extra.join(' ')}`);
    rej(`placeholder drift: ${parts.join(', ')} (english has ${want.join(' ') || 'none'})`);
    continue;
  }

  // Strip placeholders AND the shared Indic punctuation before asking which
  // script this is. U+0964/U+0965 (danda, double danda) sit in the DEVANAGARI
  // block but are the full stop in Bengali, Gujarati, Odia, Punjabi and more —
  // so a correct Bengali sentence ending in "।" was being rejected as "written
  // in Hindi". That was 30 good rows out of 116 on the first real reply, and
  // exactly the kind of false positive that teaches people to ignore a gate.
  const stripped = tr
    .replace(/\{[a-zA-Z0-9_]+\}/g, ' ')
    .replace(/[\u0964\u0965]/g, ' ');
  const foreign = OTHER[lang].filter((o) => SCRIPT[o].test(stripped));
  if (foreign.length) { rej(`written in the wrong script (${foreign.join('/')}) — bled from another file`); continue; }
  // Same rule as above: a source with no WORDS in it cannot produce a
  // translation with script characters, and demanding one would force a
  // translator to add something that is not there.
  const enHasWords = /[A-Za-z]/.test(en.replace(/\{[a-zA-Z0-9_]+\}/g, ''));
  if (enHasWords && !BRAND_KEYS.has(key) && !SCRIPT[lang].test(stripped) && !LATIN_OK.test(tr)) {
    rej('no character of this language’s own script'); continue;
  }

  accepted[key] = tr;
}

// A CURRENCY WORD NEXT TO AN AMOUNT THAT ALREADY CARRIES ₹.
//
// Every money placeholder in this app arrives pre-formatted — money()/inr()
// put the ₹ in — so a translation that writes "{amount} টাকা" renders
// "₹500.00 টাকা", i.e. "₹500.00 rupees". Harmless to understand, but it is not
// what the English says and not what a person would write.
//
// A WARNING, not a rejection, and the fix is deliberately not made here:
// dropping the word works in "আপনি {amount} টাকা কমাচ্ছেন" but not in
// "{amount} টাকার জিনিস", where the genitive is doing grammatical work and the
// sentence has to be rephrased instead. That is a native speaker's call.
//
// Only fires when the word sits WITHIN a few characters of the placeholder, and
// never when the English itself says "rupee" — oalert.spoken is read aloud by a
// speech engine from an unformatted number and correctly says টাকা.
const CURRENCY_WORD = {
  bn: 'টাকা', hi: 'रुपये|रुपए', mr: 'रुपये', gu: 'રૂપિયા', ta: 'ரூபாய்',
  te: 'రూపాయల|రూపాయి', kn: 'ರೂಪಾಯಿ', ml: 'രൂപ', ur: 'روپے',
};
function redundantCurrencyWord(lang, en, tr) {
  const word = CURRENCY_WORD[lang];
  if (!word || /rupee/i.test(en) || !/\{[a-zA-Z0-9_]+\}/.test(en)) return false;
  return new RegExp(`\\{[a-zA-Z0-9_]+\\}[^\\s]{0,3}\\s?(${word})`).test(tr);
}

// NOT CHECKED HERE: spelling drift inside one reply.
//
// The first good Bengali reply spelled "Premium" প্রিমিয়াম five times and
// পিমিয়াম once, and transliterated "advance" two ways. Both are real, both read
// as fluent text, and no check here sees them. An edit-distance heuristic was
// written for exactly this and then removed: it flagged ordinary Bengali
// inflection (দিয়ে/দিয়েই, পারে/পারেন) as suspect, and it MISSED the typo that
// motivated it, because প্রিমিয়াম/পিমিয়াম differ by a conjunct — two codepoints,
// not one. A noisy gate that fails on its own founding example teaches people
// to ignore gates. This belongs to the native-speaker review, which is where a
// reader who knows the language is the right instrument.
const n = Object.keys(accepted).length;
console.log(`${file}: ${rows.length} rows — ${n} accepted, ${rejected.length} rejected, ${blank} left blank`);

// TRUNCATION. The most likely way a run of this size goes wrong is the model
// quietly stopping near the end, and a short reply is indistinguishable from a
// complete one by eye. When the request this answers is on disk, the key sets
// are compared: a missing key is a row that was never translated, not a row
// that was rejected, and nothing above would have said so.
let truncated = 0;
const currencyNotes = Object.entries(accepted)
  .filter(([k, v]) => redundantCurrencyWord(lang, staticValue('en', k) || '', v));
if (currencyNotes.length) {
  console.log(`\nWORTH A LOOK — ${currencyNotes.length} row(s) put a currency word after an amount that already carries ₹:`);
  for (const [k, v] of currencyNotes.slice(0, 8)) console.log(`  ${k}: ${v}`);
  console.log('  Applied anyway. Dropping the word suits some of these and not others — leave it to the native review.');
}

const base = path.basename(file);
const langOf = base.replace(/^web-/, '').replace(/-\d+\.csv$/, '').replace(/\.csv$/, '');
const candidates = [
  path.join(ROOT, 'docs/i18n-web', `web-${langOf}-parts`, base),
  path.join(ROOT, 'docs/i18n-web', base),
  path.join(ROOT, 'docs/i18n-web', `web-${langOf}.csv`),
];
const requestFile = candidates.find((c) => fs.existsSync(c) && path.resolve(c) !== path.resolve(filePath));
if (requestFile) {
  const reqRows = parseCsv(fs.readFileSync(requestFile, 'utf8'));
  const reqHead = reqRows.shift().map((h) => h.trim());
  const rk = reqHead.indexOf('key');
  const asked = reqRows.map((r) => (r[rk] || '').trim()).filter(Boolean);
  const answered = new Set(rows.map((r) => (r[K] || '').trim()));
  const missing = asked.filter((k) => !answered.has(k));
  console.log(`\nagainst ${path.relative(ROOT, requestFile)}: ${asked.length} asked, ${asked.length - missing.length} answered`);
  truncated = missing.length;
  if (missing.length) {
    console.log(`  ${missing.length} ROWS NEVER CAME BACK — the reply was cut short, not merely wrong:`);
    console.log(`    first missing: ${missing.slice(0, 3).join(', ')}`);
    console.log(`    last missing:  ${missing.slice(-3).join(', ')}`);
    console.log('  Re-run that part and ask for the missing keys, rather than accepting a partial file.');
  }
}
if (rejected.length) {
  console.log('\nREJECTED (not applied, nothing repaired silently):');
  const byWhy = {};
  for (const r of rejected) (byWhy[r.why] ||= []).push(r.key);
  for (const [why, keys] of Object.entries(byWhy).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(keys.length).padStart(4)}  ${why}`);
    console.log(`        e.g. ${keys.slice(0, 4).join(', ')}`);
  }
}

if (!apply) { console.log('\n(dry run — pass --apply to merge the accepted rows)'); process.exit(rejected.length || truncated ? 1 : 0); }
if (!n) { console.log('\nnothing accepted; not writing'); process.exit(1); }

const regPath = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
reg[lang] = { ...(reg[lang] || {}), ...accepted };
const ordered = {};
for (const k of Object.keys(reg[lang]).sort()) ordered[k] = reg[lang][k];
reg[lang] = ordered;
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
console.log(`\napplied ${n} strings to ${path.relative(ROOT, regPath)} under "${lang}"`);
