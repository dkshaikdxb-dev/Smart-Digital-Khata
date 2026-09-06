// Owner Help "lane B" — weekly WhatsApp summary (Batch J). This module holds the
// per-shop COMPUTATION and the per-shop ITERATION, deliberately factored OUT of
// the BullMQ queue wiring (src/jobs/index.js) so both can be unit-tested WITHOUT
// connecting to Redis. It requires only config/db, the whatsapp service and the
// pure composer (utils/weekly-summary) — never bullmq/ioredis — so a test env
// with no Redis can require it and call runWeeklySummaries() directly.
//
// Money is integer paise throughout; the amounts the summary quotes are exact Σ
// from transactions (the pure composer only groups them into ₹ for display).

const { query } = require('../config/db');
const whatsapp = require('./whatsapp.service');
const logger = require('../utils/logger');
const { buildWeeklySummary, resolveLang } = require('../utils/weekly-summary');

// The last-sent guard: a shop is eligible for a weekly send only when its last
// send is null or strictly older than this. 6 (not 7) days gives the Sunday tick
// a little slack while still preventing a same-week double-send.
const RESEND_MIN_DAYS = 6;

// Window (days) for the "this week" figures.
const WEEK_DAYS = 7;

// The owner's language for the WhatsApp message. There is no per-shop language
// column today, so we fall back through the composer's chain (owner lang → hi →
// en); passing the shop's `language` field (if a future migration adds one) keeps
// this forward-compatible without a code change here.
function shopLang(shop) {
  return resolveLang(shop && shop.language);
}

// computeWeeklyForShop(shopId, lang) → the structured weekly summary + localized
// message for ONE shop, strictly scoped by shopId. Pure aggregation over the
// shop's own rows for the last 7 days; NO writes. Reused by both the HTTP endpoint
// and the worker so the JSON the app shows and the WhatsApp text are identical.
async function computeWeeklyForShop(shopId, lang) {
  const [collections, purchases, dues, topItem, busyDay] = await Promise.all([
    // Collected this week (cash + upi), Σ in exact paise.
    query(
      `SELECT COALESCE(SUM(amount),0)::bigint AS s
         FROM transactions
        WHERE shop_id = $1 AND type IN ('cash','upi')
          AND created_at >= NOW() - make_interval(days => $2::int)`,
      [shopId, WEEK_DAYS]
    ),
    // New udhaar this week (purchases on credit), Σ in exact paise.
    query(
      `SELECT COALESCE(SUM(amount),0)::bigint AS s
         FROM transactions
        WHERE shop_id = $1 AND type = 'purchase'
          AND created_at >= NOW() - make_interval(days => $2::int)`,
      [shopId, WEEK_DAYS]
    ),
    // Customers still owing (balance > 0): count + total, all-time (matches the
    // owner-nudges outstanding rule; shop-scoped, active only).
    query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(balance),0)::bigint AS total
         FROM customers
        WHERE shop_id = $1 AND status = 'active' AND balance > 0`,
      [shopId]
    ),
    // Best-selling item this week by order-item quantity (skips cancelled orders).
    query(
      `SELECT oi.name AS name, SUM(oi.quantity)::int AS qty
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.shop_id = $1 AND o.status <> 'cancelled'
          AND o.created_at >= NOW() - make_interval(days => $2::int)
        GROUP BY oi.name
        ORDER BY qty DESC, oi.name ASC
        LIMIT 1`,
      [shopId, WEEK_DAYS]
    ),
    // Busiest weekday this week by transaction count. EXTRACT(DOW) → 0=Sun..6=Sat.
    query(
      `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS c
         FROM transactions
        WHERE shop_id = $1
          AND created_at >= NOW() - make_interval(days => $2::int)
        GROUP BY dow
        ORDER BY c DESC, dow ASC
        LIMIT 1`,
      [shopId, WEEK_DAYS]
    ),
  ]);

  const duesRow = dues.rows[0] || {};
  const topRow = topItem.rows[0] || null;
  const busyRow = busyDay.rows[0] || null;

  return buildWeeklySummary(
    {
      collected_paise: Number(collections.rows[0].s || 0),
      new_udhaar_paise: Number(purchases.rows[0].s || 0),
      dues_count: Number(duesRow.n || 0),
      dues_total_paise: Number(duesRow.total || 0),
      top_item: topRow && topRow.name ? topRow.name : null,
      busy_day_dow: busyRow ? Number(busyRow.dow) : null,
    },
    lang
  );
}

// sendWeeklyForShop(shop) → compute, resolve the owner phone, send the WhatsApp
// message, stamp weekly_summary_last_sent_at, and log to notification_logs.
// Fire-and-forget PER SHOP: any error is caught and reported so one bad shop can
// never abort the whole run. `shop` is a row with { id, owner_id, name }.
async function sendWeeklyForShop(shop) {
  const lang = shopLang(shop);
  const summary = await computeWeeklyForShop(shop.id, lang);

  // Resolve the OWNER's phone (role='owner' user that owns this shop).
  const ownerRes = await query(
    `SELECT phone FROM users WHERE id = $1 AND role = 'owner'`,
    [shop.owner_id]
  );
  const ownerPhone = ownerRes.rows[0] && ownerRes.rows[0].phone;

  // Skip cleanly when WhatsApp isn't configured OR there's no owner phone: log
  // and continue, do NOT stamp last_sent (so it can send once configured).
  if (!whatsapp.isConfigured()) {
    logger.warn({ shopId: shop.id }, 'weekly summary: WhatsApp not configured — skipping send');
    return { shopId: shop.id, status: 'skipped', reason: 'whatsapp_unconfigured' };
  }
  if (!ownerPhone) {
    logger.warn({ shopId: shop.id }, 'weekly summary: no owner phone — skipping');
    return { shopId: shop.id, status: 'skipped', reason: 'no_owner_phone' };
  }

  await whatsapp.sendText(ownerPhone, summary.message);

  await query('UPDATE shops SET weekly_summary_last_sent_at = NOW() WHERE id = $1', [shop.id]);
  await query(
    `INSERT INTO notification_logs (shop_id, channel, kind, payload, status)
     VALUES ($1, 'whatsapp', 'weekly_summary', $2, 'sent')`,
    [shop.id, JSON.stringify({ lang: summary.lang, quiet: summary.quiet, collected_paise: summary.collected_paise })]
  );

  return { shopId: shop.id, status: 'sent' };
}

// runWeeklySummaries() → the worker body. For every eligible shop (status=active
// AND weekly_summary=true AND last-sent null or > RESEND_MIN_DAYS ago) it sends
// the summary, isolating failures so one shop never aborts the run. Returns a
// small report { eligible, sent, skipped, failed } for logging/testing. Does NOT
// touch Redis — safe to call directly in a test.
async function runWeeklySummaries() {
  const shopsRes = await query(
    `SELECT id, owner_id, name
       FROM shops
      WHERE status = 'active'
        AND weekly_summary = true
        AND (weekly_summary_last_sent_at IS NULL
             OR weekly_summary_last_sent_at < NOW() - make_interval(days => $1::int))`,
    [RESEND_MIN_DAYS]
  );

  const report = { eligible: shopsRes.rowCount, sent: 0, skipped: 0, failed: 0 };
  for (const shop of shopsRes.rows) {
    try {
      const r = await sendWeeklyForShop(shop);
      if (r.status === 'sent') report.sent += 1;
      else report.skipped += 1;
    } catch (err) {
      report.failed += 1;
      logger.error({ err: err.message, shopId: shop.id }, 'weekly summary: per-shop send failed');
    }
  }
  logger.info(report, 'Weekly summaries run complete');
  return report;
}

module.exports = {
  computeWeeklyForShop,
  sendWeeklyForShop,
  runWeeklySummaries,
  shopLang,
  RESEND_MIN_DAYS,
  WEEK_DAYS,
};
