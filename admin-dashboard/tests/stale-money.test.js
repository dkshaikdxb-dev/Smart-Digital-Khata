/**
 * R3 (second half) — money read out of the phone's cache must say so.
 *
 * Offline reads are a feature: a shopkeeper with no signal should still be able
 * to look up who owes what. What is NOT acceptable is a days-old outstanding
 * balance rendered identically to a live one, with no timestamp and no way to
 * ask again.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { translate } from '../src/lib/i18n';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(),
    pathname: '/', route: '/', query: { id: 'c1' }, asPath: '/', isReady: true, events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(),
  apiFetchMeta: jest.fn(),
  apiPost: jest.fn(),
  clearApiCache: jest.fn(),
}));

const api = require('../src/lib/api');
const t = (k, v) => translate('en', k, v);

const ROWS = { items: [{ id: 'c1', name: 'Lakshmi', phone: '9000000001', balance: 12345600, credit_limit: 0 }] };

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'owner');
  jest.clearAllMocks();
});
afterEach(() => window.localStorage.clear());

function stub({ fromCache, cachedAt }) {
  api.apiFetch.mockImplementation(() => Promise.resolve(ROWS));
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: ROWS, fromCache, cachedAt }));
}

test('a balance served from the phone cache is visibly marked as not live', async () => {
  const cachedAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
  stub({ fromCache: true, cachedAt });
  const Page = require('../src/pages/customers').default;
  render(<Page />);

  await waitFor(() => expect(screen.getAllByText('Lakshmi').length).toBeGreaterThan(0));
  expect(screen.getByText(t('stale.title'))).toBeInTheDocument();
  // The age has to be ON SCREEN, not merely known to the code: the whole point
  // is that the shopkeeper can judge whether a three-day-old balance is usable.
  const line = screen.getByText(/last updated/i);
  expect(line).toHaveTextContent(String(new Date(cachedAt).getDate()));
  expect(screen.getByRole('button', { name: t('common.refresh') })).toBeInTheDocument();
});

test('a live load carries no stale notice', async () => {
  stub({ fromCache: false, cachedAt: null });
  const Page = require('../src/pages/customers').default;
  render(<Page />);

  await waitFor(() => expect(screen.getAllByText('Lakshmi').length).toBeGreaterThan(0));
  expect(screen.queryByText(t('stale.title'))).not.toBeInTheDocument();
});

test('one customer’s outstanding balance is marked too, not just the list', async () => {
  const LEDGER = {
    customer: { id: 'c1', name: 'Lakshmi', phone: '9000000001', balance: 12345600, credit_limit: 0 },
    transactions: [],
  };
  api.apiFetch.mockImplementation(() => Promise.resolve(LEDGER));
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({
    data: LEDGER, fromCache: true, cachedAt: Date.now() - 60 * 60 * 1000,
  }));
  const Page = require('../src/pages/customers/[id]').default;
  render(<Page />);

  await waitFor(() => expect(screen.getAllByText('Lakshmi').length).toBeGreaterThan(0));
  expect(screen.getByText(t('stale.title'))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: t('common.refresh') })).toBeInTheDocument();
});

test('tapping refresh asks the network again, bypassing the cache', async () => {
  const { fireEvent } = require('@testing-library/react');
  stub({ fromCache: true, cachedAt: Date.now() - 1000 });
  const Page = require('../src/pages/customers').default;
  render(<Page />);

  await waitFor(() => expect(screen.getByText(t('stale.title'))).toBeInTheDocument());
  api.apiFetchMeta.mockClear();
  fireEvent.click(screen.getByRole('button', { name: t('common.refresh') }));

  await waitFor(() => expect(api.apiFetchMeta).toHaveBeenCalled());
  const opts = api.apiFetchMeta.mock.calls[0][1] || {};
  expect(opts.cache).toBe('reload');
});
