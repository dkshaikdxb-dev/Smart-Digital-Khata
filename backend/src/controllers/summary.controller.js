const { query } = require('../config/db');
// "Sold on credit", net of the compensating adjustments a cancelled or reduced
// order leaves behind (batch DATA D4). The ONE definition, shared with analytics,
// the digest, the weekly summary and the platform dashboards.
const { netCreditSalesSql } = require('../utils/creditSales');

exports.today = async (req, res) => {
  const r = await query(
    `SELECT
       ${netCreditSalesSql('t')} AS purchases,
       COALESCE(SUM(CASE WHEN t.type IN ('cash','upi') THEN t.amount END),0) AS collections,
       COUNT(*) AS tx_count
     FROM transactions t
     WHERE t.shop_id = $1 AND t.created_at >= date_trunc('day', NOW())`,
    [req.user.shopId]
  );
  res.json({ period: 'today', ...r.rows[0] });
};

exports.range = async (req, res) => {
  const { from, to } = req.query;
  const r = await query(
    `SELECT
       DATE(t.created_at) AS day,
       ${netCreditSalesSql('t')} AS purchases,
       SUM(CASE WHEN t.type IN ('cash','upi') THEN t.amount ELSE 0 END) AS collections
     FROM transactions t
     WHERE t.shop_id = $1
       AND ($2::timestamptz IS NULL OR t.created_at >= $2)
       AND ($3::timestamptz IS NULL OR t.created_at <= $3)
     GROUP BY DATE(t.created_at)
     ORDER BY day DESC
     LIMIT 90`,
    [req.user.shopId, from || null, to || null]
  );
  res.json({ series: r.rows });
};

/**
 * "Who owes me" — the debtor list AND the shop's true total outstanding.
 *
 * THE DEFECT THIS SHAPE EXISTS FOR (batch DATA D3). The list is capped at
 * TOP_DEBTORS rows so a shop with thousands of debtors gets a usable page. The
 * total used to be summed IN JAVASCRIPT over exactly those capped rows, so a shop
 * with 350 debtors reported only its top 200 — while /analytics/overview and the
 * nightly digest computed the true SQL sum over every row. Two owner screens
 * showed two different totals for the same shop, and the LOWER one was on the
 * screen whose whole job is "how much am I owed".
 *
 * So the total is computed in SQL over EVERY matching row, in the same statement
 * and therefore the same snapshot as the page of rows, and the cap now governs
 * only how many customers are listed. `total_customers` is returned alongside so
 * a client can say plainly that it is showing the top N of M.
 */
const TOP_DEBTORS = 200;

exports.outstanding = async (req, res) => {
  // `SUM(balance) OVER ()` and `COUNT(*) OVER ()` are window aggregates: they are
  // evaluated over EVERY row the WHERE clause matches, BEFORE the LIMIT trims the
  // page. So one statement — one snapshot — yields both the complete figure and
  // the top-N list, and the two can never be read from different instants.
  const r = await query(
    `SELECT id, name, phone, credit_limit, balance,
            SUM(balance) OVER () AS _total,
            COUNT(*) OVER ()::int AS _total_customers
     FROM customers
     WHERE shop_id = $1 AND balance > 0 AND status='active'
     ORDER BY balance DESC
     LIMIT ${TOP_DEBTORS}`,
    [req.user.shopId]
  );
  const first = r.rows[0];
  const customers = r.rows.map(({ _total, _total_customers, ...c }) => c);
  res.json({
    // A JS number, exactly as the old JS-side reduce returned — only the SCOPE
    // of the sum changes (every debtor, not just the listed page).
    total: first ? Number(first._total) : 0,
    total_customers: first ? first._total_customers : 0,
    listed_customers: customers.length,
    customers,
  });
};
