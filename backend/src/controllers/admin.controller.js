const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const settings = require('../config/settings');
const razorpay = require('../services/razorpay.service');
const whatsapp = require('../services/whatsapp.service');
const { hasPermission, permissionsFor } = require('../config/permissions');

// Append one row to the moderation audit trail. Best-effort metadata is JSON.
// Exported so other admin moderation surfaces (e.g. the storefront photo queue in
// ads.controller) write to the SAME trail instead of a parallel one. An optional
// `client` (a pg transaction client) lets a caller record the audit row in the
// SAME transaction as the change it describes (the AI moderation job does this);
// adminUserId NULL marks an automated (AI) action.
async function writeAudit({ adminUserId, action, targetType, targetId, reason, metadata, client }) {
  const run = client && typeof client.query === 'function' ? (t, p) => client.query(t, p) : query;
  await run(
    `INSERT INTO moderation_actions (admin_user_id, action, target_type, target_id, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [adminUserId || null, action, targetType, targetId, reason || null, metadata ? JSON.stringify(metadata) : null]
  );
}
exports.writeAudit = writeAudit;

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
              WHEN 'settings' THEN 'Platform settings'
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

// ---- Feature flags & pricing (batch FLAGS1) ------------------------------
// The session's runtime features are driven by these platform_settings keys.
// Their live readers (getEnrolmentConfig, getShopPromoConfig, getBrandedStore
// config, consumerPrepay, publicConfig, the delivery-champion fee) query
// platform_settings DIRECTLY, so an admin write here takes effect immediately.
// Values are stored as TEXT; every amount is integer paise. Defaults mirror the
// migration seeds (0048/0052/0054/0056/0057/0058/0059) and are used only as a
// fallback when a value is missing/unparseable.

// boolean feature flags -> seeded default
const FEATURE_BOOL_DEFAULTS = {
  voice_assistant_enabled: true,
  social_share_enabled: true,
  shop_promo_enabled: true,
  branded_store_enabled: true,
  consumer_prepay_enabled: true,
  enrolment_fee_enabled: false, // MONEY-CRITICAL: paid-signup master switch
  storefront_ad_free_enabled: true, // storefront sponsored-slide buy-out (0063)
  ai_moderation_enabled: true, // AI triage of the photo/promo review queues (0064)
};

// decimal keys (0..1 confidence thresholds) -> seeded default. Stored as TEXT
// like everything else; parsed with parseFloat (NOT parseInt) and clamped to the
// 0.5..1.0 band the moderation policy accepts.
const FEATURE_DEC_DEFAULTS = {
  ai_moderation_auto_approve_min: 0.9,
  ai_moderation_hold_min: 0.9,
};
const DEC_MIN = 0.5;
const DEC_MAX = 1.0;

// numeric keys (paise amounts, day counts, split percents) -> seeded default
const FEATURE_NUM_DEFAULTS = {
  enrolment_fee_basic_paise: 9900,
  enrolment_fee_premium_paise: 19900,
  shop_promo_credits_per_day_paise: 1000,
  shop_promo_max_days: 30,
  branded_store_credits_per_day_paise: 2000,
  branded_store_max_days: 90,
  storefront_ad_free_credits_per_day_paise: 500,
  storefront_ad_free_max_days: 30,
  consumer_prepay_max_advance_paise: 2000000,
  delivery_champion_fee_paise: 2000,
  referral_split_infra_pct: 50,
  referral_split_l1_pct: 30,
  referral_split_l2_pct: 15,
};

// The three referral-split percents feed the zero-burn accrual: their sum can
// never exceed 100 (the platform's infra buffer is never negative).
const SPLIT_KEYS = ['referral_split_infra_pct', 'referral_split_l1_pct', 'referral_split_l2_pct'];

// A feature amount/percent as a number, defaulting to the seeded value when the
// stored TEXT is missing or unparseable.
function featureNumber(key) {
  const n = parseInt(settings.get(key), 10);
  return Number.isFinite(n) ? n : FEATURE_NUM_DEFAULTS[key];
}

// A decimal threshold as a number in the 0.5..1.0 band, defaulting to the seeded
// value when the stored TEXT is missing or unparseable.
function featureDecimal(key) {
  const n = Number.parseFloat(settings.get(key));
  if (!Number.isFinite(n)) return FEATURE_DEC_DEFAULTS[key];
  return Math.min(DEC_MAX, Math.max(DEC_MIN, n));
}

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
    // Feature flags & pricing (batch FLAGS1). Each key is TYPED for the UI:
    // booleans as real booleans, amounts/counts/percents as numbers. The inert
    // Meta auto-post stub is surfaced with meta_autopost_available:false so the
    // UI renders its toggle disabled ("coming soon") and never a live switch.
    features: (() => {
      const f = {
        meta_autopost_available: false,
        meta_autopost_enabled: settings.get('meta_autopost_enabled') === 'true',
      };
      for (const k of Object.keys(FEATURE_BOOL_DEFAULTS)) f[k] = settings.get(k) === 'true';
      for (const k of Object.keys(FEATURE_NUM_DEFAULTS)) f[k] = featureNumber(k);
      for (const k of Object.keys(FEATURE_DEC_DEFAULTS)) f[k] = featureDecimal(k);
      // Read-only: whether the environment carries the AI moderation key + model
      // id. The toggle above is inert without it. Lazy require — the service
      // itself requires this controller (writeAudit).
      f.ai_moderation_configured = require('../services/moderation.service').isConfigured();
      return f;
    })(),
    integrations: integrationsStatus(),
  });
};

// ---- Integrations (batch INTEG) ----------------------------------------------
// Every third-party credential the panel edits goes through config/settings
// (platform_settings overrides .env). The status block below NEVER echoes a
// secret — only `*_set` booleans, key sources ('db' | 'env' | 'none') and the
// non-secret ids. Lazy requires: moderation.service requires this controller.
function integrationsStatus() {
  const set = (k) => Boolean(settings.get(k));
  const moderation = require('../services/moderation.service');
  const drafter = require('../services/content-drafter.service');
  const meta = require('../services/content-meta.service');
  const newsletter = require('../services/content-newsletter.service');
  const nmt = require('../services/nmtProvider');
  return {
    ai: {
      api_key_set: set('ANTHROPIC_API_KEY'),
      api_key_source: settings.source('ANTHROPIC_API_KEY'),
      moderation_model: settings.get('MODERATION_LLM_MODEL'),
      moderation_model_source: settings.source('MODERATION_LLM_MODEL'),
      content_model: settings.get('CONTENT_LLM_MODEL'),
      content_model_source: settings.source('CONTENT_LLM_MODEL'),
      moderation_configured: moderation.isConfigured(),
      content_configured: drafter.isConfigured(),
    },
    meta: {
      app_id: settings.get('META_APP_ID'),
      app_id_source: settings.source('META_APP_ID'),
      app_secret_set: set('META_APP_SECRET'),
      app_secret_source: settings.source('META_APP_SECRET'),
      page_token_set: set('META_PAGE_TOKEN'),
      page_token_source: settings.source('META_PAGE_TOKEN'),
      ig_token_set: set('META_IG_TOKEN'),
      ig_token_source: settings.source('META_IG_TOKEN'),
      facebook_configured: meta.metaConfigured('facebook'),
      instagram_configured: meta.metaConfigured('instagram'),
    },
    smtp: {
      url_set: set('SMTP_URL'),
      url_source: settings.source('SMTP_URL'),
      host: settings.get('SMTP_HOST'),
      host_source: settings.source('SMTP_HOST'),
      port: settings.get('SMTP_PORT'),
      user: settings.get('SMTP_USER'),
      pass_set: set('SMTP_PASS'),
      pass_source: settings.source('SMTP_PASS'),
      secure: settings.get('SMTP_SECURE') === 'true',
      from: settings.get('NEWSLETTER_FROM'),
      from_source: settings.source('NEWSLETTER_FROM'),
      configured: newsletter.isConfigured(),
    },
    nmt: {
      enabled: nmt.enabled(),
      enabled_source: settings.source('BHASHINI_NMT'),
      bhashini_key_set: set('BHASHINI_API_KEY'),
      bhashini_key_source: settings.source('BHASHINI_API_KEY'),
      bhashini_user_id: settings.get('BHASHINI_USER_ID'),
      bhashini_user_id_source: settings.source('BHASHINI_USER_ID'),
      sarvam_key_set: set('SARVAM_API_KEY'),
      sarvam_key_source: settings.source('SARVAM_API_KEY'),
      // No provider adapter consumes these keys yet — they are stored for when
      // it lands. The UI shows 'keys only' while this is false.
      adapter_wired: false,
    },
  };
}

// The exact typed confirmation an admin must send with ANY integration change.
const CONFIRM_PHRASE = 'I CONFIRM';

// The moderation_actions audit row for an integration change targets the
// platform-settings singleton (target_type 'settings'); the column is a NOT NULL
// UUID, so the nil UUID stands in for that singleton.
const SETTINGS_TARGET_ID = '00000000-0000-0000-0000-000000000000';

// A model id is an opaque, operator-supplied string: short, printable ASCII, no
// whitespace. There is deliberately NO allowlist of names in code.
function validModelId(v) {
  return v === '' || /^[\x21-\x7e]{1,120}$/.test(v);
}

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
    // Integrations (batch INTEG) — non-secret ids; empty string clears (falls
    // back to the .env value, if any).
    moderation_llm_model: 'MODERATION_LLM_MODEL',
    content_llm_model: 'CONTENT_LLM_MODEL',
    meta_app_id: 'META_APP_ID',
    smtp_host: 'SMTP_HOST',
    smtp_user: 'SMTP_USER',
    newsletter_from: 'NEWSLETTER_FROM',
    bhashini_user_id: 'BHASHINI_USER_ID',
  };
  for (const [field, key] of Object.entries(passthrough)) {
    if (b[field] !== undefined) patch[key] = b[field] === null ? '' : b[field];
  }
  // Model ids: opaque short printable strings (no allowlist of names).
  for (const key of ['MODERATION_LLM_MODEL', 'CONTENT_LLM_MODEL']) {
    if (patch[key] !== undefined && !validModelId(patch[key])) throw ApiError.badRequest('invalid_model_id');
  }
  // SMTP port: an integer 1..65535, or '' to clear.
  if (b.smtp_port !== undefined) {
    const raw = b.smtp_port === null ? '' : String(b.smtp_port).trim();
    if (raw === '') patch.SMTP_PORT = '';
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) throw ApiError.badRequest('invalid_smtp_port');
      patch.SMTP_PORT = String(n);
    }
  }
  // SMTP TLS + the NMT seam switch: booleans stored as the TEXT the readers expect.
  if (b.smtp_secure !== undefined) patch.SMTP_SECURE = b.smtp_secure ? 'true' : 'false';
  if (b.bhashini_nmt !== undefined) patch.BHASHINI_NMT = b.bhashini_nmt ? '1' : '';
  // Landing WhatsApp number: store digits only (strip +, spaces, dashes) so the
  // public /config and the landing's wa.me link are always well-formed. Empty
  // clears it (landing falls back to its built-in default).
  if (b.landing_whatsapp !== undefined) {
    patch.LANDING_WHATSAPP = String(b.landing_whatsapp).replace(/\D/g, '');
  }
  // secrets: only overwrite when a non-empty value is supplied
  // (blank = keep). An explicit `null` CLEARS the stored secret (writes '', so
  // the reader falls back to the .env value, if any).
  const secrets = {
    razorpay_key_secret: 'RAZORPAY_KEY_SECRET',
    razorpay_webhook_secret: 'RAZORPAY_WEBHOOK_SECRET',
    whatsapp_api_token: 'WHATSAPP_API_TOKEN',
    anthropic_api_key: 'ANTHROPIC_API_KEY',
    meta_app_secret: 'META_APP_SECRET',
    meta_page_token: 'META_PAGE_TOKEN',
    meta_ig_token: 'META_IG_TOKEN',
    smtp_url: 'SMTP_URL',
    smtp_pass: 'SMTP_PASS',
    bhashini_api_key: 'BHASHINI_API_KEY',
    sarvam_api_key: 'SARVAM_API_KEY',
  };
  const cleared = [];
  for (const [field, key] of Object.entries(secrets)) {
    if (b[field] === null) { patch[key] = ''; cleared.push(key); }
    else if (b[field]) patch[key] = String(b[field]);
  }

  // Typed confirmation, ENFORCED HERE (not just in the UI): a body that touches
  // ANY integration key must carry confirm: "I CONFIRM" (exact, case-sensitive,
  // trimmed). Otherwise 428 and NOTHING in this body is written — the feature
  // toggles / pricing below share the same single setMany, so it is
  // all-or-nothing. Bodies that touch no integration key are unaffected.
  const touched = Object.keys(patch).filter((k) => settings.INTEGRATION_KEYS.includes(k));
  if (touched.length && String(b.confirm == null ? '' : b.confirm).trim() !== CONFIRM_PHRASE) {
    throw new ApiError(428, 'confirmation_required');
  }

  // ---- Feature flags & pricing (batch FLAGS1) ----------------------------
  // Coerce every provided field to the TEXT shape the live readers expect, then
  // validate BEFORE writing so a bad split is never partially applied.

  // meta_autopost_enabled is an inert stub — it must stay locked. Reject any
  // attempt to turn it ON (it is never added to the writable set below).
  if (b.meta_autopost_enabled === true) {
    throw ApiError.badRequest('meta_not_available');
  }

  // booleans -> 'true' / 'false'
  for (const key of Object.keys(FEATURE_BOOL_DEFAULTS)) {
    if (b[key] !== undefined) patch[key] = b[key] ? 'true' : 'false';
  }
  // amounts / counts / percents -> String(int)
  for (const key of Object.keys(FEATURE_NUM_DEFAULTS)) {
    if (b[key] !== undefined) patch[key] = String(parseInt(b[key], 10));
  }
  // decimal thresholds -> String(number), clamped to 0.5..1.0 (Joi also guards)
  for (const key of Object.keys(FEATURE_DEC_DEFAULTS)) {
    if (b[key] !== undefined) {
      const n = Number.parseFloat(b[key]);
      if (!Number.isFinite(n)) throw ApiError.badRequest('invalid_threshold');
      patch[key] = String(Math.min(DEC_MAX, Math.max(DEC_MIN, n)));
    }
  }

  // Zero-burn guard: if ANY split percent is being changed, validate the
  // RESULTING trio (the provided values merged over the current ones) sums to
  // <= 100. The referral pool can never exceed the fee, so infra stays >= 0.
  if (SPLIT_KEYS.some((k) => b[k] !== undefined)) {
    const merged = {};
    for (const k of SPLIT_KEYS) {
      merged[k] = b[k] !== undefined ? parseInt(b[k], 10) : featureNumber(k);
    }
    const sum = merged.referral_split_infra_pct
      + merged.referral_split_l1_pct
      + merged.referral_split_l2_pct;
    if (!(sum <= 100)) throw ApiError.badRequest('invalid_split');
  }

  await settings.setMany(patch);

  // Audit every integration change — key NAMES only, never a value.
  if (touched.length) {
    await writeAudit({
      adminUserId: req.user.sub,
      action: 'settings.integrations_update',
      targetType: 'settings',
      targetId: SETTINGS_TARGET_ID,
      metadata: { keys: touched, cleared: cleared.filter((k) => touched.includes(k)) },
    });
  }
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

// POST /settings/ai/test — one tiny generation through the drafter's client to
// prove the key + content model id work. Never throws a 500 for a provider
// error and never logs the key.
exports.testAi = async (_req, res) => {
  if (!settings.get('ANTHROPIC_API_KEY') || !settings.get('CONTENT_LLM_MODEL')) {
    throw ApiError.badRequest('not_configured');
  }
  const model = settings.get('CONTENT_LLM_MODEL');
  try {
    const client = require('../services/content-drafter.service').getClient();
    if (!client) throw new Error('AI client unavailable');
    await client.messages.create({
      model,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Reply with OK' }],
    });
    res.json({ ok: true, model, message: 'AI connection works.' });
  } catch (err) {
    res.status(400).json({ ok: false, message: (err && err.message) || 'Connection failed' });
  }
};

// POST /settings/smtp/test — transporter.verify() against the configured SMTP.
exports.testSmtp = async (_req, res) => {
  const newsletter = require('../services/content-newsletter.service');
  if (!newsletter.isConfigured()) throw ApiError.badRequest('not_configured');
  try {
    const transport = newsletter.getTransport();
    if (!transport || typeof transport.verify !== 'function') throw new Error('SMTP transport unavailable');
    await transport.verify();
    res.json({ ok: true, message: 'SMTP connection verified.' });
  } catch (err) {
    res.status(400).json({ ok: false, message: (err && err.message) || 'Connection failed' });
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
