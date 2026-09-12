// Person-name localization for API rows — the ONE place that turns `?lang=`
// into an optional `<field>_local` sibling. Rendering is delegated to the same
// deterministic proper-noun engine used for shop names (curated surnames +
// best-effort transliteration + raw English fallback) in shop-name-i18n; this
// module only decides WHEN to attach the rendered value and under which key.
//
// Rules (shared by customers, families and orders so every screen agrees):
//   - ?lang= absent / '' / 'en' / unknown  -> null -> rows are returned as-is
//     (no *_local key at all; the stored raw name is the only name shown).
//   - ?lang= a RENDER_LANG                 -> `${field}_local` is added beside the
//     raw field. The raw field is never changed (edit/search/order keep using it).
const { RENDER_LANGS, localizeShopName } = require('./shop-name-i18n');

/** Resolve a raw ?lang= value to a render language, or null. */
function renderLang(raw) {
  const lang = String(raw == null ? '' : raw).trim().toLowerCase();
  return RENDER_LANGS.includes(lang) ? lang : null;
}

/** Render one person name into `lang` (raw name back for null / non-render). */
function localizeName(name, lang) {
  return localizeShopName(name, lang).name;
}

/**
 * Return a copy of `row` with `<field>_local` = row[field] rendered into `lang`.
 * Pure, in-process, O(1) per row. When lang is null (or the row is falsy) the
 * row is returned unchanged — no key is added.
 */
function withLocalField(row, field, lang) {
  if (!row || !lang) return row;
  return { ...row, [`${field}_local`]: localizeName(row[field], lang) };
}

/** Customer rows: `name` -> `name_local`. */
function withNameLocal(row, lang) {
  return withLocalField(row, 'name', lang);
}

/** Rows that carry a joined `customer_name`: -> `customer_name_local`. */
function withCustomerNameLocal(row, lang) {
  return withLocalField(row, 'customer_name', lang);
}

module.exports = {
  renderLang,
  localizeName,
  withLocalField,
  withNameLocal,
  withCustomerNameLocal,
};
