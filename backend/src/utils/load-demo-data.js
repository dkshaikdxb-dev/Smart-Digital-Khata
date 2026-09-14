#!/usr/bin/env node
/**
 * Demo data loader — every demo seeder, in the order that converges, behind one
 * command.
 *
 *   npm run data:demo
 *
 * THIS IS NOT PRODUCT DATA. It invents owners, shops, customers, products,
 * orders and transactions. The base catalogue and the regional UI strings load
 * unconditionally on `npm run migrate` because a database without them is a
 * half-migrated database; this does not, because a production database with ten
 * fictional kirana shops and their ledgers in it is very hard to undo and is not
 * a decision a deploy script gets to make. scripts/deploy-data.sh runs this only
 * when the operator sets SEED_DEMO_DATA=true, and the two demo seeders below
 * keep their own FORCE_DEMO guard on top of that.
 *
 * ORDER. seed-demo creates the ten demo owners/shops and gives any shop with an
 * empty catalogue a starter one; seed-commerce clears store01's catalogue and
 * reseeds it with the richer ~50-product one, and refuses to run at all if
 * store01 does not exist yet. So demo first, commerce second: the reverse order
 * fails outright on a fresh database, and in this order each script's guard
 * (skip a shop that already sells something / delete-then-insert one shop's
 * catalogue) makes a re-run converge instead of duplicating rows. The promo
 * cards are independent of both and go last. seed-commerce also attaches
 * variant SKUs read out of `catalog_items`, so it wants the base catalogue
 * loaded first — which, since migrate now loads it, it is.
 *
 * Idempotent end to end: run it twice and the second run changes nothing.
 * Returns a summary of what is now in the database.
 */
require('dotenv').config();
const { pool } = require('../config/db');

/**
 * Load every demo dataset. Requires the seeders lazily: two of them refuse to
 * load in production without FORCE_DEMO by exiting at require() time, and the
 * banner below should be on screen before that happens.
 *
 * Returns { shops, listed, stocked, promos }.
 */
async function loadDemoData() {
  console.log('-> loading demo data (demo shops, demo catalogue, house promos)');

  // eslint-disable-next-line global-require
  const { seedDemo } = require('./seed-demo');
  // eslint-disable-next-line global-require
  const { seedCommerce } = require('./seed-commerce');
  // eslint-disable-next-line global-require
  const { main: seedPromoDemo } = require('./seed-promo-demo');

  console.log('-> demo shops (seed-demo)');
  await seedDemo();

  console.log('-> demo commerce catalogue for store01 (seed-commerce)');
  await seedCommerce();

  console.log('-> house promo cards (seed-promo-demo)');
  await seedPromoDemo();

  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE email LIKE 'store%@demo.local') AS shops,
       (SELECT COUNT(*)::int
          FROM shops s JOIN users u ON u.shop_id = s.id
         WHERE u.email LIKE 'store%@demo.local' AND s.is_listed = true) AS listed,
       (SELECT COUNT(*)::int
          FROM shops s JOIN users u ON u.shop_id = s.id
         WHERE u.email LIKE 'store%@demo.local'
           AND s.is_listed = true
           AND EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id AND p.is_active = true)) AS stocked,
       (SELECT COUNT(*)::int FROM ad_campaigns WHERE advertiser = 'Smart Khata') AS promos`
  );
  const summary = r.rows[0];
  console.log(
    `demo data complete: ${summary.shops} demo shops, ${summary.listed} listed, ` +
      `${summary.stocked} with a catalogue (only these are visible in the public directory), ` +
      `${summary.promos} house promo campaign(s)`
  );
  return summary;
}

if (require.main === module) {
  loadDemoData()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Demo data load failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { loadDemoData };
