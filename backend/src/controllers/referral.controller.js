const { query } = require('../config/db');
const settings = require('../config/settings');
const {
  getOrCreateCodeForUser,
  getOrCreateCodeForCustomer,
  createUniqueCode,
  getRewardRule,
} = require('../utils/referral');

// Referrals API (Phase D). Participant endpoints (owner/staff under /api/me,
// consumer under /api/customer-auth) expose the caller's own code + link, who
// they referred, and who referred them (the visible chain). Admin endpoints
// aggregate the onboarding-source data and manage the reward-rule scaffolding.

// Best-effort request origin for building an absolute share link. The frontend
// rebuilds it from window.location.origin, but we return a usable value too.
function originOf(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return host ? `${proto}://${host}` : '';
}

// Where a code points when shared: consumers recruit consumers (/c/shops),
// everyone else recruits shop owners (/register).
function linkPathFor(codeRow) {
  const path = codeRow.owner_type === 'customer' ? '/c/shops' : '/register';
  return `${path}?ref=${encodeURIComponent(codeRow.code)}`;
}

// A minimal, chain-visible label for a referred principal.
async function labelForReferral(row) {
  if (row.referred_shop_id) {
    const s = await query('SELECT name FROM shops WHERE id = $1', [row.referred_shop_id]);
    if (s.rowCount) return s.rows[0].name;
  }
  if (row.referred_user_id) {
    const u = await query('SELECT name FROM users WHERE id = $1', [row.referred_user_id]);
    if (u.rowCount) return u.rows[0].name;
  }
  if (row.referred_customer_id) {
    const c = await query('SELECT COALESCE(name, phone) AS label FROM customer_users WHERE id = $1', [row.referred_customer_id]);
    if (c.rowCount) return c.rows[0].label;
  }
  return null;
}

// A human label for a code's owner (for "referred_by").
async function labelForCode(codeRow) {
  if (!codeRow) return null;
  if (codeRow.label) return codeRow.label;
  if (codeRow.owner_user_id) {
    const u = await query('SELECT name FROM users WHERE id = $1', [codeRow.owner_user_id]);
    if (u.rowCount) return u.rows[0].name;
  }
  if (codeRow.owner_customer_id) {
    const c = await query('SELECT COALESCE(name, phone) AS label FROM customer_users WHERE id = $1', [codeRow.owner_customer_id]);
    if (c.rowCount) return c.rows[0].label;
  }
  return null;
}

// The referrals this code produced, newest first, with a minimal label each.
async function referredList(codeId) {
  const r = await query(
    `SELECT id, referred_type, referred_user_id, referred_shop_id, referred_customer_id,
            source_channel, created_at
     FROM referrals WHERE referral_code_id = $1
     ORDER BY created_at DESC LIMIT 200`,
    [codeId]
  );
  const out = [];
  for (const row of r.rows) {
    out.push({
      id: row.id,
      referred_type: row.referred_type,
      source_channel: row.source_channel,
      created_at: row.created_at,
      label: await labelForReferral(row),
    });
  }
  return out;
}

// The row (if any) that attributed THIS principal to a code, plus the referrer.
async function referredByFor({ userId, customerId }) {
  const clause = userId ? 'referred_user_id = $1' : 'referred_customer_id = $1';
  const id = userId || customerId;
  const r = await query(
    `SELECT r.id, r.referral_code_id, r.code, r.source_channel, r.created_at
     FROM referrals r WHERE ${clause} LIMIT 1`,
    [id]
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  let codeRow = null;
  if (row.referral_code_id) {
    const c = await query(
      `SELECT id, code, owner_type, owner_user_id, owner_customer_id, label
       FROM referral_codes WHERE id = $1`,
      [row.referral_code_id]
    );
    codeRow = c.rowCount ? c.rows[0] : null;
  }
  return {
    code: row.code || (codeRow && codeRow.code) || null,
    owner_type: codeRow ? codeRow.owner_type : null,
    label: await labelForCode(codeRow),
    source_channel: row.source_channel,
    created_at: row.created_at,
  };
}

// Assemble the shared participant payload for a resolved code + principal.
async function referralPayload(req, codeRow, principal) {
  const origin = originOf(req);
  const path = linkPathFor(codeRow);
  const referred = await referredList(codeRow.id);
  const referred_by = await referredByFor(principal);
  return {
    code: codeRow.code,
    owner_type: codeRow.owner_type,
    link_path: path,
    link: origin ? `${origin}${path}` : path,
    counts: { referred_total: referred.length },
    referred,
    referred_by,
  };
}

// Walk the referral chain up from a principal (who referred me, and who referred
// them, …) — bounded so a data cycle can never loop forever.
async function uplineChain(principal) {
  const chain = [];
  const seen = new Set();
  let cur = principal;
  for (let hop = 0; hop < 10; hop++) {
    const clause = cur.userId ? 'referred_user_id = $1' : 'referred_customer_id = $1';
    const id = cur.userId || cur.customerId;
    if (!id) break;
    const r = await query(
      `SELECT r.referral_code_id, r.code FROM referrals r WHERE ${clause} LIMIT 1`,
      [id]
    );
    if (!r.rowCount || !r.rows[0].referral_code_id) break;
    const c = await query(
      `SELECT id, code, owner_type, owner_user_id, owner_customer_id, label
       FROM referral_codes WHERE id = $1`,
      [r.rows[0].referral_code_id]
    );
    if (!c.rowCount) break;
    const codeRow = c.rows[0];
    if (seen.has(codeRow.id)) break;
    seen.add(codeRow.id);
    chain.push({
      code: codeRow.code,
      owner_type: codeRow.owner_type,
      label: await labelForCode(codeRow),
    });
    // Continue up only through an in-system owner; external codes end the chain.
    if (codeRow.owner_user_id) cur = { userId: codeRow.owner_user_id };
    else if (codeRow.owner_customer_id) cur = { customerId: codeRow.owner_customer_id };
    else break;
  }
  return chain;
}

// The direct people/shops a code referred (downline, one level).
async function downlineFor(codeId) {
  return referredList(codeId);
}

// role → owner_type for a user's own code.
function ownerTypeForRole(role) {
  if (role === 'owner') return 'owner';
  if (role === 'staff') return 'staff';
  return 'other';
}

// ---- Participant: owner/staff (/api/me/referral) --------------------------

exports.meReferral = async (req, res) => {
  const codeRow = await getOrCreateCodeForUser(req.user.sub, ownerTypeForRole(req.user.role));
  const payload = await referralPayload(req, codeRow, { userId: req.user.sub });
  res.json(payload);
};

exports.meReferralChain = async (req, res) => {
  const codeRow = await getOrCreateCodeForUser(req.user.sub, ownerTypeForRole(req.user.role));
  const [upline, downline] = await Promise.all([
    uplineChain({ userId: req.user.sub }),
    downlineFor(codeRow.id),
  ]);
  res.json({ code: codeRow.code, upline, downline });
};

// ---- Participant: consumer (/api/customer-auth/referral) ------------------

exports.customerReferral = async (req, res) => {
  const codeRow = await getOrCreateCodeForCustomer(req.customerUser.id);
  const payload = await referralPayload(req, codeRow, { customerId: req.customerUser.id });
  res.json(payload);
};

exports.customerReferralChain = async (req, res) => {
  const codeRow = await getOrCreateCodeForCustomer(req.customerUser.id);
  const [upline, downline] = await Promise.all([
    uplineChain({ customerId: req.customerUser.id }),
    downlineFor(codeRow.id),
  ]);
  res.json({ code: codeRow.code, upline, downline });
};

// ---- Admin analytics + code management ------------------------------------

// GET /api/admin/referrals/overview
exports.overview = async (_req, res) => {
  const [byChannel, byType, top, totals, accrued] = await Promise.all([
    query(
      `SELECT COALESCE(source_channel, 'unknown') AS channel, COUNT(*)::int AS c
       FROM referrals GROUP BY COALESCE(source_channel, 'unknown') ORDER BY c DESC`
    ),
    query('SELECT referred_type, COUNT(*)::int AS c FROM referrals GROUP BY referred_type ORDER BY c DESC'),
    query(
      `SELECT rc.id, rc.code, rc.owner_type, rc.label,
              COUNT(r.id)::int AS referred_count
       FROM referral_codes rc
       JOIN referrals r ON r.referral_code_id = rc.id
       GROUP BY rc.id, rc.code, rc.owner_type, rc.label
       ORDER BY referred_count DESC, rc.created_at ASC
       LIMIT 20`
    ),
    query('SELECT COUNT(*)::int AS total_referrals FROM referrals'),
    query("SELECT COALESCE(SUM(amount_paise),0)::bigint AS s, COUNT(*)::int AS c FROM referral_rewards WHERE status = 'accrued'"),
  ]);

  // Enrich top referrers with an owner label where the code has no explicit one.
  const topReferrers = [];
  for (const row of top.rows) {
    let label = row.label;
    if (!label) label = await labelForCode(row);
    topReferrers.push({
      code: row.code,
      owner_type: row.owner_type,
      label: label || null,
      referred_count: row.referred_count,
    });
  }

  res.json({
    source_channel_mix: byChannel.rows,
    signups_by_type: byType.rows,
    top_referrers: topReferrers,
    totals: { total_referrals: totals.rows[0].total_referrals },
    reward: { accrued_total_paise: accrued.rows[0].s, accrued_count: accrued.rows[0].c },
  });
};

// POST /api/admin/referral-codes  { label, owner_type }
// Mint a code for an offline influencer/other with no system account.
exports.createReferralCode = async (req, res) => {
  const { label, owner_type: ownerType } = req.body;
  const codeRow = await createUniqueCode({
    ownerType,
    label: (label && String(label).trim()) || null,
    createdBy: req.user.sub,
  });
  res.status(201).json({
    referral_code: {
      id: codeRow.id,
      code: codeRow.code,
      owner_type: codeRow.owner_type,
      label: codeRow.label,
      created_at: codeRow.created_at,
    },
  });
};

// GET /api/admin/referrals/reward-rule
exports.getRewardRule = async (_req, res) => {
  const rule = await getRewardRule();
  res.json({ enabled: rule.enabled, amount_paise: rule.amount_paise });
};

// PATCH /api/admin/referrals/reward-rule  { enabled, amount_paise }
// Scaffolding only — stored in platform_settings; no payout is triggered.
exports.setRewardRule = async (req, res) => {
  const patch = {};
  if (req.body.enabled !== undefined) patch.referral_reward_enabled = req.body.enabled ? 'true' : 'false';
  if (req.body.amount_paise !== undefined) patch.referral_reward_paise = String(req.body.amount_paise);
  await settings.setMany(patch);
  const rule = await getRewardRule();
  res.json({ enabled: rule.enabled, amount_paise: rule.amount_paise });
};
