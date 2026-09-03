const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Monthly price per plan, in paise (mirrors subscription.controller PLANS).
const PLAN_PRICE = { free: 0, pro: 29900, family: 59900 };

exports.stats = async (_req, res) => {
  const [shops, users, tx, outstanding, plans, suspended] = await Promise.all([
    query('SELECT COUNT(*)::int AS c FROM shops'),
    query('SELECT COUNT(*)::int AS c FROM users'),
    query('SELECT COUNT(*)::int AS c FROM transactions'),
    query('SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE balance > 0'),
    query("SELECT plan, COUNT(*)::int AS c FROM shops GROUP BY plan"),
    query("SELECT COUNT(*)::int AS c FROM shops WHERE status = 'suspended'"),
  ]);

  const planCounts = { free: 0, pro: 0, family: 0 };
  let mrr = 0;
  for (const row of plans.rows) {
    planCounts[row.plan] = row.c;
    mrr += (PLAN_PRICE[row.plan] || 0) * row.c;
  }

  res.json({
    shops: shops.rows[0].c,
    users: users.rows[0].c,
    transactions: tx.rows[0].c,
    outstanding_total: outstanding.rows[0].s,
    suspended_shops: suspended.rows[0].c,
    plan_counts: planCounts,
    mrr, // paise/month
  });
};

exports.listShops = async (_req, res) => {
  const r = await query(
    `SELECT s.id, s.name, s.plan, s.status, s.notification_mode, s.created_at,
            (SELECT COUNT(*) FROM customers WHERE shop_id = s.id) AS customers_count
     FROM shops s
     ORDER BY s.created_at DESC
     LIMIT 500`
  );
  res.json({ items: r.rows });
};

exports.getShop = async (req, res) => {
  const r = await query(
    `SELECT s.*, u.name AS owner_name, u.email AS owner_email, u.phone AS owner_phone
     FROM shops s LEFT JOIN users u ON u.id = s.owner_id
     WHERE s.id = $1`,
    [req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  const shop = r.rows[0];

  const [customers, tx, outstanding] = await Promise.all([
    query('SELECT COUNT(*)::int AS c FROM customers WHERE shop_id = $1', [shop.id]),
    query('SELECT COUNT(*)::int AS c FROM transactions WHERE shop_id = $1', [shop.id]),
    query('SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE shop_id = $1 AND balance > 0', [shop.id]),
  ]);

  res.json({
    shop: {
      id: shop.id,
      name: shop.name,
      plan: shop.plan,
      status: shop.status,
      notification_mode: shop.notification_mode,
      created_at: shop.created_at,
      owner: { name: shop.owner_name, email: shop.owner_email, phone: shop.owner_phone },
      customers_count: customers.rows[0].c,
      transactions_count: tx.rows[0].c,
      outstanding_total: outstanding.rows[0].s,
      mrr: PLAN_PRICE[shop.plan] || 0,
    },
  });
};

exports.updateShop = async (req, res) => {
  const { status, plan } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  if (status) { fields.push(`status = $${i++}`); values.push(status); }
  if (plan) { fields.push(`plan = $${i++}`); values.push(plan); }
  if (!fields.length) throw ApiError.badRequest('Nothing to update');
  values.push(req.params.id);
  const r = await query(
    `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING id, name, plan, status`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({ shop: r.rows[0] });
};

exports.listUsers = async (_req, res) => {
  const r = await query(
    `SELECT id, name, email, phone, role, shop_id, created_at
     FROM users ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ items: r.rows });
};
