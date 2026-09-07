// Unit tests for the BUILD-TIME catalog-i18n transliteration enricher.
// Pure/in-memory fixtures — NO database, NO network, NO fs writes.
//
// Proves the safety invariants the spec requires:
//   (a) an existing `name` is never changed,
//   (b) an existing alias token is never removed,
//   (c) only NEW tokens are appended, and any MODIFIED candidate row is
//       marked needs_review=true,
//   (d) Urdu (`ur`) rows are left untouched,
//   (e) the enrichment is idempotent.

const {
  foldIastToAscii,
  DEVANAGARI_FALLBACK,
  resolveEngine,
  candidateTokens,
  enrichCatalogRows,
  SCRIPT_BY_LANG,
  SKIP_LANGS,
} = require('../src/utils/enrich-catalog-i18n');

const engine = resolveEngine();

// A deep clone we can compare the ORIGINAL input against after enrichment, to
// prove the input array itself is never mutated.
const clone = (x) => JSON.parse(JSON.stringify(x));

function fixture() {
  return [
    {
      term_type: 'category',
      term_en: 'Food',
      translations: {
        hi: { name: 'खाद्य पदार्थ', aliases: 'khadya khana food', needs_review: false },
        ta: { name: 'உணவு', aliases: '', needs_review: false },
        te: { name: 'ఆహారం', aliases: 'aaharam food', needs_review: false },
        kn: { name: 'ಆಹಾರ', aliases: '', needs_review: false },
        ml: { name: 'ഭക്ഷണം', aliases: '', needs_review: false },
        ur: { name: 'کھانا', aliases: 'khana food', needs_review: false },
      },
    },
    {
      term_type: 'subcategory',
      term_en: 'Beverages',
      translations: {
        hi: { name: 'पेय पदार्थ', aliases: '', needs_review: false },
        // no ta/te/kn/ml here — English fallback for those.
        ur: { name: 'مشروبات', aliases: '', needs_review: true },
      },
    },
  ];
}

describe('enricher — transliteration primitives', () => {
  it('folds IAST diacritics to plain ASCII search tokens', () => {
    expect(foldIastToAscii('khādya padārtha')).toBe('khadya padartha');
    expect(foldIastToAscii('uṇavu')).toBe('unavu');
    expect(foldIastToAscii('bhakṣaṇaṃ')).toBe('bhakshanam'); // retroflex ṣ -> sh
    expect(foldIastToAscii('āhāraṃ')).toBe('aharam');
    // output is always lowercase ASCII + spaces only
    expect(foldIastToAscii('ŚRĪ')).toMatch(/^[a-z ]*$/);
  });

  it('the Devanagari fallback romanizes to ASCII (hi only)', () => {
    const out = DEVANAGARI_FALLBACK.romanize('खाद्य');
    expect(out).toMatch(/^[a-z ]+$/);
    expect(out).toContain('khadya'.slice(0, 3)); // starts "kha..."
    expect(DEVANAGARI_FALLBACK.langs.hi).toBe(true);
    expect(DEVANAGARI_FALLBACK.langs.ta).toBeUndefined();
  });

  it('produces deterministic ASCII candidate tokens for a native name', () => {
    const toks = candidateTokens('खाद्य पदार्थ', 'hi', engine);
    expect(toks.every((t) => /^[a-z0-9]+$/.test(t))).toBe(true);
    expect(toks).toContain('khadya');
    // stable across calls
    expect(candidateTokens('खाद्य पदार्थ', 'hi', engine)).toEqual(toks);
  });

  it('never transliterates a skipped (Urdu) language', () => {
    expect(SKIP_LANGS).toContain('ur');
    expect(SCRIPT_BY_LANG.ur).toBeUndefined();
    expect(engine.romanize('کھانا', 'ur')).toBeNull();
  });
});

describe('enricher — safety invariants on catalog rows', () => {
  it('(a) never changes an existing name and (b) never drops an existing alias', () => {
    const input = fixture();
    const before = clone(input);
    const { rows } = enrichCatalogRows(input, { engine });

    // input array untouched (pure function)
    expect(input).toEqual(before);

    for (let i = 0; i < before.length; i += 1) {
      for (const [lang, t] of Object.entries(before[i].translations)) {
        const cand = rows[i].translations[lang];
        // name verbatim
        expect(cand.name).toBe(t.name);
        // every original alias token still present
        const origTokens = (t.aliases || '').split(/\s+/).filter(Boolean);
        const candTokens = (cand.aliases || '').split(/\s+/).filter(Boolean);
        for (const tok of origTokens) expect(candTokens).toContain(tok);
      }
    }
  });

  it('(c) only APPENDS new tokens and marks modified rows needs_review=true', () => {
    const { rows, stats } = enrichCatalogRows(fixture(), { engine });

    const hiFood = rows[0].translations.hi;
    // existing tokens kept in order at the front
    expect(hiFood.aliases.split(' ').slice(0, 3)).toEqual(['khadya', 'khana', 'food']);
    // new romanized tokens appended
    expect(hiFood.aliases.split(' ')).toContain('padartha');
    // a modified row is flagged for human review
    expect(hiFood.needs_review).toBe(true);

    // Tamil row had no aliases -> gets purely appended candidate + review flag
    const taFood = rows[0].translations.ta;
    expect(taFood.aliases).toContain('unavu');
    expect(taFood.needs_review).toBe(true);

    // stats reflect real work
    expect(stats.rowsModified).toBeGreaterThan(0);
    expect(stats.tokensAdded).toBeGreaterThan(0);
  });

  it('does NOT flip needs_review when a row gains no new tokens', () => {
    // te row already contains the transliteration tokens -> nothing to add.
    const rows = [
      {
        term_type: 'category', term_en: 'Food',
        translations: {
          te: { name: 'ఆహారం', aliases: 'aharam food', needs_review: false },
        },
      },
    ];
    const { rows: out, stats } = enrichCatalogRows(rows, { engine });
    const te = out[0].translations.te;
    expect(te.aliases).toBe('aharam food'); // unchanged
    expect(te.needs_review).toBe(false); // NOT flipped
    expect(stats.rowsModified).toBe(0);
  });

  it('(d) leaves Urdu rows completely untouched', () => {
    const input = fixture();
    const { rows, stats } = enrichCatalogRows(input, { engine });
    expect(rows[0].translations.ur).toEqual(input[0].translations.ur);
    expect(rows[1].translations.ur).toEqual(input[1].translations.ur);
    expect(stats.skippedUrdu).toBe(2);
  });

  it('(e) is idempotent — enriching the candidate again appends nothing', () => {
    const first = enrichCatalogRows(fixture(), { engine });
    const second = enrichCatalogRows(first.rows, { engine });
    // same output structure
    expect(second.rows).toEqual(first.rows);
    // second pass adds no tokens and modifies no rows
    expect(second.stats.tokensAdded).toBe(0);
    expect(second.stats.rowsModified).toBe(0);
  });

  it('produces clean UTF-8 candidate JSON with no NUL bytes', () => {
    const { rows } = enrichCatalogRows(fixture(), { engine });
    const json = JSON.stringify(rows);
    expect(json.includes(String.fromCharCode(0))).toBe(false);
    expect(Buffer.from(json, 'utf8').includes(0x00)).toBe(false);
  });
});
