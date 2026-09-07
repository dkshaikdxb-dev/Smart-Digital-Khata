// Neural machine-translation SEAM for dynamic-content translation (v2 item 9).
//
// This is deliberately a SEAM, not a live integration. It ships OFF by default:
// `enabled()` reads process.env.BHASHINI_NMT and is false unless it is exactly
// '1', and `translate()` returns null whenever disabled. There is NO HTTP client,
// NO endpoint and NO credentials here — the local-first contract is that the cache
// plus an English/source fallback always answer, and the network is touched only
// when an operator explicitly turns the seam on AND a real provider is wired in.
//
// TODO(first-party): when neural MT is enabled, do NOT call a third-party service
// directly from this hot-adjacent code. Route through a FIRST-PARTY backend proxy
// (our own service that holds the Bhashini credentials, applies quota/timeout, and
// is never invoked on the product-search path) and translate the null return below
// into a call to that proxy. Until that proxy exists, this stays a no-op seam so no
// live call and no credential can leak in.

// enabled() — the single source of truth for whether the seam is live. Default
// false; only the exact string '1' turns it on.
function enabled() {
  return process.env.BHASHINI_NMT === '1';
}

// translate({ text, sourceLang, targetLang }) → Promise<string|null>.
// Returns null when the seam is disabled (the default), so the caller degrades to
// the cached English/source fallback. When a first-party proxy is wired in (see
// the TODO above), the enabled branch will await that proxy and return its text or
// null on any failure — it must NEVER throw and NEVER make a direct third-party
// call from here.
async function translate({ text, sourceLang, targetLang } = {}) {
  if (!enabled()) return null;
  // No provider is wired in yet. Returning null keeps the fallback path intact
  // even if the flag is flipped on before the first-party proxy lands.
  return null;
}

module.exports = { enabled, translate };
