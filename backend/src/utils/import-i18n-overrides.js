#!/usr/bin/env node
/**
 * i18n overrides importer — loads the committed regional translation seed
 * (src/data/regional-i18n.json) into `i18n_overrides`.
 *
 *   npm run import:i18n
 *
 * This is REAL localisation data (native ta/te/kn/ml/ur UI strings), not demo
 * data, so it is allowed to run in production WITHOUT FORCE_DEMO. It is
 * idempotent and safe to re-run: each string is UPSERTed by (lang, key)
 * (INSERT ... ON CONFLICT DO UPDATE), so a later re-run simply refreshes the
 * seed values. It ONLY writes rows that are present in the JSON — it never
 * deletes any other overrides, so corrections a native speaker makes later from
 * Admin → Translations for keys NOT in this file are left untouched. The whole
 * load runs in one transaction so a failure leaves the table unchanged. Mirrors
 * the style of import-catalog-i18n.js.
 *
 * Seed shape: { "<lang>": { "<key>": "<value>", ... }, ... } — the frontend
 * dict (admin-dashboard/src/lib/i18n.js) holds the key catalog + built-in text;
 * this table only stores the OVERRIDES layered on top at runtime.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

/**
 * Core import routine. Reusable (and unit-testable) — pass a client to run
 * inside a caller's transaction, or omit to acquire one and wrap the whole
 * import in its own transaction. `data` defaults to the committed dataset.
 *
 * Returns { upserted, perLang } — the total rows written and a per-language
 * breakdown.
 */
async function importI18nOverrides({ data, client } = {}) {
  const seed = data || require(path.join(__dirname, '..', 'data', 'regional-i18n.json'));

  const runWith = async (c) => {
    let upserted = 0;
    const perLang = {};
    for (const [lang, entries] of Object.entries(seed)) {
      if (!lang || !entries || typeof entries !== 'object') continue;
      for (const [key, value] of Object.entries(entries)) {
        // Skip empty / non-string values — an empty override would blank the
        // string instead of falling back to the built-in text.
        if (typeof value !== 'string' || value.trim() === '') continue;
        await c.query(
          `INSERT INTO i18n_overrides (lang, key, value, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (lang, key) DO UPDATE SET
             value      = EXCLUDED.value,
             updated_at = NOW()`,
          [lang, key, value]
        );
        upserted += 1;
        perLang[lang] = (perLang[lang] || 0) + 1;
      }
    }
    return { upserted, perLang };
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
  const file = path.join(__dirname, '..', 'data', 'regional-i18n.json');
  if (!fs.existsSync(file)) {
    console.error(`Regional i18n dataset not found at ${file}`);
    process.exit(1);
  }
  const { upserted, perLang } = await importI18nOverrides();
  const breakdown = Object.entries(perLang)
    .map(([lang, n]) => `${lang}:${n}`)
    .join(' ');
  console.log(`✓ i18n overrides import complete: ${upserted} rows upserted (${breakdown}).`);
}

// Run when executed directly; export the core fn for reuse/tests.
if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('i18n overrides import failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { importI18nOverrides };
