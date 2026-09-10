const { query } = require('../config/db');

// Enrolment-fee helpers (Batch R1). The one-time shop enrolment fee lives in
// platform_settings (migration 0048) and is read LIVE from the DB so a just-saved
// admin change is honoured immediately — the same style as referral.getRewardRule().
//
// The whole feature ships OFF: enrolment_fee_enabled defaults to 'false', so
// getEnrolmentConfig() reports enabled:false and the order/confirm endpoints stay
// locked until an admin flips the flag. Money is integer paise throughout.

// A finite, >= 0 integer or the given fallback. Used to clamp every amount/percent
// so a malformed platform_settings value can never produce NaN or a negative fee.
function clampNonNeg(raw, fallback = 0) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Clamp a percent into 0..100 (finite, integer).
function clampPct(raw) {
  const n = clampNonNeg(raw, 0);
  return Math.min(n, 100);
}

// The live enrolment config from platform_settings. Never throws — on any parse
// or DB error it returns a safe, disabled config so the feature stays dormant.
//
// Returns:
//   { enabled, basic_paise, premium_paise,
//     split: { infra_pct, l1_pct, l2_pct, buffer_pct },
//     valid }
// where buffer_pct = clamp(100 - infra - l1 - l2, 0..100) and
//       valid === (infra + l1 + l2) <= 100  (zero-burn: the referral shares can
//       never exceed the fee, so the platform's infra buffer is never negative).
async function getEnrolmentConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
       WHERE key IN ('enrolment_fee_enabled','enrolment_fee_basic_paise',
                     'enrolment_fee_premium_paise','referral_split_infra_pct',
                     'referral_split_l1_pct','referral_split_l2_pct')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    const infra = clampPct(m.referral_split_infra_pct);
    const l1 = clampPct(m.referral_split_l1_pct);
    const l2 = clampPct(m.referral_split_l2_pct);
    const shares = infra + l1 + l2;
    const buffer = Math.min(Math.max(100 - shares, 0), 100);

    return {
      enabled: m.enrolment_fee_enabled === 'true',
      basic_paise: clampNonNeg(m.enrolment_fee_basic_paise, 0),
      premium_paise: clampNonNeg(m.enrolment_fee_premium_paise, 0),
      split: { infra_pct: infra, l1_pct: l1, l2_pct: l2, buffer_pct: buffer },
      valid: shares <= 100,
    };
  } catch (_e) {
    // On any error the feature stays dormant.
    return {
      enabled: false,
      basic_paise: 0,
      premium_paise: 0,
      split: { infra_pct: 0, l1_pct: 0, l2_pct: 0, buffer_pct: 100 },
      valid: true,
    };
  }
}

// The fee in paise for a tier given a config. Unknown tier → null.
function amountForTier(tier, cfg) {
  if (!cfg) return null;
  if (tier === 'basic') return cfg.basic_paise;
  if (tier === 'premium') return cfg.premium_paise;
  return null;
}

// ---------------------------------------------------------------------------
// R2 HOOK POINT — the zero-burn referral-chain accrual.
//
// Called exactly once, right after an enrolment row transitions pending -> paid
// (see enrolment.controller confirm). Delegates to the fee-funded L1/L2 chain
// accrual, which splits the fee just collected across the peer referral chain
// from the split snapshot captured on the enrolment row (zero platform burn).
//
// It NEVER throws into the request path: accrueEnrolmentChainRewards is itself
// best-effort and never throws, and this wrapper catches anyway, so an accrual
// failure can never fail a payment that already succeeded at Razorpay.
//
// The require is LAZY (inside the function) to avoid a circular require between
// enrolment.js and referral.js — referral.accrueEnrolmentChainRewards in turn
// lazily requires this module for the live-config split fallback.
async function onEnrolmentPaid(shopId, enrolmentId) {
  try {
    const { accrueEnrolmentChainRewards } = require('./referral');
    return await accrueEnrolmentChainRewards(shopId, enrolmentId);
  } catch (e) {
    return { accrued: false, reason: 'error', error: e.message };
  }
}

module.exports = {
  getEnrolmentConfig,
  amountForTier,
  onEnrolmentPaid,
};
