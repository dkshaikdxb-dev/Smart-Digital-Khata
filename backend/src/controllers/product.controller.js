const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

exports.list = async (req, res) => {
  const search = (req.query.search || '').trim();
  const activeOnly = req.query.active === 'true';

  const params = [req.user.shopId];
  let where = 'shop_id = $1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  if (activeOnly) {
    where += ' AND is_active = true';
  }
  const r = await query(
    `SELECT id, name, description, price, unit, is_active, image_url, created_at, updated_at
     FROM products WHERE ${where}
     ORDER BY created_at DESC`,
    params
  );
  res.json({ items: r.rows });
};

exports.create = async (req, res) => {
  const { name, price = 0, description = null, unit = 'unit', image_url = null } = req.body;
  const r = await query(
    `INSERT INTO products (shop_id, name, price, description, unit, image_url)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [req.user.shopId, name, price, description, unit, image_url]
  );
  res.status(201).json({ product: r.rows[0] });
};

exports.get = async (req, res) => {
  const r = await query(
    'SELECT * FROM products WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};

exports.update = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(req.body)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING *`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};

exports.remove = async (req, res) => {
  const r = await query(
    'DELETE FROM products WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ ok: true });
};

/**
 * Public, unauthenticated: a shop's browsable catalog. Active products only,
 * minimal fields — no inactive products, no other shops' data.
 */
exports.publicCatalog = async (req, res) => {
  const { shopId } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) throw ApiError.notFound('Shop not found');

  const shop = await query('SELECT name FROM shops WHERE id = $1', [shopId]);
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  const r = await query(
    `SELECT id, name, description, price, unit, image_url
     FROM products WHERE shop_id = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [shopId]
  );
  res.json({ shop_name: shop.rows[0].name, products: r.rows });
};
