#!/usr/bin/env node
/**
 * Data state report — what does this database actually hold?
 *
 *   npm run data:status
 *
 * One command instead of five script names. It compares the datasets shipped in
 * src/data/ against the rows that are really in the database, and says how much
 * demo data is there, so the answer to "did the deploy load the catalogue / the
 * Bengali strings / the demo shops?" is one line of output rather than an
 * archaeology session in psql. scripts/deploy-data.sh runs it as the last step
 * of every deploy, which is what makes a deploy log self-describing.
 *
 * Read-only: it writes nothing and always exits 0. It reports a shortfall, it
 * does not fix one — `npm run migrate` loads the product data, and
 * `npm run data:demo` (SEED_DEMO_DATA=true on a deploy) loads the demo data.
 */
require('dotenv').config();
const path = require('path');
const { pool } = require('../config/db');

const catalogSeed = require(path.join(__dirname, '..', 'data', 'catalog-seed.json'));
const catalogI18nSeed = require(path.join(__dirname, '..', 'data', 'catalog-i18n.json'));
const regionalSeed = require(path.join(__dirname, '..', 'data', 'regional-i18n.json'));

// Languages with NO built-in block in the web dictionary
// (admin-dashboard/src/lib/i18n.js). Every string they show comes from
// i18n_overrides, so a missing import is not a partial translation for them —
// it is an entirely English app behind a working language picker.
const OVERRIDE_ONLY_LANGS = ['bn', 'gu', 'mr'];

const pct = (have, want) => (want ? Math.round((have / want) * 100) : 100);
const mark = (have, want) => (have >= want ? 'ok' : 'INCOMPLETE');

async function report() {
  const lines = [];
  let complete = true;

  // ---- base catalogue ----------------------------------------------------
  const skus = catalogSeed.filter((r) => r && r.sku).map((r) => r.sku);
  const haveSkus = await pool.query(
    'SELECT COUNT(*)::int AS n FROM catalog_items WHERE sku = ANY($1::text[])',
    [skus]
  );
  const shopOwned = await pool.query('SELECT COUNT(*)::int AS n FROM catalog_items WHERE sku IS NULL');
  complete = complete && haveSkus.rows[0].n >= skus.length;
  lines.push(
    `catalog_items   ${haveSkus.rows[0].n}/${skus.length} shipped base SKUs (${pct(haveSkus.rows[0].n, skus.length)}%) ` +
      `[${mark(haveSkus.rows[0].n, skus.length)}] + ${shopOwned.rows[0].n} shop-owned custom item(s)`
  );

  // ---- catalogue translations -------------------------------------------
  const wantI18n = {};
  for (const row of catalogI18nSeed) {
    for (const [lang, t] of Object.entries(row.translations || {})) {
      if (t && t.name) wantI18n[lang] = (wantI18n[lang] || 0) + 1;
    }
  }
  const haveI18n = await pool.query('SELECT lang, COUNT(*)::int AS n FROM catalog_i18n GROUP BY lang');
  const haveI18nBy = Object.fromEntries(haveI18n.rows.map((r) => [r.lang, r.n]));
  const i18nTotal = Object.values(wantI18n).reduce((a, b) => a + b, 0);
  const i18nHave = Object.keys(wantI18n).reduce((a, lang) => a + Math.min(haveI18nBy[lang] || 0, wantI18n[lang]), 0);
  complete = complete && i18nHave >= i18nTotal;
  lines.push(
    `catalog_i18n    ${i18nHave}/${i18nTotal} shipped translation rows (${pct(i18nHave, i18nTotal)}%) [${mark(i18nHave, i18nTotal)}]`
  );
  lines.push(
    `                ${Object.keys(wantI18n).sort().map((l) => `${l}:${haveI18nBy[l] || 0}/${wantI18n[l]}`).join('  ')}`
  );

  // ---- regional UI strings ----------------------------------------------
  const perLang = [];
  let uiHave = 0;
  let uiWant = 0;
  for (const lang of Object.keys(regionalSeed).sort()) {
    const keys = Object.keys(regionalSeed[lang]);
    // eslint-disable-next-line no-await-in-loop
    const r = await pool.query(
      'SELECT COUNT(*)::int AS n FROM i18n_overrides WHERE lang = $1 AND key = ANY($2::text[])',
      [lang, keys]
    );
    uiHave += r.rows[0].n;
    uiWant += keys.length;
    const only = OVERRIDE_ONLY_LANGS.includes(lang) ? '*' : '';
    perLang.push(`${lang}${only}:${r.rows[0].n}/${keys.length}`);
  }
  complete = complete && uiHave >= uiWant;
  lines.push(
    `i18n_overrides  ${uiHave}/${uiWant} shipped UI strings (${pct(uiHave, uiWant)}%) [${mark(uiHave, uiWant)}]`
  );
  lines.push(`                ${perLang.join('  ')}`);
  lines.push(
    `                * ${OVERRIDE_ONLY_LANGS.join(', ')} have no built-in dictionary block — these rows are all the UI text they have`
  );

  // ---- demo data ---------------------------------------------------------
  const demo = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE email LIKE 'store%@demo.local') AS owners,
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
  const d = demo.rows[0];
  lines.push(
    `demo shops      ${d.owners} seeded, ${d.listed} listed, ${d.stocked} with a catalogue ` +
      `(only stocked+listed shops appear in the public directory); ${d.promos} house promo campaign(s)`
  );
  if (d.owners && d.stocked < d.owners) {
    lines.push('                ^ listed demo shops with an empty catalogue are hidden — run npm run data:demo');
  }

  // ---- real tenants ------------------------------------------------------
  const real = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
       (SELECT COUNT(*)::int FROM shops) AS shops,
       (SELECT COUNT(*)::int FROM shops WHERE is_listed = true) AS listed`
  );
  lines.push(
    `accounts        ${real.rows[0].admins} admin user(s), ${real.rows[0].shops} shop(s) total, ${real.rows[0].listed} listed`
  );

  console.log('================ DATA STATE ================');
  for (const l of lines) console.log(l);
  console.log('-------------------------------------------');
  console.log(
    complete
      ? 'product data: complete (base catalogue, catalogue translations, regional UI strings all loaded)'
      : 'product data: INCOMPLETE — run "npm run migrate" to load the shipped datasets'
  );
  console.log('demo data is opt-in: SEED_DEMO_DATA=true on a deploy, or "npm run data:demo" by hand');
  console.log('===========================================');
  return complete;
}

if (require.main === module) {
  report()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Data status failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { report };
