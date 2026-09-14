/**
 * R1 — a failed load must never look like an empty ledger.
 *
 * Every owner list screen has to be able to say three different things:
 *   loading  — we are still asking
 *   error    — we asked and it did not come back (plus a way to try again)
 *   empty    — we asked, it came back, and there is genuinely nothing
 *
 * Telling a shopkeeper on 2G "No customers yet" because a request timed out is
 * telling them nobody owes them money. That is the defect these tests pin.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { translate } from '../src/lib/i18n';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    query: {},
    pathname: '/',
    route: '/',
    asPath: '/',
    isReady: true,
    events: { on: jest.fn(), off: jest.fn() },
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

// Endpoints a screen fetches for optional chrome (config, category trees). They
// must not decide the list's state, so they always resolve.
const CHROME = [/eta-config/, /catalog\/categories/, /public\/config/];

function stubApi(behaviour) {
  const impl = (path) => {
    if (CHROME.some((re) => re.test(path))) return Promise.resolve({});
    return behaviour(path);
  };
  api.apiFetch.mockImplementation(impl);
  api.apiFetchMeta.mockImplementation((path, opts) =>
    impl(path, opts).then((data) => ({ data, fromCache: false, cachedAt: null })));
}

const never = () => new Promise(() => {});

function timeout() {
  const e = new Error('timeout of 15000ms exceeded');
  e.timeout = true;
  return e;
}

const SCREENS = [
  { name: 'customers', load: () => require('../src/pages/customers').default, emptyKey: 'customers.empty' },
  { name: 'transactions', load: () => require('../src/pages/transactions').default, emptyKey: 'tx.historyEmpty' },
  { name: 'orders', load: () => require('../src/pages/orders').default, emptyKey: 'ord.empty' },
  { name: 'products (catalog)', load: () => require('../src/pages/catalog').default, emptyKey: 'cat.rangeEmpty' },
  { name: 'staff', load: () => require('../src/pages/staff').default, emptyKey: 'staff.empty' },
  { name: 'families', load: () => require('../src/pages/families').default, emptyKey: 'fam.empty' },
  { name: 'delivery', load: () => require('../src/pages/delivery').default, emptyKey: 'dlv.noChampions' },
  { name: 'suppliers', load: () => require('../src/pages/suppliers/index').default, emptyKey: 'sup.empty' },
  { name: 'supplier orders', load: () => require('../src/pages/suppliers/orders').default, emptyKey: 'sup.ordersEmpty' },
  { name: 'supplier ledger', load: () => require('../src/pages/suppliers/ledger').default, emptyKey: 'sup.ledgerEmpty' },
];

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'owner');
  jest.clearAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe.each(SCREENS)('$name', ({ load, emptyKey }) => {
  const emptyCopy = () => t(emptyKey);

  test('while the request is still in flight, the empty state is NOT shown', async () => {
    stubApi(never);
    const Page = load();
    render(<Page />);
    await waitFor(() => expect(api.apiFetch.mock.calls.length + api.apiFetchMeta.mock.calls.length)
      .toBeGreaterThan(0));
    expect(screen.queryByText(emptyCopy())).not.toBeInTheDocument();
    expect(screen.getByText(t('common.loading'))).toBeInTheDocument();
  });

  test('when the request FAILS, the empty state is NOT shown', async () => {
    stubApi(() => Promise.reject(timeout()));
    const Page = load();
    render(<Page />);
    await waitFor(() => expect(screen.getByText(t('err.slow'))).toBeInTheDocument());
    expect(screen.queryByText(emptyCopy())).not.toBeInTheDocument();
  });

  test('a failed load offers a way to try again', async () => {
    stubApi(() => Promise.reject(timeout()));
    const Page = load();
    render(<Page />);
    await waitFor(() => expect(screen.getByText(t('err.slow'))).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: t('common.retry') }).length).toBeGreaterThan(0);
  });

  test('the error copy is authored, not the raw machine string', async () => {
    stubApi(() => Promise.reject(timeout()));
    const Page = load();
    render(<Page />);
    await waitFor(() => expect(screen.getByText(t('err.slow'))).toBeInTheDocument());
    expect(screen.queryByText(/15000ms/)).not.toBeInTheDocument();
  });

  test('a genuinely empty result DOES show the empty state', async () => {
    stubApi(() => Promise.resolve({
      items: [], orders: [], products: [], families: [], suppliers: [],
      purchase_orders: [], entries: [], customers: [], champions: [],
    }));
    const Page = load();
    render(<Page />);
    await waitFor(() => expect(screen.getByText(emptyCopy())).toBeInTheDocument());
    expect(screen.queryByText(t('err.slow'))).not.toBeInTheDocument();
    expect(screen.queryByText(t('common.loading'))).not.toBeInTheDocument();
  });
});

describe('signed out is told apart from a network failure', () => {
  test('a 401 on the customer list says you are signed out, not "no customers"', async () => {
    const e = new Error('jwt expired');
    e.status = 401;
    stubApi(() => Promise.reject(e));
    const Page = require('../src/pages/customers').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByText(t('err.signedOut'))).toBeInTheDocument());
    expect(screen.queryByText(t('customers.empty'))).not.toBeInTheDocument();
  });

  test('a suspended shop says so', async () => {
    const e = new Error('shop_suspended');
    e.status = 403;
    e.body = { error: 'shop_suspended', details: { code: 'shop_suspended' } };
    stubApi(() => Promise.reject(e));
    const Page = require('../src/pages/customers').default;
    render(<Page />);
    await waitFor(() => expect(screen.getByText(t('err.suspended'))).toBeInTheDocument());
    expect(screen.queryByText(t('customers.empty'))).not.toBeInTheDocument();
  });
});
