// Smoke test for the demo seeders (seed-demo + seed-commerce). Requires a real
// Postgres (DATABASE_URL) with ALL migrations applied. Invokes the seeders'
// exported functions (they run in the shared jest pool and only own pool
// lifecycle when executed directly). Asserts they complete without error, LIST
// all 10 demo shops (is_listed = true), seed the clean English commerce catalog
// for store01, and add recent (last-7-days) cash/upi collection transactions.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const { pool } = require('../src/config/db');
const { seedDemo } = require('../src/utils/seed-demo');
const { seedCommerce } = require('../src/utils/seed-commerce');

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
});
