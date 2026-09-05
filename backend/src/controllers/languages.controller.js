const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Language activation registry (Phase B). The `languages` table decides which
// languages are SHOWN in the app; the frontend dict
// (admin-dashboard/src/lib/i18n.js) still holds the string catalog and a
// built-in fallback list. Activating a staged language is one PATCH — no code
// deploy — and it degrades gracefully to English until its strings are supplied.

const AUDIT_STATUSES = ['pending', 'in_review', 'audited'];
const CODE_RE = /^[a-z]{2,8}$/; // ISO-ish short code, lowercase letters only
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUBLIC — no auth. The picker/gate fetch this to know which languages to show.
// Only ACTIVE languages, minimal fields, ordered by sort_order. Cache-friendly.
exports.publicList = async (_req, res) => {
  const r = await query(
    `SELECT code, label, english_name, rtl, sort_order
       FROM languages
      WHERE is_active = true
      ORDER BY sort_order, code`
  );
  // Cheap to serve; activations show within ~a minute.
  res.set('Cache-Control', 'public, max-age=60');
  // The storefront may be a different origin than the API (Helmet's default
  // CORP is same-origin) — same reason the overrides endpoint relaxes CORP.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.json({ languages: r.rows });
};

// ADMIN — every row, including inactive/staged ones and activation provenance.
exports.adminList = async (_req, res) => {
  const r = await query(
    `SELECT code, label, english_name, rtl, is_active, audit_status,
            sort_order, activated_at, activated_by, created_at, updated_at
       FROM languages
      ORDER BY sort_order, code`
  );
  return res.json({ languages: r.rows });
};

// ADMIN — the one-button activate/deactivate (plus staged-row edits). Setting
// is_active=true stamps activated_at/by; validated enum; 404 unknown code.
exports.adminUpdate = async (req, res) => {
  const code = String(req.params.code || '');
  const body = req.body || {};

  const fields = [];
  const values = [];
  let i = 1;

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw ApiError.badRequest('is_active must be boolean');
    fields.push(`is_active = $${i++}`);
    values.push(body.is_active);
    if (body.is_active) {
      // The one button: turning a language on records who/when.
      fields.push(`activated_at = NOW()`);
      // req.user.sub is the admin user id (UUID). Guard so a non-UUID token
      // subject can never 500 the activation — store NULL instead.
      const sub = req.user && req.user.sub;
      fields.push(`activated_by = $${i++}`);
      values.push(UUID_RE.test(String(sub || '')) ? sub : null);
    }
  }

  if (body.audit_status !== undefined) {
    if (!AUDIT_STATUSES.includes(body.audit_status)) {
      throw ApiError.badRequest('Invalid audit_status');
    }
    fields.push(`audit_status = $${i++}`);
    values.push(body.audit_status);
  }

  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isInteger(n)) throw ApiError.badRequest('sort_order must be an integer');
    fields.push(`sort_order = $${i++}`);
    values.push(n);
  }

  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || body.label.trim() === '' || body.label.length > 100) {
      throw ApiError.badRequest('Invalid label');
    }
    fields.push(`label = $${i++}`);
    values.push(body.label.trim());
  }

  if (body.english_name !== undefined) {
    if (typeof body.english_name !== 'string' || body.english_name.trim() === '' || body.english_name.length > 100) {
      throw ApiError.badRequest('Invalid english_name');
    }
    fields.push(`english_name = $${i++}`);
    values.push(body.english_name.trim());
  }

  if (body.rtl !== undefined) {
    if (typeof body.rtl !== 'boolean') throw ApiError.badRequest('rtl must be boolean');
    fields.push(`rtl = $${i++}`);
    values.push(body.rtl);
  }

  if (!fields.length) throw ApiError.badRequest('Nothing to update');

  values.push(code);
  const r = await query(
    `UPDATE languages SET ${fields.join(', ')}, updated_at = NOW()
      WHERE code = $${i}
      RETURNING code, label, english_name, rtl, is_active, audit_status,
                sort_order, activated_at, activated_by, created_at, updated_at`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Language not found');
  return res.json({ language: r.rows[0] });
};

// ADMIN — pre-stage a brand-new state language (inactive, pending). Rejects a
// duplicate code (409). The admin flips it on later, after a native audit.
exports.adminCreate = async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toLowerCase();

  if (!CODE_RE.test(code)) throw ApiError.badRequest('Invalid code (2–8 lowercase letters)');
  if (typeof b.label !== 'string' || b.label.trim() === '' || b.label.length > 100) {
    throw ApiError.badRequest('Invalid label');
  }
  if (typeof b.english_name !== 'string' || b.english_name.trim() === '' || b.english_name.length > 100) {
    throw ApiError.badRequest('Invalid english_name');
  }
  const rtl = b.rtl === undefined ? false : b.rtl;
  if (typeof rtl !== 'boolean') throw ApiError.badRequest('rtl must be boolean');
  const sortOrder = b.sort_order === undefined ? 100 : Number(b.sort_order);
  if (!Number.isInteger(sortOrder)) throw ApiError.badRequest('sort_order must be an integer');

  const exists = await query('SELECT 1 FROM languages WHERE code = $1', [code]);
  if (exists.rowCount) throw ApiError.conflict('Language code already exists');

  const r = await query(
    `INSERT INTO languages (code, label, english_name, rtl, is_active, audit_status, sort_order)
     VALUES ($1, $2, $3, $4, false, 'pending', $5)
     RETURNING code, label, english_name, rtl, is_active, audit_status,
               sort_order, activated_at, activated_by, created_at, updated_at`,
    [code, b.label.trim(), b.english_name.trim(), rtl, sortOrder]
  );
  return res.status(201).json({ language: r.rows[0] });
};
