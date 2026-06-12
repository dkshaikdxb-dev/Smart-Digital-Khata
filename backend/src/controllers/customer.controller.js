const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

exports.list = async (req, res) => {
  const search = (req.query.search || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);

  const params = [req.user.shopId];
  let where = 'shop_id = $1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }
  params.push(limit, offset);
  const r = await query(
    `SELECT id, name, phone, credit_limit, balance, status, created_at
     FROM customers WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ items: r.rows, limit, offset });
};

exports.create = async (req, res) => {
  const { name, phone, credit_limit = 0, notes = null } = req.body;
  try {
    const r = await query(
      `INSERT INTO customers (shop_id, name, phone, credit_limit, notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.user.shopId, name, phone, credit_limit, notes]
    );
    res.status(201).json({ customer: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      throw ApiError.conflict('A customer with that phone number already exists in this shop');
    }
    throw err;
  }
};

exports.get = async (req, res) => {
  const r = await query(
    'SELECT * FROM customers WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ customer: r.rows[0] });
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
    `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING *`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ customer: r.rows[0] });
};

exports.ledger = async (req, res) => {
  const { id } = req.params;
  const own = await query(
    'SELECT id, name, phone, credit_limit, balance FROM customers WHERE id=$1 AND shop_id=$2',
    [id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');

  const tx = await query(
    `SELECT id, type, amount, method, note, created_at
     FROM transactions
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [id]
  );
  res.json({ customer: own.rows[0], transactions: tx.rows });
};
