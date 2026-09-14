/**
 * @jest-environment node
 *
 * R3 — the service worker used to serve money from a cache it never rotated.
 *
 * `CACHE = 'skhata-v2'` was a hand-typed constant: a deploy shipped new code
 * against a cache the browser had been filling for weeks, so a customer's
 * outstanding balance could be days old with nothing on screen saying so.
 *
 * These tests load the real public/sw.js into a sandbox with a stubbed worker
 * global, then interrogate the policy it exposes.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js');

function loadSw(scriptUrl = 'https://shop.example/sw.js?v=BUILD_ONE') {
  const src = fs.readFileSync(SW_PATH, 'utf8');
  const listeners = {};
  const self = {
    location: new URL(scriptUrl),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
    registration: {},
  };
  self.self = self;
  const sandbox = {
    self,
    caches: {
      open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve() }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
      match: () => Promise.resolve(undefined),
    },
    fetch: () => Promise.reject(new Error('no network in this sandbox')),
    URL,
    Request,
    Response,
    Headers,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'sw.js' });
  return { policy: self.skhataSwPolicy, listeners };
}

describe('the cache name is tied to the build', () => {
  test('two builds do not share a cache', () => {
    const a = loadSw('https://shop.example/sw.js?v=BUILD_ONE').policy;
    const b = loadSw('https://shop.example/sw.js?v=BUILD_TWO').policy;
    expect(a.CACHE).not.toBe(b.CACHE);
    expect(a.API_CACHE).not.toBe(b.API_CACHE);
  });

  test('the build id actually appears in the name, so it is traceable', () => {
    const { policy } = loadSw('https://shop.example/sw.js?v=BUILD_ONE');
    expect(policy.CACHE).toContain('BUILD_ONE');
    expect(policy.API_CACHE).toContain('BUILD_ONE');
  });

  test('no hand-typed version constant survives in the source', () => {
    const src = fs.readFileSync(SW_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/['"]skhata-v\d+['"]/);
    expect(src).not.toMatch(/['"]skhata-api-v\d+['"]/);
  });

  test('activate sweeps every cache that does not belong to this build', async () => {
    const src = fs.readFileSync(SW_PATH, 'utf8');
    const self = {
      location: new URL('https://shop.example/sw.js?v=BUILD_TWO'),
      addEventListener: (type, fn) => { self[`on_${type}`] = fn; },
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
    };
    self.self = self;
    const deleted = [];
    const sandbox = {
      self,
      caches: {
        open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve() }),
        keys: () => Promise.resolve(['skhata-shell-BUILD_ONE', 'skhata-api-BUILD_ONE', 'skhata-v2', 'unrelated']),
        delete: (k) => { deleted.push(k); return Promise.resolve(true); },
        match: () => Promise.resolve(undefined),
      },
      fetch: () => Promise.reject(new Error('no network')),
      URL, Request, Response, Headers, console,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'sw.js' });

    let waited;
    self.on_activate({ waitUntil: (p) => { waited = p; } });
    await waited;
    expect(deleted).toEqual(expect.arrayContaining(['skhata-shell-BUILD_ONE', 'skhata-api-BUILD_ONE', 'skhata-v2']));
  });
});

describe('what may be served from cache at all', () => {
  const { policy } = loadSw();
  const p = (s) => new URL(s, 'https://shop.example');

  test('read-mostly views a shopkeeper opens first stay cacheable — offline reads are the point', () => {
    expect(policy.isCacheableApi(p('/api/customers'))).toBe(true);
    expect(policy.isCacheableApi(p('/api/customers?status=active'))).toBe(true);
    expect(policy.isCacheableApi(p('/api/products'))).toBe(true);
    expect(policy.isCacheableApi(p('/api/shops/me'))).toBe(true);
  });

  test.each([
    '/api/payments/orders/abc',
    '/api/payments/orders/abc/status',
    '/api/orders',
    '/api/orders/abc',
    '/api/auth/me',
  ])('%s is never served from cache — a stale payment or order is a wrong answer', (route) => {
    expect(policy.isCacheableApi(p(route))).toBe(false);
  });

  test('a customer sub-resource under a cacheable prefix cannot smuggle a payment through', () => {
    expect(policy.isCacheableApi(p('/api/customers/abc/payments'))).toBe(false);
  });
});

describe('cached money is stamped so the UI can say how old it is', () => {
  const { policy } = loadSw();

  test('a response gets a cached-at stamp on the way INTO the cache', async () => {
    const stamped = await policy.stampCachedAt(new Response('{}', { headers: { 'Content-Type': 'application/json' } }), 1700000000000);
    expect(stamped.headers.get('X-SKhata-Cached-At')).toBe('1700000000000');
  });

  test('a response served OUT of the cache is flagged as not live', async () => {
    const stamped = await policy.stampCachedAt(new Response('{}'), 1700000000000);
    const served = await policy.markFromCache(stamped);
    expect(served.headers.get('X-SKhata-From-Cache')).toBe('1');
    expect(served.headers.get('X-SKhata-Cached-At')).toBe('1700000000000');
  });

  test('the stamp does not destroy the body', async () => {
    const served = await policy.markFromCache(new Response('{"items":[]}'));
    await expect(served.json()).resolves.toEqual({ items: [] });
  });
});

describe('an explicit refresh bypasses the cache', () => {
  const { policy } = loadSw();

  test('a reload-cache request is network-first', () => {
    expect(policy.wantsFresh({ cache: 'reload' })).toBe(true);
    expect(policy.wantsFresh({ cache: 'no-store' })).toBe(true);
    expect(policy.wantsFresh({ cache: 'default' })).toBe(false);
  });
});
