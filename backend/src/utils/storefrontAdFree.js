const { query } = require('../config/db');

// Storefront ad-free buy-out config helpers (batch STOREFRONT-FULL). A shop
// spends Khata Credits to keep the sponsored slide OFF its storefront slider for
// a window (shops.storefront_ad_free_until). The pricing and the on/off flag live
// in platform_settings (migration 0063) and are read LIVE from the DB so a
// just-saved admin change is honoured immediately — the same style as
// brandedStore.getBrandedStoreConfig() / shopPromo.getShopPromoConfig().
//
// The whole feature is disabled-safe: on any DB/parse error, or an unparseable
// value, getStorefrontAdFreeConfig() reports enabled:false with a zero price, so
// a malformed setting can never produce a free or negative buy-out. Money is
// integer paise throughout.

// A finite, > 0 integer or the given fallback. A price must be strictly positive
// (a 0/negative price would let a shop remove the slot for nothing).
function clampPosInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Hard ceiling on the buyable window regardless of the setting, so a fat-fingered
// admin value (e.g. 100000) can never let a shop lock out the slot for years.
const MAX_DAYS_CEILING = 365;

// The live buy-out config from platform_settings. Never throws — on any error it
// returns a safe, disabled config so the feature stays dormant.
//
// Returns { enabled, credits_per_day_paise, max_days }.
async function getStorefrontAdFreeConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('storefront_ad_free_enabled','storefront_ad_free_credits_per_day_paise','storefront_ad_free_max_days')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    // Default-safe: a missing/blank flag reads as disabled, not enabled.
    const enabled = m.storefront_ad_free_enabled === 'true';
    const perDay = clampPosInt(m.storefront_ad_free_credits_per_day_paise, 0);
    const maxDays = Math.min(clampPosInt(m.storefront_ad_free_max_days, 0), MAX_DAYS_CEILING);

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

module.exports = { getStorefrontAdFreeConfig, MAX_DAYS_CEILING };
