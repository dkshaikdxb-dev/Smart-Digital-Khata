#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { importCatalogI18n } = require('./import-catalog-i18n');

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

  // The shipped catalogue TRANSLATIONS are part of bringing a database up to
  // date with the repo, not optional demo content, so they load here on the one
  // path every environment already runs.
  //
  // They used to load only from `npm run import:catalog-i18n`, a manual script
  // that scripts/deploy.sh never called, so a deployed database could hold the
  // schema for localized catalogue names and none of the 4,000-odd rows that
  // make it mean anything — and did, for the three languages whose translations
  // landed after the last hand-run import. A one-off SQL migration would have
  // repeated the mistake in a new place: it runs once, and the next language's
  // translations would sit in the repo unloaded all over again.
  //
  // The importer UPSERTs by (term_type, term_en, lang) inside one transaction,
  // so running it on every migrate is idempotent — on an up-to-date database it
  // rewrites each row with its own value and changes nothing — and it is also
  // how newly authored translations reach an existing deployment: add them to
  // the seed, deploy, done.
  console.log('-> loading catalogue translations (src/data/catalog-i18n.json)');
  try {
    const { upserted } = await importCatalogI18n();
    console.log(`catalogue translations complete: ${upserted} rows upserted`);
  } catch (err) {
    console.error('x failed loading catalogue translations:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }

  await pool.end();
}

run();
