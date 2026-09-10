const Joi = require('joi');
const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { spendCredits } = require('../utils/wallet');
const { getShopPromoConfig } = require('../utils/shopPromo');

// Public, unauthenticated promo serving (batch ADS4). Serves the localized,
// geo-matched, in-window, active campaigns to the consumer app and records
// best-effort impression/click beacons. No admin surface here — that lives in
// ads.controller.js. No consumer UI here — that is Batch 5.
//
// The campaign matrix (ad_campaigns / ad_targets) was created in migration 0045.
// A campaign carries geo targets (ad_targets): a town (= shop.city), a village,
// a pincode, or 'all' (district-wide). The shopper sends their saved location
// (any subset of town/village/pincode); we return the campaigns that match.

// Languages the consumer app can be viewed in. Mirrors discovery/catalog
// controllers' resolveLang so every public path localizes consistently. 'en' is
// the base language: it uses the plain base columns (no i18n override lookup).
const KNOWN_LANGS = new Set(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']);

// Resolve ?lang= to a known language, defaulting to 'en'. Unknown/absent values
// fall back to 'en' (base creative) rather than erroring — the promo slider must
// always render.
function resolveLang(raw) {
  const lang = (raw || '').trim().toLowerCase();
  return KNOWN_LANGS.has(lang) ? lang : 'en';
}

// GET /api/public/promos?town=&village=&pincode=&lang=
//
// Eligibility: status='active' AND within window (no starts_at = open start, no
// ends_at = open end) — so always-on campaigns show whenever active and seasonal
// campaigns show only inside their dates.
//
// Geo match: the campaign has at least one target row that is geo_type='all' OR
// matches a value the shopper actually supplied — town/village trimmed +
// case-insensitive, pincode exact. Each geo branch is guarded by an `IS NOT NULL`
// on its bound value, so a shopper who sends NO location matches ONLY 'all'
// campaigns: a town-targeted promo can never leak to an unknown location.
//
// The EXISTS keeps each campaign to a single row even when it matches on more
// than one of the shopper's geos (DISTINCT campaign). Ranked by priority then
// recency, capped at 5.
//
// Localized creative: per field, prefer the i18n override for the resolved lang
// (i18n -> lang ->> field) and fall back to the base column. Internal counters
// (impressions/clicks) and the raw i18n blob are never returned; a constant
// `sponsored: true` flag is added so the client always shows the sponsored label.
exports.listPromos = async (req, res) => {
  const lang = resolveLang(req.query.lang);
  const town = req.query.town != null && String(req.query.town).trim() !== '' ? String(req.query.town) : null;
  const village =
    req.query.village != null && String(req.query.village).trim() !== '' ? String(req.query.village) : null;
  const pincode =
    req.query.pincode != null && String(req.query.pincode).trim() !== '' ? String(req.query.pincode) : null;

  const r = await query(
    `SELECT c.id, c.style, c.glyph, c.image_url, c.advertiser,
            c.link_type, c.link_shop_id, c.link_product_id, c.link_url,
            COALESCE(c.i18n -> $1 ->> 'title', c.title) AS title,
            COALESCE(c.i18n -> $1 ->> 'offer_text', c.offer_text) AS offer_text,
            COALESCE(c.i18n -> $1 ->> 'subtitle', c.subtitle) AS subtitle
       FROM ad_campaigns c
      WHERE c.status = 'active'
        AND (c.starts_at IS NULL OR c.starts_at <= NOW())
        AND (c.ends_at IS NULL OR c.ends_at >= NOW())
        AND EXISTS (
          SELECT 1 FROM ad_targets t
           WHERE t.campaign_id = c.id
             AND (
               t.geo_type = 'all'
               OR (t.geo_type = 'town' AND $2::text IS NOT NULL
                   AND lower(btrim(t.geo_value)) = lower(btrim($2::text)))
               OR (t.geo_type = 'village' AND $3::text IS NOT NULL
                   AND lower(btrim(t.geo_value)) = lower(btrim($3::text)))
               OR (t.geo_type = 'pincode' AND $4::text IS NOT NULL
                   AND t.geo_value = $4::text)
             )
        )
      ORDER BY c.priority DESC, c.created_at DESC
      LIMIT 5`,
    [lang, town, village, pincode]
  );

  const promos = r.rows.map((row) => ({
    id: row.id,
    style: row.style,
    title: row.title,
    offer_text: row.offer_text,
    subtitle: row.subtitle,
    glyph: row.glyph,
    image_url: row.image_url,
    advertiser: row.advertiser,
    link_type: row.link_type,
    link_shop_id: row.link_shop_id,
    link_product_id: row.link_product_id,
    link_url: row.link_url,
    // Constant flag: the sponsored label is enforced client-side, but the flag is
    // always sent so the client renders it without a separate lookup.
    sponsored: true,
  }));

  res.json({ promos });
};

// POST /api/public/promos/:id/impression
// POST /api/public/promos/:id/click
//
// Best-effort, unauthenticated fire-and-forget beacons. The :id is uuid-validated
// up the route (Joi), so a malformed id is rejected 400 before this runs. We
// return 204 regardless of whether a row matched — a beacon for a paused/deleted
// campaign is silently ignored, never an error the client must handle. The
// existing /api rate limiter covers abuse.

// A guarded raw increment: bump the counter iff the campaign is active. Used by
// clicks (always) and by impressions when no viewer id is supplied (back-compat).
async function rawIncrement(column, id) {
  await query(
    `UPDATE ad_campaigns SET ${column} = ${column} + 1 WHERE id = $1 AND status = 'active'`,
    [id]
  );
}

// Optional anonymous viewer id carried by the impression beacon. A random,
// opaque, per-device token (localStorage 'skhata-vid') — no PII. Bounded so a
// hostile client cannot stuff the dedup table with giant keys.
const viewerIdSchema = Joi.string().max(64).pattern(/^[A-Za-z0-9_-]+$/);

// Extract a valid viewer id from the beacon (query ?vid= so sendBeacon can pass
// it in the URL, or body). Returns null when absent OR malformed — a bad token is
// ignored gracefully, never a 400, and the caller falls back to the raw path.
function readViewerId(req) {
  const raw = (req.query && req.query.vid) != null ? req.query.vid
    : (req.body && req.body.vid) != null ? req.body.vid
      : null;
  if (raw == null) return null;
  const { error, value } = viewerIdSchema.validate(raw);
  return error ? null : value;
}

// Impression beacon. When a viewer id is present, dedup per (campaign, viewer,
// day): insert into ad_impressions and increment ad_campaigns.impressions ONLY
// when a genuinely new row lands (rowCount === 1). A repeat within the same day
// (rowCount === 0) does not increment, so reloads no longer inflate the count. An
// unknown-campaign FK violation on the insert is swallowed. With no viewer id we
// keep the old raw increment. All paths are best-effort and always return 204.
exports.impression = async (req, res) => {
  const viewerId = readViewerId(req);
  if (viewerId) {
    let inserted = false;
    try {
      const r = await query(
        `INSERT INTO ad_impressions (campaign_id, viewer_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
        [req.params.id, viewerId]
      );
      inserted = r.rowCount === 1;
    } catch (e) {
      // A beacon for an unknown/deleted campaign trips the FK — swallow it so the
      // beacon stays a silent no-op, exactly like the raw path's guarded UPDATE.
      inserted = false;
    }
    if (inserted) await rawIncrement('impressions', req.params.id);
  } else {
    await rawIncrement('impressions', req.params.id);
  }
  res.status(204).end();
};

exports.click = async (req, res) => {
  await rawIncrement('clicks', req.params.id);
  res.status(204).end();
};

// ===========================================================================
// Owner self-serve promo placement (batch PROMO-BUY). A shop OWNER spends its
// earned Khata Credits to buy a moderated promo advertising its own store. These
// endpoints are auth('owner') scoped and mounted at /api/promos (see promos.routes).
//
// A bought promo starts status='pending_review' and only serves once an admin
// approves it (the serving query above filters status='active'), so nothing a
// shop buys reaches the marketplace unreviewed. The credit debit runs in the SAME
// transaction as the campaign insert via spendCredits, so the balance can never go
// negative and a debit can never happen without the campaign it paid for.
// ===========================================================================

// The shop's own referral_wallet balance in paise (0 when it has no wallet yet).
async function shopBalancePaise(shopId) {
  const r = await query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

// GET /api/promos/config — the live pricing + the shop's spendable balance, so
// the Boost UI can render the day picker, the live cost and the disabled state.
exports.mineConfig = async (req, res) => {
  const shopId = req.user.shopId;
  const cfg = await getShopPromoConfig();
  const balance = shopId ? await shopBalancePaise(shopId) : 0;
  res.json({
    enabled: cfg.enabled,
    credits_per_day_paise: cfg.credits_per_day_paise,
    max_days: cfg.max_days,
    balance_paise: balance,
  });
};

// The shop's localized name overrides → an ad_campaigns.i18n blob { <lang>:
// { title } }. Optional: the promo's title IS the shop name, so a localized title
// is just the localized shop name. Never throws — on any error we skip i18n.
async function buildShopNameI18n(shopId) {
  try {
    const r = await query(
      'SELECT lang, name FROM shop_name_i18n WHERE shop_id = $1',
      [shopId]
    );
    const out = {};
    for (const row of r.rows) {
      if (row.lang && row.lang !== 'en' && row.name) out[row.lang] = { title: row.name };
    }
    return out;
  } catch (_e) {
    return {};
  }
}

// The shop's own geography → ad_targets rows (pincode + village + town=city that
// the shop actually has). Falls back to a single town row = shop.city when the
// shop has no location at all. NEVER 'all' — a self-serve promo only advertises to
// the shop's own locality, never the whole district.
function shopTargets(shop) {
  const out = [];
  const town = shop.city && String(shop.city).trim() ? String(shop.city).trim() : null;
  const village = shop.village && String(shop.village).trim() ? String(shop.village).trim() : null;
  const pincode = shop.pincode && String(shop.pincode).trim() ? String(shop.pincode).trim() : null;
  if (pincode) out.push({ geo_type: 'pincode', geo_value: pincode });
  if (village) out.push({ geo_type: 'village', geo_value: village });
  if (town) out.push({ geo_type: 'town', geo_value: town });
  // No location at all → still target the shop's town (city), even if empty-ish
  // it is the single fallback row. If city is also null we cannot target anything
  // meaningful; keep the town row with whatever city holds (may be null → matches
  // nothing until the owner fills the shop's city, which is the safe outcome).
  if (out.length === 0) out.push({ geo_type: 'town', geo_value: town });
  return out;
}

// POST /api/promos/mine — buy a moderated promo placement. Validated by Joi in the
// route: { days (1..max), offer_text? (<=60), subtitle? (<=80) }.
exports.mineCreate = async (req, res) => {
  const shopId = req.user.shopId;
  if (!shopId) throw ApiError.badRequest('No shop associated with this account');

  const cfg = await getShopPromoConfig();
  if (!cfg.enabled) throw new ApiError(403, 'shop_promo_disabled', ['Self-serve promos are currently disabled']);

  const days = Number(req.body.days);
  if (!Number.isInteger(days) || days < 1 || days > cfg.max_days) {
    throw ApiError.badRequest('Validation failed', [`days must be an integer between 1 and ${cfg.max_days}`]);
  }
  const offer_text = req.body.offer_text ? String(req.body.offer_text).trim() || null : null;
  const subtitle = req.body.subtitle ? String(req.body.subtitle).trim() || null : null;

  const cost = days * cfg.credits_per_day_paise;

  const shopRow = await query(
    `SELECT id, name, city, village, pincode,
            (branded_until IS NOT NULL AND branded_until > NOW()) AS is_branded
       FROM shops WHERE id = $1`,
    [shopId]
  );
  if (!shopRow.rowCount) throw ApiError.notFound('Shop not found');
  const shop = shopRow.rows[0];

  // Branded Store priority bump (batch STORE1): while a shop's premium is active
  // (branded_until > NOW()) its self-serve promos sort a notch above non-branded
  // shops' promos (the serving query orders by priority DESC). Guarded by the
  // shop's own branded_until so it only applies while premium is live; the serving
  // query itself is unchanged.
  const priority = shop.is_branded ? 10 : 0;

  // Pre-check the balance for a clean 402 with the shortfall. The guarded debit in
  // spendCredits below is the real non-negativity guarantee (it writes nothing when
  // the balance is short), so a race between this check and the debit is safe.
  const balance = await shopBalancePaise(shopId);
  if (balance < cost) {
    throw new ApiError(402, 'insufficient_credits', [
      `Need ${cost} paise, have ${balance} paise (short ${cost - balance})`,
    ]);
  }

  const i18n = await buildShopNameI18n(shopId);
  const targets = shopTargets(shop);

  try {
    const result = await withTx(async (client) => {
      const ins = await client.query(
        `INSERT INTO ad_campaigns
           (style, title, offer_text, subtitle, glyph, i18n, advertiser,
            link_type, link_shop_id, is_seasonal, starts_at, ends_at, priority,
            status, self_serve, credits_spent_paise, created_by)
         VALUES ('shop', $1, $2, $3, '🏪', $4::jsonb, $5,
                 'shop', $6, false, NOW(), NOW() + make_interval(days => $7), $10,
                 'pending_review', true, $8, $9)
         RETURNING id, ends_at`,
        [shop.name, offer_text, subtitle, JSON.stringify(i18n), shop.name, shopId, days, cost, req.user.sub, priority]
      );
      const campaignId = ins.rows[0].id;
      for (const t of targets) {
        await client.query(
          'INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [campaignId, t.geo_type, t.geo_value]
        );
      }
      // Guarded debit IN THE SAME TRANSACTION: the campaign and the payment commit
      // together (or roll back together), and the balance can never go negative.
      await spendCredits(
        { shop: shopId, amount_paise: cost, purpose: 'redeem_promo', ref_note: `promo ${campaignId}`, created_by: req.user.sub },
        client
      );
      return { id: campaignId, ends_at: ins.rows[0].ends_at };
    });

    res.status(201).json({ id: result.id, status: 'pending_review', cost_paise: cost, ends_at: result.ends_at });
  } catch (e) {
    // A concurrent spend drained the balance between the pre-check and the debit.
    if (e && e.code === 'insufficient') {
      throw new ApiError(402, 'insufficient_credits', ['Balance changed — not enough Khata Credits']);
    }
    throw e;
  }
};

// GET /api/promos/mine — this shop's own self-serve placements, newest first.
exports.mineList = async (req, res) => {
  const shopId = req.user.shopId;
  if (!shopId) return res.json({ promos: [] });
  const r = await query(
    `SELECT id, status, offer_text, subtitle, starts_at, ends_at,
            credits_spent_paise, impressions, clicks, created_at
       FROM ad_campaigns
      WHERE self_serve = true AND link_shop_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [shopId]
  );
  res.json({
    promos: r.rows.map((row) => ({
      id: row.id,
      status: row.status,
      offer_text: row.offer_text,
      subtitle: row.subtitle,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      credits_spent_paise: row.credits_spent_paise == null ? null : Number(row.credits_spent_paise),
      impressions: Number(row.impressions) || 0,
      clicks: Number(row.clicks) || 0,
      created_at: row.created_at,
    })),
  });
};
