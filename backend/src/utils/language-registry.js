// The ONE place the server asks "is this a language this app supports?".
//
// The answer is the `languages` registry table (migration 0022, extended by
// 0033/0034/0039) — never a constant list in a controller. Three separate
// hardcoded arrays had already drifted apart from it: the dashboard's built-in
// LANGS, i18n.controller's own copy of the same seven, and the weekly summary's.
// When migration 0033 activated Bengali, Gujarati and Marathi, every one of
// those arrays quietly became wrong, and a shopkeeper who picked one of the
// three was pushed back to English.
//
// It stays a CLOSED ALLOWLIST: a code that is not a row in `languages` is
// refused. Registered-but-inactive (staged) codes ARE accepted, because
// pre-translating a language before switching it on is what staging is for;
// callers that specifically need "is it live for users" pass activeOnly.

const { query } = require('../config/db');

// The shape the registry itself validates (languages.controller CODE_RE).
const CODE_RE = /^[a-z]{2,8}$/;

/**
 * Normalise a raw language value to a bare code, or null when it cannot be one.
 * Trims, lowercases and takes the primary subtag, so 'hi-IN' → 'hi' and
 * '  MR ' → 'mr'. Returns null for empty/garbage rather than a guess.
 */
function normalizeLangCode(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  const primary = s.split(/[-_]/)[0];
  return CODE_RE.test(primary) ? primary : null;
}

/**
 * Every code in the registry, as a Set. `activeOnly` narrows it to the
 * languages currently switched on for users.
 */
async function registeredLangs({ activeOnly = false } = {}) {
  const r = await query(
    activeOnly
      ? 'SELECT code FROM languages WHERE is_active = true'
      : 'SELECT code FROM languages'
  );
  return new Set(r.rows.map((row) => row.code));
}

/**
 * Is `raw` a language this app supports? Normalises first, so 'hi-IN' passes on
 * the strength of the 'hi' row.
 */
async function isRegisteredLang(raw, opts) {
  const code = normalizeLangCode(raw);
  if (!code) return false;
  const set = await registeredLangs(opts);
  return set.has(code);
}

/**
 * `raw` as a supported code, or null. The shape to use when STORING a
 * preference: an unsupported code is dropped rather than written, so nothing
 * downstream has to wonder whether a stored value is real.
 */
async function toStorableLang(raw, opts) {
  const code = normalizeLangCode(raw);
  if (!code) return null;
  return (await isRegisteredLang(code, opts)) ? code : null;
}

/**
 * Resolve a caller's `?lang=` to the language the CATALOGUE should be READ in.
 *
 * 'en' is the base language and always the fallback: it reads the plain English
 * columns with no i18n join, so an unknown code, a code with no localized
 * catalogue, or an unreadable registry all degrade to English and the catalogue
 * still renders. Anything the registry marks has_catalogue = true localizes.
 *
 * This replaces the identical hardcoded seven-code Set that had been copied into
 * product.controller, catalog.controller and discovery.controller. Those copies
 * were written before Bengali, Gujarati and Marathi had a catalogue and were
 * never revisited when it arrived, so the query simply never asked for Bengali —
 * 481 finished Bengali terms could sit in the table and every consumer response
 * would still come back in English. Reading the capability from the registry,
 * which migration 0075 derives from the catalogue rows themselves, means the
 * read path follows the data instead of a developer's memory of it.
 */
async function resolveCatalogueLang(raw) {
  const code = normalizeLangCode(raw);
  if (!code || code === 'en') return 'en';
  try {
    const r = await query('SELECT 1 FROM languages WHERE code = $1 AND has_catalogue = true', [code]);
    return r.rowCount ? code : 'en';
  } catch (err) {
    // The catalogue must always render; an unreadable registry means English,
    // never a 500 on a public storefront.
    return 'en';
  }
}

/**
 * Resolve a caller's `?lang=` to the language a piece of PER-CAMPAIGN or
 * PER-RECORD authored content should be served in — content that lives in an
 * i18n blob on its own row, not in the shipped catalogue.
 *
 * The question here is NOT resolveCatalogueLang's question. That one asks "has
 * this language got a translated catalogue", answered by languages.has_catalogue,
 * which migration 0075 derives from the catalog_i18n rows themselves. Promo
 * creative is not in catalog_i18n at all: it is whatever a marketer typed into
 * ad_campaigns.i18n for one campaign. A language can have a Bengali promo written
 * for it and no Bengali catalogue, or a catalogue and no promo, and the row's own
 * COALESCE already falls back to the base column when the creative is missing.
 * So the only gate this path needs is the one the catalogue gate takes for
 * granted: is this a language the platform actually serves to users?
 *
 * That is `languages.is_active` — the registry column the platform admin flips
 * when a language goes live, and the same set the consumer app's own language
 * picker is built from. A code the shopper can choose in the app is a code the
 * app must be able to answer in. Registered-but-inactive codes (pa/or/as, staged
 * for a later launch) resolve to 'en': they are capacity, not a live language,
 * and nothing should be serving content in them yet.
 *
 * Gating on has_catalogue instead would be wrong in both directions — it would
 * refuse a language that is live but has no catalogue, and it would accept a
 * staged one the moment somebody imported terms for it.
 *
 * As with the catalogue resolver, 'en' is the base and the only failure mode: an
 * unknown code, an inactive one, or an unreadable registry all degrade to English
 * so a public, unauthenticated surface still renders.
 */
async function resolveServingLang(raw) {
  const code = normalizeLangCode(raw);
  if (!code || code === 'en') return 'en';
  try {
    const r = await query('SELECT 1 FROM languages WHERE code = $1 AND is_active = true', [code]);
    return r.rowCount ? code : 'en';
  } catch (err) {
    return 'en';
  }
}

module.exports = {
  CODE_RE,
  normalizeLangCode,
  registeredLangs,
  isRegisteredLang,
  toStorableLang,
  resolveCatalogueLang,
  resolveServingLang,
};
