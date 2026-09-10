const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Admin CRUD for the seasonal + geo referral campaigns (batch CAMP1). Routes live
// in admin.routes.js under /api/admin/referral/campaigns, gated per-verb by the
// SAME permissions as the other referral-admin endpoints: reads with
// 'revenue:view' (super/finance), writes with 'settings:manage' (super/finance).
//
// A campaign OVERRIDES the default referral reward for a window + place +
// audience, hard-capped by a PRE-FUNDED budget so it can never overspend. The
// budget cap is enforced at accrual time by an atomic guarded UPDATE (see
// utils/referral.applyCampaign) — nothing here can weaken it.
//
// Mirrors ads.controller: a campaign carries its geo targets (referral_campaign_
// targets) as a nested array on read; on create/update the targets are written in
// the SAME transaction as the campaign, and PUT/PATCH REPLACES the target set.

// Columns selected for a campaign, plus its targets aggregated as a JSON array.
const CAMPAIGN_SELECT = `
  SELECT c.id, c.name, c.status, c.audience, c.reward_type, c.reward_value,
         c.budget_cap_paise, c.spent_paise, c.starts_at, c.ends_at, c.is_seasonal,
         c.priority, c.created_by, c.created_at, c.updated_at,
         COALESCE((
           SELECT json_agg(json_build_object('id', t.id, 'geo_type', t.geo_type, 'geo_value', t.geo_value)
                           ORDER BY t.geo_type, t.geo_value)
           FROM referral_campaign_targets t WHERE t.campaign_id = c.id
         ), '[]'::json) AS targets
  FROM referral_campaigns c`;

// Money fields come back from pg as strings (BIGINT) — coerce for the client so
// the UI's spend-vs-budget bar is plain numbers.
function shape(row) {
  if (!row) return row;
  return {
    ...row,
    budget_cap_paise: row.budget_cap_paise == null ? 0 : Number(row.budget_cap_paise),
    spent_paise: row.spent_paise == null ? 0 : Number(row.spent_paise),
  };
}

// Normalize the incoming targets: geo_type='all' forces geo_value NULL, and the
// set is de-duplicated (the UNIQUE constraint treats NULLs as distinct, so two
// 'all' rows would otherwise both insert). Requires at least one target and a
// geo_value for every non-'all' target.
function normalizeTargets(targets) {
  const out = [];
  const seen = new Set();
  for (const raw of targets || []) {
    const geo_type = raw.geo_type;
    const geo_value = geo_type === 'all' ? null : (raw.geo_value == null ? null : String(raw.geo_value).trim());
    if (geo_type !== 'all' && !geo_value) {
      throw ApiError.badRequest('Validation failed', [`target geo_value is required for geo_type '${geo_type}'`]);
    }
    const key = `${geo_type}|${geo_value == null ? '' : geo_value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ geo_type, geo_value });
  }
  if (out.length === 0) {
    throw ApiError.badRequest('Validation failed', ['at least one geo target is required']);
  }
  return out;
}

// Validate + normalize reward_value against reward_type. multiplier requires a
// sane 0 < x <= 10; flat_override requires at least one positive *_paise value.
// Returns the cleaned reward_value object that is stored (and later read by
// applyCampaign). Throws ApiError.badRequest on a bad shape.
function normalizeRewardValue(rewardType, rewardValue) {
  const rv = rewardValue && typeof rewardValue === 'object' ? rewardValue : {};
  if (rewardType === 'multiplier') {
    const x = Number(rv.x);
    if (!Number.isFinite(x) || x <= 0 || x > 10) {
      throw ApiError.badRequest('Validation failed', ["reward_value.x must be a number in (0, 10] for a multiplier campaign"]);
    }
    return { x };
  }
  if (rewardType === 'flat_override') {
    const out = {};
    let any = false;
    for (const key of ['referrer_paise', 'referee_paise', 'mitra_paise']) {
      if (rv[key] == null) continue;
      const v = Number(rv[key]);
      if (!Number.isInteger(v) || v < 0) {
        throw ApiError.badRequest('Validation failed', [`reward_value.${key} must be a non-negative integer (paise)`]);
      }
      out[key] = v;
      if (v > 0) any = true;
    }
    if (!any) {
      throw ApiError.badRequest('Validation failed', ['flat_override needs at least one positive *_paise value']);
    }
    return out;
  }
  throw ApiError.badRequest('Validation failed', [`unknown reward_type '${rewardType}'`]);
}

// Common validation for create/update: budget > 0, reward_value shape, targets.
function validateBody(b) {
  const budget = Number(b.budget_cap_paise);
  if (!Number.isInteger(budget) || budget <= 0) {
    throw ApiError.badRequest('Validation failed', ['budget_cap_paise must be a positive integer (paise); uncapped is not allowed']);
  }
  const reward_value = normalizeRewardValue(b.reward_type, b.reward_value);
  const targets = normalizeTargets(b.targets);
  return { budget, reward_value, targets };
}

// GET /api/admin/referral/campaigns?status=&audience=
exports.list = async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`c.status = $${params.length}`); }
  if (req.query.audience) { params.push(req.query.audience); where.push(`c.audience = $${params.length}`); }
  const sql = `${CAMPAIGN_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.created_at DESC
    LIMIT 500`;
  const r = await query(sql, params);
  res.json({ items: r.rows.map(shape) });
};

// GET /api/admin/referral/campaigns/:id
exports.getOne = async (req, res) => {
  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  res.json({ campaign: shape(r.rows[0]) });
};

// POST /api/admin/referral/campaigns
exports.create = async (req, res) => {
  const b = req.body;
  const { budget, reward_value, targets } = validateBody(b);

  const id = await withTx(async (client) => {
    const ins = await client.query(
      `INSERT INTO referral_campaigns
         (name, status, audience, reward_type, reward_value, budget_cap_paise,
          starts_at, ends_at, is_seasonal, priority, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        b.name, b.status ?? 'draft', b.audience ?? 'all', b.reward_type,
        JSON.stringify(reward_value), budget, b.starts_at ?? null, b.ends_at ?? null,
        b.is_seasonal ?? false, b.priority ?? 0, req.user.sub,
      ]
    );
    const cid = ins.rows[0].id;
    for (const t of targets) {
      await client.query(
        'INSERT INTO referral_campaign_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
        [cid, t.geo_type, t.geo_value]
      );
    }
    return cid;
  });

  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [id]);
  res.status(201).json({ campaign: shape(r.rows[0]) });
};

// PATCH /api/admin/referral/campaigns/:id — edit fields (+ status transitions)
// and, when `targets` is supplied, REPLACE the target set (delete + reinsert).
// spent_paise is NEVER writable from here — only accrual moves it, atomically.
exports.update = async (req, res) => {
  const b = req.body;
  const existing = await query('SELECT id FROM referral_campaigns WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) throw ApiError.notFound('Campaign not found');

  const { budget, reward_value, targets } = validateBody(b);

  await withTx(async (client) => {
    await client.query(
      `UPDATE referral_campaigns SET
         name=$1, status=$2, audience=$3, reward_type=$4, reward_value=$5::jsonb,
         budget_cap_paise=$6, starts_at=$7, ends_at=$8, is_seasonal=$9,
         priority=$10, updated_at=NOW()
       WHERE id=$11`,
      [
        b.name, b.status ?? 'draft', b.audience ?? 'all', b.reward_type,
        JSON.stringify(reward_value), budget, b.starts_at ?? null, b.ends_at ?? null,
        b.is_seasonal ?? false, b.priority ?? 0, req.params.id,
      ]
    );
    await client.query('DELETE FROM referral_campaign_targets WHERE campaign_id = $1', [req.params.id]);
    for (const t of targets) {
      await client.query(
        'INSERT INTO referral_campaign_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
        [req.params.id, t.geo_type, t.geo_value]
      );
    }
  });

  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  res.json({ campaign: shape(r.rows[0]) });
};

// PATCH /api/admin/referral/campaigns/:id/status  { status } — a lightweight
// draft<->active<->paused<->ended transition without touching the rest.
exports.setStatus = async (req, res) => {
  const r = await query(
    `UPDATE referral_campaigns SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [req.body.status, req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  const out = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  res.json({ campaign: shape(out.rows[0]) });
};

// DELETE /api/admin/referral/campaigns/:id — targets cascade.
exports.remove = async (req, res) => {
  const r = await query('DELETE FROM referral_campaigns WHERE id = $1 RETURNING id', [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  res.json({ ok: true, id: r.rows[0].id });
};

// GET /api/admin/referral/campaigns-geo-options — distinct non-null
// town(=city)/village/pincode from shops, each a sorted list, to feed the target
// pickers. Mirrors ads.controller.geoOptions.
exports.geoOptions = async (_req, res) => {
  const [towns, villages, pincodes] = await Promise.all([
    query(`SELECT DISTINCT city AS v FROM shops WHERE city IS NOT NULL AND city <> '' ORDER BY city`),
    query(`SELECT DISTINCT village AS v FROM shops WHERE village IS NOT NULL AND village <> '' ORDER BY village`),
    query(`SELECT DISTINCT pincode AS v FROM shops WHERE pincode IS NOT NULL AND pincode <> '' ORDER BY pincode`),
  ]);
  res.json({
    towns: towns.rows.map((x) => x.v),
    villages: villages.rows.map((x) => x.v),
    pincodes: pincodes.rows.map((x) => x.v),
  });
};
