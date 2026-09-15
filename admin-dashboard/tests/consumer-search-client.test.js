/**
 * How the consumer search client behaves when the server says no.
 *
 * DEPLOY ORDER is the whole reason this file exists. The backend ships before
 * the PWA does, but the reverse is what actually hurts: a browser holding a
 * cached bundle that already knows about shelves, talking to a server that does
 * not. Such a server drops the unknown `category` param and then refuses the
 * request for want of the `q` it still requires. So a shelf request REFUSED
 * (400/404/422) is retried exactly once with the keyword that chip used before
 * shelves existed — the shopper sees the old, narrower results rather than an
 * error, and nothing has to be sequenced.
 *
 * A TIMEOUT OR A DEAD RADIO IS NOT A REFUSAL and must never be retried: on 2G
 * that doubles the wait and then reports the same failure anyway. It surfaces as
 * itself so the screen can show its retry card.
 *
 * Buy-it-again degrades differently and more bluntly: every failure resolves to
 * an EMPTY list, because the section it feeds renders nothing at all when empty.
 * An older server therefore produces a screen with one section missing — which
 * is exactly the screen a brand-new shopper gets — and never a broken one.
 */
import { searchProducts, buyAgain, BUY_AGAIN_MAX } from '../src/lib/consumerSearch';

jest.mock('../src/lib/customerApi', () => ({
  publicFetch: jest.fn(),
  customerFetch: jest.fn(),
  getCustomerToken: jest.fn(() => 'ctok'),
}));

const capi = require('../src/lib/customerApi');

const refusal = (status) => Object.assign(new Error('Bad Request'), { status, body: {} });
const dead = () => new TypeError('Failed to fetch'); // offline / timeout: no status

beforeEach(() => {
  capi.publicFetch.mockReset();
  capi.customerFetch.mockReset();
  capi.getCustomerToken.mockReset().mockReturnValue('ctok');
});

describe('a shelf request', () => {
  it('sends the shelf key and no keyword', async () => {
    capi.publicFetch.mockResolvedValue({ products: [] });
    await searchProducts({ category: 'household', fallbackTerm: 'soap', lang: 'hi', limit: 30 });

    expect(capi.publicFetch).toHaveBeenCalledTimes(1);
    const url = capi.publicFetch.mock.calls[0][0];
    expect(url).toBe('/api/public/products/search?category=household&lang=hi&limit=30');
    expect(url).not.toContain('q=');
  });

  it.each([400, 404, 422])('retries ONCE with the old keyword when refused with %i', async (status) => {
    capi.publicFetch
      .mockRejectedValueOnce(refusal(status))
      .mockResolvedValueOnce({ products: [{ id: 'p1' }] });

    const r = await searchProducts({ category: 'household', fallbackTerm: 'soap', lang: 'en', limit: 30 });

    expect(r.products).toHaveLength(1);
    expect(capi.publicFetch).toHaveBeenCalledTimes(2);
    expect(capi.publicFetch.mock.calls[1][0]).toBe('/api/public/products/search?q=soap&lang=en&limit=30');
    expect(capi.publicFetch.mock.calls[1][0]).not.toContain('category=');
  });

  it('retries only once — a second refusal is the shopper\'s error', async () => {
    capi.publicFetch.mockRejectedValue(refusal(400));
    await expect(searchProducts({ category: 'household', fallbackTerm: 'soap' })).rejects.toThrow();
    expect(capi.publicFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a timeout or a dead radio — that would double the wait on 2G', async () => {
    capi.publicFetch.mockRejectedValue(dead());
    await expect(searchProducts({ category: 'household', fallbackTerm: 'soap' })).rejects.toThrow(/Failed to fetch/);
    expect(capi.publicFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 500 either: the server is broken, not old', async () => {
    capi.publicFetch.mockRejectedValue(refusal(500));
    await expect(searchProducts({ category: 'household', fallbackTerm: 'soap' })).rejects.toThrow();
    expect(capi.publicFetch).toHaveBeenCalledTimes(1);
  });

  it('has nothing to fall back to when a chip carries no keyword', async () => {
    capi.publicFetch.mockRejectedValue(refusal(400));
    await expect(searchProducts({ category: 'household' })).rejects.toThrow();
    expect(capi.publicFetch).toHaveBeenCalledTimes(1);
  });
});

describe('a plain keyword search', () => {
  it('is unchanged: one request, no retry, failures surface', async () => {
    capi.publicFetch.mockRejectedValue(refusal(400));
    await expect(searchProducts({ q: 'surf', lang: 'en', limit: 30 })).rejects.toThrow();
    expect(capi.publicFetch).toHaveBeenCalledTimes(1);
    expect(capi.publicFetch.mock.calls[0][0]).toBe('/api/public/products/search?q=surf&lang=en&limit=30');
  });

  it('trims the term and passes an abort signal through', async () => {
    capi.publicFetch.mockResolvedValue({ products: [] });
    const controller = new AbortController();
    await searchProducts({ q: '  atta ', lang: 'en', limit: 30, signal: controller.signal });
    expect(capi.publicFetch.mock.calls[0][0]).toBe('/api/public/products/search?q=atta&lang=en&limit=30');
    expect(capi.publicFetch.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});

describe('buy it again', () => {
  it('asks for at most eight, signed in', async () => {
    capi.customerFetch.mockResolvedValue({ items: [{ name: 'Toor Dal 1kg' }] });
    const items = await buyAgain();
    expect(BUY_AGAIN_MAX).toBe(8);
    expect(capi.customerFetch).toHaveBeenCalledWith('/api/my/buy-again?limit=8');
    expect(items).toEqual([{ name: 'Toor Dal 1kg' }]);
  });

  it('never asks at all when signed out', async () => {
    capi.getCustomerToken.mockReturnValue(null);
    expect(await buyAgain()).toEqual([]);
    expect(capi.customerFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['an older server with no such route', refusal(404)],
    ['a refusal', refusal(400)],
    ['an expired session', refusal(401)],
    ['a dead radio', dead()],
    ['a broken server', refusal(500)],
  ])('resolves to an empty list on %s', async (_what, err) => {
    capi.customerFetch.mockRejectedValue(err);
    await expect(buyAgain()).resolves.toEqual([]);
  });

  it('resolves to an empty list on a body that is not the contract', async () => {
    capi.customerFetch.mockResolvedValue({ items: 'nope' });
    expect(await buyAgain()).toEqual([]);
    capi.customerFetch.mockResolvedValue(null);
    expect(await buyAgain()).toEqual([]);
  });
});
