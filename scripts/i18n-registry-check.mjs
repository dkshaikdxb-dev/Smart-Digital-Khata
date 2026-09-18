// The gate that makes scripts/i18n-decisions.json binding.
//
// Without this, the registry is another document that drifts from the code —
// which is the failure it was written to stop. Seven times now a real
// relationship in this codebase lived in a comment or a duplicated list instead
// of a check, and seven times it drifted.
//
// What it enforces:
//
//   1. A LOCKED decision's value is what the dictionaries actually say. A
//      decision that has quietly stopped being true is not a decision.
//   2. gu-orthography as a CORPUS INVARIANT, not a token list: no loanword
//      lemma may appear in both its candra and its plain spelling. A NEW
//      loanword inherits the rule — this is what a token list could not do, and
//      why that decision had to be flipped three times.
//   3. Protected brand terms keep their casing wherever they appear. Six rows
//      drifted into web/app conflict because the old single set only covered
//      bare labels.
//   4. The standing invariants: no native digits, no transliterated WhatsApp,
//      Balance and Outstanding never collide.
//   5. REVIEW rows are IMMUTABLE. Where the registry recorded the current
//      value, it must still be the current value — a REVIEW row that something
//      silently "fixed" has been decided by a tool instead of a person.
//   6. The two divergence sets are still exactly what the registry says. If a
//      pair converges or a new one appears, that is a decision somebody made,
//      and it belongs in the registry before it belongs in the dictionaries.
//
// What it deliberately does NOT do: treat web != app as a defect, treat a
// cross-language difference as a defect, or prefer either surface. There is no
// default in this file.
import fs from 'fs';
import path from 'path';
import { BRAND_TERMS, brandTermCasingErrors } from './lib/i18n-brand-keys.mjs';

// I18N_ROOT lets the mutation suite point this gate at a throwaway copy of the
// dictionaries. A check nobody can test is a check nobody can trust — the hole
// this override exposes (see i18n-registry-check.test.mjs) is exactly how a
// LOCKED value drifting in the owner dictionary went unnoticed.
const ROOT = process.env.I18N_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPS = ['mobile-app/src/consumer/i18n.js', 'mobile-app/src/i18n.js'];
const DASHP = path.join(ROOT, 'admin-dashboard/src/lib/i18n.js');

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/i18n-decisions.json'), 'utf8'));
const WEB = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/src/data/regional-i18n.json'), 'utf8'));

function appBlocks(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = {};
  for (const m of s.matchAll(/\nconst ([a-z]{2}) = \{/g)) {
    const a = m.index, b = s.indexOf('\nconst ', a + 10);
    out[m[1]] = s.slice(a, b > 0 ? b : s.length);
  }
  return out;
}
const kvOf = (blk) => {
  const o = {};
  for (const m of (blk || '').matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) o[m[1]] = m[2].replace(/\\'/g, "'");
  return o;
};
// The two app dictionaries are kept SEPARATE, one entry per file. Merging them
// and keeping the first hit is how a drift in mobile-app/src/i18n.js went
// unseen for any key the consumer dictionary also has: the gate read the
// consumer copy and reported OK. 35 gu keys live in both files and 4 of them
// legitimately say different things, so "one app value" is not a thing that
// exists. Every rule below walks APP_FILES and checks each copy on its own.
const APP_FILES = APPS.map((f) => ({
  id: f.includes('/consumer/') ? 'app/consumer' : 'app/owner',
  langs: Object.fromEntries(Object.entries(appBlocks(f)).map(([lang, blk]) => [lang, kvOf(blk)])),
}));
const appCopies = (lang, key) => APP_FILES
  .map((f) => ({ id: f.id, value: f.langs[lang]?.[key] }))
  .filter((c) => c.value !== undefined);
// en and hi live in the dashboard's own catalog, which is split across several
// merged objects, so read every `  <lang>: {` block rather than the first.
const DASH = {};
{
  const s = fs.readFileSync(DASHP, 'utf8');
  for (const m of s.matchAll(/\n {2}([a-z]{2}): \{/g)) {
    const a = m.index, b = s.indexOf('\n  },', a);
    const lang = m[1];
    DASH[lang] ||= {};
    for (const [k, v] of Object.entries(kvOf(s.slice(a, b > 0 ? b : s.length)))) if (!(k in DASH[lang])) DASH[lang][k] = v;
  }
}
const webValue = (lang, key) => (WEB[lang] && key in WEB[lang] ? WEB[lang][key] : DASH[lang]?.[key]);

const fail = [];
const bad = (rule, detail) => fail.push({ rule, detail });

/* 1 — every LOCKED decision still holds -------------------------------- */
for (const [id, d] of Object.entries(registry.decisions)) {
  if (d.status !== 'LOCKED' || !d.values) continue;
  const surfaces = new Set(d.scope?.surfaces ?? ['web', 'app']);
  for (const [lang, kv] of Object.entries(d.values)) {
    for (const [key, spec] of Object.entries(kv)) {
      const per = typeof spec === 'string' ? { web: spec, app: spec } : spec;
      if (surfaces.has('web') && per.web !== undefined) {
        const got = webValue(lang, key);
        if (got !== undefined && got !== per.web) bad(id, `web ${lang} ${key}\n      want: ${per.web}\n      got:  ${got}`);
      }
      if (surfaces.has('app') && per.app !== undefined) {
        for (const c of appCopies(lang, key)) {
          if (c.value !== per.app) bad(id, `${c.id} ${lang} ${key}\n      want: ${per.app}\n      got:  ${c.value}`);
        }
      }
    }
  }
}

/* 2 — gu orthography, as an invariant over the whole corpus ------------- */
{
  const d = registry.decisions['gu-orthography'];
  const plain = (w) => w.replace(/ઑ/g, 'ઓ').replace(/ૉ/g, 'ો')
                        .replace(/ઍ/g, 'એ').replace(/ૅ/g, 'ે');
  const corpus = [];
  for (const [k, v] of Object.entries(WEB.gu || {})) corpus.push(['web', k, v]);
  for (const f of APP_FILES) for (const [k, v] of Object.entries(f.langs.gu || {})) corpus.push([f.id, k, v]);

  // The RULE: any lemma written with a candra vowel anywhere must never appear
  // in its plain spelling. Built from the corpus itself, so a loanword nobody
  // has listed is still covered.
  const seen = new Map();  // plain form -> Set of spellings actually used
  for (const [, , v] of corpus) {
    for (const w of String(v).split(/[^઀-૿]+/)) {
      if (!w) continue;
      const p = plain(w);
      (seen.get(p) || seen.set(p, new Set()).get(p)).add(w);
    }
  }
  for (const [p, forms] of seen) {
    if (forms.size < 2) continue;
    const where = corpus.filter(([, , v]) => [...forms].some((f) => String(v).includes(f)))
      .slice(0, 4).map(([s, k]) => `${s}:${k}`).join(', ');
    bad('gu-orthography', `"${p}" is spelled ${forms.size} ways — ${[...forms].join(' | ')}  (${where})`);
  }
  // The seeded lemmas must still be candra-spelled somewhere, or the decision
  // has been reversed wholesale without touching the registry.
  for (const lemma of d.loanword_lemmas) {
    if (!corpus.some(([, , v]) => String(v).includes(lemma))) {
      bad('gu-orthography', `locked loanword "${lemma}" no longer appears anywhere — reversed without a registry entry?`);
    }
  }
}

/* 3 — protected brand terms keep their casing --------------------------- */
const BRAND_EXCEPT = registry.decisions['brand-registry-split'].exceptions || {};
for (const [lang, kv] of Object.entries({ ...Object.fromEntries(Object.entries(WEB).map(([l, o]) => [`web:${l}`, o])),
                                          ...Object.fromEntries(APP_FILES.flatMap((f) => Object.entries(f.langs).map(([l, o]) => [`${f.id}:${l}`, o]))),
                                          ...Object.fromEntries(Object.entries(DASH).map(([l, o]) => [`dash:${l}`, o])) })) {
  for (const [key, v] of Object.entries(kv)) {
    if (key in BRAND_EXCEPT) continue;
    for (const e of brandTermCasingErrors(v)) {
      bad('brand-registry-split', `${lang} ${key} spells "${e.term}" as "${e.found}"`);
    }
  }
}

/* 4 — the standing invariants ------------------------------------------ */
{
  const DIGITS = { bn: /[০-৯]/, gu: /[૦-૯]/, mr: /[०-९]/, hi: /[०-९]/ };
  for (const [lang, re] of Object.entries(DIGITS)) {
    for (const [src, kv] of [['web', WEB[lang]], ['dash', DASH[lang]], ...APP_FILES.map((f) => [f.id, f.langs[lang]])]) {
      for (const [k, v] of Object.entries(kv || {})) if (re.test(v)) bad('native-digits-latin', `${src} ${lang} ${k}: ${v}`);
    }
  }
  // Scoped to the languages the decision actually claims. Urdu still writes the
  // name in its own script and is parked as whatsapp-latin-urdu; failing it here
  // would be the cross-language analogy the registry forbids.
  const WA = /হোয়াট|વૉટ્સ|વોટ્સ|व्हॉट्स|वॉट्स|واٹس/;
  for (const lang of registry.decisions['whatsapp-latin'].scope.langs) {
    for (const [src, kv] of [['web', WEB[lang]], ['dash', DASH[lang]], ...APP_FILES.map((f) => [f.id, f.langs[lang]])]) {
      for (const [k, v] of Object.entries(kv || {})) if (WA.test(v)) bad('whatsapp-latin', `${src} ${lang} ${k}: ${v}`);
    }
  }

  for (const lang of registry.decisions['balance-vs-outstanding'].scope.langs) {
    for (const [src, get] of [['web', (k) => webValue(lang, k)],
                              ...APP_FILES.map((f) => [f.id, (k) => f.langs[lang]?.[k]])]) {
      const b = get('common.balance'), o = get('common.outstanding');
      if (b && o && b === o) bad('balance-vs-outstanding', `${src} ${lang}: both render "${b}"`);
    }
  }
}

/* 4b — product-item scope, resolved from the ENGLISH source -------------
   The key list in product-item.values is the RESULT of the rule, not the rule.
   Enforcing only that list is how chelp.e2.a and chelp.e3.a sat in UNDECIDED
   while their English ("just say the item name", "add the items you want to
   your cart") was squarely inside a LOCKED decision. This evaluates the rule
   itself, against each surface's OWN English block, so a NEW countable-item
   key cannot quietly render with the mass word.

   One direction only, and deliberately: countable English must not use the
   mass word. The converse is not a rule — "You have taken off everything" is
   mass English that correctly uses neither word. */
{
  const d = registry.decisions['product-item'];
  const COUNT = new RegExp(d.scope.english.count_markers.join('|'), 'i');
  const MASS = new RegExp(d.scope.english.mass_markers.join('|'), 'i');
  // mass_keys maps key -> why it is outside the countable rule. One list, and
  // every entry has to say why: an exception nobody can read is how the
  // catalogue decision nearly wrote "catalogue" into "hidden from lists".
  const massKeys = new Set(Object.keys(d.scope.mass_keys || {}));
  // The mass word as it appears in the locked values, derived rather than
  // re-typed: it is whatever the mass_keys render that the count values do not.
  const MASS_WORD = /સામાન(?!્ય)/;
  const enOf = {
    web: (k) => DASH.en?.[k],
    ...Object.fromEntries(APP_FILES.map((f) => [f.id, (k) => f.langs.en?.[k]])),
  };
  for (const lang of d.scope.langs) {
    for (const [src, kv] of [['web', WEB[lang]], ...APP_FILES.map((f) => [f.id, f.langs[lang]])]) {
      for (const [key, v] of Object.entries(kv || {})) {
        if (massKeys.has(key)) continue;
        const en = (enOf[src]?.(key) || '').trim();
        if (!en || !COUNT.test(en) || MASS.test(en)) continue;
        if (MASS_WORD.test(v)) {
          bad('product-item', `${src} ${lang} ${key} is countable in English but renders the mass word`
            + `\n      en: ${en.slice(0, 90)}\n      ${lang}: ${v.slice(0, 90)}`
            + `\n      -> add it to product-item.values, or declare it in scope.exclusions with a reason`);
        }
      }
      for (const [key, v] of Object.entries(kv || {})) {
        for (const dep of (d.deprecated_terms?.[lang] || [])) {
          if (String(v).includes(dep)) bad('product-item', `${src} ${lang} ${key} still uses the deprecated term "${dep}"`);
        }
      }
    }
  }
}

/* 5 — REVIEW rows are immutable ----------------------------------------- */
for (const [id, d] of Object.entries(registry.decisions)) {
  if (d.status !== 'REVIEW' || !d.current || !d.lang) continue;
  for (const [k, want] of Object.entries(d.current)) {
    const seenAt = [['web', webValue(d.lang, k)], ...appCopies(d.lang, k).map((c) => [c.id, c.value])];
    for (const [where, got] of seenAt) {
      if (got !== undefined && got !== want) bad(id, `REVIEW row changed without a decision: ${where} ${d.lang} ${k}\n      was:  ${want}\n      now:  ${got}`);
    }
  }
}

/* 6 — the divergence sets are still what the registry records ------------ */
{
  const KL = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/keylevel-decisions.json'), 'utf8'));
  const live = { INTENTIONAL_DIVERGENCE: {}, UNDECIDED: {} };
  for (const lang of ['bn', 'gu', 'mr']) {
    live.INTENTIONAL_DIVERGENCE[lang] = []; live.UNDECIDED[lang] = [];
    for (const [k, v] of Object.entries(WEB[lang] || {})) {
      const copies = appCopies(lang, k);
      if (!copies.length || copies.every((c) => c.value === v)) continue;
      // Intentional by EITHER route: the older keylevel file said keep-web, or a
      // decision in this registry declares the key app-specific. The second exists
      // because consumer-faq-app-variants gives the app its own FAQ answers, and
      // keylevel-decisions.json is a frozen reconciliation artefact that must not
      // grow new rows. A bare list entry is not enough — some decision has to name
      // the key, so "recorded" still means "explained".
      const declared = (registry.divergences.INTENTIONAL_DIVERGENCE.keys[lang] || []).includes(k)
        && Object.values(registry.decisions).some((d) => (d.scope?.keys || []).includes(k));
      (KL[lang]?.[k] === 'web' || declared ? live.INTENTIONAL_DIVERGENCE : live.UNDECIDED)[lang].push(k);
    }
  }
  for (const set of ['INTENTIONAL_DIVERGENCE', 'UNDECIDED']) {
    for (const lang of ['bn', 'gu', 'mr']) {
      const want = new Set(registry.divergences[set].keys[lang] || []);
      const got = new Set(live[set][lang]);
      for (const k of got) if (!want.has(k)) bad('divergences', `${set} ${lang}: ${k} is newly divergent and is in no decision`);
      for (const k of want) if (!got.has(k)) bad('divergences', `${set} ${lang}: ${k} no longer diverges — record the decision that converged it`);
    }
  }
}

/* ------------------------------------------------------------------ out */
const locked = Object.values(registry.decisions).filter((d) => d.status === 'LOCKED').length;
const review = Object.values(registry.decisions).filter((d) => d.status === 'REVIEW').length;
if (!fail.length) {
  console.log(`i18n registry: OK`);
  console.log(`  ${locked} LOCKED decisions hold on every surface they claim`);
  console.log(`  ${review} REVIEW decisions parked and untouched — they do not block the freeze`);
  console.log(`  ${registry.divergences.INTENTIONAL_DIVERGENCE.count} intentional web/app divergences preserved`);
  console.log(`  ${registry.divergences.UNDECIDED.count} undecided divergences left alone`);
  console.log(`  ${BRAND_TERMS.length} protected brand terms, casing verified`);
  process.exit(0);
}
const byRule = {};
for (const f of fail) (byRule[f.rule] ||= []).push(f.detail);
console.error(`i18n registry: ${fail.length} violation(s)\n`);
for (const [rule, list] of Object.entries(byRule)) {
  console.error(`--- ${rule} — ${list.length} ---`);
  for (const d of list.slice(0, 12)) console.error(`  ${d}`);
  if (list.length > 12) console.error(`  … ${list.length - 12} more`);
  console.error('');
}
process.exit(1);
