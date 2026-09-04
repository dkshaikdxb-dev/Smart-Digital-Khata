const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

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
    };
    if (useDistance && row.distance_km !== null) shop.distance_km = row.distance_km;
    return shop;
  });

  res.json({ shops });
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
    'SELECT id, name, city, area FROM shops WHERE id = $1 AND is_listed = true',
    [shopId]
  );
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  const products = await query(
    `SELECT id, name, description, price, unit, image_url
       FROM products WHERE shop_id = $1 AND is_active = true
      ORDER BY created_at DESC`,
    [shopId]
  );

  res.json({ shop: { ...shop.rows[0], products: products.rows } });
};
