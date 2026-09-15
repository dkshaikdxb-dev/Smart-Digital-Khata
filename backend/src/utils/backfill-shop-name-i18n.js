#!/usr/bin/env node
/**
 * Shop-name i18n backfill (batch SHOPNAME).
 *
 * Two entry points, because there are two genuinely different jobs.
 *
 * `seedMissingShopNames()` — THE DEPLOY PATH. Runs on every `npm run migrate`
 * (see migrate.js). It selects only the shops that are MISSING an auto row for
 * at least one active render language and re-seeds those, so on an up-to-date
 * database it selects nothing, writes nothing and costs one query. That is what
 * makes it safe to put on the path every environment runs: the cost is
 * proportional to the shortfall, not to the number of shops. A shop that has
 * every language already — including one whose owner has overridden a language
 * by hand — is not touched at all, so a second deploy does not even move an
 * updated_at.
 *
 * `main()` — THE OPERATOR'S TOOL, `npm run backfill:shop-name-i18n`. Re-seeds
 * EVERY shop unconditionally. That is the right thing after the curated lexicon
 * or the transliteration cleanup changes, when rows that already exist have
 * become stale: the deploy path cannot see that, because those shops are not
 * missing anything. Still never clobbers an owner's override.
 *
 * Both re-seed through the shared `reseedShopName` helper, whose ON CONFLICT is
 * guarded to source = 'auto' — an owner's corrected name (source = 'owner') is
 * never overwritten by either. Each shop goes in its own transaction so one bad
 * row cannot abort the run.
 *
 * WHY THE DEPLOY PATH AT ALL. These rows are not read out of a file in the repo
 * the way the catalogue and the UI strings are; they are DERIVED from tenant
 * data, and they transliterate proper nouns, which is why every machine-rendered
 * name carries needs_review and the owner override UI exists. That argues for
 * care, not for waiting: the alternative to a reviewable machine rendering is
 * not a better name, it is the English name, which is exactly what the shopper
 * was already seeing. And the manual-script alternative has now been measured —
 * the script existed, worked, was documented as "the operator runs it once
 * post-deploy", and no operator ever ran it, so every deployed database served
 * English shop names in all ten languages. Deriving what we can derive, on the
 * one path everybody runs, with the human's correction held sacred, is the
 * version of this that cannot silently rot.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { reseedShopName, resolveActiveRenderLangs } = require('./shop-name-i18n');

/**
 * Re-seed a list of { id, name } shops, each in its own transaction.
 * Returns { seeded, failed, errors }. Never throws for a single bad row.
 */
async function reseedEach(shops) {
  const client = await pool.connect();
  const errors = [];
  let seeded = 0;
  try {
    for (const { id, name } of shops) {
      try {
        // Each shop in its own tx so one bad row can never abort the whole run.
        // eslint-disable-next-line no-await-in-loop
        await client.query('BEGIN');
        // eslint-disable-next-line no-await-in-loop
        await reseedShopName(client, id, name);
        // eslint-disable-next-line no-await-in-loop
        await client.query('COMMIT');
        seeded += 1;
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('ROLLBACK').catch(() => {});
        errors.push(`shop ${id} (${name}): ${err.message}`);
        // eslint-disable-next-line no-console
        console.error(`x shop ${id} (${name}): ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
  return { seeded, failed: errors.length, errors };
}

/**
 * THE DEPLOY PATH. Seed the shops that are missing a localized name.
 *
 * "Missing" is per language: a shop is selected when there is at least one
 * ACTIVE render language with no shop_name_i18n row for it. That makes this
 * convergent in both directions that matter — a shop that predates the feature
 * gets all of its languages, and every shop picks up a language the day one is
 * added to the render set — while an up-to-date database selects zero shops. A
 * row an owner wrote counts as present, so an override neither drags its shop
 * back into the selection nor is at risk from the re-seed.
 *
 * Shops with a blank name are skipped: there is nothing to render, and the
 * helper stores no empty names, so including them would mean re-selecting the
 * same rows on every single deploy forever.
 *
 * Returns { langs, scanned, seeded, failed, errors }. THROWS if any shop failed,
 * so the deploy fails loudly rather than logging a number nobody reads.
 */
async function seedMissingShopNames() {
  const langs = await resolveActiveRenderLangs(pool);
  // One pass, no correlated subquery per shop: aggregate the existing rows per
  // shop once and keep the shops that have fewer than one row per wanted
  // language. (shop_id, lang) is the primary key, so a count below the target is
  // exactly "missing at least one language".
  const shops = await pool.query(
    `SELECT s.id, s.name
       FROM shops s
       LEFT JOIN (
         SELECT shop_id, COUNT(*)::int AS have
           FROM shop_name_i18n
          WHERE lang = ANY($1::text[])
          GROUP BY shop_id
       ) c ON c.shop_id = s.id
      WHERE TRIM(s.name) <> ''
        AND COALESCE(c.have, 0) < $2::int
      ORDER BY s.created_at ASC`,
    [langs, langs.length]
  );

  const { seeded, failed, errors } = await reseedEach(shops.rows);
  if (failed) {
    throw new Error(
      `${failed} of ${shops.rowCount} shop(s) could not be localized: ${errors.join('; ')}`
    );
  }
  return { langs, scanned: shops.rowCount, seeded, failed, errors };
}

/**
 * THE OPERATOR'S TOOL. Re-seed every shop's 'auto' rows from its English name,
 * whether or not rows already exist — the way to push a lexicon or
 * transliteration change out over names that were rendered by an older version.
 */
async function main() {
  const shops = await pool.query('SELECT id, name FROM shops ORDER BY created_at ASC');
  const { seeded, failed } = await reseedEach(shops.rows);
  // eslint-disable-next-line no-console
  console.log(`✓ shop-name-i18n backfill complete: ${seeded} shops seeded, ${failed} failed.`);
  return { scanned: shops.rowCount, seeded, failed };
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

module.exports = { main, seedMissingShopNames };
