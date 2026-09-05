#!/usr/bin/env node
/**
 * Catalog i18n importer — loads the committed translation seed
 * (src/data/catalog-i18n.json) into `catalog_i18n`.
 *
 *   npm run import:catalog-i18n
 *
 * This is REAL localisation data, not demo data, so it is allowed to run in
 * production WITHOUT FORCE_DEMO. It is idempotent and safe to re-run: each
 * translation row is UPSERTed by (term_type, term_en, lang)
 * (INSERT ... ON CONFLICT DO UPDATE). It only ever writes translation rows —
 * it never touches `catalog_items` (the English base stays the stable key).
 * The whole load runs in one transaction so a failure leaves the table
 * untouched. Mirrors the style of import-catalog.js.
 *
 * Seed shape: an array of
 *   { term_type, term_en, translations: { hi:{name,aliases,needs_review}, ... } }
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

/**
 * Core import routine. Reusable (and unit-testable) — pass a client to run
 * inside a caller's transaction, or omit to acquire one and wrap the whole
 * import in its own transaction. `rows` defaults to the committed dataset.
 *
 * Returns { upserted } — the number of translation rows written.
 */
async function importCatalogI18n({ rows, client } = {}) {
  const data = rows || require(path.join(__dirname, '..', 'data', 'catalog-i18n.json'));

  const runWith = async (c) => {
    let upserted = 0;
    for (const row of data) {
      if (!row || !row.term_type || !row.term_en || !row.translations) continue;
      for (const [lang, t] of Object.entries(row.translations)) {
        if (!t || !t.name) continue; // skip empty translations (English fallback)
        await c.query(
          `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (term_type, term_en, lang) DO UPDATE SET
             name         = EXCLUDED.name,
             aliases      = EXCLUDED.aliases,
             needs_review = EXCLUDED.needs_review`,
          [row.term_type, row.term_en, lang, t.name, t.aliases || '', Boolean(t.needs_review)]
        );
        upserted += 1;
      }
    }
    return { upserted };
  };

  // If a client was supplied, join the caller's transaction; else own one.
  if (client) return runWith(client);

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await runWith(c);
    await c.query('COMMIT');
    return result;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

async function main() {
  const file = path.join(__dirname, '..', 'data', 'catalog-i18n.json');
  if (!fs.existsSync(file)) {
    console.error(`Catalog i18n dataset not found at ${file}`);
    process.exit(1);
  }
  const { upserted } = await importCatalogI18n();
  console.log(`✓ Catalog i18n import complete: ${upserted} translation rows upserted.`);
}

// Run when executed directly; export the core fn for reuse/tests.
if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Catalog i18n import failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { importCatalogI18n };
