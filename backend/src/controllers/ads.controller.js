const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getOrCreateWallet, creditWallet } = require('../utils/wallet');
// Reuse the ONE set of CSV helpers so quoting/CRLF/attachment behaviour matches
// every other export in the app (admin-export.controller.js does the same).
const { csvRow, isoDate, sendCsv } = require('../utils/statement');

// Admin CRUD for the geo-targeted promo campaigns (batch ADS2). Routes live in
// admin.routes.js under /api/admin/ads, gated per-verb by requirePerm:
// reads with 'ads:view', writes with 'ads:manage'. No consumer serving here.
//
// A campaign carries its geo targets (ad_targets) as a nested array on read;
// on create/update the targets are written in the SAME transaction as the
// campaign, and PUT REPLACES the target set (delete + reinsert).

// Columns selected for a campaign, plus its targets aggregated as a JSON array
// (newest-first lists reuse this; a single fetch reuses it too).
const CAMPAIGN_SELECT = `
  SELECT c.id, c.style, c.title, c.offer_text, c.subtitle, c.glyph, c.image_url,
         c.i18n, c.advertiser, c.link_type, c.link_shop_id, c.link_product_id,
         c.link_url, c.is_seasonal, c.starts_at, c.ends_at, c.priority, c.status,
         c.impressions, c.clicks, c.created_by, c.created_at, c.updated_at,
         COALESCE((
           SELECT json_agg(json_build_object('id', t.id, 'geo_type', t.geo_type, 'geo_value', t.geo_value)
                           ORDER BY t.geo_type, t.geo_value)
           FROM ad_targets t WHERE t.campaign_id = c.id
         ), '[]'::json) AS targets
  FROM ad_campaigns c`;

// Normalize the incoming targets: geo_type='all' forces geo_value NULL, and the
// set is de-duplicated (the UNIQUE constraint treats NULLs as distinct, so two
// 'all' rows would otherwise both insert). Throws on a missing geo_value for a
// non-'all' target (Joi also guards this; belt and suspenders).
function normalizeTargets(targets) {
  const out = [];
  const seen = new Set();
  for (const raw of targets || []) {
    const geo_type = raw.geo_type;
    let geo_value = geo_type === 'all' ? null : (raw.geo_value == null ? null : String(raw.geo_value).trim());
    if (geo_type !== 'all' && !geo_value) {
      throw ApiError.badRequest('Validation failed', [`target geo_value is required for geo_type '${geo_type}'`]);
    }
    const key = `${geo_type}|${geo_value == null ? '' : geo_value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ geo_type, geo_value });
  }
  return out;
}

// Enforce link_* consistency with link_type and validate soft/hard references
// exist. Returns the cleaned link fields (irrelevant ones nulled) so a campaign
// never carries a stale link the type does not use.
async function resolveLink(body) {
  const linkType = body.link_type || 'none';
  const clean = { link_type: linkType, link_shop_id: null, link_product_id: null, link_url: null };

  if (linkType === 'shop') {
    if (!body.link_shop_id) {
      throw ApiError.badRequest('Validation failed', ["link_shop_id is required when link_type='shop'"]);
    }
    const r = await query('SELECT 1 FROM shops WHERE id = $1', [body.link_shop_id]);
    if (!r.rowCount) throw ApiError.badRequest('Validation failed', ['link_shop_id does not reference an existing shop']);
    clean.link_shop_id = body.link_shop_id;
  } else if (linkType === 'product') {
    if (!body.link_product_id) {
      throw ApiError.badRequest('Validation failed', ["link_product_id is required when link_type='product'"]);
    }
    // Soft reference (no FK) — validate existence here.
    const r = await query('SELECT 1 FROM products WHERE id = $1', [body.link_product_id]);
    if (!r.rowCount) throw ApiError.badRequest('Validation failed', ['link_product_id does not reference an existing product']);
    clean.link_product_id = body.link_product_id;
  } else if (linkType === 'url' || linkType === 'brand') {
    // Both point at an external/off-platform destination via link_url.
    if (!body.link_url) {
      throw ApiError.badRequest('Validation failed', [`link_url is required when link_type='${linkType}'`]);
    }
    clean.link_url = body.link_url;
  }
  return clean;
}

// GET /api/admin/ads?status=&style=&geo=
exports.list = async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`c.status = $${params.length}`); }
  if (req.query.style) { params.push(req.query.style); where.push(`c.style = $${params.length}`); }
  if (req.query.geo) {
    params.push(req.query.geo);
    where.push(`EXISTS (SELECT 1 FROM ad_targets t WHERE t.campaign_id = c.id AND t.geo_value = $${params.length})`);
  }
  const sql = `${CAMPAIGN_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.created_at DESC
    LIMIT 500`;
  const r = await query(sql, params);
  res.json({ items: r.rows });
};

// One target → its CSV token: 'all' for the everywhere row, else geo_type:geo_value.
function targetToken(t) {
  return t.geo_type === 'all' ? 'all' : `${t.geo_type}:${t.geo_value}`;
}

// clicks/impressions*100 rounded to 1 decimal; 0 when there are no impressions.
function ctrPercent(impressions, clicks) {
  const i = Number(impressions) || 0;
  const c = Number(clicks) || 0;
  if (i === 0) return 0;
  return Math.round((c / i) * 1000) / 10;
}

// GET /api/admin/ads/export.csv — gated by ads:view. Registered BEFORE /ads/:id
// so 'export.csv' is not captured as a campaign id. Read-only, whole-list report
// with the same fields the admin matrix already shows, plus a computed CTR.
exports.exportCsv = async (_req, res) => {
  const r = await query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC LIMIT 500`);

  const rows = [csvRow([
    'id', 'title', 'advertiser', 'style', 'status', 'targets',
    'starts_at', 'ends_at', 'priority', 'impressions', 'clicks',
    'ctr_percent', 'created_at',
  ])];
  for (const c of r.rows) {
    const targets = (c.targets || []).map(targetToken).join(' ');
    rows.push(csvRow([
      c.id,
      c.title,
      c.advertiser,
      c.style,
      c.status,
      targets,
      isoDate(c.starts_at),
      isoDate(c.ends_at),
      c.priority,
      Number(c.impressions) || 0,
      Number(c.clicks) || 0,
      ctrPercent(c.impressions, c.clicks),
      isoDate(c.created_at),
    ]));
  }
  sendCsv(res, 'campaigns.csv', rows);
};

// GET /api/admin/ads/:id
exports.getOne = async (req, res) => {
  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  res.json({ campaign: r.rows[0] });
};

// POST /api/admin/ads  { ...campaign, targets: [{geo_type, geo_value}] }
exports.create = async (req, res) => {
  const b = req.body;
  const link = await resolveLink(b);
  const targets = normalizeTargets(b.targets);

  const campaign = await withTx(async (client) => {
    const ins = await client.query(
      `INSERT INTO ad_campaigns
         (style, title, offer_text, subtitle, glyph, image_url, i18n, advertiser,
          link_type, link_shop_id, link_product_id, link_url, is_seasonal,
          starts_at, ends_at, priority, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        b.style, b.title, b.offer_text ?? null, b.subtitle ?? null, b.glyph ?? null,
        b.image_url ?? null, JSON.stringify(b.i18n ?? {}), b.advertiser ?? null,
        link.link_type, link.link_shop_id, link.link_product_id, link.link_url,
        b.is_seasonal ?? false, b.starts_at ?? null, b.ends_at ?? null,
        b.priority ?? 0, b.status ?? 'draft', req.user.sub,
      ]
    );
    const id = ins.rows[0].id;
    for (const t of targets) {
      await client.query(
        'INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
        [id, t.geo_type, t.geo_value]
      );
    }
    return id;
  });

  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [campaign]);
  res.status(201).json({ campaign: r.rows[0] });
};

// PUT /api/admin/ads/:id  — update fields + REPLACE targets (delete + reinsert)
exports.update = async (req, res) => {
  const b = req.body;
  const existing = await query('SELECT id FROM ad_campaigns WHERE id = $1', [req.params.id]);
  if (!existing.rowCount) throw ApiError.notFound('Campaign not found');

  const link = await resolveLink(b);
  const targets = normalizeTargets(b.targets);

  await withTx(async (client) => {
    await client.query(
      `UPDATE ad_campaigns SET
         style=$1, title=$2, offer_text=$3, subtitle=$4, glyph=$5, image_url=$6,
         i18n=$7::jsonb, advertiser=$8, link_type=$9, link_shop_id=$10,
         link_product_id=$11, link_url=$12, is_seasonal=$13, starts_at=$14,
         ends_at=$15, priority=$16, status=$17, updated_at=NOW()
       WHERE id=$18`,
      [
        b.style, b.title, b.offer_text ?? null, b.subtitle ?? null, b.glyph ?? null,
        b.image_url ?? null, JSON.stringify(b.i18n ?? {}), b.advertiser ?? null,
        link.link_type, link.link_shop_id, link.link_product_id, link.link_url,
        b.is_seasonal ?? false, b.starts_at ?? null, b.ends_at ?? null,
        b.priority ?? 0, b.status ?? 'draft', req.params.id,
      ]
    );
    await client.query('DELETE FROM ad_targets WHERE campaign_id = $1', [req.params.id]);
    for (const t of targets) {
      await client.query(
        'INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
        [req.params.id, t.geo_type, t.geo_value]
      );
    }
  });

  const r = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  res.json({ campaign: r.rows[0] });
};

// PATCH /api/admin/ads/:id/status  { status }
exports.setStatus = async (req, res) => {
  const r = await query(
    `UPDATE ad_campaigns SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [req.body.status, req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  const out = await query(`${CAMPAIGN_SELECT} WHERE c.id = $1`, [req.params.id]);
  res.json({ campaign: out.rows[0] });
};

// DELETE /api/admin/ads/:id  — targets cascade
exports.remove = async (req, res) => {
  const r = await query('DELETE FROM ad_campaigns WHERE id = $1 RETURNING id', [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Campaign not found');
  res.json({ ok: true, id: r.rows[0].id });
};

// GET /api/admin/ads/geo-options — distinct non-null town(=city)/village/pincode
// from shops, each a sorted list, to feed the target pickers. town = shop.city;
// village/pincode come from the location model (migration 0044).
// ===========================================================================
// Shop self-serve promo moderation (batch PROMO-BUY). A shop buys a moderated
// promo (promos.controller.mineCreate) that starts status='pending_review'; an
// admin here approves it (→ 'active', it starts serving) or rejects it (→
// 'rejected', the credits are refunded ONCE). Gated by the same ads:manage perm
// as the campaign CRUD above (see admin.routes).
// ===========================================================================

// GET /api/admin/promos/pending — self_serve + pending_review campaigns with the
// shop name, geo targets and the cost the shop paid, newest first.
exports.pendingPromos = async (_req, res) => {
  const r = await query(
    `SELECT c.id, c.title, c.offer_text, c.subtitle, c.glyph, c.advertiser,
            c.link_shop_id, c.starts_at, c.ends_at, c.credits_spent_paise,
            c.created_at, s.name AS shop_name, s.city AS shop_city,
            COALESCE((
              SELECT json_agg(json_build_object('geo_type', t.geo_type, 'geo_value', t.geo_value)
                              ORDER BY t.geo_type, t.geo_value)
              FROM ad_targets t WHERE t.campaign_id = c.id
            ), '[]'::json) AS targets
       FROM ad_campaigns c
       LEFT JOIN shops s ON s.id = c.link_shop_id
      WHERE c.self_serve = true AND c.status = 'pending_review'
      ORDER BY c.created_at DESC
      LIMIT 500`
  );
  res.json({
    items: r.rows.map((row) => ({
      ...row,
      credits_spent_paise: row.credits_spent_paise == null ? null : Number(row.credits_spent_paise),
    })),
  });
};

// POST /api/admin/promos/:id/approve — pending_review → active. The guard on
// status='pending_review' means only a promo actually awaiting review can be
// approved (an already-active/rejected one 409s), so serving picks it up next.
exports.approvePromo = async (req, res) => {
  const r = await query(
    `UPDATE ad_campaigns
        SET status = 'active', updated_at = NOW()
      WHERE id = $1 AND self_serve = true AND status = 'pending_review'
      RETURNING id`,
    [req.params.id]
  );
  if (!r.rowCount) {
    // Distinguish "no such self-serve promo" from "not awaiting review".
    const exists = await query(
      "SELECT status FROM ad_campaigns WHERE id = $1 AND self_serve = true",
      [req.params.id]
    );
    if (!exists.rowCount) throw ApiError.notFound('Promo not found');
    throw ApiError.conflict(`Promo is '${exists.rows[0].status}', not pending review`);
  }
  res.json({ id: r.rows[0].id, status: 'active' });
};

// POST /api/admin/promos/:id/reject  { reason? } — pending_review → rejected AND
// refund the credits the shop paid, in ONE transaction with the status flip.
//
// IDEMPOTENT by construction: the UPDATE ... WHERE status='pending_review' is the
// atomic transition. Only the ONE update that actually moves the row out of
// pending_review returns a row (rowCount 1) and triggers the refund; a concurrent
// or repeated reject finds status='rejected' (rowCount 0) and refunds NOTHING, so
// a double-reject can never double-refund.
exports.rejectPromo = async (req, res) => {
  const reason = req.body && req.body.reason ? String(req.body.reason).trim().slice(0, 500) : null;

  const outcome = await withTx(async (client) => {
    const upd = await client.query(
      `UPDATE ad_campaigns
          SET status = 'rejected', updated_at = NOW()
        WHERE id = $1 AND self_serve = true AND status = 'pending_review'
        RETURNING id, link_shop_id, credits_spent_paise`,
      [req.params.id]
    );
    if (!upd.rowCount) return { transitioned: false };

    const row = upd.rows[0];
    let refunded = 0;
    // Refund only when there is a shop wallet target and a recorded amount. The
    // refund is a 'refund'-kind credit (free-text ledger kind) referencing the promo.
    if (row.link_shop_id && row.credits_spent_paise != null && Number(row.credits_spent_paise) > 0) {
      const wallet = await getOrCreateWallet('shop', row.link_shop_id, client);
      await creditWallet(
        {
          wallet,
          amount_paise: Number(row.credits_spent_paise),
          kind: 'refund',
          ref_note: `promo rejected ${row.id}${reason ? ` (${reason})` : ''}`,
          created_by: req.user.sub,
        },
        client
      );
      refunded = Number(row.credits_spent_paise);
    }
    return { transitioned: true, refunded_paise: refunded };
  });

  if (!outcome.transitioned) {
    const exists = await query(
      "SELECT status FROM ad_campaigns WHERE id = $1 AND self_serve = true",
      [req.params.id]
    );
    if (!exists.rowCount) throw ApiError.notFound('Promo not found');
    throw ApiError.conflict(`Promo is '${exists.rows[0].status}', not pending review`);
  }
  res.json({ id: req.params.id, status: 'rejected', refunded_paise: outcome.refunded_paise });
};

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
