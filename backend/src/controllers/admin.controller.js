const { query } = require('../config/db');

exports.stats = async (_req, res) => {
  const [shops, users, tx, outstanding] = await Promise.all([
    query('SELECT COUNT(*)::int AS c FROM shops'),
    query('SELECT COUNT(*)::int AS c FROM users'),
    query('SELECT COUNT(*)::int AS c FROM transactions'),
    query('SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE balance > 0'),
  ]);
  res.json({
    shops: shops.rows[0].c,
    users: users.rows[0].c,
    transactions: tx.rows[0].c,
    outstanding_total: outstanding.rows[0].s,
  });
};

exports.listShops = async (_req, res) => {
  const r = await query(
    `SELECT s.id, s.name, s.plan, s.notification_mode, s.created_at,
            (SELECT COUNT(*) FROM customers WHERE shop_id = s.id) AS customers_count
     FROM shops s
     ORDER BY s.created_at DESC
     LIMIT 500`
  );
  res.json({ items: r.rows });
};

exports.listUsers = async (_req, res) => {
  const r = await query(
    `SELECT id, name, email, phone, role, shop_id, created_at
     FROM users ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ items: r.rows });
};
