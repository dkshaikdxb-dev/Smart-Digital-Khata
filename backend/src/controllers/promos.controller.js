const { query } = require('../config/db');

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
// Best-effort, unauthenticated fire-and-forget beacons. O(1): a single guarded
// increment, no reads beyond the update. The :id is uuid-validated up the route
// (Joi), so a malformed id is rejected 400 before this runs. We return 204
// regardless of whether a row matched — a beacon for a paused/deleted campaign is
// silently ignored, never an error the client must handle. The existing /api rate
// limiter covers abuse. (No per-viewer dedup in v1 — a future refinement.)
function beacon(column) {
  return async (req, res) => {
    await query(
      `UPDATE ad_campaigns SET ${column} = ${column} + 1 WHERE id = $1 AND status = 'active'`,
      [req.params.id]
    );
    res.status(204).end();
  };
}

// `column` is a fixed identifier chosen here (never user input), safe to inline.
exports.impression = beacon('impressions');
exports.click = beacon('clicks');
