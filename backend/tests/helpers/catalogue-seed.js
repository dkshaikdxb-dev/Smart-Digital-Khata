// Put shipped catalogue translations back after a suite has borrowed them.
//
// `npm run migrate` now loads src/data/catalog-i18n.json into catalog_i18n, so
// that table is no longer scratch space. A suite that stages a translation under
// a REAL master term ('Salt', 'Tea', ...) overwrites a shipped row, and its
// cleanup DELETE then takes the shipped row away with it — leaving later suites
// running against a catalogue with holes in it. Such a suite calls this at the
// end of its own cleanup.
//
// The restore goes through the same importer that loaded the data in the first
// place, so no translation is retyped here and there is no second idea of what
// the committed values are.
const seed = require('../../src/data/catalog-i18n.json');
const { importCatalogI18n } = require('../../src/utils/import-catalog-i18n');

async function restoreShippedTerms(termsEn) {
  const wanted = new Set([].concat(termsEn).filter(Boolean));
  const rows = seed.filter((r) => wanted.has(r.term_en));
  if (rows.length) await importCatalogI18n({ rows });
}

module.exports = { restoreShippedTerms };
