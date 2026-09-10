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

    // Zero-burn REPLACES the flat bounty (Batch R2): when the enrolment-fee
    // feature is ON and this shop has already PAID its fee, the fee itself has
    // funded the L1/L2 chain (see accrueEnrolmentChainRewards), so we must NOT
    // also fire the platform-funded flat bounty for it. Activation is still real
    // (activated_at was just stamped above); we simply insert no flat reward rows.
    // Cheap + defensive: any lookup failure falls through to the normal bounty
    // path so a shop is never silently denied its legacy bounty. The require is
    // lazy to avoid a circular require between referral.js and enrolment.js.
    try {
      const { getEnrolmentConfig } = require('./enrolment');
      const feeCfg = await getEnrolmentConfig();
      if (feeCfg && feeCfg.enabled) {
        const paid = await query(
          `SELECT 1 FROM enrolments WHERE shop_id = $1 AND status = 'paid' LIMIT 1`,
          [shopId]
        );
        if (paid.rowCount) {
          return { activated: true, rewarded: false, reason: 'fee_funded' };
        }
      }
    } catch (_e) {
      // Fall through to the existing flat-bounty path — never throw, never skip.
    }

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

// A peer referrer is a real shop principal (owner/staff) sharing their own code,
// NOT a mitra/influencer/customer/other. Only peers earn the fee-funded %-chain
// reward; non-peer bounties (mitra now, influencer in R3) are handled elsewhere.
function isPeerCode(code) {
  return !!code && (code.owner_type === 'owner' || code.owner_type === 'staff') && code.is_mitra !== true;
}

// Fee-funded 2-level chain accrual (Batch R2). Called by enrolment.onEnrolmentPaid
// exactly once, right after an enrolment transitions pending -> paid. Splits the
// fee JUST COLLECTED across the referral chain — the direct referrer (L1) and the
// referrer's referrer (L2) — so the platform never advances its own capital
// (zero burn). Everything is drawn from this one fee and capped at the pool.
//
// Best-effort and NEVER throws: a payment confirm must not fail because accrual
// hiccuped, so every problem resolves to { accrued:false, reason }.
//
// `client` (optional) is a pg client/transaction to run within; defaults to the
// pooled query. All money is integer paise; every split is integer floor math.
async function accrueEnrolmentChainRewards(shopId, enrolmentId, client) {
  const run = client && typeof client.query === 'function'
    ? (text, params) => client.query(text, params)
    : query;
  try {
    if (!shopId || !enrolmentId) return { accrued: false, reason: 'bad_args' };

    // 1) Idempotency guard: one paid enrolment funds at most ONE set of chain
    //    rewards. A re-run / retried confirm must never double-accrue.
    const dup = await run(
      `SELECT 1 FROM referral_rewards WHERE source_enrolment_id = $1 LIMIT 1`,
      [enrolmentId]
    );
    if (dup.rowCount) return { accrued: false, reason: 'already_accrued' };

    // 2) Load the enrolment; it must be paid. Read the split snapshot captured
    //    at payment time so later rate changes never retro-alter what was owed.
    const er = await run(
      `SELECT shop_id, status, amount_paise, split_l1_pct, split_l2_pct
         FROM enrolments WHERE id = $1`,
      [enrolmentId]
    );
    if (!er.rowCount) return { accrued: false, reason: 'enrolment_not_found' };
    const enrol = er.rows[0];
    if (enrol.status !== 'paid') return { accrued: false, reason: 'not_paid' };

    const amount = Number(enrol.amount_paise);
    if (!Number.isFinite(amount) || amount <= 0) return { accrued: false, reason: 'no_amount' };

    // Split snapshot is the source of truth; fall back to LIVE config only when a
    // snapshot column is null. Lazy require avoids a circular require w/ enrolment.js.
    let l1Pct = enrol.split_l1_pct;
    let l2Pct = enrol.split_l2_pct;
    if (l1Pct == null || l2Pct == null) {
      const { getEnrolmentConfig } = require('./enrolment');
      const cfg = await getEnrolmentConfig();
      if (l1Pct == null) l1Pct = cfg.split.l1_pct;
      if (l2Pct == null) l2Pct = cfg.split.l2_pct;
    }
    l1Pct = Number(l1Pct) || 0;
    l2Pct = Number(l2Pct) || 0;

    // The pool: the total the referral chain may draw from this fee. Nothing
    // accrued may ever exceed it (zero-burn cap).
    const poolCap = Math.floor((amount * (l1Pct + l2Pct)) / 100);

    // 3) This shop's attribution. No row → organic/seeded shop: infra + the
    //    unspent pool simply stay with the platform. Still zero burn.
    const ref = await run(
      `SELECT id, referral_code_id FROM referrals
         WHERE referred_shop_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [shopId]
    );
    if (!ref.rowCount) return { accrued: false, reason: 'no_referrer' };
    const referral = ref.rows[0];

    // 4) L1 = the referring code. Chain %-rewards apply only to a PEER referrer.
    let l1Code = null;
    if (referral.referral_code_id) {
      const cr = await run(
        `SELECT id, owner_type, owner_user_id, is_mitra FROM referral_codes WHERE id = $1`,
        [referral.referral_code_id]
      );
      l1Code = cr.rowCount ? cr.rows[0] : null;
    }
    if (!isPeerCode(l1Code)) {
      // Non-peer (mitra/influencer/customer/other) or a deleted code: no %-chain
      // reward here — their flat bounty is handled elsewhere (R3 owns influencers).
      return { accrued: false, reason: 'non_peer_referrer' };
    }

    let l1Amount = Math.floor((amount * l1Pct) / 100);

    // 5) L2 = the grandparent: the L1 referrer's OWN attribution. Resolve the L1
    //    code's owner shop (a peer code is owned by a users.id → shops.owner_id),
    //    then look up who referred THAT shop. Only a peer grandparent earns L2.
    let l2Amount = 0;
    let l2Code = null;
    try {
      if (l1Code.owner_user_id) {
        const os = await run(
          `SELECT id FROM shops WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1`,
          [l1Code.owner_user_id]
        );
        if (os.rowCount) {
          const gpRef = await run(
            `SELECT referral_code_id FROM referrals
               WHERE referred_shop_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [os.rows[0].id]
          );
          if (gpRef.rowCount && gpRef.rows[0].referral_code_id) {
            const gc = await run(
              `SELECT id, owner_type, is_mitra FROM referral_codes WHERE id = $1`,
              [gpRef.rows[0].referral_code_id]
            );
            if (gc.rowCount && isPeerCode(gc.rows[0])) {
              l2Code = gc.rows[0];
              l2Amount = Math.floor((amount * l2Pct) / 100);
            }
          }
        }
      }
    } catch (_gp) {
      // Grandparent resolution is best-effort: a hiccup here just means no L2.
      l2Code = null;
      l2Amount = 0;
    }

    // 6) Zero-burn assertion (defensive): l1 + l2 <= poolCap by construction. If a
    //    mis-set split ever made it exceed, clamp — trim L2 first, then L1 — so we
    //    NEVER accrue more than the pool the fee actually funds.
    if (l1Amount + l2Amount > poolCap) {
      const room = Math.max(poolCap, 0);
      const l1Clamped = Math.min(l1Amount, room);
      const l2Clamped = Math.max(Math.min(l2Amount, room - l1Clamped), 0);
      // eslint-disable-next-line no-console
      console.warn(
        `[referral] chain accrual clamped to pool cap: l1=${l1Amount}->${l1Clamped} ` +
        `l2=${l2Amount}->${l2Clamped} poolCap=${poolCap} enrolment=${enrolmentId}`
      );
      l1Amount = l1Clamped;
      l2Amount = l2Clamped;
    }

    // Insert the chain reward rows (skip any non-positive amount). Keyed by
    // source_enrolment_id / level, which the guard above enforces as unique.
    if (l1Amount > 0) {
      await run(
        `INSERT INTO referral_rewards
           (referral_id, beneficiary_code_id, kind, amount_paise, status,
            beneficiary_role, level, source_enrolment_id, source_shop_id)
         VALUES ($1,$2,'referral',$3,'accrued','chain_l1',1,$4,$5)`,
        [referral.id, l1Code.id, l1Amount, enrolmentId, shopId]
      );
    }
    if (l2Code && l2Amount > 0) {
      await run(
        `INSERT INTO referral_rewards
           (referral_id, beneficiary_code_id, kind, amount_paise, status,
            beneficiary_role, level, source_enrolment_id, source_shop_id)
         VALUES ($1,$2,'referral',$3,'accrued','chain_l2',2,$4,$5)`,
        [null, l2Code.id, l2Amount, enrolmentId, shopId]
      );
    }

    return { accrued: true, l1_amount: l1Amount, l2_amount: l2Amount, poolCap };
  } catch (e) {
    // A payment confirm must never fail because accrual hiccuped.
    return { accrued: false, reason: 'error', error: e.message };
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
  accrueEnrolmentChainRewards,
};
