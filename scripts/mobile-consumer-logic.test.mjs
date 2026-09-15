#!/usr/bin/env node
/**
 * Tests for the PURE logic behind the native consumer app's screens.
 *
 * Run:  node scripts/mobile-consumer-logic.test.mjs        (from the repo root)
 *
 * WHY THIS FILE LOOKS LIKE THIS. mobile-app has no test runner and CI installs
 * nothing for it (see the `mobile-i18n` job), and its sources are ESM-syntax
 * files in a CommonJS package, so plain Node cannot `import` them and there is
 * no jest to transform them. Rather than add a runner, a transform and a
 * dependency — none of which ship over the air, which is the one thing this
 * batch must protect — this follows the pattern scripts/i18n-coverage.mjs
 * already set for exactly this situation: read the source, lift it into a vm,
 * assert against the real exported functions. No dependencies, exits non-zero
 * on failure.
 *
 * What it can and cannot cover, stated plainly: the React screens are NOT
 * testable here and are not tested. What IS tested is the logic those screens
 * are thin wrappers around — how a shop's product rows fold into variant groups
 * and filter, how a typed date range is validated, and how the over-the-air
 * update helpers behave (including the one that matters most: that they do not
 * throw when expo-updates is missing).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/**
 * Load a dependency-free ESM source file's top-level functions.
 *
 * The files under test import nothing, so stripping the `export` keyword leaves
 * a plain script whose top-level function declarations land on the vm context.
 * `require` is deliberately left UNDEFINED so that appUpdates.js takes its own
 * "native module missing" path — which is the branch a phone running Expo Go
 * takes, and the one that must never throw.
 *
 * A top-level `const` is lexical, so unlike a function declaration it never
 * lands on the context by itself; `expose` names the const bindings a caller
 * wants back (the shared category list, for one) and copies them across.
 */
function loadPure(rel, expose = []) {
  const code = fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/^export default .*$/gm, '')
    .replace(/^export (async function|function|const|let)/gm, '$1')
    + expose.map((n) => `\n;globalThis.${n} = ${n};`).join('');
  const ctx = { console, Date, Math, Number, String, Array, Map, JSON, isNaN, setTimeout };
  vm.createContext(ctx);
  new vm.Script(code, { filename: rel }).runInContext(ctx);
  return ctx;
}

let failures = 0;
let checks = 0;
function ok(cond, what) {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${what}`);
  }
}
function eq(actualOrThunk, expected, what) {
  // A thunk is accepted so a failing assertion that would THROW while computing
  // its own value (reading a field off a unit that is suddenly the wrong shape)
  // is reported as a failed check rather than crashing the run and hiding every
  // check after it.
  let actual;
  try {
    actual = typeof actualOrThunk === 'function' ? actualOrThunk() : actualOrThunk;
  } catch (e) {
    checks += 1;
    failures += 1;
    console.error(`  FAIL  ${what}\n        threw ${e.message}`);
    return;
  }
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  checks += 1;
  if (a !== b) {
    failures += 1;
    console.error(`  FAIL  ${what}\n        expected ${b}\n        actual   ${a}`);
  }
}
function section(name) {
  console.log(name);
}

/* ------------------------------------------------- variant grouping (shop) */
const VG = loadPure('mobile-app/src/consumer/lib/variantGroups.js');

// A realistic slice of a kirana storefront: one rice base product in two brands
// and two packs, one branded atta that is alone under its base, and one loose
// item with no catalogue link at all.
const RICE_A1 = { id: 'r1', name: 'Daawat Sona Masuri Rice 1 kg', base_product: 'Sona Masuri Rice', brand: 'Daawat', pack: '1 kg', price: 9900, category: 'Grains' };
const RICE_A5 = { id: 'r2', name: 'Daawat Sona Masuri Rice 5 kg', base_product: 'Sona Masuri Rice', brand: 'Daawat', pack: '5 kg', price: 47500, category: 'Grains' };
const RICE_B10 = { id: 'r3', name: 'bb Royal Sona Masuri Rice 10 kg', base_product: 'Sona Masuri Rice', brand: 'bb Royal', pack: '10 kg', price: 89000, category: 'Grains' };
const ATTA = { id: 'a1', name: 'Fortune Chakki Atta 5 kg', base_product: 'Chakki Atta', brand: 'Fortune', pack: '5 kg', price: 26000, category: 'Grains' };
const LOOSE = { id: 'l1', name: 'Loose Sugar', base_product: null, price: 4800, sold_by_weight: true, category: 'Staples', search_text: 'sugar cheeni shakkar' };

section('variant grouping');
{
  const units = VG.groupVariants([RICE_A1, ATTA, RICE_A5, RICE_B10, LOOSE]);

  eq(units.map((u) => u.kind), ['group', 'single', 'single'],
    'rows sharing a base_product fold into ONE group, in first-seen order');
  eq(() => units[0].base, 'Sona Masuri Rice', 'the group carries the generic base name');
  eq(() => units[0].variants.map((v) => v.id), ['r1', 'r2', 'r3'],
    'every variant of the base product lands in the group');
  eq(() => units[1].product.id, 'a1',
    'a base_product with only ONE row collapses back to a plain product');
  eq(() => units[2].product.id, 'l1', 'a row with no base_product is never grouped');

  // Grouping is presentation only. Money must survive it untouched and integral.
  const prices = (units[0] && units[0].variants ? units[0].variants : []).map((v) => v.price);
  eq(prices, [9900, 47500, 89000], 'each variant keeps its own integer-paise price');
  ok(prices.every((p) => Number.isInteger(p)), 'no variant price became a float');

  eq(VG.groupVariants([]), [], 'an empty catalogue produces no units');
  eq(VG.groupVariants(null), [], 'a missing catalogue produces no units, not a throw');
}

section('variant axes');
{
  const vs = [RICE_A1, RICE_A5, RICE_B10];
  eq(VG.brandsOf(vs), ['Daawat', 'bb Royal'], 'brands in first-seen order');
  eq(VG.packsOf(vs, 'Daawat'), ['1 kg', '5 kg'], 'sizes are the ones THAT brand carries');
  eq(VG.packsOf(vs, 'bb Royal'), ['10 kg'], 'a brand with one size lists only that size');
  eq(VG.brandsOf([{ id: 'x', price: 100 }]), [''], 'an absent brand collapses to the empty axis');

  eq(() => VG.resolveVariant(vs, 'Daawat', '5 kg').id, 'r2', 'a selection resolves to its real product row');
  eq(() => VG.resolveVariant(vs, 'bb Royal', '1 kg').id, 'r1',
    'an impossible pairing falls back to the first variant rather than undefined');
  eq(VG.resolveVariant([], 'x', 'y'), null, 'no variants resolves to null, not a throw');

  // A stale selection (the catalogue reloaded in another language underneath)
  // must be repaired, not carried.
  const s1 = VG.normalizeSelection(vs, 'Nonexistent', '5 kg');
  eq([s1.brand, s1.pack], ['Daawat', '5 kg'], 'a vanished brand falls back to the first brand');
  const s2 = VG.normalizeSelection(vs, 'bb Royal', '1 kg');
  eq([s2.brand, s2.pack], ['bb Royal', '10 kg'],
    'a size the chosen brand does not carry falls back to one it does');
}

section('catalogue filtering');
{
  const units = VG.groupVariants([RICE_A1, RICE_A5, RICE_B10, ATTA, LOOSE]);
  eq(VG.categoriesOf([RICE_A1, ATTA, LOOSE]), ['Grains', 'Staples'],
    'categories are distinct and in first-seen order');

  eq(VG.filterUnits(units, { search: 'bb royal' }).map((u) => u.key), ['g_Sona Masuri Rice'],
    'a group survives when ANY ONE of its variants matches the search');
  eq(() => VG.filterUnits(units, { search: 'atta' }).map((u) => u.product.id), ['a1'],
    'search matches a plain row by name');
  eq(() => VG.filterUnits(units, { search: 'shakkar' }).map((u) => u.product.id), ['l1'],
    'search matches the all-language search_text blob, not just the display name');
  eq(() => VG.filterUnits(units, { category: 'Staples' }).map((u) => u.product.id), ['l1'],
    'the category filter keeps only rows in that category');
  eq(VG.filterUnits(units, { category: 'Grains' }).length, 2,
    'a group is kept when any variant carries the active category');
  eq(VG.filterUnits(units, { search: 'zzz' }), [], 'a search that matches nothing returns nothing');
  eq(VG.filterUnits(units, {}).length, units.length, 'no filter keeps everything');
}

/* ------------------------------------------------ statement date handling */
const DR = loadPure('mobile-app/src/consumer/lib/dateRange.js');

section('typed date range');
{
  ok(DR.isIsoDay('2024-02-29'), 'a real leap day is accepted');
  ok(!DR.isIsoDay('2024-02-31'), 'a day that does not exist is REJECTED, not rolled forward');
  ok(!DR.isIsoDay('2024-2-1'), 'a short-form date is rejected');
  ok(!DR.isIsoDay('01-02-2024'), 'a day-first date is rejected');
  ok(!DR.isIsoDay(''), 'an empty value is rejected');
  ok(!DR.isIsoDay(null), 'a missing value is rejected rather than throwing');

  eq(DR.isoDay(new Date('2024-05-09T18:30:00.000Z')), '2024-05-09', 'a date renders as its UTC day');
  eq(DR.daysAgo(30, new Date('2024-05-31T00:00:00.000Z')), '2024-05-01', 'thirty days back is exact');
  eq(DR.daysAgo(1, new Date('2024-03-01T00:00:00.000Z')), '2024-02-29', 'one day back crosses a leap boundary');

  eq(DR.rangeProblem('2024-01-01', '2024-03-01'), null, 'a sane range has no problem');
  eq(DR.rangeProblem('2024-03-01', '2024-01-01'), 'order', 'a reversed range is reported as an order problem');
  eq(DR.rangeProblem('2024-03-01', 'soon'), 'format', 'an unparseable date is reported as a format problem');
  eq(DR.rangeProblem('2024-01-01', '2024-01-01'), null, 'a single-day range is allowed');
}

/* --------------------------------------------- over-the-air update helpers */
// Loaded with `require` undefined, so the module takes its "expo-updates is not
// linked" path — the Expo Go / dev-client case that must degrade, never crash.
const UP = loadPure('mobile-app/src/lib/appUpdates.js');

section('update status helpers');
{
  eq(UP.shortUpdateId('2f1c9a8b-1234-4c5d-9e0f-abcdef123456'), '2f1c9a8b',
    'a bundle id shortens to eight readable characters');
  eq(UP.shortUpdateId('ABCDEF12-0000'), 'abcdef12', 'the short id is lowercased for reading aloud');
  eq(UP.shortUpdateId(null), '', 'a missing bundle id is empty, not the string "null"');
  eq(UP.shortUpdateId(''), '', 'an empty bundle id stays empty');

  const now = Date.parse('2024-06-10T12:00:00.000Z');
  eq(UP.updateAge('2024-06-10T11:59:40.000Z', now), { unit: 'now', n: 0 }, 'seconds old reads as just now');
  eq(UP.updateAge('2024-06-10T11:20:00.000Z', now), { unit: 'minutes', n: 40 }, 'under an hour reads in minutes');
  eq(UP.updateAge('2024-06-10T06:00:00.000Z', now), { unit: 'hours', n: 6 }, 'under a day reads in hours');
  eq(UP.updateAge('2024-06-01T12:00:00.000Z', now), { unit: 'days', n: 9 }, 'over a day reads in days');
  eq(UP.updateAge(null, now), null, 'a missing timestamp has no age rather than a wrong one');
  eq(UP.updateAge('not a date', now), null, 'an unparseable timestamp has no age');
  eq(UP.updateAge('2024-06-10T13:00:00.000Z', now), { unit: 'now', n: 0 },
    'a clock-skewed future timestamp does not produce a negative age');
}

section('update status with expo-updates unavailable');
{
  // This is the whole safety property: on a build where the native module is
  // missing, NOTHING here may throw and the surface must report itself off.
  let status = null;
  let threw = null;
  try { status = UP.getUpdateStatus(); } catch (e) { threw = e; }
  eq(threw, null, 'reading the update status does not throw when expo-updates is missing');
  eq(status && status.available, false, 'it reports itself unavailable');
  eq(status && status.enabled, false, 'it reports updates as not enabled');
  eq(status && status.shortId, '', 'there is no bundle id to show');

  await UP.checkAndApplyUpdate()
    .then((r) => eq(r, { outcome: 'disabled' },
      'checking for updates resolves to "disabled" instead of throwing'))
    .catch((e) => { failures += 1; console.error('  FAIL  checkAndApplyUpdate rejected: ' + e.message); });
}

/* ------------------------------------------- discovery: chips and the tabs */
// The two fixes below are NAVIGATION and LAYOUT, which this harness cannot
// render — there is no React runner here, by design (see the header). What it
// CAN do, and what these checks do, is pin the source facts those fixes consist
// of: which categories the shared chip list holds, that the product-search
// screen actually renders them in its empty state, which tabs the consumer app
// registers and in what order, and that every label key those tabs and chips ask
// for exists in the English dictionary so none of them can render as a raw key
// name. Stated plainly: this proves the wiring, not the pixels.
const CATS = loadPure('mobile-app/src/consumer/lib/categories.js', ['CATEGORIES']);
const psearchSrc = fs.readFileSync(path.join(ROOT, 'mobile-app/src/consumer/screens/ProductSearchScreen.js'), 'utf8');
const shopsSrc = fs.readFileSync(path.join(ROOT, 'mobile-app/src/consumer/screens/ShopsScreen.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'mobile-app/src/consumer/ConsumerApp.js'), 'utf8');
const webShopsSrc = fs.readFileSync(path.join(ROOT, 'admin-dashboard/src/pages/c/shops.js'), 'utf8');

// The English block of the consumer dictionary, as raw text: enough to answer
// "does this key exist", which is the only question asked of it here.
const consumerI18n = fs.readFileSync(path.join(ROOT, 'mobile-app/src/consumer/i18n.js'), 'utf8');
const enBlock = consumerI18n.slice(
  consumerI18n.indexOf('const en = {'),
  consumerI18n.indexOf('const hi = {'),
);
const hasEnKey = (k) => enBlock.includes(`'${k}':`);

section('category chips');
{
  const cats = CATS.CATEGORIES;

  // WHAT CHANGED, AND WHY THIS SECTION NO LONGER COMPARES ITSELF TO THE WEB.
  // A chip used to carry a KEYWORD and run a text search: "Dairy" searched
  // `milk` and reached 14 of the catalogue's 44 Dairy SKUs, "Household"
  // searched `soap` and reached 20 of 294. It now carries a SHELF KEY that the
  // endpoint resolves against the catalogue's own category/subcategory columns.
  // The web's /c/shops chips are still the old keyword list — matching them was
  // the point of the old check and would now pin the app back to the defect —
  // so what is asserted instead is that the app's list and the SERVER'S
  // allowlist agree, which is the pairing that can actually break at run time.
  eq(cats.map((c) => c.key),
    ['cat.attaRice', 'cat.dalPulses', 'cat.spices', 'cat.cookingOils',
      'cat.household', 'cat.personalCare'],
    'six shelves, staples first');
  eq(cats.map((c) => c.category),
    ['atta-rice', 'dal-pulses', 'spices', 'cooking-oils', 'household', 'personal-care'],
    'every chip carries a shelf key, not a keyword');

  // The server's closed allowlist, read out of the file that owns it.
  const shelvesSrc = fs.readFileSync(path.join(ROOT, 'backend/src/utils/catalog-shelves.js'), 'utf8');
  const serverKeys = [...shelvesSrc.matchAll(/\{ key: '([a-z-]+)'/g)].map((m) => m[1]);
  eq(serverKeys, cats.map((c) => c.category),
    'the app asks for exactly the shelves the server allows, in the same order');

  // Every shelf the server names must resolve to catalogue values that the
  // shipped seed actually uses — otherwise a chip is a guess again, just a
  // more expensive one.
  const seed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'backend/src/data/catalog-seed.json'), 'utf8'),
  );
  const realCats = new Set(seed.map((s) => s.category));
  const realSubs = new Set(seed.map((s) => s.subcategory));
  const named = [...shelvesSrc.matchAll(/(categories|subcategories): \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[2].matchAll(/'([^']+)'/g)].map((x) => ({ kind: m[1], value: x[1] })));
  ok(named.length >= cats.length, 'each shelf names at least one catalogue value');
  named.forEach((n) => ok(
    n.kind === 'categories' ? realCats.has(n.value) : realSubs.has(n.value),
    `shelf value "${n.value}" is a real catalogue ${n.kind === 'categories' ? 'category' : 'subcategory'}`,
  ));

  // The old keyword survives ONLY as the degradation path for a backend that
  // predates the shelf filter, so it must still be there and still be a word.
  cats.forEach((c) => ok(typeof c.term === 'string' && c.term.length > 0,
    `"${c.category}" keeps a fallback keyword for an older server`));

  cats.forEach((c) => ok(hasEnKey(c.key), `"${c.key}" exists in the en dictionary`));

  ok(shopsSrc.includes("from '../lib/categories'"),
    'the shop directory reads the shared list rather than its own copy');
  ok(psearchSrc.includes("from '../lib/categories'"),
    'the product search screen reads the shared list too');
  ok(shopsSrc.includes('goShelf(c.category)'),
    'the directory chip opens product search on a shelf, not a keyword');

  // The web PWA's own chips are deliberately UNTOUCHED this batch and are still
  // keywords. Recorded here so the divergence is a stated fact rather than an
  // accident somebody discovers later.
  const webCats = [...webShopsSrc.matchAll(/\{ key: '(\w+)', term: '(\w+)', icon: '([^']+)' \}/g)]
    .map((m) => ({ key: m[1], term: m[2] }));
  eq(webCats.map((c) => c.term), ['rice', 'milk', 'biscuit', 'soap', 'shampoo'],
    'the web directory still runs the old keyword chips — a follow-up, not a regression');
}

section('the search unit: box then voice');
{
  // The voice control is the zero-literacy, zero-data path and the one thing on
  // this screen that works for someone who cannot read the box above it, so it
  // sits directly under the box and is full width. The old screen had a small
  // mic beside the field on the DIRECTORY and nothing at all here.
  const boxAt = psearchSrc.indexOf('styles.searchBar');
  const voiceAt = psearchSrc.indexOf('styles.voiceBtn');
  const catsAt = psearchSrc.indexOf('CATEGORIES.map');
  ok(boxAt > -1 && voiceAt > boxAt, 'the voice control is rendered after the text box');
  ok(catsAt > voiceAt, 'and above the category chips');

  ok(psearchSrc.includes("t('psearch.voiceIn'"),
    'the control names the language it will listen in');
  ok(psearchSrc.includes('languageLabel(lang)'),
    'that language is the language’s own name from LANGUAGES, not a translated string');
  ok(psearchSrc.includes('voice.supported && voice.localeSupported(lang)'),
    'it respects the per-language ASR capability flags');
  ok(/\{canVoice \? \(/.test(psearchSrc),
    'a device or language that cannot listen renders no control at all');
  ok(!psearchSrc.includes("t('voice.notInLanguage')"),
    'and says nothing about it — no nag on a screen the shopper cannot act on');

  const voiceStyle = psearchSrc.slice(psearchSrc.indexOf('  voiceBtn: {'));
  const minH = voiceStyle.match(/minHeight: (\d+)/);
  ok(minH && Number(minH[1]) >= 56, 'the control is a large, unmistakable target');
}

section('the browse surface, in order');
{
  // Order on the screen is the order of the source, so read the positions.
  const again = psearchSrc.indexOf("t('psearch.buyAgain')");
  const recent = psearchSrc.indexOf("t('psearch.recent')");
  const browse = psearchSrc.indexOf("t('psearch.browse')");
  ok(again > -1 && recent > again, 'recent searches come after buy-it-again');
  ok(browse > recent, 'shop-by-category comes last');
  ['psearch.buyAgain', 'psearch.recent', 'psearch.clearRecent', 'psearch.browse', 'psearch.voiceIn']
    .forEach((k) => ok(hasEnKey(k), `"${k}" exists in the en dictionary`));

  // THE GOVERNING RULE: an empty personal section renders NOTHING. Not a
  // skeleton, not "you have no past orders". Both are guarded on a non-zero
  // length, and the category chips are guarded on nothing at all.
  ok(/browsing && buyAgain\.length > 0 \?/.test(psearchSrc),
    'buy-it-again renders only when it has items');
  ok(/browsing && recent\.length > 0 \?/.test(psearchSrc),
    'recent searches render only when there are any');
  ok(/\{browsing \? \(/.test(psearchSrc),
    'the category chips are always present — the universal fallback');

  // No per-item price lookup: the brief's hard rule for a screen drawn on 2G.
  // The sentinel matters: without it a screen with no buy-again section at all
  // would slice an EMPTY string here and "contains no price" would pass for
  // precisely the wrong reason.
  const againBlock = again > -1 && recent > again ? psearchSrc.slice(again, recent) : ' money(';
  ok(!againBlock.includes('money('), 'buy-it-again shows no price');
  ok(againBlock.includes("t('psearch.atShop'"), 'but does show which shop it came from');

  ok(psearchSrc.includes('const token = await getToken();'),
    'buy-it-again is signed-in only and never fires a request without a token');
}

section('recent searches are local only');
{
  const store = fs.readFileSync(
    path.join(ROOT, 'mobile-app/src/consumer/lib/recentSearchStorage.js'), 'utf8',
  );
  ok(store.includes("from 'expo-secure-store'"),
    'stored in expo-secure-store, which the app already depends on');
  ok(!/consumerApi|axios|fetch\(/.test(store),
    'there is no backend behind recent searches and nothing is synced');

  const R = loadPure('mobile-app/src/consumer/lib/recentSearches.js', ['RECENT_MAX', 'TERM_MAX']);
  eq(R.addRecentTerm([], 'atta'), ['atta'], 'a first term becomes the list');
  eq(R.addRecentTerm(['dal', 'atta'], 'chai'), ['chai', 'dal', 'atta'], 'newest first');
  eq(R.addRecentTerm(['dal', 'atta'], 'atta'), ['atta', 'dal'],
    'a repeat moves to the front rather than duplicating');
  eq(R.addRecentTerm(['Toor Dal'], 'toor dal'), ['toor dal'],
    'de-duplication ignores case and keeps the latest spelling');
  eq(R.addRecentTerm(['a'], '   '), ['a'], 'a blank term changes nothing');
  eq(R.addRecentTerm(null, 'atta'), ['atta'], 'a missing list is an empty one, not a throw');
  eq(R.addRecentTerm(['a', 'b', 'c', 'd', 'e', 'f'], 'g').length, R.RECENT_MAX,
    'the list is capped');
  eq(R.addRecentTerm([], '  chai   patti '), ['chai patti'], 'whitespace is collapsed');
  eq(R.cleanTerm('x'.repeat(200)).length, R.TERM_MAX, 'an absurdly long term is capped');

  eq(R.parseRecent(''), [], 'nothing stored reads as an empty list');
  eq(R.parseRecent('not json'), [], 'a corrupt value reads as an empty list, not a throw');
  eq(R.parseRecent('{"a":1}'), [], 'a non-array reads as an empty list');
  eq(R.parseRecent('["atta",5,null,"Atta","dal"]'), ['atta', 'dal'],
    'junk entries and duplicates are dropped on the way in');
  eq(R.parseRecent(R.serializeRecent(['atta', 'dal'])), ['atta', 'dal'], 'a round trip is lossless');
}

section('degrading against an older backend');
{
  const apiSrc = fs.readFileSync(path.join(ROOT, 'mobile-app/src/consumer/consumerApi.js'), 'utf8');

  // The backend deploys before the app bundle does, but the app can still meet
  // a server that has not been updated. Neither new call may then break the
  // screen.
  const buyAgain = apiSrc.slice(apiSrc.indexOf('buyAgain:'));
  ok(/\.catch\(\(\) => \[\]\)/.test(buyAgain.slice(0, 600)),
    'buy-it-again resolves to an empty list on ANY failure, including a 404');

  const search = apiSrc.slice(apiSrc.indexOf('searchProducts:'));
  ok(/status === 400 \|\| status === 404 \|\| status === 422/.test(search),
    'a shelf request refused by an older server is recognised as such');
  ok(search.includes('fallbackTerm'),
    'and retried once with the keyword that chip used before shelves existed');
  ok(/if \(!oldServer \|\| !term\) throw err;/.test(search),
    'a timeout or a dead radio is NOT retried and surfaces as itself');
}

section('consumer tabs');
{
  const tabs = [...appSrc.matchAll(/<Tab\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);
  eq(tabs, ['KhataTab', 'ShopsTab', 'ProductsTab', 'CartTab', 'OrdersTab', 'AccountTab'],
    'six tabs, matching the web’s set, with Products beside Shops');

  const labelKeys = [...appSrc.matchAll(/tabBarLabel: tabLabel\(t\('([\w.]+)'\)\)/g)].map((m) => m[1]);
  eq(labelKeys,
    ['tab.khata', 'tab.shops', 'tab.products', 'tab.cart', 'tab.orders', 'tab.account'],
    'every tab is labelled from the dictionary, in tab order');
  labelKeys.forEach((k) => ok(hasEnKey(k), `"${k}" exists in the en dictionary`));

  // Six columns on a 320dp phone are 53dp each. The label has to wrap rather
  // than truncate, which is what the explicit two-line label component and the
  // taller bar are for.
  ok(/numberOfLines=\{2\}/.test(appSrc), 'tab labels may wrap to two lines instead of truncating');
  const barHeight = appSrc.match(/tabBarStyle: \{[^}]*height: (\d+)/);
  ok(barHeight && Number(barHeight[1]) >= 78,
    'the bar is tall enough for an icon above a two-line label');
  ok(/tabBarItemStyle: \{ paddingHorizontal: 0 \}/.test(appSrc),
    'each tab gets its whole column, so an Indic word is not padded into an ellipsis');

  // Product search keeps its original door too: the directory's product bar and
  // its chips still push it inside the Shops stack.
  ok(/<ShopsStack\.Screen name="ProductSearch"/.test(appSrc),
    'product search is still reachable from the shop directory');
  ok(/<ProductsStack\.Screen name="ShopDetail"/.test(appSrc),
    'a result opens the seller inside the Products tab rather than jumping tabs');
}

console.log('');
if (failures) {
  console.error(`${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`All ${checks} checks passed.`);
