#!/usr/bin/env node
/**
 * Shop-name i18n audit (batch SHOPNAME) — READ-ONLY.
 *
 *   npm run audit:shop-name-i18n
 *
 * Prints, for every shop, its English name and each stored shop_name_i18n row
 * (lang, source, needs_review, name). Purely diagnostic: it runs only SELECTs
 * and NEVER writes. Used post-backfill to eyeball the machine-generated native
 * names and spot proper-noun renderings that read poorly, so the lexicon /
 * transliteration can be improved (or an owner override applied). Shop names are
 * public data (the discovery directory returns them to anyone), so echoing them
 * to the operator log is not sensitive.
 */
require('dotenv').config();
const { pool } = require('../config/db');

async function main() {
  const shops = await pool.query('SELECT id, name FROM shops ORDER BY created_at ASC');
  const rows = await pool.query(
    `SELECT shop_id, lang, name, source, needs_review
       FROM shop_name_i18n
      ORDER BY shop_id, lang`
  );
  const byShop = new Map();
  for (const r of rows.rows) {
    if (!byShop.has(r.shop_id)) byShop.set(r.shop_id, []);
    byShop.get(r.shop_id).push(r);
  }

  let needsReview = 0;
  // eslint-disable-next-line no-console
  console.log(`=== shop-name-i18n audit: ${shops.rows.length} shops ===`);
  for (const { id, name } of shops.rows) {
    // eslint-disable-next-line no-console
    console.log(`\n[${id}] EN: ${name}`);
    const langs = byShop.get(id) || [];
    if (!langs.length) {
      // eslint-disable-next-line no-console
      console.log('  (no shop_name_i18n rows)');
      continue;
    }
    for (const r of langs) {
      if (r.needs_review) needsReview += 1;
      const flags = `${r.source}${r.needs_review ? ',needs_review' : ''}`;
      // eslint-disable-next-line no-console
      console.log(`  ${r.lang}: ${r.name}   [${flags}]`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n=== ${needsReview} rows flagged needs_review ===`);
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('shop-name-i18n audit failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { main };
