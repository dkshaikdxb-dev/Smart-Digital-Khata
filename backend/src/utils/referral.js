const crypto = require('crypto');
const { query } = require('../config/db');
const {
  inTx,
  resolveWalletOwner,
  getOrCreateWallet,
  creditWallet,
} = require('./wallet');

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

    // Batch R3: each flat-bounty reward is inserted AND (when autosettle is on)
    // settled into the beneficiary's Khata Credits wallet in ONE transaction, so
    // accrual + real-time credit are atomic. Per-side try/catch keeps this whole
    // path best-effort: a settle hiccup on one side never rolls back activation
    // (already stamped) or the other side.
    const autosettle = await getAutosettle();

    // Referee side → the new shop owner's OWN code.
    if (rule.referee_paise > 0) {
      const sh = await query('SELECT owner_id FROM shops WHERE id = $1', [shopId]);
      const ownerId = sh.rowCount ? sh.rows[0].owner_id : null;
      if (ownerId) {
        const refereeCode = await getOrCreateCodeForUser(ownerId, 'owner');
        try {
          await inTx(null, async (c) => {
            const ins = await c.query(
              `INSERT INTO referral_rewards (referral_id, beneficiary_code_id, kind, amount_paise, status, beneficiary_role)
               VALUES ($1,$2,'referral',$3,'accrued','referee')
               RETURNING id, beneficiary_code_id, amount_paise, status`,
              [referral.id, refereeCode.id, rule.referee_paise]
            );
            if (autosettle) await settleReward(ins.rows[0], c);
          });
          rewarded = true;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[referral] referee reward insert/settle failed: ${e.message}`);
        }
      }
    }

    // Referrer / Mitra side → the referring code.
    if (referringCode) {
      const isMitra = referringCode.is_mitra === true;
      const role = isMitra ? 'mitra' : 'referrer';
      const amount = isMitra ? rule.mitra_paise : rule.referrer_paise;
      if (amount > 0) {
        try {
          await inTx(null, async (c) => {
            const ins = await c.query(
              `INSERT INTO referral_rewards (referral_id, beneficiary_code_id, kind, amount_paise, status, beneficiary_role)
               VALUES ($1,$2,'referral',$3,'accrued',$4)
               RETURNING id, beneficiary_code_id, amount_paise, status`,
              [referral.id, referringCode.id, amount, role]
            );
            if (autosettle) await settleReward(ins.rows[0], c);
          });
          rewarded = true;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`[referral] ${role} reward insert/settle failed: ${e.message}`);
        }
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

// The real-time settlement flag (Batch R3). 'true' (default) => a reward is
// credited to the beneficiary's Khata Credits wallet the instant it accrues, in
// the SAME transaction. 'false' => accrual leaves rewards 'accrued' and an admin
// settles them later. Read live from platform_settings so an admin toggle takes
// effect immediately; any error / unset value defaults to true.
async function getAutosettle(run) {
  try {
    const q = run || query;
    const r = await q("SELECT value FROM platform_settings WHERE key = 'referral_autosettle'");
    if (!r.rowCount) return true;
    return r.rows[0].value !== 'false';
  } catch (_e) {
    return true;
  }
}

// Real-time settlement (Batch R3). Settle ONE reward into its beneficiary's
// closed-loop Khata Credits wallet, in a single transaction so the reward status
// and the wallet balance can NEVER diverge.
//
// IDEMPOTENT: a guarded UPDATE flips only a row still status='accrued' to
// 'settled' (stamping settled_at); a missing / void / already-settled row is a
// clean no-op ({ settled:false, reason:'noop' }) — re-settling never double-credits.
//
// It THROWS only on a genuine failure (the beneficiary wallet cannot be
// resolved). Sharing the caller's transaction, that rolls back the whole
// insert+settle rather than leaving a reward marked settled but never credited.
// The accrual callers are best-effort and swallow the throw, so a payment /
// collection can never fail because settlement hiccuped.
async function settleReward(rewardRow, client) {
  if (!rewardRow || !rewardRow.id) return { settled: false, reason: 'no_row' };
  return inTx(client, async (c) => {
    // Claim the reward: only the first settle of an 'accrued' row proceeds.
    const upd = await c.query(
      `UPDATE referral_rewards
          SET status = 'settled', settled_at = NOW()
        WHERE id = $1 AND status = 'accrued'
        RETURNING id, beneficiary_code_id, amount_paise`,
      [rewardRow.id]
    );
    if (!upd.rowCount) return { settled: false, reason: 'noop' };
    const r = upd.rows[0];
    const amount = Number(r.amount_paise);
    if (!Number.isFinite(amount) || amount <= 0) return { settled: false, reason: 'no_amount' };
    if (!r.beneficiary_code_id) throw new Error('settleReward: reward has no beneficiary code');

    const cr = await c.query(
      'SELECT id, owner_type, owner_user_id, owner_customer_id FROM referral_codes WHERE id = $1',
      [r.beneficiary_code_id]
    );
    if (!cr.rowCount) throw new Error('settleReward: beneficiary code not found');
    const owner = await resolveWalletOwner(cr.rows[0], c);
    if (!owner) throw new Error('settleReward: cannot resolve wallet owner');

    const wallet = await getOrCreateWallet(owner.owner_type, owner.owner_id, c);
    const balance = await creditWallet(
      { wallet, amount_paise: amount, kind: 'reward_settled', ref_reward_id: r.id },
      c
    );
    return { settled: true, wallet_id: wallet.id, balance_after_paise: balance };
  });
}

// Settle every currently-accrued reward (used when referral_autosettle='false'
// and an admin drains the backlog, and as a manual reconcile). Best-effort per
// row: one unresolvable beneficiary never blocks the rest. Returns counts.
async function settleAllAccrued() {
  const r = await query("SELECT id FROM referral_rewards WHERE status = 'accrued' ORDER BY created_at ASC");
  let settled = 0;
  let skipped = 0;
  for (const row of r.rows) {
    try {
      const res = await settleReward({ id: row.id });
      if (res.settled) settled += 1; else skipped += 1;
    } catch (_e) {
      skipped += 1;
    }
  }
  return { settled, skipped, total: r.rows.length };
}

// Influencer flat-bounty accrual (Batch R3) — the non-peer path R2 left open,
// kept STRICTLY zero-burn. Called from accrueEnrolmentChainRewards when the direct
// referrer is a non-peer code. Only a code carrying an explicit flat_bounty_paise
// earns; the bounty is the minimum of three caps so it can never overspend:
//   flat_bounty_paise  — the per-referral flat amount the admin configured,
//   remainingBudget    — budget_cap_paise minus what this code already earned
//                        (NULL cap = uncapped), so a code never exceeds its budget,
//   poolCap            — floor(fee*(l1+l2)%), the same zero-burn cap as the chain,
//                        so the bounty never exceeds the pool the fee funds.
// The reward accrues (beneficiary_role='influencer', level NULL, source fields set)
// and, when autosettle is on, settles into the code's EARMARKED wallet — atomic.
// No L2 for an influencer chain. Budget exhausted -> accrue nothing.
async function accrueInfluencerBounty({ l1Code, amount, poolCap, referral, enrolmentId, shopId, run, client }) {
  const flat = l1Code && l1Code.flat_bounty_paise != null ? Number(l1Code.flat_bounty_paise) : null;
  if (flat == null || !Number.isFinite(flat) || flat <= 0) {
    // A non-peer code with no configured flat bounty accrues nothing (e.g. a mitra
    // whose bounty is the settings-driven maybeActivateReferral path instead).
    return { accrued: false, reason: 'non_peer_referrer' };
  }

  // What this code has already earned (accrued + settled) — its budget spend.
  const spentR = await run(
    `SELECT COALESCE(SUM(amount_paise),0)::bigint AS s FROM referral_rewards
       WHERE beneficiary_code_id = $1 AND status IN ('accrued','settled')`,
    [l1Code.id]
  );
  const spent = Number(spentR.rows[0].s) || 0;
  const cap = l1Code.budget_cap_paise != null ? Number(l1Code.budget_cap_paise) : null;
  const remainingBudget = cap == null ? Infinity : Math.max(0, cap - spent);

  const bounty = Math.min(flat, remainingBudget, Math.max(poolCap, 0));
  if (!(bounty > 0)) {
    const reason = cap != null && remainingBudget <= 0 ? 'budget_exhausted' : 'no_bounty';
    return { accrued: false, reason };
  }

  const autosettle = await getAutosettle(run);
  let rewardId = null;
  await inTx(client, async (c) => {
    const ins = await c.query(
      `INSERT INTO referral_rewards
         (referral_id, beneficiary_code_id, kind, amount_paise, status,
          beneficiary_role, level, source_enrolment_id, source_shop_id)
       VALUES ($1,$2,'referral',$3,'accrued','influencer',NULL,$4,$5)
       RETURNING id, beneficiary_code_id, amount_paise, status`,
      [referral.id, l1Code.id, bounty, enrolmentId, shopId]
    );
    rewardId = ins.rows[0].id;
    if (autosettle) await settleReward(ins.rows[0], c);
  });
  return { accrued: true, influencer_amount: bounty, poolCap, reward_id: rewardId };
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
        `SELECT id, owner_type, owner_user_id, is_mitra, flat_bounty_paise, budget_cap_paise
           FROM referral_codes WHERE id = $1`,
        [referral.referral_code_id]
      );
      l1Code = cr.rowCount ? cr.rows[0] : null;
    }
    if (!isPeerCode(l1Code)) {
      // Non-peer referrer (influencer / other / mitra) or a deleted code: no
      // %-chain reward. Batch R3 fills R2's gap — an influencer/other code that
      // carries an explicit flat_bounty_paise earns a flat, budget-capped,
      // pool-capped bounty here (see accrueInfluencerBounty). No L2 for a non-peer
      // chain. A code without a flat bounty accrues nothing.
      return await accrueInfluencerBounty({
        l1Code, amount, poolCap, referral, enrolmentId, shopId, run, client,
      });
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

    // Insert the chain reward rows (skip any non-positive amount) and, when
    // autosettle is on, settle each into the beneficiary's Khata Credits wallet —
    // insert+settle in ONE transaction so accrual and the real-time credit are
    // atomic (no partial credit). Keyed by source_enrolment_id / level, which the
    // idempotency guard above enforces as unique.
    const autosettle = await getAutosettle(run);
    await inTx(client, async (c) => {
      if (l1Amount > 0) {
        const ins = await c.query(
          `INSERT INTO referral_rewards
             (referral_id, beneficiary_code_id, kind, amount_paise, status,
              beneficiary_role, level, source_enrolment_id, source_shop_id)
           VALUES ($1,$2,'referral',$3,'accrued','chain_l1',1,$4,$5)
           RETURNING id, beneficiary_code_id, amount_paise, status`,
          [referral.id, l1Code.id, l1Amount, enrolmentId, shopId]
        );
        if (autosettle) await settleReward(ins.rows[0], c);
      }
      if (l2Code && l2Amount > 0) {
        const ins = await c.query(
          `INSERT INTO referral_rewards
             (referral_id, beneficiary_code_id, kind, amount_paise, status,
              beneficiary_role, level, source_enrolment_id, source_shop_id)
           VALUES ($1,$2,'referral',$3,'accrued','chain_l2',2,$4,$5)
           RETURNING id, beneficiary_code_id, amount_paise, status`,
          [null, l2Code.id, l2Amount, enrolmentId, shopId]
        );
        if (autosettle) await settleReward(ins.rows[0], c);
      }
    });

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
  settleReward,
  settleAllAccrued,
  getAutosettle,
};
