#!/usr/bin/env node
/**
 * Product search_text refresh — recomputes products.search_text from the current
 * catalog_items + catalog_i18n data.
 *
 *   npm run refresh:search-text
 *
 * The SQL backfill in migration 0038 seeds search_text at deploy time; the write
 * path (product create/update, catalog select) keeps it fresh per row. This
 * script is the AFTER-A-CATALOG-I18N-REIMPORT refresh: run it once after
 * `import:catalog-i18n` so existing products pick up newly added translations /
 * aliases. It is idempotent and safe to re-run. Mirrors the style of
 * import-catalog-i18n.js. Not auto-run.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { buildProductSearchText } = require('./search-normalize');

/**
 * Recompute and store search_text for ONE product. `client` is anything with a
 * .query method — a transaction client (to join a caller's tx) or the pool.
 * Loads the product, its linked catalog_items row (if any), and all catalog_i18n
 * rows for that master term, then UPDATEs products.search_text.
 */
async function refreshProductSearchText(client, productId) {
  const pr = await client.query(
    `SELECT p.id, p.name, ci.product, ci.brand, ci.pack, ci.unit
       FROM products p
       LEFT JOIN catalog_items ci ON ci.id = p.catalog_item_id
      WHERE p.id = $1`,
    [productId]
  );
  if (!pr.rowCount) return;
  const row = pr.rows[0];

  let i18n = [];
  if (row.product) {
    const tr = await client.query(
      `SELECT name, aliases FROM catalog_i18n
        WHERE term_type = 'product' AND term_en = $1`,
      [row.product]
    );
    i18n = tr.rows;
  }

  const searchText = buildProductSearchText({
    name: row.name,
    product: row.product,
    brand: row.brand,
    pack: row.pack,
    unit: row.unit,
    i18n,
  });

  await client.query('UPDATE products SET search_text = $1 WHERE id = $2', [searchText, productId]);
}

async function main() {
  const ids = await pool.query('SELECT id FROM products ORDER BY created_at ASC');
  const client = await pool.connect();
  let refreshed = 0;
  try {
    await client.query('BEGIN');
    for (const { id } of ids.rows) {
      await refreshProductSearchText(client, id);
      refreshed += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  console.log(`✓ search_text refresh complete: ${refreshed} products updated.`);
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('search_text refresh failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { refreshProductSearchText };
