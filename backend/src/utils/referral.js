const crypto = require('crypto');
const { query } = require('../config/db');

// Referral helpers (Phase D). Code generation, get-or-create for a principal,
// and the capture path that attributes a new signup to a code. Everything here
// is defensive: capture NEVER throws — a missing/invalid/blank/self/duplicate
// referral is silently ignored so a signup can never break because of it.

// Ambiguity-free alphabet: no 0/O, 1/I/L to keep shared codes easy to read and
// type off a poster or a WhatsApp message.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_LEN = 6;

// A single random code of the given length (6–8). Cryptographically random.
function genCode(len = DEFAULT_LEN) {
  const n = Math.min(Math.max(len, 6), 8);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

// Insert a fresh, collision-free code with the given ownership. Retries on the
// UNIQUE(code) clash (ON CONFLICT DO NOTHING → no row → try again). Bounded
// attempts, widening the length if the short space is somehow saturated.
async function createUniqueCode({ ownerType, ownerUserId = null, ownerCustomerId = null, label = null, createdBy = null }) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const len = attempt < 8 ? DEFAULT_LEN : 8;
    const code = genCode(len);
    const r = await query(
      `INSERT INTO referral_codes (code, owner_type, owner_user_id, owner_customer_id, label, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO NOTHING
       RETURNING id, code, owner_type, owner_user_id, owner_customer_id, label, created_by, created_at`,
      [code, ownerType, ownerUserId, ownerCustomerId, label, createdBy]
    );
    if (r.rowCount) return r.rows[0];
  }
  throw new Error('Could not generate a unique referral code');
}

// Return the caller's own code, creating it on first use. owner/staff/admin map
// to a users.id-owned code; role → owner_type ('owner'/'staff', else 'other').
async function getOrCreateCodeForUser(userId, ownerType = 'owner') {
  const type = ['owner', 'staff'].includes(ownerType) ? ownerType : 'other';
  const existing = await query(
    `SELECT id, code, owner_type, owner_user_id, owner_customer_id, label, created_by, created_at
     FROM referral_codes WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId]
  );
  if (existing.rowCount) return existing.rows[0];
  return createUniqueCode({ ownerType: type, ownerUserId: userId });
}

// Return a consumer's own code, creating it on first use.
async function getOrCreateCodeForCustomer(customerId) {
  const existing = await query(
    `SELECT id, code, owner_type, owner_user_id, owner_customer_id, label, created_by, created_at
     FROM referral_codes WHERE owner_customer_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [customerId]
  );
  if (existing.rowCount) return existing.rows[0];
  return createUniqueCode({ ownerType: 'customer', ownerCustomerId: customerId });
}

// The reward rule from platform_settings, read live from the DB so a just-saved
// change is honoured immediately. Disabled / zero → no accrual.
async function getRewardRule() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
       WHERE key IN ('referral_reward_enabled','referral_reward_paise')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;
    const amount = parseInt(m.referral_reward_paise, 10);
    return {
      enabled: m.referral_reward_enabled === 'true',
      amount_paise: Number.isFinite(amount) && amount > 0 ? amount : 0,
    };
  } catch (_e) {
    return { enabled: false, amount_paise: 0 };
  }
}

// Attribute a new signup to a referral code. Idempotent and self-referral safe:
//  - a blank / unknown code is ignored (returns { captured:false }).
//  - a code whose owner is the very principal being referred is skipped (self).
//  - the unique indexes make a second capture of the same principal a no-op.
//  - when the reward rule is enabled, one 'accrued' reward row is written to the
//    referrer's code (scaffolding only — nothing is ever paid out here).
// NEVER throws: any error resolves to { captured:false, reason:'error' }.
async function captureReferral({ code, referredType, referredUserId, referredShopId, referredCustomerId, sourceChannel } = {}) {
  try {
    if (!code || typeof code !== 'string') return { captured: false, reason: 'no_code' };
    const norm = code.trim().toUpperCase();
    if (!norm) return { captured: false, reason: 'blank' };

    const cr = await query(
      `SELECT id, code, owner_type, owner_user_id, owner_customer_id
       FROM referral_codes WHERE UPPER(code) = $1 LIMIT 1`,
      [norm]
    );
    if (!cr.rowCount) return { captured: false, reason: 'unknown' };
    const rc = cr.rows[0];

    // Self-referral guard: never attribute a principal to their own code.
    if (referredUserId && rc.owner_user_id && rc.owner_user_id === referredUserId) {
      return { captured: false, reason: 'self' };
    }
    if (referredCustomerId && rc.owner_customer_id && rc.owner_customer_id === referredCustomerId) {
      return { captured: false, reason: 'self' };
    }

    const ins = await query(
      `INSERT INTO referrals
         (referral_code_id, code, referred_type, referred_user_id, referred_shop_id, referred_customer_id, source_channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        rc.id,
        rc.code,
        referredType,
        referredUserId || null,
        referredShopId || null,
        referredCustomerId || null,
        (sourceChannel && String(sourceChannel).trim()) || null,
      ]
    );
    // Unique index already captured this principal → nothing to do.
    if (!ins.rowCount) return { captured: false, reason: 'duplicate' };
    const referralId = ins.rows[0].id;

    // Reward accrual scaffolding — record, never pay.
    const rule = await getRewardRule();
    if (rule.enabled && rule.amount_paise > 0) {
      await query(
        `INSERT INTO referral_rewards (referral_id, beneficiary_code_id, kind, amount_paise, status)
         VALUES ($1,$2,'referral',$3,'accrued')`,
        [referralId, rc.id, rule.amount_paise]
      );
    }

    return { captured: true, referralId, codeId: rc.id };
  } catch (e) {
    // Signups must never fail because of referral capture.
    return { captured: false, reason: 'error', error: e.message };
  }
}

module.exports = {
  ALPHABET,
  genCode,
  createUniqueCode,
  getOrCreateCodeForUser,
  getOrCreateCodeForCustomer,
  getRewardRule,
  captureReferral,
};
