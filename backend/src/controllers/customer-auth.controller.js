const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');

const SALT = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const OTP_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 5;

function signToken(customerUser) {
  // Customer tokens carry role 'customer' and NO shopId, so they can never
  // satisfy the owner/staff/admin gate on shop-scoped endpoints.
  return jwt.sign(
    { sub: customerUser.id, role: 'customer', phone: customerUser.phone },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

exports.requestOtp = async (req, res) => {
  const phone = toE164(req.body.phone);

  // 6-digit code, cryptographically random.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, SALT);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Replace any prior OTP for this phone so only the latest code is valid.
  await query('DELETE FROM customer_otps WHERE phone = $1', [phone]);
  await query(
    `INSERT INTO customer_otps (phone, code_hash, expires_at)
     VALUES ($1,$2,$3)`,
    [phone, codeHash, expiresAt]
  );

  await whatsapp.sendText(
    phone,
    `Your Smart Digital Khata login code is ${code}. It expires in 5 minutes.`
  );

  const body = { ok: true };
  // For testability only — never leak the code in production.
  if (process.env.NODE_ENV !== 'production') body.dev_code = code;
  res.json(body);
};

exports.verifyOtp = async (req, res) => {
  const phone = toE164(req.body.phone);
  const { code } = req.body;

  const r = await query(
    `SELECT id, code_hash, expires_at, attempts
     FROM customer_otps WHERE phone = $1
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  if (!r.rowCount) throw ApiError.unauthorized('Invalid or expired code');

  const otp = r.rows[0];

  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await query('DELETE FROM customer_otps WHERE id = $1', [otp.id]);
    throw ApiError.unauthorized('Invalid or expired code');
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    throw ApiError.unauthorized('Too many attempts, please request a new code');
  }

  const ok = await bcrypt.compare(code, otp.code_hash);
  if (!ok) {
    await query('UPDATE customer_otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw ApiError.unauthorized('Invalid or expired code');
  }

  // Success — upsert the customer_user by phone, seeding name from any matching
  // customers row, then invalidate the OTP.
  const nameRes = await query(
    `SELECT name FROM customers WHERE phone = $1 AND name IS NOT NULL
     ORDER BY created_at ASC LIMIT 1`,
    [phone]
  );
  const seedName = nameRes.rowCount ? nameRes.rows[0].name : null;

  const upsert = await query(
    `INSERT INTO customer_users (phone, name, last_login_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone) DO UPDATE
       SET last_login_at = NOW(),
           name = COALESCE(customer_users.name, EXCLUDED.name)
     RETURNING id, phone, name, created_at, last_login_at`,
    [phone, seedName]
  );
  const customerUser = upsert.rows[0];

  await query('DELETE FROM customer_otps WHERE phone = $1', [phone]);

  const token = signToken(customerUser);
  res.json({ token, customer_user: customerUser });
};

exports.me = async (req, res) => {
  const r = await query(
    'SELECT id, phone, name, created_at, last_login_at FROM customer_users WHERE id = $1',
    [req.customerUser.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  const customerUser = r.rows[0];

  // Every distinct shop where a customers row shares this phone, with that
  // shop's name and the customer's balance there. Foundation for cross-shop
  // khata — matched by phone at query time.
  const shops = await query(
    `SELECT c.shop_id, s.name AS shop_name, c.id AS customer_id, c.balance
     FROM customers c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.phone = $1
     ORDER BY s.name ASC`,
    [customerUser.phone]
  );

  res.json({ customer_user: customerUser, shops: shops.rows });
};
