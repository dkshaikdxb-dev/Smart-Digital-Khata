#!/usr/bin/env node
/**
 * Shop-name localization — pure, deterministic, offline, no ML, no network.
 *
 * The problem: a shop's NAME stayed in English while the rest of the app renders
 * in the customer's language, so the two were visibly out of sync. This module
 * renders an English shop name into a native script DETERMINISTICALLY, with an
 * always-available English fallback and a needs_review flag so the human-in-loop
 * (the owner override UI) can correct proper nouns.
 *
 * WHY HYBRID (dictionary + transliteration), not pure transliteration:
 *   Raw English->Indic ITRANS transliteration produces garbage for the recurring
 *   business words because English spelling is not phonetic
 *   ("Store" -> स्तोरे, "General" -> गेनेरल्, "Provision" -> प्रोविसिओन्). So we:
 *     1. NORMALIZE the closed set of recurring Indian shop words via a curated
 *        per-language BUSINESS_LEXICON (natural native script, human-picked); and
 *     2. best-effort TRANSLITERATE the remaining proper-noun tokens with
 *        @indic-transliteration/sanscript (ITRANS -> native script); and
 *     3. mark the WHOLE name needs_review=true whenever a proper-noun token had
 *        to be transliterated (fully-lexicon names stay trusted); and
 *     4. always fall back to the raw English name for en / ur / any language with
 *        no native script here.
 *   Verified: "Sri Balaji General Stores" -> श्री बलजि जनरल स्टोर;
 *             "New Bharat Provision"       -> न्यू भरत् प्रोविज़न.
 *
 * DEPENDENCY NOTE:
 *   @indic-transliteration/sanscript is a runtime `dependency` (pure JS,
 *   deterministic, no network, no ML), so it is present in production too —
 *   `npm ci --omit=dev` installs it — and the normal path ALWAYS transliterates
 *   proper nouns into native script (no English/native mix). The require is
 *   still wrapped DEFENSIVELY as a never-throw safety net: if the module somehow
 *   cannot be loaded, the util degrades to keeping the curated business words in
 *   native script, the proper-noun token verbatim, and flags the name
 *   needs_review — it never throws and never fails signup/rename. (The same
 *   library is also used by the build-time-only enrich-catalog-i18n util.)
 *
 * Nothing here performs I/O; the DB helper `reseedShopName` at the bottom is the
 * only side-effecting export and it operates purely on an injected client.
 */

// Native script per language, as understood by the transliteration engine.
// Kept identical to enrich-catalog-i18n.js so both i18n paths agree on coverage.
// Urdu (ur, Arabic script) is intentionally absent: Roman->Arabic-script is not
// reliably deterministic with these tools, so ur falls back to the English name.
const SCRIPT_BY_LANG = Object.freeze({
  hi: 'devanagari',
  ta: 'tamil',
  te: 'telugu',
  kn: 'kannada',
  ml: 'malayalam',
});

// The closed set of languages we render a native shop name into: the non-'en',
// non-'ur' languages that have a native script above. This matches the existing
// transliteration coverage (bn/gu/mr are deliberately NOT here — they have no
// script mapping and no catalog transliteration today).
const RENDER_LANGS = Object.freeze(Object.keys(SCRIPT_BY_LANG));

/**
 * BUSINESS_LEXICON — the curated, closed dictionary of recurring Indian shop
 * words, in natural native script per language. These are human-picked
 * (loanwords kept sensible) so that a name built ENTIRELY from these words needs
 * no review. Keys are the stripped, lowercased ASCII form of the word.
 *
 * The Devanagari (hi) forms are review-grade. The ta/te/kn/ml forms are natural
 * loanword spellings that a native speaker should still spot-check; the owner
 * override UI is the correction path for anything that reads awkwardly.
 */
const BUSINESS_LEXICON = Object.freeze({
  hi: Object.freeze({
    store: 'स्टोर', stores: 'स्टोर', kirana: 'किराना', general: 'जनरल',
    provision: 'प्रोविज़न', provisions: 'प्रोविज़न', traders: 'ट्रेडर्स',
    medical: 'मेडिकल', medicals: 'मेडिकल', mart: 'मार्ट', bakery: 'बेकरी',
    sweets: 'स्वीट्स', dairy: 'डेयरी', electronics: 'इलेक्ट्रॉनिक्स',
    hardware: 'हार्डवेयर', supermarket: 'सुपरमार्केट', enterprises: 'एंटरप्राइज़ेज़',
    agencies: 'एजेंसीज़', shop: 'शॉप', new: 'न्यू', sri: 'श्री', shri: 'श्री',
    super: 'सुपर', fresh: 'फ्रेश', cool: 'कूल', point: 'पॉइंट', center: 'सेंटर',
    centre: 'सेंटर', and: 'एंड',
  }),
  ta: Object.freeze({
    store: 'ஸ்டோர்', stores: 'ஸ்டோர்', kirana: 'கிராணா', general: 'ஜெனரல்',
    provision: 'புரோவிஷன்', provisions: 'புரோவிஷன்', traders: 'ட்ரேடர்ஸ்',
    medical: 'மெடிக்கல்', medicals: 'மெடிக்கல்', mart: 'மார்ட்', bakery: 'பேக்கரி',
    sweets: 'ஸ்வீட்ஸ்', dairy: 'டெய்ரி', electronics: 'எலக்ட்ரானிக்ஸ்',
    hardware: 'ஹார்ட்வேர்', supermarket: 'சூப்பர்மார்க்கெட்', enterprises: 'என்டர்பிரைசஸ்',
    agencies: 'ஏஜென்சீஸ்', shop: 'ஷாப்', new: 'நியூ', sri: 'ஸ்ரீ', shri: 'ஸ்ரீ',
    super: 'சூப்பர்', fresh: 'ஃப்ரெஷ்', cool: 'கூல்', point: 'பாயிண்ட்', center: 'சென்டர்',
    centre: 'சென்டர்', and: 'அண்ட்',
  }),
  te: Object.freeze({
    store: 'స్టోర్', stores: 'స్టోర్', kirana: 'కిరాణా', general: 'జనరల్',
    provision: 'ప్రొవిజన్', provisions: 'ప్రొవిజన్', traders: 'ట్రేడర్స్',
    medical: 'మెడికల్', medicals: 'మెడికల్', mart: 'మార్ట్', bakery: 'బేకరీ',
    sweets: 'స్వీట్స్', dairy: 'డెయిరీ', electronics: 'ఎలక్ట్రానిక్స్',
    hardware: 'హార్డ్వేర్', supermarket: 'సూపర్మార్కెట్', enterprises: 'ఎంటర్ప్రైజెస్',
    agencies: 'ఏజెన్సీస్', shop: 'షాప్', new: 'న్యూ', sri: 'శ్రీ', shri: 'శ్రీ',
    super: 'సూపర్', fresh: 'ఫ్రెష్', cool: 'కూల్', point: 'పాయింట్', center: 'సెంటర్',
    centre: 'సెంటర్', and: 'అండ్',
  }),
  kn: Object.freeze({
    store: 'ಸ್ಟೋರ್', stores: 'ಸ್ಟೋರ್', kirana: 'ಕಿರಾಣಾ', general: 'ಜನರಲ್',
    provision: 'ಪ್ರೊವಿಜನ್', provisions: 'ಪ್ರೊವಿಜನ್', traders: 'ಟ್ರೇಡರ್ಸ್',
    medical: 'ಮೆಡಿಕಲ್', medicals: 'ಮೆಡಿಕಲ್', mart: 'ಮಾರ್ಟ್', bakery: 'ಬೇಕರಿ',
    sweets: 'ಸ್ವೀಟ್ಸ್', dairy: 'ಡೈರಿ', electronics: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್',
    hardware: 'ಹಾರ್ಡ್ವೇರ್', supermarket: 'ಸೂಪರ್ಮಾರ್ಕೆಟ್', enterprises: 'ಎಂಟರ್ಪ್ರೈಸಸ್',
    agencies: 'ಏಜೆನ್ಸೀಸ್', shop: 'ಶಾಪ್', new: 'ನ್ಯೂ', sri: 'ಶ್ರೀ', shri: 'ಶ್ರೀ',
    super: 'ಸೂಪರ್', fresh: 'ಫ್ರೆಶ್', cool: 'ಕೂಲ್', point: 'ಪಾಯಿಂಟ್', center: 'ಸೆಂಟರ್',
    centre: 'ಸೆಂಟರ್', and: 'ಅಂಡ್',
  }),
  ml: Object.freeze({
    store: 'സ്റ്റോർ', stores: 'സ്റ്റോർ', kirana: 'കിരാണ', general: 'ജനറൽ',
    provision: 'പ്രൊവിഷൻ', provisions: 'പ്രൊവിഷൻ', traders: 'ട്രേഡേഴ്സ്',
    medical: 'മെഡിക്കൽ', medicals: 'മെഡിക്കൽ', mart: 'മാർട്ട്', bakery: 'ബേക്കറി',
    sweets: 'സ്വീറ്റ്സ്', dairy: 'ഡെയറി', electronics: 'ഇലക്ട്രോണിക്സ്',
    hardware: 'ഹാർഡ്വെയർ', supermarket: 'സൂപ്പർമാർക്കറ്റ്', enterprises: 'എന്റർപ്രൈസസ്',
    agencies: 'ഏജൻസീസ്', shop: 'ഷോപ്പ്', new: 'ന്യൂ', sri: 'ശ്രീ', shri: 'ശ്രീ',
    super: 'സൂപ്പർ', fresh: 'ഫ്രഷ്', cool: 'കൂൾ', point: 'പോയിന്റ്', center: 'സെന്റർ',
    centre: 'സെന്റർ', and: 'ആൻഡ്',
  }),
});

/**
 * Resolve the transliteration engine using @indic-transliteration/sanscript
 * (a runtime dependency: deterministic, pure JS, no ML, no network). Returns an
 * object exposing `transliterate(asciiToken, lang) -> nativeString | null`,
 * where null means the engine could not handle that language's script. The
 * require is wrapped only as a never-throw safety net; in production the library
 * is installed (`npm ci --omit=dev` keeps it), so the normal path always
 * transliterates. Cached after the first resolve so the require cost is paid once.
 */
let _engine;
function resolveEngine() {
  if (_engine !== undefined) return _engine;
  try {
    // eslint-disable-next-line global-require
    const lib = require('@indic-transliteration/sanscript');
    _engine = {
      name: 'sanscript',
      available: true,
      transliterate(token, lang) {
        const scheme = SCRIPT_BY_LANG[lang];
        if (!scheme) return null;
        // ITRANS is a Roman input scheme; sanscript maps it phonetically into the
        // target Indic script. Best-effort for arbitrary English proper nouns.
        return lib.t(String(token), 'itrans', scheme);
      },
    };
  } catch (err) {
    // Safety net only — sanscript is a runtime dependency, so this should not
    // happen in a correctly installed image. If it ever does, degrade instead of
    // throwing: business words still localize via the lexicon, proper nouns stay
    // Roman and the name is flagged needs_review.
    _engine = {
      name: 'unavailable',
      available: false,
      reason: err && err.message,
      transliterate() {
        return null;
      },
    };
  }
  return _engine;
}

// Per-script virama (halant) — a combining mark that suppresses the inherent
// vowel. Used only for the conservative trailing-cleanup below.
const VIRAMA_BY_SCRIPT = Object.freeze({
  devanagari: '्', tamil: '்', telugu: '్',
  kannada: '್', malayalam: '്',
});

/**
 * Conservative cleanup of a single transliterated token. Deliberately minimal
 * (the enrich util's careful folding is the reference for "small and safe"):
 *   - strip NUL / C0 control characters and normalize whitespace, and
 *   - collapse a DOUBLED trailing virama down to one (a genuine transliterator
 *     artefact) — but a single word-final virama is LEFT INTACT, because the
 *     verified reference output keeps it ("Bharat" -> भरत्). Never throws; never
 *     rewrites the phonemes of a name.
 */
function cleanTranslit(token, lang) {
  if (token == null) return '';
  let out = String(token)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const v = VIRAMA_BY_SCRIPT[SCRIPT_BY_LANG[lang]];
  if (v) {
    // Only fold a stray DOUBLE virama; keep a single trailing one.
    const dbl = new RegExp(`${v}${v}+`, 'g');
    out = out.replace(dbl, v);
  }
  return out;
}

// The stripped, lowercased ASCII lookup key for a token (letters only). Empty
// for a purely non-alphabetic token (digits, '&', '-', already-native script).
function lexKey(token) {
  return String(token == null ? '' : token).toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Localize one English shop name into `lang`. Pure and total.
 * Returns { name, needsReview }:
 *   - en / ur / any lang without a native script here -> the English name
 *     verbatim, needsReview=false (English is ALWAYS the fallback).
 *   - otherwise: tokenize on whitespace (order preserved, joined by single
 *     spaces); each token is either a curated lexicon word, a transliterated
 *     proper noun (marks the whole name needsReview=true), or a non-alpha token
 *     passed through unchanged ('&' and the word 'and' map via the lexicon).
 */
function localizeShopName(englishName, lang) {
  const raw = englishName == null ? '' : String(englishName);
  const l = (lang || '').trim().toLowerCase();

  // English fallback for the base language, Arabic-script Urdu, and anything we
  // do not have a native script for.
  if (!SCRIPT_BY_LANG[l]) {
    return { name: raw, needsReview: false };
  }

  const lexicon = BUSINESS_LEXICON[l] || {};
  const engine = resolveEngine();

  // Whitespace tokens; drop the empties from leading/trailing/multiple spaces.
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    // Empty / whitespace-only input: nothing to localize, English passthrough.
    return { name: raw, needsReview: false };
  }

  let needsReview = false;
  const rendered = tokens.map((token) => {
    const key = lexKey(token);

    // Non-alpha token ('&', digits, '-', or already-native input): '&' and the
    // literal word 'and' localize via the lexicon; everything else passes
    // through byte-for-byte (this also leaves already-native-script input alone).
    if (!key) {
      if (token === '&' && lexicon.and) return lexicon.and;
      return token;
    }

    // Curated business word — trusted, no review needed for this token.
    if (Object.prototype.hasOwnProperty.call(lexicon, key)) {
      return lexicon[key];
    }

    // Proper-noun remainder: best-effort transliteration. A machine-produced
    // token means the whole name should be human-reviewed.
    const native = engine.transliterate(key, l);
    if (native && native.trim()) {
      needsReview = true;
      return cleanTranslit(native, l);
    }

    // Safety net: engine unavailable (should not happen — sanscript is a runtime
    // dependency) or it produced nothing. Keep the Roman token so the name is
    // still readable, and flag for review.
    needsReview = true;
    return token;
  });

  return { name: rendered.join(' '), needsReview };
}

/**
 * Render an English name into every requested language. `activeLangs` is the set
 * of language codes to render into (typically RENDER_LANGS or the active subset
 * of it). Unknown/duplicate codes are ignored; en/ur are skipped (English
 * fallback needs no stored row). Returns a { [lang]: { name, needsReview } } map.
 * Pure and total.
 */
function renderAllLangs(englishName, activeLangs) {
  const langs = Array.isArray(activeLangs) ? activeLangs : RENDER_LANGS;
  const out = {};
  for (const lang of langs) {
    const l = (lang || '').trim().toLowerCase();
    if (!SCRIPT_BY_LANG[l] || Object.prototype.hasOwnProperty.call(out, l)) continue;
    out[l] = localizeShopName(englishName, l);
  }
  return out;
}

/**
 * Resolve which render languages are ACTIVE, from the `languages` registry,
 * intersected with the closed RENDER_LANGS set. Defensive: any error (missing
 * table, no client) or empty result falls back to the full RENDER_LANGS set, so
 * a seed is never skipped because the registry could not be read. `client` is
 * anything with a .query method (a tx client or the pool).
 */
async function resolveActiveRenderLangs(client) {
  try {
    const r = await client.query(
      `SELECT code FROM languages
        WHERE is_active = true AND code = ANY($1::text[])`,
      [RENDER_LANGS.slice()]
    );
    const active = r.rows.map((row) => row.code).filter((c) => SCRIPT_BY_LANG[c]);
    return active.length ? active : RENDER_LANGS.slice();
  } catch (err) {
    return RENDER_LANGS.slice();
  }
}

/**
 * (Re)seed shop_name_i18n for one shop from its English name. Side-effecting:
 * runs against the injected `client` (a tx client or the pool). UPSERTs an
 * 'auto' row per active render language, and NEVER clobbers a row an owner has
 * manually set (source='owner') — the ON CONFLICT update is guarded to
 * source='auto' only. Idempotent. Callers wrap this defensively so a failure
 * here can never fail signup / rename.
 */
async function reseedShopName(client, shopId, englishName) {
  const langs = await resolveActiveRenderLangs(client);
  const rendered = renderAllLangs(englishName, langs);
  for (const [lang, { name, needsReview }] of Object.entries(rendered)) {
    if (!name) continue; // never store an empty native name
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO shop_name_i18n (shop_id, lang, name, source, needs_review, updated_at)
       VALUES ($1, $2, $3, 'auto', $4, NOW())
       ON CONFLICT (shop_id, lang) DO UPDATE
         SET name = EXCLUDED.name,
             source = 'auto',
             needs_review = EXCLUDED.needs_review,
             updated_at = NOW()
       WHERE shop_name_i18n.source = 'auto'`,
      [shopId, lang, name, needsReview]
    );
  }
}

module.exports = {
  SCRIPT_BY_LANG,
  RENDER_LANGS,
  BUSINESS_LEXICON,
  resolveEngine,
  cleanTranslit,
  localizeShopName,
  renderAllLangs,
  resolveActiveRenderLangs,
  reseedShopName,
};
