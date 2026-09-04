// Integration tests for Orders / commerce (M5b). Requires a real Postgres
// (DATABASE_URL) with migrations applied. Covers the credit and prepaid order
// flows, credit-limit enforcement (all-or-nothing), owner status transitions,
// customer cancel/khata-reversal, data isolation, and the webhook change that
// settles a PREPAID ORDER without ever touching the khata. No live Razorpay.
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const shopSettings = require('../src/config/shopSettings');

const uniq = Date.now().toString().slice(-9);
const PHONE_A = toE164(`81${uniq}`); // pre-seeded customer at shop1, generous limit
const PHONE_B = toE164(`82${uniq}`); // pre-seeded customer at shop1, tight limit
const PHONE_C = toE164(`83${uniq}`); // never a customer anywhere (isolation)
const PHONE_D = toE164(`84${uniq}`); // no customer at shop1 yet (auto-create)
const WEBHOOK_SECRET = 'ordwhooksecret';

let owner1Id;
let owner2Id;
let shop1Id;
let shop2Id;
let custAId;
let p1Id; // 5000 paise
let p2Id; // 3000 paise
let p3Id; // 9000 paise, shop2
let webhookToken;

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shopId) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function makeShop(email, name) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, email, `+9188${Math.random().toString().slice(2, 11)}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(`INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`, [ownerId, name]);
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  return { ownerId, shopId };
}

async function addProduct(shopId, name, price) {
  const r = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [shopId, name, price]
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  const s1 = await makeShop(`ord1_${uniq}@test.local`, 'Order Store');
  shop1Id = s1.shopId;
  owner1Id = s1.ownerId;
  const s2 = await makeShop(`ord2_${uniq}@test.local`, 'No Pay Store');
  shop2Id = s2.shopId;
  owner2Id = s2.ownerId;

  p1Id = await addProduct(shop1Id, 'Rice 5kg', 5000);
  p2Id = await addProduct(shop1Id, 'Dal 1kg', 3000);
  p3Id = await addProduct(shop2Id, 'Oil 1L', 9000);

  // Pre-seeded customers so we can control credit limits precisely.
  const custA = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance) VALUES ($1,$2,$3,$4,0) RETURNING id`,
    [shop1Id, 'Aarti', PHONE_A, 100000]
  );
  custAId = custA.rows[0].id;
  await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance) VALUES ($1,$2,$3,$4,0)`,
    [shop1Id, 'Bhavna', PHONE_B, 5000]
  );

  // Configure shop1's per-shop Razorpay WEBHOOK secret + token for the
  // reconcile test (no key_id/secret, so isConfiguredForShop stays false).
  webhookToken = crypto.randomBytes(16).toString('hex');
  await shopSettings.setMany(shop1Id, {
    RZP_WEBHOOK_SECRET: WEBHOOK_SECRET,
    RZP_WEBHOOK_TOKEN: webhookToken,
  });
});

afterAll(async () => {
  for (const id of [shop1Id, shop2Id]) if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of [owner1Id, owner2Id]) if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  await pool.end();
});

describe('POST /my/orders — credit', () => {
  it('creates an order + items + a khata purchase and bumps the balance', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_A)}`)
      .send({
        shop_id: shop1Id,
        items: [
          { product_id: p1Id, quantity: 2 }, // 10000
          { product_id: p2Id, quantity: 1 }, // 3000
        ],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(201);
    const order = res.body.order;
    expect(order.payment_mode).toBe('credit');
    expect(order.payment_status).toBe('not_required');
    expect(order.status).toBe('pending');
    expect(Number(order.subtotal)).toBe(13000);
    expect(order.items).toHaveLength(2);

    // Items persisted with snapshots.
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    expect(items.rowCount).toBe(2);
    const rice = items.rows.find((i) => i.name === 'Rice 5kg');
    expect(Number(rice.unit_price)).toBe(5000);
    expect(Number(rice.line_total)).toBe(10000);

    // Khata purchase created + balance bumped by exactly the subtotal.
    const bal = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    expect(Number(bal.rows[0].balance)).toBe(13000);
    const tx = await pool.query(
      `SELECT * FROM transactions WHERE customer_id = $1 AND type = 'purchase' AND note = $2`,
      [custAId, `Order ${order.id}`]
    );
    expect(tx.rowCount).toBe(1);
    expect(Number(tx.rows[0].amount)).toBe(13000);
  });

  it('auto-creates a customers row for a shop the customer has never used', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_D)}`)
      .send({
        shop_id: shop1Id,
        items: [{ product_id: p2Id, quantity: 1 }], // 3000
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(201);
    const created = await pool.query('SELECT * FROM customers WHERE shop_id = $1 AND phone = $2', [shop1Id, PHONE_D]);
    expect(created.rowCount).toBe(1);
    expect(Number(created.rows[0].balance)).toBe(3000);
  });

  it('rejects a credit order that would exceed the credit limit with 422 and creates NOTHING', async () => {
    const before = await pool.query('SELECT id, balance FROM customers WHERE shop_id = $1 AND phone = $2', [shop1Id, PHONE_B]);
    const custBId = before.rows[0].id;
    expect(Number(before.rows[0].balance)).toBe(0);

    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_B)}`)
      .send({
        shop_id: shop1Id,
        items: [{ product_id: p1Id, quantity: 2 }], // 10000 > 5000 limit
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(422);

    // All-or-nothing: no order, no items, no transaction, balance untouched.
    const orders = await pool.query('SELECT * FROM orders WHERE customer_id = $1', [custBId]);
    expect(orders.rowCount).toBe(0);
    const tx = await pool.query('SELECT * FROM transactions WHERE customer_id = $1', [custBId]);
    expect(tx.rowCount).toBe(0);
    const bal = await pool.query('SELECT balance FROM customers WHERE id = $1', [custBId]);
    expect(Number(bal.rows[0].balance)).toBe(0);
  });

  it('rejects a delivery order with no address (422)', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_A)}`)
      .send({
        shop_id: shop1Id,
        items: [{ product_id: p1Id, quantity: 1 }],
        fulfillment_type: 'delivery',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(422);
  });
});

describe('POST /my/orders — prepaid', () => {
  it('returns 400 when the shop has not connected Razorpay', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_A)}`)
      .send({
        shop_id: shop2Id, // no keys configured
        items: [{ product_id: p3Id, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'prepaid',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This shop cannot take online payments yet.');

    // Nothing created.
    const orders = await pool.query('SELECT * FROM orders WHERE shop_id = $1', [shop2Id]);
    expect(orders.rowCount).toBe(0);
  });
});

describe('customer order reads + cancel', () => {
  const token = () => customerToken(PHONE_A);

  it('GET /my/orders lists this customer orders with shop_name + item count', async () => {
    const res = await request(app).get('/api/my/orders').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const first = res.body.items[0];
    expect(first.shop_name).toBe('Order Store');
    expect(first).toHaveProperty('item_count');
  });

  it('cancel of a pending credit order reverses the khata balance', async () => {
    // Fresh credit order to cancel.
    const create = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        shop_id: shop1Id,
        items: [{ product_id: p2Id, quantity: 2 }], // 6000
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(create.status).toBe(201);
    const orderId = create.body.order.id;

    const before = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    const beforeBal = Number(before.rows[0].balance);

    const res = await request(app)
      .post(`/api/my/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');

    // Balance reduced by exactly the subtotal; a compensating entry exists.
    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBal - 6000);
    const rev = await pool.query(
      `SELECT * FROM transactions WHERE customer_id = $1 AND type = 'cash' AND note = $2`,
      [custAId, `Reversal — order ${orderId} cancelled`]
    );
    expect(rev.rowCount).toBe(1);
    expect(Number(rev.rows[0].amount)).toBe(6000);
  });

  it('cancel of an already-cancelled order returns 409', async () => {
    const create = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shop1Id, items: [{ product_id: p2Id, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'credit' });
    const orderId = create.body.order.id;
    await request(app).post(`/api/my/orders/${orderId}/cancel`).set('Authorization', `Bearer ${token()}`);
    const res = await request(app).post(`/api/my/orders/${orderId}/cancel`).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(409);
  });

  it('a different customer cannot see this order (404)', async () => {
    const create = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shop1Id, items: [{ product_id: p1Id, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'credit' });
    const orderId = create.body.order.id;

    const res = await request(app)
      .get(`/api/my/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken(PHONE_C)}`);
    expect(res.status).toBe(404);
  });
});

describe('owner /orders', () => {
  let orderId;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(PHONE_A)}`)
      .send({ shop_id: shop1Id, items: [{ product_id: p1Id, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'credit' });
    orderId = create.body.order.id;
  });

  it('GET /orders lists the shop orders with customer name/phone', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${ownerToken(shop1Id)}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0]).toHaveProperty('customer_name');
    expect(res.body.items[0]).toHaveProperty('customer_phone');
  });

  it('PATCH /orders/:id/status advances the status', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('accepted');
  });

  it('PATCH /orders/:id/status rejects a backward transition (422)', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ status: 'pending' });
    expect(res.status).toBe(422);
  });

  it("PATCH from ANOTHER shop's owner returns 404", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken(shop2Id)}`)
      .send({ status: 'preparing' });
    expect(res.status).toBe(404);
  });

  it('rejects a customer token on owner routes (403)', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken(PHONE_A)}`);
    expect(res.status).toBe(403);
  });
});

describe('webhook: prepaid-order settlement never touches the khata', () => {
  it('marks the ORDER paid + accepted and leaves the balance and ledger unchanged', async () => {
    // Seed a prepaid order + a linked payment_orders row directly.
    const ord = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal)
       VALUES ($1,$2,'pending','pickup','prepaid','pending',20000) RETURNING id`,
      [shop1Id, custAId]
    );
    const orderId = ord.rows[0].id;
    const providerOrderId = `order_ord_${uniq}`;
    await pool.query(
      `INSERT INTO payment_orders
         (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes, order_id)
       VALUES ($1,$2,$3,20000,'INR','created','razorpay',$4,NULL,$5)`,
      [`optest_${uniq}`, shop1Id, custAId, providerOrderId, orderId]
    );

    const before = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    const beforeBal = Number(before.rows[0].balance);
    const beforeTx = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transactions WHERE customer_id = $1 AND source = 'razorpay'`,
      [custAId]
    );

    const event = {
      event: 'payment.captured',
      id: `evt_ord_${uniq}`,
      payload: { payment: { entity: { id: `pay_ord_${uniq}`, order_id: providerOrderId, amount: 20000 } } },
    };
    const rawStr = JSON.stringify(event);
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(rawStr)).digest('hex');

    const res = await request(app)
      .post(`/api/webhooks/razorpay/shop/${webhookToken}`)
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(rawStr);
    expect(res.status).toBe(200);

    // Order settled: payment_status paid, status advanced pending -> accepted.
    const order = await pool.query('SELECT payment_status, status FROM orders WHERE id = $1', [orderId]);
    expect(order.rows[0].payment_status).toBe('paid');
    expect(order.rows[0].status).toBe('accepted');
    // payment_orders row marked paid.
    const po = await pool.query('SELECT status FROM payment_orders WHERE id = $1', [`optest_${uniq}`]);
    expect(po.rows[0].status).toBe('paid');

    // Khata untouched: balance unchanged, no new razorpay credit transaction.
    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [custAId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBal);
    const afterTx = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transactions WHERE customer_id = $1 AND source = 'razorpay'`,
      [custAId]
    );
    expect(afterTx.rows[0].n).toBe(beforeTx.rows[0].n);
  });
});
