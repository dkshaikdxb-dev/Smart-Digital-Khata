/**
 * Search normalization primitives (NLQ-A). Pure, deterministic, dependency-free
 * so they are trivially unit-testable and behave identically on the write path
 * (building products.search_text) and the read path (normalizing a query). No
 * runtime services, no network — everything here is local string work.
 */

// Match the first "<number><unit>" pair in a pack string, e.g. "1 kg", "500g",
// "1.5 litre". Mirrors the idea of the frontend extractFirstNumber (a bare
// integer/decimal) but also captures the trailing unit word.
const PACK_RE = /(\d+(?:\.\d+)?)\s*([a-z]+)/;

/**
 * Lowercase, strip punctuation to spaces, collapse whitespace, trim. Unicode
 * letters (\p{L}), digits (\p{N}) and combining marks (\p{M}) are preserved —
 * only punctuation and symbols become spaces — so native scripts survive
 * intact. Keeping \p{M} is essential for Indic scripts, where vowel signs
 * (matras, e.g. the "ा" in "चावल"/"टाटा") are marks, not letters.
 */
function normalizeText(str) {
  if (str == null) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * From a pack string like "1 kg" produce common spoken/typed search tokens:
 * "1 kg", "1kg", and — for kg/g and litre/ml — the gram/millilitre equivalents
 * ("1 kg" -> "1000 g" / "1000g"). Returns a space-joined string, or '' when the
 * pack is unparseable. These are extra SEARCH tokens only; the structured
 * pack/unit on catalog_items is never restructured.
 */
function packVariants(pack) {
  if (pack == null) return '';
  const m = String(pack).toLowerCase().match(PACK_RE);
  if (!m) return '';
  const numStr = m[1];
  const unit = m[2];
  const n = Number(numStr);
  const out = new Set([`${numStr} ${unit}`, `${numStr}${unit}`]);
  if (Number.isFinite(n)) {
    if (unit === 'kg') {
      const g = Math.round(n * 1000);
      out.add(`${g} g`);
      out.add(`${g}g`);
    } else if (unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'liter') {
      const ml = Math.round(n * 1000);
      out.add(`${ml} ml`);
      out.add(`${ml}ml`);
    }
  }
  return Array.from(out).join(' ');
}

/**
 * Colloquial/spoken unit + small-number words mapped to their canonical search
 * token, applied ONLY when normalizing a QUERY (never to fabricate product
 * data). Short, safe, Hindi-baseline list: "1 kilo"/"ek kilo" -> "1 kg" so they
 * hit the packVariants tokens. Extend deliberately; keep it conservative.
 */
const colloquialUnitMap = {
  kilo: 'kg',
  kilos: 'kg',
  kg: 'kg',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  litre: 'l',
  liter: 'l',
  ltr: 'l',
  ek: '1',
  do: '2',
  teen: '3',
  adha: '0.5',
  aadha: '0.5',
};

/**
 * Build the normalized search blob for one product. `i18n` is an array of
 * { name, aliases } rows (all languages for the product's linked master term).
 * The result is a superset of the SQL backfill: it adds the richer packVariants
 * (gram/ml equivalents) on top of name + product + brand + unit + every i18n
 * name/aliases, all run through normalizeText.
 */
function buildProductSearchText({ name, product, brand, pack, unit, i18n } = {}) {
  const parts = [name, product, brand, unit, packVariants(pack)];
  for (const row of i18n || []) {
    if (row && row.name) parts.push(row.name);
    if (row && row.aliases) parts.push(row.aliases);
  }
  return normalizeText(parts.filter(Boolean).join(' '));
}

/**
 * Normalize a consumer query: normalizeText, then map colloquial unit/number
 * words token-wise to canonical forms ("1 kilo" -> "1 kg", "ek kilo" -> "1 kg").
 * Returns { normalized, tokens } where tokens is the de-duped, non-empty word
 * list (used to build the ILIKE-ANY recall net).
 */
function normalizeQuery(q) {
  const base = normalizeText(q);
  const mapped = base
    .split(' ')
    .filter(Boolean)
    .map((t) => (Object.prototype.hasOwnProperty.call(colloquialUnitMap, t) ? colloquialUnitMap[t] : t));
  const tokens = Array.from(new Set(mapped));
  return { normalized: mapped.join(' '), tokens };
}

module.exports = {
  normalizeText,
  packVariants,
  colloquialUnitMap,
  buildProductSearchText,
  normalizeQuery,
};
