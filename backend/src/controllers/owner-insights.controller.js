const { query } = require('../config/db');
const { buildOwnerNudges, THRESHOLDS } = require('../utils/owner-nudges');

// Owner Help "lane A" (Phase F). ONE read-only aggregation endpoint that returns
// { nudges, generated_at } for the CURRENT shop only. Pure aggregation over the
// tables the shop already owns — NO new schema, NO writes, no cache.
//
// Everything is strictly scoped by req.user.shopId, so a nudge can never surface
// another shop's data. "today" and every window are anchored to the DB clock in
// SQL (matching summaries/today's date_trunc('day', NOW())); the pure rule engine
// (utils/owner-nudges) then turns the numbers into ordered, localizable cards.
// Money stays integer paise server-side; the UI renders rupees.

async function scalar(sql, params) {
  const r = await query(sql, params);
  const row = r.rows[0] || {};
  const k = Object.keys(row)[0];
  return row[k];
}

// GET /api/insights/owner — build the shop's nudge payload.
exports.ownerNudges = async (req, res) => {
  const shopId = req.user.shopId;
  // A staff/owner token without a shop (shouldn't happen for these roles) simply
  // yields an empty, friendly payload rather than leaking or erroring.
  if (!shopId) {
    return res.json({ nudges: [], generated_at: new Date().toISOString() });
  }

  const [
    paymentsToday,
    trailingCollections,
    dues,
    outstanding,
    nearLimit,
    topItem,
    busyDay,
  ] = await Promise.all([
    // Today's collections (cash+upi), same day boundary as summaries/today.
    scalar(
      `SELECT COALESCE(SUM(amount),0)::bigint AS s
         FROM transactions
        WHERE shop_id = $1 AND type IN ('cash','upi')
          AND created_at >= date_trunc('day', NOW())`,
      [shopId]
    ),
    // Collections over the trailing window (the days BEFORE today), for a daily
    // average — [today - N days, today).
    scalar(
      `SELECT COALESCE(SUM(amount),0)::bigint AS s
         FROM transactions
        WHERE shop_id = $1 AND type IN ('cash','upi')
          AND created_at >= date_trunc('day', NOW()) - make_interval(days => $2::int)
          AND created_at <  date_trunc('day', NOW())`,
      [shopId, THRESHOLDS.TRAILING_AVG_DAYS]
    ),
    // Stale dues: active customers owing money whose LAST activity (their most
    // recent transaction, else created_at) is at least DUES_STALE_DAYS old.
    query(
      `WITH last_activity AS (
         SELECT customer_id, MAX(created_at) AS last_at
           FROM transactions WHERE shop_id = $1 GROUP BY customer_id
       )
       SELECT COUNT(*)::int AS n, COALESCE(SUM(c.balance),0)::bigint AS total
         FROM customers c
         LEFT JOIN last_activity la ON la.customer_id = c.id
        WHERE c.shop_id = $1 AND c.status = 'active' AND c.balance > 0
          AND COALESCE(la.last_at, c.created_at) <= NOW() - make_interval(days => $2::int)`,
      [shopId, THRESHOLDS.DUES_STALE_DAYS]
    ),
    // Total udhaar outstanding = Σ positive balances (active customers).
    scalar(
      `SELECT COALESCE(SUM(balance),0)::bigint AS s
         FROM customers
        WHERE shop_id = $1 AND status = 'active' AND balance > 0`,
      [shopId]
    ),
    // Customers at or above NEAR_LIMIT_PCT of a real (>0) credit limit.
    scalar(
      `SELECT COUNT(*)::int AS n
         FROM customers
        WHERE shop_id = $1 AND status = 'active'
          AND credit_limit > 0
          AND balance >= (credit_limit * $2::int) / 100`,
      [shopId, THRESHOLDS.NEAR_LIMIT_PCT]
    ),
    // Best-selling product by order-item quantity over the recent window. Joins
    // orders (shop-scoped) → order_items; skips cancelled orders.
    query(
      `SELECT oi.name AS name, SUM(oi.quantity)::int AS qty
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.shop_id = $1 AND o.status <> 'cancelled'
          AND o.created_at >= NOW() - make_interval(days => $2::int)
        GROUP BY oi.name
        ORDER BY qty DESC, oi.name ASC
        LIMIT 1`,
      [shopId, THRESHOLDS.TOP_ITEM_WINDOW_DAYS]
    ),
    // Busiest weekday by transaction count over the trailing weeks. EXTRACT(DOW)
    // gives 0=Sunday..6=Saturday, which the UI maps to a localized weekday name.
    query(
      `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS c
         FROM transactions
        WHERE shop_id = $1
          AND created_at >= NOW() - make_interval(weeks => $2::int)
        GROUP BY dow
        ORDER BY c DESC, dow ASC
        LIMIT 1`,
      [shopId, THRESHOLDS.BUSY_DAY_WINDOW_WEEKS]
    ),
  ]);

  const duesRow = dues.rows[0] || {};
  const topRow = topItem.rows[0] || null;
  const busyRow = busyDay.rows[0] || null;

  const trailingTotal = Number(trailingCollections || 0);
  const trailingAvg = Math.round(trailingTotal / THRESHOLDS.TRAILING_AVG_DAYS);

  const nudges = buildOwnerNudges({
    payments_today_paise: Number(paymentsToday || 0),
    trailing_daily_avg_paise: trailingAvg,
    dues_count: Number(duesRow.n || 0),
    dues_total_paise: Number(duesRow.total || 0),
    outstanding_total_paise: Number(outstanding || 0),
    near_limit_count: Number(nearLimit || 0),
    top_item: topRow && topRow.name ? { name: topRow.name, quantity: Number(topRow.qty || 0) } : null,
    busy_day: busyRow ? { dow: Number(busyRow.dow), count: Number(busyRow.c || 0) } : null,
  });

  res.json({ nudges, generated_at: new Date().toISOString() });
};
