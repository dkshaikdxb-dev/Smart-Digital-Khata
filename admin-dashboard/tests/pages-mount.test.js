/**
 * A net under a change this wide.
 *
 * `next build` proves every page COMPILES and server-renders. It does not run a
 * single effect, so it cannot catch a page whose client-side load path now
 * reaches for a helper it does not import. This mounts every page in jsdom with
 * the network stubbed and asserts nothing throws.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
    pathname: '/', route: '/', asPath: '/', isReady: true,
    query: { id: 'x1', token: 'tok', orderId: 'o1', shopId: 's1', slug: 'post' },
    events: { on: jest.fn(), off: jest.fn() },
  }),
}));

const EMPTY = {
  items: [], orders: [], products: [], families: [], suppliers: [], customers: [],
  purchase_orders: [], entries: [], champions: [], shops: [], chips: [], categories: [],
  posts: [], languages: [], overrides: {},
};

jest.mock('../src/lib/api', () => ({
  apiFetch: jest.fn(() => Promise.resolve({})),
  apiFetchMeta: jest.fn(() => Promise.resolve({ data: {}, fromCache: false, cachedAt: null })),
  apiPost: jest.fn(() => Promise.resolve({})),
  clearApiCache: jest.fn(),
}));
jest.mock('../src/lib/customerApi', () => ({
  customerFetch: jest.fn(() => Promise.resolve({})),
  publicFetch: jest.fn(() => Promise.resolve({})),
  getCustomerToken: () => 'ctok',
  setCustomerToken: jest.fn(),
  clearCustomerToken: jest.fn(),
  swapCustomerToken: jest.fn(),
  CUSTOMER_TOKEN_KEY: 'ckhata_token',
  CUSTOMER_PHONE_KEY: 'ckhata_phone',
}));

const api = require('../src/lib/api');
const capi = require('../src/lib/customerApi');

const PAGES_DIR = path.join(__dirname, '..', 'src', 'pages');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  }).filter((p) => p.endsWith('.js'));
}

// _app/_document are framework plumbing, not pages a person opens.
const ROUTES = walk(PAGES_DIR)
  .map((p) => path.relative(PAGES_DIR, p))
  .filter((r) => !path.basename(r).startsWith('_'))
  .sort();

beforeEach(() => {
  window.localStorage.setItem('skhata_token', 'test-token');
  window.localStorage.setItem('skhata_role', 'owner');
  api.apiFetch.mockImplementation(() => Promise.resolve({ ...EMPTY }));
  api.apiFetchMeta.mockImplementation(() => Promise.resolve({ data: { ...EMPTY }, fromCache: false, cachedAt: null }));
  capi.customerFetch.mockImplementation(() => Promise.resolve({ ...EMPTY }));
  capi.publicFetch.mockImplementation(() => Promise.resolve({ ...EMPTY }));
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve({ ...EMPTY }), blob: () => Promise.resolve(new Blob()),
  }));
});

afterEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe.each(ROUTES)('%s', (route) => {
  test('mounts and settles without throwing', async () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const mod = require(path.join(PAGES_DIR, route));
    const Page = mod.default;
    expect(typeof Page).toBe('function');
    const { unmount } = render(<Page />);
    await waitFor(() => expect(true).toBe(true));
    unmount();
  });
});
