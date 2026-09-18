// One guard, imported by every script that writes a dictionary.
//
// scripts/i18n-decisions.json governs four kinds of row:
//
//   LOCKED                 somebody decided this wording. Tooling may not change it.
//   REVIEW                 nobody who speaks the language has read it yet.
//   INTENTIONAL_DIVERGENCE web and app say different things ON PURPOSE.
//   UNDECIDED              web and app differ and nobody has ruled.
//
// Eight scripts in this directory can still rewrite a dictionary, and until now
// exactly one of them had heard of the registry. Re-running any of the other
// seven — a terminology sweep, a reconciliation pass, a seed-from-apps — could
// have flattened an intentional divergence, resolved an undecided row by
// whatever default that script happened to carry, or overwritten a translation
// that is waiting on a native speaker. Nothing would have stopped it at the
// moment of writing; CI would have reported it afterwards, and only for the
// rows a guard happened to cover.
//
// So the check moved to the write itself. `guardedWrite` compares the content a
// script is about to write against what is on disk, works out which
// (language, key) pairs actually changed, and refuses the whole write if any of
// them is governed. It is deliberately all-or-nothing: a partial write would
// leave the corpus in a state no decision describes.
//
// An override exists and is meant to be awkward: I18N_ALLOW_GOVERNED_WRITE must
// name the decision statuses being overridden, e.g.
//
//   I18N_ALLOW_GOVERNED_WRITE=REVIEW node scripts/some-apply.mjs --apply
//
// That is for the moment a native review lands and the approved wording replaces
// the machine-authored one — a deliberate act by a person who knows which status
// they are setting aside, not a flag anybody sets by habit.
import fs from 'fs';
import path from 'path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.I18N_ROOT || path.resolve(HERE, '../..');

let cache = null;
function registry() {
  if (!cache) cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-decisions.json'), 'utf8'));
  return cache;
}

/**
 * Every value a RULE-BASED LOCKED decision governs, as
 * { decision, surface, lang, key, want }.
 *
 * Most LOCKED decisions carry a `values` map and the gate checks that directly.
 * Three of them — unit-counter, catalogue-loanword, prepaid-mechanism — state a
 * rule instead ("c.unit and common.unit only", "English source contains
 * 'catalog'") and name no values at all, so for a long time they were LOCKED in
 * name and unenforced in fact: 14 strings that a decision claimed to hold and
 * nothing checked.
 *
 * The strings themselves were already written down. When the native-review
 * queue retired the rows those decisions had answered, it recorded what each
 * one said at retirement, per surface. That is the value map, in the only place
 * it exists, and this reads it rather than transcribing it somewhere else —
 * a second copy is how the first drift happened.
 *
 * A row is read here only while its answering decision has no `values` of its
 * own. Give one an explicit map later and it goes back to the ordinary LOCKED
 * check, with no entry left behind to contradict it.
 */
export function ruleLockedRows(reg = registry()) {
  const out = [];
  for (const d of Object.values(reg.decisions)) {
    for (const row of d.superseded_rows || []) {
      const owner = reg.decisions[row.answered_by];
      if (!owner || owner.status !== 'LOCKED') continue;
      if (owner.values && Object.keys(owner.values).length) continue;
      for (const [surface, want] of Object.entries(row.value_at_retirement || {})) {
        // A row names one key per surface: the web and the app often spell the
        // same string under different names — web c.unit is app shopdetail.unit.
        const key = row.key ?? (surface === 'web' ? row.web : row.app);
        if (key) out.push({ decision: row.answered_by, surface, lang: row.lang, key, want });
      }
    }
  }
  return out;
}

/**
 * The governance status of one (lang, key), or null when nothing governs it.
 * LOCKED wins over REVIEW wins over the divergence sets, because that is the
 * order in which a human decided something about the row.
 */
export function governedStatus(lang, key) {
  const reg = registry();
  for (const r of ruleLockedRows(reg)) {
    if (r.lang === lang && r.key === key) return { status: 'LOCKED', decision: r.decision };
  }
  for (const [id, d] of Object.entries(reg.decisions)) {
    if (d.status === 'LOCKED' && d.values?.[lang]?.[key] !== undefined) return { status: 'LOCKED', decision: id };
    if (d.status === 'REVIEW' && d.protected) {
      for (const byLang of Object.values(d.protected)) {
        if (byLang?.[lang]?.[key] !== undefined) return { status: 'REVIEW', decision: id };
      }
    }
  }
  const div = reg.divergences || {};
  if ((div.INTENTIONAL_DIVERGENCE?.keys?.[lang] || []).includes(key)) return { status: 'INTENTIONAL_DIVERGENCE', decision: 'divergences' };
  if ((div.UNDECIDED?.keys?.[lang] || []).includes(key)) return { status: 'UNDECIDED', decision: 'divergences' };
  return null;
}

// Values are written with either quote style — a string containing an apostrophe
// is double-quoted — so both have to be read or a changed row is missed.
const kvOf = (blk) => {
  const o = {};
  for (const m of (blk || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2];
  for (const m of (blk || '').matchAll(/'([^']+)':\s*"((?:[^"\\]|\\.)*)"/g)) o[m[1]] = m[2];
  return o;
};

/** Parse either dictionary shape into { lang: { key: value } }. */
function parseDict(file, content) {
  if (file.endsWith('.json')) {
    try { return JSON.parse(content); } catch (e) { return null; }
  }
  const out = {};
  for (const m of content.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const a = m.index, b = content.indexOf('\nconst ', a + 10);
    out[m[1]] = kvOf(content.slice(a, b > 0 ? b : content.length));
  }
  for (const m of content.matchAll(/\n {2}([a-z]{2}): \{/g)) {
    const a = m.index, b = content.indexOf('\n  },', a);
    out[m[1]] ||= {};
    for (const [k, v] of Object.entries(kvOf(content.slice(a, b > 0 ? b : content.length)))) if (!(k in out[m[1]])) out[m[1]][k] = v;
  }
  return out;
}

/** Every (lang, key) whose value differs between two dictionary snapshots. */
export function changedRows(file, before, after) {
  const A = parseDict(file, before), B = parseDict(file, after);
  if (!A || !B) return [];
  const rows = [];
  for (const lang of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const a = A[lang] || {}, b = B[lang] || {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] !== b[key]) rows.push({ lang, key, from: a[key], to: b[key] });
    }
  }
  return rows;
}

/**
 * Write a dictionary, refusing the whole file if the change touches a governed
 * row. `file` is an absolute path; `content` is the full new text.
 */
export function guardedWrite(file, content, opts = {}) {
  const label = opts.label || path.relative(ROOT, file);
  // The registry itself is the record of the decisions, not a dictionary: it is
  // meant to be edited, and guarding it against its own contents is circular.
  if (file.endsWith('i18n-decisions.json')) { fs.writeFileSync(file, content, 'utf8'); return { written: true, refused: [] }; }

  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  // `opts.allow` is for the ONE script whose job is to write a given status:
  // apply-registry-decisions.mjs exists to carry LOCKED values out to the
  // dictionaries, so refusing it LOCKED rows would refuse it its whole purpose.
  // It is not a general escape hatch — no caller passes REVIEW or either
  // divergence status, and the env override remains the only way to those.
  const allowed = new Set([
    ...(opts.allow || []),
    ...String(process.env.I18N_ALLOW_GOVERNED_WRITE || '').split(',').map((s) => s.trim()).filter(Boolean),
  ]);
  const refused = [];
  for (const row of changedRows(file, before, content)) {
    const g = governedStatus(row.lang, row.key);
    if (g && !allowed.has(g.status)) refused.push({ ...row, ...g });
  }
  if (refused.length) {
    const lines = refused.slice(0, 15).map((r) => `    ${r.status.padEnd(22)} ${r.lang} ${r.key}   (${r.decision})`);
    const more = refused.length > 15 ? `\n    … ${refused.length - 15} more` : '';
    throw new Error(
      `REFUSED to write ${label}: ${refused.length} governed row(s) would change.\n${lines.join('\n')}${more}\n`
      + '  These are governed by scripts/i18n-decisions.json. Change them through the\n'
      + '  registry, or, if a native review has landed, re-run with\n'
      + `  I18N_ALLOW_GOVERNED_WRITE=${[...new Set(refused.map((r) => r.status))].join(',')}`
    );
  }
  fs.writeFileSync(file, content, 'utf8');
  return { written: true, refused: [] };
}

export default guardedWrite;
