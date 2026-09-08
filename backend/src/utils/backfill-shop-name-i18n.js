#!/usr/bin/env node
/**
 * Shop-name i18n backfill (batch SHOPNAME).
 *
 *   npm run backfill:shop-name-i18n
 *
 * The API + auto-seed ship with the deploy, so NEW signups and renames get their
 * native shop names immediately. EXISTING shops predate the feature and have no
 * shop_name_i18n rows — this one-shot, idempotent script fills them in.
 *
 * For every shop it re-seeds the 'auto' rows from the shop's English name (via
 * the shared reseedShopName helper, which UPSERTs and NEVER clobbers a row an
 * owner has already overridden with source='owner'). Safe to re-run: a second
 * run overwrites only the 'auto' rows with the same deterministic values.
 *
 * Mirrors the style of refresh-search-text.js. Not auto-run — the operator runs
 * it once post-deploy via the GitHub workflow.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { reseedShopName } = require('./shop-name-i18n');

async function main() {
  const shops = await pool.query('SELECT id, name FROM shops ORDER BY created_at ASC');
  const client = await pool.connect();
  let seeded = 0;
  let failed = 0;
  try {
    for (const { id, name } of shops.rows) {
      try {
        // Each shop in its own tx so one bad row can never abort the whole run.
        await client.query('BEGIN');
        await reseedShopName(client, id, name);
        await client.query('COMMIT');
        seeded += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(`x shop ${id} (${name}): ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
  // eslint-disable-next-line no-console
  console.log(`✓ shop-name-i18n backfill complete: ${seeded} shops seeded, ${failed} failed.`);
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('shop-name-i18n backfill failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { main };
