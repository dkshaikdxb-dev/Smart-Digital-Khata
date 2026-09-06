const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const settings = require('../config/settings');
const razorpay = require('../services/razorpay.service');
const whatsapp = require('../services/whatsapp.service');
const { hasPermission, permissionsFor } = require('../config/permissions');

// Append one row to the moderation audit trail. Best-effort metadata is JSON.
async function writeAudit({ adminUserId, action, targetType, targetId, reason, metadata }) {
  await query(
    `INSERT INTO moderation_actions (admin_user_id, action, target_type, target_id, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [adminUserId || null, action, targetType, targetId, reason || null, metadata ? JSON.stringify(metadata) : null]
  );
}

// Monthly price per plan, in paise (mirrors subscription.controller PLANS).
// Exported so the admin CSV exports (revenue.csv) reuse the same plan config.
const PLAN_PRICE = { free: 0, pro: 29900, family: 59900 };
exports.PLAN_PRICE = PLAN_PRICE;

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
  const { status, plan, reason } = req.body;

  // Field-dependent permission gating: a status change (suspend/reinstate) is a
  // moderation action; a plan change is a billing/settings action. Either is
  // allowed for a role holding shops:moderate. super holds both.
  if (status !== undefined && !hasPermission(req.adminRole, 'shops:moderate')) {
    throw ApiError.forbidden('You do not have permission to change a shop status');
  }
  if (plan !== undefined
      && !hasPermission(req.adminRole, 'settings:manage')
      && !hasPermission(req.adminRole, 'shops:moderate')) {
    throw ApiError.forbidden('You do not have permission to change a shop plan');
  }

  // Read the current row so we only audit a real status change and can record
  // the before/after in metadata.
  const before = await query('SELECT status, plan FROM shops WHERE id = $1', [req.params.id]);
  if (!before.rowCount) throw ApiError.notFound('Shop not found');
  const prevStatus = before.rows[0].status;

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

  // Audit a status transition (suspend / reinstate). Plan-only edits are not
  // moderation events and are not logged here.
  if (status && status !== prevStatus) {
    await writeAudit({
      adminUserId: req.user.sub,
      action: status === 'suspended' ? 'shop.suspend' : 'shop.reinstate',
      targetType: 'shop',
      targetId: req.params.id,
      reason,
      metadata: { from: prevStatus, to: status, shop_name: r.rows[0].name },
    });
  }

  res.json({ shop: r.rows[0] });
};

exports.listUsers = async (_req, res) => {
  const r = await query(
    `SELECT id, name, email, phone, role, shop_id, status, admin_role, created_at
     FROM users ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ items: r.rows });
};

// ---- Moderation: caller identity + permissions ---------------------------

// GET /api/admin/me — the caller's admin sub-role and resolved permission set,
// so the frontend can show/hide controls by job.
exports.me = async (req, res) => {
  res.json({
    admin_role: req.adminRole || null,
    permissions: permissionsFor(req.adminRole),
  });
};

// ---- Moderation: owner/staff login users ---------------------------------

// POST /api/admin/users/:id/block  { reason }
exports.blockUser = async (req, res) => {
  const { reason } = req.body;
  const target = await query('SELECT id, role, status FROM users WHERE id = $1', [req.params.id]);
  if (!target.rowCount) throw ApiError.notFound('User not found');
  const u = target.rows[0];

  // Only a super admin may block/unblock another admin. Guards against a
  // moderation admin locking out platform administrators.
  if (u.role === 'admin' && req.adminRole !== 'super') {
    throw ApiError.forbidden('Only a super admin can moderate an admin account');
  }

  const r = await query(
    `UPDATE users SET status = 'blocked' WHERE id = $1 RETURNING id, name, email, phone, role, status, admin_role`,
    [req.params.id]
  );
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'user.block',
    targetType: 'user',
    targetId: req.params.id,
    reason,
    metadata: { role: u.role, from: u.status, to: 'blocked' },
  });
  res.json({ user: r.rows[0] });
};

// POST /api/admin/users/:id/unblock  { reason }
exports.unblockUser = async (req, res) => {
  const { reason } = req.body;
  const target = await query('SELECT id, role, status FROM users WHERE id = $1', [req.params.id]);
  if (!target.rowCount) throw ApiError.notFound('User not found');
  const u = target.rows[0];

  if (u.role === 'admin' && req.adminRole !== 'super') {
    throw ApiError.forbidden('Only a super admin can moderate an admin account');
  }

  const r = await query(
    `UPDATE users SET status = 'active' WHERE id = $1 RETURNING id, name, email, phone, role, status, admin_role`,
    [req.params.id]
  );
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'user.unblock',
    targetType: 'user',
    targetId: req.params.id,
    reason,
    metadata: { role: u.role, from: u.status, to: 'active' },
  });
  res.json({ user: r.rows[0] });
};

// PATCH /api/admin/users/:id/admin-role  { admin_role }
// Set (or clear) a user's admin sub-role. admin:manage only (super in practice).
exports.setAdminRole = async (req, res) => {
  const { admin_role } = req.body;
  const target = await query('SELECT id, role, admin_role FROM users WHERE id = $1', [req.params.id]);
  if (!target.rowCount) throw ApiError.notFound('User not found');
  const u = target.rows[0];
  if (u.role !== 'admin') {
    throw ApiError.badRequest('Only an admin user can have an admin role');
  }

  const r = await query(
    `UPDATE users SET admin_role = $1 WHERE id = $2 RETURNING id, name, email, role, status, admin_role`,
    [admin_role, req.params.id]
  );
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'admin_role.set',
    targetType: 'user',
    targetId: req.params.id,
    reason: req.body.reason,
    metadata: { from: u.admin_role, to: admin_role },
  });
  res.json({ user: r.rows[0] });
};

// ---- Moderation: consumer accounts ---------------------------------------

// GET /api/admin/customers?search=<phone|name>
exports.listCustomers = async (req, res) => {
  const search = (req.query.search || '').trim();
  let r;
  if (search) {
    r = await query(
      `SELECT id, phone, name, status, created_at, last_login_at
       FROM customer_users
       WHERE phone ILIKE $1 OR name ILIKE $1
       ORDER BY created_at DESC LIMIT 200`,
      [`%${search}%`]
    );
  } else {
    r = await query(
      `SELECT id, phone, name, status, created_at, last_login_at
       FROM customer_users
       ORDER BY created_at DESC LIMIT 200`
    );
  }
  res.json({ items: r.rows });
};

// POST /api/admin/customers/:id/block  { reason }
exports.blockCustomer = async (req, res) => {
  const { reason } = req.body;
  const r = await query(
    `UPDATE customer_users SET status = 'blocked' WHERE id = $1
     RETURNING id, phone, name, status`,
    [req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'customer.block',
    targetType: 'customer',
    targetId: req.params.id,
    reason,
    metadata: { to: 'blocked' },
  });
  res.json({ customer: r.rows[0] });
};

// POST /api/admin/customers/:id/unblock  { reason }
exports.unblockCustomer = async (req, res) => {
  const { reason } = req.body;
  const r = await query(
    `UPDATE customer_users SET status = 'active' WHERE id = $1
     RETURNING id, phone, name, status`,
    [req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'customer.unblock',
    targetType: 'customer',
    targetId: req.params.id,
    reason,
    metadata: { to: 'active' },
  });
  res.json({ customer: r.rows[0] });
};

// ---- Moderation: audit log ------------------------------------------------

// GET /api/admin/moderation-log?limit=&cursor=
// Recent actions newest-first, keyset-paginated by created_at (cursor is the
// created_at of the last row seen). Each row is enriched with a human label of
// the actor and, where cheap, the target.
exports.moderationLog = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const cursor = req.query.cursor || null;

  const params = [];
  let where = '';
  if (cursor) {
    params.push(cursor);
    where = `WHERE m.created_at < $${params.length}`;
  }
  params.push(limit);
  const r = await query(
    `SELECT m.id, m.action, m.target_type, m.target_id, m.reason, m.metadata,
            m.created_at, m.admin_user_id,
            a.name AS admin_name, a.email AS admin_email,
            CASE m.target_type
              WHEN 'shop'     THEN (SELECT name FROM shops WHERE id = m.target_id)
              WHEN 'user'     THEN (SELECT name FROM users WHERE id = m.target_id)
              WHEN 'customer' THEN (SELECT COALESCE(name, phone) FROM customer_users WHERE id = m.target_id)
            END AS target_label
     FROM moderation_actions m
     LEFT JOIN users a ON a.id = m.admin_user_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  const items = r.rows;
  const nextCursor = items.length === limit ? items[items.length - 1].created_at : null;
  res.json({ items, next_cursor: nextCursor });
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
    landing: {
      // Public "chat with us" WhatsApp number shown on the marketing landing
      // (international digits, no +). Distinct from the Cloud API sender above.
      whatsapp: settings.get('LANDING_WHATSAPP') || '',
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
  // Landing WhatsApp number: store digits only (strip +, spaces, dashes) so the
  // public /config and the landing's wa.me link are always well-formed. Empty
  // clears it (landing falls back to its built-in default).
  if (b.landing_whatsapp !== undefined) {
    patch.LANDING_WHATSAPP = String(b.landing_whatsapp).replace(/\D/g, '');
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
