// Cache-first translation service for GENUINELY DYNAMIC content (v2 item 9).
//
// Scope discipline: this is NOT for the static UI (admin-dashboard/src/lib/i18n.js)
// and NOT for the catalogue (catalog_i18n) — both are build-time and already DONE.
// It is also deliberately kept OFF the product-search hot path. It exists for ad-hoc
// dynamic strings (e.g. owner-authored notes/messages) that need a best-effort
// translation with a durable cache and a guaranteed English/source fallback.
//
// Local-first contract:
//   * The cache + English fallback ALWAYS answer — translateDynamic never throws.
//   * The network is touched ONLY when the Bhashini NMT seam is explicitly enabled
//     (process.env.BHASHINI_NMT === '1') AND a real provider is wired in. By default
//     the seam is off (see services/nmtProvider.js) and no call is made.
//   * A cache miss with the seam off caches a NEGATIVE result (provider='fallback',
//     needs_review=false) so warm requests never retry a translation we can't do.
//
// Reuses config/db's query/withTx and node's built-in crypto — no new dependency.

const crypto = require('crypto');
const { query } = require('../config/db');
const nmtProvider = require('./nmtProvider');

// Normalize the source before hashing so trivially-different renderings of the
// same string share one cache row. Trim + collapse internal whitespace; the hash
// is over this normalized form, but the ORIGINAL text is stored in source_text.
function normalizeSource(text) {
  return String(text).trim().replace(/\s+/g, ' ');
}

function sourceHash(normalized, sourceLang) {
  return crypto
    .createHash('sha256')
    .update(`${sourceLang}\n${normalized}`, 'utf8')
    .digest('hex');
}

// translateDynamic(text, targetLang, { sourceLang }) → Promise<string>.
// Always resolves to a usable string; never throws, never touches the network when
// the seam is disabled.
async function translateDynamic(text, targetLang, { sourceLang = 'en' } = {}) {
  // 1) Same language or empty → the source is already the answer; write no row.
  if (text == null || String(text).trim() === '' || targetLang === sourceLang) {
    return text == null ? '' : text;
  }

  const normalized = normalizeSource(text);
  const hash = sourceHash(normalized, sourceLang);

  try {
    // 2) Cache read. The ONLY path that runs on a warm request: a single indexed
    //    SELECT then an UPDATE to bump hit_count. Safe, but STILL never to be
    //    placed on the product-search hot path.
    const hit = await query(
      `SELECT translated FROM dynamic_translations
        WHERE source_hash = $1 AND target_lang = $2`,
      [hash, targetLang]
    );
    if (hit.rowCount) {
      await query(
        `UPDATE dynamic_translations
            SET hit_count = hit_count + 1, updated_at = NOW()
          WHERE source_hash = $1 AND target_lang = $2`,
        [hash, targetLang]
      );
      return hit.rows[0].translated;
    }

    // 3) Cache miss. If the seam is ON, the intended path calls the NMT provider
    //    and caches its output with provider='bhashini', needs_review=true. The
    //    seam is off by default and returns null, so we fall through to the
    //    negative-cache fallback below.
    let translated = null;
    let provider = 'fallback';
    let needsReview = false;
    if (nmtProvider.enabled()) {
      try {
        const out = await nmtProvider.translate({ text: normalized, sourceLang, targetLang });
        if (out != null && String(out).trim() !== '') {
          translated = String(out);
          provider = 'bhashini';
          needsReview = true;
        }
      } catch (_err) {
        // Provider failure degrades to the source fallback — never propagate.
        translated = null;
      }
    }

    // When disabled or the provider returned nothing → cache + return the SOURCE
    // (English/source fallback), stored as a negative result so we don't retry hot.
    if (translated == null) {
      translated = text;
      provider = 'fallback';
      needsReview = false;
    }

    await query(
      `INSERT INTO dynamic_translations
         (source_hash, source_lang, target_lang, source_text, translated, provider, needs_review, hit_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
       ON CONFLICT (source_hash, target_lang) DO NOTHING`,
      [hash, sourceLang, targetLang, text, translated, provider, needsReview]
    );
    return translated;
  } catch (_err) {
    // NEVER throw on translation failure — always degrade to the source text.
    return text;
  }
}

// frequentUnreviewed(limit) → the most-repeated machine translations still awaiting
// human review, so an admin reviews the highest-impact strings first. Read-only.
async function frequentUnreviewed(limit = 50) {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const res = await query(
    `SELECT source_hash, source_lang, target_lang, source_text, translated,
            provider, needs_review, hit_count, created_at, updated_at
       FROM dynamic_translations
      WHERE needs_review = true
      ORDER BY hit_count DESC
      LIMIT $1`,
    [n]
  );
  return res.rows;
}

module.exports = { translateDynamic, frequentUnreviewed, normalizeSource, sourceHash };
