// Integration tests for the M8 backend additions:
//   1) owner WhatsApp alert on a new customer order (fire-and-forget),
//   2) CASH payment mode (no khata, no online pay; paid on completion),
//   3) bulk catalog select.
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0017).
//
// Razorpay is mocked so the prepaid path runs without real keys. WhatsApp is
// mocked so we can assert the owner alert is invoked with the owner's phone
// WITHOUT a live Meta API — and prove a send failure never fails the order.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockCreateOrderForShop = jest.fn(async (_shopId, { receipt }) => ({
  id: `order_${Math.random().toString().slice(2, 10)}`,
  receipt,
}));
const mockCreatePaymentLinkForShop = jest.fn(async () => ({
  id: `plink_${Math.random().toString().slice(2, 10)}`,
  short_url: 'https://rzp.io/i/testlink',
}));
jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: (...a) => mockCreateOrderForShop(...a),
  createPaymentLinkForShop: (...a) => mockCreatePaymentLinkForShop(...a),
}));

// WhatsApp seam: assert the owner alert reaches it, and let a test force a reject
// to prove the order still succeeds (the fire-and-forget .catch path).
const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const CUST_PHONE = toE164(`61${uniq}`);
const OWNER_PHONE = toE164(`62${uniq}`);

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shopId) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Wait until `fn()` is truthy (for the fire-and-forget owner alert), or time out.
async function waitFor(fn, timeout = 2000, step = 20) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

let shopId, ownerId, custId;
let pRice, pSalt; // products
let ci1, ci2, ci3; // catalog items for bulk-select

async function addProduct(name, price) {
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
    ['Cash Store Owner', `cash_owner_${uniq}@test.local`, OWNER_PHONE]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_pickup, offers_delivery, delivery_fee, delivery_min_order)
     VALUES ($1,'Cash Kirana', true, true, 2000, 0) RETURNING id`,
    [ownerId]
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  // Pre-create the customer with a known balance so we can prove CASH never moves it.
  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,'Cash Customer',$2,100000,5000) RETURNING id`,
    [shopId, CUST_PHONE]
  );
  custId = cust.rows[0].id;

  pRice = await addProduct('Rice 1kg', 6000); // ₹60
  pSalt = await addProduct('Salt', 3000); // ₹30

  const c1 = await pool.query(
    `INSERT INTO catalog_items (sku, category, subcategory, product, brand, pack, unit, indicative_price)
     VALUES ($1,'Grains','Rice',$2,'India Gate','1 kg','kg',57500) RETURNING id`,
    [`SKU_CASH1_${uniq}`, `Bulk Rice ${uniq}`]
  );
  ci1 = c1.rows[0].id;
  const c2 = await pool.query(
    `INSERT INTO catalog_items (sku, category, subcategory, product, brand, pack, unit, indicative_price)
     VALUES ($1,'Grains','Rice',$2,'India Gate','5 kg','kg',270000) RETURNING id`,
    [`SKU_CASH2_${uniq}`, `Bulk Rice ${uniq}`]
  );
  ci2 = c2.rows[0].id;
  const c3 = await pool.query(
    `INSERT INTO catalog_items (sku, category, subcategory, product, brand, pack, unit, indicative_price)
     VALUES ($1,'Grains','Rice',$2,'India Gate','10 kg','kg',520000) RETURNING id`,
    [`SKU_CASH3_${uniq}`, `Bulk Rice ${uniq}`]
  );
  ci3 = c3.rows[0].id;
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  for (const id of [ci1, ci2, ci3]) if (id) await pool.query('DELETE FROM catalog_items WHERE id = $1', [id]);
  await pool.end();
});

async function balance() {
  const r = await pool.query('SELECT balance FROM customers WHERE id = $1', [custId]);
  return Number(r.rows[0].balance);
}

describe('CASH payment mode (no khata, no online pay)', () => {
  const token = () => customerToken(CUST_PHONE);

  it('pickup cash order → 201, payment_status pending, no pay link, khata UNCHANGED', async () => {
    const before = await balance();
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pSalt, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'cash' });
    expect(res.status).toBe(201);
    expect(res.body.order.payment_mode).toBe('cash');
    expect(res.body.order.payment_status).toBe('pending');
    expect(res.body.pay_link).toBeUndefined();
    expect(Number(res.body.order.subtotal)).toBe(3000);
    expect(Number(res.body.order.delivery_fee)).toBe(0);
    expect(Number(res.body.order.total)).toBe(3000);

    // No khata transaction and balance identical.
    expect(await balance()).toBe(before);
    const tx = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transactions WHERE customer_id = $1 AND note = $2`,
      [custId, `Order ${res.body.order.id}`]
    );
    expect(tx.rows[0].n).toBe(0);
  });

  it('delivery cash order → total = subtotal + delivery_fee, khata UNCHANGED', async () => {
    const before = await balance();
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pRice, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'cash', address: '1 Test Rd' });
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(6000);
    expect(Number(res.body.order.delivery_fee)).toBe(2000);
    expect(Number(res.body.order.total)).toBe(8000);
    expect(res.body.order.payment_status).toBe('pending');
    expect(await balance()).toBe(before);
  });

  it('owner completing a cash order sets payment_status → paid', async () => {
    const create = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pSalt, quantity: 2 }], fulfillment_type: 'pickup', payment_mode: 'cash' });
    expect(create.status).toBe(201);
    const orderId = create.body.order.id;
    expect(create.body.order.payment_status).toBe('pending');

    const patch = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ status: 'completed' });
    expect(patch.status).toBe(200);
    expect(patch.body.order.status).toBe('completed');
    expect(patch.body.order.payment_status).toBe('paid');
  });
});

describe('credit / prepaid money math is unchanged', () => {
  const token = () => customerToken(CUST_PHONE);

  it('credit order still debits the khata by the total', async () => {
    const before = await balance();
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pRice, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'credit', address: '1 Test Rd' });
    expect(res.status).toBe(201);
    expect(Number(res.body.order.total)).toBe(8000); // 6000 + 2000 fee
    expect(res.body.pay_link).toBeUndefined();
    expect(await balance()).toBe(before + 8000);
    const tx = await pool.query(
      `SELECT amount FROM transactions WHERE customer_id = $1 AND note = $2`,
      [custId, `Order ${res.body.order.id}`]
    );
    expect(Number(tx.rows[0].amount)).toBe(8000);
  });

  it('prepaid order still returns a pay link for the total', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pRice, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'prepaid' });
    expect(res.status).toBe(201);
    expect(res.body.pay_link).toBe('https://rzp.io/i/testlink');
    expect(Number(res.body.order.total)).toBe(6000);
  });
});

describe('owner new-order WhatsApp alert (fire-and-forget)', () => {
  const token = () => customerToken(CUST_PHONE);

  it('invokes whatsapp.sendText with the OWNER phone after the order commits', async () => {
    mockSendText.mockClear();
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pRice, quantity: 2 }], fulfillment_type: 'delivery', payment_mode: 'cash', address: '12 Market St', note: 'Ring bell' });
    expect(res.status).toBe(201);

    // Alerts are fire-and-forget, so other tests' sends may also land here —
    // find THIS order's alert by its unique note rather than assuming calls[0].
    const called = await waitFor(() => mockSendText.mock.calls.some((c) => String(c[1]).includes('Ring bell')));
    expect(called).toBe(true);
    const [to, body] = mockSendText.mock.calls.find((c) => String(c[1]).includes('Ring bell'));
    expect(to).toBe(OWNER_PHONE);
    expect(body).toContain('Cash Customer'); // customer name
    expect(body).toContain('Cash Kirana'); // shop name
    expect(body).toMatch(/₹140\.00/); // 6000*2 + 2000 fee = 14000 paise
    expect(body).toContain('Items: 1'); // one distinct line item
    expect(body).toContain('Delivery');
    expect(body).toContain('12 Market St');
    expect(body).toContain('Ring bell');
  });

  it('order still succeeds (201) when the WhatsApp send REJECTS — .catch path', async () => {
    mockSendText.mockClear();
    mockSendText.mockRejectedValueOnce(new Error('Meta down'));
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, items: [{ product_id: pSalt, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'cash' });
    expect(res.status).toBe(201);
    // Give the rejected fire-and-forget send a chance to settle without crashing.
    await waitFor(() => mockSendText.mock.calls.length > 0);
    expect(res.body.order.id).toBeTruthy();
  });
});

describe('POST /api/catalog/select-bulk', () => {
  it('rejects a customer role (403)', async () => {
    const res = await request(app)
      .post('/api/catalog/select-bulk')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({ items: [{ catalog_item_id: ci1, price: 60000 }] });
    expect(res.status).toBe(403);
  });

  it('adds N products in one call and GET /catalog shows them carried', async () => {
    const res = await request(app)
      .post('/api/catalog/select-bulk')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ items: [
        { catalog_item_id: ci1, price: 60000 },
        { catalog_item_id: ci2, price: 280000 },
        { catalog_item_id: ci3, price: 540000 },
      ] });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(3);
    expect(res.body.products).toHaveLength(3);

    const list = await request(app)
      .get(`/api/catalog?search=${encodeURIComponent(`Bulk Rice ${uniq}`)}`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(list.status).toBe(200);
    const carried = list.body.items.filter((i) => i.carried);
    expect(carried.map((i) => i.id).sort()).toEqual([ci1, ci2, ci3].sort());
    const byId = Object.fromEntries(list.body.items.map((i) => [i.id, i]));
    expect(byId[ci2].shop_price).toBe(280000);
  });

  it('re-running reprices in place, no duplicate product rows', async () => {
    const res = await request(app)
      .post('/api/catalog/select-bulk')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ items: [
        { catalog_item_id: ci1, price: 61000 },
        { catalog_item_id: ci2, price: 281000 },
      ] });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(2);

    const cnt = await pool.query(
      'SELECT catalog_item_id, COUNT(*)::int AS n FROM products WHERE shop_id = $1 AND catalog_item_id = ANY($2::uuid[]) GROUP BY catalog_item_id',
      [shopId, [ci1, ci2]]
    );
    for (const row of cnt.rows) expect(row.n).toBe(1); // no dupes
    const price = await pool.query('SELECT price FROM products WHERE shop_id = $1 AND catalog_item_id = $2', [shopId, ci1]);
    expect(Number(price.rows[0].price)).toBe(61000); // repriced
  });

  it('rejects a batch of more than 100 items (400)', async () => {
    const items = Array.from({ length: 101 }, () => ({ catalog_item_id: ci1, price: 100 }));
    const res = await request(app)
      .post('/api/catalog/select-bulk')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ items });
    expect(res.status).toBe(400);
  });

  it('rejects an empty batch (400)', async () => {
    const res = await request(app)
      .post('/api/catalog/select-bulk')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });
});
