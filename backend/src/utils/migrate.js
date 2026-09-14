#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { importCatalog } = require('./import-catalog');
const { importCatalogI18n } = require('./import-catalog-i18n');
const { importI18nOverrides } = require('./import-i18n-overrides');

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

  await pool.end();
}

run();
