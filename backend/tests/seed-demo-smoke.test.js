// Smoke test for the demo seeders (seed-demo + seed-commerce). Requires a real
// Postgres (DATABASE_URL) with ALL migrations applied. Invokes the seeders'
// exported functions (they run in the shared jest pool and only own pool
// lifecycle when executed directly). Asserts they complete without error, LIST
// all 10 demo shops (is_listed = true), seed the clean English commerce catalog
// for store01, and add recent (last-7-days) cash/upi collection transactions.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const request = require('supertest');

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { seedDemo } = require('../src/utils/seed-demo');
const { seedCommerce } = require('../src/utils/seed-commerce');
const { RENDER_LANGS, localizeShopName } = require('../src/utils/shop-name-i18n');

afterAll(async () => {
  // Deleting the owner users cascades to their shops (owner_id ON DELETE CASCADE)
  // and everything below (customers/products/transactions/orders), leaving the
  // shared test DB clean for any later-running suite.
  await pool.query("DELETE FROM users WHERE email LIKE 'store%@demo.local'");
  await pool.end();
});

describe('demo seeders', () => {
  it('seed-demo + seed-commerce complete, list all 10 demo shops, and polish the data', async () => {
    await expect(seedDemo()).resolves.toBeDefined();
    await expect(seedCommerce()).resolves.toBeUndefined();

    // 1. All 10 demo shops are LISTED.
    const listed = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM shops s JOIN users u ON u.shop_id = s.id
        WHERE u.email LIKE 'store%@demo.local' AND s.is_listed = true`
    );
    expect(listed.rows[0].n).toBe(10);

    // 1b. EVERY listed demo shop has a catalogue (batch DATA D1b). seed-demo
    //     listed ten shops and inserted no products at all; seed-commerce stocks
    //     only store01, so nine of ten demo shops were published as empty stores
    //     — and, with the D1a directory filter, would now not be published at
    //     all. A demo environment where nine shops are invisible is not a demo.
    const stocked = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM shops s
         JOIN users u ON u.shop_id = s.id
        WHERE u.email LIKE 'store%@demo.local'
          AND s.is_listed = true
          AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id AND p.is_active = true)`
    );
    expect(stocked.rows[0].n).toBe(10);

    // 2. store01 carries the clean, English-named commerce catalog (a name that
    //    matches a catalog_i18n term_en so it localizes downstream).
    const clean = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM products p JOIN users u ON u.shop_id = p.shop_id
        WHERE u.email = 'store01@demo.local' AND p.name = 'Toor Dal'`
    );
    expect(clean.rows[0].n).toBeGreaterThan(0);
    // No leftover "native · brand" bilingual names.
    const dirty = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM products p JOIN users u ON u.shop_id = p.shop_id
        WHERE u.email = 'store01@demo.local' AND p.name LIKE '%·%'`
    );
    expect(dirty.rows[0].n).toBe(0);

    // 3. Recent (last-7-days) cash/upi collections exist for the demo shops.
    const recent = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM transactions t JOIN users u ON u.shop_id = t.shop_id
        WHERE u.email = 'store01@demo.local'
          AND t.type IN ('cash','upi')
          AND t.created_at >= NOW() - INTERVAL '7 days'`
    );
    expect(recent.rows[0].n).toBeGreaterThan(0);

    // 4. Idempotent: a second run converges (still exactly 10 listed, no dupes of
    //    the marked recent collections).
    await seedDemo();
    await seedCommerce();
    const listed2 = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM shops s JOIN users u ON u.shop_id = s.id
        WHERE u.email LIKE 'store%@demo.local' AND s.is_listed = true`
    );
    expect(listed2.rows[0].n).toBe(10);
    const marked = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM transactions t JOIN users u ON u.shop_id = t.shop_id
        WHERE u.email = 'store01@demo.local' AND t.note = 'demo recent collection'`
    );
    expect(marked.rows[0].n).toBe(3);
  }, 120000);

  // A demo shop must be born the way a real signup is born (batch SHOPNAME).
  // auth.controller (signup) and shop.controller (rename) both call
  // reseedShopName; this seeder inserted shops with raw SQL and called nothing,
  // so every demo shop arrived with an empty shop_name_i18n and the three public
  // surfaces served its raw English name in all ten languages.
  it('gives every demo shop its localized names, and the public endpoints serve them', async () => {
    const shops = await pool.query(
      `SELECT s.id, s.name
         FROM shops s JOIN users u ON u.shop_id = s.id
        WHERE u.email LIKE 'store%@demo.local'
        ORDER BY u.email`
    );
    expect(shops.rowCount).toBe(10);

    // 1. Storage: one 'auto' row per render language for all ten shops, with the
    //    renderer's own values (this suite does not re-pin the transliteration —
    //    tests/shop-name-i18n.test.js does that).
    for (const shop of shops.rows) {
      const rows = await pool.query(
        'SELECT lang, name, source FROM shop_name_i18n WHERE shop_id = $1 ORDER BY lang',
        [shop.id]
      );
      expect(rows.rows.map((r) => r.lang)).toEqual(RENDER_LANGS.slice().sort());
      for (const r of rows.rows) {
        expect(r.source).toBe('auto');
        expect(r.name).toBe(localizeShopName(shop.name, r.lang).name);
      }
    }

    // 2. The three real public surfaces, in Tamil, for the flagship demo shop.
    const store01 = shops.rows.find((s) => s.name === 'Sharma Kirana Store');
    expect(store01).toBeDefined();
    const TA = 'ஷர்மா கிராணா ஸ்டோர்';

    const directory = await request(app).get('/api/public/shops?lang=ta&limit=50');
    expect(directory.status).toBe(200);
    const listed = directory.body.shops.find((s) => s.id === store01.id);
    expect(listed).toBeDefined();
    expect(listed.name).toBe(TA);

    const storefront = await request(app).get(`/api/public/shops/${store01.id}?lang=ta`);
    expect(storefront.status).toBe(200);
    expect(storefront.body.shop.name).toBe(TA);

    const search = await request(app).get('/api/public/products/search?q=dal&lang=ta&limit=50');
    expect(search.status).toBe(200);
    const hit = search.body.products.find((p) => p.shop.id === store01.id);
    expect(hit).toBeDefined();
    expect(hit.shop.name).toBe(TA);

    // 3. English is untouched, and so are the two languages the renderer still
    //    deliberately does not cover (regression control).
    for (const lang of ['en', 'gu', 'mr']) {
      const dir = await request(app).get(`/api/public/shops?lang=${lang}&limit=50`);
      expect(dir.body.shops.find((s) => s.id === store01.id).name).toBe('Sharma Kirana Store');
      const sf = await request(app).get(`/api/public/shops/${store01.id}?lang=${lang}`);
      expect(sf.body.shop.name).toBe('Sharma Kirana Store');
      const ps = await request(app).get(`/api/public/products/search?q=dal&lang=${lang}&limit=50`);
      expect(ps.body.products.find((p) => p.shop.id === store01.id).shop.name).toBe('Sharma Kirana Store');
    }

    // 4. BENGALI, which used to be in the list above, now renders — and this is
    //    the assertion worth having, because it goes through the three public
    //    endpoints a shopper actually hits rather than through the localizer in
    //    isolation. Every token of "Sharma Kirana Store" is a curated word or a
    //    known surname, so the whole name is trusted and nothing was guessed.
    const BN = 'শর্মা কিরানা স্টোর';
    const bnDir = await request(app).get('/api/public/shops?lang=bn&limit=50');
    expect(bnDir.body.shops.find((s) => s.id === store01.id).name).toBe(BN);
    const bnSf = await request(app).get(`/api/public/shops/${store01.id}?lang=bn`);
    expect(bnSf.body.shop.name).toBe(BN);
    const bnPs = await request(app).get('/api/public/products/search?q=dal&lang=bn&limit=50');
    expect(bnPs.body.products.find((p) => p.shop.id === store01.id).shop.name).toBe(BN);
  }, 120000);

  // The owner's own correction outranks the seeder, every time it runs.
  it("re-running the seeder never overwrites an owner's own name override", async () => {
    const s = await pool.query(
      "SELECT s.id FROM shops s JOIN users u ON u.shop_id = s.id WHERE u.email = 'store02@demo.local'"
    );
    const shopId = s.rows[0].id;
    const OWNER_TA = 'குப்தா அங்காடி';
    await pool.query(
      `INSERT INTO shop_name_i18n (shop_id, lang, name, source, needs_review, updated_at)
       VALUES ($1,'ta',$2,'owner',false, NOW())
       ON CONFLICT (shop_id, lang) DO UPDATE
         SET name = EXCLUDED.name, source = 'owner', needs_review = false, updated_at = NOW()`,
      [shopId, OWNER_TA]
    );
    const snapshot = async () => {
      const r = await pool.query(
        'SELECT lang, name, source, needs_review, updated_at FROM shop_name_i18n WHERE shop_id = $1 ORDER BY lang',
        [shopId]
      );
      return r.rows;
    };
    const before = await snapshot();

    await seedDemo();

    const after = await snapshot();
    // The run has to have done real work around the override, or "the override
    // survived" would only mean "nothing wrote anything" — which is exactly the
    // state this batch is fixing.
    expect(after.map((r) => r.lang)).toEqual(RENDER_LANGS.slice().sort());
    expect(after.filter((r) => r.source === 'auto').length).toBe(RENDER_LANGS.length - 1);
    // The seeder re-derives the 'auto' rows on every run (that is what makes it
    // convergent), so their values must be unchanged but their updated_at may
    // move. The 'owner' row must not be touched AT ALL.
    expect(after.map((r) => [r.lang, r.name, r.source, r.needs_review]))
      .toEqual(before.map((r) => [r.lang, r.name, r.source, r.needs_review]));
    expect(after.find((r) => r.lang === 'ta')).toEqual(before.find((r) => r.lang === 'ta'));
    expect(after.find((r) => r.lang === 'ta').name).toBe(OWNER_TA);

    // And the override is what the public endpoints serve.
    const sf = await request(app).get(`/api/public/shops/${shopId}?lang=ta`);
    expect(sf.body.shop.name).toBe(OWNER_TA);
  }, 120000);
});
