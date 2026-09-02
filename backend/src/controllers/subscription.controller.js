const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const logger = require('../utils/logger');

// Plan catalog. Prices in paise. Razorpay plan IDs come from env (§ .env.example).
const PLANS = [
  { code: 'free',   name: 'Free',   price: 0,      currency: 'INR', limits: { customers: 50,   notifications: 'smart' } },
  { code: 'pro',    name: 'Pro',    price: 29900,  currency: 'INR', limits: { customers: 1000, notifications: 'active' } },
  { code: 'family', name: 'Family', price: 59900,  currency: 'INR', limits: { customers: 5000, notifications: 'active', family_share: true } },
];

exports.listPlans = async (_req, res) => {
  res.json({
    plans: PLANS.map((p) => ({
      ...p,
      billing: p.price === 0 ? 'free' : razorpay.isSubscriptionBillingConfigured(p.code) ? 'razorpay' : 'manual',
    })),
  });
};

exports.getMine = async (req, res) => {
  const r = await query(
    `SELECT s.plan AS shop_plan, sub.*
     FROM shops s
     LEFT JOIN subscriptions sub
       ON sub.shop_id = s.id AND sub.status IN ('pending','active','past_due')
     WHERE s.id = $1
     ORDER BY sub.started_at DESC NULLS LAST
     LIMIT 1`,
    [req.user.shopId]
  );
  const row = r.rows[0] || {};
  res.json({
    subscription: {
      plan: row.plan || row.shop_plan || 'free',
      status: row.status || 'active',
      provider_subscription_id: row.provider_subscription_id || null,
      authorization_url: row.status === 'pending' ? row.provider_short_url : null,
    },
  });
};

/**
 * Upgrade flow:
 *  - free            → instant downgrade-to-free (cancels any active sub).
 *  - paid + Razorpay plan configured → create Razorpay subscription; shop
 *    plan flips only when the subscription.activated webhook arrives.
 *    Response carries authorization_url for the customer to complete mandate.
 *  - paid + Razorpay NOT configured  → manual mode (dev/demo): instant flip,
 *    clearly labeled billing:'manual'.
 */
exports.upgrade = async (req, res) => {
  const { plan } = req.body;
  const target = PLANS.find((p) => p.code === plan);
  if (!target) throw ApiError.badRequest('Unknown plan');

  if (target.code === 'free') {
    return exports.cancel(req, res);
  }

  if (razorpay.isSubscriptionBillingConfigured(target.code)) {
    const sub = await razorpay.createSubscription({
      plan_id: razorpay.planIdFor(target.code),
      total_count: 12,
      notes: { shop_id: req.user.shopId, plan: target.code },
    });
    await query(
      `INSERT INTO subscriptions
         (shop_id, plan, status, amount, currency, provider, provider_subscription_id, provider_short_url)
       VALUES ($1,$2,'pending',$3,$4,'razorpay',$5,$6)`,
      [req.user.shopId, target.code, target.price, target.currency, sub.id, sub.short_url || null]
    );
    logger.info({ shopId: req.user.shopId, sub: sub.id }, 'Razorpay subscription created (pending auth)');
    return res.json({
      ok: true,
      billing: 'razorpay',
      status: 'pending',
      authorization_url: sub.short_url,
      message: 'Complete the payment authorization to activate your plan.',
    });
  }

  // Manual fallback (no Razorpay plan configured — dev/demo environments)
  await query(
    `INSERT INTO subscriptions (shop_id, plan, status, amount, currency, provider)
     VALUES ($1,$2,'active',$3,$4,'manual')`,
    [req.user.shopId, target.code, target.price, target.currency]
  );
  await query('UPDATE shops SET plan = $1 WHERE id = $2', [target.code, req.user.shopId]);
  res.json({ ok: true, billing: 'manual', status: 'active', plan: target });
};

exports.cancel = async (req, res) => {
  const active = await query(
    `SELECT * FROM subscriptions
     WHERE shop_id = $1 AND status IN ('pending','active','past_due')
     ORDER BY started_at DESC LIMIT 1`,
    [req.user.shopId]
  );

  if (active.rowCount && active.rows[0].provider === 'razorpay' && active.rows[0].provider_subscription_id) {
    try {
      await razorpay.cancelSubscription(active.rows[0].provider_subscription_id);
    } catch (err) {
      // Already cancelled/expired at Razorpay is fine; anything else, log and continue local cancel.
      logger.warn({ err: err.error?.description || err.message }, 'Razorpay cancel failed (continuing local cancel)');
    }
  }

  await query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
     WHERE shop_id = $1 AND status IN ('pending','active','past_due')`,
    [req.user.shopId]
  );
  await query('UPDATE shops SET plan = $1 WHERE id = $2', ['free', req.user.shopId]);
  res.json({ ok: true, plan: 'free' });
};
