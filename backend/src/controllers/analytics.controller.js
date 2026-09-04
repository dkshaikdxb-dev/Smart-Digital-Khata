const { query } = require('../config/db');

// GET /analytics/overview?days=30 — trailing-window KPIs for the shop.
// `days` is clamped to 1..365 (default 30). All amounts are paise, counts ints.
exports.overview = async (req, res) => {
  const raw = Number(req.query.days);
  const days = Math.min(365, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const sums = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount END), 0) AS purchases,
       COALESCE(SUM(CASE WHEN type IN ('cash', 'upi') THEN amount END), 0) AS collections
     FROM transactions
     WHERE shop_id = $1
       AND created_at >= NOW() - make_interval(days => $2::int)`,
    [req.user.shopId, days]
  );

  const cust = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active') AS active_customers,
       COUNT(*) FILTER (WHERE status = 'active' AND balance > 0) AS customers_with_dues,
       COALESCE(SUM(CASE WHEN status = 'active' AND balance > 0 THEN balance ELSE 0 END), 0)
         AS total_outstanding,
       COUNT(*) FILTER (WHERE created_at >= NOW() - make_interval(days => $2::int)) AS new_customers
     FROM customers
     WHERE shop_id = $1`,
    [req.user.shopId, days]
  );

  const purchases = Number(sums.rows[0].purchases);
  const collections = Number(sums.rows[0].collections);
  const collection_rate = purchases === 0 ? 0 : collections / purchases;

  res.json({
    period_days: days,
    purchases,
    collections,
    collection_rate,
    total_outstanding: Number(cust.rows[0].total_outstanding),
    active_customers: Number(cust.rows[0].active_customers),
    customers_with_dues: Number(cust.rows[0].customers_with_dues),
    new_customers: Number(cust.rows[0].new_customers),
  });
};

// GET /analytics/aging — outstanding balance bucketed by debt age.
//
// APPROXIMATION: we do not track aging per line item. Instead, for each active
// customer with balance > 0 we find the date of their OLDEST `purchase`
// transaction, treat the age (in days) of that first purchase as the age of the
// whole debt, and drop the customer's ENTIRE current balance into the matching
// bucket. A debtor with balance > 0 but no purchase row (e.g. an opening
// balance written directly) is placed in the 0_30 bucket.
exports.aging = async (req, res) => {
  const r = await query(
    `SELECT c.balance,
            EXTRACT(DAY FROM NOW() - MIN(t.created_at))::int AS age_days
     FROM customers c
     LEFT JOIN transactions t
       ON t.customer_id = c.id AND t.type = 'purchase'
     WHERE c.shop_id = $1 AND c.status = 'active' AND c.balance > 0
     GROUP BY c.id, c.balance`,
    [req.user.shopId]
  );

  const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0, total: 0 };
  for (const row of r.rows) {
    const bal = Number(row.balance);
    // No purchase row -> age_days is NULL -> treat as freshest bucket.
    const age = row.age_days === null ? 0 : Number(row.age_days);
    let key;
    if (age <= 30) key = '0_30';
    else if (age <= 60) key = '31_60';
    else if (age <= 90) key = '61_90';
    else key = '90_plus';
    buckets[key] += bal;
    buckets.total += bal;
  }

  res.json(buckets);
};
