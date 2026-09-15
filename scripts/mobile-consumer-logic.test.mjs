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
  eq(cats.map((c) => c.key),
    ['cat.attaRice', 'cat.dairy', 'cat.snacks', 'cat.household', 'cat.personalCare'],
    'the five web categories, in the web order');
  eq(cats.map((c) => c.term), ['rice', 'milk', 'biscuit', 'soap', 'shampoo'],
    'the search TERM stays the English base word the endpoint indexes');

  // The web's own list, read out of the page that owns it. If someone adds a
  // sixth category there, this says so instead of the app quietly lagging.
  const webCats = [...webShopsSrc.matchAll(/\{ key: '(\w+)', term: '(\w+)', icon: '([^']+)' \}/g)]
    .map((m) => ({ key: m[1], term: m[2], icon: m[3] }));
  eq(webCats.map((c) => c.term), cats.map((c) => c.term), 'same terms as the web directory');
  eq(webCats.map((c) => c.icon), cats.map((c) => c.icon), 'same icons as the web directory');

  cats.forEach((c) => ok(hasEnKey(c.key), `"${c.key}" exists in the en dictionary`));

  ok(shopsSrc.includes("from '../lib/categories'"),
    'the shop directory reads the shared list rather than its own copy');
  ok(psearchSrc.includes("from '../lib/categories'"),
    'the product search screen reads the shared list too');
}

section('product search empty state');
{
  // The empty state is the `!searched` branch. Before this batch it held only
  // the psearch.start prompt, which reads as a blank page to a shopper who does
  // not know what to type.
  const branch = psearchSrc.slice(psearchSrc.indexOf('{!error && !loading && !searched ?'));
  const emptyState = branch.slice(0, branch.indexOf('{/* SEARCHED, GENUINELY NOTHING */}'));
  ok(emptyState.includes("t('psearch.start')"), 'the prompt is still there');
  ok(emptyState.includes('CATEGORIES.map'), 'the category chips are rendered in the empty state');
  ok(emptyState.includes('pickCategory(c.term)'), 'tapping a chip runs that category as a search');
  ok(psearchSrc.includes('function pickCategory'), 'the chip handler exists');
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
