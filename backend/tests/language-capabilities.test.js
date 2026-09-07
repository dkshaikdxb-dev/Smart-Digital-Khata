// Integration tests for the per-dimension language capability registry
// (migration 0039). Verifies the public languages endpoint exposes the has_*
// flags and that they reflect REAL coverage: bn/gu/mr are active (shown) but
// have no localized catalogue and no real voice, so their catalogue/voice flags
// come back false, while hi/ta (which do) come back true.
//
// Requires a real Postgres (DATABASE_URL) with migrations applied (incl.
// 0022_languages, 0019_catalog_i18n and 0039_language_capabilities).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

// The has_catalogue seed is data-driven off catalog_i18n. On a fresh test DB
// that table is empty at migration time, so seed a couple of rows for hi/ta and
// re-run the (idempotent, true-only) catalogue seed so hi/ta gain has_catalogue
// while bn/gu/mr — which have zero catalog_i18n rows — correctly stay false.
beforeAll(async () => {
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name)
     VALUES ('product', 'Rice', 'hi', 'चावल'),
            ('product', 'Rice', 'ta', 'அரிசி')
     ON CONFLICT (term_type, term_en, lang) DO NOTHING`
  );
  // Mirror the migration's true-only catalogue + search seeds so the flags
  // reflect the rows just inserted (the migration ran before these rows existed).
  await pool.query(
    `UPDATE languages SET has_catalogue = true
      WHERE code IN (SELECT DISTINCT lang FROM catalog_i18n) OR code = 'en'`
  );
  await pool.query(
    `UPDATE languages SET has_search = true WHERE has_catalogue = true OR code = 'en'`
  );
});

afterAll(async () => {
  await pool.query(
    `DELETE FROM catalog_i18n WHERE term_type='product' AND term_en='Rice' AND lang IN ('hi','ta')`
  );
  await pool.end();
});

describe('public GET /api/public/languages — capability flags', () => {
  it('exposes all seven has_* flags on every active language', async () => {
    const res = await request(app).get('/api/public/languages');
    expect(res.status).toBe(200);
    const langs = res.body.languages;
    expect(Array.isArray(langs)).toBe(true);
    const en = langs.find((l) => l.code === 'en');
    for (const k of ['has_ui', 'has_catalogue', 'has_search', 'has_asr', 'has_tts', 'has_translit', 'has_nmt']) {
      expect(en).toHaveProperty(k);
      expect(typeof en[k]).toBe('boolean');
    }
  });

  it('reports voice (has_asr/has_tts) true for the BCP-47 set, false for bn/gu/mr', async () => {
    const res = await request(app).get('/api/public/languages');
    const by = Object.fromEntries(res.body.languages.map((l) => [l.code, l]));

    for (const c of ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']) {
      expect(by[c].has_asr).toBe(true);
      expect(by[c].has_tts).toBe(true);
    }
    for (const c of ['bn', 'gu', 'mr']) {
      expect(by[c].has_asr).toBe(false);
      expect(by[c].has_tts).toBe(false);
    }
  });

  it('reports has_catalogue true where the catalogue has rows (hi/ta), false for bn/gu/mr', async () => {
    const res = await request(app).get('/api/public/languages');
    const by = Object.fromEntries(res.body.languages.map((l) => [l.code, l]));

    expect(by.en.has_catalogue).toBe(true);
    expect(by.hi.has_catalogue).toBe(true);
    expect(by.ta.has_catalogue).toBe(true);
    for (const c of ['bn', 'gu', 'mr']) {
      expect(by[c].has_catalogue).toBe(false);
    }
  });

  it('keeps bn/gu/mr shown (active) despite lacking catalogue/voice', async () => {
    const res = await request(app).get('/api/public/languages');
    const codes = res.body.languages.map((l) => l.code);
    for (const c of ['bn', 'gu', 'mr']) {
      expect(codes).toContain(c);
    }
  });

  it('has_ui is true for all active languages including bn/gu/mr', async () => {
    const res = await request(app).get('/api/public/languages');
    for (const l of res.body.languages) {
      expect(l.has_ui).toBe(true);
    }
  });

  it('has_translit / has_nmt are false everywhere (no layer ships yet)', async () => {
    const res = await request(app).get('/api/public/languages');
    for (const l of res.body.languages) {
      expect(l.has_translit).toBe(false);
      expect(l.has_nmt).toBe(false);
    }
  });
});
