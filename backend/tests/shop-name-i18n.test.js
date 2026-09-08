// Unit tests for the pure shop-name localization util. No DB, no network.
const {
  SCRIPT_BY_LANG,
  RENDER_LANGS,
  BUSINESS_LEXICON,
  localizeShopName,
  renderAllLangs,
} = require('../src/utils/shop-name-i18n');

describe('shop-name-i18n util', () => {
  test('render language set is exactly hi/ta/te/kn/ml (existing translit coverage)', () => {
    expect(RENDER_LANGS.slice().sort()).toEqual(['hi', 'kn', 'ml', 'ta', 'te']);
    expect(Object.keys(SCRIPT_BY_LANG).sort()).toEqual(['hi', 'kn', 'ml', 'ta', 'te']);
  });

  test('the verified hybrid examples reproduce exactly (hi)', () => {
    expect(localizeShopName('Sri Balaji General Stores', 'hi').name).toBe('श्री बलजि जनरल स्टोर');
    expect(localizeShopName('New Bharat Provision', 'hi').name).toBe('न्यू भरत् प्रोविज़न');
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
