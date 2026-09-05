const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Personal profile for a shop-side login user (owner/staff/admin). This is the
// person's OWN account — always scoped to req.user.sub — and is distinct from
// the shop record (see shop.controller.js). PII (email/gender/date_of_birth) is
// optional and privacy-first; role/shop_id/password can never be changed here.

const PROFILE_COLS = 'id, name, email, phone, role, gender, date_of_birth';

exports.getProfile = async (req, res) => {
  const r = await query(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [req.user.sub]);
  if (!r.rowCount) throw ApiError.notFound('Account not found');
  res.json({ profile: r.rows[0] });
};

// Only these fields are ever writable here. Anything else in the body has
// already been stripped by Joi, but the whitelist is the real guard.
const EDITABLE = ['name', 'email', 'phone', 'gender', 'date_of_birth'];

exports.updateProfile = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      // An empty email must become NULL: Postgres UNIQUE treats '' as a real
      // value (so two blank emails would clash) but permits many NULLs.
      let v = req.body[k];
      if (k === 'email' && v === '') v = null;
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  if (!fields.length) {
    const cur = await query(`SELECT ${PROFILE_COLS} FROM users WHERE id = $1`, [req.user.sub]);
    return res.json({ profile: cur.rows[0] });
  }
  values.push(req.user.sub);
  try {
    const r = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING ${PROFILE_COLS}`,
      values
    );
    if (!r.rowCount) throw ApiError.notFound('Account not found');
    res.json({ profile: r.rows[0] });
  } catch (err) {
    // Email stays UNIQUE across all login users.
    if (err && err.code === '23505') {
      throw ApiError.conflict('That email is already in use');
    }
    throw err;
  }
};
