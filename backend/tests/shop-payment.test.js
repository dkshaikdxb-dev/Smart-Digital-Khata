// Integration tests for Per-Shop Razorpay (M4). Requires a real Postgres
// (DATABASE_URL) with migrations applied. These cover only the paths that need
// no live Razorpay keys: settings persistence + masking, the unconfigured-400
// path, the per-shop webhook signature verify, and the per-shop webhook
// reconciliation. They never hit Razorpay's servers.
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const razorpay = require('../src/services/razorpay.service');
const shopSettings = require('../src/config/shopSettings');

const uniq = Date.now().toString().slice(-9);

let shopId;
let ownerId;
let customerId;

function ownerToken(shop) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId: shop }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['SP Owner', `spowner_${uniq}@test.local`, `+9192${uniq}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, 'ShopPay Store']
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [shopId, 'Pay Customer', `+9193${uniq}`, 100000, 50000]
  );
  customerId = cust.rows[0].id;
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

describe('owner shop-payment settings API', () => {
  const token = () => ownerToken(shopId);

  it('GET /shops/me/payment returns a webhook_url with a token and no secrets before setup', async () => {
    const res = await request(app)
      .get('/api/shops/me/payment')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.key_id).toBeNull();
    expect(res.body.mode).toBeNull();
    expect(res.body.key_secret_set).toBe(false);
    expect(res.body.webhook_secret_set).toBe(false);
    expect(res.body.webhook_url).toMatch(/\/api\/webhooks\/razorpay\/shop\/[0-9a-f]{32}$/);
    // Only the boolean *_set flags may mention secrets — never a raw value.
    expect(res.body).not.toHaveProperty('key_secret');
    expect(res.body).not.toHaveProperty('webhook_secret');
  });

  it('PATCH /shops/me/payment persists key_id + secrets and GET masks the secrets', async () => {
    const patch = await request(app)
      .patch('/api/shops/me/payment')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        razorpay_key_id: 'rzp_test_abc123',
        razorpay_key_secret: 'supersecretkey',
        razorpay_webhook_secret: 'whooksecret',
      });
    expect(patch.status).toBe(200);
    expect(patch.body.key_id).toBe('rzp_test_abc123');
    expect(patch.body.mode).toBe('test');
    expect(patch.body.key_secret_set).toBe(true);
    expect(patch.body.webhook_secret_set).toBe(true);
    // Response must never echo the secret values.
    const asText = JSON.stringify(patch.body);
    expect(asText).not.toContain('supersecretkey');
    expect(asText).not.toContain('whooksecret');

    // Secrets are actually persisted (checked directly, not via the API).
    const stored = await shopSettings.getRazorpay(shopId);
    expect(stored.key_secret).toBe('supersecretkey');
    expect(stored.webhook_secret).toBe('whooksecret');

    const get = await request(app)
      .get('/api/shops/me/payment')
      .set('Authorization', `Bearer ${token()}`);
    expect(get.status).toBe(200);
    expect(get.body.key_id).toBe('rzp_test_abc123');
    expect(get.body.key_secret_set).toBe(true);
    expect(get.body.webhook_secret_set).toBe(true);
    expect(JSON.stringify(get.body)).not.toContain('supersecretkey');
  });

  it('PATCH with a blank secret does not wipe the stored secret', async () => {
    const res = await request(app)
      .patch('/api/shops/me/payment')
      .set('Authorization', `Bearer ${token()}`)
      .send({ razorpay_key_id: 'rzp_test_abc123', razorpay_key_secret: '' });
    expect(res.status).toBe(200);
    const stored = await shopSettings.getRazorpay(shopId);
    expect(stored.key_secret).toBe('supersecretkey');
  });
});

describe('owner request-payment when unconfigured', () => {
  it('POST /payments/orders returns 400 for a shop with no Razorpay keys', async () => {
    // Fresh shop with no settings at all.
    const owner = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,'x','owner') RETURNING id`,
      ['NoRzp Owner', `norzp_${uniq}@test.local`, `+9194${uniq}`]
    );
    const oId = owner.rows[0].id;
    const shop = await pool.query(
      `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
      [oId, 'NoRzp Store']
    );
    const sId = shop.rows[0].id;
    await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [sId, oId]);
    const cust = await pool.query(
      `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [sId, 'X', `+9195${uniq}`, 100000, 50000]
    );

    const res = await request(app)
      .post('/api/payments/orders')
      .set('Authorization', `Bearer ${ownerToken(sId)}`)
      .send({ customer_id: cust.rows[0].id, amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This shop has not connected Razorpay yet.');

    await pool.query('DELETE FROM shops WHERE id = $1', [sId]);
    await pool.query('DELETE FROM users WHERE id = $1', [oId]);
  });
});

describe('verifyShopWebhook', () => {
  it('returns true for a correctly HMAC-signed body and false for a bad signature', async () => {
    // The shop's webhook secret was persisted as "whooksecret" above.
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'evt_verify_1' }));
    const goodSig = crypto.createHmac('sha256', 'whooksecret').update(body).digest('hex');

    await expect(razorpay.verifyShopWebhook(shopId, body, goodSig)).resolves.toBe(true);
    await expect(razorpay.verifyShopWebhook(shopId, body, 'deadbeef')).resolves.toBe(false);
    await expect(razorpay.verifyShopWebhook(shopId, body, '')).resolves.toBe(false);
  });
});

describe('per-shop webhook route', () => {
  async function tokenForShop() {
    const s = await shopSettings.getRazorpay(shopId);
    return s.webhook_token;
  }

  it('reconciles a seeded payment_orders row on a valid token + valid signature', async () => {
    const token = await tokenForShop();
    const orderRowId = `sptest_${uniq}`;
    const providerOrderId = `order_${uniq}`;
    const amount = 12000;

    await pool.query(
      `INSERT INTO payment_orders
         (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes)
       VALUES ($1,$2,$3,$4,'INR','created','razorpay',$5,NULL)`,
      [orderRowId, shopId, customerId, amount, providerOrderId]
    );

    const before = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    const beforeBalance = Number(before.rows[0].balance);

    const event = {
      event: 'payment.captured',
      id: `evt_pay_${uniq}`,
      payload: { payment: { entity: { id: `pay_${uniq}`, order_id: providerOrderId, amount } } },
    };
    // Send a raw string so supertest transmits the exact bytes the HMAC is over
    // (a Buffer passed to .send() would be JSON-re-serialized by superagent).
    const rawStr = JSON.stringify(event);
    const sig = crypto.createHmac('sha256', 'whooksecret').update(Buffer.from(rawStr)).digest('hex');

    const res = await request(app)
      .post(`/api/webhooks/razorpay/shop/${token}`)
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(rawStr);
    expect(res.status).toBe(200);

    const order = await pool.query('SELECT status, paid_at, provider_payment_id FROM payment_orders WHERE id = $1', [orderRowId]);
    expect(order.rows[0].status).toBe('paid');
    expect(order.rows[0].paid_at).toBeTruthy();
    expect(order.rows[0].provider_payment_id).toBe(`pay_${uniq}`);

    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBalance - amount);

    const tx = await pool.query(
      `SELECT * FROM transactions WHERE customer_id = $1 AND source = 'razorpay' AND amount = $2`,
      [customerId, amount]
    );
    expect(tx.rowCount).toBe(1);
    expect(tx.rows[0].method).toBe('razorpay');
    expect(tx.rows[0].type).toBe('upi');
  });

  it('returns 400 on a bad signature for the shop route', async () => {
    const token = await tokenForShop();
    const rawStr = JSON.stringify({ event: 'payment.captured', id: `evt_bad_${uniq}` });
    const res = await request(app)
      .post(`/api/webhooks/razorpay/shop/${token}`)
      .set('x-razorpay-signature', 'not-a-valid-signature')
      .set('Content-Type', 'application/json')
      .send(rawStr);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown webhook token', async () => {
    const rawStr = JSON.stringify({ event: 'payment.captured', id: 'evt_unknown' });
    // Sign it correctly for our shop — token resolution must fail first anyway.
    const sig = crypto.createHmac('sha256', 'whooksecret').update(Buffer.from(rawStr)).digest('hex');
    const res = await request(app)
      .post('/api/webhooks/razorpay/shop/ffffffffffffffffffffffffffffffff')
      .set('x-razorpay-signature', sig)
      .set('Content-Type', 'application/json')
      .send(rawStr);
    expect(res.status).toBe(404);
  });
});

describe('platform webhook still rejects bad signatures', () => {
  it('POST /webhooks/razorpay returns 400 on a bad signature', async () => {
    const rawStr = JSON.stringify({ event: 'subscription.activated', id: 'evt_plat' });
    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-razorpay-signature', 'bad')
      .set('Content-Type', 'application/json')
      .send(rawStr);
    expect(res.status).toBe(400);
  });
});
