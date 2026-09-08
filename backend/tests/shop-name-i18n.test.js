// Unit tests for the pure shop-name localization util. No DB, no network.
const {
  SCRIPT_BY_LANG,
  RENDER_LANGS,
  BUSINESS_LEXICON,
  SURNAMES,
  localizeShopName,
  renderAllLangs,
  cleanTranslit,
} = require('../src/utils/shop-name-i18n');

describe('shop-name-i18n util', () => {
  test('render language set is exactly hi/ta/te/kn/ml (existing translit coverage)', () => {
    expect(RENDER_LANGS.slice().sort()).toEqual(['hi', 'kn', 'ml', 'ta', 'te']);
    expect(Object.keys(SCRIPT_BY_LANG).sort()).toEqual(['hi', 'kn', 'ml', 'ta', 'te']);
  });

  test('the verified hybrid examples reproduce exactly (hi)', () => {
    // Balaji has no word-final halant to strip, so the transliteration is unchanged.
    expect(localizeShopName('Sri Balaji General Stores', 'hi').name).toBe('श्री बलजि जनरल स्टोर');
    // Bharat -> भरत् loses its single trailing halant under the hi schwa-deletion cleanup.
    expect(localizeShopName('New Bharat Provision', 'hi').name).toBe('न्यू भरत प्रोविज़न');
  });

  test('curated surname + shop-word names render exactly and are TRUSTED (hi)', () => {
    // Every token is a curated surname or business word -> no review needed.
    const cases = [
      ['Sharma Kirana Store', 'शर्मा किराना स्टोर'],
      ['Gupta General Store', 'गुप्ता जनरल स्टोर'],
      ['Patel Provision Mart', 'पटेल प्रोविज़न मार्ट'],
      ['Reddy Super Bazaar', 'रेड्डी सुपर बाज़ार'],
      ['Khan Daily Needs', 'खान डेली नीड्स'],
      ['Iyer Grocery Corner', 'अय्यर ग्रोसरी कॉर्नर'],
      ['Singh Mini Market', 'सिंह मिनी मार्केट'],
      ['Das Family Store', 'दास फैमिली स्टोर'],
      ['Mehta Kirana Bhandar', 'मेहता किराना भंडार'],
      ['Nair Fresh Mart', 'नायर फ्रेश मार्ट'],
    ];
    for (const [en, hi] of cases) {
      const r = localizeShopName(en, 'hi');
      expect(r.name).toBe(hi);
      expect(r.needsReview).toBe(false);
      // fully curated -> no Latin letters survive.
      expect(/[a-z]/i.test(r.name)).toBe(false);
    }
  });

  test('surname spelling variants map to the same curated form (hi)', () => {
    expect(localizeShopName('Reddi Stores', 'hi').name).toBe('रेड्डी स्टोर');
    expect(localizeShopName('Reddy Stores', 'hi').name).toBe('रेड्डी स्टोर');
    expect(localizeShopName('Ayyar Stores', 'hi').name).toBe('अय्यर स्टोर');
    expect(localizeShopName('Iyer Stores', 'hi').name).toBe('अय्यर स्टोर');
  });

  test('a surname hit is trusted in every render language (needsReview=false)', () => {
    const expected = { hi: 'शर्मा', ta: 'ஷர்மா', te: 'శర్మ', kn: 'ಶರ್ಮಾ', ml: 'ശർമ്മ' };
    for (const lang of RENDER_LANGS) {
      const r = localizeShopName('Sharma Kirana Store', lang);
      expect(r.needsReview).toBe(false);
      expect(r.name.startsWith(expected[lang])).toBe(true);
    }
  });

  test('a pure-lexicon name is trusted (needsReview=false) and localized', () => {
    const r = localizeShopName('New Super Bakery', 'hi');
    expect(r.needsReview).toBe(false);
    expect(r.name).toBe('न्यू सुपर बेकरी');
    // every token was a curated lexicon word — no Roman characters remain.
    expect(/[a-z]/i.test(r.name)).toBe(false);
  });

  test('a proper-noun token marks the WHOLE name needsReview=true', () => {
    const r = localizeShopName('Balaji Stores', 'hi'); // Balaji is a proper noun
    expect(r.needsReview).toBe(true);
    expect(r.name).toContain('स्टोर'); // lexicon word still localized
  });

  test('a genuinely unknown proper noun still sets needsReview even beside curated words', () => {
    // "Ramineni" is not a curated surname; the surname + lexicon words are trusted
    // but the unknown token still forces review of the whole name.
    const r = localizeShopName('Sharma Ramineni Kirana', 'hi');
    expect(r.needsReview).toBe(true);
    expect(r.name.startsWith('शर्मा ')).toBe(true); // curated surname preserved
    expect(r.name.endsWith(' किराना')).toBe(true); // curated word preserved
  });

  test('hi (Devanagari) strips a single trailing halant on a transliterated unknown token', () => {
    // Bharat -> भरत् ; the word-final halant is dropped for the natural reading.
    expect(cleanTranslit('भरत्', 'hi')).toBe('भरत');
    // A doubled trailing virama collapses AND the surviving single one is dropped.
    expect(cleanTranslit('भरत््', 'hi')).toBe('भरत');
    // Whole-name path: an unknown noun reads without the over-marked halant.
    expect(localizeShopName('Bharat Provision', 'hi').name).toBe('भरत प्रोविज़न');
  });

  test('ta/te/kn/ml preserve a legitimate word-final pure consonant (no halant strip)', () => {
    // Dravidian scripts keep the trailing virama/pulli — stripping would corrupt.
    expect(cleanTranslit('பரத்', 'ta')).toBe('பரத்');
    expect(cleanTranslit('భరత్', 'te')).toBe('భరత్');
    expect(cleanTranslit('ಭರತ್', 'kn')).toBe('ಭರತ್');
    expect(cleanTranslit('ഭരത്', 'ml')).toBe('ഭരത്');
    // Through the whole-name path the final mark survives on the unknown token.
    for (const [lang, tail] of [['ta', '்'], ['te', '్'], ['kn', '್'], ['ml', '്']]) {
      const r = localizeShopName('Bharat Provision', lang);
      const first = r.name.split(' ')[0];
      expect(first.endsWith(tail)).toBe(true);
    }
  });

  test('SURNAMES covers each render language with the same key set', () => {
    const hiKeys = Object.keys(SURNAMES.hi).sort();
    expect(hiKeys.length).toBeGreaterThanOrEqual(50);
    for (const lang of RENDER_LANGS) {
      expect(Object.keys(SURNAMES[lang]).sort()).toEqual(hiKeys);
      // every curated form is native script (no Latin letters).
      for (const v of Object.values(SURNAMES[lang])) {
        expect(/[a-z]/i.test(v)).toBe(false);
      }
    }
  });

  test('en / ur / unknown langs fall back to the English name verbatim', () => {
    for (const lang of ['en', 'ur', 'bn', 'xx', '', null, undefined]) {
      const r = localizeShopName('New Bharat Provision', lang);
      expect(r).toEqual({ name: 'New Bharat Provision', needsReview: false });
    }
  });

  test('deterministic / idempotent — same input yields byte-identical output', () => {
    const a = localizeShopName('Sri Balaji General Stores', 'ta');
    const b = localizeShopName('Sri Balaji General Stores', 'ta');
    expect(a).toEqual(b);
  });

  test('never throws on odd input (empty, symbols, very long, native input)', () => {
    const longName = 'Shop '.repeat(500);
    const cases = ['', '   ', '&', '- - -', '123', longName, 'श्री बालाजी स्टोर'];
    for (const lang of RENDER_LANGS) {
      for (const input of cases) {
        expect(() => localizeShopName(input, lang)).not.toThrow();
        const r = localizeShopName(input, lang);
        expect(typeof r.name).toBe('string');
        expect(typeof r.needsReview).toBe('boolean');
      }
    }
  });

  test('empty / whitespace-only input passes through unchanged, no review', () => {
    expect(localizeShopName('', 'hi')).toEqual({ name: '', needsReview: false });
    expect(localizeShopName('   ', 'hi').needsReview).toBe(false);
  });

  test('non-alpha tokens pass through; & maps via the lexicon', () => {
    const r = localizeShopName('Fresh & Cool 24', 'hi');
    // fresh + cool are lexicon words; & becomes the native "and"; 24 passes through.
    expect(r.name).toBe(`फ्रेश ${BUSINESS_LEXICON.hi.and} कूल 24`);
  });

  test('already-native input is left untouched (no Latin letters to transliterate)', () => {
    const native = 'श्री बालाजी';
    const r = localizeShopName(native, 'hi');
    expect(r.name).toBe(native);
    expect(r.needsReview).toBe(false);
  });

  test('renderAllLangs covers every render language with the right shape', () => {
    const all = renderAllLangs('New Bharat Provision', RENDER_LANGS);
    expect(Object.keys(all).sort()).toEqual(['hi', 'kn', 'ml', 'ta', 'te']);
    for (const lang of RENDER_LANGS) {
      expect(typeof all[lang].name).toBe('string');
      expect(all[lang].name.length).toBeGreaterThan(0);
      expect(typeof all[lang].needsReview).toBe('boolean');
    }
    // en / ur are skipped (English fallback needs no stored row).
    const withBase = renderAllLangs('New Bharat Provision', ['en', 'ur', 'hi']);
    expect(Object.keys(withBase)).toEqual(['hi']);
  });

  test('output carries no NUL / control characters', () => {
    // eslint-disable-next-line no-control-regex
    const ctrl = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    for (const lang of RENDER_LANGS) {
      const r = localizeShopName('Sri Balaji General & Provision Stores 24', lang);
      expect(ctrl.test(r.name)).toBe(false);
    }
  });
});
