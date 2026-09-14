// The three locks that kept the finished Bengali / Gujarati / Marathi catalogue
// off a shopkeeper's screen, each pinned by its own test.
//
//   A. The committed translation seed (src/data/catalog-i18n.json) never reached
//      a deployed database: the importer was a manual npm script that neither
//      `npm run migrate` nor `npm run seed` ever called.
//   B. `languages.has_catalogue` was DERIVED ONCE, by migration 0039, three days
//      before the bn/gu/mr translations landed — a snapshot of a fact that then
//      changed, with nothing to re-derive it.
//   C. The read path carried its own frozen list of seven language codes, so a
//      consumer asking for ?lang=bn was answered in English no matter what the
//      database held.
//
// Requires a real Postgres (DATABASE_URL) with `npm run migrate` applied — which
// is itself part of what lock A asserts: after migrating, the shipped catalogue
// rows must BE there.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const seed = require('../src/data/catalog-i18n.json');

// The expected native strings are READ FROM THE SHIPPED DATASET, never retyped
// here: this suite proves the data reaches the screen, and has no business
// authoring a translation of its own.
const term = (termEn) => seed.find((r) => r.term_en === termEn && r.term_type === 'product');
const PANEER = term('Paneer');
const POHA = term('Poha');

// How many translation rows the committed seed holds per language.
const seedCount = (lang) =>
  seed.reduce((n, r) => n + (r.translations && r.translations[lang] && r.translations[lang].name ? 1 : 0), 0);

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

let token; let shop;

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const res = await request(app).post('/api/auth/register').send({
    name: 'Catalogue Unlock Owner',
    email: `catunlock_${uniq}@test.local`,
    phone: `+9196${uniq}`,
    password: 'password123',
    shopName: `Catalogue Unlock Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  token = res.body.token;
  shop = res.body.shop;

  // The storefront endpoint only serves opted-in shops.
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [shop.id]);

  // Two products named EXACTLY as master catalogue terms, so the localization
  // join has something to find.
  for (const name of ['Paneer', 'Poha']) {
    const r = await withToken(request(app).post('/api/products'), token)
      .send({ name, price: 8000, unit: 'kg', description: 'Fresh cottage cheese' });
    expect(r.status).toBe(201);
  }
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Lock A — the data itself
// ---------------------------------------------------------------------------
describe('lock A: the committed catalogue reaches the database on the migrate path', () => {
  it('has every shipped bn/gu/mr translation row after npm run migrate alone', async () => {
    const r = await pool.query(
      "SELECT lang, count(*)::int AS n FROM catalog_i18n WHERE lang = ANY($1::text[]) GROUP BY lang",
      [['bn', 'gu', 'mr']]
    );
    const by = Object.fromEntries(r.rows.map((row) => [row.lang, row.n]));
    for (const lang of ['bn', 'gu', 'mr']) {
      expect(by[lang]).toBeGreaterThanOrEqual(seedCount(lang));
    }
  });

  it('loads the older languages on the same path, not just the new three', async () => {
    const r = await pool.query(
      "SELECT lang, count(*)::int AS n FROM catalog_i18n WHERE lang = ANY($1::text[]) GROUP BY lang",
      [['hi', 'ta', 'ur']]
    );
    const by = Object.fromEntries(r.rows.map((row) => [row.lang, row.n]));
    for (const lang of ['hi', 'ta', 'ur']) {
      expect(by[lang]).toBeGreaterThanOrEqual(seedCount(lang));
    }
  });

  it('carries the exact shipped Bengali string for a known term', async () => {
    const r = await pool.query(
      "SELECT name FROM catalog_i18n WHERE term_type='product' AND term_en='Paneer' AND lang='bn'"
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].name).toBe(PANEER.translations.bn.name);
  });
});

// ---------------------------------------------------------------------------
// Lock B — the derived flag
// ---------------------------------------------------------------------------
describe('lock B: has_catalogue follows the catalogue instead of a one-off snapshot', () => {
  it('reports has_catalogue/has_search true for bn/gu/mr', async () => {
    const res = await request(app).get('/api/public/languages');
    expect(res.status).toBe(200);
    const by = Object.fromEntries(res.body.languages.map((l) => [l.code, l]));
    for (const c of ['bn', 'gu', 'mr']) {
      expect(by[c].has_catalogue).toBe(true);
      expect(by[c].has_search).toBe(true);
    }
  });

  it('re-derives the flag for ANY writer of catalog_i18n, not only the importer', async () => {
    // `pa` is staged (is_active=false) and has no catalogue rows, so it is the
    // honest starting point: has_catalogue false.
    const before = await pool.query("SELECT has_catalogue, has_search FROM languages WHERE code='pa'");
    expect(before.rowCount).toBe(1);
    expect(before.rows[0].has_catalogue).toBe(false);
    expect(before.rows[0].has_search).toBe(false);

    // A RAW insert — no importer, no migration, no application code at all.
    // This is the property that matters: the flag cannot go stale because it is
    // re-derived where the rows are written. The probe row is removed in the
    // finally block even when an expectation fails, so a red test never leaves
    // `pa` looking catalogue-ready to the suites that run after it.
    let after;
    try {
      await pool.query(
        `INSERT INTO catalog_i18n (term_type, term_en, lang, name)
         VALUES ('product', 'ZZ Unlock Probe', 'pa', 'ਜਾਂਚ')
         ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`
      );
      after = await pool.query("SELECT has_catalogue, has_search FROM languages WHERE code='pa'");
    } finally {
      await pool.query("DELETE FROM catalog_i18n WHERE term_en = 'ZZ Unlock Probe' AND lang = 'pa'");
    }
    expect(after.rows[0].has_catalogue).toBe(true);
    expect(after.rows[0].has_search).toBe(true);

    // ...and back down again now the last row for that language has gone, so the
    // flag never outlives the data it describes.
    const restored = await pool.query("SELECT has_catalogue, has_search FROM languages WHERE code='pa'");
    expect(restored.rows[0].has_catalogue).toBe(false);
    expect(restored.rows[0].has_search).toBe(false);
  });

  it('keeps en catalogue-capable even though it has no translation rows', async () => {
    const r = await pool.query("SELECT has_catalogue, has_search FROM languages WHERE code='en'");
    expect(r.rows[0].has_catalogue).toBe(true);
    expect(r.rows[0].has_search).toBe(true);
  });

  // Regression control: passes before and after. has_translit / has_nmt describe
  // layers that genuinely do not ship, and unlocking the catalogue must not
  // quietly claim them.
  it('leaves has_translit / has_nmt false on every language', async () => {
    const res = await request(app).get('/api/public/languages');
    for (const l of res.body.languages) {
      expect(l.has_translit).toBe(false);
      expect(l.has_nmt).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Lock C — the read path
// ---------------------------------------------------------------------------
describe('lock C: the consumer read path actually asks for the language', () => {
  it('returns Bengali product names from the consumer catalogue', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=bn`);
    expect(res.status).toBe(200);
    const names = res.body.products.map((p) => p.name);
    expect(names).toContain(PANEER.translations.bn.name);
    expect(names).not.toContain('Paneer');
  });

  it('returns Marathi product names from the consumer catalogue', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=mr`);
    expect(res.status).toBe(200);
    const names = res.body.products.map((p) => p.name);
    expect(names).toContain(POHA.translations.mr.name);
  });

  it('returns Gujarati product names from the storefront', async () => {
    const res = await request(app).get(`/api/public/shops/${shop.id}?lang=gu`);
    expect(res.status).toBe(200);
    const names = res.body.shop.products.map((p) => p.name);
    expect(names).toContain(PANEER.translations.gu.name);
  });

  it('accepts ?lang=bn on the owner catalogue instead of rejecting it', async () => {
    const res = await withToken(request(app).get('/api/catalog?lang=bn'), token);
    expect(res.status).toBe(200);
    const cats = await withToken(request(app).get('/api/catalog/categories?lang=bn'), token);
    expect(cats.status).toBe(200);
  });

  // Regression controls: pass before and after. English is the base path and an
  // unknown code must still degrade to English rather than error.
  it('still serves English on ?lang=en', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=en`);
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toContain('Paneer');
  });

  it('still degrades an unknown language to English rather than failing', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=zz`);
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toContain('Paneer');
  });
});
