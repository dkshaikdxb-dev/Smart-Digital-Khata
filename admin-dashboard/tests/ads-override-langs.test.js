/**
 * A marketer could not write Bengali, Gujarati or Marathi promo creative.
 *
 * The serving side was right all along: promos.controller reads
 * COALESCE(c.i18n -> $lang ->> 'title', c.title) — whatever key sits in the
 * blob is served — and resolveServingLang gates on languages.is_active, the
 * registry. But the Campaigns desk offered a HARDCODED seven-language picker
 * (hi/ta/te/kn/ml/ur/en) written before bn/gu/mr were activated. There was no
 * field to type the text into, so every Bengali, Gujarati and Marathi shopper
 * got the English base string, forever, with nothing anywhere reporting a gap.
 *
 * The same shape of defect as the old language gate and the frozen
 * has_catalogue flag: a second, stale copy of a list the registry already owns.
 * So the fix is not "add three more codes" — it is to stop keeping a copy.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

import { clearPermsCache } from '../src/lib/adminPerms';
import { loadActiveLanguages } from '../src/lib/i18n';
import { toOverrideLangs, FALLBACK_OVERRIDE_LANGS } from '../src/lib/overrideLangs';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
    query: {}, pathname: '/admin/ads', route: '/admin/ads',
    asPath: '/admin/ads', isReady: true,
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(), apiFetchMeta: jest.fn(), apiPost: jest.fn(), clearApiCache: jest.fn(),
}));

const api = require('../src/lib/api');

// Swapped per test by mountAds so one case can hand back a partial body.
let aiStatsBody;

const PERMS = ['ads:view', 'ads:manage', 'shops:view', 'audit:view'];

// The nine the registry actually has active today — the seven the picker knew
// about plus the three it did not.
const REGISTRY = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'mr', label: 'मराठी' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'ur', label: 'اردو', rtl: true },
];

// Bring the Campaigns desk up with the registry answering `languages`.
// loadActiveLanguages() goes through global fetch, not apiFetch, and overwrites
// its cached list on every successful load — so no module reset is needed (and
// resetModules would be wrong here: it hands the page a different copy of React
// than the test renderer holds).
// What GET /api/admin/moderation/ai-stats really answers with.
const AI_STATS = {
  days: 30,
  auto_approved: 12, held: 3, reviewed: 2, saved: 10, overturned: 1,
  agreement: { agreed: 9, disagreed: 2 },
  admin: { approve_after_ai_approve: 9, reject_after_ai_hold: 0, reject_after_ai_approve: 1, approve_after_ai_hold: 1 },
};

async function mountAds(languages, { aiStats = AI_STATS } = {}) {
  aiStatsBody = aiStats;
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ languages }) }));
  await loadActiveLanguages();
  const Page = require('../src/pages/admin/ads').default;
  render(<Page />);
  // Scope to the overrides fieldset, NOT the document. The nav's own
  // LangSwitch also carries aria-label="Language" and is already registry-fed,
  // so an unscoped findByLabelText('Language') silently matches THAT and passes
  // against the broken page — it did, until this was scoped.
  const fs = await screen.findByRole('group', { name: /Per-language overrides/i });
  return within(fs).getByLabelText('Language');
}

const codesIn = (picker) =>
  Array.from(picker.querySelectorAll('option')).map((o) => o.value);

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'admin');
  clearPermsCache();
  api.apiFetch.mockImplementation((path) => {
    if (path.startsWith('/api/admin/me')) return Promise.resolve({ admin_role: 'super', permissions: PERMS });
    if (path.startsWith('/api/admin/moderation/pending-count')) return Promise.resolve({ total: 0 });
    if (path.startsWith('/api/admin/moderation/ai-stats')) return Promise.resolve(aiStatsBody);
    return Promise.resolve({ items: [], towns: [], villages: [], pincodes: [] });
  });
  api.apiFetchMeta.mockImplementation((path, opts) =>
    api.apiFetch(path, opts).then((data) => ({ data, fromCache: false, cachedAt: null })));
});

afterEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  delete global.fetch;
});

describe('promo creative can be authored in every active language', () => {
  test('bn, gu and mr are offered once the registry says they are active', async () => {
    const picker = await mountAds(REGISTRY);
    await waitFor(() => expect(codesIn(picker)).toEqual(expect.arrayContaining(['bn', 'gu', 'mr'])));
  });

  test('the picker IS the registry, not a copy of it — a newly activated code appears', async () => {
    // A language nobody hardcoded anywhere. If the list were still a literal,
    // this could not pass however many codes that literal held.
    const picker = await mountAds(REGISTRY.concat([{ code: 'or', label: 'ଓଡ଼ିଆ' }]));
    await waitFor(() => expect(codesIn(picker)).toContain('or'));
  });

  test('the native label is what the marketer reads, not the bare code', async () => {
    const picker = await mountAds(REGISTRY);
    await waitFor(() => {
      const bn = Array.from(picker.querySelectorAll('option')).find((o) => o.value === 'bn');
      expect(bn && bn.textContent).toContain('বাংলা');
    });
  });
});

describe('the campaign builder is actually labelled', () => {
  test('the language control is reachable by its label, not just by position', async () => {
    // The <label> carried no htmlFor and the control was a SIBLING, so nothing
    // on this page was really labelled: a screen reader announced an unnamed
    // combo box, and clicking the label did not focus it. findByLabelText is
    // the assertion — it only resolves if the two are associated.
    const picker = await mountAds(REGISTRY);
    expect(picker.tagName).toBe('SELECT');
  });
});

describe('a half-answered AI-stats body does not take the desk down', () => {
  test('the page still renders, and the missing numbers read as dashes', async () => {
    // These were read as aiStats.agreement.agreed — an unguarded nested read on
    // an API response, INSIDE render, so a body without `agreement` threw and
    // blanked the whole Campaigns page rather than just this strip. Exactly the
    // failure the owner Settings page had. A rolling deploy where the web tier
    // is newer than the API is enough to produce one.
    const picker = await mountAds(REGISTRY, { aiStats: { days: 30, auto_approved: 12, held: 3, reviewed: 2 } });
    // The builder below it still came up at all — that is the regression.
    expect(picker.tagName).toBe('SELECT');
    // And the strip itself renders, with the numbers it did not get shown as
    // dashes rather than swallowing the page.
    const heading = await screen.findByRole('heading', { name: /AI triage/ });
    const strip = heading.closest('.card');
    expect(strip.textContent).toMatch(/Admins agreed\s*—\s*\/\s*disagreed\s*—/);
    // The numbers it DID get are still real numbers, not dashes.
    expect(strip.textContent).toContain('12');
  });
});

/* ------------------------------------------------- the list-building itself */

describe('toOverrideLangs', () => {
  const codes = (...args) => toOverrideLangs(...args).map((l) => l.code);

  test('English is last — it is the base the rest fall back to, not the first choice', () => {
    const c = codes(REGISTRY, []);
    expect(c[c.length - 1]).toBe('en');
    expect(c.filter((x) => x === 'en')).toHaveLength(1);
  });

  test('a registry that never answered still leaves a usable picker', () => {
    // Offline, or the fetch blocked: useActiveLanguages hands back the built-in
    // LANGS, and an empty/absent list must fall back rather than render blank.
    for (const empty of [null, undefined, []]) {
      expect(codes(empty, [])).toEqual(FALLBACK_OVERRIDE_LANGS.map((l) => l.code));
    }
  });

  test('a language deactivated after its creative was written is still reachable', () => {
    // Otherwise the text sits in the blob, serves to nobody, and cannot be read
    // or cleared from the desk that wrote it.
    const out = toOverrideLangs(REGISTRY, ['bn', 'sat']);
    const sat = out.find((l) => l.code === 'sat');
    expect(sat).toBeTruthy();
    expect(sat.inactive).toBe(true);
    // bn is active, so it comes from the registry with its native label and is
    // NOT marked — an authored code must not duplicate or downgrade a live one.
    const bn = out.filter((l) => l.code === 'bn');
    expect(bn).toHaveLength(1);
    expect(bn[0].name).toBe('বাংলা');
    expect(bn[0].inactive).toBeUndefined();
  });

  test('English is never duplicated by an authored "en" block', () => {
    expect(codes(REGISTRY, ['en'])).toEqual(codes(REGISTRY, []));
  });

  test('a registry that repeats a code lists it once', () => {
    expect(codes([{ code: 'hi', label: 'हिन्दी' }, { code: 'hi', label: 'Hindi' }], []))
      .toEqual(['hi', 'en']);
  });
});
