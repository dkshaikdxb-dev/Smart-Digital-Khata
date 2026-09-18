// Snapshot the CURRENT value of every string a REVIEW decision governs, into
// that decision's `protected` block.
//
// A REVIEW row is one a native speaker has not read yet. Until they do, nothing
// may change it — not a reconciliation script, not a terminology sweep, not a
// well-meaning find-and-replace. The gate can only enforce that if it knows what
// the value is supposed to be, and before this the registry recorded that for
// exactly two decisions out of eight. The 36 machine-authored FAQ translations,
// the loudest thing in the queue, had no record at all.
//
// This writes ONLY the `protected` blocks. It never touches a dictionary, a
// decision's status, its scope, or any other field — run it, and `git diff`
// should show scripts/i18n-decisions.json and nothing else.
//
// Run it again after a native review lands and the new wording is applied, so
// the snapshot tracks the approved text rather than the superseded one.
//
//   node scripts/i18n-review-snapshot.mjs            # preview
//   node scripts/i18n-review-snapshot.mjs --apply    # write
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REGP = path.join(ROOT, 'scripts/i18n-decisions.json');
const APPS = [
  ['app/consumer', 'mobile-app/src/consumer/i18n.js'],
  ['app/owner', 'mobile-app/src/i18n.js'],
];

const registry = JSON.parse(fs.readFileSync(REGP, 'utf8'));
const WEB = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'));

// Values are written with either quote style — a string containing an apostrophe
// is double-quoted — so both have to be read or the snapshot silently misses one.
const kvOf = (blk) => {
  const o = {};
  for (const m of (blk || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  for (const m of (blk || '').matchAll(/'([^']+)':\s*"((?:[^"\\]|\\.)*)"/g)) o[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return o;
};
function appDict(rel) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const a = m.index, b = s.indexOf('\nconst ', a + 10);
    out[m[1]] = kvOf(s.slice(a, b > 0 ? b : s.length));
  }
  return out;
}
const APP = Object.fromEntries(APPS.map(([id, rel]) => [id, appDict(rel)]));
const DASH = {};
{
  const s = fs.readFileSync(path.join(ROOT, 'admin-dashboard/src/lib/i18n.js'), 'utf8');
  for (const m of s.matchAll(/\n {2}([a-z]{2}): \{/g)) {
    const a = m.index, b = s.indexOf('\n  },', a);
    DASH[m[1]] ||= {};
    for (const [k, v] of Object.entries(kvOf(s.slice(a, b > 0 ? b : s.length)))) if (!(k in DASH[m[1]])) DASH[m[1]][k] = v;
  }
}
const webValue = (lang, key) => (WEB[lang] && key in WEB[lang] ? WEB[lang][key] : DASH[lang]?.[key]);

let rows = 0;
const report = [];
for (const [id, d] of Object.entries(registry.decisions)) {
  if (d.status !== 'REVIEW') continue;
  const scope = d.protects;
  if (!scope || !scope.keys || !scope.langs) { report.push(`  ${id}: no 'protects' scope — skipped`); continue; }
  const prot = { };
  for (const lang of scope.langs) {
    for (const key of scope.keys) {
      const w = webValue(lang, key);
      if (w !== undefined) { (prot.web ||= {})[lang] ||= {}; prot.web[lang][key] = w; rows += 1; }
      for (const [sid] of APPS) {
        const v = APP[sid][lang]?.[key];
        if (v !== undefined) { (prot[sid] ||= {})[lang] ||= {}; prot[sid][lang][key] = v; rows += 1; }
      }
    }
  }
  const n = Object.values(prot).reduce((s, byLang) => s + Object.values(byLang).reduce((t, kv) => t + Object.keys(kv).length, 0), 0);
  d.protected = prot;
  report.push(`  ${id.padEnd(32)} ${String(n).padStart(4)} values across ${Object.keys(prot).join(', ') || '(none found)'}`);
}

console.log(report.join('\n'));
console.log(`\n${rows} REVIEW values snapshotted.`);
if (!process.argv.includes('--apply')) { console.log('preview only — pass --apply to write'); process.exit(0); }
fs.writeFileSync(REGP, JSON.stringify(registry, null, 2) + '\n', 'utf8');
console.log('written to scripts/i18n-decisions.json');
