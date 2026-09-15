// Owner-app checks that need no test runner and no node_modules.
//
// The More menu routes seven of its rows into the live web console through
// FeatureWebView, and the list carried a comment saying the paths were
// "confirmed against admin-dashboard/src/pages". That confirmation was done by
// hand, once. A page renamed or moved on the web side would leave a row in the
// app that opens a 404 inside a WebView, and nothing would say so — the app
// builds, the web builds, and only a shopkeeper finds out.
//
// Same shape as the six other defects this project has had: a real relationship
// between two files kept in a comment instead of in a check. So it is a check.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const ok = (cond, what) => {
  if (cond) return;
  failures += 1;
  console.log(`  FAIL  ${what}`);
};
const section = (name) => console.log(name);

const moreSrc = read('mobile-app/src/screens/MoreScreen.js');
const i18nSrc = read('mobile-app/src/i18n.js');
const webViewSrc = read('mobile-app/src/screens/FeatureWebView.js');

// The English block, as text: enough to answer "does this key exist".
const enBlock = i18nSrc.slice(i18nSrc.indexOf('const en = {'), i18nSrc.indexOf('const hi = {'));
const hasEnKey = (k) => enBlock.includes(`'${k}':`);

section('the More menu reaches pages that exist');
{
  const webItems = [...moreSrc.matchAll(/\{ key: '([\w-]+)', path: '([^']+)', titleKey: '([^']+)'(?:, subKey: '([^']+)')?(?:, ownerOnly: (true))? \}/g)]
    .map((m) => ({ key: m[1], path: m[2], titleKey: m[3], subKey: m[4], ownerOnly: m[5] === 'true' }));

  ok(webItems.length >= 7, `the web rows parse (found ${webItems.length})`);

  for (const it of webItems) {
    // '/account' -> pages/account.js, '/suppliers' -> pages/suppliers.js or
    // pages/suppliers/index.js. A path the web app cannot serve is a row that
    // opens a 404 in a WebView with no way back except the hardware button.
    const rel = it.path.replace(/^\//, '');
    const candidates = [
      `admin-dashboard/src/pages/${rel}.js`,
      `admin-dashboard/src/pages/${rel}/index.js`,
    ];
    ok(candidates.some((c) => fs.existsSync(path.join(ROOT, c))),
      `"${it.key}" opens ${it.path}, which the web app actually serves`);

    ok(hasEnKey(it.titleKey), `"${it.key}" names a title key the en dictionary has (${it.titleKey})`);
    if (it.subKey) ok(hasEnKey(it.subKey), `"${it.key}" names a subtitle key the en dictionary has (${it.subKey})`);
  }

  // Staff management is owner-only on the web (pages/staff.js redirects a
  // non-owner to /dashboard) and at the API. Offering the row to a staff member
  // would send them somewhere they bounce straight out of.
  const staff = webItems.find((i) => i.key === 'staff');
  ok(staff && staff.ownerOnly, 'the Staff row is marked owner-only');
  ok(/it\.ownerOnly \|\| role === 'owner'/.test(moreSrc),
    'and the menu actually filters on it');
  ok(/getRole\(\)/.test(moreSrc), 'reading the real signed-in role, not assuming one');
}

section('the WebView signs in as the person who is actually signed in');
{
  // This injected a constant 'owner' for every user, so a STAFF member opening
  // any web feature got the owner-only console — shown a screen the API then
  // refused. The role is in SecureStore beside the token.
  ok(!/role: 'owner'/.test(webViewSrc),
    'no hardcoded owner role is injected into the web app');
  ok(/getItemAsync\(cfg\.roleKey\)/.test(webViewSrc),
    'the role is read from SecureStore');
  ok(/const effective = role \|\| cfg\.fallbackRole/.test(webViewSrc),
    'with a fallback for a session stored before the role was kept');
}

section('the menu rows a language cannot read');
{
  // A row whose title has no translation renders in English. That is allowed —
  // it is how the dictionary falls back — but it must be a KNOWN gap, not a
  // surprise. Only 'more.suppliers' is expected to be short right now, for
  // bn/gu/mr, because sup.nav has no Bengali/Gujarati/Marathi anywhere in the
  // codebase; it is requested in docs/i18n-web/web-{bn,gu,mr}.csv.
  const langs = ['hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'ur'];
  const blockOf = (lang) => {
    const start = i18nSrc.indexOf(`const ${lang} = {`);
    const next = i18nSrc.indexOf('\nconst ', start + 10);
    return i18nSrc.slice(start, next < 0 ? i18nSrc.length : next);
  };
  const EXPECTED_GAPS = new Set(['bn:more.suppliers', 'gu:more.suppliers', 'mr:more.suppliers']);
  for (const key of ['more.staff', 'more.transactions', 'more.suppliers']) {
    for (const lang of langs) {
      const present = blockOf(lang).includes(`'${key}':`);
      const expectedGap = EXPECTED_GAPS.has(`${lang}:${key}`);
      if (expectedGap) ok(!present, `${lang} still awaits ${key} (tracked, not forgotten)`);
      else ok(present, `${lang} has ${key}`);
    }
  }
}

console.log();
if (failures) {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('All owner-app checks passed.');
