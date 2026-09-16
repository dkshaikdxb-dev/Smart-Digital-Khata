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
const lang = path.basename(file).replace(/^web-/, '').replace(/-\d+$/, '').replace(/\.csv$/, '').replace(/-\d+$/, '');
if (!SCRIPT[lang]) { console.error('unknown language in filename:', lang); process.exit(2); }

const filePath = path.isAbsolute(file) ? file : path.join(ROOT, file);
const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
const head = rows.shift().map((h) => h.trim());
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
const phOf = (s) => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort();

const accepted = {}; const rejected = []; let blank = 0;
for (const r of rows) {
  const key = (r[K] || '').trim();
  // Always compare placeholders against the repo's English, never the file's.
  const en = staticValue('en', key) || '';
  const tr = (r[T] || '').trim();
  const rej = (why) => rejected.push({ key, why, tr });

  if (!key) { rej('row has no key'); continue; }
  if (!known.has(key)) { rej('key is not in this repo’s dictionary'); continue; }
  // Identity: when the file echoes the English, it must still describe the
  // string it claims to. This is the check that caught a row bled in from
  // another language's file.
  if (E >= 0 && (r[E] || '') !== en) { rej('english no longer matches the repo — row may have shifted'); continue; }
  if (!tr) { blank++; continue; }
  if (tr === en) { rej('left in English'); continue; }
  if (tr.includes('�')) { rej('contains U+FFFD (mojibake)'); continue; }

  const want = phOf(en), got = phOf(tr);
  if (want.join('|') !== got.join('|')) { rej(`placeholder drift: expected ${want.join(' ') || '(none)'} got ${got.join(' ') || '(none)'}`); continue; }

  const stripped = tr.replace(/\{[a-zA-Z0-9_]+\}/g, ' ');
  const foreign = OTHER[lang].filter((o) => SCRIPT[o].test(stripped));
  if (foreign.length) { rej(`written in the wrong script (${foreign.join('/')}) — bled from another file`); continue; }
  if (!SCRIPT[lang].test(stripped) && !LATIN_OK.test(tr)) { rej('no character of this language’s own script'); continue; }

  accepted[key] = tr;
}

const n = Object.keys(accepted).length;
console.log(`${file}: ${rows.length} rows — ${n} accepted, ${rejected.length} rejected, ${blank} left blank`);

// TRUNCATION. The most likely way a run of this size goes wrong is the model
// quietly stopping near the end, and a short reply is indistinguishable from a
// complete one by eye. When the request this answers is on disk, the key sets
// are compared: a missing key is a row that was never translated, not a row
// that was rejected, and nothing above would have said so.
let truncated = 0;
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
