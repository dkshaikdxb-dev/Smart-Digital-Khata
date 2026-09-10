const { query } = require('../config/db');

// Branded Store config helpers (batch STORE1). The pricing and the on/off flag
// live in platform_settings (migration 0056) and are read LIVE from the DB so a
// just-saved admin change is honoured immediately — the same style as
// shopPromo.getShopPromoConfig() / enrolment.getEnrolmentConfig().
//
// The whole feature is disabled-safe: on any DB/parse error, or an unparseable
// value, getBrandedStoreConfig() reports enabled:false with a zero price, so a
// malformed setting can never produce a free or negative activation. Money is
// integer paise throughout.

// A finite, > 0 integer or the given fallback. A price must be strictly positive
// (a 0/negative price would let a shop unlock the theme for nothing).
function clampPosInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Hard ceiling on the buyable window regardless of the setting, so a fat-fingered
// admin value (e.g. 100000) can never let a shop lock in premium for years.
const MAX_DAYS_CEILING = 365;

// The live Branded Store config from platform_settings. Never throws — on any
// error it returns a safe, disabled config so the feature stays dormant.
//
// Returns { enabled, credits_per_day_paise, max_days }.
async function getBrandedStoreConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('branded_store_enabled','branded_store_credits_per_day_paise','branded_store_max_days')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    // Default-safe: a missing/blank flag reads as disabled, not enabled.
    const enabled = m.branded_store_enabled === 'true';
    const perDay = clampPosInt(m.branded_store_credits_per_day_paise, 0);
    const maxDays = Math.min(clampPosInt(m.branded_store_max_days, 0), MAX_DAYS_CEILING);

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

module.exports = { getBrandedStoreConfig, MAX_DAYS_CEILING };
