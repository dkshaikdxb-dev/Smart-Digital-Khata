// Integration tests for the customer cross-shop khata + pay-any-shop feature.
// Requires a real Postgres (DATABASE_URL) with the migrations applied. See the
// task notes for the one-liner that spins up a throwaway cluster.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

// Unique phone/emails per run so repeated local runs don't collide.
const uniq = Date.now().toString().slice(-9);
const PHONE = toE164(`98${uniq}`); // 10-digit -> +9198xxxxxxx
const OTHER_PHONE = toE164(`77${uniq}`);

let shop1Id;
let shop2Id;
let otherShopId;
let owner1Id;
let owner2Id;
let owner3Id;
let cust1Id;
let cust2Id;

// Mint a customer JWT exactly like customer-auth.controller does.
function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

// An owner token — role !== 'customer', so customerAuth must reject it.
function ownerToken(shopId) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

async function seedShopWithCustomer({ ownerEmail, shopName, custName, custPhone, balance }) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${custName} Owner`, ownerEmail, `+9190${uniq}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, shopName]
  );
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [shopId, custName, custPhone, 50000, balance]
  );
  return { ownerId, shopId, customerId: cust.rows[0].id };
}

beforeAll(async () => {
  const s1 = await seedShopWithCustomer({
    ownerEmail: `myowner1_${uniq}@test.local`,
    shopName: 'Ravi Store',
    custName: 'Ravi Kumar',
    custPhone: PHONE,
    balance: 15000, // ₹150 owed
  });
  shop1Id = s1.shopId;
  owner1Id = s1.ownerId;
  cust1Id = s1.customerId;

  const s2 = await seedShopWithCustomer({
    ownerEmail: `myowner2_${uniq}@test.local`,
    shopName: 'Meena Mart',
    custName: 'Ravi K',
    custPhone: PHONE,
    balance: 8000, // ₹80 owed
  });
  shop2Id = s2.shopId;
  owner2Id = s2.ownerId;
  cust2Id = s2.customerId;

  // Unrelated customer/shop with a different phone — must never appear for PHONE.
  const other = await seedShopWithCustomer({
    ownerEmail: `myowner3_${uniq}@test.local`,
    shopName: 'Other Shop',
    custName: 'Someone Else',
    custPhone: OTHER_PHONE,
    balance: 9999,
  });
  otherShopId = other.shopId;
  owner3Id = other.ownerId;

  // A couple of transactions at shop 1 so the ledger has rows. Explicit,
  // distinct created_at so newest-first ordering is deterministic.
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, created_at)
     VALUES ($1,$2,'purchase',10000,'credit','Groceries', NOW() - INTERVAL '2 minutes'),
            ($1,$2,'purchase',5000,'credit','Milk', NOW() - INTERVAL '1 minute')`,
    [shop1Id, cust1Id]
  );
});

afterAll(async () => {
  for (const id of [shop1Id, shop2Id, otherShopId]) {
    if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  }
  for (const id of [owner1Id, owner2Id, owner3Id]) {
    if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('customer /my cross-shop khata', () => {
  const token = () => customerToken(PHONE);

  it('GET /my/khata aggregates every shop for the phone with a correct total', async () => {
    const res = await request(app).get('/api/my/khata').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);

    expect(res.body.shops).toHaveLength(2);
    const byName = Object.fromEntries(res.body.shops.map((s) => [s.shop_name, s]));
    expect(byName['Ravi Store']).toBeTruthy();
    expect(byName['Meena Mart']).toBeTruthy();
    expect(Number(byName['Ravi Store'].balance)).toBe(15000);
    expect(Number(byName['Meena Mart'].balance)).toBe(8000);
    expect(byName['Ravi Store'].shop_id).toBe(shop1Id);
    expect(byName['Ravi Store'].customer_id).toBe(cust1Id);
    expect(Number(byName['Ravi Store'].credit_limit)).toBe(50000);

    // Total across all shops, and the unrelated shop is absent.
    expect(res.body.total_outstanding).toBe(23000);
    expect(byName['Other Shop']).toBeUndefined();
  });

  it('GET /my/khata/:shopId returns that shop ledger (newest first)', async () => {
    const res = await request(app)
      .get(`/api/my/khata/${shop1Id}`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.shop_name).toBe('Ravi Store');
    expect(res.body.customer_id).toBe(cust1Id);
    expect(Number(res.body.balance)).toBe(15000);
    expect(res.body.transactions).toHaveLength(2);
    // Newest first.
    expect(res.body.transactions[0].note).toBe('Milk');
  });

  it('GET /my/khata/:shopId returns 404 where this customer has no record', async () => {
    const res = await request(app)
      .get(`/api/my/khata/${otherShopId}`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('POST /my/pay rejects an amount over the balance with 422', async () => {
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shop1Id, amount: 20000 }); // > 15000 owed
    expect(res.status).toBe(422);
  });

  it('POST /my/pay returns a clean 400 when the target shop has not connected Razorpay', async () => {
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shop1Id, amount: 5000 }); // <= 15000 owed
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This shop has not connected Razorpay yet.');
  });

  it('POST /my/pay returns 404 for a shop where this customer has no record', async () => {
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: otherShopId, amount: 100 });
    expect(res.status).toBe(404);
  });

  it('rejects an OWNER token (401) — customerAuth requires role customer', async () => {
    const res = await request(app)
      .get('/api/my/khata')
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a request with no token (401)', async () => {
    const res = await request(app).get('/api/my/khata');
    expect(res.status).toBe(401);
  });
});
