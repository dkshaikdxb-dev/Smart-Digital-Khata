const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Hard-coded plans for MVP. Replace plan_id with actual Razorpay plan IDs when live.
const PLANS = [
  { code: 'free',   name: 'Free',   price: 0,      currency: 'INR', limits: { customers: 50,   notifications: 'smart' } },
  { code: 'pro',    name: 'Pro',    price: 29900,  currency: 'INR', limits: { customers: 1000, notifications: 'active' } },
  { code: 'family', name: 'Family', price: 59900,  currency: 'INR', limits: { customers: 5000, notifications: 'active', family_share: true } },
];

exports.listPlans = async (_req, res) => res.json({ plans: PLANS });

exports.getMine = async (req, res) => {
  const r = await query(
    'SELECT s.plan, sub.* FROM shops s LEFT JOIN subscriptions sub ON sub.shop_id = s.id AND sub.status = $1 WHERE s.id = $2',
    ['active', req.user.shopId]
  );
  res.json({ subscription: r.rows[0] || { plan: 'free', status: 'active' } });
};

exports.upgrade = async (req, res) => {
  const { plan } = req.body;
  const target = PLANS.find((p) => p.code === plan);
  if (!target) throw ApiError.badRequest('Unknown plan');

  await query(
    `INSERT INTO subscriptions (shop_id, plan, status, amount, currency)
     VALUES ($1, $2, 'active', $3, $4)`,
    [req.user.shopId, target.code, target.price, target.currency]
  );
  await query('UPDATE shops SET plan = $1 WHERE id = $2', [target.code, req.user.shopId]);
  res.json({ ok: true, plan: target });
};

exports.cancel = async (req, res) => {
  await query(
    `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW()
     WHERE shop_id = $1 AND status = 'active'`,
    [req.user.shopId]
  );
  await query('UPDATE shops SET plan = $1 WHERE id = $2', ['free', req.user.shopId]);
  res.json({ ok: true });
};
