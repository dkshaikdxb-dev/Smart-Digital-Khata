#!/usr/bin/env node
/**
 * Master catalog importer — loads the committed BASE catalog dataset
 * (src/data/catalog-seed.json, ~1615 SKUs) into `catalog_items`.
 *
 *   npm run import:catalog
 *
 * This is REAL base data, not demo data, so it is allowed to run in production
 * WITHOUT FORCE_DEMO. It is idempotent and safe to re-run: each row is UPSERTed
 * by `sku` (INSERT ... ON CONFLICT (sku) DO UPDATE). It only ever touches
 * global seed rows (rows WITH an sku) — it never inserts, updates, or deletes
 * shop-owned custom items (which have no sku). The whole load runs in one
 * transaction so a failure leaves the table untouched.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const KNOWN_UNITS = new Set(['kg', 'g', 'l', 'ml', 'pack', 'pc', 'pcs', 'piece', 'dozen']);

/**
 * Derive a short `unit` from a `pack` string. Takes the last whitespace- or
 * hyphen-delimited token and normalises common units; anything unrecognised
 * falls back to 'unit'. e.g. "1 kg" -> "kg", "100 g" -> "g", "6-pack" -> "pack".
 */
function deriveUnit(pack) {
  if (!pack) return 'unit';
  const tokens = String(pack).trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!tokens.length) return 'unit';
  const last = tokens[tokens.length - 1];
  if (KNOWN_UNITS.has(last)) {
    if (last === 'l') return 'L';
    if (last === 'pcs' || last === 'pc') return 'pc';
    return last;
  }
  return 'unit';
}

/**
 * Core import routine. Reusable (and unit-testable) — pass a client to run
 * inside a caller's transaction, or omit to acquire one and wrap the whole
 * import in its own transaction. `rows` defaults to the committed dataset.
 *
 * Returns { upserted } — the number of seed rows written.
 */
async function importCatalog({ rows, client } = {}) {
  const data = rows || require(path.join(__dirname, '..', 'data', 'catalog-seed.json'));

  const runWith = async (c) => {
    let upserted = 0;
    for (const row of data) {
      if (!row || !row.sku) continue; // only global seed rows (must have an sku)
      const unit = deriveUnit(row.pack);
      await c.query(
        `INSERT INTO catalog_items
           (sku, category, subcategory, product, brand, pack, unit, indicative_price, perishable, is_global)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
         ON CONFLICT (sku) DO UPDATE SET
           category         = EXCLUDED.category,
           subcategory      = EXCLUDED.subcategory,
           product          = EXCLUDED.product,
           brand            = EXCLUDED.brand,
           pack             = EXCLUDED.pack,
           unit             = EXCLUDED.unit,
           indicative_price = EXCLUDED.indicative_price,
           perishable       = EXCLUDED.perishable`,
        [
          row.sku,
          row.category || null,
          row.subcategory || null,
          row.product,
          row.brand || null,
          row.pack || null,
          unit,
          Number.isFinite(row.price_paise) ? row.price_paise : 0,
          Boolean(row.perishable),
        ]
      );
      upserted += 1;
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
  const file = path.join(__dirname, '..', 'data', 'catalog-seed.json');
  if (!fs.existsSync(file)) {
    console.error(`Catalog dataset not found at ${file}`);
    process.exit(1);
  }
  const { upserted } = await importCatalog();
  console.log(`✓ Catalog import complete: ${upserted} base items upserted.`);
}

// Run when executed directly; export the core fn for reuse/tests.
if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Catalog import failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { importCatalog, deriveUnit };
