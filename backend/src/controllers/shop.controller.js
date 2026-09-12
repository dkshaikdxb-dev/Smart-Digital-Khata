const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { RENDER_LANGS, reseedShopName } = require('../utils/shop-name-i18n');
const { processImage, ALLOWED_IMAGE_MIMES } = require('../utils/image');
const { getBrandedStoreConfig } = require('../utils/brandedStore');
const { getStorefrontAdFreeConfig } = require('../utils/storefrontAdFree');
const { spendCredits } = require('../utils/wallet');
// Repeating new-order alert (batch ORDERALERT): live platform bounds + clamps.
const { getOrderAlertBounds, clampRepeatMinutes, clampMaxRepeats } = require('../utils/orderAlerts');
// Shop availability (batch A): the ONE definition of open/closed, the live
// platform config, and the timezone resolution. Nothing here re-implements it.
const {
  availabilityWith,
  getShopHoursConfig,
  closuresJoinSql,
  availabilityColumnsSql,
  takeAvailabilityColumns,
  todayKey,
  normalizeHm,
  resolvePauseUntil,
} = require('../utils/shopOpen');
// AI triage of an uploaded storefront photo (batch AI-MOD) — enqueue only, after commit.
const moderation = require('../services/moderation.service');

const UUID_RE = /^[0-9a-f-]{36}$/i;

// ---------------------------------------------------------------------------
// Shop availability (batch A). The owner's Home screen shows the CURRENT state
// in words and offers one-tap pause chips; Settings owns the daily hours and
// the festival closures. Everything below derives from utils/shopOpen.js, so
// the owner console, the owner app, both consumer surfaces and the order gate
// can never disagree about whether a shop is open.
// ---------------------------------------------------------------------------

// How far ahead the owner's closure list reaches. 90 days covers a festival
// calendar without turning the settings card into an archive.
const CLOSURES_WINDOW_DAYS = 90;
// How far ahead a closure may be booked. A year is generous; beyond that it is
// almost certainly a typo'd date.
const CLOSURE_MAX_DAYS_AHEAD = 365;

// The live { open, reason, reopens_at } for one shop, computed from the SAME
// helper every other surface uses (one JOIN, no N+1).
async function shopAvailability(shopId, now) {
  const at = now || new Date();
  const cfg = await getShopHoursConfig();
  const r = await query(
    `SELECT ${availabilityColumnsSql('s', 'sc')}
       FROM shops s
       ${closuresJoinSql('s', 'sc', '$2')}
      WHERE s.id = $1`,
    [shopId, todayKey(at)]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  return availabilityWith(takeAvailabilityColumns(r.rows[0]), at, cfg);
}

// The shop's upcoming closures (today .. +90 days), oldest first. `on_date` is
// returned as a plain 'YYYY-MM-DD' string so no client has to guess a timezone.
async function upcomingClosures(shopId, now) {
  const today = todayKey(now || new Date());
  const r = await query(
    `SELECT id, to_char(on_date, 'YYYY-MM-DD') AS on_date, reason
       FROM shop_closures
      WHERE shop_id = $1
        AND on_date >= $2::date
        AND on_date <= $2::date + ${CLOSURES_WINDOW_DAYS}
      ORDER BY on_date`,
    [shopId, today]
  );
  return r.rows;
}

exports.getMine = async (req, res) => {
  const r = await query('SELECT * FROM shops WHERE id = $1', [req.user.shopId]);
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  // Never leak the raw cover-image BYTEA blob in JSON (it is served as bytes via
  // GET /api/shops/:id/image); image_url/mime/updated_at stay in the payload.
  const shop = { ...r.rows[0] };
  delete shop.image_data;
  // Availability (batch A): the raw columns are already in `shop` (SELECT *);
  // the derived state and the next 90 days of closures ride along so the owner
  // Home card and the Settings hours card render from ONE request.
  const now = new Date();
  shop.availability = await shopAvailability(req.user.shopId, now);
  const closures = await upcomingClosures(req.user.shopId, now);
  res.json({ shop, closures });
};

exports.updateMine = async (req, res) => {
  // Repeating new-order alert (batch ORDERALERT): the two cadence knobs are
  // CLAMPED to the live platform bounds before they are written, so a shop can
  // never be set to hammer the owner every 10 seconds or to nag forever — and an
  // owner who types something out of band gets the nearest legal value rather
  // than an error mid-rush. Read live from platform_settings (never throws).
  const body = { ...req.body };
  if (body.order_alert_repeat_minutes !== undefined || body.order_alert_max_repeats !== undefined) {
    const bounds = await getOrderAlertBounds();
    if (body.order_alert_repeat_minutes !== undefined) {
      body.order_alert_repeat_minutes = clampRepeatMinutes(body.order_alert_repeat_minutes, bounds);
    }
    if (body.order_alert_max_repeats !== undefined) {
      body.order_alert_max_repeats = clampMaxRepeats(body.order_alert_max_repeats, bounds);
    }
  }

  // Shop availability (batch A): the daily window is a PAIR. Either both ends
  // are set or both are cleared — a one-sided window has no meaning and would
  // silently behave as "always open", so it is refused with 422
  // `hours_incomplete` rather than half-written. Values are normalized to
  // 'HH:MM' here so the stored TIME is always well-formed.
  const touchesOpen = Object.prototype.hasOwnProperty.call(body, 'open_time');
  const touchesClose = Object.prototype.hasOwnProperty.call(body, 'close_time');
  if (touchesOpen || touchesClose) {
    if (!(touchesOpen && touchesClose)) {
      throw ApiError.unprocessable('hours_incomplete', {
        hint: 'Send open_time and close_time together (or both null to clear).',
      });
    }
    const openHm = body.open_time == null || body.open_time === '' ? null : normalizeHm(body.open_time);
    const closeHm = body.close_time == null || body.close_time === '' ? null : normalizeHm(body.close_time);
    if ((openHm == null) !== (closeHm == null)) {
      throw ApiError.unprocessable('hours_incomplete', {
        hint: 'Send open_time and close_time together (or both null to clear).',
      });
    }
    body.open_time = openHm;
    body.close_time = closeHm;
  }

  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(body)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.user.shopId);
  const r = await query(
    `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
    values
  );

  // Native-language shop-name localization (batch SHOPNAME): when the owner
  // renames the shop, re-seed shop_name_i18n so the localized names track the
  // new English name. Overwrites only source='auto' rows — a language an owner
  // manually overrode (source='owner') is never clobbered. Best-effort and
  // non-blocking: a failure here never fails the rename response.
  if (Object.prototype.hasOwnProperty.call(req.body, 'name') && r.rowCount) {
    try {
      await withTx((client) => reseedShopName(client, req.user.shopId, r.rows[0].name));
    } catch (e) {
      logger.warn(`shop-name-i18n re-seed on rename failed (non-blocking): ${e.message}`);
    }
  }

  // Never leak the raw cover-image BYTEA blob in JSON (RETURNING * includes it).
  const shop = { ...r.rows[0] };
  delete shop.image_data;
  // Availability (batch A): echo the FRESH derived state so the owner's toggle
  // and hour inputs re-render from the server's answer, never from a local guess.
  shop.availability = await shopAvailability(req.user.shopId);
  res.json({ shop });
};

/**
 * POST /api/shops/me/pause — the one-tap "back in a bit" chips.
 * `{ minutes }`:
 *   0        clear the pause ("Resume now")
 *   'today'  until midnight tonight in the shop timezone ("Rest of today")
 *   n        clamped to 1..shop_pause_max_minutes (live platform setting)
 * Returns the fresh availability so the card updates from the server's truth.
 * NOT an integration credential — no typed I CONFIRM.
 */
exports.pauseShop = async (req, res) => {
  const cfg = await getShopHoursConfig();
  const until = resolvePauseUntil(req.body.minutes, cfg);
  const r = await query(
    'UPDATE shops SET paused_until = $1, updated_at = NOW() WHERE id = $2 RETURNING paused_until',
    [until, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({
    paused_until: r.rows[0].paused_until,
    pause_max_minutes: cfg.pause_max_minutes,
    availability: await shopAvailability(req.user.shopId),
  });
};

/**
 * POST /api/shops/me/closures — add (or update) a festival/holiday closure.
 * `{ on_date: 'YYYY-MM-DD', reason }`. The date must be today or later in the
 * SHOP timezone and at most a year out; re-adding the same date UPSERTs the
 * reason instead of erroring, which is what "add this date" means to an owner.
 */
exports.addClosure = async (req, res) => {
  const raw = String(req.body.on_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw ApiError.badRequest('Invalid date');

  const today = todayKey(new Date());
  if (raw < today) throw ApiError.unprocessable('closure_past', { on_date: raw, today });

  const maxDate = await query(`SELECT to_char($1::date + ${CLOSURE_MAX_DAYS_AHEAD}, 'YYYY-MM-DD') AS d`, [today]);
  if (raw > maxDate.rows[0].d) {
    throw ApiError.unprocessable('closure_too_far', { on_date: raw, max_date: maxDate.rows[0].d });
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 120) : null;
  const r = await query(
    `INSERT INTO shop_closures (shop_id, on_date, reason)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (shop_id, on_date) DO UPDATE SET reason = EXCLUDED.reason
     RETURNING id, to_char(on_date, 'YYYY-MM-DD') AS on_date, reason`,
    [req.user.shopId, raw, reason || null]
  );
  res.status(201).json({
    closure: r.rows[0],
    closures: await upcomingClosures(req.user.shopId),
    availability: await shopAvailability(req.user.shopId),
  });
};

/**
 * DELETE /api/shops/me/closures/:id — remove a closure. SHOP-SCOPED: another
 * shop's closure id is a 404, never a silent no-op and never a cross-shop write.
 */
exports.deleteClosure = async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) throw ApiError.notFound('Closure not found');
  const r = await query('DELETE FROM shop_closures WHERE id = $1 AND shop_id = $2 RETURNING id', [
    id,
    req.user.shopId,
  ]);
  if (!r.rowCount) throw ApiError.notFound('Closure not found');
  res.json({
    ok: true,
    closures: await upcomingClosures(req.user.shopId),
    availability: await shopAvailability(req.user.shopId),
  });
};

// Owner override for the native shop name (batch SHOPNAME). The auto-seeded
// values are already live via discovery; this is the human-in-loop that lets an
// owner correct a proper-noun rendering per language. Scoped to the caller's own
// shop.

// GET /api/shops/me/name-i18n — the current per-language rows for the owner's
// shop, plus the raw English name (the fallback) and the render language set.
exports.getNameI18n = async (req, res) => {
  const shop = await query('SELECT name FROM shops WHERE id = $1', [req.user.shopId]);
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');
  const rows = await query(
    `SELECT lang, name, source, needs_review, updated_at
       FROM shop_name_i18n
      WHERE shop_id = $1
      ORDER BY lang`,
    [req.user.shopId]
  );
  res.json({
    english_name: shop.rows[0].name,
    languages: RENDER_LANGS.slice(),
    names: rows.rows,
  });
};

// PUT /api/shops/me/name-i18n/:lang — set the owner-approved native name for one
// language. Marks the row source='owner', needs_review=false, so the re-seed
// path will never overwrite it. Validates lang against the render set and caps
// the length.
exports.putNameI18n = async (req, res) => {
  const lang = String(req.params.lang || '').trim().toLowerCase();
  if (!RENDER_LANGS.includes(lang)) throw ApiError.badRequest('Unsupported language');

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) throw ApiError.badRequest('Name is required');
  if (name.length > 120) throw ApiError.badRequest('Name too long (max 120)');

  const shop = await query('SELECT id FROM shops WHERE id = $1', [req.user.shopId]);
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  const r = await query(
    `INSERT INTO shop_name_i18n (shop_id, lang, name, source, needs_review, updated_at)
     VALUES ($1, $2, $3, 'owner', false, NOW())
     ON CONFLICT (shop_id, lang) DO UPDATE
       SET name = EXCLUDED.name,
           source = 'owner',
           needs_review = false,
           updated_at = NOW()
     RETURNING lang, name, source, needs_review, updated_at`,
    [req.user.shopId, lang, name]
  );
  res.json({ name: r.rows[0] });
};

// ===========================================================================
// Premium "Branded Store" (batch STORE1). A shop OWNER spends its earned Khata
// Credits to unlock, for a time-boxed window (shops.branded_until), a custom
// storefront accent + tagline, a "Premium" badge, and a small promo-priority
// bump. Owner-scoped (req.user.shopId). Another closed-loop credit sink — the
// credit debit is a guarded UPDATE in the SAME transaction as the branded_until
// extension, so the balance can never go negative and a debit never happens
// without the window it paid for. All money is integer paise.
// ===========================================================================

// The shop's own referral_wallet balance in paise (0 when it has no wallet yet).
async function shopBalancePaise(shopId) {
  const r = await query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

// GET /api/shops/me/branding — the live config + this shop's current branding
// state + spendable balance, so the owner card can render the day picker, the
// live ₹ cost, the disabled state, and the accent/tagline editor.
exports.getBranding = async (req, res) => {
  const shopId = req.user.shopId;
  const cfg = await getBrandedStoreConfig();
  const r = await query(
    `SELECT branded_until, brand_accent, brand_tagline,
            (branded_until IS NOT NULL AND branded_until > NOW()) AS is_branded
       FROM shops WHERE id = $1`,
    [shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  const row = r.rows[0];
  const balance = await shopBalancePaise(shopId);
  res.json({
    config: cfg,
    branded_until: row.branded_until,
    is_branded: row.is_branded,
    brand_accent: row.brand_accent,
    brand_tagline: row.brand_tagline,
    balance_paise: balance,
  });
};

// POST /api/shops/me/branding/activate — spend credits to unlock (or extend)
// premium for `days`. Validated by Joi in the route: { days (1..365) }; the upper
// bound is clamped again against the LIVE max_days here. 403 when the feature is
// off, 402 when the balance is short. The debit + the branded_until extension
// commit together (or roll back together).
exports.activateBranding = async (req, res) => {
  const shopId = req.user.shopId;
  if (!shopId) throw ApiError.badRequest('No shop associated with this account');

  const cfg = await getBrandedStoreConfig();
  if (!cfg.enabled) throw new ApiError(403, 'branded_store_disabled', ['Branded Store is currently disabled']);

  const days = Number(req.body.days);
  if (!Number.isInteger(days) || days < 1 || days > cfg.max_days) {
    throw ApiError.badRequest('Validation failed', [`days must be an integer between 1 and ${cfg.max_days}`]);
  }

  const cost = days * cfg.credits_per_day_paise;

  // Pre-check the balance for a clean 402 with the shortfall. The guarded debit in
  // spendCredits below is the real non-negativity guarantee (it writes nothing when
  // the balance is short), so a race between this check and the debit is safe.
  const balance = await shopBalancePaise(shopId);
  if (balance < cost) {
    throw new ApiError(402, 'insufficient_credits', [
      `Need ${cost} paise, have ${balance} paise (short ${cost - balance})`,
    ]);
  }

  try {
    const result = await withTx(async (client) => {
      // Guarded debit IN THE SAME TRANSACTION as the branded_until extension: the
      // payment and the premium window commit together, and the balance can never
      // go negative (spendCredits throws { code:'insufficient' } and writes nothing
      // when short).
      await spendCredits(
        {
          shop: shopId,
          amount_paise: cost,
          purpose: 'redeem_premium',
          ref_note: `branded store ${shopId}`,
          created_by: req.user.sub,
        },
        client
      );
      // Extend from the later of the current window end and now, so activating
      // again while already active ADDS to the remaining time rather than resetting.
      const upd = await client.query(
        `UPDATE shops
            SET branded_until = GREATEST(COALESCE(branded_until, NOW()), NOW()) + make_interval(days => $2),
                updated_at = NOW()
          WHERE id = $1
          RETURNING branded_until`,
        [shopId, days]
      );
      if (!upd.rowCount) throw ApiError.notFound('Shop not found');
      return { branded_until: upd.rows[0].branded_until };
    });
    res.json({ branded_until: result.branded_until, cost_paise: cost });
  } catch (e) {
    // A concurrent spend drained the balance between the pre-check and the debit.
    if (e && e.code === 'insufficient') {
      throw new ApiError(402, 'insufficient_credits', ['Balance changed — not enough Khata Credits']);
    }
    throw e;
  }
};

// PATCH /api/shops/me/branding — set the accent colour + tagline. Validated by Joi
// in the route ({ brand_accent: #RRGGBB|null, brand_tagline: <=80|null }). Allowed
// ANYTIME (the owner can pre-set before activating); the values are only ever shown
// publicly while branded. Only fields present in the body are changed.
exports.patchBranding = async (req, res) => {
  const shopId = req.user.shopId;
  const fields = [];
  const values = [];
  let i = 1;
  if (Object.prototype.hasOwnProperty.call(req.body, 'brand_accent')) {
    fields.push(`brand_accent = $${i++}`);
    values.push(req.body.brand_accent === '' ? null : req.body.brand_accent);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'brand_tagline')) {
    fields.push(`brand_tagline = $${i++}`);
    values.push(req.body.brand_tagline === '' ? null : req.body.brand_tagline);
  }
  if (!fields.length) {
    // Nothing to change — echo the current values so the client can re-sync.
    const cur = await query('SELECT brand_accent, brand_tagline FROM shops WHERE id = $1', [shopId]);
    if (!cur.rowCount) throw ApiError.notFound('Shop not found');
    return res.json({ brand_accent: cur.rows[0].brand_accent, brand_tagline: cur.rows[0].brand_tagline });
  }
  values.push(shopId);
  const r = await query(
    `UPDATE shops SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}
       RETURNING brand_accent, brand_tagline`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({ brand_accent: r.rows[0].brand_accent, brand_tagline: r.rows[0].brand_tagline });
};

// ===========================================================================
// Storefront ad-free buy-out (batch STOREFRONT-FULL). A shop OWNER spends its
// earned Khata Credits to keep the sponsored slide OFF its storefront slider for
// a time-boxed window (shops.storefront_ad_free_until). Mirrors the Branded Store
// activate flow EXACTLY: owner-scoped, config read LIVE from platform_settings,
// a pre-check 402, and the guarded debit in the SAME transaction as the window
// extension (so the balance can never go negative and a debit never happens
// without the window it paid for). All money is integer paise.
// ===========================================================================

// GET /api/shops/me/storefront-ad-free — the live config + this shop's current
// ad-free window + spendable balance, so the owner card can render the day
// picker, the live ₹ cost, the disabled state and the "ad-free until" line.
exports.getStorefrontAdFree = async (req, res) => {
  const shopId = req.user.shopId;
  const cfg = await getStorefrontAdFreeConfig();
  const r = await query(
    `SELECT storefront_ad_free_until,
            (storefront_ad_free_until IS NOT NULL AND storefront_ad_free_until > NOW()) AS is_ad_free
       FROM shops WHERE id = $1`,
    [shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  const balance = await shopBalancePaise(shopId);
  res.json({
    enabled: cfg.enabled,
    credits_per_day_paise: cfg.credits_per_day_paise,
    max_days: cfg.max_days,
    balance_paise: balance,
    ad_free_until: r.rows[0].storefront_ad_free_until,
    is_ad_free: r.rows[0].is_ad_free,
  });
};

// POST /api/shops/me/storefront-ad-free — spend credits to start (or extend)
// the ad-free window for `days`. Validated by Joi in the route: { days (1..365) };
// the upper bound is clamped again against the LIVE max_days here. 403 when the
// feature is off, 402 when the balance is short. The debit + the extension commit
// together (or roll back together).
exports.buyStorefrontAdFree = async (req, res) => {
  const shopId = req.user.shopId;
  if (!shopId) throw ApiError.badRequest('No shop associated with this account');

  const cfg = await getStorefrontAdFreeConfig();
  if (!cfg.enabled) {
    throw new ApiError(403, 'storefront_ad_free_disabled', ['Removing the sponsored slide is currently disabled']);
  }

  const days = Number(req.body.days);
  if (!Number.isInteger(days) || days < 1 || days > cfg.max_days) {
    throw ApiError.badRequest('Validation failed', [`days must be an integer between 1 and ${cfg.max_days}`]);
  }

  const cost = days * cfg.credits_per_day_paise;

  // Pre-check the balance for a clean 402 with the shortfall. The guarded debit in
  // spendCredits below is the real non-negativity guarantee (it writes nothing when
  // the balance is short), so a race between this check and the debit is safe.
  const balance = await shopBalancePaise(shopId);
  if (balance < cost) {
    throw new ApiError(402, 'insufficient_credits', [
      `Need ${cost} paise, have ${balance} paise (short ${cost - balance})`,
    ]);
  }

  try {
    const result = await withTx(async (client) => {
      // Guarded debit IN THE SAME TRANSACTION as the window extension.
      await spendCredits(
        {
          shop: shopId,
          amount_paise: cost,
          purpose: 'redeem_premium',
          ref_note: `storefront ad-free ${shopId}`,
          created_by: req.user.sub,
        },
        client
      );
      // Extend from the later of the current window end and now, so buying again
      // while already ad-free ADDS to the remaining time rather than resetting.
      const upd = await client.query(
        `UPDATE shops
            SET storefront_ad_free_until =
                  GREATEST(COALESCE(storefront_ad_free_until, NOW()), NOW()) + make_interval(days => $2),
                updated_at = NOW()
          WHERE id = $1
          RETURNING storefront_ad_free_until`,
        [shopId, days]
      );
      if (!upd.rowCount) throw ApiError.notFound('Shop not found');
      return { ad_free_until: upd.rows[0].storefront_ad_free_until };
    });
    res.json({ ad_free_until: result.ad_free_until, cost_paise: cost });
  } catch (e) {
    // A concurrent spend drained the balance between the pre-check and the debit.
    if (e && e.code === 'insufficient') {
      throw new ApiError(402, 'insufficient_credits', ['Balance changed — not enough Khata Credits']);
    }
    throw e;
  }
};

/**
 * Owner/staff, shop-scoped: upload the shop cover photo (multipart field
 * `image`). Validate mime, resize/compress with the shared sharp pipeline (wider
 * 1600px cover), store the processed bytes IN Postgres, and point image_url at the
 * cache-busted public serve endpoint. Mirrors product.controller.uploadImage. The
 * client ImageStudio already compresses on-device; this stays the backstop.
 */
exports.uploadImage = async (req, res) => {
  if (!req.file || !req.file.buffer || !req.file.buffer.length) {
    throw ApiError.badRequest('No image file uploaded (multipart field "image")');
  }
  if (!ALLOWED_IMAGE_MIMES.has(req.file.mimetype)) {
    throw ApiError.badRequest('Unsupported image type; allowed: JPEG, PNG, WebP');
  }

  // Shop cover is a wide header image, so allow a larger long edge than products.
  const { data, mime } = await processImage(req.file.buffer, {
    maxDim: 1600,
    quality: 80,
    fallbackMime: req.file.mimetype,
  });

  // NOW() is stable within the statement, so image_updated_at and the epoch in
  // image_url agree.
  const r = await query(
    `UPDATE shops
     SET image_data = $1,
         image_mime = $2,
         image_updated_at = NOW(),
         image_url = '/api/shops/' || id || '/image?v=' || EXTRACT(EPOCH FROM NOW())::bigint,
         updated_at = NOW()
     WHERE id = $3
     RETURNING image_url`,
    [data, mime, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({ image_url: r.rows[0].image_url });
};

// ===========================================================================
// Storefront photo gallery (batch LITE). Up to 3 owner-uploaded photos per
// shop, stored IN Postgres exactly like the single cover above and served under
// /api/shop-images/<id>. The 3-photo cap is enforced HERE, in the app — a 4th
// upload is rejected with 409 shop_images_full — not in the DB.
//
// MODERATION (batch STOREFRONT-FULL): a photo carries a status. A new upload
// starts 'pending_review' unless the shop is trusted (shops.slides_auto_publish,
// an admin toggle) in which case it is 'active' at once. Only 'active' photos are
// composed into the PUBLIC storefront (discovery.getShop); the owner list shows
// every photo with its status + the admin's review_note. The raw bytes stay
// servable by id regardless of status (the id is an unguessable UUID and the
// admin review queue needs to render the pending photo).
// ===========================================================================

// Hard cap of photos per shop (spec §1/§2). Enforced in the app, not the schema.
const MAX_SHOP_IMAGES = 3;

// Cache-busted public URL for a gallery image row. The epoch comes from
// updated_at so an owner re-uploading (a future feature) would bust the cache;
// today rows are immutable once created, so it is stable per row.
function galleryImageUrl(id, updatedAt) {
  const epoch = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
  return `/api/shop-images/${id}?v=${epoch}`;
}

/**
 * Owner/staff, shop-scoped: list this shop's storefront photos ordered by
 * position. Never returns the raw BYTEA — only { id, url, position, status,
 * review_note } with a cache-busted url pointing at the public serve endpoint.
 * Every photo is listed regardless of moderation status so the owner can see
 * what is pending / live / rejected (and why).
 */
exports.listImages = async (req, res) => {
  const r = await query(
    `SELECT id, position, updated_at, status, review_note
       FROM shop_images
      WHERE shop_id = $1
      ORDER BY position, updated_at, id`,
    [req.user.shopId]
  );
  const images = r.rows.map((row) => ({
    id: row.id,
    url: galleryImageUrl(row.id, row.updated_at),
    position: row.position,
    status: row.status,
    review_note: row.review_note || null,
  }));
  res.json({ images });
};

/**
 * Owner/staff, shop-scoped: add one storefront photo (multipart field `image`,
 * SAME multer config as the cover). Runs the SAME sharp pipeline as the cover,
 * stores the processed bytes IN Postgres at the next position, and returns the
 * new { id, url, position }. Rejects with 409 shop_images_full once the shop
 * already has MAX_SHOP_IMAGES photos. The count + insert run in one transaction
 * so two concurrent uploads can't both slip past the cap.
 */
exports.uploadGalleryImage = async (req, res) => {
  if (!req.file || !req.file.buffer || !req.file.buffer.length) {
    throw ApiError.badRequest('No image file uploaded (multipart field "image")');
  }
  if (!ALLOWED_IMAGE_MIMES.has(req.file.mimetype)) {
    throw ApiError.badRequest('Unsupported image type; allowed: JPEG, PNG, WebP');
  }

  // Same pipeline as the cover: wide long edge (storefront header), WebP, sharp
  // backstop even though the client ImageStudio already compressed on-device.
  const { data, mime } = await processImage(req.file.buffer, {
    maxDim: 1600,
    quality: 80,
    fallbackMime: req.file.mimetype,
  });

  const created = await withTx(async (client) => {
    // Lock the owning shop row so a concurrent upload for the same shop
    // serializes behind us — the cap check below then sees a stable count. The
    // same read gives us the trust toggle that decides the initial status.
    const shop = await client.query(
      'SELECT id, slides_auto_publish FROM shops WHERE id = $1 FOR UPDATE',
      [req.user.shopId]
    );
    if (!shop.rowCount) throw ApiError.notFound('Shop not found');

    const cnt = await client.query('SELECT COUNT(*)::int AS n FROM shop_images WHERE shop_id = $1', [
      req.user.shopId,
    ]);
    if (cnt.rows[0].n >= MAX_SHOP_IMAGES) {
      throw ApiError.conflict('shop_images_full', [`A shop can have at most ${MAX_SHOP_IMAGES} photos`]);
    }

    // Moderation: a trusted shop (slides_auto_publish) goes live at once; every
    // other upload waits for an admin in 'pending_review'.
    const status = shop.rows[0].slides_auto_publish === true ? 'active' : 'pending_review';

    const ins = await client.query(
      `INSERT INTO shop_images (shop_id, position, mime, data, updated_at, status)
       VALUES ($1,
               COALESCE((SELECT MAX(position) + 1 FROM shop_images WHERE shop_id = $1), 0),
               $2, $3, NOW(), $4)
       RETURNING id, position, updated_at, status`,
      [req.user.shopId, mime, data, status]
    );
    return ins.rows[0];
  });

  // AI triage (batch AI-MOD): a photo that landed in the review queue gets a
  // moderation job — enqueued AFTER the transaction above committed (the job
  // reads the committed row), fire-and-forget (an enqueue failure never fails
  // the upload; the photo just waits for a human). A trusted shop's photo is
  // already live and is not triaged.
  if (created.status === 'pending_review') moderation.enqueueShopImage(created.id);

  res.status(201).json({
    id: created.id,
    url: galleryImageUrl(created.id, created.updated_at),
    position: created.position,
    status: created.status,
    review_note: null,
  });
};

/**
 * Owner/staff, shop-scoped: delete one storefront photo. Scoped to the caller's
 * shop — deleting a row that belongs to another shop (or does not exist) 404s.
 * Renumbers the remaining photos to stay 0..n-1 so positions never gap.
 */
exports.deleteImage = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Image not found');

  await withTx(async (client) => {
    const del = await client.query(
      'DELETE FROM shop_images WHERE id = $1 AND shop_id = $2 RETURNING id',
      [id, req.user.shopId]
    );
    if (!del.rowCount) throw ApiError.notFound('Image not found');
    // Compact positions to 0..n-1 (ordered by the old position) so the gallery
    // never carries a gap after a middle photo is removed.
    await client.query(
      `WITH ordered AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position, updated_at, id) - 1 AS rn
           FROM shop_images WHERE shop_id = $1
       )
       UPDATE shop_images s SET position = ordered.rn
         FROM ordered WHERE s.id = ordered.id AND s.position <> ordered.rn`,
      [req.user.shopId]
    );
  });

  res.json({ ok: true });
};

/**
 * PUBLIC (no auth): stream a storefront gallery photo by its own id. Mirrors
 * serveImage (the single cover): long immutable cache (callers use the
 * cache-busted ?v= URL), cross-origin CORP so the storefront can <img> it, and
 * an ETag for 304s. 404 when the id is malformed or the row is gone.
 */
exports.serveGalleryImage = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Image not found');

  const r = await query('SELECT mime, data, updated_at FROM shop_images WHERE id = $1', [id]);
  if (!r.rowCount || !r.rows[0].data) throw ApiError.notFound('Image not found');

  const { mime, data, updated_at: updatedAt } = r.rows[0];
  const epoch = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
  const etag = `"shopimg-${id}-${epoch}"`;

  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('ETag', etag);
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.set('Content-Type', mime || 'application/octet-stream');
  return res.send(data);
};

/**
 * PUBLIC (no auth): stream a shop's stored cover image so the storefront header
 * can embed it. Mirrors product.controller.serveImage — long immutable cache is
 * safe because callers use the cache-busted ?v= URL; CORP is relaxed to
 * cross-origin so the storefront (possibly a different origin) can <img> it.
 * 404 when the shop has no cover.
 */
exports.serveImage = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Image not found');

  const r = await query(
    'SELECT image_data, image_mime, image_updated_at FROM shops WHERE id = $1',
    [id]
  );
  if (!r.rowCount || !r.rows[0].image_data) throw ApiError.notFound('Image not found');

  const { image_data: imageData, image_mime: imageMime, image_updated_at: updatedAt } = r.rows[0];
  const epoch = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
  const etag = `"shop-${id}-${epoch}"`;

  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('ETag', etag);
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.set('Content-Type', imageMime || 'application/octet-stream');
  return res.send(imageData);
};
