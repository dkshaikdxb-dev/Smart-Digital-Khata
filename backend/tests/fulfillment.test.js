// Integration tests for per-shop FULFILLMENT settings (M7). Requires a real
// Postgres (DATABASE_URL) with all migrations (incl. 0015) applied.
//
// Covers: owner PATCH/GET of the fulfillment settings; public getShop exposing
// fulfillment fields + product category/subcategory; and the MONEY-critical
// order flow — mode availability, delivery min-order gate, the delivery fee on
// both the credit (khata) and prepaid (Razorpay) paths, and the free-delivery
// threshold that waives the fee.
//
// Razorpay is mocked so the prepaid path runs without real keys, letting us
// assert the online payment amount equals the ORDER TOTAL (subtotal + fee).
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

// Mock the shop Razorpay service: configured for every shop, and capture the
// amount our controller asks it to charge. (jest.mock factories may only
// reference out-of-scope vars whose names start with `mock`.)
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

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const CUST_PHONE = toE164(`70${uniq}`);

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shopId) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function makeShop(email, name, cols = {}) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, email, `+9187${Math.random().toString().slice(2, 11)}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(`INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`, [ownerId, name]);
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  const keys = Object.keys(cols);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE shops SET ${sets} WHERE id = $1`, [shopId, ...keys.map((k) => cols[k])]);
  }
  return { ownerId, shopId };
}

async function addProduct(shopId, name, price, catalogItemId = null) {
  const r = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active, catalog_item_id) VALUES ($1,$2,$3,true,$4) RETURNING id`,
    [shopId, name, price, catalogItemId]
  );
  return r.rows[0].id;
}

let pickupShopId, pickupOwnerId; // pickup-only
let deliShopId, deliOwnerId; // pickup + delivery, fee 3000, free>=20000, min 5000
let settingsShopId, settingsOwnerId; // for PATCH/GET
let catalogItemId;
let pDeli, pCheap, pPickup;

beforeAll(async () => {
  const pk = await makeShop(`ful_pk_${uniq}@test.local`, 'Pickup Only Store', {
    offers_pickup: true,
    offers_delivery: false,
  });
  pickupShopId = pk.shopId;
  pickupOwnerId = pk.ownerId;

  const dl = await makeShop(`ful_dl_${uniq}@test.local`, 'Delivery Store', {
    offers_pickup: true,
    offers_delivery: true,
    delivery_fee: 3000, // ₹30
    free_delivery_min: 20000, // ₹200
    delivery_min_order: 5000, // ₹50
    is_listed: true,
  });
  deliShopId = dl.shopId;
  deliOwnerId = dl.ownerId;

  const st = await makeShop(`ful_st_${uniq}@test.local`, 'Settings Store');
  settingsShopId = st.shopId;
  settingsOwnerId = st.ownerId;

  // A base catalog item + a product linked to it, to prove getShop surfaces
  // category/subcategory (null for unlinked products).
  const ci = await pool.query(
    `INSERT INTO catalog_items (sku, category, subcategory, product)
     VALUES ($1,'Grains','Rice','Basmati Rice') RETURNING id`,
    [`SKU_FUL_${uniq}`]
  );
  catalogItemId = ci.rows[0].id;

  pDeli = await addProduct(deliShopId, 'Basmati Rice 5kg', 6000, catalogItemId); // ₹60, linked
  pCheap = await addProduct(deliShopId, 'Salt', 3000); // ₹30, unlinked
  pPickup = await addProduct(pickupShopId, 'Sugar', 4000); // ₹40
});

afterAll(async () => {
  for (const id of [pickupShopId, deliShopId, settingsShopId]) if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of [pickupOwnerId, deliOwnerId, settingsOwnerId]) if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (catalogItemId) await pool.query('DELETE FROM catalog_items WHERE id = $1', [catalogItemId]);
  await pool.end();
});

describe('owner fulfillment settings (PATCH/GET /shops/me)', () => {
  it('persists all fulfillment fields and returns them from GET', async () => {
    const body = {
      offers_pickup: false,
      offers_delivery: true,
      delivery_fee: 2500,
      free_delivery_min: 15000,
      delivery_min_order: 4000,
      delivery_radius_km: 7.5,
      delivery_hours: '9 AM - 8 PM',
    };
    const patch = await request(app)
      .patch('/api/shops/me')
      .set('Authorization', `Bearer ${ownerToken(settingsShopId)}`)
      .send(body);
    expect(patch.status).toBe(200);
    const s = patch.body.shop;
    expect(s.offers_pickup).toBe(false);
    expect(s.offers_delivery).toBe(true);
    expect(Number(s.delivery_fee)).toBe(2500);
    expect(Number(s.free_delivery_min)).toBe(15000);
    expect(Number(s.delivery_min_order)).toBe(4000);
    expect(Number(s.delivery_radius_km)).toBe(7.5);
    expect(s.delivery_hours).toBe('9 AM - 8 PM');

    const me = await request(app).get('/api/shops/me').set('Authorization', `Bearer ${ownerToken(settingsShopId)}`);
    expect(me.status).toBe(200);
    expect(me.body.shop.offers_delivery).toBe(true);
    expect(Number(me.body.shop.delivery_fee)).toBe(2500);
    expect(me.body.shop.delivery_hours).toBe('9 AM - 8 PM');
  });

  it('accepts null to clear the nullable fulfillment fields', async () => {
    const patch = await request(app)
      .patch('/api/shops/me')
      .set('Authorization', `Bearer ${ownerToken(settingsShopId)}`)
      .send({ free_delivery_min: null, delivery_radius_km: null, delivery_hours: null });
    expect(patch.status).toBe(200);
    expect(patch.body.shop.free_delivery_min).toBeNull();
    expect(patch.body.shop.delivery_radius_km).toBeNull();
    expect(patch.body.shop.delivery_hours).toBeNull();
  });

  it('rejects a negative delivery_fee (400)', async () => {
    const bad = await request(app)
      .patch('/api/shops/me')
      .set('Authorization', `Bearer ${ownerToken(settingsShopId)}`)
      .send({ delivery_fee: -100 });
    expect(bad.status).toBe(400);
  });
});

describe('public getShop exposes fulfillment + product category', () => {
  it('returns fulfillment fields and per-product category/subcategory', async () => {
    const res = await request(app).get(`/api/public/shops/${deliShopId}`);
    expect(res.status).toBe(200);
    const shop = res.body.shop;
    expect(shop.offers_pickup).toBe(true);
    expect(shop.offers_delivery).toBe(true);
    expect(Number(shop.delivery_fee)).toBe(3000);
    expect(Number(shop.free_delivery_min)).toBe(20000);
    expect(Number(shop.delivery_min_order)).toBe(5000);

    const rice = shop.products.find((p) => p.name === 'Basmati Rice 5kg');
    expect(rice.category).toBe('Grains');
    expect(rice.subcategory).toBe('Rice');
    const salt = shop.products.find((p) => p.name === 'Salt');
    expect(salt.category).toBeNull();
    expect(salt.subcategory).toBeNull();
  });

  it('listShops carries offers_delivery + delivery_fee for the badge', async () => {
    const res = await request(app).get('/api/public/shops?search=Delivery Store');
    expect(res.status).toBe(200);
    const row = res.body.shops.find((s) => s.id === deliShopId);
    expect(row).toBeTruthy();
    expect(row.offers_delivery).toBe(true);
    expect(row.delivery_fee).toBe(3000);
  });
});

describe('createOrder honours fulfillment settings (MONEY)', () => {
  const token = () => customerToken(CUST_PHONE);

  it('pickup at a pickup-only shop succeeds with no delivery fee', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: pickupShopId, items: [{ product_id: pPickup, quantity: 1 }], fulfillment_type: 'pickup', payment_mode: 'credit' });
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(4000);
    expect(Number(res.body.order.delivery_fee)).toBe(0);
    expect(Number(res.body.order.total)).toBe(4000);
  });

  it('delivery at a pickup-only shop is rejected (400)', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: pickupShopId, items: [{ product_id: pPickup, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'credit', address: '1 Test Rd' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This shop does not offer delivery.');
  });

  it('delivery below the min order is rejected (422) with the minimum in the message', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: deliShopId, items: [{ product_id: pCheap, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'credit', address: '1 Test Rd' }); // 3000 < 5000
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Minimum order for delivery/);
    expect(res.body.error).toContain('50'); // ₹50.00
  });

  it('credit delivery order adds subtotal + fee to the khata', async () => {
    const before = await pool.query('SELECT balance FROM customers WHERE shop_id = $1 AND phone = $2', [deliShopId, CUST_PHONE]);
    const beforeBal = before.rowCount ? Number(before.rows[0].balance) : 0;

    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: deliShopId, items: [{ product_id: pDeli, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'credit', address: '1 Test Rd' }); // subtotal 6000
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(6000);
    expect(Number(res.body.order.delivery_fee)).toBe(3000);
    expect(Number(res.body.order.total)).toBe(9000);

    const after = await pool.query('SELECT id, balance FROM customers WHERE shop_id = $1 AND phone = $2', [deliShopId, CUST_PHONE]);
    expect(Number(after.rows[0].balance)).toBe(beforeBal + 9000);
    // The khata purchase transaction records the TOTAL, not the bare subtotal.
    const tx = await pool.query(
      `SELECT amount FROM transactions WHERE customer_id = $1 AND type = 'purchase' AND note = $2`,
      [after.rows[0].id, `Order ${res.body.order.id}`]
    );
    expect(Number(tx.rows[0].amount)).toBe(9000);
  });

  it('free_delivery_min waives the fee at/above the threshold', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: deliShopId, items: [{ product_id: pDeli, quantity: 4 }], fulfillment_type: 'delivery', payment_mode: 'credit', address: '1 Test Rd' }); // subtotal 24000 >= 20000
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(24000);
    expect(Number(res.body.order.delivery_fee)).toBe(0);
    expect(Number(res.body.order.total)).toBe(24000);
  });

  it('prepaid delivery order charges subtotal + fee online', async () => {
    mockCreateOrderForShop.mockClear();
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: deliShopId, items: [{ product_id: pDeli, quantity: 1 }], fulfillment_type: 'delivery', payment_mode: 'prepaid', address: '1 Test Rd' }); // subtotal 6000, fee 3000
    expect(res.status).toBe(201);
    expect(res.body.pay_link).toBe('https://rzp.io/i/testlink');
    expect(Number(res.body.order.total)).toBe(9000);
    expect(Number(res.body.order.delivery_fee)).toBe(3000);

    // Razorpay was asked to charge the TOTAL (9000), not the subtotal (6000).
    expect(mockCreateOrderForShop).toHaveBeenCalledTimes(1);
    expect(mockCreateOrderForShop.mock.calls[0][1].amount).toBe(9000);

    // The persisted payment_orders row amount equals the total too.
    const po = await pool.query('SELECT amount FROM payment_orders WHERE order_id = $1', [res.body.order.id]);
    expect(po.rowCount).toBe(1);
    expect(Number(po.rows[0].amount)).toBe(9000);
  });
});
