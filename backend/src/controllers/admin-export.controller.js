const { query } = require('../config/db');
// Reuse the ONE set of CSV helpers (statement.js) so amount/quoting/CRLF
// behaviour is identical to every other export in the app.
const { csvRow, rupees, isoDate, sendCsv } = require('../utils/statement');
const { PLAN_PRICE } = require('./admin.controller');

// Platform-level CSV exports for the admin console. Each route is mounted after
// auth(['admin']) + loadAdminRole and gated by the RIGHT Phase C permission via
// requirePerm (see admin.routes.js), so a caller only ever downloads data their
// permission set allows. These are read-only, whole-platform reports.

// GET /admin/exports/shops.csv — gated by shops:view.
exports.shopsCsv = async (_req, res) => {
  const r = await query(
    `SELECT s.name, s.city, s.area, s.plan, s.status, s.is_listed,
            (SELECT COUNT(*) FROM products WHERE shop_id = s.id)::int AS product_count,
            s.created_at
     FROM shops s
     ORDER BY s.created_at DESC`
  );

  const rows = [csvRow(['Name', 'City', 'Area', 'Plan', 'Status', 'Listed', 'Products', 'Created'])];
  for (const s of r.rows) {
    rows.push(csvRow([
      s.name,
      s.city,
      s.area,
      s.plan,
      s.status,
      s.is_listed ? 'yes' : 'no',
      s.product_count,
      isoDate(s.created_at),
    ]));
  }
  sendCsv(res, 'shops.csv', rows);
};

// GET /admin/exports/users.csv — gated by users:view.
exports.usersCsv = async (_req, res) => {
  const r = await query(
    `SELECT u.name, u.email, u.phone, u.role, u.admin_role, u.status,
            sh.name AS shop_name
     FROM users u
     LEFT JOIN shops sh ON sh.id = u.shop_id
     ORDER BY u.created_at DESC`
  );

  const rows = [csvRow(['Name', 'Email', 'Phone', 'Role', 'Admin Role', 'Status', 'Shop'])];
  for (const u of r.rows) {
    rows.push(csvRow([
      u.name,
      u.email,
      u.phone,
      u.role,
      u.admin_role,
      u.status,
      u.shop_name,
    ]));
  }
  sendCsv(res, 'users.csv', rows);
};

// GET /admin/exports/moderation-log.csv — gated by audit:view. Mirrors the
// enriched moderationLog query (actor label + target label), newest first.
exports.moderationLogCsv = async (_req, res) => {
  const r = await query(
    `SELECT m.created_at, m.action, m.target_type, m.target_id, m.reason,
            a.name AS admin_name, a.email AS admin_email,
            CASE m.target_type
              WHEN 'shop'     THEN (SELECT name FROM shops WHERE id = m.target_id)
              WHEN 'user'     THEN (SELECT name FROM users WHERE id = m.target_id)
              WHEN 'customer' THEN (SELECT COALESCE(name, phone) FROM customer_users WHERE id = m.target_id)
            END AS target_label
     FROM moderation_actions m
     LEFT JOIN users a ON a.id = m.admin_user_id
     ORDER BY m.created_at DESC`
  );

  const rows = [csvRow(['Date', 'Action', 'Admin', 'Admin Email', 'Target Type', 'Target', 'Reason'])];
  for (const m of r.rows) {
    rows.push(csvRow([
      isoDate(m.created_at),
      m.action,
      m.admin_name,
      m.admin_email,
      m.target_type,
      m.target_label || m.target_id,
      m.reason,
    ]));
  }
  sendCsv(res, 'moderation-log.csv', rows);
};

// GET /admin/exports/referrals.csv — gated by revenue:view. One row per
// attribution (code, owner label, referred type, source_channel, created) plus
// a small summary block at the end.
exports.referralsCsv = async (_req, res) => {
  const r = await query(
    `SELECT r.created_at, r.referred_type, r.source_channel,
            COALESCE(r.code, rc.code) AS code, rc.owner_type,
            COALESCE(rc.label, ou.name, ocu.name, ocu.phone) AS owner_label
     FROM referrals r
     LEFT JOIN referral_codes rc ON rc.id = r.referral_code_id
     LEFT JOIN users ou ON ou.id = rc.owner_user_id
     LEFT JOIN customer_users ocu ON ocu.id = rc.owner_customer_id
     ORDER BY r.created_at DESC`
  );

  const rows = [csvRow(['Code', 'Owner', 'Owner Type', 'Referred Type', 'Source Channel', 'Created'])];
  for (const x of r.rows) {
    rows.push(csvRow([
      x.code,
      x.owner_label,
      x.owner_type,
      x.referred_type,
      x.source_channel,
      isoDate(x.created_at),
    ]));
  }

  // Summary: total referrals + a breakdown by referred_type.
  const byType = await query(
    'SELECT referred_type, COUNT(*)::int AS c FROM referrals GROUP BY referred_type ORDER BY c DESC'
  );
  rows.push('');
  rows.push(csvRow(['Total referrals', r.rowCount]));
  for (const t of byType.rows) {
    rows.push(csvRow([`Referred (${t.referred_type})`, t.c]));
  }
  sendCsv(res, 'referrals.csv', rows);
};

// GET /admin/exports/revenue.csv — gated by revenue:view. Shops grouped by plan
// with the plan's monthly price → an MRR-ish breakdown, then the total MRR.
exports.revenueCsv = async (_req, res) => {
  const r = await query(
    'SELECT plan, COUNT(*)::int AS c FROM shops GROUP BY plan'
  );
  const counts = Object.fromEntries(r.rows.map((row) => [row.plan, row.c]));

  const rows = [csvRow(['Plan', 'Monthly Price (Rs)', 'Shops', 'Monthly Total (Rs)'])];
  let mrr = 0;
  // Iterate the known plans in a stable order so the CSV is deterministic.
  for (const plan of ['free', 'pro', 'family']) {
    const price = PLAN_PRICE[plan] || 0;
    const count = counts[plan] || 0;
    const monthly = price * count;
    mrr += monthly;
    rows.push(csvRow([plan, rupees(price), count, rupees(monthly)]));
  }
  rows.push('');
  rows.push(csvRow(['MRR total (Rs)', rupees(mrr)]));
  sendCsv(res, 'revenue.csv', rows);
};
