const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { isRegisteredLang, normalizeLangCode } = require('../utils/language-registry');

// Which language an override may be written for is the `languages` REGISTRY's
// call, not a constant in this file.
//
// It used to be a hardcoded list of seven that was supposed to "match LANGS in
// admin-dashboard/src/lib/i18n.js". It stopped matching anything the moment
// migration 0033 activated Bengali, Gujarati and Marathi: those three are live
// in the app and carry 852 audited strings each, yet an admin who spotted a
// wrong Marathi word got "Invalid lang" from the Translations screen and had no
// way to fix it. A translation tool that cannot edit a shipped language is not
// a translation tool.
//
// So the allowlist is read from the registry — and it is still an allowlist: an
// unregistered code is refused. STAGED (is_active=false) languages are included
// on purpose, because pre-translating a language before flipping it on is
// exactly what the staging rows in 0022_languages are for.

// PUBLIC — no auth. The customer PWA (possibly served from a different origin
// than the API) fetches this to layer live translation corrections over its
// built-in dict. Shaped as { lang: { key: value, ... }, ... }.
exports.overrides = async (_req, res) => {
  const r = await query('SELECT lang, key, value FROM i18n_overrides');
  const overrides = {};
  for (const row of r.rows) {
    if (!overrides[row.lang]) overrides[row.lang] = {};
    overrides[row.lang][row.key] = row.value;
  }
  // Cheap to serve but corrections show within ~a minute.
  res.set('Cache-Control', 'public, max-age=60');
  // The storefront may be a different origin than the API (Helmet's default
  // CORP is same-origin) — same reason product images relax CORP.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.json({ overrides });
};

// ADMIN — upsert (or delete) a single override. An empty/whitespace value
// reverts the key to its built-in text by removing the row.
exports.upsert = async (req, res) => {
  const { lang, key, value } = req.body || {};

  // Normalise BEFORE the allowlist check, and store the normalised code. A row
  // written as 'EN' or 'hi-IN' would never be found again by the lookups, which
  // read plain two-letter codes — a silently dead correction is worse than a
  // rejected one.
  const code = normalizeLangCode(lang);
  if (!code || !(await isRegisteredLang(code))) {
    throw ApiError.badRequest('Invalid lang');
  }
  if (typeof key !== 'string' || key.trim() === '' || key.length > 200) {
    throw ApiError.badRequest('Invalid key');
  }
  if (typeof value !== 'string' || value.length > 2000) {
    throw ApiError.badRequest('Invalid value');
  }

  if (value.trim() === '') {
    // Revert to the built-in translation.
    await query('DELETE FROM i18n_overrides WHERE lang = $1 AND key = $2', [code, key]);
    return res.json({ ok: true });
  }

  await query(
    `INSERT INTO i18n_overrides (lang, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (lang, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [code, key, value]
  );
  return res.json({ ok: true });
};
