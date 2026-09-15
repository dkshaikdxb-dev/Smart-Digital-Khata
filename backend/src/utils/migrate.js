#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { importCatalog } = require('./import-catalog');
const { importCatalogI18n } = require('./import-catalog-i18n');
const { importI18nOverrides } = require('./import-i18n-overrides');
const { seedMissingShopNames } = require('./backfill-shop-name-i18n');

async function run() {
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const f of files) {
    const done = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
    if (done.rowCount) {
      console.log(`-- skip ${f}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`-> running ${f}`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations(name) VALUES ($1)', [f]);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`x failed ${f}:`, err.message);
      process.exit(1);
    }
  }
  console.log('migrations complete');

  // ---- THE SHIPPED PRODUCT DATA ------------------------------------------
  //
  // Everything below is part of bringing a database up to date with the repo,
  // not optional demo content, so it loads here on the one path every
  // environment already runs. A schema without it is a half-migrated database:
  // the columns exist and the rows that give them meaning do not.
  //
  // The catalogue TRANSLATIONS used to load only from
  // `npm run import:catalog-i18n`, a manual script that scripts/deploy.sh never
  // called, so a deployed database could hold the schema for localized
  // catalogue names and none of the 4,000-odd rows that make it mean anything —
  // and did, for the three languages whose translations landed after the last
  // hand-run import. A one-off SQL migration would have repeated the mistake in
  // a new place: it runs once, and the next language's translations would sit
  // in the repo unloaded all over again.
  //
  // The base CATALOGUE and the regional UI STRINGS were exactly the same gap,
  // left open one batch longer, and the UI strings were the expensive one. The
  // web dictionary (admin-dashboard/src/lib/i18n.js) carries built-in blocks for
  // en/hi/ta/te/kn/ml/ur only; bn, gu and mr have no block at all and get every
  // string they have from `i18n_overrides`, which nothing but this importer
  // fills. translate() resolves an override first and otherwise falls through to
  // English, so on a database where `npm run import:i18n` had never been run a
  // shopkeeper who picked Bengali got a working language picker and an entirely
  // English app — silently, with nothing in any log to say why.
  //
  // All three importers UPSERT (by sku, by (term_type, term_en, lang), by
  // (lang, key)) inside one transaction each, so running them on every migrate
  // is idempotent — on an up-to-date database each rewrites every row with its
  // own value and changes nothing — and it is also how newly authored data
  // reaches an existing deployment: add it to the seed, deploy, done. None of
  // them invents a user, a shop or a money row; that is demo data, it is a
  // different decision, and it lives behind SEED_DEMO_DATA in
  // scripts/deploy-data.sh.
  //
  // A failure here fails the deploy. Half-loaded reference data that nobody is
  // told about is how this defect survived four batches.
  const productData = [
    {
      what: 'base catalogue (src/data/catalog-seed.json)',
      load: async () => `${(await importCatalog()).upserted} items upserted`,
    },
    {
      what: 'catalogue translations (src/data/catalog-i18n.json)',
      load: async () => `${(await importCatalogI18n()).upserted} rows upserted`,
    },
    {
      what: 'regional UI strings (src/data/regional-i18n.json)',
      load: async () => {
        const { upserted, perLang } = await importI18nOverrides();
        const breakdown = Object.entries(perLang).map(([lang, n]) => `${lang}:${n}`).join(' ');
        return `${upserted} rows upserted (${breakdown})`;
      },
    },
  ];

  for (const step of productData) {
    console.log(`-> loading ${step.what}`);
    try {
      console.log(`   ${step.what} complete: ${await step.load()}`);
    } catch (err) {
      console.error(`x failed loading ${step.what}:`, err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    }
  }
  console.log('product data complete');

  // ---- THE DERIVED DATA ---------------------------------------------------
  //
  // Localized SHOP NAMES are the same defect one step removed. The renderer, the
  // storage, the public API and the owner override UI all shipped; the only
  // thing that ever wrote a shop_name_i18n row for a shop that already existed
  // was `npm run backfill:shop-name-i18n`, a manual script whose own header read
  // "Not auto-run — the operator runs it once post-deploy". No operator ever
  // did. So on a deployed database the table was empty, COALESCE(sn.name,
  // s.name) fell through to the raw English name, and the directory, the
  // storefront and the product search served English shop names in all ten
  // languages — including the six the renderer covers.
  //
  // These rows are NOT like the three above. The catalogue, its translations and
  // the UI strings are read out of files in this repo; these are DERIVED from
  // tenant data, and they transliterate proper nouns, which is exactly why every
  // machine-rendered name is stored with needs_review and why the owner override
  // UI exists. That is an argument for care, and the care is built in: an owner's
  // corrected name (source = 'owner') is never overwritten, by this or by
  // anything else. It is not an argument for waiting, because the thing being
  // waited for is not a better name — it is the English name the shopper was
  // already being shown.
  //
  // It is bounded, too. seedMissingShopNames selects only shops MISSING an auto
  // row for at least one active render language, so an up-to-date database
  // selects nothing and this costs one query; the work is proportional to the
  // shortfall, never to the size of the tenant table. It still converges on a
  // newly added render language, because every shop is then missing that one.
  //
  // Like the product data, a failure here fails the deploy.
  //
  // This step DERIVES rows about shops that already exist. It still invents no
  // user, no shop and no money row — that is demo data, and it stays behind
  // SEED_DEMO_DATA in scripts/deploy-data.sh.
  console.log('-> localizing shop names that have none (shop_name_i18n)');
  try {
    const { langs, scanned, seeded } = await seedMissingShopNames();
    console.log(
      `   shop names complete: ${seeded}/${scanned} shop(s) localized into ${langs.join(', ')}` +
        `${scanned === 0 ? ' (nothing missing)' : ''}`
    );
  } catch (err) {
    console.error('x failed localizing shop names:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  await pool.end();
}

run();
