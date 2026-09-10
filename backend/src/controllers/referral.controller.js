const { query } = require('../config/db');
const settings = require('../config/settings');
const ApiError = require('../utils/ApiError');
const {
  getOrCreateCodeForUser,
  getOrCreateCodeForCustomer,
  createUniqueCode,
  getRewardRule,
  settleAllAccrued,
} = require('../utils/referral');
const { getOrCreateWallet } = require('../utils/wallet');

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
  // Total credit this code has earned (referrer + referee + mitra + chain +
  // influencer rewards), and how many of its referrals have activated (recorded a
  // first collection). Batch R3: rewards now settle into the wallet in real time,
  // so "earned" spans BOTH still-accrued and already-settled rows — the value is
  // the same whether or not it has landed in the wallet yet.
  const [accrued, activated] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(amount_paise),0)::bigint AS s
       FROM referral_rewards WHERE beneficiary_code_id = $1 AND status IN ('accrued','settled')`,
      [codeRow.id]
    ),
    query(
      'SELECT COUNT(*)::int AS c FROM referrals WHERE referral_code_id = $1 AND activated_at IS NOT NULL',
      [codeRow.id]
    ),
  ]);
  return {
    code: codeRow.code,
    owner_type: codeRow.owner_type,
    link_path: path,
    link: origin ? `${origin}${path}` : path,
    counts: { referred_total: referred.length, activated_total: activated.rows[0].c },
    reward: { accrued_paise: accrued.rows[0].s },
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
  const [byChannel, byType, top, totals, accrued, funnel, mitra] = await Promise.all([
    query(
      `SELECT COALESCE(source_channel, 'unknown') AS channel, COUNT(*)::int AS c
       FROM referrals GROUP BY COALESCE(source_channel, 'unknown') ORDER BY c DESC`
    ),
    query('SELECT referred_type, COUNT(*)::int AS c FROM referrals GROUP BY referred_type ORDER BY c DESC'),
    query(
      `SELECT rc.id, rc.code, rc.owner_type, rc.label, rc.is_mitra,
              rc.flat_bounty_paise, rc.budget_cap_paise,
              COUNT(r.id)::int AS referred_count
       FROM referral_codes rc
       JOIN referrals r ON r.referral_code_id = rc.id
       GROUP BY rc.id, rc.code, rc.owner_type, rc.label, rc.is_mitra,
                rc.flat_bounty_paise, rc.budget_cap_paise
       ORDER BY referred_count DESC, rc.created_at ASC
       LIMIT 20`
    ),
    query('SELECT COUNT(*)::int AS total_referrals FROM referrals'),
    query("SELECT COALESCE(SUM(amount_paise),0)::bigint AS s, COUNT(*)::int AS c FROM referral_rewards WHERE status IN ('accrued','settled')"),
    // Acquisition funnel: everyone captured vs those who activated (first collection).
    query(
      `SELECT COUNT(*)::int AS captured,
              COUNT(*) FILTER (WHERE activated_at IS NOT NULL)::int AS activated
       FROM referrals`
    ),
    // Khata Mitra rollup: one row per is_mitra code with onboarding, activation
    // and the bounty (its 'mitra' rewards) it has accrued.
    query(
      `SELECT rc.id, rc.code, rc.label, rc.owner_user_id, rc.owner_customer_id,
              rc.is_mitra, rc.flat_bounty_paise, rc.budget_cap_paise,
              COUNT(r.id)::int AS onboarded,
              COUNT(r.id) FILTER (WHERE r.activated_at IS NOT NULL)::int AS activated,
              COALESCE((SELECT SUM(rr.amount_paise) FROM referral_rewards rr
                        WHERE rr.beneficiary_code_id = rc.id
                          AND rr.beneficiary_role = 'mitra'
                          AND rr.status IN ('accrued','settled')), 0)::bigint AS bounty_accrued_paise
       FROM referral_codes rc
       LEFT JOIN referrals r ON r.referral_code_id = rc.id
       WHERE rc.is_mitra = true
       GROUP BY rc.id, rc.code, rc.label, rc.owner_user_id, rc.owner_customer_id,
                rc.is_mitra, rc.flat_bounty_paise, rc.budget_cap_paise
       ORDER BY activated DESC, onboarded DESC, rc.created_at ASC`
    ),
  ]);

  // Enrich top referrers with an owner label where the code has no explicit one.
  const topReferrers = [];
  for (const row of top.rows) {
    let label = row.label;
    if (!label) label = await labelForCode(row);
    topReferrers.push({
      id: row.id,
      code: row.code,
      owner_type: row.owner_type,
      label: label || null,
      is_mitra: row.is_mitra === true,
      flat_bounty_paise: row.flat_bounty_paise == null ? null : Number(row.flat_bounty_paise),
      budget_cap_paise: row.budget_cap_paise == null ? null : Number(row.budget_cap_paise),
      referred_count: row.referred_count,
    });
  }

  // Enrich each Mitra row with an owner label where the code has none.
  const mitraRollup = [];
  for (const row of mitra.rows) {
    let label = row.label;
    if (!label) label = await labelForCode(row);
    mitraRollup.push({
      id: row.id,
      code: row.code,
      label: label || null,
      is_mitra: row.is_mitra === true,
      flat_bounty_paise: row.flat_bounty_paise == null ? null : Number(row.flat_bounty_paise),
      budget_cap_paise: row.budget_cap_paise == null ? null : Number(row.budget_cap_paise),
      onboarded: row.onboarded,
      activated: row.activated,
      bounty_accrued_paise: row.bounty_accrued_paise,
    });
  }

  res.json({
    source_channel_mix: byChannel.rows,
    signups_by_type: byType.rows,
    top_referrers: topReferrers,
    totals: { total_referrals: totals.rows[0].total_referrals },
    funnel: { captured: funnel.rows[0].captured, activated: funnel.rows[0].activated },
    reward: { accrued_total_paise: accrued.rows[0].s, accrued_count: accrued.rows[0].c },
    mitra: mitraRollup,
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

// The double-sided + Mitra reward rule, projected for the API (keeps the legacy
// `amount_paise` alias alongside the explicit referrer/referee/mitra amounts).
function ruleView(rule) {
  return {
    enabled: rule.enabled,
    amount_paise: rule.amount_paise,
    referrer_paise: rule.referrer_paise,
    referee_paise: rule.referee_paise,
    mitra_paise: rule.mitra_paise,
  };
}

// GET /api/admin/referrals/reward-rule
exports.getRewardRule = async (_req, res) => {
  res.json(ruleView(await getRewardRule()));
};

// PATCH /api/admin/referrals/reward-rule  { enabled, amount_paise, referee_paise, mitra_paise }
// Scaffolding only — stored in platform_settings; no payout is triggered.
// `amount_paise` remains the referrer side (back-compat); old callers still work.
exports.setRewardRule = async (req, res) => {
  const patch = {};
  if (req.body.enabled !== undefined) patch.referral_reward_enabled = req.body.enabled ? 'true' : 'false';
  if (req.body.amount_paise !== undefined) patch.referral_reward_paise = String(req.body.amount_paise);
  if (req.body.referee_paise !== undefined) patch.referral_referee_paise = String(req.body.referee_paise);
  if (req.body.mitra_paise !== undefined) patch.referral_mitra_paise = String(req.body.mitra_paise);
  await settings.setMany(patch);
  res.json(ruleView(await getRewardRule()));
};

// PATCH /api/admin/referral-codes/:id  { is_mitra: boolean }
// Flag (or unflag) a code as a Khata Mitra agent code. Returns the code.
exports.setMitra = async (req, res) => {
  const r = await query(
    `UPDATE referral_codes SET is_mitra = $2 WHERE id = $1
     RETURNING id, code, owner_type, label, is_mitra, created_at`,
    [req.params.id, req.body.is_mitra === true]
  );
  if (!r.rowCount) throw ApiError.notFound('Referral code not found');
  res.json({ referral_code: r.rows[0] });
};

// ===========================================================================
// Batch R3 — Khata Credits: owner wallet + earnings, admin economics + config
// ===========================================================================

// Shape a ledger row for the API (Khata Credits framing; amounts are paise).
function ledgerView(row) {
  return {
    direction: row.direction,
    amount_paise: Number(row.amount_paise),
    kind: row.kind,
    ref_note: row.ref_note,
    balance_after_paise: Number(row.balance_after_paise),
    created_at: row.created_at,
  };
}

// GET /api/referral/wallet — the caller's shop Khata Credits balance + recent
// ledger (last 50). Owner/staff share the one SHOP wallet. Read-only.
exports.meWallet = async (req, res) => {
  const shopId = req.user.shopId;
  if (!shopId) return res.json({ balance_paise: 0, currency: 'INR', ledger: [] });
  const wallet = await getOrCreateWallet('shop', shopId);
  const ledger = await query(
    `SELECT direction, amount_paise, kind, ref_note, balance_after_paise, created_at
       FROM referral_ledger WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [wallet.id]
  );
  res.json({
    balance_paise: Number(wallet.balance_paise),
    currency: wallet.currency,
    ledger: ledger.rows.map(ledgerView),
  });
};

// GET /api/referral/earnings — the caller's own referral earnings, split by the
// stage they sit in (accrued vs settled-into-credits) and by beneficiary role.
exports.meEarnings = async (req, res) => {
  const codeRow = await getOrCreateCodeForUser(req.user.sub, ownerTypeForRole(req.user.role));
  const shopId = req.user.shopId;

  const ROLES = ['chain_l1', 'chain_l2', 'referrer', 'referee', 'mitra', 'influencer'];
  const [rows, wallet] = await Promise.all([
    query(
      `SELECT beneficiary_role, status, COALESCE(SUM(amount_paise),0)::bigint AS s
         FROM referral_rewards
        WHERE beneficiary_code_id = $1 AND status IN ('accrued','settled')
        GROUP BY beneficiary_role, status`,
      [codeRow.id]
    ),
    shopId
      ? query("SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1", [shopId])
      : Promise.resolve({ rowCount: 0, rows: [] }),
  ]);

  const by_role = Object.fromEntries(ROLES.map((r) => [r, 0]));
  let accrued = 0;
  let settled = 0;
  for (const row of rows.rows) {
    const amt = Number(row.s);
    if (row.beneficiary_role && by_role[row.beneficiary_role] !== undefined) {
      by_role[row.beneficiary_role] += amt;
    }
    if (row.status === 'accrued') accrued += amt;
    else if (row.status === 'settled') settled += amt;
  }

  res.json({
    code: codeRow.code,
    accrued_paise: accrued,
    settled_paise: settled,
    wallet_balance_paise: wallet.rowCount ? Number(wallet.rows[0].balance_paise) : 0,
    by_role,
  });
};

// GET /api/admin/referral/economics — the zero-burn dashboard aggregate. Proves
// the referral network never pays out more than the fees funded it (zero burn).
exports.economics = async (_req, res) => {
  const [fees, chain, influencer, liability] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(amount_paise),0)::bigint AS gross,
              COALESCE(SUM(FLOOR(amount_paise * (COALESCE(split_l1_pct,0)+COALESCE(split_l2_pct,0)) / 100.0)),0)::bigint AS pool
         FROM enrolments WHERE status = 'paid'`
    ),
    query(
      `SELECT COALESCE(SUM(amount_paise),0)::bigint AS s
         FROM referral_rewards
        WHERE beneficiary_role IN ('chain_l1','chain_l2') AND status IN ('accrued','settled')`
    ),
    query(
      `SELECT COALESCE(SUM(amount_paise),0)::bigint AS s
         FROM referral_rewards
        WHERE beneficiary_role = 'influencer' AND status IN ('accrued','settled')`
    ),
    query('SELECT COALESCE(SUM(balance_paise),0)::bigint AS s FROM referral_wallets'),
  ]);

  const gross = Number(fees.rows[0].gross);
  const pool = Number(fees.rows[0].pool);
  const chainPaid = Number(chain.rows[0].s);
  const influencerSpend = Number(influencer.rows[0].s);

  res.json({
    total_paid_enrolments: fees.rows[0].n,
    gross_fees_paise: gross,
    referral_pool_collected_paise: pool,
    chain_paid_paise: chainPaid,
    influencer_spend_paise: influencerSpend,
    // What the platform keeps after paying the referral network from the fees.
    infra_retained_paise: gross - chainPaid - influencerSpend,
    // Outstanding Khata Credits the platform owes as future service redemption.
    wallet_liability_paise: Number(liability.rows[0].s),
    // The invariant: the network never pays out more than the pool the fees funded.
    zero_burn_ok: chainPaid + influencerSpend <= pool,
  });
};

// PATCH /api/admin/referral/codes/:id — configure a code: label, is_mitra, and
// the influencer flat bounty + budget cap. Validated (ints >= 0; budget nullable)
// by the route schema. Only the fields present in the body are changed.
exports.patchCode = async (req, res) => {
  const sets = [];
  const params = [];
  let i = 1;
  const push = (col, val) => {
    sets.push(`${col} = $${i}`);
    params.push(val);
    i += 1;
  };
  if (req.body.label !== undefined) push('label', (req.body.label && String(req.body.label).trim()) || null);
  if (req.body.is_mitra !== undefined) push('is_mitra', req.body.is_mitra === true);
  if (req.body.flat_bounty_paise !== undefined) push('flat_bounty_paise', req.body.flat_bounty_paise === null ? null : Number(req.body.flat_bounty_paise));
  if (req.body.budget_cap_paise !== undefined) push('budget_cap_paise', req.body.budget_cap_paise === null ? null : Number(req.body.budget_cap_paise));

  if (!sets.length) throw ApiError.badRequest('no_fields');
  params.push(req.params.id);
  const r = await query(
    `UPDATE referral_codes SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, code, owner_type, label, is_mitra, flat_bounty_paise, budget_cap_paise, created_at`,
    params
  );
  if (!r.rowCount) throw ApiError.notFound('Referral code not found');
  const row = r.rows[0];
  res.json({
    referral_code: {
      ...row,
      flat_bounty_paise: row.flat_bounty_paise == null ? null : Number(row.flat_bounty_paise),
      budget_cap_paise: row.budget_cap_paise == null ? null : Number(row.budget_cap_paise),
    },
  });
};

// POST /api/admin/referral/settle — settle every currently-accrued reward into
// its beneficiary wallet. The manual drain for when referral_autosettle='false'.
exports.settlePending = async (_req, res) => {
  const result = await settleAllAccrued();
  res.json(result);
};
