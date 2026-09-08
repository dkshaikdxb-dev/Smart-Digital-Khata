const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Owner-authored per-store FAQ (Batch FAQ-2). Every operation is scoped to the
// authenticated owner/staff's shop via req.user.shopId — a shop_id is NEVER read
// from the request body, so an owner can only ever read or mutate their own rows.
// Mirrors product.controller's shop-scoping, Joi validation and 404-on-cross-shop
// style.

// A modest per-shop cap so a single shop cannot create unbounded FAQ rows.
const MAX_FAQS_PER_SHOP = 30;

// Columns returned to the owner editor. All of the shop's rows, incl. inactive.
const FAQ_COLS = 'id, shop_id, question, answer, sort_order, is_active, created_at, updated_at';

/** GET /api/shops/faqs — this shop's faqs (incl. inactive), ordered for editing. */
exports.list = async (req, res) => {
  const r = await query(
    `SELECT ${FAQ_COLS} FROM shop_faqs
     WHERE shop_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [req.user.shopId]
  );
  res.json({ items: r.rows });
};

/** POST /api/shops/faqs — add a faq for this shop (cap-enforced). */
exports.create = async (req, res) => {
  const { question, answer } = req.body;
  const sortOrder = Number.isInteger(req.body.sort_order) ? req.body.sort_order : 0;

  const count = await query('SELECT COUNT(*)::int AS n FROM shop_faqs WHERE shop_id = $1', [req.user.shopId]);
  if (count.rows[0].n >= MAX_FAQS_PER_SHOP) {
    throw ApiError.unprocessable(`A shop can have at most ${MAX_FAQS_PER_SHOP} FAQs`);
  }

  const r = await query(
    `INSERT INTO shop_faqs (shop_id, question, answer, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING ${FAQ_COLS}`,
    [req.user.shopId, question, answer, sortOrder]
  );
  res.status(201).json({ faq: r.rows[0] });
};

/** PATCH /api/shops/faqs/:id — update a row WHERE id AND shop_id (404 otherwise). */
exports.update = async (req, res) => {
  const allowed = ['question', 'answer', 'sort_order', 'is_active'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      fields.push(`${k} = $${i++}`);
      values.push(req.body[k]);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE shop_faqs SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING ${FAQ_COLS}`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('FAQ not found');
  res.json({ faq: r.rows[0] });
};

/** DELETE /api/shops/faqs/:id — delete a row WHERE id AND shop_id (404 otherwise). */
exports.remove = async (req, res) => {
  const r = await query(
    'DELETE FROM shop_faqs WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('FAQ not found');
  res.json({ ok: true });
};
