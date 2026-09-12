// CROSS-FEATURE SMOKE / REGRESSION JOURNEY.
//
// Every other suite proves ONE feature in isolation. This one walks the whole
// shop day end to end, through real HTTP, in the order a real shopkeeper and a
// real shopper actually hit it — because the interesting failures live in the
// SEAMS between features, not inside them:
//
//   1. shop is CLOSED           → the storefront refuses the order (batch A)
//   2. owner opens the shop     → the same order now succeeds on the khata
//   3. the order starts NAGGING the owner, unacknowledged (batch ORDERALERT)
//   4. owner taps a ready-time chip → accepted + promised + the alert goes quiet
//      in ONE call (batch B)
//   5. shop is out of dal       → owner REDUCES the order, khata follows (batch C)
//   6. the statement tells the truth about what was paid vs adjusted
//   7. owner takes a pause      → the storefront refuses the next order again
//
// Money is asserted in PAISE at every step, and the closing balance is checked
// against a figure computed by hand at the top, so a regression anywhere in the
// chain shows up as a wrong rupee amount rather than a green tick.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations. WhatsApp and
// Razorpay are mocked — nothing here touches the network.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const sent = [];
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: jest.fn(async (to, body) => { sent.push({ to, body }); return { ok: true }; }),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));
jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: jest.fn(async () => { throw new Error('unexpected razorpay call'); }),
  createPaymentLinkForShop: jest.fn(async () => { throw new Error('unexpected razorpay call'); }),
  refund: jest.fn(async () => { throw new Error('no refund pipeline exists'); }),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');

const SUF = Date.now().toString(36).slice(-6);
const CUST_PHONE = `+9198${String(Date.now()).slice(-8)}`;
let shopId; let ownerId; let custId; let riceId; let dalId;

const owner = () => `Bearer ${jwt.sign({ sub: ownerId, role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '1d' })}`;
const shopper = () => `Bearer ${jwt.sign({ sub: 'smoke-cust', role: 'customer', phone: CUST_PHONE }, process.env.JWT_SECRET, { expiresIn: '1d' })}`;
const balance = async () => Number((await pool.query('SELECT balance FROM customers WHERE id=$1', [custId])).rows[0].balance);

beforeAll(async () => {
  const u = await pool.query(
    `INSERT INTO users (email, phone, password_hash, role, name)
     VALUES ($1,$2,'x','owner',$3) RETURNING id`,
    [`smoke_${SUF}@example.com`, `+9197${String(Date.now()).slice(-8)}`, 'Smoke Owner']
  );
  ownerId = u.rows[0].id;
  const s = await pool.query(
    `INSERT INTO shops (name, owner_id, offers_pickup, offers_delivery, is_open)
     VALUES ($1,$2,true,false,true) RETURNING id`,
    [`Smoke Kirana ${SUF}`, ownerId]
  );
  shopId = s.rows[0].id;
  await pool.query('UPDATE users SET shop_id=$1 WHERE id=$2', [shopId, ownerId]);
  const c = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,'Ramesh',$2,0) RETURNING id`,
    [shopId, CUST_PHONE]
  );
  custId = c.rows[0].id;
  const p = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active) VALUES
       ($1,'Rice 5kg',25000,true), ($1,'Dal 1kg',10000,true) RETURNING id, name`,
    [shopId]
  );
  riceId = p.rows.find((r) => r.name.startsWith('Rice')).id;
  dalId = p.rows.find((r) => r.name.startsWith('Dal')).id;
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE id=$1', [shopId]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id=$1', [ownerId]).catch(() => {});
  await pool.end();
});

const placeOrder = () => request(app).post('/api/my/orders').set('Authorization', shopper()).send({
  shop_id: shopId,
  items: [{ product_id: riceId, quantity: 1 }, { product_id: dalId, quantity: 2 }],
  fulfillment_type: 'pickup',
  payment_mode: 'credit',
});

describe('a whole shop day, end to end', () => {
  let orderId;

  it('1. a CLOSED shop refuses the order and writes nothing', async () => {
    await request(app).patch('/api/shops/me').set('Authorization', owner()).send({ is_open: false }).expect(200);

    const res = await placeOrder();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('shop_closed');

    expect((await pool.query('SELECT 1 FROM orders WHERE shop_id=$1', [shopId])).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM transactions WHERE shop_id=$1', [shopId])).rowCount).toBe(0);
    expect(await balance()).toBe(0);
  });

  it('2. the owner opens the shop and the same order goes through onto the khata', async () => {
    await request(app).patch('/api/shops/me').set('Authorization', owner()).send({ is_open: true }).expect(200);

    const res = await placeOrder();
    expect(res.status).toBe(201);
    orderId = res.body.order.id;
    // Rice 250 + two Dal 200 = 450.00
    expect(Number(res.body.order.subtotal)).toBe(45000);
    expect(await balance()).toBe(45000);
  });

  it('3. the new order is NAGGING the owner — unacknowledged and top of the alert list', async () => {
    const res = await request(app).get('/api/orders/alerts').set('Authorization', owner());
    expect(res.status).toBe(200);
    const mine = res.body.items.filter((i) => i.id === orderId);
    expect(mine).toHaveLength(1);
    expect(mine[0].customer_name).toBe('Ramesh');
    expect(Number(mine[0].total)).toBe(45000);
    expect(res.body.alert.enabled).toBe(true);
  });

  it('4. ONE tap accepts, promises a ready time, and silences the alert', async () => {
    const res = await request(app).patch(`/api/orders/${orderId}/status`)
      .set('Authorization', owner()).send({ status: 'accepted', eta_minutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('accepted');
    expect(res.body.order.eta_minutes).toBe(30);
    expect(res.body.order.promised_at).toBeTruthy();
    expect(res.body.order.acknowledged_at).toBeTruthy();

    const alerts = await request(app).get('/api/orders/alerts').set('Authorization', owner());
    expect(alerts.body.items.filter((i) => i.id === orderId)).toHaveLength(0);

    // The shopper was told, with a clock time rather than a relative phrase.
    const msg = sent.filter((m) => m.to.includes(CUST_PHONE.replace('+', ''))).pop();
    expect(msg).toBeTruthy();
    expect(msg.body).toMatch(/\d{1,2}:\d{2}/);
  });

  it('5. out of dal — the owner reduces the order and the khata follows exactly', async () => {
    const det = await request(app).get(`/api/orders/${orderId}`).set('Authorization', owner());
    const dalLine = det.body.order.items.find((i) => i.name.startsWith('Dal'));

    const res = await request(app).patch(`/api/orders/${orderId}/items`)
      .set('Authorization', owner()).send({ lines: [{ order_item_id: dalLine.id, qty: 0 }] });
    expect(res.status).toBe(200);
    // 450 - 200 = 250.00 of goods left.
    expect(Number(res.body.order.subtotal)).toBe(25000);
    // The khata moved by exactly the 200.00 that was taken off.
    expect(await balance()).toBe(25000);

    // Append-only: the original purchase is still there, untouched, alongside
    // exactly one adjustment.
    const tx = await pool.query('SELECT type, amount FROM transactions WHERE customer_id=$1 ORDER BY created_at', [custId]);
    expect(tx.rows.map((r) => r.type)).toEqual(['purchase', 'adjustment']);
    expect(Number(tx.rows[0].amount)).toBe(45000);
    expect(Number(tx.rows[1].amount)).toBe(20000);

    // And it is audited, line by line.
    const edits = await pool.query('SELECT name, qty_before, qty_after FROM order_edits WHERE order_id=$1', [orderId]);
    expect(edits.rows).toHaveLength(1);
    expect(edits.rows[0]).toMatchObject({ qty_before: 2, qty_after: 0 });
  });

  it('6. the statement tells the truth: 250 owed, nothing PAID, 200 adjusted', async () => {
    const { buildStatement } = require('../src/utils/statement');
    const today = new Date().toISOString().slice(0, 10);
    const st = await buildStatement(custId, today, today);
    expect(st.total_purchases).toBe(45000);
    expect(st.total_paid).toBe(0);        // the customer handed over nothing
    expect(st.total_adjusted).toBe(20000);
    expect(st.closing).toBe(25000);
  });

  it('7. the owner takes a pause and the storefront refuses the next order', async () => {
    const pause = await request(app).post('/api/shops/me/pause').set('Authorization', owner()).send({ minutes: 30 });
    expect(pause.status).toBe(200);

    const res = await placeOrder();
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('shop_closed');
    expect(res.body.details.reason).toBe('paused');
    expect(res.body.details.reopens_at).toBeTruthy();

    // Still exactly one order and one customer balance from the whole day.
    expect((await pool.query('SELECT 1 FROM orders WHERE shop_id=$1', [shopId])).rowCount).toBe(1);
    expect(await balance()).toBe(25000);
  });
});
