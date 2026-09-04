const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// The 7 supported language codes — must match LANGS in
// admin-dashboard/src/lib/i18n.js.
const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur'];

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

  if (!LANGS.includes(lang)) {
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
    await query('DELETE FROM i18n_overrides WHERE lang = $1 AND key = $2', [lang, key]);
    return res.json({ ok: true });
  }

  await query(
    `INSERT INTO i18n_overrides (lang, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (lang, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [lang, key, value]
  );
  return res.json({ ok: true });
};
