const { query } = require('../config/db');

// Consumer pre-pay / advance config helpers (batch WALLET1). The on/off flag and
// the per-shop advance ceiling live in platform_settings (migration 0057) and are
// read LIVE from the DB so a just-saved admin change is honoured immediately — the
// same style as shopPromo.getShopPromoConfig() / brandedStore.getBrandedStoreConfig().
//
// Disabled-safe: on any DB/parse error, or an unparseable/blank flag, the config
// reports enabled:false with a zero cap, so a malformed setting can NEVER silently
// let a customer build an unbounded advance. Money is integer paise throughout.

// A hard ceiling on the advance cap regardless of the setting, so a fat-fingered
// admin value (e.g. 100000000) can never let a single mistyped recharge park an
// absurd advance at one shop. ₹1,00,000 in paise.
const MAX_ADVANCE_CEILING = 10000000;

// A finite, >= 0 integer or the given fallback. The cap may be 0 (which, with the
// guard below, means "no advance beyond the due is allowed").
function clampNonNegInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// The live consumer pre-pay config from platform_settings. Never throws — on any
// error it returns a safe, disabled config so the feature stays dormant and the
// old `amount > balance` rejection holds.
//
// Returns { enabled, max_advance_paise }.
async function getConsumerPrepayConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('consumer_prepay_enabled','consumer_prepay_max_advance_paise')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    // Default-safe: a missing/blank flag reads as disabled, not enabled.
    const enabled = m.consumer_prepay_enabled === 'true';
    const maxAdvance = Math.min(
      clampNonNegInt(m.consumer_prepay_max_advance_paise, 0),
      MAX_ADVANCE_CEILING
    );

    return {
      // A zero cap makes pre-pay unusable even if the flag says enabled — treat it
      // as disabled so callers keep the old "no overpay" behaviour.
      enabled: enabled && maxAdvance > 0,
      max_advance_paise: maxAdvance,
    };
  } catch (_e) {
    return { enabled: false, max_advance_paise: 0 };
  }
}

module.exports = { getConsumerPrepayConfig, MAX_ADVANCE_CEILING };
