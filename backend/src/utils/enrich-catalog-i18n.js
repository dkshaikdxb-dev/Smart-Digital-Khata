#!/usr/bin/env node
/**
 * Catalog i18n enricher — BUILD-TIME, deterministic, offline.
 *
 *   npm run enrich:catalog-i18n
 *
 * WHAT THIS DOES (and does not):
 *   For every translation row in src/data/catalog-i18n.json that has a native
 *   `name`, it DETERMINISTICALLY TRANSLITERATES the native script -> Roman
 *   (script conversion, ISO-15919/IAST folded to plain ASCII) to produce
 *   candidate romanized search-alias tokens, then UNION-APPENDS the new tokens
 *   onto the existing `aliases`. It writes the result to a SEPARATE review file
 *   `src/data/catalog-i18n.enriched-candidate.json` (same shape) and NEVER
 *   mutates the live `catalog-i18n.json`.
 *
 *   This is transliteration (deterministic, no ML, no network), NOT translation.
 *   It does not, and cannot here, invent MEANING for missing languages — see the
 *   "Honest gaps" note at the bottom of this file.
 *
 * SAFETY INVARIANTS (verified by tests/enrich-catalog-i18n.test.js):
 *   - `name` is copied verbatim; the script NEVER rewrites a human name.
 *   - existing alias tokens are NEVER dropped; only NEW tokens are appended.
 *   - a candidate row is marked `needs_review: true` IFF the script actually
 *     added tokens to it, so a human verifies the machine additions. Rows the
 *     script did not touch keep their original `needs_review` value.
 *   - Urdu (`ur`, Arabic script) is SKIPPED and left byte-for-byte untouched —
 *     Arabic-script -> Roman is not reliably deterministic with these tools.
 *   - Idempotent: re-running yields the same candidate; enriching an already
 *     enriched candidate appends nothing new.
 *
 * Nothing here reaches production automatically. The operator path is:
 *   review candidate -> promote into catalog-i18n.json -> `npm run
 *   import:catalog-i18n` -> `npm run refresh:search-text`.
 */
const fs = require('fs');
const path = require('path');

// Native script per language, as understood by the transliteration engine.
// Urdu is intentionally ABSENT: Arabic-script transliteration is skipped.
const SCRIPT_BY_LANG = Object.freeze({
  hi: 'devanagari',
  ta: 'tamil',
  te: 'telugu',
  kn: 'kannada',
  ml: 'malayalam',
});

// Languages we never transliterate (leave untouched).
const SKIP_LANGS = Object.freeze(['ur']);

/**
 * Deterministically fold an IAST/ISO-15919 string (which carries diacritics
 * like ā ṇ ṣ ṃ) down to plain lowercase ASCII search tokens, mapping the Indic
 * phonemes to the roman spellings people actually type. Pure and total.
 */
function foldIastToAscii(s) {
  if (s == null) return '';
  // Explicit phoneme folds first (retroflex sibilants -> "sh", anusvara -> "m",
  // vocalic r -> "ri", etc.) so we don't lose those distinctions when the
  // generic combining-mark strip runs.
  const MAP = {
    ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o',
    ṛ: 'ri', ṝ: 'ri', ḷ: 'l', ḹ: 'l',
    ṃ: 'm', ṁ: 'm', ḥ: 'h',
    ṅ: 'n', ñ: 'n', ṇ: 'n',
    ṭ: 't', ḍ: 'd', ḻ: 'l', ṟ: 'r', ṉ: 'n',
    ś: 'sh', ṣ: 'sh',
  };
  let out = '';
  for (const ch of s.toLowerCase()) {
    out += Object.prototype.hasOwnProperty.call(MAP, ch) ? MAP[ch] : ch;
  }
  // Drop any residual combining marks, then keep only [a-z0-9] and spaces.
  return out
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A minimal, well-tested Devanagari -> ASCII fallback used ONLY if the preferred
 * transliteration library cannot be loaded. It is deliberately small and covers
 * just Devanagari (hi); it does NOT attempt other scripts (we would rather skip
 * than emit sloppy multi-script guesses). Independent-vowel, matra, consonant
 * and virama handling is enough to romanize catalog names.
 */
const DEVANAGARI_FALLBACK = (() => {
  const INDEP = {
    'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऍ': 'e', 'ऑ': 'o',
  };
  const MATRA = {
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o',
  };
  const CONS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'ळ': 'l',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
  };
  const VIRAMA = '्';
  const ANUSVARA = 'ं'; // ं -> m
  const CHANDRA = 'ँ'; // ँ -> n
  const NUKTA = '़';
  const romanize = (text) => {
    let out = '';
    const chars = Array.from(String(text));
    for (let i = 0; i < chars.length; i += 1) {
      let ch = chars[i];
      // Fold a following nukta into the base consonant when we know the pair.
      if (i + 1 < chars.length && chars[i + 1] === NUKTA && CONS[ch + NUKTA]) {
        ch += NUKTA;
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(CONS, ch)) {
        out += CONS[ch];
        // Inherent 'a' unless a matra/virama/another sign follows.
        const nxt = chars[i + 1];
        const suppressed = nxt === VIRAMA
          || Object.prototype.hasOwnProperty.call(MATRA, nxt);
        if (!suppressed) out += 'a';
      } else if (Object.prototype.hasOwnProperty.call(MATRA, ch)) {
        out += MATRA[ch];
      } else if (Object.prototype.hasOwnProperty.call(INDEP, ch)) {
        out += INDEP[ch];
      } else if (ch === ANUSVARA) {
        out += 'm';
      } else if (ch === CHANDRA) {
        out += 'n';
      } else if (ch === VIRAMA || ch === NUKTA) {
        // handled inline / silent
      } else if (/\s/.test(ch)) {
        out += ' ';
      }
      // Anything else (unknown sign) is dropped.
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  return { langs: { hi: true }, romanize };
})();

/**
 * Resolve the transliteration engine. Prefers the verified deterministic library
 * `@indic-transliteration/sanscript` (a build-time devDependency, pure JS, no ML,
 * no network — and NOT shipped to the runtime image, which installs with
 * `npm ci --omit=dev`). Falls back to the minimal Devanagari romanizer above if
 * the library cannot be required, so the script still runs (hi only) and the
 * caller can see, honestly, that coverage degraded.
 *
 * The returned engine exposes `romanize(nativeText, lang) -> asciiString | null`
 * (null when the engine cannot handle that language's script). This is the
 * documented seam: swap in any deterministic romanizer without touching the
 * enrichment logic.
 */
function resolveEngine() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const lib = require('@indic-transliteration/sanscript');
    return {
      name: 'sanscript',
      romanize(nativeText, lang) {
        const scheme = SCRIPT_BY_LANG[lang];
        if (!scheme) return null;
        const iast = lib.t(String(nativeText), scheme, 'iast');
        return foldIastToAscii(iast);
      },
    };
  } catch (err) {
    return {
      name: 'devanagari-fallback',
      degraded: true,
      reason: err && err.message,
      romanize(nativeText, lang) {
        if (lang !== 'hi') return null; // only Devanagari in the fallback
        return foldIastToAscii(DEVANAGARI_FALLBACK.romanize(nativeText));
      },
    };
  }
}

/** Split an aliases string into a normalized token list (order preserved). */
function tokenize(aliases) {
  if (!aliases) return [];
  return String(aliases)
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Deterministic ASCII candidate tokens for one native name. */
function candidateTokens(name, lang, engine) {
  const roman = engine.romanize(name, lang);
  if (!roman) return [];
  const seen = new Set();
  const tokens = [];
  for (const t of roman.split(/\s+/)) {
    const tok = t.trim();
    if (tok && /^[a-z0-9]+$/.test(tok) && !seen.has(tok)) {
      seen.add(tok);
      tokens.push(tok);
    }
  }
  return tokens;
}

/**
 * Enrich one translation object for a given lang. Returns { translation, added }
 * where `translation` is a NEW object (the input is never mutated) and `added`
 * is the count of new alias tokens appended. Guarantees:
 *   - name is copied verbatim,
 *   - all existing alias tokens are preserved in original order,
 *   - only tokens not already present are appended,
 *   - skipped langs / empty names return the translation unchanged (added=0).
 */
function enrichTranslation(lang, t, engine) {
  const clone = { ...t };
  if (!t || !t.name || SKIP_LANGS.includes(lang) || !SCRIPT_BY_LANG[lang]) {
    return { translation: clone, added: 0 };
  }
  const existing = tokenize(t.aliases);
  const existingSet = new Set(existing);
  const additions = [];
  for (const tok of candidateTokens(t.name, lang, engine)) {
    if (!existingSet.has(tok)) {
      existingSet.add(tok);
      additions.push(tok);
    }
  }
  if (additions.length === 0) {
    return { translation: clone, added: 0 };
  }
  clone.aliases = existing.concat(additions).join(' ');
  clone.needs_review = true; // machine additions must be human-verified
  return { translation: clone, added: additions.length };
}

/**
 * Enrich an array of catalog-i18n rows. Pure: returns a NEW array; the input is
 * never mutated. Returns { rows, stats } where stats summarizes what happened.
 */
function enrichCatalogRows(rows, { engine } = {}) {
  const eng = engine || resolveEngine();
  const stats = {
    engine: eng.name,
    degraded: Boolean(eng.degraded),
    termsSeen: 0,
    translationsSeen: 0,
    rowsModified: 0,
    tokensAdded: 0,
    skippedUrdu: 0,
    perLang: {},
  };
  const out = (rows || []).map((row) => {
    if (!row || !row.translations) return row;
    stats.termsSeen += 1;
    const translations = {};
    for (const [lang, t] of Object.entries(row.translations)) {
      stats.translationsSeen += 1;
      if (SKIP_LANGS.includes(lang)) {
        stats.skippedUrdu += 1;
        translations[lang] = { ...t }; // untouched copy
        continue;
      }
      const { translation, added } = enrichTranslation(lang, t, eng);
      translations[lang] = translation;
      if (added > 0) {
        stats.rowsModified += 1;
        stats.tokensAdded += added;
        stats.perLang[lang] = (stats.perLang[lang] || 0) + added;
      }
    }
    return { ...row, translations };
  });
  return { rows: out, stats };
}

const LIVE_FILE = path.join(__dirname, '..', 'data', 'catalog-i18n.json');
const CANDIDATE_FILE = path.join(__dirname, '..', 'data', 'catalog-i18n.enriched-candidate.json');

function main() {
  if (!fs.existsSync(LIVE_FILE)) {
    console.error(`Catalog i18n dataset not found at ${LIVE_FILE}`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8'));
  const engine = resolveEngine();
  const { rows: enriched, stats } = enrichCatalogRows(rows, { engine });

  // Pretty-print with a trailing newline; UTF-8, no BOM, no NUL.
  fs.writeFileSync(CANDIDATE_FILE, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');

  console.log('✓ Catalog i18n enrichment candidate written.');
  console.log(`  engine           : ${stats.engine}${stats.degraded ? ' (DEGRADED fallback — hi only)' : ''}`);
  console.log(`  terms            : ${stats.termsSeen}`);
  console.log(`  translations     : ${stats.translationsSeen}`);
  console.log(`  rows modified    : ${stats.rowsModified}`);
  console.log(`  tokens appended  : ${stats.tokensAdded}`);
  console.log(`  per-lang added   : ${JSON.stringify(stats.perLang)}`);
  console.log(`  urdu skipped     : ${stats.skippedUrdu}`);
  console.log(`  candidate file   : ${CANDIDATE_FILE}`);
  console.log('  NOTE: live catalog-i18n.json is UNCHANGED. Review the candidate,');
  console.log('        promote it into catalog-i18n.json, then run:');
  console.log('        npm run import:catalog-i18n && npm run refresh:search-text');
}

if (require.main === module) {
  main();
}

module.exports = {
  SCRIPT_BY_LANG,
  SKIP_LANGS,
  foldIastToAscii,
  DEVANAGARI_FALLBACK,
  resolveEngine,
  tokenize,
  candidateTokens,
  enrichTranslation,
  enrichCatalogRows,
  LIVE_FILE,
  CANDIDATE_FILE,
};
