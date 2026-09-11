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

  // Fix 1 (double-count race). Two DIFFERENT Razorpay events for the SAME
  // payment (e.g. payment.captured + payment_link.paid, distinct event ids) each
  // pass the dedupe and each call reconcilePayment. The balance must move EXACTLY
  // once and exactly ONE upi transaction row must exist.
  it('two payment events for the same order settle the balance exactly once', async () => {
    const token = await tokenForShop();
    const orderRowId = `idem_${uniq}`;
    const providerOrderId = `order_idem_${uniq}`;
    const amount = 7000;

    await pool.query(
      `INSERT INTO payment_orders
         (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes)
       VALUES ($1,$2,$3,$4,'INR','created','razorpay',$5,NULL)`,
      [orderRowId, shopId, customerId, amount, providerOrderId]
    );

    const before = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    const beforeBalance = Number(before.rows[0].balance);

    const eventNames = ['payment.captured', 'order.paid', 'payment_link.paid'];
    const deliver = (i) => {
      const event = {
        event: eventNames[i % eventNames.length],
        id: `evt_idem_${i}_${uniq}`, // distinct event ids → each passes dedupe
        payload: { payment: { entity: { id: `pay_idem_${uniq}`, order_id: providerOrderId, amount } } },
      };
      const rawStr = JSON.stringify(event);
      const sig = crypto.createHmac('sha256', 'whooksecret').update(Buffer.from(rawStr)).digest('hex');
      return request(app)
        .post(`/api/webhooks/razorpay/shop/${token}`)
        .set('x-razorpay-signature', sig)
        .set('Content-Type', 'application/json')
        .send(rawStr);
    };

    // Fire many deliveries CONCURRENTLY so several handlers read the row while it
    // is still 'created' — the real double-count race. Every one returns 200
    // (each is either the settler or an idempotent no-op). Only the atomic
    // conditional UPDATE (WHERE status <> 'paid') keeps the settlement to one.
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => deliver(i)));
    for (const r of results) expect(r.status).toBe(200);

    // Decremented ONCE, not twice.
    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBalance - amount);

    // Exactly one credit transaction for this amount.
    const tx = await pool.query(
      `SELECT * FROM transactions WHERE customer_id = $1 AND source = 'razorpay' AND amount = $2`,
      [customerId, amount]
    );
    expect(tx.rowCount).toBe(1);

    const order = await pool.query('SELECT status FROM payment_orders WHERE id = $1', [orderRowId]);
    expect(order.rows[0].status).toBe('paid');
  });

  // Fix 2 (dropped payment). A transient failure inside reconcilePayment (a DB
  // blip) must NOT leave the event marked processed — otherwise Razorpay's retry
  // is deduped away and the payment is lost forever. A subsequent valid
  // re-delivery of the same event id must reconcile and move the balance.
  it('a transient reconcile failure does not permanently drop the payment', async () => {
    const token = await tokenForShop();
    const orderRowId = `drop_${uniq}`;
    const providerOrderId = `order_drop_${uniq}`;
    const amount = 8000;
    const eventId = `evt_drop_${uniq}`;

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
      id: eventId,
      payload: { payment: { entity: { id: `pay_drop_${uniq}`, order_id: providerOrderId, amount } } },
    };
    const rawStr = JSON.stringify(event);
    const sig = crypto.createHmac('sha256', 'whooksecret').update(Buffer.from(rawStr)).digest('hex');
    const send = () =>
      request(app)
        .post(`/api/webhooks/razorpay/shop/${token}`)
        .set('x-razorpay-signature', sig)
        .set('Content-Type', 'application/json')
        .send(rawStr);

    // Deterministically blow up INSIDE reconcilePayment — after the event has
    // been marked processed. We poison ONLY the reconcile SELECT (the first
    // `FROM payment_orders` read), leaving alreadyProcessed's insert and every
    // other query intact. One-shot: the retry below runs unpoisoned.
    const realQuery = pool.query.bind(pool);
    let poisoned = true;
    const spy = jest.spyOn(pool, 'query').mockImplementation((text, params) => {
      if (poisoned && typeof text === 'string' && text.includes('FROM payment_orders')) {
        poisoned = false;
        return Promise.reject(new Error('simulated DB blip'));
      }
      return realQuery(text, params);
    });
    const failed = await send();
    spy.mockRestore();
    expect(failed.status).toBeGreaterThanOrEqual(500);

    // The processed_events row must NOT be left behind.
    const pe = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [`razorpay:${token}:${eventId}`]);
    expect(pe.rowCount).toBe(0);

    // The failed delivery moved no money.
    const mid = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    expect(Number(mid.rows[0].balance)).toBe(beforeBalance);

    // Razorpay retries the SAME event id — it must now reconcile.
    const ok = await send();
    expect(ok.status).toBe(200);

    const after = await pool.query('SELECT balance FROM customers WHERE id = $1', [customerId]);
    expect(Number(after.rows[0].balance)).toBe(beforeBalance - amount);
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
