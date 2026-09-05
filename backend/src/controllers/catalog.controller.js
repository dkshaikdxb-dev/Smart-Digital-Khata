const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Display name shown to owners/customers, assembled from the base item's parts.
function displayName({ brand, product, pack }) {
  return [brand, product, pack].filter(Boolean).join(' ');
}

// Languages the owner catalogue can be browsed/searched in. 'en' is the base
// language: it uses the plain English catalog_items with NO i18n join, so the
// response shape and behaviour are exactly as before. Any other known lang
// LEFT JOINs catalog_i18n for localized display + search (English fallback).
const KNOWN_LANGS = new Set(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']);

// Resolve ?lang= to a known language, defaulting to 'en'. Unknown values fall
// back to 'en' (base behaviour) rather than erroring — the catalogue must always
// render.
function resolveLang(raw) {
  const lang = (raw || '').trim().toLowerCase();
  return KNOWN_LANGS.has(lang) ? lang : 'en';
}

// Visibility rule (applied inline in each query): a shop sees global items OR
// its own custom items. Custom items default is_global=true, so in practice
// everyone sees them; the created_by_shop_id clause keeps the rule correct if a
// shop later makes a private item.

/**
 * Encode/decode a stable keyset cursor over (lower(product), id). Base64 of
 * "lowerProduct\u0000id" — deterministic and opaque to the client.
 */
function encodeCursor(row) {
  const raw = `${String(row.product).toLowerCase()}\u0000${row.id}`;
  return Buffer.from(raw, 'utf8').toString('base64');
}
function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(String(cursor), 'base64').toString('utf8');
    const idx = raw.indexOf('\u0000');
    if (idx < 0) return null;
    const product = raw.slice(0, idx);
    const id = raw.slice(idx + 1);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { product, id };
  } catch (_e) {
    return null;
  }
}

/**
 * GET /api/catalog — browse the base catalog for THIS shop, annotated with
 * whether the shop already carries each item (LEFT JOIN products on
 * catalog_item_id + shop_id). Keyset paginated on (lower(product), id).
 *
 *   ?search=  matches product OR brand (ILIKE)
 *   ?category=&subcategory=  exact filters
 *   ?limit=  default 30, max 100
 *   ?cursor= opaque keyset cursor from a previous next_cursor
 */
exports.list = async (req, res) => {
  const shopId = req.user.shopId;
  const search = (req.query.search || '').trim();
  const category = (req.query.category || '').trim();
  const subcategory = (req.query.subcategory || '').trim();
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 30;
  if (limit > 100) limit = 100;

  // $1 is always the shop id (used by both the visibility clause and the join).
  const params = [shopId];
  // When localizing, $2 is the language for the i18n join. Pushed right after the
  // shop id so its placeholder ($2) matches the LEFT JOIN position in the SQL.
  let langParam = 0;
  if (localized) {
    params.push(lang);
    langParam = params.length;
  }
  const conds = ['(ci.is_global = true OR ci.created_by_shop_id = $1)'];

  if (search) {
    params.push(`%${search}%`);
    const p = params.length;
    // English always works (ci.product is always matched); when localizing, also
    // match the localized name and its romanized aliases so the owner finds items
    // typing their language OR English OR a romanized alias.
    conds.push(localized
      ? `(ci.product ILIKE $${p} OR ci.brand ILIKE $${p} OR cp.name ILIKE $${p} OR cp.aliases ILIKE $${p})`
      : `(ci.product ILIKE $${p} OR ci.brand ILIKE $${p})`);
  }
  if (category) {
    params.push(category);
    conds.push(`ci.category = $${params.length}`);
  }
  if (subcategory) {
    params.push(subcategory);
    conds.push(`ci.subcategory = $${params.length}`);
  }

  const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
  if (cursor) {
    // Keyset: strictly after (lower(product), id) of the last row returned.
    params.push(cursor.product);
    const pProduct = params.length;
    params.push(cursor.id);
    const pId = params.length;
    conds.push(`(lower(ci.product) > $${pProduct} OR (lower(ci.product) = $${pProduct} AND ci.id > $${pId}))`);
  }

  // Fetch one extra row to know whether there's a next page.
  params.push(limit + 1);
  const pLimit = params.length;

  // Localized name join (only when lang != en). term_type='product', matched on
  // the English product term + language. The ORDER BY stays on lower(ci.product),
  // ci.id so the keyset cursor is stable and language-independent.
  const i18nSelect = localized ? ', cp.name AS product_local' : '';
  const i18nJoin = localized
    ? `LEFT JOIN catalog_i18n cp
         ON cp.term_type = 'product' AND cp.term_en = ci.product AND cp.lang = $${langParam}`
    : '';

  const sql = `
    SELECT ci.id, ci.sku, ci.category, ci.subcategory, ci.product, ci.brand,
           ci.pack, ci.unit, ci.indicative_price, ci.perishable,
           p.id AS product_id, p.price AS shop_price, p.is_active AS product_active${i18nSelect}
    FROM catalog_items ci
    LEFT JOIN products p
      ON p.catalog_item_id = ci.id AND p.shop_id = $1
    ${i18nJoin}
    WHERE ${conds.join(' AND ')}
    ORDER BY lower(ci.product) ASC, ci.id ASC
    LIMIT $${pLimit}`;

  const r = await query(sql, params);
  const rows = r.rows;

  let nextCursor = null;
  if (rows.length > limit) {
    const lastKept = rows[limit - 1];
    nextCursor = encodeCursor(lastKept);
    rows.length = limit;
  }

  const items = rows.map((row) => {
    const item = {
      id: row.id,
      sku: row.sku,
      category: row.category,
      subcategory: row.subcategory,
      product: row.product,
      brand: row.brand,
      pack: row.pack,
      unit: row.unit,
      indicative_price: Number(row.indicative_price),
      perishable: row.perishable,
      display_name: displayName(row),
      carried: row.product_id != null,
      product_id: row.product_id || null,
      shop_price: row.product_id != null ? Number(row.shop_price) : null,
    };
    // Localized display (additive; only when lang != en). Brand & pack are never
    // translated — only the product word is swapped, with English fallback.
    if (localized) {
      const productLocal = row.product_local || row.product;
      item.product_local = productLocal;
      item.display_name_local = displayName({ brand: row.brand, product: productLocal, pack: row.pack });
    }
    return item;
  });

  res.json({ items, next_cursor: nextCursor });
};

/**
 * GET /api/catalog/categories — category tree over VISIBLE items, for the
 * filter UI. { categories: [{ category, count, subcategories: [{name,count}] }] }
 */
exports.categories = async (req, res) => {
  const shopId = req.user.shopId;
  const lang = resolveLang(req.query.lang);
  const localized = lang !== 'en';

  // When localizing, LEFT JOIN catalog_i18n for both the category and subcategory
  // labels (COALESCE to English). The English category/subcategory VALUES are
  // always returned untouched — the UI sends them back verbatim as the exact
  // filter keys the DB stores.
  let sql;
  const params = [shopId];
  if (localized) {
    params.push(lang); // $2
    sql = `SELECT ci.category, ci.subcategory, COUNT(*)::int AS count,
                  cc.name AS category_local, cs.name AS subcategory_local
             FROM catalog_items ci
             LEFT JOIN catalog_i18n cc
               ON cc.term_type = 'category' AND cc.term_en = ci.category AND cc.lang = $2
             LEFT JOIN catalog_i18n cs
               ON cs.term_type = 'subcategory' AND cs.term_en = ci.subcategory AND cs.lang = $2
            WHERE (ci.is_global = true OR ci.created_by_shop_id = $1)
              AND ci.category IS NOT NULL
            GROUP BY ci.category, ci.subcategory, cc.name, cs.name
            ORDER BY ci.category ASC, ci.subcategory ASC NULLS FIRST`;
  } else {
    sql = `SELECT ci.category, ci.subcategory, COUNT(*)::int AS count
             FROM catalog_items ci
            WHERE (ci.is_global = true OR ci.created_by_shop_id = $1)
              AND ci.category IS NOT NULL
            GROUP BY ci.category, ci.subcategory
            ORDER BY ci.category ASC, ci.subcategory ASC NULLS FIRST`;
  }
  const r = await query(sql, params);

  const byCat = new Map();
  for (const row of r.rows) {
    if (!byCat.has(row.category)) {
      const entry = { category: row.category, count: 0, subcategories: [] };
      if (localized) entry.category_local = row.category_local || row.category;
      byCat.set(row.category, entry);
    }
    const entry = byCat.get(row.category);
    entry.count += row.count;
    if (row.subcategory) {
      const sub = { name: row.subcategory, count: row.count };
      if (localized) sub.name_local = row.subcategory_local || row.subcategory;
      entry.subcategories.push(sub);
    }
  }

  res.json({ categories: Array.from(byCat.values()) });
};

/**
 * Core "select a base item into this shop's catalog at a price" logic, shared by
 * the single POST /select and the bulk POST /select-bulk. Runs inside a caller-
 * supplied transaction `client` so a bulk call is one atomic unit. Creates the
 * products row linked via catalog_item_id, or — if the shop already carries the
 * item (active or inactive) — REACTIVATES + reprices it instead of duplicating.
 * Returns the products row. Throws ApiError.notFound if the item isn't visible.
 */
async function selectItem(client, shopId, catalogItemId, price) {
  // Item must exist and be visible to this shop.
  const ci = await client.query(
    `SELECT id, product, brand, pack, unit
       FROM catalog_items
      WHERE id = $1 AND (is_global = true OR created_by_shop_id = $2)`,
    [catalogItemId, shopId]
  );
  if (!ci.rowCount) throw ApiError.notFound('Catalog item not found', { catalog_item_id: catalogItemId });
  const item = ci.rows[0];
  const name = displayName(item);
  const unit = item.unit || 'unit';

  // Already carried? Reactivate + reprice rather than duplicate.
  const existing = await client.query(
    'SELECT id FROM products WHERE shop_id = $1 AND catalog_item_id = $2 LIMIT 1',
    [shopId, catalogItemId]
  );
  if (existing.rowCount) {
    const upd = await client.query(
      `UPDATE products
          SET price = $1, is_active = true, updated_at = NOW()
        WHERE id = $2 AND shop_id = $3
        RETURNING *`,
      [price, existing.rows[0].id, shopId]
    );
    return upd.rows[0];
  }

  const ins = await client.query(
    `INSERT INTO products (shop_id, name, price, unit, is_active, catalog_item_id)
     VALUES ($1,$2,$3,$4,true,$5)
     RETURNING *`,
    [shopId, name, price, unit, catalogItemId]
  );
  return ins.rows[0];
}

/**
 * POST /api/catalog/select — the shop "selects" a base item into its catalog at
 * its own price. Creates a products row linked via catalog_item_id. If the shop
 * already carries this item (active or inactive), REACTIVATE + update the price
 * instead of duplicating.
 */
exports.select = async (req, res) => {
  const shopId = req.user.shopId;
  const { catalog_item_id: catalogItemId, price } = req.body;

  const product = await withTx((client) => selectItem(client, shopId, catalogItemId, price));

  res.status(201).json({ product });
};

/**
 * POST /api/catalog/select-bulk — select MANY base items at once (the owner
 * "add all sizes/brands" UI). Body { items: [{ catalog_item_id, price }] }, 1–100.
 * In ONE transaction each item is created or reactivated+repriced via the same
 * rule as the single select, so the whole batch is atomic (any bad item — e.g.
 * not visible — rolls back the lot). Returns { added, products }.
 */
exports.selectBulk = async (req, res) => {
  const shopId = req.user.shopId;
  const { items } = req.body;

  const products = await withTx(async (client) => {
    const out = [];
    for (const it of items) {
      out.push(await selectItem(client, shopId, it.catalog_item_id, it.price));
    }
    return out;
  });

  res.status(201).json({ added: products.length, products });
};

/**
 * POST /api/catalog/custom — add a brand-new item that isn't in the base yet.
 * In one tx: insert a catalog_items row (owned by this shop, is_global=true, no
 * sku) so it joins the shared base for everyone, plus a products row for this
 * shop linked to it.
 */
exports.custom = async (req, res) => {
  const shopId = req.user.shopId;
  const {
    product, brand = null, pack = null, category = null,
    subcategory = null, price,
  } = req.body;
  // Loose/weighed item: price is per KG and unit is forced to 'kg' (server is the
  // authority). Otherwise use the supplied unit, defaulting to 'unit'.
  const soldByWeight = req.body.sold_by_weight === true;
  const unit = soldByWeight ? 'kg' : (req.body.unit || null);

  const result = await withTx(async (client) => {
    const ciIns = await client.query(
      `INSERT INTO catalog_items
         (category, subcategory, product, brand, pack, unit, indicative_price,
          created_by_shop_id, is_global)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
       RETURNING *`,
      [category, subcategory, product, brand, pack, unit, price, shopId]
    );
    const item = ciIns.rows[0];
    const name = displayName(item);

    const pIns = await client.query(
      `INSERT INTO products (shop_id, name, price, unit, sold_by_weight, is_active, catalog_item_id)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       RETURNING *`,
      [shopId, name, price, item.unit || 'unit', soldByWeight, item.id]
    );
    return { item, product: pIns.rows[0] };
  });

  res.status(201).json(result);
};
