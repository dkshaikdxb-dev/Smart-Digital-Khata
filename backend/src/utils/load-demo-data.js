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
 * seed-flagship goes LAST. It brands store01 as the premium demo storefront —
 * three generated banner photos, a paid premium window, and the shop's own slide
 * in the marketplace carousel — and it needs the shop to exist (seed-demo) and to
 * be the shop with the rich catalogue (seed-commerce) before any of that is
 * true. It buys with real guarded credit debits, so running it before those two
 * would either fail or brand the wrong thing.
 *
 * Idempotent end to end: run it twice and the second run changes nothing — no
 * fourth photo, no second campaign, no second debit.
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
  // eslint-disable-next-line global-require
  const { seedFlagship } = require('./seed-flagship');

  console.log('-> demo shops (seed-demo)');
  await seedDemo();

  console.log('-> demo commerce catalogue for store01 (seed-commerce)');
  await seedCommerce();

  console.log('-> house promo cards (seed-promo-demo)');
  await seedPromoDemo();

  console.log('-> branded flagship storefront for store01 (seed-flagship)');
  await seedFlagship();

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
       (SELECT COUNT(*)::int FROM ad_campaigns WHERE advertiser = 'Smart Khata') AS promos,
       (SELECT COUNT(*)::int
          FROM shop_images i JOIN users u ON u.shop_id = i.shop_id
         WHERE u.email = 'store01@demo.local' AND i.status = 'active') AS flagship_photos,
       (SELECT COUNT(*)::int
          FROM ad_campaigns c JOIN users u ON u.shop_id = c.link_shop_id
         WHERE u.email = 'store01@demo.local' AND c.self_serve = true AND c.status = 'active') AS flagship_promos`
  );
  const summary = r.rows[0];
  console.log(
    `demo data complete: ${summary.shops} demo shops, ${summary.listed} listed, ` +
      `${summary.stocked} with a catalogue (only these are visible in the public directory), ` +
      `${summary.promos} house promo campaign(s), and the flagship storefront with ` +
      `${summary.flagship_photos} photo slide(s) + ${summary.flagship_promos} slide(s) of its own in the carousel`
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
