// Integration tests for the location foundation (batch LOC1): the consumer
// location API on the global customer_users identity, and the owner shop
// PATCH accepting the new pincode + village geo fields.
//
// Requires a real Postgres (DATABASE_URL) with the migrations applied incl 0044.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const PHONE = toE164(`96${uniq}`);

let customerUserId;
let ownerId;
let shopId;

// Mint a customer JWT whose `sub` is a REAL customer_users id, exactly like
// customer-auth.controller does — the location handlers key on req.customerUser.id.
function customerToken(id, phone) {
  return jwt.sign({ sub: id, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function ownerToken(id, shop) {
  return jwt.sign({ sub: id, role: 'owner', shopId: shop }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

beforeAll(async () => {
  const cu = await pool.query(
    `INSERT INTO customer_users (phone, name) VALUES ($1, $2) RETURNING id`,
    [PHONE, 'Loc Tester']
  );
  customerUserId = cu.rows[0].id;

  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Loc Owner', `locowner_${uniq}@test.local`, `+9195${uniq}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, 'Loc Store']
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  if (customerUserId) await pool.query('DELETE FROM customer_users WHERE id = $1', [customerUserId]);
  await pool.end();
});

describe('consumer /my/location', () => {
  const token = () => customerToken(customerUserId, PHONE);

  it('requires auth (401 with no token)', async () => {
    const res = await request(app).get('/api/my/location');
    expect(res.status).toBe(401);
  });

  it('rejects an OWNER token (401 — customerAuth requires role customer)', async () => {
    const res = await request(app)
      .get('/api/my/location')
      .set('Authorization', `Bearer ${ownerToken(ownerId, shopId)}`);
    expect(res.status).toBe(401);
  });

  it('GET returns nulls before anything is saved', async () => {
    const res = await request(app).get('/api/my/location').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ town: null, village: null, pincode: null });
  });

  it('PUT saves town/village/pincode and GET reads them back (trimmed)', async () => {
    const put = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ town: '  Nagpur  ', village: 'Wadi', pincode: '440023' });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ town: 'Nagpur', village: 'Wadi', pincode: '440023' });

    const get = await request(app).get('/api/my/location').set('Authorization', `Bearer ${token()}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({ town: 'Nagpur', village: 'Wadi', pincode: '440023' });
  });

  it('PUT with an omitted key leaves that field untouched', async () => {
    const put = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ town: 'Pune' });
    expect(put.status).toBe(200);
    // village/pincode from the previous save are preserved.
    expect(put.body).toEqual({ town: 'Pune', village: 'Wadi', pincode: '440023' });
  });

  it('PUT clears town/village with an empty string', async () => {
    const put = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ town: '', village: '' });
    expect(put.status).toBe(200);
    expect(put.body.town).toBeNull();
    expect(put.body.village).toBeNull();
    expect(put.body.pincode).toBe('440023');
  });

  it('PUT rejects a non-numeric pincode (400)', async () => {
    const res = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pincode: '12ab' });
    expect(res.status).toBe(400);
  });

  it('PUT rejects a pincode that is too long (400)', async () => {
    const res = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pincode: '1234567' });
    expect(res.status).toBe(400);
  });

  it('PUT accepts an empty pincode (clearing is allowed)', async () => {
    const res = await request(app)
      .put('/api/my/location')
      .set('Authorization', `Bearer ${token()}`)
      .send({ pincode: '' });
    expect(res.status).toBe(200);
    expect(res.body.pincode).toBeNull();
  });
});

describe('owner PATCH /api/shops/me geo fields', () => {
  it('accepts pincode + village and persists them', async () => {
    const res = await request(app)
      .patch('/api/shops/me')
      .set('Authorization', `Bearer ${ownerToken(ownerId, shopId)}`)
      .send({ city: 'Nagpur', pincode: '440001', village: 'Wadi' });
    expect(res.status).toBe(200);
    expect(res.body.shop.pincode).toBe('440001');
    expect(res.body.shop.village).toBe('Wadi');
    expect(res.body.shop.city).toBe('Nagpur');
  });
});
