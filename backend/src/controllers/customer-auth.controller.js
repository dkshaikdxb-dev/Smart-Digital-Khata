const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');
const { captureReferral } = require('../utils/referral');
const { relinkCustomerPhone } = require('../utils/customer-merge');

const SALT = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const OTP_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 5;

// Consumer session lifetime — the REAL no-network mitigation. A logged-in
// consumer keeps a long-lived token (90 days) that silently refreshes while they
// stay active (see maybeRefreshToken), so they effectively never get logged out
// and can keep using the PWA (with the service worker) through offline stretches.
// This is deliberately long ONLY for the 'customer' role; owner/staff/admin
// tokens are issued elsewhere (auth.controller) and are unchanged.
const CONSUMER_TOKEN_TTL_DAYS = 90;
// Refresh-on-use threshold: once a presented token is older than this, /me (or
// any authed consumer read that calls maybeRefreshToken) mints a fresh 90-day
// token and returns it for the client to swap in — so an active user's window
// keeps rolling forward.
const TOKEN_REFRESH_AFTER_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

// PIN throttling: lock the account for a cooling-off window after too many wrong
// PINs. OTP login is unaffected and remains the recovery path.
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60_000; // 15 minutes
// A stable dummy hash to compare against when a phone/PIN is unknown, so a
// missing account costs roughly the same time as a real bcrypt.compare (avoids a
// timing oracle that would reveal whether a phone is registered).
const DUMMY_PIN_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8Dp9Wj0Qm3xq1oY0d1kqF8m0m0m0m';

function signToken(customerUser) {
  // Customer tokens carry role 'customer' and NO shopId, so they can never
  // satisfy the owner/staff/admin gate on shop-scoped endpoints.
  return jwt.sign(
    { sub: customerUser.id, role: 'customer', phone: customerUser.phone },
    process.env.JWT_SECRET,
    { expiresIn: `${CONSUMER_TOKEN_TTL_DAYS}d` }
  );
}

// Return a fresh token when the presented one is older than the refresh
// threshold, else null. `iat` is the JWT issued-at (seconds) from the middleware.
function maybeRefreshToken(customerUser, iat) {
  if (!iat) return null;
  const ageMs = Date.now() - iat * 1000;
  if (ageMs <= TOKEN_REFRESH_AFTER_MS) return null;
  return signToken(customerUser);
}

// Issue (replace) the single live OTP for a phone and return the plaintext code
// so the caller can dispatch it. Only a bcrypt hash is ever persisted.
async function issueOtp(phone) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = await bcrypt.hash(code, SALT);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  // Replace any prior OTP for this phone so only the latest code is valid.
  await query('DELETE FROM customer_otps WHERE phone = $1', [phone]);
  await query(
    `INSERT INTO customer_otps (phone, code_hash, expires_at) VALUES ($1,$2,$3)`,
    [phone, codeHash, expiresAt]
  );
  return code;
}

// Validate the latest OTP for `phone` against `code`. Throws ApiError.unauthorized
// on any failure (unknown/expired/too-many-attempts/mismatch) and increments the
// attempt counter on a wrong code, exactly like the OTP login path. On success it
// returns without deleting the row — the caller consumes it once its own work
// (identity move, login upsert) has committed.
async function assertOtpValid(phone, code) {
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
}

exports.requestOtp = async (req, res) => {
  const phone = toE164(req.body.phone);

  const code = await issueOtp(phone);

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

  await assertOtpValid(phone, code);

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
    `SELECT id, phone, name, email, gender, date_of_birth, status, created_at, last_login_at,
            (pin_hash IS NOT NULL) AS has_pin
     FROM customer_users WHERE id = $1`,
    [req.customerUser.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  const customerUser = r.rows[0];
  const hasPin = customerUser.has_pin === true;
  delete customerUser.has_pin;

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

  // Long-session refresh-on-use: hand back a fresh token when the presented one
  // is past the refresh threshold so an active consumer's window keeps rolling.
  const body = {
    customer_user: customerUser,
    shops: shops.rows,
    has_pin: hasPin,
    phone: customerUser.phone,
  };
  const refreshed = maybeRefreshToken(customerUser, req.customerUser.iat);
  if (refreshed) body.token = refreshed;
  res.json(body);
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

// ---------------------------------------------------------------------------
// Part 3 — Consumer self-service number change (OTP-gated on the NEW number)
// ---------------------------------------------------------------------------

// POST /customer-auth/change-number/request — send an OTP to the NEW number the
// logged-in consumer wants to move to. The change itself only completes once
// that code is verified (change-number/verify), proving control of the new SIM.
exports.changeNumberRequest = async (req, res) => {
  const newPhone = toE164(req.body.new_phone);

  const cur = await query('SELECT phone FROM customer_users WHERE id = $1', [req.customerUser.id]);
  if (!cur.rowCount) throw ApiError.notFound('Customer not found');
  if (cur.rows[0].phone === newPhone) {
    throw ApiError.badRequest('That is already your current number');
  }

  const code = await issueOtp(newPhone);
  await whatsapp.sendText(
    newPhone,
    `Your Smart Digital Khata number-change code is ${code}. It expires in 5 minutes.`
  );

  const body = { ok: true };
  if (process.env.NODE_ENV !== 'production') body.dev_code = code;
  res.json(body);
};

// POST /customer-auth/change-number/verify — verify the OTP on the NEW number,
// then atomically: (1) re-link the consumer's ledger in EVERY shop from the old
// phone to the new (merging per-shop where the shop already has the new number),
// (2) move the login identity (merging into an existing new-phone account if one
// exists), (3) audit it, and (4) issue a fresh token for the resulting identity.
exports.changeNumberVerify = async (req, res) => {
  const newPhone = toE164(req.body.new_phone);
  const { code } = req.body;

  const cur = await query(
    'SELECT id, phone, name, email, gender, date_of_birth, pin_hash, status FROM customer_users WHERE id = $1',
    [req.customerUser.id]
  );
  if (!cur.rowCount) throw ApiError.notFound('Customer not found');
  const me = cur.rows[0];
  if (me.status === 'blocked') {
    throw ApiError.forbidden('This account has been blocked. Contact support.');
  }
  const oldPhone = me.phone;
  if (oldPhone === newPhone) throw ApiError.badRequest('That is already your current number');

  // Gate the whole operation on proof of control of the new number.
  await assertOtpValid(newPhone, code);

  const result = await withTx(async (client) => {
    // 1) Re-link the ledger in every shop where the consumer has a row on the
    //    old phone. Each shop is merged/renamed independently and money-exactly.
    const shopRows = await client.query(
      'SELECT DISTINCT shop_id FROM customers WHERE phone = $1',
      [oldPhone]
    );
    let shopsRelinked = 0;
    for (const { shop_id: shopId } of shopRows.rows) {
      const outcome = await relinkCustomerPhone(client, { shopId, fromPhone: oldPhone, toPhone: newPhone });
      if (outcome.relinked) shopsRelinked += 1;
    }

    // 2) Move the login identity. If an account already exists on the new phone,
    //    keep THAT survivor (it may already own history) and fold this account's
    //    profile fields / PIN into it where the survivor lacks them, then delete
    //    the old row. Otherwise just rename this row's phone in place.
    const existing = await client.query(
      'SELECT id, name, email, gender, date_of_birth, pin_hash FROM customer_users WHERE phone = $1 FOR UPDATE',
      [newPhone]
    );

    let identityId;
    if (existing.rowCount && existing.rows[0].id !== me.id) {
      const survivor = existing.rows[0];
      identityId = survivor.id;
      await client.query(
        `UPDATE customer_users SET
           name          = COALESCE(name, $2),
           email         = COALESCE(email, $3),
           gender        = COALESCE(gender, $4),
           date_of_birth = COALESCE(date_of_birth, $5),
           pin_hash      = COALESCE(pin_hash, $6),
           last_login_at = NOW()
         WHERE id = $1`,
        [survivor.id, me.name, me.email, me.gender, me.date_of_birth, me.pin_hash]
      );
      // Preserve referral-code ownership (no FK — repoint before deleting the
      // old row so a code the old account minted keeps working under the survivor).
      await client.query(
        'UPDATE referral_codes SET owner_customer_id = $1 WHERE owner_customer_id = $2',
        [survivor.id, me.id]
      );
      await client.query('DELETE FROM customer_users WHERE id = $1', [me.id]);
    } else {
      identityId = me.id;
      await client.query(
        'UPDATE customer_users SET phone = $1, last_login_at = NOW() WHERE id = $2',
        [newPhone, me.id]
      );
    }

    // 3) Audit.
    await client.query(
      `INSERT INTO phone_changes (customer_user_id, from_phone, to_phone, changed_by, shops_relinked)
       VALUES ($1,$2,$3,'self',$4)`,
      [identityId, oldPhone, newPhone, shopsRelinked]
    );

    // Consume the OTP now that the change has committed logic-wise.
    await client.query('DELETE FROM customer_otps WHERE phone = $1', [newPhone]);

    const fresh = await client.query(
      `SELECT id, phone, name, email, gender, date_of_birth, status, created_at, last_login_at
       FROM customer_users WHERE id = $1`,
      [identityId]
    );
    return { customerUser: fresh.rows[0], shopsRelinked };
  });

  // 4) Fresh token for the resulting identity (new phone claim). The client swaps
  //    its stored token for this one.
  const token = signToken(result.customerUser);
  res.json({ token, customer_user: result.customerUser, shops_relinked: result.shopsRelinked });
};

// ---------------------------------------------------------------------------
// Part 4 — Consumer PIN (a FASTER login, not offline auth)
// ---------------------------------------------------------------------------
// HONEST SCOPE: a server-verified PIN still needs DATA connectivity — it only
// saves the wait for an OTP SMS. It is NOT offline login. The genuine no-network
// answer is the long-lived session (Part 5). OTP login remains the primary and
// most-secure path, and the way to recover a forgotten or locked PIN.

// POST /customer-auth/pin/set (auth) — set or change the 4–6 digit PIN. Changing
// an existing PIN requires the current PIN (proof it is really the owner). The
// PIN is bcrypt-hashed; attempt counters/locks are cleared on a successful set.
exports.pinSet = async (req, res) => {
  const { pin, current_pin: currentPin } = req.body;

  const cur = await query(
    'SELECT id, pin_hash FROM customer_users WHERE id = $1',
    [req.customerUser.id]
  );
  if (!cur.rowCount) throw ApiError.notFound('Customer not found');
  const existingHash = cur.rows[0].pin_hash;

  if (existingHash) {
    // Replacing a PIN requires the current one (OTP re-login is the alternative
    // recovery path when it is forgotten).
    if (!currentPin) throw ApiError.badRequest('Current PIN is required to change your PIN');
    const ok = await bcrypt.compare(String(currentPin), existingHash);
    if (!ok) throw ApiError.unauthorized('Current PIN is incorrect');
  }

  const hash = await bcrypt.hash(String(pin), SALT);
  await query(
    `UPDATE customer_users
       SET pin_hash = $1, pin_failed_attempts = 0, pin_locked_until = NULL
     WHERE id = $2`,
    [hash, req.customerUser.id]
  );
  res.json({ ok: true, has_pin: true });
};

// POST /customer-auth/pin/login (NO auth) — exchange phone + PIN for a token.
// Locked after MAX_PIN_ATTEMPTS wrong tries for PIN_LOCK_MS. Responses are kept
// uniform (and a dummy hash is compared for unknown phones) so the endpoint does
// not reveal whether a phone is registered.
exports.pinLogin = async (req, res) => {
  const phone = toE164(req.body.phone);
  const { pin } = req.body;

  const r = await query(
    `SELECT id, phone, name, status, pin_hash, pin_failed_attempts, pin_locked_until,
            email, gender, date_of_birth, created_at, last_login_at
     FROM customer_users WHERE phone = $1`,
    [phone]
  );
  const user = r.rowCount ? r.rows[0] : null;

  // Locked account → 429, regardless of whether the PIN is right, until it cools
  // off. OTP login still works as the recovery path.
  if (user && user.pin_locked_until && new Date(user.pin_locked_until).getTime() > Date.now()) {
    throw ApiError.tooManyRequests('Too many attempts. Try again later or log in with OTP.');
  }

  // Compare against a dummy hash when there is no account/PIN so timing is
  // similar and existence is not leaked.
  const hash = user && user.pin_hash ? user.pin_hash : DUMMY_PIN_HASH;
  const ok = await bcrypt.compare(String(pin), hash);

  if (!user || !user.pin_hash || !ok) {
    // On a real account with a real PIN, count the failure and lock at the cap.
    if (user && user.pin_hash) {
      const attempts = Number(user.pin_failed_attempts) + 1;
      if (attempts >= MAX_PIN_ATTEMPTS) {
        await query(
          `UPDATE customer_users
             SET pin_failed_attempts = $1, pin_locked_until = NOW() + ($2 || ' milliseconds')::interval
           WHERE id = $3`,
          [attempts, String(PIN_LOCK_MS), user.id]
        );
      } else {
        await query('UPDATE customer_users SET pin_failed_attempts = $1 WHERE id = $2', [attempts, user.id]);
      }
    }
    throw ApiError.unauthorized('Invalid phone or PIN');
  }

  if (user.status === 'blocked') {
    throw ApiError.forbidden('This account has been blocked. Contact support.');
  }

  // Success — clear counters, stamp login, issue a long-lived token.
  await query(
    `UPDATE customer_users
       SET pin_failed_attempts = 0, pin_locked_until = NULL, last_login_at = NOW()
     WHERE id = $1`,
    [user.id]
  );
  const customerUser = {
    id: user.id, phone: user.phone, name: user.name, email: user.email,
    gender: user.gender, date_of_birth: user.date_of_birth, status: user.status,
    created_at: user.created_at, last_login_at: user.last_login_at,
  };
  const token = signToken(customerUser);
  res.json({ token, customer_user: customerUser });
};

// POST /customer-auth/pin/clear (auth) — remove the PIN entirely (back to
// OTP-only login). Also clears any attempt counters/lock.
exports.pinClear = async (req, res) => {
  const r = await query(
    `UPDATE customer_users
       SET pin_hash = NULL, pin_failed_attempts = 0, pin_locked_until = NULL
     WHERE id = $1 RETURNING id`,
    [req.customerUser.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ ok: true, has_pin: false });
};
