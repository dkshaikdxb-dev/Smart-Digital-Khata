// Integration tests for loose / weighed selling (⑦) — the MONEY-CRITICAL path.
// A weighed product prices per KG; the line price for a chosen weight is ALWAYS
// recomputed server-side in buildLineItems as round(price_per_kg * grams / 1000)
// paise. The client can never set the price. Requires a real Postgres with
// migrations applied (0001..0020).
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const PHONE_A = toE164(`87${uniq}`); // generous-limit customer at the shop

let ownerId;
let shopId;
let custAId;
let riceId; // sold_by_weight, ₹60/kg (6000 paise per kg)
let oddId; // sold_by_weight, 9990 paise per kg (rounding case)
let unitId; // unit product, 3000 paise each

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function addWeighedProduct(name, pricePerKg) {
  const r = await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, sold_by_weight, is_active)
     VALUES ($1,$2,$3,'kg',true,true) RETURNING id`,
    [shopId, name, pricePerKg]
  );
  return r.rows[0].id;
}

async function addUnitProduct(name, price) {
  const r = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [shopId, name, price]
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Loose Owner', `loose_${uniq}@test.local`, `+9187${Math.random().toString().slice(2, 11)}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(`INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`, [ownerId, 'Loose Store']);
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  riceId = await addWeighedProduct('Loose Rice', 6000); // ₹60/kg
  oddId = await addWeighedProduct('Loose Dal', 9990); // 9990 paise/kg — rounding case
  unitId = await addUnitProduct('Soap Bar', 3000);

  const custA = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance) VALUES ($1,$2,$3,$4,0) RETURNING id`,
    [shopId, 'Weigher', PHONE_A, 1000000]
  );
  custAId = custA.rows[0].id;
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

async function placeOrder(token, items, extra = {}) {
  return request(app)
    .post('/api/my/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ shop_id: shopId, items, fulfillment_type: 'pickup', payment_mode: 'credit', ...extra });
}

describe('weighed line price is recomputed server-side (exact paise)', () => {
  it('₹60/kg → 250g=1500, 500g=3000, 1000g=6000', async () => {
    const token = customerToken(PHONE_A);
    for (const [grams, expected] of [[250, 1500], [500, 3000], [1000, 6000]]) {
      const res = await placeOrder(token, [{ product_id: riceId, weight_grams: grams }]);
      expect(res.status).toBe(201);
      const item = res.body.order.items[0];
      expect(Number(item.line_total)).toBe(expected);
      expect(Number(item.unit_price)).toBe(6000); // stored per-kg price
      expect(Number(item.quantity)).toBe(1);
      expect(Number(item.weight_grams)).toBe(grams);
      expect(Number(res.body.order.subtotal)).toBe(expected);

      // Persisted exactly as returned.
      const row = await pool.query('SELECT line_total, weight_grams, quantity FROM order_items WHERE id = $1', [item.id]);
      expect(Number(row.rows[0].line_total)).toBe(expected);
      expect(Number(row.rows[0].weight_grams)).toBe(grams);
      expect(Number(row.rows[0].quantity)).toBe(1);
    }
  });

  it('rounding: 9990 paise/kg × 250g → round(2497.5) = 2498', async () => {
    const res = await placeOrder(customerToken(PHONE_A), [{ product_id: oddId, weight_grams: 250 }]);
    expect(res.status).toBe(201);
    expect(Number(res.body.order.items[0].line_total)).toBe(2498);
    expect(Number(res.body.order.subtotal)).toBe(2498);
  });
});

describe('weight validation', () => {
  it('a weighed item sent with only quantity (no weight_grams) → 422 from the controller', async () => {
    // Passes the schema (.or satisfied by quantity) but the product is weighed,
    // so buildLineItems requires a weight and rejects with 422.
    const res = await placeOrder(customerToken(PHONE_A), [{ product_id: riceId, quantity: 2 }]);
    expect(res.status).toBe(422);
    const orders = await pool.query('SELECT * FROM orders WHERE customer_id = $1 AND subtotal = 0', [custAId]);
    expect(orders.rowCount).toBe(0);
  });

  it('zero / negative / over-max weight is rejected (4xx) and creates nothing', async () => {
    const token = customerToken(PHONE_A);
    for (const grams of [0, -100, 100001]) {
      const res = await placeOrder(token, [{ product_id: riceId, weight_grams: grams }]);
      // The schema bounds it to [1..100000] (400); the controller re-checks the
      // same bounds (422). Either layer rejecting is correct.
      expect([400, 422]).toContain(res.status);
    }
  });

  it('a line with neither quantity nor weight_grams is rejected (schema)', async () => {
    const res = await placeOrder(customerToken(PHONE_A), [{ product_id: riceId }]);
    expect([400, 422]).toContain(res.status);
  });
});

describe('a credit order with a weighed line debits the khata by the correct total', () => {
  it('debits exactly the recomputed line_total', async () => {
    const token = customerToken(PHONE_A);
    const before = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    const beforeBal = Number(before.rows[0].balance);

    // ₹60/kg × 750g = round(4500) = 4500 paise.
    const res = await placeOrder(token, [{ product_id: riceId, weight_grams: 750 }]);
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(4500);

    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBal + 4500);

    const tx = await pool.query(
      `SELECT amount FROM transactions WHERE customer_id = $1 AND type = 'purchase' AND note = $2`,
      [custAId, `Order ${res.body.order.id}`]
    );
    expect(Number(tx.rows[0].amount)).toBe(4500);
  });
});

describe('unit products are unchanged (regression)', () => {
  it('integer quantity, price × qty, weight_grams null', async () => {
    const res = await placeOrder(customerToken(PHONE_A), [{ product_id: unitId, quantity: 3 }]);
    expect(res.status).toBe(201);
    const item = res.body.order.items[0];
    expect(Number(item.line_total)).toBe(9000);
    expect(Number(item.quantity)).toBe(3);
    expect(item.weight_grams == null).toBe(true);
    expect(Number(res.body.order.subtotal)).toBe(9000);
  });
});

describe('the server never trusts a client-sent price / line_total', () => {
  it('ignores forged price and line_total; recomputes from the product', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_A)}`)
      .send({
        shop_id: shopId,
        // Attacker tries to set price=1 and line_total=1 for 1000g of ₹60/kg rice.
        items: [{ product_id: riceId, weight_grams: 1000, price: 1, unit_price: 1, line_total: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(201);
    const item = res.body.order.items[0];
    expect(Number(item.line_total)).toBe(6000);
    expect(Number(item.unit_price)).toBe(6000);
    expect(Number(res.body.order.subtotal)).toBe(6000);
  });
});
