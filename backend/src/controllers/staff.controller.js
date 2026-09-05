const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Reuse the same salt cost as owner registration so staff hashes are identical
// in shape and verify with the same bcrypt.compare in the login path.
const SALT = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

// Columns safe to return — never the password hash.
const STAFF_COLS = 'id, name, phone, email, is_active, created_at';

/**
 * List the calling owner's staff (role='staff' in their shop). Owner-scoped:
 * an owner can never see another shop's users, nor owner/admin rows.
 */
exports.list = async (req, res) => {
  const r = await query(
    `SELECT ${STAFF_COLS} FROM users
     WHERE role = 'staff' AND shop_id = $1
     ORDER BY created_at DESC, id DESC`,
    [req.user.shopId]
  );
  res.json({ items: r.rows });
};

/**
 * Create a staff login in the owner's shop. Phone must be globally unique across
 * ALL users; email, if given, must also be unused.
 */
exports.create = async (req, res) => {
  const { name, phone, password } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : null;
  const cleanPhone = phone.trim();

  const phoneClash = await query('SELECT 1 FROM users WHERE phone = $1', [cleanPhone]);
  if (phoneClash.rowCount) throw ApiError.conflict('Phone already in use');

  if (email) {
    const emailClash = await query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email]);
    if (emailClash.rowCount) throw ApiError.conflict('Email already in use');
  }

  const hash = await bcrypt.hash(password, SALT);

  const r = await query(
    `INSERT INTO users (name, email, phone, password_hash, role, shop_id, is_active)
     VALUES ($1,$2,$3,$4,'staff',$5,true)
     RETURNING ${STAFF_COLS}`,
    [name.trim(), email, cleanPhone, hash, req.user.shopId]
  );
  res.status(201).json({ staff: r.rows[0] });
};

/**
 * Update one of the owner's staff: name, password (re-hashed), and/or is_active.
 * Scoped to id + shop_id + role='staff' so an owner can never touch another
 * shop's users or owner/admin rows (404 otherwise).
 */
exports.update = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;

  if (req.body.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(req.body.name.trim());
  }
  if (req.body.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(req.body.is_active);
  }
  if (req.body.password !== undefined) {
    const hash = await bcrypt.hash(req.body.password, SALT);
    fields.push(`password_hash = $${i++}`);
    values.push(hash);
  }

  if (!fields.length) throw ApiError.badRequest('No updatable fields provided');

  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i} AND role = 'staff'
     RETURNING ${STAFF_COLS}`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Staff not found');
  res.json({ staff: r.rows[0] });
};

/**
 * Hard-delete one of the owner's staff. Owner may prefer deactivate; both allowed.
 */
exports.remove = async (req, res) => {
  const r = await query(
    `DELETE FROM users WHERE id = $1 AND shop_id = $2 AND role = 'staff'`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Staff not found');
  res.json({ ok: true });
};
