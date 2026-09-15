const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getOrCreateWallet, creditWallet } = require('../utils/wallet');
// Reuse the ONE set of CSV helpers so quoting/CRLF/attachment behaviour matches
// every other export in the app (admin-export.controller.js does the same).
const { csvRow, isoDate, sendCsv } = require('../utils/statement');
// The ONE moderation audit trail (moderation_actions) — the storefront photo
// queue below records into it like every other admin moderation action.
const { writeAudit } = require('./admin.controller');
// Shop trust + post-publish spot checks (batch MOD2). Every human decision on
// the two queues feeds the SAME counters the AI job reads, so "this shop has a
// clean history" means the same thing on both sides of the desk.
const trust = require('../utils/moderationTrust');

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
         c.placement, c.self_serve, c.credits_spent_paise, c.review_note,
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

// GET /api/admin/ads?status=&style=&geo=&placement=
exports.list = async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`c.status = $${params.length}`); }
  if (req.query.style) { params.push(req.query.style); where.push(`c.style = $${params.length}`); }
  if (req.query.placement) { params.push(req.query.placement); where.push(`c.placement = $${params.length}`); }
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
// with the same fields the admin matrix already shows, plus a computed CTR. The
// `placement` column separates storefront-slot revenue from the discovery band.
exports.exportCsv = async (_req, res) => {
  const r = await query(`${CAMPAIGN_SELECT} ORDER BY c.created_at DESC LIMIT 500`);

  const rows = [csvRow([
    'id', 'title', 'advertiser', 'style', 'placement', 'status', 'targets',
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
      c.placement,
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
          starts_at, ends_at, priority, status, created_by, placement)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        b.style, b.title, b.offer_text ?? null, b.subtitle ?? null, b.glyph ?? null,
        b.image_url ?? null, JSON.stringify(b.i18n ?? {}), b.advertiser ?? null,
        link.link_type, link.link_shop_id, link.link_product_id, link.link_url,
        b.is_seasonal ?? false, b.starts_at ?? null, b.ends_at ?? null,
        b.priority ?? 0, b.status ?? 'draft', req.user.sub, b.placement ?? 'discovery',
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
         ends_at=$15, priority=$16, status=$17, placement=$19, updated_at=NOW()
       WHERE id=$18`,
      [
        b.style, b.title, b.offer_text ?? null, b.subtitle ?? null, b.glyph ?? null,
        b.image_url ?? null, JSON.stringify(b.i18n ?? {}), b.advertiser ?? null,
        link.link_type, link.link_shop_id, link.link_product_id, link.link_url,
        b.is_seasonal ?? false, b.starts_at ?? null, b.ends_at ?? null,
        b.priority ?? 0, b.status ?? 'draft', req.params.id, b.placement ?? 'discovery',
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
// shop name, geo targets and the cost the shop paid. AI-flagged rows first (the
// model said "hold"), then oldest first so the longest-waiting shop is served
// next; each row carries the AI verdict (batch AI-MOD) for the queue's badge.
exports.pendingPromos = async (_req, res) => {
  const r = await query(
    `SELECT c.id, c.title, c.offer_text, c.subtitle, c.glyph, c.advertiser,
            c.link_shop_id, c.starts_at, c.ends_at, c.credits_spent_paise,
            c.created_at, c.ai_verdict, c.ai_flagged,
            s.name AS shop_name, s.city AS shop_city,
            COALESCE((
              SELECT json_agg(json_build_object('geo_type', t.geo_type, 'geo_value', t.geo_value)
                              ORDER BY t.geo_type, t.geo_value)
              FROM ad_targets t WHERE t.campaign_id = c.id
            ), '[]'::json) AS targets
       FROM ad_campaigns c
       LEFT JOIN shops s ON s.id = c.link_shop_id
      WHERE c.self_serve = true AND c.status = 'pending_review'
      ORDER BY c.ai_flagged DESC, c.created_at ASC
      LIMIT 500`
  );
  res.json({
    items: r.rows.map((row) => ({
      ...row,
      credits_spent_paise: row.credits_spent_paise == null ? null : Number(row.credits_spent_paise),
      // A free request paid nothing (credits_spent_paise=0). The queue UI uses this
      // to show a "Free" vs "Paid" pill and to word the reject confirmation (a free
      // reject refunds nothing).
      is_free: Number(row.credits_spent_paise) === 0,
      ai_verdict: row.ai_verdict || null,
      ai_flagged: row.ai_flagged === true,
    })),
  });
};

// The AI verdict fields an admin decision is measured against (batch AI-MOD):
// recorded on the admin's audit row so overrides are countable (aiStats).
// Record ONE human decision against the shop's trust history (batch MOD2).
//
// A rejection of something the AI had already published is an OVERTURN: the
// approval was banked when the AI published it, so it has to be taken back as
// the rejection is added — otherwise a wrong auto-approval would leave the shop
// looking better than a shop that had simply never been approved. Everything
// here is best-effort: the admin's decision has already been written and must
// never be undone by a bookkeeping failure.
async function recordHumanOutcome({ kind, targetId, shopId, outcome, client }) {
  if (!shopId) return;
  const overturned = outcome === 'rejected' && await trust.wasAutoApproved({ kind, targetId });
  await trust.recordOutcome(client || null, { shopId, outcome, overturned });
}

function aiOverrideMeta(aiVerdict) {
  const v = aiVerdict && typeof aiVerdict === 'object' ? aiVerdict : null;
  return {
    ai_decision: v && v.decision ? v.decision : null,
    ai_confidence: v && Number.isFinite(Number(v.confidence)) ? Number(v.confidence) : null,
  };
}

// POST /api/admin/promos/:id/approve — pending_review → active. The guard on
// status='pending_review' means only a promo actually awaiting review can be
// approved (an already-active/rejected one 409s), so serving picks it up next.
exports.approvePromo = async (req, res) => {
  // Optional note the admin may leave on approval (canonical field review_note;
  // reason accepted for back-compat). COALESCE so an approve with no note never
  // wipes a note left earlier.
  const rawNote = req.body && (req.body.review_note != null ? req.body.review_note : req.body.reason);
  const reviewNote = rawNote ? String(rawNote).trim().slice(0, 500) || null : null;
  const r = await query(
    `UPDATE ad_campaigns
        SET status = 'active', review_note = COALESCE($2, review_note), updated_at = NOW()
      WHERE id = $1 AND self_serve = true AND status = 'pending_review'
      RETURNING id, link_shop_id, ai_verdict`,
    [req.params.id, reviewNote]
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
  // Audit the human decision on the ONE trail, with the AI's verdict alongside
  // so an override (reject-after-ai-approve etc.) is measurable.
  await writeAudit({
    adminUserId: req.user.sub,
    action: 'promo.approve',
    targetType: 'campaign',
    targetId: r.rows[0].id,
    reason: reviewNote,
    metadata: { shop_id: r.rows[0].link_shop_id, to: 'active', ...aiOverrideMeta(r.rows[0].ai_verdict) },
  });
  await recordHumanOutcome({
    kind: 'campaign', targetId: r.rows[0].id, shopId: r.rows[0].link_shop_id, outcome: 'approved',
  });
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
  // Canonical field review_note (reason accepted for back-compat). Persisted to the
  // review_note column AND woven into the refund ledger note, so the owner sees the
  // reason on their placement and the ledger row records it too.
  const rawNote = req.body && (req.body.review_note != null ? req.body.review_note : req.body.reason);
  const reason = rawNote ? String(rawNote).trim().slice(0, 500) || null : null;

  const outcome = await withTx(async (client) => {
    const upd = await client.query(
      `UPDATE ad_campaigns
          SET status = 'rejected', review_note = $2, updated_at = NOW()
        WHERE id = $1 AND self_serve = true AND status = 'pending_review'
        RETURNING id, link_shop_id, credits_spent_paise, ai_verdict`,
      [req.params.id, reason]
    );
    if (!upd.rowCount) return { transitioned: false };

    const row = upd.rows[0];
    // Audit in the same transaction as the flip + refund (AI verdict alongside).
    await writeAudit({
      adminUserId: req.user.sub,
      action: 'promo.reject',
      targetType: 'campaign',
      targetId: row.id,
      reason,
      metadata: { shop_id: row.link_shop_id, to: 'rejected', ...aiOverrideMeta(row.ai_verdict) },
      client,
    });
    await recordHumanOutcome({
      kind: 'campaign', targetId: row.id, shopId: row.link_shop_id, outcome: 'rejected', client,
    });
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

// ===========================================================================
// Storefront photo moderation (batch STOREFRONT-FULL). An owner's storefront
// photo (shop_images) starts 'pending_review' unless the shop is trusted
// (shops.slides_auto_publish); only 'active' photos are composed into the public
// storefront (discovery.getShop). Same ads:manage gate + review_note body shape
// as the promo queue above; every decision is written to moderation_actions.
// No money moves here — a rejected photo simply never shows.
// ===========================================================================

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Cache-busted public URL for a gallery photo (mirrors shop.controller
// galleryImageUrl so the queue renders the exact bytes the storefront would).
function galleryImageUrl(id, updatedAt) {
  const epoch = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
  return `/api/shop-images/${id}?v=${epoch}`;
}

// GET /api/admin/shop-images/pending — every photo awaiting review with its
// shop, plus the shops currently trusted to auto-publish (so an admin can revoke
// that trust). AI-flagged photos first (the model said "hold"), then oldest
// first so the longest-waiting owner is served next; each row carries the AI
// verdict (batch AI-MOD) for the queue's badge.
exports.pendingShopImages = async (_req, res) => {
  const [pending, trusted] = await Promise.all([
    query(
      `SELECT i.id, i.shop_id, i.position, i.updated_at, i.ai_verdict, i.ai_flagged,
              s.name AS shop_name, s.city AS shop_city, s.slides_auto_publish
         FROM shop_images i
         JOIN shops s ON s.id = i.shop_id
        WHERE i.status = 'pending_review'
        ORDER BY i.ai_flagged DESC, i.updated_at ASC, i.id ASC
        LIMIT 500`
    ),
    query(
      `SELECT id AS shop_id, name AS shop_name, city AS shop_city
         FROM shops WHERE slides_auto_publish = true
        ORDER BY name ASC LIMIT 500`
    ),
  ]);
  res.json({
    items: pending.rows.map((row) => ({
      id: row.id,
      shop_id: row.shop_id,
      shop_name: row.shop_name,
      shop_city: row.shop_city,
      position: row.position,
      url: galleryImageUrl(row.id, row.updated_at),
      uploaded_at: row.updated_at,
      auto_publish: row.slides_auto_publish === true,
      ai_verdict: row.ai_verdict || null,
      ai_flagged: row.ai_flagged === true,
    })),
    auto_publish_shops: trusted.rows,
  });
};

// The optional admin note (canonical review_note; reason for back-compat with
// the promo queue's older clients), trimmed + capped.
function reviewNoteFrom(body) {
  const raw = body && (body.review_note != null ? body.review_note : body.reason);
  return raw ? String(raw).trim().slice(0, 500) || null : null;
}

// Flip one photo to `next` status. Allowed from any status EXCEPT `next` itself
// (409): approve can rescue a rejected photo, and reject can take down a photo
// that went live under the trust toggle — both are reversible, no money moves.
// 404 when the id is malformed or unknown. Returns the updated row.
async function moderateShopImage(req, next, note) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Photo not found');
  const upd = await query(
    `UPDATE shop_images
        SET status = $2,
            review_note = ${next === 'active' ? 'COALESCE($3, review_note)' : '$3'},
            reviewed_at = NOW()
      WHERE id = $1 AND status <> $2
      RETURNING id, shop_id, status, ai_verdict`,
    [id, next, note]
  );
  if (!upd.rowCount) {
    const exists = await query('SELECT status FROM shop_images WHERE id = $1', [id]);
    if (!exists.rowCount) throw ApiError.notFound('Photo not found');
    throw ApiError.conflict(`Photo is already '${exists.rows[0].status}'`);
  }
  const row = upd.rows[0];
  await writeAudit({
    adminUserId: req.user.sub,
    action: next === 'active' ? 'shop_image.approve' : 'shop_image.reject',
    targetType: 'shop',
    targetId: row.shop_id,
    reason: note,
    // The AI's verdict rides along so an override is measurable (aiStats).
    metadata: { image_id: row.id, to: next, ...aiOverrideMeta(row.ai_verdict) },
  });
  // The shop's trust history (batch MOD2): an approve banks a point, a reject
  // costs one — and a reject of an AI-published photo takes back the point the
  // auto-approval banked.
  await recordHumanOutcome({
    kind: 'shop_image',
    targetId: row.id,
    shopId: row.shop_id,
    outcome: next === 'active' ? 'approved' : 'rejected',
  });
  return row;
}

// GET /api/admin/moderation/pending-count — how much is waiting for a human,
// as three numbers and their sum (batch MODQ).
//
// The console chrome (the nav pill, the platform-admin hub card) has to be able
// to say "N waiting" on every page. It could ask the three queue endpoints, but
// each of those returns up to 500 fully-joined rows, so drawing one digit would
// cost three round trips of payload on a desk that is open all day. This is the
// same three WHEREs with nothing selected — each one hits the index the queue
// itself reads (idx_ad_campaigns_status_ai_flagged, shop_images_status,
// idx_spot_checks_status) — in a single round trip.
//
// Permissioned identically to the three queues it counts (requirePerm
// 'ads:manage' in admin.routes), so it cannot tell an admin that work exists
// which they are not allowed to open. It is deliberately NOT widened to
// audit:view: the audit log is the record of decisions already taken and has no
// pending anything, so there is nothing here for an audit-only role to see.
exports.pendingReviewCount = async (_req, res) => {
  const r = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM ad_campaigns
         WHERE self_serve = true AND status = 'pending_review')      AS promos,
       (SELECT COUNT(*)::int FROM shop_images
         WHERE status = 'pending_review')                            AS shop_images,
       (SELECT COUNT(*)::int FROM moderation_spot_checks
         WHERE status = 'pending')                                   AS spot_checks`
  );
  const row = r.rows[0] || { promos: 0, shop_images: 0, spot_checks: 0 };
  const promos = Number(row.promos) || 0;
  const shopImages = Number(row.shop_images) || 0;
  const spotChecks = Number(row.spot_checks) || 0;
  res.json({
    promos,
    shop_images: shopImages,
    spot_checks: spotChecks,
    total: promos + shopImages + spotChecks,
  });
};

// GET /api/admin/moderation/ai-stats — last-30-day counts from the ONE audit
// trail (batch AI-MOD): how many rows the AI auto-approved / held / left for
// review, and every admin approve/reject on the two queues split by the AI
// decision it followed (null = no AI verdict on that row). `agreement` sums
// the clear cases: approve-after-approve + reject-after-hold agree;
// reject-after-approve + approve-after-hold disagree.
// ---------------------------------------------------------------------------
// The honest numbers (batch MOD2). `saved` and `overturned` are computed from
// the ONE audit trail by ITEM, not by counting actions: an item is "saved" when
// the AI published it and no human ever took it back, and "overturned" when a
// human (in either queue) or a post-publish spot check later judged it wrong.
//
// Matching an AI decision to the human decision on the SAME item needs one
// identity for both shapes of row: a photo's rows carry the image id in
// metadata.image_id (their target_id is the shop), a campaign's target_id IS
// the campaign. COALESCE(metadata->>'image_id', target_id::text) is that
// identity, and it is why both writers keep those fields.
const OVERTURN_ACTIONS = "('shop_image.reject','promo.reject','moderation.spot_check_bad')";
const AI_ITEM_ID = "COALESCE(metadata->>'image_id', target_id::text)";

// Below this many auto-approvals a percentage is noise, so the API returns
// `rate: null` and the UI shows the two raw counts instead of a ratio. 20 is
// the point at which one more overturn stops moving the number by tens of
// percent.
const PRECISION_MIN_SAMPLE = 20;

exports.aiStats = async (_req, res) => {
  const r = await query(
    `SELECT action, metadata->>'ai_decision' AS ai_decision, COUNT(*)::int AS n
       FROM moderation_actions
      WHERE created_at > NOW() - interval '30 days'
        AND action IN ('ai_auto_approve','ai_hold','ai_review',
                       'shop_image.approve','shop_image.reject','promo.approve','promo.reject')
      GROUP BY action, metadata->>'ai_decision'`
  );
  const out = {
    days: 30,
    auto_approved: 0,
    held: 0,
    reviewed: 0,
    admin: {
      approve_after_ai_approve: 0,
      reject_after_ai_approve: 0,
      approve_after_ai_hold: 0,
      reject_after_ai_hold: 0,
      approve_after_ai_review: 0,
      reject_after_ai_review: 0,
      approve_no_ai: 0,
      reject_no_ai: 0,
    },
    agreement: { agreed: 0, disagreed: 0 },
  };
  for (const row of r.rows) {
    if (row.action === 'ai_auto_approve') { out.auto_approved += row.n; continue; }
    if (row.action === 'ai_hold') { out.held += row.n; continue; }
    if (row.action === 'ai_review') { out.reviewed += row.n; continue; }
    const verb = row.action.endsWith('.approve') ? 'approve' : 'reject';
    const ai = ['approve', 'hold', 'review'].includes(row.ai_decision) ? row.ai_decision : null;
    out.admin[ai ? `${verb}_after_ai_${ai}` : `${verb}_no_ai`] += row.n;
  }
  out.agreement.agreed = out.admin.approve_after_ai_approve + out.admin.reject_after_ai_hold;
  out.agreement.disagreed = out.admin.reject_after_ai_approve + out.admin.approve_after_ai_hold;

  // ---- What was actually saved, and what it cost (batch MOD2) -------------
  const cfg = await trust.getTrustConfig();
  const [overturn, checks, bands] = await Promise.all([
    // Auto-approvals in the window, split by whether anything ever took them
    // back. One row, two numbers, no double counting: DISTINCT item.
    query(
      `WITH auto AS (
         SELECT DISTINCT ${AI_ITEM_ID} AS item
           FROM moderation_actions
          WHERE action = 'ai_auto_approve' AND created_at > NOW() - interval '30 days'
       ), overturned AS (
         SELECT DISTINCT ${AI_ITEM_ID} AS item
           FROM moderation_actions
          WHERE action IN ${OVERTURN_ACTIONS}
       )
       SELECT COUNT(*)::int AS auto_approved,
              COUNT(*) FILTER (WHERE a.item IN (SELECT item FROM overturned))::int AS overturned
         FROM auto a`
    ),
    // Spot checks. `pending` is deliberately ALL-TIME, not windowed: a check
    // still waiting after 30 days is work that still has to happen, and a
    // dashboard that quietly dropped it would be the opposite of honest. The
    // two settled counts use the same 30-day window as everything else.
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'ok'  AND reviewed_at > NOW() - interval '30 days')::int AS ok,
         COUNT(*) FILTER (WHERE status = 'bad' AND reviewed_at > NOW() - interval '30 days')::int AS bad
       FROM moderation_spot_checks`
    ),
    // The trust picture right now (not a window — it is a standing state).
    // Same constants the threshold maths uses, and the config's OWN min_items.
    query(
      `SELECT
         COUNT(*) FILTER (WHERE score >= $1 AND approved_count + rejected_count >= $2)::int AS trusted_shops,
         COUNT(*) FILTER (WHERE score < $3)::int AS distrusted_shops,
         COUNT(*)::int AS total
       FROM shop_moderation_trust`,
      [trust.TRUSTED_SCORE, cfg.min_items, trust.DISTRUSTED_SCORE]
    ),
  ]);

  const autoApproved = overturn.rows[0].auto_approved;
  const overturned = overturn.rows[0].overturned;
  out.saved = autoApproved - overturned;
  out.overturned = overturned;
  // Stated as counts first. A bare percentage over a handful of items is a lie
  // with a decimal point in it, so `rate` is null until the sample is big
  // enough and the UI renders the sentence instead.
  out.precision = {
    auto_approved: autoApproved,
    overturned,
    min_sample: PRECISION_MIN_SAMPLE,
    rate: autoApproved >= PRECISION_MIN_SAMPLE ? Math.round((overturned / autoApproved) * 1000) / 1000 : null,
    text: `of ${autoApproved} auto-approved, ${overturned} were later judged wrong`,
  };
  out.spot_checks = checks.rows[0];
  const b = bands.rows[0];
  out.trust = {
    enabled: cfg.enabled,
    min_items: cfg.min_items,
    trusted_shops: b.trusted_shops,
    distrusted_shops: b.distrusted_shops,
    neutral: b.total - b.trusted_shops - b.distrusted_shops,
  };
  res.json(out);
};

// ===========================================================================
// POST-PUBLISH SPOT CHECKS (batch MOD2). Auto-approval is only safe if a sample
// of what it published is looked at AGAIN. These two endpoints are that second
// look. Same ads:manage gate as the two pre-publish queues, but a deliberately
// separate surface: everything here is ALREADY LIVE.
// ===========================================================================

// GET /api/admin/moderation/spot-checks — pending checks, oldest first, with
// enough to judge without leaving the page: the shop, the stored verdict, and a
// link to the photo bytes or the campaign creative.
exports.pendingSpotChecks = async (_req, res) => {
  const r = await query(
    `SELECT sc.id, sc.kind, sc.target_id, sc.shop_id, sc.ai_verdict, sc.created_at,
            s.name AS shop_name, s.city AS shop_city,
            i.updated_at AS image_updated_at, i.status AS image_status,
            c.title AS campaign_title, c.offer_text, c.subtitle, c.glyph, c.status AS campaign_status
       FROM moderation_spot_checks sc
       LEFT JOIN shops s ON s.id = sc.shop_id
       LEFT JOIN shop_images i ON sc.kind = 'shop_image' AND i.id = sc.target_id
       LEFT JOIN ad_campaigns c ON sc.kind = 'campaign' AND c.id = sc.target_id
      WHERE sc.status = 'pending'
      ORDER BY sc.created_at ASC
      LIMIT 200`
  );
  res.json({
    items: r.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      target_id: row.target_id,
      shop_id: row.shop_id,
      shop_name: row.shop_name,
      shop_city: row.shop_city,
      ai_verdict: row.ai_verdict || null,
      created_at: row.created_at,
      // The exact bytes the storefront is serving right now, or the promo lines.
      url: row.kind === 'shop_image' ? galleryImageUrl(row.target_id, row.image_updated_at) : null,
      creative: row.kind === 'campaign'
        ? { title: row.campaign_title, offer_text: row.offer_text, subtitle: row.subtitle, glyph: row.glyph }
        : null,
      // Whether the item is still live; a check whose item was already taken
      // down elsewhere is still worth closing, but the admin should see that.
      live: row.kind === 'shop_image' ? row.image_status === 'active' : row.campaign_status === 'active',
    })),
  });
};

// POST /api/admin/moderation/spot-checks/:id  { verdict: 'ok'|'bad', note? }
//
// 'ok'  — the AI was right. The item stays live, the check is closed, and the
//         shop's trust is NOT touched: the approval was already banked when the
//         AI published it, and banking it twice would let sampling itself
//         inflate a shop's record.
// 'bad' — the AI was wrong. In ONE transaction: the item goes back to
//         pending_review (so it stops being public and lands back in the
//         pre-publish queue, flagged to the top), the shop's trust records a
//         rejection that OVERTURNS the earlier auto-approval, and the decision
//         is audited with the admin's id.
exports.reviewSpotCheck = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Spot check not found');
  const verdict = String(req.body && req.body.verdict);
  if (verdict !== 'ok' && verdict !== 'bad') throw ApiError.badRequest('invalid_verdict');
  // `note` is this endpoint's own field name (the spec's), with review_note /
  // reason accepted too so the queue cards can share one note input.
  const b = req.body || {};
  const note = reviewNoteFrom({ review_note: b.note != null ? b.note : b.review_note, reason: b.reason });

  const outcome = await withTx(async (client) => {
    // The atomic transition: only the ONE update that actually moves the check
    // out of 'pending' does the work, so a double-tap can never take an item
    // down twice or decrement a shop twice.
    const upd = await client.query(
      `UPDATE moderation_spot_checks
          SET status = $2, reviewed_by = $3, reviewed_at = NOW(), note = $4
        WHERE id = $1 AND status = 'pending'
        RETURNING id, kind, target_id, shop_id, ai_verdict`,
      [id, verdict, req.user.sub, note]
    );
    if (!upd.rowCount) return { transitioned: false };
    const row = upd.rows[0];
    let tookDown = false;
    if (verdict === 'bad') {
      // Back to pending_review — NOT rejected. This is a take-down, not a
      // verdict on the content: it stops being public immediately and a human
      // decides properly in the pre-publish queue, where ai_flagged puts it on
      // top.
      const target = row.kind === 'shop_image'
        ? await client.query(
          `UPDATE shop_images SET status = 'pending_review', ai_flagged = true, reviewed_at = NOW()
             WHERE id = $1 AND status = 'active' RETURNING id`,
          [row.target_id]
        )
        : await client.query(
          `UPDATE ad_campaigns SET status = 'pending_review', ai_flagged = true, updated_at = NOW()
             WHERE id = $1 AND status = 'active' RETURNING id`,
          [row.target_id]
        );
      tookDown = target.rowCount > 0;
      await trust.recordOutcome(client, { shopId: row.shop_id, outcome: 'rejected', overturned: true });
    }
    await writeAudit({
      adminUserId: req.user.sub,
      action: verdict === 'bad' ? 'moderation.spot_check_bad' : 'moderation.spot_check_ok',
      targetType: row.kind === 'shop_image' ? 'shop' : 'campaign',
      targetId: row.kind === 'shop_image' ? row.shop_id : row.target_id,
      reason: note,
      metadata: {
        spot_check_id: row.id,
        kind: row.kind,
        // The same item identity aiStats matches an auto-approval on.
        ...(row.kind === 'shop_image' ? { image_id: row.target_id } : { shop_id: row.shop_id }),
        took_down: tookDown,
        ...aiOverrideMeta(row.ai_verdict),
      },
      client,
    });
    return { transitioned: true, kind: row.kind, target_id: row.target_id, took_down: tookDown };
  });

  if (!outcome.transitioned) {
    const exists = await query('SELECT status FROM moderation_spot_checks WHERE id = $1', [id]);
    if (!exists.rowCount) throw ApiError.notFound('Spot check not found');
    throw ApiError.conflict(`Spot check is already '${exists.rows[0].status}'`);
  }
  res.json({ id, status: verdict, kind: outcome.kind, target_id: outcome.target_id, took_down: outcome.took_down });
};

// POST /api/admin/shop-images/:id/approve  { review_note? } → active (served).
// An approve with no note never wipes a note left earlier (COALESCE).
exports.approveShopImage = async (req, res) => {
  const row = await moderateShopImage(req, 'active', reviewNoteFrom(req.body));
  res.json({ id: row.id, status: 'active' });
};

// POST /api/admin/shop-images/:id/reject  { review_note? } → rejected (never
// served). The note is persisted and shown to the owner on their photo.
exports.rejectShopImage = async (req, res) => {
  const row = await moderateShopImage(req, 'rejected', reviewNoteFrom(req.body));
  res.json({ id: row.id, status: 'rejected' });
};

// PATCH /api/admin/shops/:id/slides  { auto_publish, reason? } — the per-shop
// trust toggle. Only affects FUTURE uploads (already-pending photos stay in the
// queue; already-live photos stay live). Audited as a moderation action.
exports.setShopSlidesAutoPublish = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Shop not found');
  const on = req.body.auto_publish === true;
  const r = await query(
    `UPDATE shops SET slides_auto_publish = $2, updated_at = NOW()
      WHERE id = $1 RETURNING id, name, slides_auto_publish`,
    [id, on]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  await writeAudit({
    adminUserId: req.user.sub,
    action: on ? 'shop.slides_auto_publish.on' : 'shop.slides_auto_publish.off',
    targetType: 'shop',
    targetId: id,
    reason: req.body.reason,
    metadata: { shop_name: r.rows[0].name, auto_publish: on },
  });
  res.json({ shop_id: r.rows[0].id, auto_publish: r.rows[0].slides_auto_publish === true });
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
