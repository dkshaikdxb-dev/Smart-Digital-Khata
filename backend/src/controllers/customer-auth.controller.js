const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');
const { captureReferral } = require('../utils/referral');

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
     RETURNING id, phone, name, status, created_at, last_login_at, (xmax = 0) AS inserted`,
    [phone, seedName]
  );
  const customerUser = upsert.rows[0];
  // (xmax = 0) is true only for the row this statement INSERTed — i.e. a brand
  // new consumer. Referral capture happens only on first login, never on repeat
  // sign-ins, so a returning consumer can never be re-attributed.
  const isNewCustomer = customerUser.inserted === true;
  delete customerUser.inserted;

  // A platform-blocked consumer cannot complete login even with a valid code.
  // The OTP is still consumed above via the upsert path below, so a blocked
  // account can't accumulate live codes.
  if (customerUser.status === 'blocked') {
    await query('DELETE FROM customer_otps WHERE phone = $1', [phone]);
    throw ApiError.forbidden('This account has been blocked. Contact support.');
  }

  await query('DELETE FROM customer_otps WHERE phone = $1', [phone]);

  // Onboarding-source attribution (Phase D). Only a NEW consumer is attributed,
  // and only best-effort — a missing/invalid/self/duplicate code never affects
  // the login.
  if (isNewCustomer && req.body.ref) {
    await captureReferral({
      code: req.body.ref,
      referredType: 'customer',
      referredCustomerId: customerUser.id,
      sourceChannel: req.body.source_channel,
    });
  }

  const token = signToken(customerUser);
  res.json({ token, customer_user: customerUser });
};

exports.me = async (req, res) => {
  const r = await query(
    `SELECT id, phone, name, email, gender, date_of_birth, status, created_at, last_login_at
     FROM customer_users WHERE id = $1`,
    [req.customerUser.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  const customerUser = r.rows[0];

  // A consumer blocked after their token was issued is locked out of acting.
  if (customerUser.status === 'blocked') {
    throw ApiError.forbidden('This account has been blocked. Contact support.');
  }

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

// PATCH /customer-auth/profile — update the consumer's own profile. phone is the
// login id and is READ-ONLY here; only name, email, gender and date_of_birth
// (all optional/omittable, privacy-first) can change.
const CU_EDITABLE = ['name', 'email', 'gender', 'date_of_birth'];

exports.updateProfile = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of CU_EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      let v = req.body[k];
      if (k === 'email' && v === '') v = null;
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  const cols = 'id, phone, name, email, gender, date_of_birth, created_at, last_login_at';
  if (!fields.length) {
    const cur = await query(`SELECT ${cols} FROM customer_users WHERE id = $1`, [req.customerUser.id]);
    if (!cur.rowCount) throw ApiError.notFound('Customer not found');
    return res.json({ customer_user: cur.rows[0] });
  }
  values.push(req.customerUser.id);
  const r = await query(
    `UPDATE customer_users SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${cols}`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ customer_user: r.rows[0] });
};
