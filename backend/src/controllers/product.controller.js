const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// sharp is loaded lazily/defensively: if the native binary is unavailable at
// runtime (e.g. an unexpected build), we fall back to storing original bytes.
let sharp = null;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (_e) {
  sharp = null;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID_RE = /^[0-9a-f-]{36}$/i;

// Columns safe to return in JSON — never the raw image_data BYTEA blob.
const PRODUCT_PUBLIC_COLS =
  'id, shop_id, name, description, price, unit, sold_by_weight, is_active, image_url, image_mime, image_updated_at, created_at, updated_at';

exports.list = async (req, res) => {
  const search = (req.query.search || '').trim();
  const activeOnly = req.query.active === 'true';

  const params = [req.user.shopId];
  let where = 'shop_id = $1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND name ILIKE $${params.length}`;
  }
  if (activeOnly) {
    where += ' AND is_active = true';
  }
  const r = await query(
    `SELECT id, name, description, price, unit, sold_by_weight, is_active, image_url, created_at, updated_at
     FROM products WHERE ${where}
     ORDER BY created_at DESC, id DESC`,
    params
  );
  res.json({ items: r.rows });
};

exports.create = async (req, res) => {
  const { name, price = 0, description = null, image_url = null } = req.body;
  const soldByWeight = req.body.sold_by_weight === true;
  // A loose/weighed item is priced per KG, so its unit is forced to 'kg'
  // regardless of what was sent — the server stays the authority on this.
  const unit = soldByWeight ? 'kg' : (req.body.unit || 'unit');
  const r = await query(
    `INSERT INTO products (shop_id, name, price, description, unit, sold_by_weight, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [req.user.shopId, name, price, description, unit, soldByWeight, image_url]
  );
  res.status(201).json({ product: r.rows[0] });
};

exports.get = async (req, res) => {
  const r = await query(
    `SELECT ${PRODUCT_PUBLIC_COLS} FROM products WHERE id = $1 AND shop_id = $2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};

exports.update = async (req, res) => {
  // Turning a product into a loose/weighed one forces unit='kg' (price is per KG).
  if (req.body.sold_by_weight === true) req.body.unit = 'kg';
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(req.body)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING *`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};

exports.remove = async (req, res) => {
  const r = await query(
    'DELETE FROM products WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ ok: true });
};

/**
 * Public, unauthenticated: a shop's browsable catalog. Active products only,
 * minimal fields — no inactive products, no other shops' data.
 */
exports.publicCatalog = async (req, res) => {
  const { shopId } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(shopId)) throw ApiError.notFound('Shop not found');

  const shop = await query('SELECT name FROM shops WHERE id = $1', [shopId]);
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  const r = await query(
    `SELECT id, name, description, price, unit, image_url
     FROM products WHERE shop_id = $1 AND is_active = true
     ORDER BY created_at DESC, id DESC`,
    [shopId]
  );
  res.json({ shop_name: shop.rows[0].name, products: r.rows });
};

/**
 * Owner/staff, shop-scoped: upload a single product photo (multipart field
 * `image`). Validate mime, resize/compress with sharp for weak rural networks,
 * store the processed bytes IN Postgres, and point image_url at the (cache-
 * busted) serve endpoint. Never returns the raw bytes in JSON.
 */
exports.uploadImage = async (req, res) => {
  if (!req.file || !req.file.buffer || !req.file.buffer.length) {
    throw ApiError.badRequest('No image file uploaded (multipart field "image")');
  }
  if (!ALLOWED_IMAGE_MIMES.has(req.file.mimetype)) {
    throw ApiError.badRequest('Unsupported image type; allowed: JPEG, PNG, WebP');
  }

  // Key bandwidth win: downscale to <=800px long edge and re-encode as webp.
  // If sharp is unavailable at runtime, fall back to the original bytes.
  let data = req.file.buffer;
  let mime = req.file.mimetype;
  if (sharp) {
    try {
      data = await sharp(req.file.buffer)
        .rotate() // honour EXIF orientation
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      mime = 'image/webp';
    } catch (_e) {
      // Corrupt/unsupported payload for sharp, or missing binary — keep original.
      data = req.file.buffer;
      mime = req.file.mimetype;
    }
  }

  // NOW() is stable within the statement, so image_updated_at and the epoch in
  // image_url agree. Cross-shop uploads yield rowCount 0 -> 404.
  const r = await query(
    `UPDATE products
     SET image_data = $1,
         image_mime = $2,
         image_updated_at = NOW(),
         image_url = '/api/products/' || id || '/image?v=' || EXTRACT(EPOCH FROM NOW())::bigint,
         updated_at = NOW()
     WHERE id = $3 AND shop_id = $4
     RETURNING ${PRODUCT_PUBLIC_COLS}`,
    [data, mime, req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};

/**
 * PUBLIC (no auth, no shop scope): stream a product's stored image so consumers
 * can browse listed shops. Long immutable cache is safe because callers use the
 * cache-busted ?v= URL. 404 when the product has no image.
 */
exports.serveImage = async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) throw ApiError.notFound('Image not found');

  const r = await query(
    'SELECT image_data, image_mime, image_updated_at FROM products WHERE id = $1',
    [id]
  );
  if (!r.rowCount || !r.rows[0].image_data) throw ApiError.notFound('Image not found');

  const { image_data: imageData, image_mime: imageMime, image_updated_at: updatedAt } = r.rows[0];
  const epoch = updatedAt ? Math.floor(new Date(updatedAt).getTime() / 1000) : 0;
  const etag = `"${id}-${epoch}"`;

  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('ETag', etag);
  // These are PUBLIC product photos meant to be embedded as <img> anywhere
  // (the storefront may be served from a different origin than the API, e.g.
  // a CDN or subdomain). Helmet's default CORP is same-origin, which would
  // block a cross-origin <img> even though fetch() still works — so relax CORP
  // for this one public, non-sensitive image response.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }
  res.set('Content-Type', imageMime || 'application/octet-stream');
  return res.send(imageData);
};

/**
 * Owner/staff, shop-scoped: clear a product's stored image (and its URL).
 */
exports.deleteImage = async (req, res) => {
  const r = await query(
    `UPDATE products
     SET image_data = NULL,
         image_mime = NULL,
         image_url = NULL,
         image_updated_at = NULL,
         updated_at = NOW()
     WHERE id = $1 AND shop_id = $2
     RETURNING ${PRODUCT_PUBLIC_COLS}`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Product not found');
  res.json({ product: r.rows[0] });
};
