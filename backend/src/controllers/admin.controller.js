const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const settings = require('../config/settings');
const razorpay = require('../services/razorpay.service');
const whatsapp = require('../services/whatsapp.service');

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

// ---- Integration settings (Razorpay + WhatsApp) --------------------------
// Secrets are never returned — only whether they are set. Key IDs / non-secret
// values are returned so the admin can see and edit them.

const keyId = () => settings.get('RAZORPAY_KEY_ID');

exports.getSettings = async (_req, res) => {
  res.json({
    razorpay: {
      key_id: keyId(),
      mode: keyId().startsWith('rzp_live') ? 'live' : keyId().startsWith('rzp_test') ? 'test' : null,
      key_secret_set: Boolean(settings.get('RAZORPAY_KEY_SECRET')),
      webhook_secret_set: Boolean(settings.get('RAZORPAY_WEBHOOK_SECRET')),
      plan_pro: settings.get('RAZORPAY_PLAN_PRO'),
      plan_family: settings.get('RAZORPAY_PLAN_FAMILY'),
    },
    whatsapp: {
      api_url: settings.get('WHATSAPP_API_URL') || 'https://graph.facebook.com/v18.0',
      phone_number_id: settings.get('WHATSAPP_PHONE_NUMBER_ID'),
      business_account_id: settings.get('WHATSAPP_BUSINESS_ACCOUNT_ID'),
      verify_token: settings.get('WHATSAPP_VERIFY_TOKEN'), // needed to paste into Meta; not a secret
      api_token_set: Boolean(settings.get('WHATSAPP_API_TOKEN')),
      template_reminder: settings.get('WHATSAPP_TEMPLATE_REMINDER'),
      template_lang: settings.get('WHATSAPP_TEMPLATE_LANG') || 'en',
    },
  });
};

exports.updateSettings = async (req, res) => {
  const b = req.body;
  const patch = {};
  // non-secret fields: write when provided (including empty string to clear)
  const passthrough = {
    razorpay_key_id: 'RAZORPAY_KEY_ID',
    razorpay_plan_pro: 'RAZORPAY_PLAN_PRO',
    razorpay_plan_family: 'RAZORPAY_PLAN_FAMILY',
    whatsapp_api_url: 'WHATSAPP_API_URL',
    whatsapp_phone_number_id: 'WHATSAPP_PHONE_NUMBER_ID',
    whatsapp_business_account_id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
    whatsapp_verify_token: 'WHATSAPP_VERIFY_TOKEN',
    whatsapp_template_reminder: 'WHATSAPP_TEMPLATE_REMINDER',
    whatsapp_template_lang: 'WHATSAPP_TEMPLATE_LANG',
  };
  for (const [field, key] of Object.entries(passthrough)) {
    if (b[field] !== undefined) patch[key] = b[field];
  }
  // secrets: only overwrite when a non-empty value is supplied
  const secrets = {
    razorpay_key_secret: 'RAZORPAY_KEY_SECRET',
    razorpay_webhook_secret: 'RAZORPAY_WEBHOOK_SECRET',
    whatsapp_api_token: 'WHATSAPP_API_TOKEN',
  };
  for (const [field, key] of Object.entries(secrets)) {
    if (b[field]) patch[key] = b[field];
  }

  await settings.setMany(patch);
  res.json({ ok: true });
};

exports.testRazorpay = async (_req, res) => {
  try {
    await razorpay.testConnection();
    res.json({ ok: true, message: 'Razorpay keys are valid.' });
  } catch (err) {
    const msg = err.error?.description || err.message || 'Connection failed';
    res.status(400).json({ ok: false, message: msg });
  }
};

exports.testWhatsapp = async (req, res) => {
  const to = req.body.to;
  if (!to) throw ApiError.badRequest('Provide a phone number ("to") to send a test message');
  if (!whatsapp.isConfigured()) throw ApiError.badRequest('WhatsApp is not configured');
  try {
    const r = await whatsapp.sendText(to, 'Test message from Smart Digital Khata — WhatsApp is connected.');
    res.json({ ok: !r.skipped, message: r.skipped ? 'Skipped (not configured)' : 'Test message sent.' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.response?.data?.error?.message || err.message });
  }
};
