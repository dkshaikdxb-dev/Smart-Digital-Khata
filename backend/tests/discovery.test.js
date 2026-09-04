// Integration tests for Shop Discovery (M6). Requires a real Postgres
// (DATABASE_URL) with the migrations applied. Public directory of opted-in
// shops: browse/search, product counts, and nearest-first distance sorting.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9199${uniq}`,
    password: 'password123',
    shopName: `${prefix} Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

// A city unique to this run so filters isolate our seeded shops from any other
// listed shops that might exist in the shared test DB.
let CITY;
let listedA; let tokenA;
let listedB; let tokenB;
let unlisted; let tokenU;

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  CITY = `Discville${uniq}`;

  const a = await register('DiscA', uniq);
  const b = await register('DiscB', `${uniq}1`.slice(-9));
  const u = await register('DiscU', `${uniq}2`.slice(-9));
  listedA = a.shop; tokenA = a.token;
  listedB = b.shop; tokenB = b.token;
  unlisted = u.shop; tokenU = u.token;

  // Coords: A ~ Mumbai, B ~ Delhi (far). The unlisted shop opts out.
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Andheri', latitude = 19.08, longitude = 72.88, is_listed = true WHERE id = $2`,
    [CITY, listedA.id]
  );
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Connaught Place', latitude = 28.6139, longitude = 77.2090, is_listed = true WHERE id = $2`,
    [CITY, listedB.id]
  );
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Hidden', is_listed = false WHERE id = $2`,
    [CITY, unlisted.id]
  );

  // Shop A: 2 active + 1 inactive product → product_count must be 2.
  for (const name of ['Atta', 'Rice']) {
    await withToken(request(app).post('/api/products'), tokenA).send({ name, price: 5000, unit: 'kg' });
  }
  const inactive = await withToken(request(app).post('/api/products'), tokenA)
    .send({ name: 'Discontinued', price: 9000, unit: 'kg' });
  await withToken(request(app).patch(`/api/products/${inactive.body.product.id}`), tokenA)
    .send({ is_active: false });
}, 30000);

afterAll(async () => {
  for (const s of [listedA, listedB, unlisted]) {
    if (s) await pool.query('DELETE FROM shops WHERE id = $1', [s.id]);
  }
  await pool.end();
});

describe('owner discovery settings (PATCH /shops/me)', () => {
  it('persists city/area/lat/lng/is_listed and returns them from GET /shops/me', async () => {
    const patch = await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: 'Testnagar', area: 'Sector 5', latitude: 12.34, longitude: 56.78, is_listed: true,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.shop.city).toBe('Testnagar');
    expect(patch.body.shop.area).toBe('Sector 5');
    expect(patch.body.shop.latitude).toBe(12.34);
    expect(patch.body.shop.longitude).toBe(56.78);
    expect(patch.body.shop.is_listed).toBe(true);

    const me = await withToken(request(app).get('/api/shops/me'), tokenU);
    expect(me.status).toBe(200);
    expect(me.body.shop.city).toBe('Testnagar');
    expect(me.body.shop.area).toBe('Sector 5');
    expect(me.body.shop.latitude).toBe(12.34);
    expect(me.body.shop.longitude).toBe(56.78);
    expect(me.body.shop.is_listed).toBe(true);

    // Restore the unlisted state used by the rest of this suite.
    await pool.query(
      `UPDATE shops SET city = $1, latitude = NULL, longitude = NULL, is_listed = false WHERE id = $2`,
      [CITY, unlisted.id]
    );
  });

  it('rejects out-of-range coordinates', async () => {
    const bad = await withToken(request(app).patch('/api/shops/me'), tokenU)
      .send({ latitude: 999 });
    expect(bad.status).toBe(400);
  });

  // The owner Settings page sends null for blank location fields to clear them
  // and opt out of the geo directory — the schema must accept null, not 400.
  it('accepts null to clear location + opt out of discovery', async () => {
    await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: 'Tempcity', area: 'Tempsector', latitude: 10.1, longitude: 20.2, is_listed: true,
    });
    const patch = await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: null, area: null, latitude: null, longitude: null, is_listed: false,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.shop.city).toBeNull();
    expect(patch.body.shop.latitude).toBeNull();
    expect(patch.body.shop.longitude).toBeNull();
    expect(patch.body.shop.is_listed).toBe(false);

    // Restore the unlisted-with-CITY state the rest of this suite relies on.
    await pool.query(
      `UPDATE shops SET city = $1, latitude = NULL, longitude = NULL, is_listed = false WHERE id = $2`,
      [CITY, unlisted.id]
    );
  });
});

describe('GET /public/shops', () => {
  it('lists only is_listed shops with correct active product_count', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedA.id);
    expect(ids).toContain(listedB.id);
    expect(ids).not.toContain(unlisted.id);

    const a = res.body.shops.find((s) => s.id === listedA.id);
    expect(a.product_count).toBe(2);
    // Minimal, non-sensitive fields only; no distance without lat/lng.
    expect(Object.keys(a).sort()).toEqual(['area', 'city', 'id', 'name', 'product_count']);
  });

  it('filters by search (name ILIKE)', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&search=DiscA`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedA.id);
    expect(ids).not.toContain(listedB.id);
  });

  it('filters by city', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}xyz`);
    expect(res.status).toBe(200);
    expect(res.body.shops).toHaveLength(0);
  });

  it('returns shops nearest-first with a plausible distance_km when lat/lng supplied', async () => {
    // Query point near shop A (Mumbai). Shop B (Delhi) is ~1100+ km away.
    const res = await request(app).get(`/api/public/shops?city=${CITY}&lat=19.0760&lng=72.8777`);
    expect(res.status).toBe(200);
    const seeded = res.body.shops.filter((s) => s.id === listedA.id || s.id === listedB.id);
    expect(seeded).toHaveLength(2);
    // Nearest first: A before B.
    expect(seeded[0].id).toBe(listedA.id);
    expect(seeded[1].id).toBe(listedB.id);
    expect(seeded[0].distance_km).toBeLessThan(5);
    expect(seeded[1].distance_km).toBeGreaterThan(1000);
  });

  it('clamps limit', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.shops).toHaveLength(1);
  });
});

describe('GET /public/shops/:shopId', () => {
  it('returns a listed shop profile with active products only', async () => {
    const res = await request(app).get(`/api/public/shops/${listedA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.id).toBe(listedA.id);
    expect(res.body.shop.name).toBe(listedA.name);
    expect(res.body.shop.city).toBe(CITY);
    expect(res.body.shop.area).toBe('Andheri');
    expect(res.body.shop.products).toHaveLength(2);
    const names = res.body.shop.products.map((p) => p.name).sort();
    expect(names).toEqual(['Atta', 'Rice']);
    // Minimal product fields only.
    expect(Object.keys(res.body.shop.products[0]).sort())
      .toEqual(['description', 'id', 'image_url', 'name', 'price', 'unit']);
    // No owner/sensitive fields leaked on the shop.
    expect(Object.keys(res.body.shop).sort()).toEqual(['area', 'city', 'id', 'name', 'products']);
  });

  it('404s for an unlisted shop', async () => {
    const res = await request(app).get(`/api/public/shops/${unlisted.id}`);
    expect(res.status).toBe(404);
  });

  it('404s for an unknown shop', async () => {
    const res = await request(app).get('/api/public/shops/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});
