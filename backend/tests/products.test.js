// Integration tests for the Shop Catalog feature (M5a). Requires a real Postgres
// (DATABASE_URL) with the migrations applied. See the PR/task notes for the
// one-liner that spins up a throwaway cluster.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

// Two shops so we can prove data isolation.
let tokenA; let shopA;
let tokenB; let shopB;

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9199${uniq}`,
    password: 'password123',
    shopName: `${prefix} Test Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('CatA', uniq);
  const b = await register('CatB', `${uniq}1`.slice(-9));
  tokenA = a.token; shopA = a.shop;
  tokenB = b.token; shopB = b.shop;
});

afterAll(async () => {
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (shopB) await pool.query('DELETE FROM shops WHERE id = $1', [shopB.id]);
  await pool.end();
});

describe('owner catalog CRUD', () => {
  let productId;

  it('creates a product (price in paise)', async () => {
    const res = await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Basmati Rice',
      price: 12000, // ₹120
      unit: 'kg',
      description: 'Premium long-grain',
    });
    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe('Basmati Rice');
    expect(Number(res.body.product.price)).toBe(12000);
    expect(res.body.product.unit).toBe('kg');
    expect(res.body.product.is_active).toBe(true);
    productId = res.body.product.id;
  });

  it('rejects a negative or non-integer price', async () => {
    const neg = await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Bad', price: -5,
    });
    expect(neg.status).toBe(400);

    const frac = await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Bad', price: 10.5,
    });
    expect(frac.status).toBe(400);
  });

  it('lists this shop products, newest first', async () => {
    await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Toor Dal', price: 15000, unit: 'kg',
    });
    const res = await withToken(request(app).get('/api/products'), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    // Newest first.
    expect(res.body.items[0].name).toBe('Toor Dal');
  });

  it('filters by name search', async () => {
    const res = await withToken(request(app).get('/api/products?search=basmati'), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Basmati Rice');
  });

  it('filters to active only with active=true', async () => {
    // Deactivate the rice.
    const patch = await withToken(request(app).patch(`/api/products/${productId}`), tokenA)
      .send({ is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.product.is_active).toBe(false);

    const all = await withToken(request(app).get('/api/products'), tokenA);
    expect(all.body.items.some((p) => p.id === productId)).toBe(true);

    const activeOnly = await withToken(request(app).get('/api/products?active=true'), tokenA);
    expect(activeOnly.body.items.some((p) => p.id === productId)).toBe(false);

    // Re-activate for later assertions.
    await withToken(request(app).patch(`/api/products/${productId}`), tokenA)
      .send({ is_active: true });
  });

  it('gets, updates and deletes a product', async () => {
    const get = await withToken(request(app).get(`/api/products/${productId}`), tokenA);
    expect(get.status).toBe(200);
    expect(get.body.product.id).toBe(productId);

    const patch = await withToken(request(app).patch(`/api/products/${productId}`), tokenA)
      .send({ price: 13000 });
    expect(patch.status).toBe(200);
    expect(Number(patch.body.product.price)).toBe(13000);

    const del = await withToken(request(app).delete(`/api/products/${productId}`), tokenA);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const gone = await withToken(request(app).get(`/api/products/${productId}`), tokenA);
    expect(gone.status).toBe(404);
  });

  it('isolates products across shops (shop B product is 404 to shop A)', async () => {
    const created = await withToken(request(app).post('/api/products'), tokenB).send({
      name: 'Shop B Sugar', price: 5000, unit: 'kg',
    });
    expect(created.status).toBe(201);
    const bProductId = created.body.product.id;

    // Shop A cannot see, update, or delete it.
    expect((await withToken(request(app).get(`/api/products/${bProductId}`), tokenA)).status).toBe(404);
    expect((await withToken(request(app).patch(`/api/products/${bProductId}`), tokenA).send({ name: 'Hax' })).status).toBe(404);
    expect((await withToken(request(app).delete(`/api/products/${bProductId}`), tokenA)).status).toBe(404);

    // It does not appear in shop A's list.
    const listA = await withToken(request(app).get('/api/products'), tokenA);
    expect(listA.body.items.some((p) => p.id === bProductId)).toBe(false);
  });

  it('requires a token', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });
});

describe('public catalog', () => {
  let activeId; let inactiveId;

  beforeAll(async () => {
    const active = await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Public Atta', price: 4500, unit: 'kg',
    });
    activeId = active.body.product.id;
    const inactive = await withToken(request(app).post('/api/products'), tokenA).send({
      name: 'Hidden Ghee', price: 60000, unit: 'kg',
    });
    inactiveId = inactive.body.product.id;
    await withToken(request(app).patch(`/api/products/${inactiveId}`), tokenA)
      .send({ is_active: false });
  });

  it('returns only active products and the shop name (no auth)', async () => {
    const res = await request(app).get(`/api/public/catalog/${shopA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop_name).toBe(shopA.name);
    const ids = res.body.products.map((p) => p.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(inactiveId);
    // Minimal fields only.
    const p = res.body.products.find((x) => x.id === activeId);
    expect(Object.keys(p).sort()).toEqual(['description', 'id', 'image_url', 'name', 'price', 'unit']);
  });

  it('does not expose another shop products', async () => {
    const res = await request(app).get(`/api/public/catalog/${shopB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.products.some((p) => p.id === activeId)).toBe(false);
  });

  it('404s for an unknown shop', async () => {
    const res = await request(app).get('/api/public/catalog/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
