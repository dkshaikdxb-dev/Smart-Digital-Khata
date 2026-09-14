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

module.exports = { CODE_RE, normalizeLangCode, registeredLangs, isRegisteredLang, toStorableLang };
