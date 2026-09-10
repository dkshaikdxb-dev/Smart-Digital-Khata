const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { RENDER_LANGS, reseedShopName } = require('../utils/shop-name-i18n');
const { processImage, ALLOWED_IMAGE_MIMES } = require('../utils/image');
const { getBrandedStoreConfig } = require('../utils/brandedStore');
const { spendCredits } = require('../utils/wallet');

const UUID_RE = /^[0-9a-f-]{36}$/i;

exports.getMine = async (req, res) => {
  const r = await query('SELECT * FROM shops WHERE id = $1', [req.user.shopId]);
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  // Never leak the raw cover-image BYTEA blob in JSON (it is served as bytes via
  // GET /api/shops/:id/image); image_url/mime/updated_at stay in the payload.
  const shop = { ...r.rows[0] };
  delete shop.image_data;
  res.json({ shop });
};

exports.updateMine = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(req.body)) {
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
  res.json({ shop });
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
