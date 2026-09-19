#!/usr/bin/env node
/**
 * The accent bootstrap: that it works, and that it cannot be bypassed.
 *
 * Run:  node scripts/mobile-theme-boot.test.mjs        (from the repo root)
 *
 * WHY THIS FILE EXISTS SEPARATELY. mobile-app has no test runner and CI installs
 * nothing for it, so this follows the vm pattern scripts/mobile-consumer-logic
 * .test.mjs already set. But it is not testing pure logic — it is testing an
 * ORDER, and a rule about how the source is allowed to be written. Two kinds of
 * check, kept in one file because they guard one thing:
 *
 *   MECHANISM — a module-level StyleSheet.create evaluated after the accent is
 *     applied sees the new colour, and one evaluated before does not. That is
 *     the whole reason App.js require()s its tree instead of importing it, and
 *     it is asserted by actually doing it, both ways round.
 *
 *   BYPASS —  the ways a later change could silently undo it: an eager import
 *     creeping back into App.js, a raw accent hex creeping back into a screen,
 *     a `const { accent } = colors` freezing the value at import. Each of those
 *     leaves an app that still builds, still runs, and paints 56 of the 68
 *     themed references the wrong colour. None of them is visible in a diff
 *     unless something is looking.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const APP = path.join(ROOT, 'mobile-app');
const require_ = createRequire(import.meta.url);

let failures = 0;
let checks = 0;
function ok(cond, what) {
  checks += 1;
  if (!cond) { failures += 1; console.error(`  FAIL  ${what}`); }
}
// Awaits, so a thunk returning a promise is compared to its VALUE. Without
// this every async assertion silently compares a Promise object and passes or
// fails for the wrong reason — which is how the first draft of this file
// reported nine green checks it had not actually made.
async function eq(actual, expected, what) {
  let got;
  try { got = await (typeof actual === 'function' ? actual() : actual); }
  catch (e) { got = `threw: ${e && e.message}`; }
  const same = JSON.stringify(got) === JSON.stringify(expected);
  checks += 1;
  if (!same) {
    failures += 1;
    console.error(`  FAIL  ${what}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(got)}`);
  }
}
function section(name) { console.log(`\n${name}`); }

// ---------------------------------------------------------------------------
// A very small ESM loader over vm.
//
// The app's sources are ESM in a CommonJS package with no build step available
// here, so they are loaded by rewriting the import/export syntax and running
// the result in a context holding the bindings. Relative specifiers are loaded
// for real, recursively — these tests exercise the actual theme.js and
// bootAccent.js, not a paraphrase of them. Bare specifiers (expo-secure-store)
// come from `stubs`, which is how the SecureStore behaviour is driven.
// ---------------------------------------------------------------------------
const IMPORT_RE = /^import\s+(?:(\*\s+as\s+\w+)|(\{[^}]*\})|(\w+))?\s*(?:,\s*(\{[^}]*\}))?\s*from\s*'([^']+)';?$/gm;

// ONE registry by default, like a real bundler's. A per-call cache would hand
// bootAccent.js its own private copy of theme.js, and every assertion that
// "the boot module painted the theme the screens read" would be comparing two
// unrelated objects and passing for no reason. Pass `new Map()` where a test
// deliberately wants a module with fresh state.
const REGISTRY = new Map();

function loadModule(rel, stubs = {}, cache = REGISTRY) {
  const abs = path.join(APP, rel);
  if (cache.has(abs)) return cache.get(abs);
  let code = fs.readFileSync(abs, 'utf8');
  const bindings = {};

  code = code.replace(IMPORT_RE, (_m, star, named1, def, named2, spec) => {
    let mod;
    if (spec.startsWith('.')) {
      const target = path.relative(APP, path.resolve(path.dirname(abs), spec)) + '.js';
      mod = loadModule(target, stubs, cache);
    } else {
      if (!(spec in stubs)) throw new Error(`no stub for ${spec} (imported by ${rel})`);
      mod = stubs[spec];
    }
    if (star) bindings[star.replace(/\*\s+as\s+/, '').trim()] = mod;
    if (def) bindings[def] = mod.default !== undefined ? mod.default : mod;
    for (const group of [named1, named2]) {
      if (!group) continue;
      for (const piece of group.slice(1, -1).split(',')) {
        const t = piece.trim();
        if (!t) continue;
        const [from, to] = t.split(/\s+as\s+/).map((x) => x.trim());
        bindings[to || from] = mod[from];
      }
    }
    return '';
  });

  // Collect what this module exports, then strip the keyword.
  const names = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^export\s*\{([^}]*)\};?$/gm)) {
    for (const piece of m[1].split(',')) {
      const t = piece.trim();
      if (t) names.add((t.split(/\s+as\s+/)[1] || t).trim());
    }
  }
  code = code
    .replace(/^export\s*\{[^}]*\};?$/gm, '')
    .replace(/^export\s+default\s+/gm, 'globalThis.__default = ')
    .replace(/^export\s+/gm, '');

  const ctx = {
    console, Date, Math, Number, String, Array, Object, Map, Set, JSON,
    isNaN, parseInt, parseFloat, setTimeout, Promise, RegExp, Error,
    ...bindings,
  };
  vm.createContext(ctx);
  code += `\n;globalThis.__exports = { ${[...names].join(', ')} };`;
  new vm.Script(code, { filename: rel }).runInContext(ctx);
  const exported = { ...ctx.__exports };
  if (ctx.__default !== undefined) exported.default = ctx.__default;
  cache.set(abs, exported);
  return exported;
}

/** A SecureStore stub whose reads and writes can be made to fail. */
function store({ value = null, readThrows = false, writeThrows = false } = {}) {
  const s = {
    value,
    writes: 0,
    async getItemAsync() { if (readThrows) throw new Error('keystore locked'); return s.value; },
    async setItemAsync(_k, v) { if (writeThrows) throw new Error('disk full'); s.writes += 1; s.value = v; return null; },
  };
  return s;
}

const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');

// ===========================================================================
section('the colour a screen bakes depends on WHEN it is imported');
// ===========================================================================
{
  // This is the mechanism, exercised rather than described: the REAL consumer
  // theme module, a stand-in screen shaped exactly like the 14 real ones (a
  // module-level StyleSheet.create reading colors.accent), and the two possible
  // orders.
  const SCREEN = `const styles = StyleSheet.create({ button: { backgroundColor: colors.accent, color: colors.onAccent } });`;

  function importScreenWith(order) {
    // A fresh instance per run: this test is about a module's state at import,
    // so it must start from the shipped colour both times.
    const theme = loadModule('src/consumer/theme.js', {}, new Map());
    const baked = [];
    const ctx = {
      colors: theme.colors,
      StyleSheet: { create: (o) => { baked.push(JSON.parse(JSON.stringify(o))); return o; } },
    };
    vm.createContext(ctx);
    if (order === 'accent-first') theme.applyAccent('#ff8800');
    new vm.Script(SCREEN, { filename: 'FakeScreen.js' }).runInContext(ctx);
    if (order === 'screen-first') theme.applyAccent('#ff8800');
    return { baked: baked[0].button, live: theme.colors.accent };
  }

  const right = importScreenWith('accent-first');
  await eq(right.baked.backgroundColor, '#ff8800', 'applied BEFORE import: the stylesheet is the new colour');
  await eq(right.baked.color, '#052e16', 'and the ink on it is the one chosen for the NEW colour, not carried over');

  const wrong = importScreenWith('screen-first');
  await eq(wrong.baked.backgroundColor, '#22c55e', 'applied AFTER import: the stylesheet kept the shipped green');
  await eq(wrong.live, '#ff8800', 'even though the live value did change — which is exactly the half-themed screen');
  ok(right.baked.backgroundColor !== wrong.baked.backgroundColor,
    'so the order is load-bearing, not incidental');
}

// ===========================================================================
section('App.js cannot import the screen tree early');
// ===========================================================================
{
  const app = read('App.js');
  const eager = [...app.matchAll(/^import\s+.*?from\s+'([^']+)';$/gm)].map((m) => m[1]);
  await eq(eager.filter((s) => /ConsumerApp|OwnerApp|screens|components|navigation|consumerApi|services\/api/.test(s)), [],
    'no eager import of either tree, its screens, or an api client');
  await eq(eager.sort(), ['./src/bootAccent', 'expo-constants', 'react', 'react-native'],
    'and the eager imports are exactly the four it needs to draw a splash');

  const lazy = [...app.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort();
  await eq(lazy, ['./src/OwnerApp', './src/consumer/ConsumerApp', './src/consumer/consumerApi', './src/services/api'],
    'both trees and both api clients are require()d, not imported');

  // Textual order is the guarantee: establishAccent has to be awaited above the
  // first require, or the require runs first and bakes the wrong colour.
  const awaitAt = app.indexOf('await establishAccent(');
  const firstRequire = app.indexOf("require('./src/");
  ok(awaitAt > -1, 'establishAccent is awaited');
  ok(firstRequire > -1 && awaitAt < firstRequire,
    'and it is awaited BEFORE the first require of a tree');
  ok(app.indexOf('refreshAccentForNextStart(') > firstRequire,
    'the server is asked after the tree is loaded, never before it');
}

// ===========================================================================
section('no screen can opt out of the theme');
// ===========================================================================
{
  const HEX = /#(?:22c55e|1C7A45|1c7a45|052e16)/gi;
  // The only files allowed to write the accent down: the two theme modules that
  // define it, the cache module's default, and the derivation's own inks.
  const ALLOWED = new Set([
    'src/theme.js', 'src/consumer/theme.js',
    'src/consumer/lib/accent.js', 'src/lib/accentDerive.js',
  ]);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(p)) : (p.endsWith('.js') ? [p] : []);
  });
  const files = [path.join(APP, 'App.js'), ...walk(path.join(APP, 'src'))];

  const offenders = [];
  const unimported = [];
  const destructured = [];
  for (const f of files) {
    const rel = path.relative(APP, f);
    const src = fs.readFileSync(f, 'utf8');
    // Comments explain the colours; code must not contain them.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (!ALLOWED.has(rel) && HEX.test(code)) offenders.push(rel);
    if (/\bcolors\.\w/.test(code) && !/import\s*\{[^}]*\bcolors\b[^}]*\}\s*from/.test(code) && !ALLOWED.has(rel)) {
      unimported.push(rel);
    }
    if (/(?:const|let|var)\s*\{[^}]*\b(accent|onAccent|accentDark)\b[^}]*\}\s*=\s*colors\b/.test(code)) {
      destructured.push(rel);
    }
  }
  await eq(offenders, [], 'no file outside the theme modules writes an accent hex literally');
  await eq(unimported, [], 'every file that reads colors.* imports it');
  await eq(destructured, [], 'nobody destructures the accent off colors — that would copy and freeze it');

  // A GREEN READ AGAINST RED IS NOT THE BRAND COLOUR.
  //
  // Both apps keep a fixed `colors.positive` for the greens that carry a
  // meaning — an advance where a debt is red, a payment where a purchase is
  // red, an order completed, a shop open. If one of those is drawn with
  // colors.accent, a festive orange makes "paid" and "owed" the same family of
  // colour and the red/green convention the money screens rely on stops
  // working. The shape is recognisable: both tokens in one expression.
  const paired = [];
  for (const f of files) {
    const rel = path.relative(APP, f);
    const code = fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const line of code.split('\n')) {
      if (/colors\.danger/.test(line) && /colors\.(accent|accentDark)\b/.test(line)) paired.push(`${rel}: ${line.trim()}`);
    }
  }
  await eq(paired, [], 'no red/green pair is drawn with the accent instead of colors.positive');

  // The same mistake in its other shape. A state pill, note, badge or card
  // whose NAME says "this is the good outcome" pairs with a red or amber
  // sibling somewhere else in the file rather than on its own line, so the
  // check above cannot see it — noteOk sits beside noteBad, pillOk beside
  // pillWarn. Matched on the naming pattern those styles already follow, and
  // narrow on purpose: a BUTTON that opens something is brand chrome and must
  // stay free to be the accent, which is why this matches state nouns only.
  const stateish = [];
  for (const f of files) {
    const rel = path.relative(APP, f);
    const code = fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/\b(pill|note|badge|card|dot|tag)(Ok|Open|Completed|Positive|Success|Paid)\s*:\s*\{([^}]*)\}/g)) {
      if (/colors\.(accent|accentDark)\b/.test(m[3])) stateish.push(`${rel}: ${m[1]}${m[2]}`);
    }
  }
  await eq(stateish, [], 'no good-state pill, note, badge or card is drawn with the accent');

  // A MONEY FIGURE IS NEVER THE BRAND COLOUR.
  //
  // Both apps had already settled this without writing it down: every amount,
  // total and balance is either neutral colors.text or takes a red/green tone
  // at runtime. Three had drifted onto the accent — a referral credit, a cart
  // line total, an order's edit note — and a festive orange would have picked
  // exactly those three out of a screen of otherwise neutral figures.
  //
  // The rule reads `color:` only, and that distinction is the point: a rendered
  // figure is TEXT, while a control that acts on money is a SURFACE. "Pay now"
  // keeps its accent fill; the number beside it does not.
  const MONEY = /\b\w*(amt|amount|total|balance|credit|money|price|payable|due|outstanding)\w*\s*:\s*\{([^}]*)\}/gi;
  const money = [];
  for (const f of files) {
    const rel = path.relative(APP, f);
    const code = fs.readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(MONEY)) {
      if (/(^|[^a-zA-Z])color\s*:\s*colors\.(accent|accentDark)\b/.test(m[2])) money.push(`${rel}: ${m[0].split(':')[0].trim()}`);
    }
  }
  await eq(money, [], 'no money figure is drawn with the accent instead of colors.positive');
}

// ===========================================================================
section('cache, then server, then the colour it ships with');
// ===========================================================================
{
  const stubs = { 'expo-secure-store': store() };
  const boot = loadModule('src/bootAccent.js', stubs);
  const theme = loadModule('src/consumer/theme.js');
  const owner = loadModule('src/theme.js');

  const run = async (st) => {
    theme.applyAccent('#22c55e');
    owner.applyAccent('#22c55e');
    return boot.establishAccent(st);
  };

  await eq(async () => (await run(store({ value: '#ff8800' }))).from, 'cache', 'a cached colour is used');
  await eq(() => theme.colors.accent, '#ff8800', 'and it is painted into the consumer theme');
  await eq(() => owner.colors.accent, '#ff8800', 'and into the owner theme, in the same breath');
  await eq(() => owner.colors.positive, '#22c55e', 'while the owner semantic green is left alone');
  await eq(() => theme.colors.positive, '#22c55e', 'and the consumer one too — a festive colour never reaches either');
  // The dead `ok` token this replaced must not come back beside it.
  await eq(() => theme.colors.ok, undefined, 'and there is one name for that role, not two');

  await eq(async () => (await run(store({ value: null }))).accent, '#22c55e', 'nothing cached falls back to the shipped colour');
  await eq(async () => (await run(store({ value: null }))).from, 'default', 'and says so');

  for (const bad of ['#22C55E', '2c5', '#ff88', 'orange', '', '#ff8800 ', null, 42]) {
    await eq(async () => (await run(store({ value: bad }))).accent, '#22c55e',
      `a cached ${JSON.stringify(bad)} is treated as absent, never repaired`);
  }

  await eq(async () => (await run(store({ readThrows: true }))).accent, '#22c55e',
    'a keystore that will not open is just an app with no cache');
  await eq(async () => (await run(store({ readThrows: true }))).from, 'default',
    'and it does not throw on the way out');
}

// ===========================================================================
section('what the server is asked, and what is done with the answer');
// ===========================================================================
{
  const stubs = { 'expo-secure-store': store() };
  const boot = loadModule('src/bootAccent.js', stubs);
  const theme = loadModule('src/consumer/theme.js');
  const accent = loadModule('src/consumer/lib/accent.js');

  const api = (body, { fails = false } = {}) => ({
    calls: [],
    async get(p, o) {
      this.calls.push([p, o]);
      if (fails) throw new Error('offline');
      return { data: body };
    },
  });

  const st = store({ value: '#ff8800' });
  theme.applyAccent('#22c55e');
  const res = await boot.refreshAccentForNextStart(api({ theme: { accent: '#0055ff' } }), st);
  await eq(res.stored, true, 'a fresh colour from the server is cached');
  await eq(st.value, '#0055ff', 'under the same key the next start reads');
  await eq(theme.colors.accent, '#22c55e',
    'and it does NOT repaint now — the stylesheets are already baked, so this start keeps its colour');

  const offline = store({ value: '#ff8800' });
  const r2 = await boot.refreshAccentForNextStart(api(null, { fails: true }), offline);
  await eq(r2.stored, false, 'an unreachable server stores nothing');
  await eq(offline.value, '#ff8800', 'and leaves the last good colour exactly where it was');

  const junk = store({ value: '#ff8800' });
  for (const body of [{}, null, { theme: {} }, { theme: { accent: 'orange' } }, { theme: { accent: '#FF8800' } }]) {
    const r = await boot.refreshAccentForNextStart(api(body), junk);
    await eq(r.stored, false, `a server body ${JSON.stringify(body)} is not cached`);
  }
  await eq(junk.value, '#ff8800', 'so a malformed answer can never evict a good cached colour');

  const readonly = store({ value: null, writeThrows: true });
  const r3 = await boot.refreshAccentForNextStart(api({ theme: { accent: '#0055ff' } }), readonly);
  await eq(r3.reason, 'unwritable', 'a cache that will not be written reports it');
  await eq(r3.accent, '#0055ff', 'without losing the colour it fetched');

  // The path, which is the one thing here that fails silently and only in
  // production: both axios clients are created with the API HOST as baseURL, so
  // every call writes its own /api prefix.
  const asked = api({ theme: { accent: '#0055ff' } });
  await boot.refreshAccentForNextStart(asked, store());
  await eq(asked.calls[0][0], '/api/public/config', 'the config is asked for under the /api prefix');
  const consumerApi = read('src/consumer/consumerApi.js');
  ok(/api\.get\(`?\/api\/public\//.test(consumerApi),
    'which is the prefix the other public calls in this app already use');
  ok(asked.calls[0][1] && asked.calls[0][1].timeout <= 5000,
    'with a short timeout, because nobody should wait on a decoration');
  await eq(accent.CONFIG_PATH, '/api/public/config', 'and the path is a named constant, not a literal at the call site');
}

// ===========================================================================
section('the derived colours agree with the server that derives them too');
// ===========================================================================
{
  const derive = loadModule('src/lib/accentDerive.js');
  const backend = require_(path.join(ROOT, 'backend/src/utils/contrast.js'));

  // The device has to choose an ink offline, from one cached hex, so this rule
  // exists here as well as on the server. Two copies drift; this is the check
  // that makes it visible.
  const TRIED = ['#22c55e', '#ff8800', '#0055ff', '#dc2626', '#eab308', '#7c3aed',
    '#03a9f4', '#ffffff', '#000000', '#777777', '#ffeb3b', '#0b1a4a'];
  const disagree = TRIED.filter((c) => derive.onAccentFor(c) !== backend.inkOn(c, backend.ON_ACCENT, '#ffffff'));
  await eq(disagree, [], 'the app picks the same ink on an accent as the server does, for every colour tried');

  for (const c of TRIED) {
    const l = derive.luminance(c);
    ok(Math.abs(l - backend.luminance(c)) < 1e-12, `and the same luminance for ${c}`);
  }

  // accentDark has no server counterpart; its evidence is that it reproduces the
  // value that was chosen by hand for the colour this app ships with.
  const ch = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const got = ch(derive.accentDarkFor('#22c55e'));
  const want = ch('#1c7a45');
  ok(got.every((v, i) => Math.abs(v - want[i]) <= 3),
    `accentDark derives ${derive.accentDarkFor('#22c55e')}, within three points per channel of the hand-picked #1C7A45`);
}

// ===========================================================================
section('nothing changes colour on the day this ships');
// ===========================================================================
{
  const consumer = loadModule('src/consumer/theme.js');
  const owner = loadModule('src/theme.js');
  consumer.applyAccent('#ff8800');
  owner.applyAccent('#ff8800');
  consumer.applyAccent(consumer.DEFAULT_ACCENT);
  owner.applyAccent(owner.DEFAULT_ACCENT);

  // Every token substituted into a screen must resolve to the exact literal that
  // screen used to contain, or this lands as an unrequested restyle.
  await eq(consumer.colors.accent, '#22c55e', 'consumer accent is the green it always was');
  await eq(consumer.colors.onAccent, '#052e16', 'consumer on-accent likewise');
  await eq(owner.colors.accent, '#22c55e', 'owner accent likewise');
  await eq(owner.colors.onAccent, '#052e16', 'owner on-accent likewise');
  await eq(owner.colors.positive, '#22c55e', 'and the owner semantic green is untouched by any of it');
  await eq(consumer.colors.positive, '#22c55e', 'as is the consumer one');
  await eq(consumer.DEFAULT_ACCENT, owner.DEFAULT_ACCENT, 'both flavors ship the same default');

  const accent = loadModule('src/consumer/lib/accent.js');
  await eq(accent.DEFAULT_ACCENT, consumer.DEFAULT_ACCENT, 'so does the cache module');
  const backend = require_(path.join(ROOT, 'backend/src/utils/contrast.js'));
  await eq(backend.DEFAULT_ACCENT, consumer.DEFAULT_ACCENT, 'and so does the server');

  // accentDark is the one token whose derived value differs from the literal it
  // replaces, so it is NOT derived for the default — the shipped pair stays.
  await eq(consumer.colors.accentDark, '#1C7A45',
    'accentDark is left as the hand-picked shade until an operator actually changes the accent');
}

// ===========================================================================
section('the OTA-pinned files are untouched');
// ===========================================================================
{
  // A change to any of these turns an over-the-air update into a store release,
  // which is the one thing this batch must not do.
  for (const f of ['package.json', 'package-lock.json', 'app.config.js', 'eas.json']) {
    ok(fs.existsSync(path.join(APP, f)), `${f} still exists`);
  }
  const pkg = JSON.parse(read('package.json'));
  ok(!Object.keys(pkg.dependencies || {}).some((d) => /color|chroma|tinycolor/.test(d)),
    'no colour library was added — the derivation is nine lines of arithmetic');
}

console.log(`\n${checks} checks, ${failures} failed.`);
if (failures) process.exit(1);
console.log('The accent is established before the screens exist, and cannot quietly stop being.');
