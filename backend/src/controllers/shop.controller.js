const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { RENDER_LANGS, reseedShopName } = require('../utils/shop-name-i18n');

exports.getMine = async (req, res) => {
  const r = await query('SELECT * FROM shops WHERE id = $1', [req.user.shopId]);
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  res.json({ shop: r.rows[0] });
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

  res.json({ shop: r.rows[0] });
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
