const { query } = require('../config/db');

// Self-serve shop-promo config helpers (batch PROMO-BUY). The pricing and the
// on/off flag live in platform_settings (migration 0054) and are read LIVE from
// the DB so a just-saved admin change is honoured immediately — the same style as
// enrolment.getEnrolmentConfig() / referral.getRewardRule().
//
// The whole feature is disabled-safe: on any DB/parse error, or an unparseable
// value, getShopPromoConfig() reports enabled:false with a zero price, so a
// malformed setting can never produce a free or negative promo. Money is integer
// paise throughout.

// A finite, > 0 integer or the given fallback. A price must be strictly positive
// (a 0/negative price would let a shop buy a placement for nothing).
function clampPosInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Hard ceiling on the buyable window regardless of the setting, so a fat-fingered
// admin value (e.g. 100000) can never let a shop lock the marketplace for years.
const MAX_DAYS_CEILING = 365;

// The live self-serve promo config from platform_settings. Never throws — on any
// error it returns a safe, disabled config so the feature stays dormant.
//
// Returns { enabled, credits_per_day_paise, max_days }.
async function getShopPromoConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('shop_promo_enabled','shop_promo_credits_per_day_paise','shop_promo_max_days')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    // Default-safe: a missing/blank flag reads as disabled, not enabled.
    const enabled = m.shop_promo_enabled === 'true';
    const perDay = clampPosInt(m.shop_promo_credits_per_day_paise, 0);
    const maxDays = Math.min(clampPosInt(m.shop_promo_max_days, 0), MAX_DAYS_CEILING);

    return {
      // A price of 0 or a window of 0 days makes the feature unusable even if the
      // flag says enabled — treat that as disabled so the UI/endpoints stay locked.
      enabled: enabled && perDay > 0 && maxDays > 0,
      credits_per_day_paise: perDay,
      max_days: maxDays,
    };
  } catch (_e) {
    return { enabled: false, credits_per_day_paise: 0, max_days: 0 };
  }
}

module.exports = { getShopPromoConfig, MAX_DAYS_CEILING };
