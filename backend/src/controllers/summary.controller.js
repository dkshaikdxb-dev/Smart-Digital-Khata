const { query } = require('../config/db');

exports.today = async (req, res) => {
  const r = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type='purchase' THEN amount END),0) AS purchases,
       COALESCE(SUM(CASE WHEN type IN ('cash','upi') THEN amount END),0) AS collections,
       COUNT(*) AS tx_count
     FROM transactions
     WHERE shop_id = $1 AND created_at >= date_trunc('day', NOW())`,
    [req.user.shopId]
  );
  res.json({ period: 'today', ...r.rows[0] });
};

exports.range = async (req, res) => {
  const { from, to } = req.query;
  const r = await query(
    `SELECT
       DATE(created_at) AS day,
       SUM(CASE WHEN type='purchase' THEN amount ELSE 0 END) AS purchases,
       SUM(CASE WHEN type IN ('cash','upi') THEN amount ELSE 0 END) AS collections
     FROM transactions
     WHERE shop_id = $1
       AND ($2::timestamptz IS NULL OR created_at >= $2)
       AND ($3::timestamptz IS NULL OR created_at <= $3)
     GROUP BY DATE(created_at)
     ORDER BY day DESC
     LIMIT 90`,
    [req.user.shopId, from || null, to || null]
  );
  res.json({ series: r.rows });
};

exports.outstanding = async (req, res) => {
  const r = await query(
    `SELECT id, name, phone, credit_limit, balance
     FROM customers
     WHERE shop_id = $1 AND balance > 0 AND status='active'
     ORDER BY balance DESC
     LIMIT 200`,
    [req.user.shopId]
  );
  const total = r.rows.reduce((s, c) => s + Number(c.balance || 0), 0);
  res.json({ total, customers: r.rows });
};
