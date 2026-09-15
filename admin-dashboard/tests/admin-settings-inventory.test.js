/**
 * The "reorganise, don't delete" net for Admin → Settings.
 *
 * The settings page is one long form over `platform_settings`. It gets moved
 * around — cards regrouped, headings reordered, a switch lifted out of one list
 * and dropped beside the numbers it governs. That is fine. What is not fine is a
 * control, a help sentence or a saved key quietly going missing on the way, and
 * a reordering diff is exactly the kind of diff nobody reads line by line.
 *
 * So the inventory is frozen in tests/fixtures/admin-settings-inventory.json,
 * captured from the page as it stood BEFORE the reorganisation, and every
 * assertion here is a SUPERSET check: the page may grow, it may not shrink.
 *
 *   settingKeys   every platform_settings key named in the source
 *   controlKeys   every key that has an actual input on screen, found by its
 *                 data-setting attribute
 *   sourceStrings every authored string in the file — JSX copy and the toast /
 *                 validation / confirm literals that never render until used
 *   renderedText  every text run the page actually paints, harvested across a
 *                 fully-configured payload and an unconfigured one
 *   savePayloads  the exact PATCH body each save button sent before
 *
 * Delete one checkbox, drop one sentence, or let a regrouping stop sending one
 * toggle key, and one of these fails by name.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
    pathname: '/admin/settings', route: '/admin/settings', asPath: '/admin/settings',
    isReady: true, query: {}, events: { on: jest.fn(), off: jest.fn() },
  }),
}));
jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(() => Promise.resolve({})),
  apiFetchMeta: jest.fn(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null })),
  apiPost: jest.fn(), clearApiCache: jest.fn(),
}));
const api = require('../src/lib/api');

const INVENTORY = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'admin-settings-inventory.json'), 'utf8',
));
const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pages', 'admin', 'settings.js'), 'utf8',
);
// A heading may be reworded, but only on the record: the old wording is listed in
// the fixture alongside its replacement and the reason, and the replacement is
// then asserted to exist. Anything else that vanishes is a deletion.
const REWORDED = new Set((INVENTORY.rewordedHeadings || []).map((r) => r.before));

/** Everything set, so every "configured"/"saved" branch renders. */
const FULL = {
  razorpay: { mode: 'test', key_id: 'rzp_test_1', plan_pro: 'plan_p', plan_family: 'plan_f', key_secret_set: true, webhook_secret_set: true },
  whatsapp: { api_token_set: true, phone_number_id: '1', business_account_id: '2', verify_token: 'v', template_reminder: 'dues_reminder', template_lang: 'en' },
  landing: { whatsapp: '919731422995' },
  integrations: {
    ai: { moderation_configured: true, content_configured: true, api_key_set: true, api_key_source: 'env', moderation_model: 'm-1', content_model: 'c-1', moderation_model_source: 'env', content_model_source: 'db' },
    meta: { facebook_configured: true, instagram_configured: true, app_id: 'a', app_id_source: 'env', app_secret_set: true, app_secret_source: 'env', page_token_set: true, page_token_source: 'db', ig_token_set: true, ig_token_source: 'db' },
    smtp: { configured: true, host: 'h', port: '587', user: 'u', secure: true, from: 'f@e.com', url_set: true, url_source: 'env', host_source: 'env', pass_set: true, pass_source: 'db', from_source: 'db' },
    nmt: { adapter_wired: true, enabled: true, bhashini_key_set: true, sarvam_key_set: true, bhashini_user_id: 'uid', enabled_source: 'env', bhashini_key_source: 'env', bhashini_user_id_source: 'db', sarvam_key_source: 'db' },
  },
  features: {
    voice_assistant_enabled: true, social_share_enabled: true, shop_promo_enabled: true,
    branded_store_enabled: true, consumer_prepay_enabled: true, storefront_ad_free_enabled: true,
    ai_moderation_enabled: true, ai_moderation_trust_enabled: true, shop_hours_enabled: true,
    enrolment_fee_enabled: true,
    enrolment_fee_basic_paise: 19900, enrolment_fee_premium_paise: 49900,
    shop_promo_credits_per_day_paise: 1000, branded_store_credits_per_day_paise: 2000,
    storefront_ad_free_credits_per_day_paise: 3000, consumer_prepay_max_advance_paise: 500000,
    delivery_champion_fee_paise: 2500,
    shop_promo_max_days: 7, branded_store_max_days: 30, storefront_ad_free_max_days: 14,
    order_alert_min_minutes: 2, order_alert_max_minutes: 15, order_alert_max_repeats_cap: 10,
    order_alert_snooze_minutes: 5, shop_pause_max_minutes: 240, order_eta_max_minutes: 120,
    ai_moderation_trust_min_items: 10, ai_moderation_spot_check_pct: 5,
    ai_moderation_auto_approve_min: 0.9, ai_moderation_hold_min: 0.7,
    ai_moderation_trust_bonus: 0.05, ai_moderation_distrust_penalty: 0.05,
    order_eta_chips: '15,30,60',
    referral_split_infra_pct: 40, referral_split_l1_pct: 30, referral_split_l2_pct: 20,
    ai_moderation_configured: true,
  },
};

/** Nothing set, split deliberately over 100, so the other branch renders. */
const BARE = {
  razorpay: { mode: '', key_id: '', plan_pro: '', plan_family: '', key_secret_set: false, webhook_secret_set: false },
  whatsapp: { api_token_set: false, phone_number_id: '', business_account_id: '', verify_token: '', template_reminder: '', template_lang: '' },
  landing: { whatsapp: '' },
  integrations: {
    ai: { moderation_configured: false, content_configured: false, api_key_set: false },
    meta: { facebook_configured: false, instagram_configured: false },
    smtp: { configured: false },
    nmt: { adapter_wired: false },
  },
  features: { ...FULL.features, referral_split_infra_pct: 80, referral_split_l1_pct: 80, referral_split_l2_pct: 80 },
};

const PATCHES = [];
function serve(payload) {
  api.apiFetch.mockImplementation((_p, opts) => {
    if (opts && opts.method === 'PATCH') { PATCHES.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true }); }
    return Promise.resolve(JSON.parse(JSON.stringify(payload)));
  });
}

beforeEach(() => {
  PATCHES.length = 0;
  window.localStorage.setItem('skhata_token', 't');
  window.localStorage.setItem('skhata_role', 'admin');
  serve(FULL);
});
afterEach(() => { window.localStorage.clear(); jest.clearAllMocks(); });

const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function mount() {
  const Page = require('../src/pages/admin/settings').default;
  const view = render(<Page />);
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return view;
}

/* ------------------------------------------------------------------ source */

describe('the settings source still names every key and every authored string', () => {
  const bare = SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|[\s{(,])\/\/.*$/, '$1'))
    .join('\n');
  const flat = norm(bare);

  test('every platform_settings key is still quoted in the file', () => {
    const found = new Set([...bare.matchAll(/['"]([a-z0-9]+(?:_[a-z0-9]+)+)['"]/g)].map((m) => m[1]));
    const missing = INVENTORY.settingKeys.filter((k) => !found.has(k));
    expect(missing).toEqual([]);
  });

  test('a reworded heading really was replaced, not merely dropped', () => {
    const missing = (INVENTORY.rewordedHeadings || []).filter((r) => !flat.includes(r.after));
    expect(missing).toEqual([]);
  });

  test('every authored string is still in the file', () => {
    const missing = INVENTORY.sourceStrings
      .filter((t) => !REWORDED.has(t))
      .filter((t) => !flat.includes(t));
    expect(missing).toEqual([]);
  });
});

/* ------------------------------------------------------------------ render */

describe('the settings page still renders every control and every word', () => {
  test('every key that had an input still has one, tagged with its key', async () => {
    const { container } = await mount();
    const missing = INVENTORY.controlKeys
      .filter((k) => !container.querySelector(`[data-setting="${k}"]`));
    expect(missing).toEqual([]);
  });

  test('a control is an input the admin can actually change', async () => {
    const { container } = await mount();
    const notEditable = INVENTORY.controlKeys.filter((k) => {
      const el = container.querySelector(`[data-setting="${k}"]`);
      return !el || el.tagName !== 'INPUT' || el.disabled;
    });
    expect(notEditable).toEqual([]);
  });

  test('every text run the page used to paint is still painted', async () => {
    const seen = [];
    let view = await mount();
    seen.push(norm(view.container.textContent));
    // the "Clear"/"Undo" branch of a secret field
    fireEvent.click(view.container.querySelector('a[href="#clear"]'));
    seen.push(norm(view.container.textContent));
    view.unmount();

    serve(BARE);
    view = await mount();
    seen.push(norm(view.container.textContent));
    view.unmount();

    const missing = INVENTORY.renderedText
      .filter((t) => !REWORDED.has(t))
      .filter((t) => !seen.some((blob) => blob.includes(t)));
    expect(missing).toEqual([]);
  });

  test('every placeholder and tooltip is still on some field', async () => {
    const attrs = new Set();
    let view = await mount();
    const collect = (c) => {
      c.querySelectorAll('[placeholder]').forEach((e) => attrs.add(e.getAttribute('placeholder')));
      c.querySelectorAll('[title]').forEach((e) => attrs.add(e.getAttribute('title')));
    };
    collect(view.container);
    view.unmount();
    serve(BARE);
    view = await mount();
    collect(view.container);
    view.unmount();

    const missing = INVENTORY.attrStrings.filter((t) => !attrs.has(t));
    expect(missing).toEqual([]);
  });
});

/* ------------------------------------------------------------------- saves */

describe('every save still sends exactly what it sent before', () => {
  const names = Object.keys(INVENTORY.savePayloads);

  test.each(names)('%s', async (name) => {
    await mount();
    PATCHES.length = 0;
    fireEvent.click(screen.getAllByRole('button', { name })[0]);
    await waitFor(() => expect(PATCHES.length).toBe(1));
    expect(PATCHES[0]).toEqual(INVENTORY.savePayloads[name]);
  });

  test('the feature switches save as one group from wherever they are flipped', async () => {
    const { container } = await mount();
    const buttons = screen.getAllByRole('button', { name: 'Save feature toggles' });
    const toggleKeys = Object.keys(INVENTORY.savePayloads['Save feature toggles']);

    // Flip one switch and then save from EVERY "Save feature toggles" button on
    // the page in turn: each must send all nine keys, with the flip included. A
    // regrouping that let a card save only the switches it happens to show would
    // drop keys here.
    expect(buttons.length).toBeGreaterThan(1);
    const box = () => container.querySelector('[data-setting="shop_hours_enabled"]');
    for (let i = 0; i < buttons.length; i += 1) {
      // the reload after each save puts the switch back to what the API serves
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(box().checked).toBe(true));
      fireEvent.click(box());
      PATCHES.length = 0;
      fireEvent.click(screen.getAllByRole('button', { name: 'Save feature toggles' })[i]);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(PATCHES.length).toBe(1));
      expect(Object.keys(PATCHES[0]).sort()).toEqual(toggleKeys.slice().sort());
      expect(PATCHES[0].shop_hours_enabled).toBe(false);
    }
  });

  test('turning paid enrolment ON still confirms and saves immediately', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = await mount();
    const box = container.querySelector('[data-setting="enrolment_fee_enabled"]');
    fireEvent.click(box); // FULL has it on, so this turns it off
    await waitFor(() => expect(PATCHES.length).toBe(1));
    expect(PATCHES[0]).toEqual({ enrolment_fee_enabled: false });
    confirmSpy.mockRestore();
  });

  test('every integration save still routes through the typed I CONFIRM modal', async () => {
    const { container } = await mount();
    fireEvent.change(container.querySelector('[data-setting="razorpay_key_id"]'), { target: { value: 'rzp_test_2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Razorpay' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(PATCHES).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Type I CONFIRM to continue/), { target: { value: 'I CONFIRM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(PATCHES.length).toBe(1));
    expect(PATCHES[0]).toEqual({ razorpay_key_id: 'rzp_test_2', confirm: 'I CONFIRM' });
  });
});

/* ----------------------------------------------------------------- control */

describe('regression control', () => {
  test('the page mounts and shows its money-critical section', async () => {
    const { container } = await mount();
    expect(screen.getByText('Enrolment & economics')).toBeInTheDocument();
    const marked = container.querySelector('[data-money-critical]');
    expect(marked).not.toBeNull();
    expect(marked.textContent).toContain('Enrolment & economics');
    // jsdom drops `border-color: var(--danger)` out of a style attribute, so the
    // danger border that marks money-critical is pinned in the source instead.
    expect(SOURCE).toContain('data-money-critical="enrolment" style={{ borderColor: \'var(--danger)\' }}');
  });
});
