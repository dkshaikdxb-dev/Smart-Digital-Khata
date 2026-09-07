// Unit tests for the pure search-normalization primitives (NLQ-A). No DB, no
// network — deterministic string work only.
const {
  normalizeText,
  packVariants,
  colloquialUnitMap,
  buildProductSearchText,
  normalizeQuery,
} = require('../src/utils/search-normalize');

describe('normalizeText', () => {
  it('lowercases, strips punctuation to spaces, collapses + trims', () => {
    expect(normalizeText('  Tata-Salt,  1KG!! ')).toBe('tata salt 1kg');
  });
  it('preserves native scripts', () => {
    expect(normalizeText('टाटा  नमक')).toBe('टाटा नमक');
  });
  it('is null-safe', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('packVariants', () => {
  it('produces spaced + unspaced + gram equivalents for kg', () => {
    const v = packVariants('1 kg').split(' ');
    expect(v).toEqual(expect.arrayContaining(['1', 'kg', '1kg', '1000', 'g', '1000g']));
  });
  it('produces millilitre equivalents for litre', () => {
    const v = packVariants('2 litre');
    expect(v).toContain('2000');
    expect(v).toContain('2000ml');
  });
  it('returns empty for unparseable packs', () => {
    expect(packVariants('assorted')).toBe('');
    expect(packVariants(null)).toBe('');
  });
});

describe('normalizeQuery', () => {
  it('maps colloquial units + number words to canonical tokens', () => {
    expect(normalizeQuery('1 kilo').normalized).toBe('1 kg');
    expect(normalizeQuery('ek kilo').normalized).toBe('1 kg');
    expect(normalizeQuery('do litre').normalized).toBe('2 l');
  });
  it('de-dupes tokens and drops empties', () => {
    const { tokens } = normalizeQuery('salt  SALT!! salt');
    expect(tokens).toEqual(['salt']);
  });
  it('colloquialUnitMap is a plain, conservative lookup', () => {
    expect(colloquialUnitMap.kilo).toBe('kg');
    expect(colloquialUnitMap.adha).toBe('0.5');
  });
});

describe('buildProductSearchText', () => {
  it('folds name + product + brand + unit + pack variants + all i18n', () => {
    const blob = buildProductSearchText({
      name: 'Tata Salt 1kg',
      product: 'Salt',
      brand: 'Tata',
      pack: '1 kg',
      unit: 'kg',
      i18n: [{ name: 'नमक', aliases: 'namak namak-1kg' }],
    });
    for (const token of ['tata', 'salt', 'kg', '1kg', '1000g', 'नमक', 'namak']) {
      expect(blob).toContain(token);
    }
  });
  it('is tolerant of missing/empty fields', () => {
    expect(buildProductSearchText({ name: 'Loose Sugar' })).toBe('loose sugar');
    expect(buildProductSearchText({})).toBe('');
  });
});
