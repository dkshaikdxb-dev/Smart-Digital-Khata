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
// change is honoured immediately. Double-sided + Mitra:
//   referrer_paise = the existing `referral_reward_paise` (peer referrer side).
//   referee_paise  = the referred shop's own reward; falls back to referrer_paise
//                    when unset (both sides symmetric by default).
//   mitra_paise    = the Khata Mitra agent bounty; defaults to 0 when unset.
// amount_paise stays a back-compat alias for referrer_paise. All clamped ≥ 0.
async function getRewardRule() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
       WHERE key IN ('referral_reward_enabled','referral_reward_paise',
                     'referral_referee_paise','referral_mitra_paise')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    const clamp = (raw) => {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const referrer = clamp(m.referral_reward_paise);
    const refereeRaw = parseInt(m.referral_referee_paise, 10);
    const referee = Number.isFinite(refereeRaw)
      ? (refereeRaw > 0 ? refereeRaw : 0)
      : referrer; // unset → mirror the referrer side
    const mitra = clamp(m.referral_mitra_paise);

    return {
      enabled: m.referral_reward_enabled === 'true',
      referrer_paise: referrer,
      referee_paise: referee,
      mitra_paise: mitra,
      amount_paise: referrer, // back-compat alias
    };
  } catch (_e) {
    return { enabled: false, referrer_paise: 0, referee_paise: 0, mitra_paise: 0, amount_paise: 0 };
  }
}

// Attribute a new signup to a referral code. Idempotent and self-referral safe:
//  - a blank / unknown code is ignored (returns { captured:false }).
//  - a code whose owner is the very principal being referred is skipped (self).
//  - the unique indexes make a second capture of the same principal a no-op.
// Capture only ATTRIBUTES the signup — no reward is accrued here. Rewards accrue
// later, on ACTIVATION (the referred shop's first collection); see
// maybeActivateReferral().
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

    return { captured: true, referralId, codeId: rc.id };
  } catch (e) {
    // Signups must never fail because of referral capture.
    return { captured: false, reason: 'error', error: e.message };
  }
}

// Activate a referral on the referred shop's FIRST collection and accrue the
// double-sided reward. Idempotent and NEVER throws — a failure here must never
// break (or roll back) a real collection, so every error resolves to
// { activated:false }. Call it AFTER the collection's DB commit.
//
// Accrual predicates (each reward row is written only when its amount_paise > 0):
//   - referee → the NEW shop owner's own code, role 'referee', amount referee_paise.
//   - if the referring code is_mitra → role 'mitra', amount mitra_paise, to the
//     referring code (a Mitra earns the bounty INSTEAD of the peer reward);
//     otherwise → role 'referrer', amount referrer_paise, to the referring code.
async function maybeActivateReferral(shopId) {
  try {
    if (!shopId) return { activated: false };

    // Claim activation atomically: only the first caller flips activated_at, so
    // a concurrent second collection can never double-accrue.
    const claim = await query(
      `UPDATE referrals
         SET activated_at = NOW()
       WHERE referred_shop_id = $1 AND activated_at IS NULL
       RETURNING id, referral_code_id`,
      [shopId]
    );
    if (!claim.rowCount) return { activated: false };
    const referral = claim.rows[0];

    const rule = await getRewardRule();
    if (!rule.enabled) return { activated: true, rewarded: false };

    // The referring code (may be null if the code was later deleted / SET NULL).
    let referringCode = null;
    if (referral.referral_code_id) {
      const cr = await query(
        `SELECT id, is_mitra, owner_type FROM referral_codes WHERE id = $1`,
        [referral.referral_code_id]
      );
      referringCode = cr.rowCount ? cr.rows[0] : null;
    }

    let rewarded = false;

    // Referee side → the new shop owner's OWN code.
    if (rule.referee_paise > 0) {
      const sh = await query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
      const ownerId = sh.rowCount ? sh.rows[0].owner_id : null;
      if (ownerId) {
        const refereeCode = await getOrCreateCodeForUser(ownerId, 'owner');
        await query(
          `INSERT INTO referral_rewards (referral_id, beneficiary_code_id, kind, amount_paise, status, beneficiary_role)
           VALUES ($1,$2,'referral',$3,'accrued','referee')`,
          [referral.id, refereeCode.id, rule.referee_paise]
        );
        rewarded = true;
      }
    }

    // Referrer / Mitra side → the referring code.
    if (referringCode) {
      const isMitra = referringCode.is_mitra === true;
      const role = isMitra ? 'mitra' : 'referrer';
      const amount = isMitra ? rule.mitra_paise : rule.referrer_paise;
      if (amount > 0) {
        await query(
          `INSERT INTO referral_rewards (referral_id, beneficiary_code_id, kind, amount_paise, status, beneficiary_role)
           VALUES ($1,$2,'referral',$3,'accrued',$4)`,
          [referral.id, referringCode.id, amount, role]
        );
        rewarded = true;
      }
    }

    return { activated: true, rewarded };
  } catch (_e) {
    // A collection must never fail or roll back because of activation accrual.
    return { activated: false };
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
  maybeActivateReferral,
};
