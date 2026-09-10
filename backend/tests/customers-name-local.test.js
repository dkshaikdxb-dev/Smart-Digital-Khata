// Customer (person) names are localized into the owner's active UI language by
// the SAME deterministic proper-noun engine used for shop names (curated
// surnames + best-effort transliteration + raw English fallback). The list, get
// and ledger endpoints add a `name_local` field ONLY when ?lang is a render
// language; the stored raw `name` is never changed (edit/search/ordering keep
// using it). Requires a real Postgres (DATABASE_URL) with migrations applied.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

let token; let shopId; let customerId;

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

async function register(label) {
  const uniq = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`;
  const res = await request(app).post('/api/auth/register').send({
    name: `${label} Owner`,
    email: `${label.toLowerCase()}_${uniq}@test.local`,
    phone: `+9198${uniq}`.slice(0, 15),
    password: 'password123',
    shopName: `${label} Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shopId: res.body.shop.id };
}

beforeAll(async () => {
  ({ token, shopId } = await register('Loc'));
  // 'Ramesh Kumar': Kumar is a curated surname (कुमार), Ramesh transliterates
  // (रमेश) -> the expected hi rendering is 'रमेश कुमार'.
  const res = await auth(request(app).post('/api/customers')).send({
    name: 'Ramesh Kumar',
    phone: `+9190${Date.now().toString().slice(-8)}`,
  });
  expect(res.status).toBe(201);
  customerId = res.body.customer.id;
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.end();
});

describe('customer name localization (name_local)', () => {
  it('list ?lang=hi adds name_local rendered by the shop-name engine, raw name intact', async () => {
    const res = await auth(request(app).get('/api/customers?lang=hi'));
    expect(res.status).toBe(200);
    const c = res.body.items.find((it) => it.id === customerId);
    expect(c).toBeTruthy();
    expect(c.name).toBe('Ramesh Kumar');
    expect(c.name_local).toBe('रमेश कुमार');
  });

  it('list with no lang omits name_local (raw name only)', async () => {
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);
    const c = res.body.items.find((it) => it.id === customerId);
    expect(c).toBeTruthy();
    expect(c.name).toBe('Ramesh Kumar');
    expect(c.name_local).toBeUndefined();
  });

  it('list ?lang=en omits name_local (English is the base, no rendering)', async () => {
    const res = await auth(request(app).get('/api/customers?lang=en'));
    expect(res.status).toBe(200);
    const c = res.body.items.find((it) => it.id === customerId);
    expect(c).toBeTruthy();
    expect(c.name_local).toBeUndefined();
  });

  it('get ?lang=hi adds name_local; no lang omits it', async () => {
    const withLang = await auth(request(app).get(`/api/customers/${customerId}?lang=hi`));
    expect(withLang.status).toBe(200);
    expect(withLang.body.customer.name).toBe('Ramesh Kumar');
    expect(withLang.body.customer.name_local).toBe('रमेश कुमार');

    const noLang = await auth(request(app).get(`/api/customers/${customerId}`));
    expect(noLang.status).toBe(200);
    expect(noLang.body.customer.name_local).toBeUndefined();
  });

  it('ledger ?lang=hi adds name_local (the owner detail page display path)', async () => {
    const res = await auth(request(app).get(`/api/customers/${customerId}/ledger?lang=hi`));
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('Ramesh Kumar');
    expect(res.body.customer.name_local).toBe('रमेश कुमार');
  });
});
