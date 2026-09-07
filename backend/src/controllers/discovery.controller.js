const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

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
  const { search, city, lat, lng } = req.query;
  const useDistance = lat !== undefined && lng !== undefined;
  const limit = Math.min(100, Math.max(1, req.query.limit || 50));

  const params = [];
  const where = ['s.is_listed = true'];

  if (search) {
    params.push(`%${search}%`);
    where.push(`s.name ILIKE $${params.length}`);
  }
  if (city) {
    params.push(`%${city}%`);
    where.push(`s.city ILIKE $${params.length}`);
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
    `SELECT s.id, s.name, s.city, s.area,
            s.offers_delivery, s.delivery_fee,
            (SELECT COUNT(*) FROM products p
              WHERE p.shop_id = s.id AND p.is_active = true)::int AS product_count,
            ${distanceSelect}
       FROM shops s
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
      product_count: row.product_count,
      // Delivery badge for the directory (delivery_fee in paise).
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

  const params = [];

  // The raw search term is a bound parameter; the wildcards live in SQL text.
  params.push(q);
  const qIdx = `$${params.length}`;

  // Localized name: for a non-'en' known lang, LEFT JOIN catalog_i18n on the
  // stored English product name and SELECT COALESCE(cp.name, p.name); the term
  // then matches EITHER the localized name or the base name. 'en' skips the
  // join entirely (base behaviour, no localized column).
  let nameSelect = 'p.name';
  let i18nJoin = '';
  let nameMatch = `p.name ILIKE '%'||${qIdx}||'%'`;
  if (localized) {
    params.push(lang);
    const langIdx = `$${params.length}`;
    nameSelect = 'COALESCE(cp.name, p.name)';
    i18nJoin = `LEFT JOIN catalog_i18n cp
                  ON cp.term_type = 'product' AND cp.term_en = p.name AND cp.lang = ${langIdx}`;
    nameMatch = `(p.name ILIKE '%'||${qIdx}||'%' OR cp.name ILIKE '%'||${qIdx}||'%')`;
  }

  const where = ['p.is_active = true', 's.is_listed = true', nameMatch];

  if (city) {
    params.push(city);
    where.push(`s.city ILIKE '%'||$${params.length}||'%'`);
  }

  let distanceSelect = 'NULL AS distance_km';
  let orderBy = 'name ASC';
  if (useDistance) {
    params.push(lat);
    const latIdx = `$${params.length}`;
    params.push(lng);
    const lngIdx = `$${params.length}`;
    // latitude/longitude are unambiguous (only shops carries them). Cast to
    // double precision so pg returns a JS number, not a numeric string.
    distanceSelect = `CAST(ROUND(CAST(${haversineKm(latIdx, lngIdx)} AS numeric), 1) AS double precision) AS distance_km`;
    orderBy = 'distance_km ASC NULLS LAST, name ASC';
  }

  params.push(limit);
  const limitIdx = `$${params.length}`;

  const r = await query(
    `SELECT p.id, ${nameSelect} AS name, p.price, p.unit, p.image_url, p.sold_by_weight,
            s.id AS shop_id, s.name AS shop_name, s.city AS shop_city, s.area AS shop_area,
            s.offers_delivery, s.delivery_fee,
            ${distanceSelect}
       FROM products p
       JOIN shops s ON s.id = p.shop_id
       ${i18nJoin}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${limitIdx}`,
    params
  );

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

  const shop = await query(
    `SELECT id, name, city, area,
            offers_pickup, offers_delivery, delivery_fee, free_delivery_min,
            delivery_min_order, delivery_radius_km, delivery_hours
       FROM shops WHERE id = $1 AND is_listed = true`,
    [shopId]
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
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';
  const params = [shopId];
  let nameSelect = 'p.name';
  let i18nJoin = '';
  if (localized) {
    params.push(lang); // $2
    nameSelect = 'COALESCE(cp.name, p.name)';
    i18nJoin = `LEFT JOIN catalog_i18n cp
                  ON cp.term_type = 'product' AND cp.term_en = p.name AND cp.lang = $2`;
  }
  const products = await query(
    `SELECT p.id, ${nameSelect} AS name, p.description, p.price, p.unit, p.sold_by_weight, p.image_url,
            ci.category, ci.subcategory,
            ci.product AS base_product, ci.brand, ci.pack
       FROM products p
       LEFT JOIN catalog_items ci ON ci.id = p.catalog_item_id
       ${i18nJoin}
      WHERE p.shop_id = $1 AND p.is_active = true
      ORDER BY p.created_at DESC, p.id DESC`,
    params
  );

  res.json({ shop: { ...shop.rows[0], products: products.rows } });
};
