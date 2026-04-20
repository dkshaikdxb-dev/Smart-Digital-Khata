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

  const r = await query(
    'SELECT id, name, email, phone, password_hash, role, shop_id FROM users WHERE email = $1',
    [email]
  );
  if (!r.rowCount) throw ApiError.unauthorized('Invalid credentials');

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  delete user.password_hash;
  const token = signToken(user);
  res.json({ token, user });
};

exports.me = async (req, res) => {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.shop_id,
            s.name AS shop_name, s.plan, s.notification_mode
     FROM users u LEFT JOIN shops s ON s.id = u.shop_id
     WHERE u.id = $1`,
    [req.user.sub]
  );
  if (!r.rowCount) throw ApiError.notFound('User not found');
  res.json({ user: r.rows[0] });
};
