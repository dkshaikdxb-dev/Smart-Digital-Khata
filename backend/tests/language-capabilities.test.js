// Integration tests for the per-dimension language capability registry
// (migrations 0039 + 0075). Verifies the public languages endpoint exposes the
// has_* flags and that they reflect REAL coverage — which is now derived from
// the catalogue rows themselves rather than asserted here, so these tests state
// the rule ("catalogue-capable exactly where the catalogue has rows") instead of
// a list of codes that goes stale the next time a language is translated.
//
// This file used to seed two catalog_i18n rows of its own and re-run 0039's
// UPDATE by hand, because the flags were a one-shot derivation and a fresh test
// database had nothing to derive from. `npm run migrate` now loads the shipped
// catalogue and the trigger keeps the flags in step, so there is nothing to
// stage and nothing to clean up.
//
// Requires a real Postgres (DATABASE_URL) with migrations applied (incl.
// 0022_languages, 0019_catalog_i18n, 0039_language_capabilities and
// 0075_catalogue_capability_is_derived).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

afterAll(async () => {
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

  it('reports has_catalogue exactly where the catalogue has rows', async () => {
    const res = await request(app).get('/api/public/languages');
    const by = Object.fromEntries(res.body.languages.map((l) => [l.code, l]));

    // en is the English base — capable by definition, it needs no translations.
    expect(by.en.has_catalogue).toBe(true);

    // For every other language shown, the flag must agree with the table. Stated
    // as a rule rather than a list: the previous version of this test asserted
    // bn/gu/mr were catalogue-less, which was true when it was written and
    // quietly wrong from the day their 481 terms each landed.
    const rows = await pool.query(
      'SELECT DISTINCT lang FROM catalog_i18n WHERE lang <> $1',
      ['en']
    );
    const withRows = new Set(rows.rows.map((r) => r.lang));
    for (const l of res.body.languages) {
      if (l.code === 'en') continue;
      expect(l.has_catalogue).toBe(withRows.has(l.code));
    }

    // And the three whose translations this batch unlocked are among them.
    for (const c of ['bn', 'gu', 'mr']) {
      expect(by[c].has_catalogue).toBe(true);
    }
  });

  it('keeps bn/gu/mr shown (active) despite lacking voice', async () => {
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
