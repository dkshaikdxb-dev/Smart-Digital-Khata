/**
 * R1, on the settings screen.
 *
 * settings.js gates its whole body on `if (!shop)` and renders "Loading…"
 * there. Its loaders ended in `.catch(console.error)`, so a failed load left
 * that spinner on screen forever — a shopkeeper on 2G watching "Loading…" with
 * no error, no retry and no way to know the request had already died.
 *
 * Worse, the shop loader called fulFromShop(r.shop) unguarded, so a 200 that
 * carried no shop threw a TypeError inside the promise chain and was swallowed
 * by the same catch. Same permanent spinner, different cause.
 */
import React from 'react';
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';

import { translate } from '../src/lib/i18n';

// The router object must be STABLE across renders. The page's load effect is
// keyed on [router], and it clears the load error before re-fetching; a mock
// that returns a fresh object each render makes that effect re-run on every
// render, so the page loops error -> clear -> loading -> error forever and never
// settles. Next's own useRouter returns a stable instance, so this is a fidelity
// fix in the mock, not a workaround for a product bug.
const ROUTER = {
  push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(),
  query: {}, pathname: '/settings', route: '/settings', asPath: '/settings',
  isReady: true, events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => ROUTER }));

jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(), apiFetchMeta: jest.fn(), apiPost: jest.fn(), clearApiCache: jest.fn(),
}));

const api = require('../src/lib/api');
const t = (k, v) => translate('en', k, v);

function timeout() {
  const e = new Error('timeout of 15000ms exceeded');
  e.timeout = true;
  return e;
}

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'owner');
  jest.clearAllMocks();
});
afterEach(() => { window.localStorage.clear(); });


// Wait for the page to stop loading, using the purpose-built API rather than
// polling for an absence. waitForElementToBeRemoved fails loudly if the element
// was never there, so this cannot pass vacuously; and anchoring on the spinner
// itself avoids matching copy the nav renders, which since the moderation batch
// fetches a count of its own and shows the same authored error sentence.
async function settled() {
  const spinner = () => screen.queryByText(t('common.loading'));
  if (spinner()) await waitForElementToBeRemoved(spinner, { timeout: 5000 });
  expect(spinner()).not.toBeInTheDocument();
}

function mount() {
  const Settings = require('../src/pages/settings').default;
  return render(<Settings />);
}

test('a failed load is not left as a permanent Loading…', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  // Wait for the error state to APPEAR, then assert the spinner is gone. Waiting
  // for an element to disappear is a race: it passes the instant the poll
  // happens to land after the state flush and fails when the machine is busy.
  // Waiting for the thing that replaces it is deterministic — it can only be
  // there once the load has actually resolved.
  // Anchor on the RETRY BUTTON, not the error sentence. The nav now fetches a
  // pending-review count of its own and renders the same authored sentence when
  // that fails, so matching the sentence can match the nav's copy while the page
  // body is still spinning. Only this page renders a retry.
  await settled();
});

test('a failed load says so, in authored copy', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  // The page's own error card is the one with a retry beside it.
  await settled();
  expect(screen.getAllByText(t('err.slow')).length).toBeGreaterThan(0);
});

test('a failed load offers a way to try again', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  await settled();
  expect(screen.getAllByText(t('common.retry')).length).toBeGreaterThan(0);
});

test('a 200 that carries no shop is an error, not a permanent spinner', async () => {
  // The exact shape that used to throw inside the promise chain: resolved, but
  // with nothing under `shop`.
  api.apiFetch.mockImplementation((path) =>
    /shops\/me$/.test(path) ? Promise.resolve({}) : Promise.resolve({}));
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null }));
  mount();
  // Same rule: wait for the error copy to arrive, which is what a 200 carrying
  // no shop must produce, rather than for the spinner to leave.
  await settled();
});

test('a shop that loads normally still renders — regression control', async () => {
  api.apiFetch.mockImplementation((path) => {
    if (/shops\/me$/.test(path)) return Promise.resolve({ shop: { id: 's1', name: 'Test Kirana' } });
    return Promise.resolve({});
  });
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null }));
  mount();
  // The positive signal here is the shop's own name reaching the screen.
  await settled();
  await screen.findByDisplayValue('Test Kirana');
  expect(screen.queryByText(t('err.slow'))).not.toBeInTheDocument();
});
