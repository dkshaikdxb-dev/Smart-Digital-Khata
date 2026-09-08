const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');

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
