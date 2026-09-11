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

// The live FREE-request config from platform_settings (migration 0061). A shop may
// REQUEST a promo at no Khata-Credit cost (admin-moderated, throttled). Read LIVE
// like getShopPromoConfig, and just as disabled-safe: on any error, or a malformed
// value, it reports enabled:false so the free path stays dormant. The free path
// never touches the wallet, so there is no price to validate here — only the day
// ceiling and the per-shop concurrency cap.
//
// Returns { enabled, max_days, max_active }.
async function getShopPromoFreeConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('shop_promo_free_enabled','shop_promo_free_max_days','shop_promo_free_max_active')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    // Default-safe: a missing/blank flag reads as disabled, not enabled.
    const enabled = m.shop_promo_free_enabled === 'true';
    const maxDays = Math.min(clampPosInt(m.shop_promo_free_max_days, 0), MAX_DAYS_CEILING);
    const maxActive = clampPosInt(m.shop_promo_free_max_active, 0);

    return {
      // A day ceiling or an active cap of 0 makes the feature unusable even if the
      // flag says enabled — treat that as disabled so the endpoint stays locked.
      enabled: enabled && maxDays > 0 && maxActive > 0,
      max_days: maxDays,
      max_active: maxActive,
    };
  } catch (_e) {
    return { enabled: false, max_days: 0, max_active: 0 };
  }
}

module.exports = { getShopPromoConfig, getShopPromoFreeConfig, MAX_DAYS_CEILING };
