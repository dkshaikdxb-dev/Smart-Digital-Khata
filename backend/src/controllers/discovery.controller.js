const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizeQuery } = require('../utils/search-normalize');

// pg_trgm word-similarity threshold for single-word fuzzy recall (typos / noisy
// ASR). `qn <% blob` is true when word_similarity(qn, blob) >= this. 0.6 (the
// pg_trgm default) is too strict to catch a one-char slip ("namk" -> "namak");
// 0.5 catches those while still rejecting unrelated words. Applied per-request
// via SET LOCAL inside the search transaction, so it never leaks to other
// queries on the pooled connection. It is a fixed server-side constant (never
// user input), so it is safe as a numeric literal in the SET statement.
const WORD_SIM_THRESHOLD = 0.5;

// Languages the consumer catalogue can be viewed in. 'en' is the base language:
// it uses the plain English products.name with NO i18n join, so the response
// shape and behaviour are exactly as before. Any other known lang LEFT JOINs
// catalog_i18n for a localized product name (English fallback). Mirrors
// catalog.controller's resolveLang (owner catalogue) so both paths agree.
const KNOWN_LANGS = new Set(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']);

// Resolve ?lang= to a known language, defaulting to 'en'. Unknown/absent values
// fall back to 'en' (base behaviour) rather than erroring — the public
// catalogue must always render.
function resolveLang(raw) {
  const lang = (raw || '').trim().toLowerCase();
  return KNOWN_LANGS.has(lang) ? lang : 'en';
}

// Great-circle distance (km) between the query point and a shop's coords, via
// the haversine formula (Earth radius 6371 km). Returns NULL when the shop has
// no latitude/longitude (arithmetic with NULL yields NULL), so unlocated shops
// are simply never assigned a distance. `$lat`/`$lng` are placeholder tokens
// substituted with the real bind-parameter indexes at call time.
const haversineKm = ($lat, $lng) =>
  `2*6371*asin(sqrt( pow(sin(radians((${$lat}-latitude)/2)),2)` +
  ` + cos(radians(${$lat}))*cos(radians(latitude))*pow(sin(radians((${$lng}-longitude)/2)),2) ))`;

/**
 * Public, unauthenticated: browse listed shops. Only shops that opted in
 * (is_listed = true) are ever exposed, and only minimal, non-sensitive fields —
 * no phones, balances, or owner info. Optional name/city filters. When both a
 * valid lat and lng are supplied, each located shop gets a great-circle
 * distance_km and results are ordered nearest-first; otherwise ordered by name.
 */
exports.listShops = async (req, res) => {
  const { search, city, lat, lng, fulfillment } = req.query;
  const useDistance = lat !== undefined && lng !== undefined;
  const limit = Math.min(100, Math.max(1, req.query.limit || 50));
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';

  const params = [];

  // Localized SHOP name (batch SHOPNAME): for a non-'en' lang, LEFT JOIN
  // shop_name_i18n and return COALESCE(sn.name, s.name). Search filter and
  // ordering stay on the raw English s.name (a stable key). en path: no join.
  let nameSelect = 's.name';
  let nameJoin = '';
  if (localized) {
    params.push(lang);
    nameSelect = 'COALESCE(sn.name, s.name)';
    nameJoin = `LEFT JOIN shop_name_i18n sn ON sn.shop_id = s.id AND sn.lang = $${params.length}`;
  }

  const where = ['s.is_listed = true'];

  if (search) {
    params.push(`%${search}%`);
    where.push(`s.name ILIKE $${params.length}`);
  }
  if (city) {
    params.push(`%${city}%`);
    where.push(`s.city ILIKE $${params.length}`);
  }
  // Fulfillment filter: these are FIXED column predicates on a Joi-validated
  // enum ('pickup'|'delivery'), never string-interpolated user input, so no
  // bind parameter is needed or wanted here.
  if (fulfillment === 'pickup') {
    where.push('s.offers_pickup = true');
  } else if (fulfillment === 'delivery') {
    where.push('s.offers_delivery = true');
  }

  let distanceSelect = 'NULL AS distance_km';
  let orderBy = 's.name ASC';
  if (useDistance) {
    params.push(lat);
    const latIdx = `$${params.length}`;
    params.push(lng);
    const lngIdx = `$${params.length}`;
    // Cast to double precision so pg returns a JS number, not a numeric string.
    distanceSelect = `CAST(ROUND(CAST(${haversineKm(latIdx, lngIdx)} AS numeric), 1) AS double precision) AS distance_km`;
    orderBy = 'distance_km ASC NULLS LAST, s.name ASC';
  }

  params.push(limit);
  const limitIdx = `$${params.length}`;

  const r = await query(
    `SELECT s.id, ${nameSelect} AS name, s.city, s.area, s.village, s.pincode,
            s.offers_pickup, s.offers_delivery, s.delivery_fee,
            (SELECT COUNT(*) FROM products p
              WHERE p.shop_id = s.id AND p.is_active = true)::int AS product_count,
            ${distanceSelect}
       FROM shops s
       ${nameJoin}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limitIdx}`,
    params
  );

  // Drop distance_km entirely when it was not requested / not computable.
  const shops = r.rows.map((row) => {
    const shop = {
      id: row.id,
      name: row.name,
      city: row.city,
      area: row.area,
      // Location foundation (LOC1): village/PIN so a nearby-shop lookup can seed
      // the consumer location picker at the village/PIN granularity.
      village: row.village,
      pincode: row.pincode,
      product_count: row.product_count,
      // Fulfillment badges for the directory (delivery_fee in paise).
      offers_pickup: row.offers_pickup,
      offers_delivery: row.offers_delivery,
      delivery_fee: Number(row.delivery_fee),
    };
    if (useDistance && row.distance_km !== null) shop.distance_km = row.distance_km;
    return shop;
  });

  res.json({ shops });
};

/**
 * Public, unauthenticated: cross-shop product search. Finds ACTIVE products in
 * LISTED shops whose name matches `q` (localized name OR base English name).
 * Every value derived from user input — the search term `q` and the optional
 * `city` — is passed ONLY as a bound parameter and wrapped with wildcards in
 * SQL ('%'||$n||'%'); nothing user-supplied is ever interpolated into the query
 * text, so the endpoint is injection-safe. Mirrors listShops: `is_listed`
 * gating, optional lat/lng great-circle distance (nearest-first), and the
 * catalog_i18n localization join used by getShop / publicCatalog.
 */
exports.searchProducts = async (req, res) => {
  const { q, city, lat, lng } = req.query;
  const useDistance = lat !== undefined && lng !== undefined;
  const limit = Math.min(50, Math.max(1, req.query.limit || 30));
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';

  // Normalize the query the SAME way products.search_text was built: lowercase,
  // punctuation-stripped, colloquial units/number-words mapped ("1 kilo" ->
  // "1 kg"). `tokens` drives a token-wise recall net; `qn` drives whole-phrase,
  // trigram, and word-similarity (fuzzy) matching.
  const { normalized: qn, tokens } = normalizeQuery(q);
  const tokenPatterns = tokens.map((t) => `%${t}%`);

  const params = [];

  // Localized DISPLAY name (response only): for a non-'en' known lang, LEFT JOIN
  // catalog_i18n on the stored English product name and SELECT
  // COALESCE(cp.name, p.name). Matching itself happens over search_text (which
  // already folds in every language's names/aliases), so a native/romanized term
  // matches regardless of the requested display lang. 'en' skips the join.
  let nameSelect = 'p.name';
  // Localized SHOP name (batch SHOPNAME): COALESCE(sn.name, s.name) via a
  // shop_name_i18n join that reuses the SAME lang bind param as the product
  // i18n join. en path: raw s.name, no join.
  let shopNameSelect = 's.name';
  let i18nJoin = '';
  if (localized) {
    params.push(lang);
    const langIdx = `$${params.length}`;
    nameSelect = 'COALESCE(cp.name, p.name)';
    shopNameSelect = 'COALESCE(sn.name, s.name)';
    i18nJoin = `LEFT JOIN catalog_i18n cp
                  ON cp.term_type = 'product' AND cp.term_en = p.name AND cp.lang = ${langIdx}
                LEFT JOIN shop_name_i18n sn
                  ON sn.shop_id = s.id AND sn.lang = ${langIdx}`;
  }

  // The search blob, defensively COALESCEd to the name so a NULL search_text
  // (unlinked/legacy row not yet backfilled) never breaks matching.
  const blob = 'COALESCE(p.search_text, p.name)';

  // Recall net + exact/alias-preferred rank. When the query normalizes to no
  // tokens (e.g. all punctuation), fall back to the old name-ILIKE behaviour so
  // the endpoint never 500s.
  let matchClause;
  let rankExact = 'false';
  let rankSimilarity = '0';
  if (tokens.length === 0) {
    params.push(q);
    const qIdx = `$${params.length}`;
    matchClause = localized
      ? `(p.name ILIKE '%'||${qIdx}||'%' OR cp.name ILIKE '%'||${qIdx}||'%')`
      : `p.name ILIKE '%'||${qIdx}||'%'`;
  } else {
    params.push(qn);
    const qnIdx = `$${params.length}`;
    params.push(tokenPatterns);
    const tokIdx = `$${params.length}`;
    // Recall net (all inputs bound params):
    //   1. whole-phrase substring       blob ILIKE '%qn%'
    //   2. any single token substring   blob ILIKE ANY(tokenPatterns)
    //   3. whole-string trigram-similar  p.search_text % qn
    //   4. word-similar (fuzzy typo)     qn <% p.search_text  -> catches
    //      "namk"/"saltt"/"namaak" where no correct token substring exists.
    // (1)/(2) COALESCE to the name so a NULL/unbackfilled search_text is still
    // found by name. (3)/(4) run against the BARE search_text column so the
    // gin_trgm_ops index serves them (a NULL there simply isn't fuzzy-matched —
    // the row stays findable by name via (1)/(2)); the `<%` threshold is the
    // SET LOCAL value below.
    matchClause = `(${blob} ILIKE '%'||${qnIdx}||'%'
                    OR ${blob} ILIKE ANY(${tokIdx}::text[])
                    OR p.search_text % ${qnIdx}
                    OR ${qnIdx} <% p.search_text)`;
    rankExact = `(${blob} ILIKE '%'||${qnIdx}||'%')`;
    // Fuzzy rank: the better of whole-string similarity and word-similarity, so a
    // single-word typo still sorts sensibly. Exact/alias stays PREFERRED via
    // rankExact above.
    rankSimilarity = `GREATEST(similarity(${blob}, ${qnIdx}), word_similarity(${qnIdx}, ${blob}))`;
  }

  const where = ['p.is_active = true', 's.is_listed = true', matchClause];

  if (city) {
    params.push(city);
    where.push(`s.city ILIKE '%'||$${params.length}||'%'`);
  }

  // Rank exact/alias substring matches ABOVE fuzzy-only ones, then by trigram
  // similarity, then distance (when supplied), then name.
  let distanceSelect = 'NULL AS distance_km';
  let orderBy = `${rankExact} DESC, ${rankSimilarity} DESC, name ASC`;
  if (useDistance) {
    params.push(lat);
    const latIdx = `$${params.length}`;
    params.push(lng);
    const lngIdx = `$${params.length}`;
    // latitude/longitude are unambiguous (only shops carries them). Cast to
    // double precision so pg returns a JS number, not a numeric string.
    distanceSelect = `CAST(ROUND(CAST(${haversineKm(latIdx, lngIdx)} AS numeric), 1) AS double precision) AS distance_km`;
    orderBy = `${rankExact} DESC, ${rankSimilarity} DESC, distance_km ASC NULLS LAST, name ASC`;
  }

  params.push(limit);
  const limitIdx = `$${params.length}`;

  const sql = `SELECT p.id, ${nameSelect} AS name, p.price, p.unit, p.image_url, p.sold_by_weight,
            s.id AS shop_id, ${shopNameSelect} AS shop_name, s.city AS shop_city, s.area AS shop_area,
            s.offers_delivery, s.delivery_fee,
            ${distanceSelect}
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       ${i18nJoin}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limitIdx}`;

  // Run inside a (read-only) transaction so SET LOCAL scopes the word-similarity
  // threshold to THIS query on THIS pooled connection — it is reset at COMMIT and
  // never leaks to other requests. Only the fuzzy branch needs it; running the
  // whole search in one tx is harmless for a single SELECT.
  const r = await withTx(async (client) => {
    await client.query(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIM_THRESHOLD}`);
    return client.query(sql, params);
  });

  const products = r.rows.map((row) => {
    const shop = {
      id: row.shop_id,
      name: row.shop_name,
      city: row.shop_city,
      area: row.shop_area,
      offers_delivery: row.offers_delivery,
      delivery_fee: Number(row.delivery_fee),
    };
    // Drop distance_km entirely when it was not requested / not computable.
    if (useDistance && row.distance_km !== null) shop.distance_km = row.distance_km;
    return {
      id: row.id,
      name: row.name,
      price: Number(row.price), // integer paise
      unit: row.unit,
      image_url: row.image_url,
      sold_by_weight: row.sold_by_weight,
      shop,
    };
  });

  res.json({ products });
};

/**
 * Public, unauthenticated: a listed shop's public profile with its active
 * catalog (minimal fields). 404 if the shop does not exist OR is not listed —
 * unlisted shops are indistinguishable from unknown ones.
 */
exports.getShop = async (req, res) => {
  const { shopId } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) throw ApiError.notFound('Shop not found');

  // Resolve the display language up front: it now governs the SHOP name too
  // (batch SHOPNAME), not just the per-product localization further down.
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';

  // Localized SHOP name (batch SHOPNAME): for a non-'en' lang, LEFT JOIN
  // shop_name_i18n and return COALESCE(sn.name, s.name) — the native name when a
  // row exists, else the raw English name (always the fallback). Only the `name`
  // VALUE changes; the response shape is identical to the en path, which skips
  // the join entirely.
  const shopParams = [shopId];
  let shopNameSelect = 's.name';
  let shopNameJoin = '';
  if (localized) {
    shopParams.push(lang); // $2
    shopNameSelect = 'COALESCE(sn.name, s.name)';
    shopNameJoin = 'LEFT JOIN shop_name_i18n sn ON sn.shop_id = s.id AND sn.lang = $2';
  }
  // Premium "Branded Store" (batch STORE1): is_branded is derived from
  // branded_until > NOW() (computed in SQL so it uses the DB clock, never the app
  // clock). The raw branded_until is NEVER returned; the accent/tagline are only
  // surfaced while branded (nulled out below when not), so an expired or never-set
  // premium leaks nothing.
  const shop = await query(
    `SELECT s.id, ${shopNameSelect} AS name, s.city, s.area, s.image_url,
            s.offers_pickup, s.offers_delivery, s.delivery_fee, s.free_delivery_min,
            s.delivery_min_order, s.delivery_radius_km, s.delivery_hours,
            (s.branded_until IS NOT NULL AND s.branded_until > NOW()) AS is_branded,
            s.brand_accent, s.brand_tagline
       FROM shops s
       ${shopNameJoin}
      WHERE s.id = $1 AND s.is_listed = true`,
    shopParams
  );
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  // category/subcategory come from the linked base catalog item (LEFT JOIN, so
  // custom / unlinked products get null for both). Keep the existing fields.
  //
  // Consumer localization (⑥, additive): when ?lang != en, LEFT JOIN
  // catalog_i18n on the stored English product name and return
  // COALESCE(cp.name, p.name) AS name — the localized name when a master
  // translation exists, else the raw stored (English/base) name. Only the `name`
  // VALUE changes; the response shape (same keys) is identical to the en path.
  // (`lang` / `localized` were resolved above for the shop-name localization.)
  const params = [shopId];
  let nameSelect = 'p.name';
  // Description also localizes off the same master term (batch DESCLOC): when a
  // catalog_i18n row carries a translated description, show it; else fall back to
  // the raw stored description. Only the VALUE changes; the `description` key and
  // the en path are unchanged.
  let descSelect = 'p.description';
  // The variant-GROUP card title comes from the linked catalog item's master
  // product name (ci.product). On the en/unlocalized path it stays raw English;
  // when localized, LEFT JOIN catalog_i18n on that master term and return
  // COALESCE(cpb.name, ci.product) so brand/size group cards show the native
  // name when a translation exists (English fallback otherwise).
  let baseProductSelect = 'ci.product';
  // The brand (ci.brand) shows on brand/size cards. On the en/unlocalized path it
  // stays raw English; when localized, LEFT JOIN catalog_i18n on the brand master
  // term (term_type='brand') and return COALESCE(cbr.name, ci.brand) so the brand
  // renders in the native script when a translation exists (English fallback).
  let brandSelect = 'ci.brand';
  let i18nJoin = '';
  if (localized) {
    params.push(lang); // $2
    nameSelect = 'COALESCE(cp.name, p.name)';
    descSelect = 'COALESCE(cp.description, p.description)';
    baseProductSelect = 'COALESCE(cpb.name, ci.product)';
    brandSelect = 'COALESCE(cbr.name, ci.brand)';
    i18nJoin = `LEFT JOIN catalog_i18n cp
                  ON cp.term_type = 'product' AND cp.term_en = p.name AND cp.lang = $2
                LEFT JOIN catalog_i18n cpb
                  ON cpb.term_type = 'product' AND cpb.term_en = ci.product AND cpb.lang = $2
                LEFT JOIN catalog_i18n cbr
                  ON cbr.term_type = 'brand' AND cbr.term_en = ci.brand AND cbr.lang = $2`;
  }
  // search_text (the normalized all-language blob) is returned so the in-shop
  // client filter can match aliases/romanized/native tokens; it is derived from
  // public catalog + name data, not sensitive.
  const products = await query(
    `SELECT p.id, ${nameSelect} AS name, ${descSelect} AS description, p.price, p.unit, p.sold_by_weight, p.image_url,
            p.search_text,
            ci.category, ci.subcategory,
            ${baseProductSelect} AS base_product, ${brandSelect} AS brand, ci.pack
       FROM products p
       LEFT JOIN catalog_items ci ON ci.id = p.catalog_item_id
       ${i18nJoin}
      WHERE p.shop_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC, p.id DESC`,
    params
  );

  const body = { ...shop.rows[0], products: products.rows };

  // Only expose the accent/tagline while premium is active. When not branded,
  // return is_branded:false and null out the theming fields so a lapsed shop's
  // saved accent/tagline never render on its public storefront.
  if (!body.is_branded) {
    body.is_branded = false;
    body.brand_accent = null;
    body.brand_tagline = null;
  }

  // Localized category labels (additive): the per-product `category` stays the
  // raw English catalog term — it is the stable FILTER KEY the client sends
  // back — but the chip UI needs a native-script LABEL for it. For a non-'en'
  // lang, look up this shop's distinct categories in catalog_i18n
  // (term_type='category') and return a { <englishCategory>: <localizedName> }
  // map, COALESCEing each entry to its own English term when no translation
  // exists. Omitted entirely on the 'en' path (and when the shop has no
  // categorized products), so the en response shape is unchanged.
  if (localized) {
    const cats = [...new Set(products.rows.map((p) => p.category).filter(Boolean))];
    if (cats.length) {
      const labels = await query(
        `SELECT term_en, name FROM catalog_i18n
          WHERE term_type = 'category' AND lang = $1 AND term_en = ANY($2::text[])`,
        [lang, cats]
      );
      const byEn = new Map(labels.rows.map((r) => [r.term_en, r.name]));
      const category_labels = {};
      for (const c of cats) category_labels[c] = byEn.get(c) || c; // COALESCE to English
      body.category_labels = category_labels;
    }
  }

  res.json({ shop: body });
};
