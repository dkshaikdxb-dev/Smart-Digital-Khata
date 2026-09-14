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
import { render, screen, waitFor } from '@testing-library/react';

import { translate } from '../src/lib/i18n';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(),
    query: {}, pathname: '/settings', route: '/settings', asPath: '/settings',
    isReady: true, events: { on: jest.fn(), off: jest.fn() },
  }),
}));

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

function mount() {
  const Settings = require('../src/pages/settings').default;
  return render(<Settings />);
}

test('a failed load is not left as a permanent Loading…', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  await waitFor(() => {
    expect(screen.queryByText(t('common.loading'))).not.toBeInTheDocument();
  });
});

test('a failed load says so, in authored copy', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  await waitFor(() => {
    expect(screen.getByText(t('err.slow'))).toBeInTheDocument();
  });
});

test('a failed load offers a way to try again', async () => {
  api.apiFetch.mockImplementation(() => Promise.reject(timeout()));
  api.apiFetchMeta.mockImplementation(() => Promise.reject(timeout()));
  mount();
  await waitFor(() => {
    expect(screen.getByText(t('common.retry'))).toBeInTheDocument();
  });
});

test('a 200 that carries no shop is an error, not a permanent spinner', async () => {
  // The exact shape that used to throw inside the promise chain: resolved, but
  // with nothing under `shop`.
  api.apiFetch.mockImplementation((path) =>
    /shops\/me$/.test(path) ? Promise.resolve({}) : Promise.resolve({}));
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null }));
  mount();
  await waitFor(() => {
    expect(screen.queryByText(t('common.loading'))).not.toBeInTheDocument();
  });
});

test('a shop that loads normally still renders — regression control', async () => {
  api.apiFetch.mockImplementation((path) => {
    if (/shops\/me$/.test(path)) return Promise.resolve({ shop: { id: 's1', name: 'Test Kirana' } });
    return Promise.resolve({});
  });
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null }));
  mount();
  await waitFor(() => {
    expect(screen.queryByText(t('common.loading'))).not.toBeInTheDocument();
  });
  expect(screen.queryByText(t('err.slow'))).not.toBeInTheDocument();
});
