const { query } = require('../config/db');
const { hasPermission } = require('../config/permissions');
const { PLAN_PRICE } = require('./admin.controller');
const { buildInsights } = require('../utils/insights');

// Admin "Khata Control Room" (Phase E). One read-only aggregation endpoint that
// returns { sections, insights, generated_at }. It is pure aggregation over the
// tables Phases A–D already created — NO new schema, NO writes.
//
// Every section is PERMISSION-GATED by the caller's Phase C admin sub-role
// (req.adminRole, resolved by loadAdminRole): a section is present only when
// hasPermission(req.adminRole, <perm>) is true, so a support/finance/moderation
// admin sees exactly the slices their role allows. The insights are then built
// from ONLY those permitted sections by the pure rule engine (utils/insights),
// so they can never surface a figure the caller wasn't entitled to see.
//
// Money is integer paise server-side throughout (the frontend renders rupees).
// GMV for an order is subtotal + delivery_fee, both snapshotted in paise on the
// orders row. High-GMV upsell threshold is a named constant in paise.
const UPSELL_GMV_THRESHOLD_PAISE = 500000; // ₹5,000 of 30-day order GMV on a Free plan

// A single-row scalar helper. Returns the first column of the first row.
async function scalar(sql, params) {
  const r = await query(sql, params);
  const row = r.rows[0] || {};
  const k = Object.keys(row)[0];
  return row[k];
}

// ---- Section builders. Each returns the plain-JSON slice for its section. ---

async function buildOverview() {
  const [
    totalShops, activeShops, listedShops, suspendedShops,
    totalConsumers, totalLedgerCustomers, totalTx, totalOrders, consumersNeverOrdered,
  ] = await Promise.all([
    scalar('SELECT COUNT(*)::int AS c FROM shops'),
    scalar("SELECT COUNT(DISTINCT shop_id)::int AS c FROM transactions WHERE created_at >= NOW() - INTERVAL '30 days'"),
    scalar('SELECT COUNT(*)::int AS c FROM shops WHERE is_listed = true'),
    scalar("SELECT COUNT(*)::int AS c FROM shops WHERE status = 'suspended'"),
    scalar('SELECT COUNT(*)::int AS c FROM customer_users'),
    scalar('SELECT COUNT(*)::int AS c FROM customers'),
    scalar('SELECT COUNT(*)::int AS c FROM transactions'),
    scalar('SELECT COUNT(*)::int AS c FROM orders'),
    // A consumer (customer_users) is linked to a shop's ledger customer by phone;
    // "never ordered" = no order exists for any ledger customer sharing the phone.
    scalar(
      `SELECT COUNT(*)::int AS c FROM customer_users cu
       WHERE NOT EXISTS (
         SELECT 1 FROM customers c JOIN orders o ON o.customer_id = c.id
         WHERE c.phone = cu.phone
       )`
    ),
  ]);
  return {
    total_shops: totalShops,
    active_shops_30d: activeShops,
    listed_shops: listedShops,
    suspended_shops: suspendedShops,
    total_consumers: totalConsumers,
    total_ledger_customers: totalLedgerCustomers,
    total_transactions: totalTx,
    total_orders: totalOrders,
    consumers_never_ordered: consumersNeverOrdered,
  };
}

async function buildGrowth() {
  // Weekly signups (shops + consumers) for the last 8 ISO weeks, zero-filled so
  // the sparkline always has 8 points even when a week had no signups.
  const [shopWeeks, consumerWeeks, withProduct, withTx, withOrder, totalShops, neverActivated] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS wk, COUNT(*)::int AS c
       FROM shops WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '7 weeks'
       GROUP BY 1 ORDER BY 1`
    ),
    query(
      `SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS wk, COUNT(*)::int AS c
       FROM customer_users WHERE created_at >= date_trunc('week', NOW()) - INTERVAL '7 weeks'
       GROUP BY 1 ORDER BY 1`
    ),
    scalar('SELECT COUNT(DISTINCT shop_id)::int AS c FROM products'),
    scalar('SELECT COUNT(DISTINCT shop_id)::int AS c FROM transactions'),
    // Activation funnel's deepest step: shops that have received an order.
    scalar('SELECT COUNT(DISTINCT shop_id)::int AS c FROM orders'),
    scalar('SELECT COUNT(*)::int AS c FROM shops'),
    // Never activated = has NO product OR has NO transaction.
    scalar(
      `SELECT COUNT(*)::int AS c FROM shops s
       WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id)
          OR NOT EXISTS (SELECT 1 FROM transactions t WHERE t.shop_id = s.id)`
    ),
  ]);

  // Build the 8 week buckets (oldest → newest) keyed by the week-start date.
  const shopMap = new Map(shopWeeks.rows.map((r) => [r.wk, r.c]));
  const consumerMap = new Map(consumerWeeks.rows.map((r) => [r.wk, r.c]));
  const weeks = [];
  const now = new Date();
  // Monday-start weeks to mirror date_trunc('week', ...).
  const day = now.getUTCDay(); // 0 Sun..6 Sat
  const mondayOffset = (day + 6) % 7;
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisMonday.getTime() - i * 7 * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    weeks.push({ week: key, shops: shopMap.get(key) || 0, consumers: consumerMap.get(key) || 0 });
  }

  // Week-over-week growth from the two most-recent COMPLETE weeks (weeks[7] is
  // the current, still-partial week, so it is excluded to avoid a false dip).
  const lastFull = weeks[6] || { shops: 0, consumers: 0 };
  const priorFull = weeks[5] || { shops: 0, consumers: 0 };
  const last = lastFull.shops + lastFull.consumers;
  const prev = priorFull.shops + priorFull.consumers;
  const wowPct = prev > 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null;

  return {
    weekly: weeks,
    wow: { prev, last, pct: wowPct },
    activation: {
      total_shops: totalShops,
      shops_with_product: withProduct,
      shops_with_transaction: withTx,
      shops_with_order: withOrder,
      never_activated: neverActivated,
    },
  };
}

async function buildCommerce() {
  const [byStatus, byFulfillment, byPayment, gmv] = await Promise.all([
    query('SELECT status, COUNT(*)::int AS c FROM orders GROUP BY status ORDER BY c DESC'),
    query('SELECT fulfillment_type, COUNT(*)::int AS c FROM orders GROUP BY fulfillment_type ORDER BY c DESC'),
    query('SELECT payment_mode, COUNT(*)::int AS c FROM orders GROUP BY payment_mode ORDER BY c DESC'),
    scalar("SELECT COALESCE(SUM(subtotal + delivery_fee),0)::bigint AS s FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'"),
  ]);
  const paymentCounts = { credit: 0, prepaid: 0, cash: 0 };
  for (const row of byPayment.rows) {
    if (paymentCounts[row.payment_mode] !== undefined) paymentCounts[row.payment_mode] = row.c;
  }
  return {
    orders_by_status: byStatus.rows,
    orders_by_fulfillment: byFulfillment.rows,
    orders_by_payment_mode: byPayment.rows,
    payment_mode_counts: paymentCounts,
    gmv_30d_paise: Number(gmv || 0),
  };
}

async function buildNetwork() {
  // Outstanding = Σ positive ledger balances. Aging buckets approximate a
  // customer's debt age from their most-recent transaction (last activity);
  // customers with a balance but no transaction fall back to their created_at.
  const [outstanding, aging, purchased, paid] = await Promise.all([
    scalar('SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE balance > 0'),
    query(
      `WITH last_activity AS (
         SELECT customer_id, MAX(created_at) AS last_at FROM transactions GROUP BY customer_id
       )
       SELECT
         COALESCE(SUM(balance) FILTER (WHERE days <= 30), 0)::bigint             AS b0_30,
         COALESCE(SUM(balance) FILTER (WHERE days > 30 AND days <= 60), 0)::bigint AS b31_60,
         COALESCE(SUM(balance) FILTER (WHERE days > 60), 0)::bigint              AS b61_plus,
         COUNT(*) FILTER (WHERE days <= 30)::int              AS n0_30,
         COUNT(*) FILTER (WHERE days > 30 AND days <= 60)::int AS n31_60,
         COUNT(*) FILTER (WHERE days > 60)::int               AS n61_plus
       FROM (
         SELECT c.balance,
                EXTRACT(DAY FROM NOW() - COALESCE(la.last_at, c.created_at))::int AS days
         FROM customers c
         LEFT JOIN last_activity la ON la.customer_id = c.id
         WHERE c.balance > 0
       ) aged`
    ),
    scalar("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE type = 'purchase' AND created_at >= NOW() - INTERVAL '30 days'"),
    scalar("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE type IN ('cash','upi') AND created_at >= NOW() - INTERVAL '30 days'"),
  ]);

  const purchased30 = Number(purchased || 0);
  const paid30 = Number(paid || 0);
  const rate = purchased30 > 0 ? Math.round((paid30 / purchased30) * 1000) / 10 : null;
  const a = aging.rows[0] || {};
  return {
    outstanding_total_paise: Number(outstanding || 0),
    aging: {
      b0_30_paise: Number(a.b0_30 || 0),
      b31_60_paise: Number(a.b31_60 || 0),
      b61_plus_paise: Number(a.b61_plus || 0),
      n0_30: a.n0_30 || 0,
      n31_60: a.n31_60 || 0,
      n61_plus: a.n61_plus || 0,
    },
    purchased_30d_paise: purchased30,
    paid_30d_paise: paid30,
    collection_rate_pct: rate === null ? 0 : rate,
    has_collection_data: purchased30 > 0,
  };
}

async function buildGeography() {
  const r = await query(
    `SELECT COALESCE(NULLIF(TRIM(city), ''), 'Unknown') AS city, COUNT(*)::int AS c
     FROM shops GROUP BY 1 ORDER BY c DESC, city ASC LIMIT 10`
  );
  return { top_cities: r.rows };
}

async function buildRevenue() {
  const plans = await query("SELECT plan, COUNT(*)::int AS c FROM shops GROUP BY plan");
  const planCounts = { free: 0, pro: 0, family: 0 };
  let mrr = 0;
  for (const row of plans.rows) {
    if (planCounts[row.plan] !== undefined) planCounts[row.plan] = row.c;
    mrr += (PLAN_PRICE[row.plan] || 0) * row.c;
  }
  // Upsell candidates: Free-plan shops whose 30-day order GMV clears the bar.
  const upsell = await scalar(
    `SELECT COUNT(*)::int AS c FROM (
       SELECT s.id
       FROM shops s
       JOIN orders o ON o.shop_id = s.id AND o.created_at >= NOW() - INTERVAL '30 days'
       WHERE s.plan = 'free'
       GROUP BY s.id
       HAVING COALESCE(SUM(o.subtotal + o.delivery_fee), 0) >= $1
     ) x`,
    [UPSELL_GMV_THRESHOLD_PAISE]
  );
  return {
    plan_counts: planCounts,
    plan_price_paise: { ...PLAN_PRICE },
    mrr_paise: mrr,
    upsell_candidates: upsell || 0,
    upsell_gmv_threshold_paise: UPSELL_GMV_THRESHOLD_PAISE,
  };
}

async function buildAcquisition() {
  // Onboarding-source attribution (reuses Phase D's data model). Top referrers
  // are labelled by explicit code label, else the owner's name/phone.
  const [byChannel, top, totals, accrued] = await Promise.all([
    query(
      `SELECT COALESCE(source_channel, 'unknown') AS channel, COUNT(*)::int AS c
       FROM referrals GROUP BY COALESCE(source_channel, 'unknown') ORDER BY c DESC`
    ),
    query(
      `SELECT rc.code, rc.owner_type,
              COALESCE(rc.label, u.name, cu.name, cu.phone) AS label,
              COUNT(r.id)::int AS referred_count
       FROM referral_codes rc
       JOIN referrals r ON r.referral_code_id = rc.id
       LEFT JOIN users u ON u.id = rc.owner_user_id
       LEFT JOIN customer_users cu ON cu.id = rc.owner_customer_id
       GROUP BY rc.code, rc.owner_type, rc.label, u.name, cu.name, cu.phone
       ORDER BY referred_count DESC, rc.code ASC
       LIMIT 5`
    ),
    scalar('SELECT COUNT(*)::int AS c FROM referrals'),
    scalar("SELECT COALESCE(SUM(amount_paise),0)::bigint AS s FROM referral_rewards WHERE status = 'accrued'"),
  ]);
  return {
    source_channel_mix: byChannel.rows,
    top_referrers: top.rows.map((r) => ({
      code: r.code,
      owner_type: r.owner_type,
      label: r.label || null,
      referred_count: r.referred_count,
    })),
    total_referrals: totals || 0,
    accrued_total_paise: Number(accrued || 0),
  };
}

async function buildLanguages() {
  // Registry POSTURE only — which languages are live vs staged and their audit
  // status. Per-user language usage is NOT tracked server-side, so we never
  // fabricate usage figures; the control room shows the registry, not analytics.
  const r = await query(
    'SELECT code, label, english_name, rtl, is_active, audit_status, sort_order FROM languages ORDER BY sort_order ASC, code ASC'
  );
  const active = r.rows.filter((l) => l.is_active);
  const staged = r.rows.filter((l) => !l.is_active);
  return {
    active_count: active.length,
    staged_count: staged.length,
    active: active.map((l) => ({
      code: l.code, label: l.label, english_name: l.english_name, rtl: l.rtl, audit_status: l.audit_status,
    })),
    staged: staged.map((l) => ({
      code: l.code, label: l.label, english_name: l.english_name, rtl: l.rtl, audit_status: l.audit_status,
    })),
  };
}

async function buildTrust() {
  const [byAction, blockedUsers, blockedConsumers, suspendedShops, total30] = await Promise.all([
    query("SELECT action, COUNT(*)::int AS c FROM moderation_actions WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY action ORDER BY c DESC"),
    scalar("SELECT COUNT(*)::int AS c FROM users WHERE status = 'blocked'"),
    scalar("SELECT COUNT(*)::int AS c FROM customer_users WHERE status = 'blocked'"),
    scalar("SELECT COUNT(*)::int AS c FROM shops WHERE status = 'suspended'"),
    scalar("SELECT COUNT(*)::int AS c FROM moderation_actions WHERE created_at >= NOW() - INTERVAL '30 days'"),
  ]);
  return {
    actions_by_type: byAction.rows,
    moderation_actions_30d: total30 || 0,
    blocked_users: blockedUsers || 0,
    blocked_consumers: blockedConsumers || 0,
    suspended_shops: suspendedShops || 0,
  };
}

// ---- Batch L: domain-specific cuts (all read-only over existing tables) -----

// Marketing (shops:view). Onboarding-attribution and reach cuts — the referral
// source-channel mix, top referrers BY COUNT (no money), signups by referred
// type, and the listed-shops share. The money side of referrals (accrued
// rewards) stays in buildAcquisition under revenue:view; this is attribution
// only, so it is safe for a shops:view caller.
async function buildMarketing() {
  const [byChannel, top, byType, listedShare] = await Promise.all([
    query(
      `SELECT COALESCE(source_channel, 'unknown') AS channel, COUNT(*)::int AS c
       FROM referrals GROUP BY COALESCE(source_channel, 'unknown') ORDER BY c DESC`
    ),
    query(
      `SELECT rc.code, rc.owner_type,
              COALESCE(rc.label, u.name, cu.name, cu.phone) AS label,
              COUNT(r.id)::int AS referred_count
       FROM referral_codes rc
       JOIN referrals r ON r.referral_code_id = rc.id
       LEFT JOIN users u ON u.id = rc.owner_user_id
       LEFT JOIN customer_users cu ON cu.id = rc.owner_customer_id
       GROUP BY rc.code, rc.owner_type, rc.label, u.name, cu.name, cu.phone
       ORDER BY referred_count DESC, rc.code ASC
       LIMIT 5`
    ),
    query('SELECT referred_type, COUNT(*)::int AS c FROM referrals GROUP BY referred_type ORDER BY c DESC'),
    query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_listed = true)::int AS listed FROM shops'),
  ]);
  const ls = listedShare.rows[0] || { total: 0, listed: 0 };
  const listedPct = ls.total > 0 ? Math.round((ls.listed / ls.total) * 1000) / 10 : 0;
  return {
    source_channel_mix: byChannel.rows,
    top_referrers: top.rows.map((r) => ({
      code: r.code, owner_type: r.owner_type, label: r.label || null, referred_count: r.referred_count,
    })),
    signups_by_owner_type: byType.rows,
    listed_shops: ls.listed,
    total_shops: ls.total,
    listed_share_pct: listedPct,
  };
}

// Research (shops:view). Exploratory catalogue + order-pattern cuts. All derived
// from existing rows; nothing here is fabricated — a cut with no data comes back
// as an empty list / zero, which the UI simply renders as "no data yet".
async function buildResearch() {
  const [catalogue, topCategories, topSub, weekday, hour, loose] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT shop_id)::int AS shops_with_products,
              COUNT(DISTINCT shop_id) FILTER (WHERE catalog_item_id IS NOT NULL)::int AS shops_using_base,
              COUNT(*) FILTER (WHERE catalog_item_id IS NOT NULL)::int AS base_linked_products,
              COUNT(*) FILTER (WHERE catalog_item_id IS NULL)::int AS custom_products
       FROM products`
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(ci.category), ''), 'Uncategorised') AS category, COUNT(*)::int AS c
       FROM products p JOIN catalog_items ci ON ci.id = p.catalog_item_id
       GROUP BY 1 ORDER BY c DESC, category ASC LIMIT 8`
    ),
    query(
      `SELECT COALESCE(NULLIF(TRIM(ci.subcategory), ''), 'Other') AS subcategory, COUNT(*)::int AS c
       FROM products p JOIN catalog_items ci ON ci.id = p.catalog_item_id
       WHERE ci.subcategory IS NOT NULL AND TRIM(ci.subcategory) <> ''
       GROUP BY 1 ORDER BY c DESC, subcategory ASC LIMIT 8`
    ),
    query("SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS c FROM orders GROUP BY 1 ORDER BY 1"),
    query("SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS c FROM orders GROUP BY 1 ORDER BY 1"),
    query('SELECT COUNT(*) FILTER (WHERE sold_by_weight = true)::int AS loose, COUNT(*) FILTER (WHERE sold_by_weight = false)::int AS unit FROM products'),
  ]);
  const cat = catalogue.rows[0] || {};
  const l = loose.rows[0] || { loose: 0, unit: 0 };
  // Zero-fill the 7 weekday buckets so the UI always has a full week (0 = Sun).
  const dowMap = new Map(weekday.rows.map((r) => [r.dow, r.c]));
  const orders_by_weekday = [];
  for (let d = 0; d < 7; d++) orders_by_weekday.push({ dow: d, c: dowMap.get(d) || 0 });
  return {
    catalogue: {
      shops_with_products: cat.shops_with_products || 0,
      shops_using_base: cat.shops_using_base || 0,
      base_linked_products: cat.base_linked_products || 0,
      custom_products: cat.custom_products || 0,
      loose_products: l.loose || 0,
      unit_products: l.unit || 0,
    },
    top_categories: topCategories.rows,
    top_subcategories: topSub.rows,
    orders_by_weekday,
    orders_by_hour: hour.rows,
  };
}

// Finance (revenue:view). Money-side derivations that build on the plan mix and
// the ledger: ARPU, run-rate, and the collection-rate TREND (this 30-day window
// vs the prior 30-day window). Money stays integer paise throughout.
async function buildFinance() {
  const [plans, trend] = await Promise.all([
    query("SELECT plan, COUNT(*)::int AS c FROM shops GROUP BY plan"),
    // Two windows: current = last 30 days; prior = days 31–60. Collection rate =
    // repayments (cash/upi) over purchases in the same window.
    query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'purchase' AND created_at >= NOW() - INTERVAL '30 days'), 0)::bigint AS cur_purch,
         COALESCE(SUM(amount) FILTER (WHERE type IN ('cash','upi') AND created_at >= NOW() - INTERVAL '30 days'), 0)::bigint AS cur_paid,
         COALESCE(SUM(amount) FILTER (WHERE type = 'purchase' AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'), 0)::bigint AS prior_purch,
         COALESCE(SUM(amount) FILTER (WHERE type IN ('cash','upi') AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'), 0)::bigint AS prior_paid
       FROM transactions`
    ),
  ]);
  const planCounts = { free: 0, pro: 0, family: 0 };
  let mrr = 0;
  for (const row of plans.rows) {
    if (planCounts[row.plan] !== undefined) planCounts[row.plan] = row.c;
    mrr += (PLAN_PRICE[row.plan] || 0) * row.c;
  }
  const payingShops = planCounts.pro + planCounts.family;
  const arpu = payingShops > 0 ? Math.round(mrr / payingShops) : 0;

  const t = trend.rows[0] || {};
  const curPurch = Number(t.cur_purch || 0);
  const curPaid = Number(t.cur_paid || 0);
  const priorPurch = Number(t.prior_purch || 0);
  const priorPaid = Number(t.prior_paid || 0);
  const curPct = curPurch > 0 ? Math.round((curPaid / curPurch) * 1000) / 10 : null;
  const priorPct = priorPurch > 0 ? Math.round((priorPaid / priorPurch) * 1000) / 10 : null;

  return {
    plan_counts: planCounts,
    plan_price_paise: { ...PLAN_PRICE },
    mrr_paise: mrr,
    paying_shops: payingShops,
    arpu_paise: arpu,
    run_rate_paise: mrr * 12,
    collection_trend: {
      current_pct: curPct,
      prior_pct: priorPct,
      delta: (curPct != null && priorPct != null) ? Math.round((curPct - priorPct) * 10) / 10 : null,
    },
  };
}

// Investor (revenue:view). A single north-star screen: active shops, consumers,
// GMV (30d + all-time), MRR + run-rate, period-over-period growth, collection
// rate, outstanding, and the referral-driven signup share. All aggregation.
async function buildInvestor() {
  const [
    activeShops, totalShops, totalConsumers, gmv30, gmvAll, plans, outstanding,
    coll, referred, cur30, prior30,
  ] = await Promise.all([
    scalar("SELECT COUNT(DISTINCT shop_id)::int AS c FROM transactions WHERE created_at >= NOW() - INTERVAL '30 days'"),
    scalar('SELECT COUNT(*)::int AS c FROM shops'),
    scalar('SELECT COUNT(*)::int AS c FROM customer_users'),
    scalar("SELECT COALESCE(SUM(subtotal + delivery_fee),0)::bigint AS s FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'"),
    scalar('SELECT COALESCE(SUM(subtotal + delivery_fee),0)::bigint AS s FROM orders'),
    query("SELECT plan, COUNT(*)::int AS c FROM shops GROUP BY plan"),
    scalar('SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE balance > 0'),
    query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'purchase'), 0)::bigint AS purch,
         COALESCE(SUM(amount) FILTER (WHERE type IN ('cash','upi')), 0)::bigint AS paid
       FROM transactions WHERE created_at >= NOW() - INTERVAL '30 days'`
    ),
    // Distinct principals attributed to a referral code (shops + consumers).
    scalar('SELECT COUNT(*)::int AS c FROM referrals'),
    // New signups (shops + consumers) in the last 30 days vs the prior 30.
    scalar(
      `SELECT (
         (SELECT COUNT(*) FROM shops WHERE created_at >= NOW() - INTERVAL '30 days')
       + (SELECT COUNT(*) FROM customer_users WHERE created_at >= NOW() - INTERVAL '30 days')
       )::int AS c`
    ),
    scalar(
      `SELECT (
         (SELECT COUNT(*) FROM shops WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days')
       + (SELECT COUNT(*) FROM customer_users WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days')
       )::int AS c`
    ),
  ]);

  const planCounts = { free: 0, pro: 0, family: 0 };
  let mrr = 0;
  for (const row of plans.rows) {
    if (planCounts[row.plan] !== undefined) planCounts[row.plan] = row.c;
    mrr += (PLAN_PRICE[row.plan] || 0) * row.c;
  }
  const c = coll.rows[0] || {};
  const purch = Number(c.purch || 0);
  const paid = Number(c.paid || 0);
  const collectionPct = purch > 0 ? Math.round((paid / purch) * 1000) / 10 : null;

  const cur = Number(cur30 || 0);
  const prior = Number(prior30 || 0);
  const growthPct = prior > 0 ? Math.round(((cur - prior) / prior) * 1000) / 10 : null;

  const signupsTotal = (totalShops || 0) + (totalConsumers || 0);
  const referralPct = signupsTotal > 0 ? Math.round((Number(referred || 0) / signupsTotal) * 1000) / 10 : 0;

  return {
    active_shops_30d: activeShops || 0,
    total_shops: totalShops || 0,
    total_consumers: totalConsumers || 0,
    gmv_30d_paise: Number(gmv30 || 0),
    gmv_all_time_paise: Number(gmvAll || 0),
    mrr_paise: mrr,
    run_rate_paise: mrr * 12,
    growth_rate_pct: growthPct,
    signups_30d: cur,
    signups_prior_30d: prior,
    collection_rate_pct: collectionPct,
    outstanding_total_paise: Number(outstanding || 0),
    referral_driven_signups: Number(referred || 0),
    referral_driven_pct: referralPct,
  };
}

// The fixed domain tab order + the permission each tab requires. The controller
// includes a tab in the `domains` descriptor only when the caller holds its
// perm, so a tab the caller can't see is simply absent (the UI hides it).
const DOMAIN_PERMS = Object.freeze({
  overview: 'shops:view',
  marketing: 'shops:view',
  growth: 'shops:view',
  finance: 'revenue:view',
  research: 'shops:view',
  investor: 'revenue:view',
});

// GET /api/admin/dashboard — assemble every section the caller may see, then
// derive the insights from exactly those sections.
exports.dashboard = async (req, res) => {
  const role = req.adminRole;
  const sections = {};

  // Each section is gated by the SAME permission the mockup/spec assigns it, so
  // the payload only ever contains slices this admin sub-role is entitled to.
  const canShops = hasPermission(role, 'shops:view');
  const canRevenue = hasPermission(role, 'revenue:view');
  const canAudit = hasPermission(role, 'audit:view');

  const tasks = [];
  if (canShops) {
    tasks.push(buildOverview().then((v) => { sections.overview = v; }));
    tasks.push(buildGrowth().then((v) => { sections.growth = v; }));
    tasks.push(buildCommerce().then((v) => { sections.commerce = v; }));
    tasks.push(buildNetwork().then((v) => { sections.network = v; }));
    tasks.push(buildGeography().then((v) => { sections.geography = v; }));
    tasks.push(buildLanguages().then((v) => { sections.languages = v; }));
    tasks.push(buildMarketing().then((v) => { sections.marketing = v; }));
    tasks.push(buildResearch().then((v) => { sections.research = v; }));
  }
  if (canRevenue) {
    tasks.push(buildRevenue().then((v) => { sections.revenue = v; }));
    tasks.push(buildAcquisition().then((v) => { sections.acquisition = v; }));
    tasks.push(buildFinance().then((v) => { sections.finance = v; }));
    tasks.push(buildInvestor().then((v) => { sections.investor = v; }));
  }
  if (canAudit) {
    tasks.push(buildTrust().then((v) => { sections.trust = v; }));
  }
  await Promise.all(tasks);

  const insights = buildInsights(sections);

  // The visible domain tabs (fixed order), each present only when the caller
  // holds its permission. The frontend renders one tab per key and reads the
  // relevant flat `sections.*` for its contents; `perm` lets it second-gate.
  const domains = {};
  for (const [name, perm] of Object.entries(DOMAIN_PERMS)) {
    if (hasPermission(role, perm)) domains[name] = { perm };
  }

  res.json({ sections, domains, insights, generated_at: new Date().toISOString() });
};
