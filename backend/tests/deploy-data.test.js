// WHAT A DEPLOY ACTUALLY LOADS (batch DATA D2).
//
// scripts/deploy.sh ran exactly two data commands — `npm run migrate` and
// `npm run seed` (one admin user) — so every other data loader in
// backend/package.json was a manual script no deployment had ever run:
//
//   import:catalog    1,615 English base SKUs        -> catalog_items
//   import:i18n       6,716 regional UI strings      -> i18n_overrides
//   seed:demo         the ten demo shops             -> users/shops/products
//   seed:commerce     store01's 50-product catalogue -> products/orders
//   seed:promo-demo   the house promo cards          -> ad_campaigns
//
// The consequences were real: a shopkeeper who picked Bengali, Gujarati or
// Marathi got an entirely English UI (those three have NO block in the web
// dictionary at all — their strings live only in i18n_overrides), and the ten
// demo shops were either absent or stale-and-empty, which the public directory
// correctly hides.
//
// The split this file pins down: PRODUCT data (the base catalogue and the
// regional UI strings) is part of bringing a database up to date with the repo
// and loads unconditionally on `npm run migrate`, exactly like the catalogue
// translations already do. DEMO data creates users, shops, customers and money
// rows, so it loads only when the operator sets SEED_DEMO_DATA=true.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations applied.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { importCatalog } = require('../src/utils/import-catalog');
const { importI18nOverrides } = require('../src/utils/import-i18n-overrides');
const catalogSeed = require('../src/data/catalog-seed.json');
const regionalSeed = require('../src/data/regional-i18n.json');
const { clearDemoData } = require('./helpers/demo-data-cleanup');

const BACKEND_DIR = path.join(__dirname, '..');
const REPO_DIR = path.join(BACKEND_DIR, '..');
const MIGRATE_JS = path.join(BACKEND_DIR, 'src', 'utils', 'migrate.js');
const DATA_STATUS_JS = path.join(BACKEND_DIR, 'src', 'utils', 'data-status.js');
const DEPLOY_DATA_SH = path.join(REPO_DIR, 'scripts', 'deploy-data.sh');

// The three languages that have no block in admin-dashboard/src/lib/i18n.js and
// therefore get 100% of their UI text from i18n_overrides.
const OVERRIDE_ONLY_LANGS = ['bn', 'gu', 'mr'];

function runNode(script, extraEnv = {}) {
  return execFileSync(process.execPath, [script], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 300000,
  });
}

// ---------------------------------------------------------------------------
// 1. `npm run migrate` — the one path every environment already runs — loads
//    the shipped PRODUCT data.
// ---------------------------------------------------------------------------
describe('npm run migrate loads the shipped product data', () => {
  // Spot-check rows: a few base SKUs that nothing else in the test DB
  // references (chosen at runtime so no fixture can collide), plus a few
  // override strings per override-only language.
  let sampleSkus = [];
  const sampleOverrideKeys = {};

  beforeAll(async () => {
    // Make sure both datasets are present first, so we can pick real rows.
    await importCatalog();
    await importI18nOverrides();

    const unreferenced = await pool.query(
      `SELECT sku FROM catalog_items
        WHERE is_global = true
          AND sku IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM products p WHERE p.catalog_item_id = catalog_items.id)
        ORDER BY sku
        LIMIT 3`
    );
    sampleSkus = unreferenced.rows.map((r) => r.sku);

    for (const lang of OVERRIDE_ONLY_LANGS) {
      sampleOverrideKeys[lang] = Object.keys(regionalSeed[lang]).slice(0, 5);
    }
  }, 300000);

  afterAll(async () => {
    // Whatever the assertions did, leave the shared test DB with the full
    // shipped datasets in place for the suites that follow.
    await importCatalog();
    await importI18nOverrides();
  }, 300000);

  it('re-imports base SKUs that are missing from catalog_items', async () => {
    expect(sampleSkus.length).toBe(3);
    await pool.query('DELETE FROM catalog_items WHERE sku = ANY($1::text[])', [sampleSkus]);
    const gone = await pool.query('SELECT COUNT(*)::int AS n FROM catalog_items WHERE sku = ANY($1::text[])', [sampleSkus]);
    expect(gone.rows[0].n).toBe(0);

    runNode(MIGRATE_JS);

    const back = await pool.query(
      'SELECT sku, product FROM catalog_items WHERE sku = ANY($1::text[]) ORDER BY sku',
      [sampleSkus]
    );
    expect(back.rowCount).toBe(3);
    for (const row of back.rows) {
      const seedRow = catalogSeed.find((r) => r.sku === row.sku);
      expect(row.product).toBe(seedRow.product);
    }
  }, 300000);

  it('re-imports the regional UI strings, including the three languages that have no built-in dictionary block', async () => {
    for (const lang of OVERRIDE_ONLY_LANGS) {
      await pool.query('DELETE FROM i18n_overrides WHERE lang = $1 AND key = ANY($2::text[])', [
        lang,
        sampleOverrideKeys[lang],
      ]);
    }

    runNode(MIGRATE_JS);

    for (const lang of OVERRIDE_ONLY_LANGS) {
      const r = await pool.query(
        'SELECT key, value FROM i18n_overrides WHERE lang = $1 AND key = ANY($2::text[])',
        [lang, sampleOverrideKeys[lang]]
      );
      expect(r.rowCount).toBe(sampleOverrideKeys[lang].length);
      for (const row of r.rows) {
        expect(row.value).toBe(regionalSeed[lang][row.key]);
      }
    }
  }, 300000);

  it('leaves bn/gu/mr fully served by GET /api/i18n/overrides', async () => {
    // The web dictionary has no bn/gu/mr block, so translate() resolves those
    // languages out of this endpoint or not at all.
    await pool.query('DELETE FROM i18n_overrides WHERE lang = ANY($1::text[])', [OVERRIDE_ONLY_LANGS]);

    runNode(MIGRATE_JS);

    const res = await request(app).get('/api/i18n/overrides');
    expect(res.status).toBe(200);
    for (const lang of OVERRIDE_ONLY_LANGS) {
      const served = res.body.overrides[lang] || {};
      expect(Object.keys(served).length).toBe(Object.keys(regionalSeed[lang]).length);
      expect(served['nav.customers']).toBe(regionalSeed[lang]['nav.customers']);
    }
  }, 300000);

  // Regression control (deliberately passing both before and after this batch):
  // product data loads unconditionally, demo data must NOT. `npm run migrate`
  // is run by every environment including production — it may never invent a
  // shop, an owner or a money row.
  it('does not create demo users, shops or transactions', async () => {
    // Everything here is measured as a DELTA across the migrate, never as an
    // absolute count. The claim is "migrate adds no demo data", and that has to
    // hold on a database that legitimately already HAS demo data — which is
    // exactly the state an owner is in after setting SEED_DEMO_DATA=true. An
    // absolute `=== 0` reads as this control only because the database it
    // usually meets happens to be empty, so it passes for the wrong reason and
    // fails for the wrong reason, which is how a control stops being trusted.
    const counts = () =>
      pool.query(
        `SELECT (SELECT COUNT(*)::int FROM users) AS users,
                (SELECT COUNT(*)::int FROM shops) AS shops,
                (SELECT COUNT(*)::int FROM transactions) AS tx,
                (SELECT COUNT(*)::int FROM users
                  WHERE email LIKE 'store%@demo.local') AS demo_owners`
      );
    const before = await counts();
    runNode(MIGRATE_JS);
    const after = await counts();
    expect(after.rows[0]).toEqual(before.rows[0]);
  }, 300000);
});

// ---------------------------------------------------------------------------
// 2. The demo loader — one entry point, in the order that converges.
// ---------------------------------------------------------------------------
describe('the demo data loader', () => {
  afterAll(async () => {
    // Deleting the owner users cascades to their shops and everything below —
    // but NOT to the flagship shop's campaign, wallet, ledger or audit rows, so
    // the shared helper removes those first. See tests/helpers.
    await clearDemoData(pool);
  });

  it('leaves ten listed demo shops that all have something to sell, and converges on a re-run', async () => {
    const { loadDemoData } = require('../src/utils/load-demo-data');

    const first = await loadDemoData();
    expect(first.shops).toBe(10);

    const visible = `SELECT COUNT(*)::int AS n
                       FROM shops s
                       JOIN users u ON u.shop_id = s.id
                      WHERE u.email LIKE 'store%@demo.local'
                        AND s.is_listed = true
                        AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id AND p.is_active = true)`;
    const afterFirst = await pool.query(visible);
    expect(afterFirst.rows[0].n).toBe(10);

    // store01 keeps the richer commerce catalogue, whichever order the seeders
    // ran in.
    const store01 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM products p JOIN users u ON u.shop_id = p.shop_id
        WHERE u.email = 'store01@demo.local' AND p.is_active = true`
    );
    expect(store01.rows[0].n).toBeGreaterThan(40);

    const promos = await pool.query("SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE advertiser = 'Smart Khata'");
    expect(promos.rows[0].n).toBeGreaterThan(0);

    // Second run changes nothing.
    await loadDemoData();
    const afterSecond = await pool.query(visible);
    expect(afterSecond.rows[0].n).toBe(10);
    const store01Again = await pool.query(
      `SELECT COUNT(*)::int AS n FROM products p JOIN users u ON u.shop_id = p.shop_id
        WHERE u.email = 'store01@demo.local' AND p.is_active = true`
    );
    expect(store01Again.rows[0].n).toBe(store01.rows[0].n);
    const promosAgain = await pool.query("SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE advertiser = 'Smart Khata'");
    expect(promosAgain.rows[0].n).toBe(promos.rows[0].n);
  }, 300000);
});

// ---------------------------------------------------------------------------
// 3. `npm run data:status` — one command that answers "what data does this
//    database actually hold?" without knowing five script names.
// ---------------------------------------------------------------------------
describe('npm run data:status', () => {
  it('reports the base catalogue, the regional strings and the demo shops', () => {
    const out = runNode(DATA_STATUS_JS);
    expect(out).toMatch(/catalog_items/);
    expect(out).toMatch(/i18n_overrides/);
    expect(out).toMatch(/demo shops/i);
    // The override-only languages are called out by name — they are the ones
    // with no built-in dictionary block to fall back on.
    for (const lang of OVERRIDE_ONLY_LANGS) expect(out).toMatch(new RegExp(`\\b${lang}\\b`));
  }, 300000);
});

// ---------------------------------------------------------------------------
// 4. The deploy's data phase: which branch it takes, and what it says it did.
// ---------------------------------------------------------------------------
describe('scripts/deploy-data.sh', () => {
  let tmp;
  let stub;
  let stubLog;
  let envFile;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-data-'));
    stub = path.join(tmp, 'stub-exec.sh');
    stubLog = path.join(tmp, 'commands.log');
    envFile = path.join(tmp, 'dotenv');
    // Stands in for `docker compose exec -T`: records the command line it was
    // handed instead of running anything.
    fs.writeFileSync(stub, `#!/usr/bin/env bash\necho "$@" >> "${stubLog}"\n`, { mode: 0o755 });
    fs.writeFileSync(envFile, 'APP_URL=https://example.test\n');
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function runPhase(extraEnv = {}) {
    fs.writeFileSync(stubLog, '');
    const stdout = execFileSync('bash', [DEPLOY_DATA_SH], {
      cwd: REPO_DIR,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DC_EXEC: stub,
        SKHATA_ENV_FILE: envFile,
        ...extraEnv,
      },
    });
    return { stdout, commands: fs.readFileSync(stubLog, 'utf8') };
  }

  it('with the demo flag unset: migrations + product data only, and says so', () => {
    const { stdout, commands } = runPhase();
    expect(commands).toMatch(/backend npm run migrate/);
    expect(commands).not.toMatch(/data:demo/);
    expect(commands).not.toMatch(/seed:demo/);
    expect(commands).not.toMatch(/FORCE_DEMO/);
    expect(stdout).toMatch(/demo data.*skip/i);
    expect(stdout).toMatch(/SEED_DEMO_DATA/);
  });

  it('with SEED_DEMO_DATA=true: also loads the demo data, and says so', () => {
    const { stdout, commands } = runPhase({ SEED_DEMO_DATA: 'true' });
    expect(commands).toMatch(/backend npm run migrate/);
    expect(commands).toMatch(/npm run data:demo/);
    // The demo seeders refuse to touch a production database unless this is set.
    expect(commands).toMatch(/FORCE_DEMO=true/);
    expect(stdout).toMatch(/demo data.*load/i);
  });

  it('honours SEED_DEMO_DATA set in the .env file, not just the shell', () => {
    fs.appendFileSync(envFile, 'SEED_DEMO_DATA=true\n');
    try {
      const { commands } = runPhase();
      expect(commands).toMatch(/npm run data:demo/);
    } finally {
      fs.writeFileSync(envFile, 'APP_URL=https://example.test\n');
    }
  });

  it('always reports the resulting data state', () => {
    const { commands } = runPhase();
    expect(commands).toMatch(/npm run data:status/);
  });
});

afterAll(async () => {
  await pool.end();
});
