// Take the web strings that are ALREADY translated, from the apps.
//
// 204 of the 566 web strings a shopkeeper or shopper can see have an English
// source that is character-for-character identical to a string in one of the two
// native app dictionaries — where every language is already at 97-99%, reviewed.
// Asking a model to translate those again is not just wasted effort: it is how
// the same English ends up saying two different things on two screens of one
// product. Bengali was translated without this step and now has 135 such pairs
// ("Products" is জিনিস in the app and জিনিসপত্র on the web).
//
// So: copy them across first, and only send what is genuinely missing.
//
// SAFETY. Identical English is not always identical MEANING — a short word can
// be a button on one screen and a label on another ("Open" the verb vs "Open"
// the state). Two guards:
//   - placeholders must match between the two English sources, so a string that
//     drops or gains one is never copied;
//   - very short strings are reported, not copied silently, because they are
//     where an English collision is most likely to hide a different sense.
import fs from 'fs';
import path from 'path';
import { getAllKeys, staticValue } from '../admin-dashboard/src/lib/i18n.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const SHORT = 3; // a word this short is reported rather than copied

function blocks(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const start = m.index;
    const next = s.indexOf('\nconst ', start + 10);
    out[m[1]] = s.slice(start, next > 0 ? next : s.length);
  }
  return out;
}
const pairs = (b) => {
  const o = {};
  for (const m of (b || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2];
  return o;
};
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).slice().sort().join('|');

// english text -> { translation, from } for one language, across both apps.
function appStrings(lang) {
  const map = new Map();
  for (const file of APPS) {
    const b = blocks(file);
    const en = pairs(b.en);
    const tr = pairs(b[lang]);
    for (const [k, v] of Object.entries(en)) {
      if (!tr[k]) continue;
      const key = v.trim();
      // A collision inside the apps themselves (two keys, same English,
      // different translation) is not safe to copy either.
      if (map.has(key) && map.get(key).translation !== tr[k]) { map.get(key).ambiguous = true; continue; }
      if (!map.has(key)) map.set(key, { translation: tr[k], from: `${path.basename(file)}:${k}` });
    }
  }
  return map;
}

const lang = process.argv[2];
const apply = process.argv.includes('--apply');
if (!lang) { console.error('usage: node scripts/web-i18n-seed-from-apps.mjs <lang> [--apply]'); process.exit(2); }

const regPath = path.join(ROOT, 'backend/src/data/regional-i18n.json');
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
const have = reg[lang] || {};
const requested = fs.readFileSync(path.join(ROOT, `docs/i18n-web/web-${lang}.csv`), 'utf8')
  .split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[0]);

const app = appStrings(lang);
const copied = {};
const short = [];
const ambiguous = [];
const already = [];
for (const key of requested) {
  const en = (staticValue('en', key) || '').trim();
  const hit = app.get(en);
  if (!hit) continue;
  if (hit.ambiguous) { ambiguous.push([key, en]); continue; }
  if (ph(en) !== ph(hit.translation)) { ambiguous.push([key, `${en} — placeholders differ`]); continue; }
  if (have[key]) { already.push([key, en, have[key], hit.translation]); continue; }
  if (en.length <= SHORT) { short.push([key, en, hit.translation]); continue; }
  copied[key] = hit.translation;
}

console.log(`${lang}: ${requested.length} requested`);
console.log(`  ${Object.keys(copied).length} can be taken verbatim from the apps`);
if (short.length) console.log(`  ${short.length} too short to copy blind (reported below)`);
if (ambiguous.length) console.log(`  ${ambiguous.length} skipped — the same English means two things, or placeholders differ`);
if (already.length) {
  const differ = already.filter(([, , web, appv]) => web !== appv);
  console.log(`  ${already.length} already had a web translation; ${differ.length} of those DISAGREE with the app`);
}
if (short.length) {
  console.log('\nSHORT STRINGS — check the sense before copying:');
  for (const [k, en, tr] of short) console.log(`  ${k.padEnd(22)} "${en}" -> ${tr}`);
}
if (!apply) { console.log('\n(dry run — pass --apply to write them)'); process.exit(0); }
if (!Object.keys(copied).length) { console.log('\nnothing to write'); process.exit(0); }

reg[lang] = { ...have, ...copied };
const ordered = {};
for (const k of Object.keys(reg[lang]).sort()) ordered[k] = reg[lang][k];
reg[lang] = ordered;
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
console.log(`\nwrote ${Object.keys(copied).length} strings to regional-i18n.json under "${lang}"`);
