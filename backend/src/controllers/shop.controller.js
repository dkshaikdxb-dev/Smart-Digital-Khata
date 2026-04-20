const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

exports.getMine = async (req, res) => {
  const r = await query('SELECT * FROM shops WHERE id = $1', [req.user.shopId]);
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({ shop: r.rows[0] });
};

exports.updateMine = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(req.body)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.user.shopId);
  const r = await query(
    `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    values
  );
  res.json({ shop: r.rows[0] });
};
