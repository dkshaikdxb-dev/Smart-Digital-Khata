// Tests for the cache-first dynamic-content translation service (v2 item 9).
//
// NO network is ever made: the Bhashini NMT seam (services/nmtProvider.js) ships
// OFF by default and returns null, and every test that exercises the "enabled"
// branch injects a FAKE provider via jest.spyOn — there is no HTTP client to hit.
// Requires a real Postgres (DATABASE_URL) with migrations applied, incl.
// 0040_dynamic_translations. Covers:
//   (a) same-lang / empty text → returns source, writes NO row;
//   (b) cache miss with the seam disabled → returns the source and caches it as
//       provider='fallback', needs_review=false (negative cache);
//   (c) a second call is a cache HIT: hit_count increments and the provider is
//       NEVER consulted;
//   (d) frequentUnreviewed orders needs_review rows by hit_count DESC;
//   (e) a null / throwing provider never propagates — always degrades to source.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
// The seam must read as OFF for the suite unless a test explicitly flips it.
delete process.env.BHASHINI_NMT;

const { pool, query } = require('../src/config/db');
const nmtProvider = require('../src/services/nmtProvider');
const { translateDynamic, frequentUnreviewed, sourceHash } = require('../src/services/dynamic-translate');

// Unique marker so rows never collide with other runs / suites, and cleanup is exact.
const TAG = `zzt_${Date.now().toString().slice(-9)}`;

afterAll(async () => {
  await pool.query(`DELETE FROM dynamic_translations WHERE source_text LIKE $1`, [`%${TAG}%`]);
  await pool.end();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.BHASHINI_NMT;
});

describe('translateDynamic — cache-first, off-by-default', () => {
  it('(a) same-lang or empty text → returns source and writes no row', async () => {
    const same = `hello same lang ${TAG}`;
    const spy = jest.spyOn(nmtProvider, 'translate');

    expect(await translateDynamic(same, 'en', { sourceLang: 'en' })).toBe(same);
    expect(await translateDynamic('', 'hi', { sourceLang: 'en' })).toBe('');
    expect(await translateDynamic('   ', 'hi', { sourceLang: 'en' })).toBe('   ');
    expect(await translateDynamic(null, 'hi', { sourceLang: 'en' })).toBe('');

    // No provider call and no cache row for any of these.
    expect(spy).not.toHaveBeenCalled();
    const rows = await query(`SELECT 1 FROM dynamic_translations WHERE source_text = $1`, [same]);
    expect(rows.rowCount).toBe(0);
  });

  it('(b) cache miss with seam disabled → returns source, caches provider=fallback, no network', async () => {
    const text = `open note ${TAG} b`;
    const spy = jest.spyOn(nmtProvider, 'translate');

    expect(nmtProvider.enabled()).toBe(false);
    const out = await translateDynamic(text, 'hi', { sourceLang: 'en' });
    expect(out).toBe(text); // English/source fallback

    // Provider (network seam) never touched while disabled.
    expect(spy).not.toHaveBeenCalled();

    const row = await query(
      `SELECT provider, needs_review, hit_count, translated FROM dynamic_translations
        WHERE source_hash = $1 AND target_lang = $2`,
      [sourceHash('open note ' + TAG + ' b', 'en'), 'hi']
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].provider).toBe('fallback');
    expect(row.rows[0].needs_review).toBe(false);
    expect(row.rows[0].translated).toBe(text);
    expect(row.rows[0].hit_count).toBe(0);
  });

  it('(c) second call is a cache hit: hit_count increments and provider is never called', async () => {
    const text = `repeat note ${TAG} c`;

    // Prime the cache (miss → fallback row, hit_count 0).
    await translateDynamic(text, 'hi', { sourceLang: 'en' });

    // Now spy: subsequent warm calls must be pure cache hits with no provider call.
    const spy = jest.spyOn(nmtProvider, 'translate');
    const out1 = await translateDynamic(text, 'hi', { sourceLang: 'en' });
    const out2 = await translateDynamic(text, 'hi', { sourceLang: 'en' });
    expect(out1).toBe(text);
    expect(out2).toBe(text);
    expect(spy).not.toHaveBeenCalled();

    const row = await query(
      `SELECT hit_count FROM dynamic_translations WHERE source_hash = $1 AND target_lang = $2`,
      [sourceHash('repeat note ' + TAG + ' c', 'en'), 'hi']
    );
    expect(row.rows[0].hit_count).toBe(2);
  });

  it('(d) frequentUnreviewed orders needs_review rows by hit_count DESC', async () => {
    // Enable the seam with a FAKE provider so rows land as needs_review=true.
    process.env.BHASHINI_NMT = '1';
    jest.spyOn(nmtProvider, 'enabled').mockReturnValue(true);
    jest
      .spyOn(nmtProvider, 'translate')
      .mockImplementation(async ({ text }) => `xlated:${text}`);

    const low = `freq low ${TAG} d`;
    const high = `freq high ${TAG} d`;

    // Prime both (miss → bhashini row, needs_review=true, hit_count 0).
    await translateDynamic(low, 'ta', { sourceLang: 'en' });
    await translateDynamic(high, 'ta', { sourceLang: 'en' });
    // Warm `high` three more times so its hit_count clearly exceeds `low`.
    for (let i = 0; i < 3; i += 1) await translateDynamic(high, 'ta', { sourceLang: 'en' });
    await translateDynamic(low, 'ta', { sourceLang: 'en' }); // low → 1

    const rows = await frequentUnreviewed(100);
    const mine = rows.filter((r) => r.source_text.includes(`${TAG} d`));
    // All returned rows await review.
    expect(mine.every((r) => r.needs_review === true)).toBe(true);
    const idxHigh = mine.findIndex((r) => r.source_text === high);
    const idxLow = mine.findIndex((r) => r.source_text === low);
    expect(idxHigh).toBeGreaterThanOrEqual(0);
    expect(idxLow).toBeGreaterThanOrEqual(0);
    // Higher hit_count comes first.
    expect(idxHigh).toBeLessThan(idxLow);
    expect(mine.find((r) => r.source_text === high).hit_count)
      .toBeGreaterThan(mine.find((r) => r.source_text === low).hit_count);
    // And the seam actually produced translated output (not the source echo).
    expect(mine.find((r) => r.source_text === high).translated).toBe(`xlated:freq high ${TAG} d`);
  });

  it('(e) a null or throwing provider never throws — degrades to source', async () => {
    process.env.BHASHINI_NMT = '1';
    jest.spyOn(nmtProvider, 'enabled').mockReturnValue(true);

    // Null return → fallback to source, cached as fallback/needs_review=false.
    jest.spyOn(nmtProvider, 'translate').mockResolvedValueOnce(null);
    const nullText = `provider null ${TAG} e1`;
    await expect(translateDynamic(nullText, 'te', { sourceLang: 'en' })).resolves.toBe(nullText);

    // Throwing provider → still resolves to source, no exception surfaces.
    jest.spyOn(nmtProvider, 'translate').mockRejectedValueOnce(new Error('boom'));
    const throwText = `provider throw ${TAG} e2`;
    await expect(translateDynamic(throwText, 'te', { sourceLang: 'en' })).resolves.toBe(throwText);

    const row = await query(
      `SELECT provider, needs_review FROM dynamic_translations WHERE source_hash = $1 AND target_lang = $2`,
      [sourceHash('provider throw ' + TAG + ' e2', 'en'), 'te']
    );
    expect(row.rows[0].provider).toBe('fallback');
    expect(row.rows[0].needs_review).toBe(false);
  });
});
