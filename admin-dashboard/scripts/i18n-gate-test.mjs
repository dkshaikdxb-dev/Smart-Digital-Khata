#!/usr/bin/env node
/**
 * Language-gate tests for the owner console + consumer PWA.
 *
 * Run:  npm run test:i18n        (from admin-dashboard/)
 *
 * The dashboard has no jest harness, so this is a plain Node script in the same
 * spirit as scripts/contrast-audit.mjs: it imports the REAL module, exercises it
 * against a fake `window`, and exits non-zero on the first broken promise.
 *
 * What it guards, and why it exists at all: the language gate used to ask "does
 * DICT have a block for this code?". bn, gu and mr are activated in the language
 * registry and have 852 human-audited strings each — but those strings live in
 * the `i18n_overrides` table, not in DICT. So picking Bengali, Gujarati or
 * Marathi silently put the viewer back on English, while still recording that
 * they had chosen, so the one-time first-open prompt never came back. These
 * tests fail on that code and pass on the gate that replaced it.
 *
 * The last group is a source-level check on the two public WhatsApp-link pages
 * (/khata/[token], /pay/[orderId]). They are the highest-traffic customer-facing
 * screens in the product and were 100% hardcoded English; there is no renderer
 * here to mount them in, so instead we assert that they go through t() and that
 * every key they name actually resolves in the English dictionary — a key that
 * renders as its own raw name is worse than the English it replaced.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = process.argv[2] || path.join(HERE, '..', 'src', 'lib', 'i18n.js');
const PAGES_DIR = process.argv[3] || path.join(HERE, '..', 'src', 'pages');

/* ------------------------------------------------------------ tiny harness */
let passed = 0;
const failures = [];
let group = '';

function describe(name) {
  group = name;
  console.log(`\n${name}`);
}
async function it(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(`${group} › ${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what || 'value'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ------------------------------------------------------- fake browser world */
// A localStorage that behaves like the real one (string keys, string values)
// and can be pre-seeded to stand in for a phone that already has a choice on it.
function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

function installWindow(seed) {
  const storage = makeStorage(seed);
  globalThis.window = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  };
  globalThis.localStorage = storage;
  return storage;
}
function removeWindow() {
  delete globalThis.window;
  delete globalThis.localStorage;
}

// The registry answer the real API gives today: the built-in seven plus the
// three Batch Y activations (migration 0033_activate_bn_gu_mr).
const REGISTRY = [
  { code: 'en', label: 'English', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'hi', label: 'हिन्दी', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'ta', label: 'தமிழ்', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'te', label: 'తెలుగు', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'kn', label: 'ಕನ್ನಡ', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'ml', label: 'മലയാളം', rtl: false, has_ui: true, has_catalogue: true },
  { code: 'ur', label: 'اردو', rtl: true, has_ui: true, has_catalogue: true },
  { code: 'bn', label: 'বাংলা', rtl: false, has_ui: true, has_catalogue: false },
  { code: 'gu', label: 'ગુજરાતી', rtl: false, has_ui: true, has_catalogue: false },
  { code: 'mr', label: 'मराठी', rtl: false, has_ui: true, has_catalogue: false },
];

// A stand-in for the two public endpoints. `offline: true` makes every fetch
// reject, exactly like a phone with no signal.
function installFetch({ offline = false, languages = REGISTRY, overrides = {} } = {}) {
  globalThis.fetch = async (url) => {
    if (offline) throw new Error('offline');
    const u = String(url);
    if (u.includes('/api/public/languages')) {
      return { ok: true, json: async () => ({ languages }) };
    }
    if (u.includes('/api/i18n/overrides')) {
      return { ok: true, json: async () => ({ overrides }) };
    }
    return { ok: false, json: async () => ({}) };
  };
}

// Each test gets its OWN copy of the module: the gate keeps module-level state
// (the known-code set, the cached registry), and a test that inherited another
// test's state would prove nothing.
let instance = 0;
async function freshModule() {
  instance += 1;
  return import(`${path.resolve(MODULE_PATH)}?i=${instance}`);
}

/* ------------------------------------------------------------------- tests */

describe('the gate accepts the languages the app actually supports');

await it('a built-in language round-trips', async () => {
  installWindow();
  installFetch();
  const i18n = await freshModule();
  i18n.setLang('hi');
  eq(i18n.getLang(), 'hi', 'stored language');
  removeWindow();
});

await it('a registry-activated language with no DICT block round-trips (bn)', async () => {
  installWindow();
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  i18n.setLang('bn');
  eq(i18n.getLang(), 'bn', 'stored language');
  removeWindow();
});

await it('gu and mr round-trip too', async () => {
  installWindow();
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  for (const code of ['gu', 'mr']) {
    i18n.setLang(code);
    eq(i18n.getLang(), code, `stored language after setLang(${code})`);
  }
  removeWindow();
});

await it('choosing bn does not quietly rewrite the stored value to en', async () => {
  installWindow();
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  i18n.setLang('bn');
  eq(globalThis.window.localStorage.getItem('skhata_lang'), 'bn', 'localStorage skhata_lang');
  removeWindow();
});

describe('someone already burned by the old gate is not stuck');

// The old setLang wrote CHOSEN_KEY even while downgrading the language to en,
// so the first-open prompt never returned: the shopper had "chosen", and what
// they had chosen was thrown away. No data migration should be needed — with a
// correct gate the value that was on their phone all along simply works.
await it('a phone left on gu with the choice flag set now reads gu', async () => {
  installWindow({ skhata_lang: 'gu', skhata_lang_set: '1' });
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  eq(i18n.getLang(), 'gu', 'language on an already-burned phone');
  eq(i18n.hasChosenLang(), true, 'hasChosenLang');
  removeWindow();
});

await it('a phone left on bn reads bn even before the registry answers', async () => {
  // Second open: the registry list was cached on the first one, so the gate
  // knows about bn on first paint without waiting for the network.
  installWindow();
  installFetch();
  const first = await freshModule();
  await first.loadActiveLanguages();
  first.setLang('bn');
  const seeded = globalThis.window.localStorage._dump();

  installWindow(seeded);
  installFetch({ offline: true });
  const second = await freshModule();
  eq(second.getLang(), 'bn', 'language before loadActiveLanguages resolves');
  removeWindow();
});

await it('bn survives an open with no network at all', async () => {
  installWindow();
  installFetch();
  const first = await freshModule();
  await first.loadActiveLanguages();
  first.setLang('bn');
  const seeded = globalThis.window.localStorage._dump();

  installWindow(seeded);
  installFetch({ offline: true });
  const second = await freshModule();
  await second.loadActiveLanguages(); // rejects internally, swallowed
  eq(second.getLang(), 'bn', 'language when the registry fetch fails');
  removeWindow();
});

describe('the gate is still a closed allowlist');

await it('a typo/unknown code is refused by setLang', async () => {
  installWindow();
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  i18n.setLang('zz');
  eq(i18n.getLang(), 'en', 'language after setLang("zz")');
  removeWindow();
});

await it('a stored code for a language that is not supported falls back to en', async () => {
  installWindow({ skhata_lang: 'qq', skhata_lang_set: '1' });
  installFetch();
  const i18n = await freshModule();
  await i18n.loadActiveLanguages();
  eq(i18n.getLang(), 'en', 'language for an unknown stored code');
  removeWindow();
});

await it('a corrupt or hostile cached registry cannot widen the gate', async () => {
  installWindow({ skhata_lang: 'not-a-code', skhata_langs: '["not-a-code","../x","zz"]' });
  installFetch({ offline: true });
  const i18n = await freshModule();
  eq(i18n.getLang(), 'en', 'language for a malformed stored code');
  eq(i18n.isKnownLang('../x'), false, 'isKnownLang("../x")');
  eq(i18n.isKnownLang(''), false, 'isKnownLang("")');
  eq(i18n.isKnownLang(null), false, 'isKnownLang(null)');
  removeWindow();
});

describe('server-side rendering still renders English first');

await it('getLang() is en with no window (SSR)', async () => {
  removeWindow();
  installFetch();
  const i18n = await freshModule();
  eq(i18n.getLang(), 'en', 'SSR language');
});

await it('getActiveLanguages() is the built-in list before the registry resolves', async () => {
  removeWindow();
  installFetch();
  const i18n = await freshModule();
  eq(i18n.getActiveLanguages().length, i18n.LANGS.length, 'active language count on first render');
});

describe('an override-only language really does translate');

await it('bn strings resolve through the overrides, not through DICT', async () => {
  installWindow();
  installFetch({ overrides: { bn: { 'nav.dashboard': 'ড্যাশবোর্ড' } } });
  const i18n = await freshModule();
  // Before the overrides load, bn honestly falls back to the English text.
  eq(i18n.translate('bn', 'nav.dashboard'), 'Dashboard', 'bn before overrides load');
  await i18n.loadOverrides();
  eq(i18n.translate('bn', 'nav.dashboard'), 'ড্যাশবোর্ড', 'bn after overrides load');
  removeWindow();
});

describe('the public WhatsApp-link pages are translated');

const PUBLIC_PAGES = [
  path.join(PAGES_DIR, 'khata', '[token].js'),
  path.join(PAGES_DIR, 'pay', '[orderId].js'),
];

// Literals that were the whole of these pages' copy before they were localized.
// Any of them reappearing means a string went back to being English-only.
const BANNED_LITERALS = {
  '[token].js': ['Link not valid', 'Recent entries', 'Outstanding', 'Loading…', 'Purchase'],
  '[orderId].js': ['Order not found', 'Payment received', 'Awaiting payment', 'Loading…', 'Customer:'],
};

for (const file of PUBLIC_PAGES) {
  const base = path.basename(file);
  await it(`${base} renders its copy through t()`, async () => {
    const src = fs.readFileSync(file, 'utf8');
    ok(/from '\.\.\/\.\.\/lib\/i18n'/.test(src), `${base} does not import the i18n module`);
    ok(/\bt\(/.test(src), `${base} never calls t()`);
  });

  await it(`${base} has no hardcoded English copy left`, async () => {
    const src = fs.readFileSync(file, 'utf8');
    const stillThere = (BANNED_LITERALS[base] || []).filter((s) => src.includes(s));
    ok(stillThere.length === 0, `${base} still contains hardcoded English: ${stillThere.join(', ')}`);
  });

  await it(`${base} names only keys the English dictionary resolves`, async () => {
    removeWindow();
    installFetch();
    const i18n = await freshModule();
    const known = new Set(i18n.getAllKeys());
    const src = fs.readFileSync(file, 'utf8');
    const used = [...src.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
    ok(used.length > 0, `${base} uses no translation keys at all`);
    const missing = used.filter((k) => !known.has(k));
    ok(missing.length === 0, `${base} uses keys missing from DICT.en: ${missing.join(', ')}`);
  });
}

/* ------------------------------------------------------------------ report */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
