/**
 * The shop directory's quick-browse chips (/c/shops).
 *
 * These are the same six shelves the product-search screen shows, and they must
 * deep-link to a REAL shelf filter — /c/products?category=<shelf> — not to the
 * keyword search that made "Household" mean the word `soap`. This file renders
 * the actual page and watches where each chip sends the shopper.
 */
import React from 'react';
import { render, act } from '@testing-library/react';

const mockRouter = {
  push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
  pathname: '/c/shops', route: '/c/shops', asPath: '/c/shops',
  isReady: true, query: {}, events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('../src/lib/customerApi', () => ({
  publicFetch: jest.fn(() => Promise.resolve({ shops: [] })),
  customerFetch: jest.fn(() => Promise.resolve({})),
  getCustomerToken: jest.fn(() => null),
  setCustomerToken: jest.fn(),
  clearCustomerToken: jest.fn(),
  swapCustomerToken: jest.fn(),
  CUSTOMER_TOKEN_KEY: 'ckhata_token',
  CUSTOMER_PHONE_KEY: 'ckhata_phone',
}));

const { CATEGORIES } = require('../src/lib/categories');
const DiscoverShops = require('../src/pages/c/shops').default;

async function mount() {
  const utils = render(<DiscoverShops />);
  await act(async () => { await Promise.resolve(); });
  return utils;
}

beforeEach(() => { mockRouter.push.mockClear(); });
afterEach(() => { jest.clearAllMocks(); });

describe('the directory chips', () => {
  it('are the six shelves, in the same order as everywhere else', async () => {
    const { container } = await mount();
    const chips = [...container.querySelectorAll('.cpwa-cats .cpwa-chip')];
    expect(chips).toHaveLength(CATEGORIES.length);
    expect(chips.map((c) => c.querySelector('.cpwa-chip-label').textContent.trim()))
      .toEqual(['Atta & Rice', 'Dal & Pulses', 'Spices', 'Cooking Oils', 'Household', 'Personal Care']);
  });

  it('deep-link to a shelf, never to a keyword', async () => {
    const { container } = await mount();
    const chips = [...container.querySelectorAll('.cpwa-cats .cpwa-chip')];

    for (const chip of chips) {
      mockRouter.push.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { chip.click(); });
      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      const url = mockRouter.push.mock.calls[0][0];
      expect(url).toMatch(/^\/c\/products\?category=/);
      expect(url).not.toContain('q=');
    }

    expect(chips.map(() => null)).toHaveLength(6);
  });

  it('send exactly the shelf key the server owns', async () => {
    const { container } = await mount();
    const chips = [...container.querySelectorAll('.cpwa-cats .cpwa-chip')];
    const sent = [];
    for (const chip of chips) {
      mockRouter.push.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { chip.click(); });
      sent.push(mockRouter.push.mock.calls[0][0].replace('/c/products?category=', ''));
    }
    expect(sent).toEqual(CATEGORIES.map((c) => c.category));
  });

  it('no longer offer the two chips that were measured as lying', async () => {
    const { container } = await mount();
    const labels = container.querySelector('.cpwa-cats').textContent;
    expect(labels).not.toMatch(/Dairy/i);
    expect(labels).not.toMatch(/Snacks/i);
  });

  // Regression control: the directory's own product bar still runs a keyword
  // search, because a typed or spoken word is a word, not a shelf.
  it('still send a typed word to the keyword search', async () => {
    const { container } = await mount();
    const form = container.querySelector('form');
    const input = form.querySelector('input[type="search"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'surf excel');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(mockRouter.push).toHaveBeenCalledWith('/c/products?q=surf%20excel');
  });
});
