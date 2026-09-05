const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { withTx, query } = require('../config/db');
const ApiError = require('../utils/ApiError');

const SALT = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, shopId: user.shop_id || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

exports.register = async (req, res) => {
  const { name, email, phone, password, shopName } = req.body;

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) throw ApiError.conflict('Email already registered');

  const hash = await bcrypt.hash(password, SALT);

  const result = await withTx(async (client) => {
    const userRes = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,'owner')
       RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone, hash]
    );
    const user = userRes.rows[0];

    const shopRes = await client.query(
      `INSERT INTO shops (owner_id, name, notification_mode, plan)
       VALUES ($1,$2,'smart','free')
       RETURNING id, name, notification_mode, plan`,
      [user.id, shopName]
    );
    const shop = shopRes.rows[0];

    await client.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shop.id, user.id]);

    return { user: { ...user, shop_id: shop.id }, shop };
  });

  const token = signToken(result.user);
  res.status(201).json({ token, user: result.user, shop: result.shop });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  // The `email` field carries either an email (owner/admin) or a phone number
  // (staff created by phone). Resolve the login user from it:
  //  1) exact email match (lowercased) — the unchanged owner/admin path;
  //  2) otherwise, an active login user whose phone matches the raw identifier.
  const identifier = (email || '').trim();
  const cols = 'id, name, email, phone, password_hash, role, shop_id, is_active';

  // Case-insensitive email match: any identifier that previously matched
  // `email = $1` exactly still matches here, so no existing login regresses.
  let r = await query(
    `SELECT ${cols} FROM users WHERE LOWER(email) = LOWER($1)`,
    [identifier]
  );

  if (!r.rowCount) {
    // Phone fallback — only among login roles, preferring active rows so a
    // deactivated duplicate never shadows a live account.
    const byPhone = await query(
      `SELECT ${cols} FROM users
       WHERE phone = $1 AND role IN ('owner','staff','admin')
       ORDER BY is_active DESC, created_at ASC`,
      [identifier]
    );
    const activeMatches = byPhone.rows.filter((u) => u.is_active);
    if (activeMatches.length > 1) {
      // Defensive: two live accounts share this phone — force email sign-in.
      throw ApiError.badRequest('Multiple accounts use this phone; sign in with email.');
    }
    if (byPhone.rowCount) {
      r = { rowCount: 1, rows: [activeMatches[0] || byPhone.rows[0]] };
    }
  }

  if (!r.rowCount) throw ApiError.unauthorized('Invalid credentials');

  const user = r.rows[0];

  // A disabled account cannot sign in (staff deactivated, or a suspended login).
  if (user.is_active === false) {
    throw ApiError.forbidden('This account has been disabled.');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  // Block sign-in for owners whose shop has been suspended by the platform.
  if (user.role === 'owner' && user.shop_id) {
    const s = await query('SELECT status FROM shops WHERE id = $1', [user.shop_id]);
    if (s.rowCount && s.rows[0].status === 'suspended') {
      throw ApiError.forbidden('This account is suspended. Please contact support.');
    }
  }

  delete user.password_hash;
  const token = signToken(user);
  res.json({ token, user });
};

exports.me = async (req, res) => {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id, u.is_active,
            s.name AS shop_name, s.plan, s.notification_mode
     FROM users u LEFT JOIN shops s ON s.id = u.shop_id
     WHERE u.id = $1`,
    [req.user.sub]
  );
  if (!r.rowCount) throw ApiError.notFound('User not found');
  res.json({ user: r.rows[0] });
};
