const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { RENDER_LANGS, reseedShopName } = require('../utils/shop-name-i18n');
const { processImage, ALLOWED_IMAGE_MIMES } = require('../utils/image');

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
