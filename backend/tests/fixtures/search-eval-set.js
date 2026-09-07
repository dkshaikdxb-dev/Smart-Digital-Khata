/**
 * Multilingual Native-Language Search Evaluation Set (HARDEN-EVAL).
 *
 * DATA ONLY — no logic, no runtime services, no dependency. This module is the
 * ground truth for `search-eval.test.js`, which seeds CATALOG into the real
 * socket-Postgres harness (catalog_items + catalog_i18n + one listed shop +
 * linked products, then populates products.search_text via
 * refreshProductSearchText) and replays QUERIES through the DEPLOYED
 * `discovery.searchProducts` endpoint to MEASURE Recall@1 / Recall@5. It never
 * changes search behaviour.
 *
 * The set is intentionally easy to extend: add a product to CATALOG (with real
 * native names + romanized aliases per language) or a labelled row to QUERIES.
 *
 * `CATALOG[*]` shape:
 *   key       — stable identifier used by QUERIES `expect` (and to map to the
 *               seeded product id).
 *   term_en   — base English term; this is BOTH catalog_items.product and
 *               catalog_i18n.term_en, so the i18n rows fold into search_text.
 *   brand     — brand string (null when the product line has no brand, e.g. loose
 *               Sugar). Included in search_text verbatim.
 *   pack/unit — structured pack ("1 kg") and unit ("kg"); pack drives the spoken
 *               pack-size search tokens ("1kg", "1000 g", ...) via packVariants.
 *   price     — indicative price in PAISE (integer), per money convention.
 *   i18n      — { hi, ta, te, kn, ml: { name (native script), aliases (space-
 *               separated romanized / alt spellings) } }. Hindi authored
 *               carefully; the four South-Indian languages are reasonable.
 *
 * `QUERIES[*]` shape:
 *   q        — the raw shopper query (native script, romanized, mixed, noisy).
 *   lang     — optional display language passed as ?lang (recall is language-
 *              independent — matching is over the all-language search_text blob —
 *              but we exercise the localized path too).
 *   category — one of the eight labelled buckets (see below).
 *   expect   — for positives, the CATALOG key (or array of keys) whose seeded
 *              product SHOULD be recalled; for negatives, null (no product must
 *              be returned).
 */

// 10 products across common kirana lines. Includes every product the spec calls
// out (Salt/Tata, Rice/India Gate, Milk/Amul, Biscuit/Parle-G, Soap/Lifebuoy,
// Cooking Oil/Fortune, Tea/Tata, Sugar) plus Atta/Aashirvaad and Toor Dal.
const CATALOG = [
  {
    key: 'salt',
    term_en: 'Salt',
    brand: 'Tata',
    pack: '1 kg',
    unit: 'kg',
    price: 3000,
    i18n: {
      hi: { name: 'नमक', aliases: 'namak namk' },
      ta: { name: 'உப்பு', aliases: 'uppu' },
      te: { name: 'ఉప్పు', aliases: 'uppu' },
      kn: { name: 'ಉಪ್ಪು', aliases: 'uppu' },
      ml: { name: 'ഉപ്പ്', aliases: 'uppu' },
    },
  },
  {
    key: 'rice',
    term_en: 'Rice',
    brand: 'India Gate',
    pack: '5 kg',
    unit: 'kg',
    price: 45000,
    i18n: {
      hi: { name: 'चावल', aliases: 'chawal chaawal chaval' },
      ta: { name: 'அரிசி', aliases: 'arisi' },
      te: { name: 'బియ్యం', aliases: 'biyyam' },
      kn: { name: 'ಅಕ್ಕಿ', aliases: 'akki' },
      ml: { name: 'അരി', aliases: 'ari' },
    },
  },
  {
    key: 'milk',
    term_en: 'Milk',
    brand: 'Amul',
    pack: '500 ml',
    unit: 'ml',
    price: 2700,
    i18n: {
      hi: { name: 'दूध', aliases: 'doodh dudh' },
      ta: { name: 'பால்', aliases: 'paal pal' },
      te: { name: 'పాలు', aliases: 'paalu' },
      kn: { name: 'ಹಾಲು', aliases: 'haalu' },
      ml: { name: 'പാൽ', aliases: 'paal' },
    },
  },
  {
    key: 'biscuit',
    term_en: 'Biscuit',
    brand: 'Parle-G',
    pack: '100 g',
    unit: 'g',
    price: 1000,
    i18n: {
      hi: { name: 'बिस्कुट', aliases: 'biskut biscuit' },
      ta: { name: 'பிஸ்கட்', aliases: 'biskat biscuit' },
      te: { name: 'బిస్కెట్', aliases: 'biscuit' },
      kn: { name: 'ಬಿಸ್ಕತ್', aliases: 'biscuit' },
      ml: { name: 'ബിസ്ക്കറ്റ്', aliases: 'biscuit' },
    },
  },
  {
    key: 'soap',
    term_en: 'Soap',
    brand: 'Lifebuoy',
    pack: '125 g',
    unit: 'g',
    price: 3500,
    i18n: {
      hi: { name: 'साबुन', aliases: 'sabun saboon' },
      ta: { name: 'சோப்பு', aliases: 'soap sabun' },
      te: { name: 'సబ్బు', aliases: 'sabbu' },
      kn: { name: 'ಸಾಬೂನು', aliases: 'saabunu sabun' },
      ml: { name: 'സോപ്പ്', aliases: 'soap sabun' },
    },
  },
  {
    key: 'oil',
    term_en: 'Cooking Oil',
    brand: 'Fortune',
    pack: '1 l',
    unit: 'l',
    price: 15000,
    i18n: {
      hi: { name: 'तेल', aliases: 'tel cooking oil' },
      ta: { name: 'எண்ணெய்', aliases: 'ennai' },
      te: { name: 'నూనె', aliases: 'noone' },
      kn: { name: 'ಎಣ್ಣೆ', aliases: 'enne' },
      ml: { name: 'എണ്ണ', aliases: 'enna' },
    },
  },
  {
    key: 'tea',
    term_en: 'Tea',
    brand: 'Tata',
    pack: '250 g',
    unit: 'g',
    price: 12000,
    i18n: {
      hi: { name: 'चाय', aliases: 'chai chaay chaai' },
      ta: { name: 'தேநீர்', aliases: 'tea tee' },
      te: { name: 'టీ', aliases: 'tea chaa' },
      kn: { name: 'ಚಹಾ', aliases: 'chaha tea' },
      ml: { name: 'ചായ', aliases: 'chaaya tea' },
    },
  },
  {
    key: 'sugar',
    term_en: 'Sugar',
    brand: null,
    pack: '1 kg',
    unit: 'kg',
    price: 4500,
    i18n: {
      hi: { name: 'चीनी', aliases: 'cheeni chini shakkar' },
      ta: { name: 'சர்க்கரை', aliases: 'sarkkarai' },
      te: { name: 'చక్కెర', aliases: 'chakkera' },
      kn: { name: 'ಸಕ್ಕರೆ', aliases: 'sakkare' },
      ml: { name: 'പഞ്ചസാര', aliases: 'panchasara' },
    },
  },
  {
    key: 'atta',
    term_en: 'Atta',
    brand: 'Aashirvaad',
    pack: '5 kg',
    unit: 'kg',
    price: 26000,
    i18n: {
      hi: { name: 'आटा', aliases: 'atta aata gehu' },
      ta: { name: 'கோதுமை மாவு', aliases: 'godhumai maavu atta' },
      te: { name: 'గోధుమ పిండి', aliases: 'godhuma pindi atta' },
      kn: { name: 'ಗೋಧಿ ಹಿಟ್ಟು', aliases: 'godhi hittu atta' },
      ml: { name: 'ഗോതമ്പ് പൊടി', aliases: 'gothambu podi atta' },
    },
  },
  {
    key: 'dal',
    term_en: 'Toor Dal',
    brand: null,
    pack: '1 kg',
    unit: 'kg',
    price: 14000,
    i18n: {
      hi: { name: 'तूर दाल', aliases: 'toor dal arhar dal tur dal' },
      ta: { name: 'துவரம் பருப்பு', aliases: 'thuvaram paruppu' },
      te: { name: 'కంది పప్పు', aliases: 'kandi pappu' },
      kn: { name: 'ತೊಗರಿ ಬೇಳೆ', aliases: 'togari bele' },
      ml: { name: 'തുവര പരിപ്പ്', aliases: 'thuvara parippu' },
    },
  },
];

// Labelled query set — all eight categories, >= 3 queries each. `expect` is a
// CATALOG key for positives, null for negatives. Brand-only queries use brands
// that map to exactly one seeded product so `expect` stays unambiguous.
const QUERIES = [
  // --- native: native-script name in some Indian language --------------------
  { q: 'नमक', lang: 'hi', category: 'native', expect: 'salt' },
  { q: 'चावल', lang: 'hi', category: 'native', expect: 'rice' },
  { q: 'பால்', lang: 'ta', category: 'native', expect: 'milk' },
  { q: 'साबुन', lang: 'hi', category: 'native', expect: 'soap' },

  // --- romanized: transliterated native words --------------------------------
  { q: 'tata namak', category: 'romanized', expect: 'salt' },
  { q: 'chawal', category: 'romanized', expect: 'rice' },
  { q: 'amul doodh', category: 'romanized', expect: 'milk' },
  { q: 'sabun', category: 'romanized', expect: 'soap' },

  // --- mixed: brand/English + native word or pack ----------------------------
  { q: 'tata namak 1kg', category: 'mixed', expect: 'salt' },
  { q: 'amul milk', category: 'mixed', expect: 'milk' },
  { q: 'parle biscuit', category: 'mixed', expect: 'biscuit' },
  { q: 'fortune oil', category: 'mixed', expect: 'oil' },

  // --- asr_error: plausible speech-to-text slips -----------------------------
  { q: 'data salt', category: 'asr_error', expect: 'salt' },
  { q: 'tata namaak', category: 'asr_error', expect: 'salt' },
  { q: 'amool doodh', category: 'asr_error', expect: 'milk' },
  { q: 'parlee', category: 'asr_error', expect: 'biscuit' },

  // --- spelling: typo, no correct token --------------------------------------
  { q: 'namk', category: 'spelling', expect: 'salt' },
  { q: 'saltt', category: 'spelling', expect: 'salt' },
  { q: 'biscit', category: 'spelling', expect: 'biscuit' },
  { q: 'chaawal', category: 'spelling', expect: 'rice' },

  // --- packsize: quantity words / units (colloquial mapped) ------------------
  { q: 'salt 1 kg', category: 'packsize', expect: 'salt' },
  { q: 'namak 1 kilo', category: 'packsize', expect: 'salt' },
  { q: 'rice 5kg', category: 'packsize', expect: 'rice' },
  { q: 'ek kilo chawal', category: 'packsize', expect: 'rice' },

  // --- brand: brand-only, expect that brand's single product -----------------
  { q: 'amul', category: 'brand', expect: 'milk' },
  { q: 'parle', category: 'brand', expect: 'biscuit' },
  { q: 'lifebuoy', category: 'brand', expect: 'soap' },
  { q: 'fortune', category: 'brand', expect: 'oil' },

  // --- negative: clearly-absent items, expect NO result ----------------------
  { q: 'bicycle', category: 'negative', expect: null },
  { q: 'helicopter', category: 'negative', expect: null },
  { q: 'zzqwx', category: 'negative', expect: null },
  { q: 'laptop', category: 'negative', expect: null },
];

const CATEGORIES = ['native', 'romanized', 'mixed', 'asr_error', 'spelling', 'packsize', 'brand', 'negative'];

module.exports = { CATALOG, QUERIES, CATEGORIES };
