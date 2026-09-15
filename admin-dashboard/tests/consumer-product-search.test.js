/**
 * The consumer product-search screen (/c/products), brought to parity with the
 * native app's rebuilt screen.
 *
 * WHAT THIS SCREEN IS FOR. Shoppers on cheap Androids in small-town India,
 * often on 2G, in ten languages, many of whom find typing the hardest thing the
 * app can ask of them. So the order of what they see is the design:
 *
 *   1. the search box, with a FULL-WIDTH voice control directly beneath it
 *      (not a small mic beside the box) that names the language it will
 *      listen in;
 *   2. recent searches — their own last few words, on this device only;
 *   3. shop by category — always there, the universal fallback;
 *   4. buy it again — their own past items, most frequent first.
 *
 * THE GOVERNING RULE these tests exist to hold: a section with nothing in it
 * renders NOTHING AT ALL. No placeholder, no skeleton, and above all no "you
 * have no past orders", which tells a brand-new shopper off for being new. The
 * brand-new screen — box, microphone, six real shelves — is the state this
 * design has to be good at, and it is the one asserted first below.
 */
import React from 'react';
import {
  render, screen, waitFor, act, within, fireEvent,
} from '@testing-library/react';

const mockRouter = {
  push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
  pathname: '/c/products', route: '/c/products', asPath: '/c/products',
  isReady: true, query: {}, events: { on: jest.fn(), off: jest.fn() },
};
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));

jest.mock('../src/lib/customerApi', () => ({
  publicFetch: jest.fn(() => Promise.resolve({ products: [] })),
  customerFetch: jest.fn(() => Promise.resolve({ items: [] })),
  getCustomerToken: jest.fn(() => null),
  setCustomerToken: jest.fn(),
  clearCustomerToken: jest.fn(),
  swapCustomerToken: jest.fn(),
  CUSTOMER_TOKEN_KEY: 'ckhata_token',
  CUSTOMER_PHONE_KEY: 'ckhata_phone',
}));

// The voice capability gate already exists on the web (useVoiceSearch +
// canUseVoice); this batch is layout and prominence, not capability. jsdom has
// no SpeechRecognition and no language registry, so both are stubbed to the
// "voice works here" answer — and one test flips them back to prove the control
// still disappears entirely when it would not work.
global.__voiceSupported = true;
jest.mock('../src/lib/useVoiceSearch', () => ({
  useVoiceSearch: (onResult) => ({
    sttSupported: global.__voiceSupported,
    listening: false,
    hint: '',
    start: () => onResult('toor dal'),
  }),
}));
jest.mock('../src/lib/i18n', () => {
  const actual = jest.requireActual('../src/lib/i18n');
  return {
    ...actual,
    useLanguageCapability: () => ({ has_asr: true, has_tts: true }),
    canUseVoice: () => global.__voiceSupported,
  };
});

const capi = require('../src/lib/customerApi');
const ProductSearch = require('../src/pages/c/products').default;

const RECENT_KEY = 'ckhata_recent_searches';

function paths() {
  return capi.publicFetch.mock.calls.map((c) => c[0])
    .concat(capi.customerFetch.mock.calls.map((c) => c[0]));
}

// The page shell has its own reads (the location picker), so a test about this
// screen's own request looks at the buy-again calls specifically.
function buyAgainCalls() {
  return capi.customerFetch.mock.calls.filter((c) => String(c[0]).startsWith('/api/my/buy-again'));
}

async function mount() {
  const utils = render(<ProductSearch />);
  // Let the mount effects (recent searches, buy-it-again) settle.
  await act(async () => { await Promise.resolve(); });
  return utils;
}

beforeEach(() => {
  global.__voiceSupported = true;
  mockRouter.query = {};
  mockRouter.push.mockClear();
  window.localStorage.clear();
  capi.publicFetch.mockImplementation(() => Promise.resolve({ products: [] }));
  capi.customerFetch.mockImplementation(() => Promise.resolve({ items: [] }));
  capi.getCustomerToken.mockImplementation(() => null);
});

afterEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

/* ------------------------------------------------------------------------ */
describe('a brand-new shopper', () => {
  it('sees the box, the voice control and the six shelves — and nothing else', async () => {
    const { container } = await mount();

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(container.querySelector('.cpwa-voice-big')).toBeTruthy();
    expect(screen.getByText(/Shop by category/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.cpwa-cats .cpwa-chip')).toHaveLength(6);

    // The personal sections are ABSENT, not empty.
    expect(screen.queryByText(/Recent searches/i)).toBeNull();
    expect(screen.queryByText(/Buy it again/i)).toBeNull();
  });

  it('is never told off for being new', async () => {
    const { container } = await mount();
    const copy = container.textContent;
    expect(copy).not.toMatch(/no past orders/i);
    expect(copy).not.toMatch(/nothing here yet/i);
    expect(copy).not.toMatch(/no recent searches/i);
    // No skeleton or placeholder standing in for an empty personal section.
    expect(container.querySelector('.cpwa-skeleton')).toBeNull();
  });

  it('asks the server for nothing at all before a search', async () => {
    await mount();
    expect(capi.publicFetch).not.toHaveBeenCalled();
    expect(buyAgainCalls()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------ */
describe('the voice control', () => {
  it('is full-width, directly beneath the box, and not a mic beside it', async () => {
    const { container } = await mount();

    const box = screen.getByRole('searchbox');
    const big = container.querySelector('.cpwa-voice-big');
    expect(big).toBeTruthy();
    // Beneath the search unit in document order…
    expect(box.compareDocumentPosition(big) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // …and NOT the small mic inside the input row.
    expect(big.closest('.cpwa-search-voice')).toBeNull();
    expect(container.querySelector('.cpwa-mic')).toBeNull();
  });

  it('names the language it will listen in', async () => {
    await mount();
    expect(screen.getByText(/Listens in English/i)).toBeInTheDocument();
  });

  it('runs a spoken term as a search and remembers it', async () => {
    const { container } = await mount();
    await act(async () => { container.querySelector('.cpwa-voice-big').click(); });

    await waitFor(() => expect(capi.publicFetch).toHaveBeenCalled());
    expect(capi.publicFetch.mock.calls[0][0]).toContain('q=toor+dal');
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY))).toEqual(['toor dal']);
  });

  it('disappears completely when this browser or language cannot do voice', async () => {
    global.__voiceSupported = false;
    const { container } = await mount();
    expect(container.querySelector('.cpwa-voice-big')).toBeNull();
    expect(container.textContent).not.toMatch(/Listens in/i);
    // Still a complete screen without it.
    expect(screen.getByText(/Shop by category/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
describe('recent searches', () => {
  it('records a committed term, on this device only, and has it on the next open', async () => {
    const first = await mount();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'surf excel' } });
    await act(async () => { fireEvent.submit(first.container.querySelector('form')); });

    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY))).toEqual(['surf excel']);
    // Nothing about the shopper's own words is ever sent anywhere.
    expect(paths().some((p) => /recent/i.test(p))).toBe(false);

    // Searching replaced the browse surface with results; the word is waiting
    // the next time they open the screen.
    first.unmount();
    await mount();
    expect(screen.getByText(/Recent searches/i)).toBeInTheDocument();
    expect(document.querySelector('.cpwa-recent .cpwa-chip').textContent.trim()).toBe('surf excel');
  });

  it('does not record a word the shopper is still typing', async () => {
    jest.useFakeTimers();
    try {
      render(<ProductSearch />);
      await act(async () => { await Promise.resolve(); });
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sur' } });
      await act(async () => { jest.advanceTimersByTime(400); });
      await act(async () => { await Promise.resolve(); });
      expect(window.localStorage.getItem(RECENT_KEY)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows what is already on the device, newest first, and re-runs one on tap', async () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['haldi', 'surf excel']));
    await mount();

    const chips = [...document.querySelectorAll('.cpwa-recent .cpwa-chip')].map((b) => b.textContent.trim());
    expect(chips).toEqual(['haldi', 'surf excel']);

    await act(async () => { document.querySelectorAll('.cpwa-recent .cpwa-chip')[1].click(); });
    await waitFor(() => expect(capi.publicFetch).toHaveBeenCalled());
    expect(capi.publicFetch.mock.calls[0][0]).toContain('q=surf+excel');
  });

  it('is clearable, and the section then renders nothing at all', async () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['haldi']));
    const { container } = await mount();

    await act(async () => { container.querySelector('.cpwa-clear-recent').click(); });

    expect(screen.queryByText(/Recent searches/i)).toBeNull();
    expect(container.querySelector('.cpwa-recent')).toBeNull();
    expect(window.localStorage.getItem(RECENT_KEY)).toBeNull();
  });
});

/* ------------------------------------------------------------------------ */
describe('buy it again', () => {
  const ITEMS = [
    { name: 'Toor Dal 1kg', shop_id: 's1', shop_name: 'Sharma Kirana', times: 6 },
    { name: 'Surf Excel 1kg', shop_id: 's2', shop_name: 'Gupta Store', times: 3 },
  ];

  it('is asked for only when the shopper is signed in', async () => {
    await mount(); // signed out
    expect(buyAgainCalls()).toHaveLength(0);

    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation((path) => (
      String(path).startsWith('/api/my/buy-again')
        ? Promise.resolve({ items: ITEMS })
        : Promise.resolve({})
    ));
    await mount();
    await waitFor(() => expect(buyAgainCalls()).toHaveLength(1));
    expect(buyAgainCalls()[0][0]).toBe('/api/my/buy-again?limit=8');
  });

  it('lists the shopper\'s own items in the order the server ranked them', async () => {
    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation(() => Promise.resolve({ items: ITEMS }));
    const { container } = await mount();

    await waitFor(() => expect(screen.getByText(/Buy it again/i)).toBeInTheDocument());
    const rows = [...container.querySelectorAll('.cpwa-again-row .cpwa-again-name')]
      .map((n) => n.textContent.trim());
    expect(rows).toEqual(['Toor Dal 1kg', 'Surf Excel 1kg']);
    expect(within(container.querySelector('.cpwa-again')).getByText(/Sharma Kirana/)).toBeInTheDocument();
  });

  it('shows a name and a shop, and never fetches a price per item', async () => {
    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation(() => Promise.resolve({ items: ITEMS }));
    const { container } = await mount();

    await waitFor(() => expect(screen.getByText(/Buy it again/i)).toBeInTheDocument());
    // One request for the whole section, and no ₹ anywhere in it.
    expect(buyAgainCalls()).toHaveLength(1);
    expect(capi.publicFetch).not.toHaveBeenCalled();
    expect(container.querySelector('.cpwa-again').textContent).not.toContain('₹');
  });

  it('runs the remembered name as a search on tap', async () => {
    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation(() => Promise.resolve({ items: ITEMS }));
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText(/Buy it again/i)).toBeInTheDocument());

    await act(async () => { container.querySelector('.cpwa-again-row').click(); });
    await waitFor(() => expect(capi.publicFetch).toHaveBeenCalled());
    expect(capi.publicFetch.mock.calls[0][0]).toContain('q=Toor+Dal+1kg');
  });

  it('renders nothing when the request fails — never an error on this screen', async () => {
    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation(() => Promise.reject(Object.assign(new Error('Not found'), { status: 404 })));
    const { container } = await mount();

    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Buy it again/i)).toBeNull();
    expect(container.querySelector('.cpwa-error')).toBeNull();
    // The rest of the screen is untouched.
    expect(screen.getByText(/Shop by category/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
describe('the order of the screen', () => {
  it('is search, voice, recent, categories, buy it again', async () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['haldi']));
    capi.getCustomerToken.mockImplementation(() => 'ctok');
    capi.customerFetch.mockImplementation(() => Promise.resolve({
      items: [{ name: 'Toor Dal 1kg', shop_id: 's1', shop_name: 'Sharma Kirana', times: 6 }],
    }));
    const { container } = await mount();
    await waitFor(() => expect(screen.getByText(/Buy it again/i)).toBeInTheDocument());

    const titles = [...container.querySelectorAll('.cpwa-section-title')].map((h) => h.textContent.trim());
    expect(titles).toEqual(['Recent searches', 'Shop by category', 'Buy it again']);

    const box = screen.getByRole('searchbox');
    const voice = container.querySelector('.cpwa-voice-big');
    const first = container.querySelector('.cpwa-section-title');
    expect(box.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(voice.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------ */
describe('shelf chips', () => {
  it('filter by a real shelf, with no keyword at all', async () => {
    const { container } = await mount();
    const household = [...container.querySelectorAll('.cpwa-cats .cpwa-chip')]
      .find((b) => /Household/i.test(b.textContent));

    await act(async () => { household.click(); });
    await waitFor(() => expect(capi.publicFetch).toHaveBeenCalled());

    const url = capi.publicFetch.mock.calls[0][0];
    expect(url).toContain('category=household');
    expect(url).not.toContain('q=');
  });

  it('name the shelf being browsed, since the box stays empty', async () => {
    capi.publicFetch.mockImplementation(() => Promise.resolve({ products: [] }));
    const { container } = await mount();
    const spices = [...container.querySelectorAll('.cpwa-cats .cpwa-chip')]
      .find((b) => /Spices/i.test(b.textContent));

    await act(async () => { spices.click(); });
    await waitFor(() => expect(container.querySelector('.cpwa-shelf-head')).toBeTruthy());
    expect(container.querySelector('.cpwa-shelf-head').textContent).toMatch(/Spices/);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('open a shelf straight from a ?category= deep link', async () => {
    mockRouter.query = { category: 'personal-care' };
    await mount();
    await waitFor(() => expect(capi.publicFetch).toHaveBeenCalled());
    expect(capi.publicFetch.mock.calls[0][0]).toContain('category=personal-care');
  });

  it('refuse a shelf key the server does not own', async () => {
    mockRouter.query = { category: 'not-a-shelf' };
    await mount();
    await act(async () => { await Promise.resolve(); });
    expect(capi.publicFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Shop by category/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
// Regression control: this file changes the screen around the plain keyword
// search, and that search is how every existing link into /c/products works.
// These two pass before this batch and must keep passing after it.
describe('the plain ?q= search is unchanged', () => {
  it('runs the query from the URL on open', async () => {
    mockRouter.query = { q: 'surf' };
    capi.publicFetch.mockImplementation(() => Promise.resolve({
      products: [{
        id: 'p1', name: 'Surf Excel 1kg', price: 21500, unit: 'pc',
        shop: { id: 's1', name: 'Sharma Kirana', city: 'Sitapur' },
      }],
    }));
    await mount();

    await waitFor(() => expect(screen.getByText('Surf Excel 1kg')).toBeInTheDocument());
    expect(capi.publicFetch.mock.calls[0][0]).toBe('/api/public/products/search?q=surf&lang=en&limit=30');
    expect(screen.getByText(/₹215.00/)).toBeInTheDocument();
    expect(screen.getByText(/Sharma Kirana/)).toBeInTheDocument();
  });

  it('debounces typing into one request and reports a failure as a failure', async () => {
    jest.useFakeTimers();
    try {
      capi.publicFetch.mockImplementation(() => Promise.reject(new Error('Network request failed')));
      const { container } = render(<ProductSearch />);
      await act(async () => { await Promise.resolve(); });

      const box = screen.getByRole('searchbox');
      for (const value of ['a', 'at', 'att', 'atta']) {
        fireEvent.change(box, { target: { value } });
      }
      await act(async () => { jest.advanceTimersByTime(400); });
      await act(async () => { await Promise.resolve(); });

      expect(capi.publicFetch).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.cpwa-error')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
