// MONEY INTEGRITY (batch MONEYFIX) — one file for the nine defects a forensic
// audit proved with concrete failing inputs. Every test here FAILS on the code
// as it was and passes after the fix; several of them are deliberately shaped
// around fixtures the previous suites got wrong.
//
// In particular C1: the existing "a reversal never gives back more than is still
// owed" test passed only because its fixture was a SINGLE-LINE order, and
// `planReduction` refuses to empty an order (422 `cancel_instead`). The
// reduction therefore never applied and the double-subtraction it was meant to
// catch never ran. Every reduction fixture below has TWO lines.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0071/0072).
// WhatsApp and the payment provider are mocked; nothing here touches a network.
const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));

// The provider seam. Signature verification is the REAL implementation (the
// webhook tests below depend on it); only the outbound HTTP calls are stubbed.
// `mockLinkProbe` lets a test observe the DATABASE at the exact moment the
// provider is called — that is how "the provider call is outside the
// transaction" is asserted as a fact rather than read off the source.
const mockCreateOrderForShop = jest.fn();
const mockCreatePaymentLinkForShop = jest.fn();
const mockCancelPaymentLinkForShop = jest.fn(async () => ({ status: 'cancelled' }));
jest.mock('../src/services/razorpay.service', () => {
  const actual = jest.requireActual('../src/services/razorpay.service');
  return {
    ...actual,
    isConfiguredForShop: jest.fn(async () => true),
    createOrderForShop: (...a) => mockCreateOrderForShop(...a),
    createPaymentLinkForShop: (...a) => mockCreatePaymentLinkForShop(...a),
    cancelPaymentLinkForShop: (...a) => mockCancelPaymentLinkForShop(...a),
  };
});

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const whatsappInbound = require('../src/services/whatsapp-inbound.service');

const uniq = Date.now().toString().slice(-9);
const OWNER_PHONE = toE164(`71${uniq}`);
const CUST_PHONE = toE164(`72${uniq}`);
const WEBHOOK_SECRET = 'moneyfixsecret';
const WEBHOOK_TOKEN = `tok_money_${uniq}`;

let shopId, ownerId, custId;
let pUnit100, pUnit50; // ₹100 and ₹50 products

function ownerToken() {
  return jwt.sign({ sub: ownerId, role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function customerToken(phone = CUST_PHONE) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

const balanceOf = async (id = custId) =>
  Number((await pool.query('SELECT balance FROM customers WHERE id = $1', [id])).rows[0].balance);
const txFor = async (id = custId) =>
  (await pool.query('SELECT * FROM transactions WHERE customer_id = $1 ORDER BY created_at, id', [id])).rows;
const orderRow = async (id) => (await pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
const payRowsFor = async (orderId) =>
  (await pool.query('SELECT * FROM payment_orders WHERE order_id = $1', [orderId])).rows;

/** Place an order through the real consumer endpoint. */
function placeOrder(body) {
  return request(app)
    .post('/api/my/orders')
    .set('Authorization', `Bearer ${customerToken()}`)
    .send(body);
}
function reduceOrder(id, lines, extra = {}) {
  return request(app)
    .patch(`/api/orders/${id}/items`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ lines, ...extra });
}
function rejectOrder(id) {
  return request(app)
    .patch(`/api/orders/${id}/status`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ status: 'cancelled', reason: 'Out of stock' });
}
const itemsOf = async (orderId) =>
  (await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name ASC', [orderId])).rows;

/** Deliver a signed per-shop provider webhook. */
function sendWebhook(event) {
  const rawStr = JSON.stringify(event);
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(rawStr)).digest('hex');
  return request(app)
    .post(`/api/webhooks/razorpay/shop/${WEBHOOK_TOKEN}`)
    .set('x-razorpay-signature', sig)
    .set('Content-Type', 'application/json')
    .send(rawStr);
}
const processedRows = async (eventId) =>
  (await pool.query('SELECT * FROM processed_events WHERE id = $1', [`razorpay:${WEBHOOK_TOKEN}:${eventId}`])).rowCount;

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Money Owner', `money_owner_${uniq}@test.local`, OWNER_PHONE]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_pickup, offers_delivery, delivery_fee, free_delivery_min)
     VALUES ($1,'Money Kirana', true, true, 4000, 30000) RETURNING id`,
    [ownerId]
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Ramesh Kumar',$2) RETURNING id`,
    [shopId, CUST_PHONE]
  );
  custId = cust.rows[0].id;

  const a = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active) VALUES ($1,'Atta 1kg',10000,true) RETURNING id`,
    [shopId]
  );
  pUnit100 = a.rows[0].id;
  const b = await pool.query(
    `INSERT INTO products (shop_id, name, price, is_active) VALUES ($1,'Dal 1kg',5000,true) RETURNING id`,
    [shopId]
  );
  pUnit50 = b.rows[0].id;

  await pool.query(
    `INSERT INTO shop_settings (shop_id, key, value, updated_at) VALUES
       ($1,'RZP_KEY_ID','rzp_test_money',NOW()),
       ($1,'RZP_KEY_SECRET','moneysecret',NOW()),
       ($1,'RZP_WEBHOOK_SECRET',$2,NOW()),
       ($1,'RZP_WEBHOOK_TOKEN',$3,NOW())
     ON CONFLICT (shop_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [shopId, WEBHOOK_SECRET, WEBHOOK_TOKEN]
  );
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM orders WHERE shop_id = $1', [shopId]);
  await pool.query('DELETE FROM payment_orders WHERE shop_id = $1', [shopId]);
  await pool.query('DELETE FROM transactions WHERE shop_id = $1', [shopId]);
  await pool.query('UPDATE customers SET balance = 0, credit_limit = 0 WHERE shop_id = $1', [shopId]);
  mockSendText.mockClear();
  mockCancelPaymentLinkForShop.mockClear();
  let n = 0;
  mockCreateOrderForShop.mockReset();
  mockCreateOrderForShop.mockImplementation(async (_s, { receipt }) => ({ id: `order_${uniq}_${++n}`, receipt }));
  mockCreatePaymentLinkForShop.mockReset();
  mockCreatePaymentLinkForShop.mockImplementation(async () => ({
    id: `plink_${uniq}_${++n}`,
    short_url: 'https://rzp.test/i/moneyfix',
  }));
});

// ===========================================================================
// C1 — reduce-then-cancel must not leave the reduction owed
//
// `editItems` writes the reduced totals back to orders.subtotal/delivery_fee AND
// posts an 'adjustment'. Deriving "what was charged" from those columns and then
// subtracting the adjustments again removed the reduction twice, so cancelling a
// reduced order posted nothing at all and the customer stayed owing exactly the
// reduction — forever, on goods that were never handed over.
// ===========================================================================
describe('C1 — cancelling a REDUCED credit order returns the balance to exactly zero', () => {
  it('two-line order, reduced, then rejected: the khata nets to 0 and the reversal totals the ORIGINAL charge', async () => {
    const placed = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }, { product_id: pUnit50, quantity: 3 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
    });
    expect(placed.status).toBe(201);
    const id = placed.body.order.id;
    expect(await balanceOf()).toBe(35000); // ₹350 on the khata

    // Remove the Dal line (3 × ₹50). TWO lines, so the reduction actually
    // applies instead of being refused as `cancel_instead`.
    const items = await itemsOf(id);
    const dal = items.find((i) => i.name.startsWith('Dal'));
    expect((await reduceOrder(id, [{ order_item_id: dal.id, qty: 0 }])).status).toBe(200);
    expect(await balanceOf()).toBe(20000);
    expect(Number((await orderRow(id)).subtotal)).toBe(20000); // the order row really was rewritten

    expect((await rejectOrder(id)).status).toBe(200);

    // The whole point: nothing is left owed on an order that was cancelled.
    expect(await balanceOf()).toBe(0);
    const adjustments = (await txFor()).filter((t) => t.type === 'adjustment');
    expect(adjustments.reduce((a, t) => a + Number(t.amount), 0)).toBe(35000);
    // The original purchase is untouched — the ledger is append-only.
    const purchases = (await txFor()).filter((t) => t.type === 'purchase');
    expect(purchases).toHaveLength(1);
    expect(Number(purchases[0].amount)).toBe(35000);
  });

  it('the same holds when the purchase row carries no order_id (legacy ledger row)', async () => {
    // Built by hand so the `purchase` has NO order_id at all — the reversal has
    // to fall back to the order's SNAPSHOTTED original columns, never the
    // current (already-reduced) ones.
    const ord = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, delivery_fee)
       VALUES ($1,$2,'pending','pickup','credit','not_required',35000,0) RETURNING id`,
      [shopId, custId]
    );
    const id = ord.rows[0].id;
    for (const [name, price, qty] of [['Atta 1kg', 10000, 2], ['Dal 1kg', 5000, 3]]) {
      await pool.query(
        `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total) VALUES ($1,$2,$3,$4,$5)`,
        [id, name, price, qty, price * qty]
      );
    }
    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
       VALUES ($1,$2,'purchase',35000,'credit',$3,'api')`,
      [shopId, custId, 'hand-written legacy row']
    );
    await pool.query('UPDATE customers SET balance = 35000 WHERE id = $1', [custId]);

    const items = await itemsOf(id);
    const dal = items.find((i) => i.name.startsWith('Dal'));
    expect((await reduceOrder(id, [{ order_item_id: dal.id, qty: 0 }])).status).toBe(200);
    expect(await balanceOf()).toBe(20000);

    expect((await rejectOrder(id)).status).toBe(200);
    expect(await balanceOf()).toBe(0);
  });

  it('the INVERSE case: a reduction that RE-ADDS the delivery fee never hands back money the shop never took', async () => {
    // ₹350 of goods on DELIVERY clears the ₹300 free-delivery threshold, so the
    // fee charged is ZERO and the customer owes ₹350.
    const placed = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 3 }, { product_id: pUnit50, quantity: 1 }],
      fulfillment_type: 'delivery',
      payment_mode: 'credit',
      address: '12 Station Road',
    });
    expect(placed.status).toBe(201);
    const id = placed.body.order.id;
    expect(Number((await orderRow(id)).delivery_fee)).toBe(0);
    expect(await balanceOf()).toBe(35000);

    // Reduce the Atta line 3 → 2: subtotal 25000 falls back UNDER the threshold,
    // so the ₹40 fee returns and the order row ends up with a LARGER fee than
    // the customer was ever charged.
    const atta = (await itemsOf(id)).find((i) => i.name.startsWith('Atta'));
    expect((await reduceOrder(id, [{ order_item_id: atta.id, qty: 2 }])).status).toBe(200);
    const afterEdit = await orderRow(id);
    expect(Number(afterEdit.subtotal)).toBe(25000);
    expect(Number(afterEdit.delivery_fee)).toBe(4000);
    expect(await balanceOf()).toBe(29000); // 35000 − 6000 given back

    expect((await rejectOrder(id)).status).toBe(200);

    // Exactly zero — NOT −4000, which is what reversing the re-added fee would do.
    expect(await balanceOf()).toBe(0);
    const given = (await txFor()).filter((t) => t.type === 'adjustment')
      .reduce((a, t) => a + Number(t.amount), 0);
    expect(given).toBe(35000);
  });

  it('an unreduced credit order is still reversed in full (regression)', async () => {
    const placed = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
    });
    const id = placed.body.order.id;
    expect(await balanceOf()).toBe(20000);
    expect((await rejectOrder(id)).status).toBe(200);
    expect(await balanceOf()).toBe(0);
  });
});

// ===========================================================================
// C2 — reducing an UNPAID prepaid order minted credit from nothing
// ===========================================================================
describe('C2 — an UNPAID prepaid reduction moves no money', () => {
  async function placePrepaid() {
    const res = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }, { product_id: pUnit50, quantity: 3 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
    });
    expect(res.status).toBe(201);
    return res.body.order.id;
  }

  it('writes NO ledger row and leaves the balance untouched', async () => {
    const id = await placePrepaid();
    expect((await orderRow(id)).payment_status).toBe('pending');
    expect(await balanceOf()).toBe(0);

    const dal = (await itemsOf(id)).find((i) => i.name.startsWith('Dal'));
    const res = await reduceOrder(id, [{ order_item_id: dal.id, qty: 0 }]);
    expect(res.status).toBe(200);
    expect(res.body.adjustment).toBeNull();

    // The customer never paid, so there is nothing to give back. Before the fix
    // the khata showed ₹150 of advance for money the shop never received.
    expect(await txFor()).toHaveLength(0);
    expect(await balanceOf()).toBe(0);
    // The order itself IS reduced — only the money is unaffected.
    expect(Number((await orderRow(id)).subtotal)).toBe(20000);
  });

  it('but a PAID prepaid reduction still becomes credit (regression)', async () => {
    const id = await placePrepaid();
    await pool.query(`UPDATE orders SET payment_status = 'paid' WHERE id = $1`, [id]);
    await pool.query(`UPDATE payment_orders SET status = 'paid', paid_at = NOW() WHERE order_id = $1`, [id]);

    const dal = (await itemsOf(id)).find((i) => i.name.startsWith('Dal'));
    expect((await reduceOrder(id, [{ order_item_id: dal.id, qty: 0 }])).status).toBe(200);

    const txs = await txFor();
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('adjustment');
    expect(Number(txs[0].amount)).toBe(15000);
    expect(await balanceOf()).toBe(-15000);
  });
});

// ===========================================================================
// C3 — a cancelled prepaid order stayed payable, and the payment landed nowhere
// ===========================================================================
describe('C3 — a payment that settles against a CANCELLED order', () => {
  async function placePrepaidAndCancel() {
    const placed = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }, { product_id: pUnit50, quantity: 3 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
    });
    expect(placed.status).toBe(201);
    const id = placed.body.order.id;
    const pay = (await payRowsFor(id))[0];
    const cancelled = await request(app)
      .post(`/api/my/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(cancelled.status).toBe(200);
    return { id, pay };
  }

  it('cancels the hosted payment link so the provider stops chasing the customer', async () => {
    const { id, pay } = await placePrepaidAndCancel();

    expect(mockCancelPaymentLinkForShop).toHaveBeenCalledTimes(1);
    expect(mockCancelPaymentLinkForShop).toHaveBeenCalledWith(shopId, pay.provider_link_id);
    const after = (await payRowsFor(id))[0];
    expect(after.status).toBe('cancelled');
  });

  it('a provider failure on that cancellation is NOT fatal — the order stays cancelled', async () => {
    mockCancelPaymentLinkForShop.mockRejectedValueOnce(new Error('provider down'));
    const { id } = await placePrepaidAndCancel();
    expect((await orderRow(id)).status).toBe('cancelled');
  });

  it('money that arrives anyway becomes SHOP CREDIT on the khata, never a refund and never lost', async () => {
    const { id, pay } = await placePrepaidAndCancel();
    expect(await balanceOf()).toBe(0);

    const res = await sendWebhook({
      event: 'payment.captured',
      id: `evt_late_${uniq}`,
      payload: { payment: { entity: { id: `pay_late_${uniq}`, order_id: pay.provider_order_id, amount: 35000 } } },
    });
    expect(res.status).toBe(200);

    // The money is VISIBLE: one adjustment tied to the order, balance negative
    // by exactly what was paid — an advance at this shop.
    const txs = await txFor();
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('adjustment');
    expect(txs[0].method).toBe('adjustment');
    expect(txs[0].order_id).toBe(id);
    expect(Number(txs[0].amount)).toBe(35000);
    expect(txs[0].note).not.toMatch(/refund/i);
    expect(await balanceOf()).toBe(-35000);

    // The order is still cancelled; the payment row is settled.
    const ord = await orderRow(id);
    expect(ord.status).toBe('cancelled');
    expect(ord.payment_status).toBe('paid');
    expect((await payRowsFor(id))[0].status).toBe('paid');
  });

  it('a redelivery of the same payment does not credit twice', async () => {
    const { pay } = await placePrepaidAndCancel();
    const body = (n) => ({
      event: 'payment.captured',
      id: `evt_dup_${uniq}_${n}`,
      payload: { payment: { entity: { id: `pay_dup_${uniq}`, order_id: pay.provider_order_id, amount: 35000 } } },
    });
    expect((await sendWebhook(body(1))).status).toBe(200);
    expect((await sendWebhook(body(2))).status).toBe(200);
    expect(await txFor()).toHaveLength(1);
    expect(await balanceOf()).toBe(-35000);
  });

  it('a payment for a LIVE prepaid order still just marks it paid, with no khata row (regression)', async () => {
    const placed = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
    });
    const id = placed.body.order.id;
    const pay = (await payRowsFor(id))[0];
    const res = await sendWebhook({
      event: 'payment.captured',
      id: `evt_live_${uniq}`,
      payload: { payment: { entity: { id: `pay_live_${uniq}`, order_id: pay.provider_order_id, amount: 20000 } } },
    });
    expect(res.status).toBe(200);
    const ord = await orderRow(id);
    expect(ord.payment_status).toBe('paid');
    expect(ord.status).toBe('accepted');
    expect(await txFor()).toHaveLength(0);
    expect(await balanceOf()).toBe(0);
  });
});

// ===========================================================================
// C4 — provider network calls used to run INSIDE the DB transaction, holding the
// customer row locked. A rollback after the link was created left a live,
// already-SMSed link with no local row for the webhook to match.
//
// Asserted as a fact about the database: when the provider is called, the local
// row must ALREADY be visible on an independent connection, i.e. committed.
// ===========================================================================
describe('C4 — the provider is called only after the local row is committed', () => {
  it('POST /my/orders (prepaid) commits the payment_orders row before creating the link', async () => {
    let seenAtLinkTime = null;
    mockCreatePaymentLinkForShop.mockImplementationOnce(async (_shopId, { reference_id }) => {
      const r = await pool.query('SELECT status FROM payment_orders WHERE id = $1', [reference_id]);
      seenAtLinkTime = r.rows[0] || null;
      return { id: `plink_c4_${uniq}`, short_url: 'https://rzp.test/i/c4' };
    });

    const res = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
    });
    expect(res.status).toBe(201);
    expect(res.body.pay_link).toBe('https://rzp.test/i/c4');
    // Committed — an uncommitted INSERT is invisible to this second connection.
    expect(seenAtLinkTime).not.toBeNull();
    expect(seenAtLinkTime.status).toBe('created');
  });

  it('POST /my/pay commits the payment_orders row before creating the link', async () => {
    await pool.query('UPDATE customers SET balance = 50000 WHERE id = $1', [custId]);
    let seenAtLinkTime = null;
    mockCreatePaymentLinkForShop.mockImplementationOnce(async (_shopId, { reference_id }) => {
      const r = await pool.query('SELECT status FROM payment_orders WHERE id = $1', [reference_id]);
      seenAtLinkTime = r.rows[0] || null;
      return { id: `plink_c4b_${uniq}`, short_url: 'https://rzp.test/i/c4b' };
    });

    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ shop_id: shopId, amount: 20000 });
    expect(res.status).toBe(201);
    expect(seenAtLinkTime).not.toBeNull();
    expect(seenAtLinkTime.status).toBe('created');
  });

  it('a provider failure leaves a local row the webhook can still match', async () => {
    mockCreatePaymentLinkForShop.mockRejectedValueOnce(new Error('provider timeout'));
    const res = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
    });
    expect(res.status).toBe(400);

    // The order is compensated (cancelled), but the payment row SURVIVES with
    // the provider order id on it — the recoverable direction.
    const po = await pool.query(
      `SELECT * FROM payment_orders WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [shopId]
    );
    expect(po.rowCount).toBe(1);
    expect(po.rows[0].provider_order_id).toBeTruthy();
    expect(po.rows[0].status).toBe('failed');
    expect((await orderRow(po.rows[0].order_id)).status).toBe('cancelled');
  });
});

// ===========================================================================
// C5 — an unmatched webhook was marked processed, so the provider's retry was
// deduped away and the payment was lost forever.
// ===========================================================================
describe('C5 — an unmatched payment event stays RETRYABLE', () => {
  it('does not leave the event marked processed, and the redelivery reconciles once the local row exists', async () => {
    const eventId = `evt_unmatched_${uniq}`;
    const providerOrderId = `order_race_${uniq}`;
    const event = {
      event: 'payment.captured',
      id: eventId,
      payload: { payment: { entity: { id: `pay_race_${uniq}`, order_id: providerOrderId, amount: 12000 } } },
    };

    // The provider can deliver before our own create call has committed.
    const first = await sendWebhook(event);
    expect(first.status).toBe(200);
    expect(first.body.retryable).toBe(true);
    expect(await processedRows(eventId)).toBe(0);

    // The local row lands a moment later…
    const rowId = `late_${uniq}`;
    await pool.query(
      `INSERT INTO payment_orders (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id)
       VALUES ($1,$2,$3,12000,'INR','created','razorpay',$4)`,
      [rowId, shopId, custId, providerOrderId]
    );

    // …and the SAME event id, redelivered, now settles it.
    const second = await sendWebhook(event);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBeUndefined();
    const po = await pool.query('SELECT status FROM payment_orders WHERE id = $1', [rowId]);
    expect(po.rows[0].status).toBe('paid');
    expect(await balanceOf()).toBe(-12000); // a khata settlement, not an order
    expect(await processedRows(eventId)).toBe(1);
  });

  it('an event type this app does not handle STAYS deduped — retrying it could never help', async () => {
    const eventId = `evt_irrelevant_${uniq}`;
    const res = await sendWebhook({ event: 'payment.failed', id: eventId, payload: {} });
    expect(res.status).toBe(200);
    expect(await processedRows(eventId)).toBe(1);
  });
});

// ===========================================================================
// H1 — POST /my/orders had no idempotency key; a 2G retry double-charged.
// ===========================================================================
describe('H1 — order placement is idempotent on client_request_id', () => {
  const key = () => crypto.randomUUID();

  it('the same key twice creates ONE order and ONE purchase', async () => {
    const client_request_id = key();
    const body = {
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 2 }, { product_id: pUnit50, quantity: 3 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
      client_request_id,
    };

    const first = await placeOrder(body);
    expect(first.status).toBe(201);
    const second = await placeOrder(body);
    expect(second.status).toBe(201);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.replayed).toBe(true);
    expect(second.body.order.items).toHaveLength(2);

    const orders = await pool.query('SELECT id FROM orders WHERE shop_id = $1', [shopId]);
    expect(orders.rowCount).toBe(1);
    const purchases = (await txFor()).filter((t) => t.type === 'purchase');
    expect(purchases).toHaveLength(1);
    // Charged once, not twice.
    expect(await balanceOf()).toBe(35000);
  });

  it('two concurrent retries of the same key still create ONE order', async () => {
    const body = {
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
      client_request_id: key(),
    };
    const [a, b] = await Promise.all([placeOrder(body), placeOrder(body)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.order.id).toBe(b.body.order.id);
    expect((await pool.query('SELECT id FROM orders WHERE shop_id = $1', [shopId])).rowCount).toBe(1);
    expect(await balanceOf()).toBe(10000);
  });

  it('a PREPAID replay hands back the SAME pay link, never a second one', async () => {
    const body = {
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'prepaid',
      client_request_id: key(),
    };
    const first = await placeOrder(body);
    expect(first.status).toBe(201);
    const second = await placeOrder(body);
    expect(second.status).toBe(201);
    expect(second.body.pay_link).toBe(first.body.pay_link);
    expect(mockCreatePaymentLinkForShop).toHaveBeenCalledTimes(1);
    expect((await pool.query('SELECT id FROM payment_orders WHERE shop_id = $1', [shopId])).rowCount).toBe(1);
  });

  it('never hands a different customer at the same shop somebody else\'s order', async () => {
    const client_request_id = key();
    const mine = await placeOrder({
      shop_id: shopId,
      items: [{ product_id: pUnit100, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
      client_request_id,
    });
    expect(mine.status).toBe(201);

    // A different person at the same shop presenting the same id must NOT be
    // handed the first person's order — that is the defect the khata
    // idempotency key had, and it must not be reintroduced here.
    const otherPhone = toE164(`78${uniq}`);
    const theirs = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(otherPhone)}`)
      .send({
        shop_id: shopId,
        items: [{ product_id: pUnit50, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
        client_request_id,
      });
    expect(theirs.status).toBe(409);
    expect(theirs.body.details.code).toBe('client_request_id_conflict');
    expect(JSON.stringify(theirs.body)).not.toContain(mine.body.order.id);
    await pool.query('DELETE FROM customers WHERE shop_id = $1 AND phone = $2', [shopId, otherPhone]);
  });

  it('two DIFFERENT keys are two real orders (the key must not over-dedupe)', async () => {
    const base = {
      shop_id: shopId,
      items: [{ product_id: pUnit50, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
    };
    expect((await placeOrder({ ...base, client_request_id: key() })).status).toBe(201);
    expect((await placeOrder({ ...base, client_request_id: key() })).status).toBe(201);
    expect((await pool.query('SELECT id FROM orders WHERE shop_id = $1', [shopId])).rowCount).toBe(2);
    expect(await balanceOf()).toBe(10000);
  });
});

// ===========================================================================
// H2 — WhatsApp inbound marked the message processed before the ledger write and
// swallowed every failure, so a lost `add 500 Ramesh` was lost permanently and
// the owner was told nothing at all.
// ===========================================================================
describe('H2 — an inbound WhatsApp ledger write that fails is recoverable and reported', () => {
  const from = OWNER_PHONE.replace('+', ''); // Meta sends the number without '+'
  const payloadFor = (body, id) => ({
    entry: [{ changes: [{ value: { messages: [{ id, type: 'text', from, text: { body } }] } }] }],
  });

  it('unmarks the message and tells the owner when the write fails', async () => {
    const unmarked = [];
    const realQuery = pool.query.bind(pool);
    let poisoned = true;
    const spy = jest.spyOn(pool, 'query').mockImplementation((text, params) => {
      if (poisoned && typeof text === 'string' && text.includes('FROM users u')) {
        poisoned = false;
        return Promise.reject(new Error('simulated DB blip'));
      }
      return realQuery(text, params);
    });

    await whatsappInbound.handle(payloadFor('add 500 Ramesh', `wamid_fail_${uniq}`), {
      alreadyProcessed: async () => false,
      unmarkProcessed: async (id) => { unmarked.push(id); },
    });
    spy.mockRestore();

    // The provider is allowed to redeliver instead of being deduped away.
    expect(unmarked).toEqual([`wamid_fail_${uniq}`]);
    // And the owner is TOLD. Silence reads exactly like success.
    const replies = mockSendText.mock.calls.map((c) => c[1]).join('\n');
    expect(replies).toMatch(/could not record/i);
    expect(await txFor()).toHaveLength(0);
  });

  it('refuses a zero amount with a clear reply instead of writing a zero-amount row', async () => {
    await whatsappInbound.handle(payloadFor('add 0 Ramesh', `wamid_zero_${uniq}`), {
      alreadyProcessed: async () => false,
      unmarkProcessed: async () => {},
    });
    const replies = mockSendText.mock.calls.map((c) => c[1]).join('\n');
    expect(replies).toMatch(/more than ₹0/i);
    expect(await txFor()).toHaveLength(0);
    expect(await balanceOf()).toBe(0);
  });

  it('refuses an amount that would overflow the ledger column', async () => {
    await whatsappInbound.handle(payloadFor('add 99999999999999999999 Ramesh', `wamid_big_${uniq}`), {
      alreadyProcessed: async () => false,
      unmarkProcessed: async () => {},
    });
    const replies = mockSendText.mock.calls.map((c) => c[1]).join('\n');
    expect(replies).toMatch(/too large/i);
    expect(await txFor()).toHaveLength(0);
  });

  it('a good command still writes exactly one row (regression)', async () => {
    await whatsappInbound.handle(payloadFor('add 500 Ramesh', `wamid_ok_${uniq}`), {
      alreadyProcessed: async () => false,
      unmarkProcessed: async () => {},
    });
    const txs = await txFor();
    expect(txs).toHaveLength(1);
    expect(Number(txs[0].amount)).toBe(50000);
    expect(await balanceOf()).toBe(50000);
  });
});

// ===========================================================================
// H6 / H7 — the customer's phone number
// ===========================================================================
describe('H6 — a customer created with a local-format number is stored in E.164', () => {
  const local = `73${uniq}`; // plain 10-digit, exactly what an owner types
  let createdId;

  afterEach(async () => {
    if (createdId) await pool.query('DELETE FROM customers WHERE id = $1', [createdId]);
    createdId = null;
  });

  it('stores +91… on create, and the customer can then see their own khata', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Sunita Devi', phone: local });
    expect(res.status).toBe(201);
    createdId = res.body.customer.id;
    expect(res.body.customer.phone).toBe(toE164(local));

    // The consumer signs in as +91… — before the fix this was a 404 on their own
    // khata, and placing an order made a SECOND customer row at this shop.
    const khata = await request(app)
      .get(`/api/my/khata/${shopId}`)
      .set('Authorization', `Bearer ${customerToken(toE164(local))}`);
    expect(khata.status).toBe(200);
    expect(khata.body.customer_id).toBe(createdId);
  });

  it('normalises on update too', async () => {
    const made = await pool.query(
      `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Temp',$2) RETURNING id`,
      [shopId, toE164(`74${uniq}`)]
    );
    createdId = made.rows[0].id;
    const res = await request(app)
      .patch(`/api/customers/${createdId}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ phone: local });
    expect(res.status).toBe(200);
    expect(res.body.customer.phone).toBe(toE164(local));
  });
});

describe('H7 — a duplicate number on update is a 409, not a leaked constraint', () => {
  it('answers 409 duplicate_phone on BOTH create and update', async () => {
    const a = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Dup A', phone: `75${uniq}` });
    expect(a.status).toBe(201);
    const b = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Dup B', phone: `76${uniq}` });
    expect(b.status).toBe(201);

    const clash = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Dup C', phone: `75${uniq}` });
    expect(clash.status).toBe(409);
    expect(clash.body.details.code).toBe('duplicate_phone');

    const moved = await request(app)
      .patch(`/api/customers/${b.body.customer.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ phone: `75${uniq}` });
    expect(moved.status).toBe(409);
    expect(moved.body.details.code).toBe('duplicate_phone');
    // …and nothing of the database's own vocabulary reaches the client.
    expect(JSON.stringify(moved.body)).not.toMatch(/unique constraint|duplicate key/i);

    await pool.query('DELETE FROM customers WHERE id = ANY($1)', [[a.body.customer.id, b.body.customer.id]]);
  });
});

// ===========================================================================
// M1 — the transaction idempotency key was not bound to the entry it replays, so
// a reused key returned ANOTHER customer's row and dropped the caller's write.
// ===========================================================================
describe('M1 — a reused idempotency key with different contents is refused', () => {
  let otherId;
  beforeEach(async () => {
    const r = await pool.query(
      `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Other Person',$2) RETURNING id`,
      [shopId, toE164(`79${uniq}`)]
    );
    otherId = r.rows[0].id;
  });
  afterEach(async () => {
    if (otherId) await pool.query('DELETE FROM customers WHERE id = $1', [otherId]);
    otherId = null;
  });

  const post = (body) =>
    request(app).post('/api/transactions').set('Authorization', `Bearer ${ownerToken()}`).send(body);

  it('never hands back a different customer\'s transaction', async () => {
    const client_request_id = crypto.randomUUID();
    const first = await post({ customer_id: custId, type: 'purchase', amount: 1000, client_request_id });
    expect(first.status).toBe(201);

    const reused = await post({ customer_id: otherId, type: 'purchase', amount: 5000, client_request_id });
    expect(reused.status).toBe(409);
    expect(reused.body.details.code).toBe('client_request_id_conflict');
    expect(JSON.stringify(reused.body)).not.toContain(otherId);

    // The other customer's own write was NOT silently dropped into nowhere: it
    // simply never happened, and they are told so.
    expect(await balanceOf(otherId)).toBe(0);
    expect(await txFor(otherId)).toHaveLength(0);
  });

  it('refuses a reused key with the same customer but a different amount', async () => {
    const client_request_id = crypto.randomUUID();
    expect((await post({ customer_id: custId, type: 'purchase', amount: 1000, client_request_id })).status).toBe(201);
    const reused = await post({ customer_id: custId, type: 'purchase', amount: 9999, client_request_id });
    expect(reused.status).toBe(409);
    expect(await balanceOf()).toBe(1000);
  });

  it('a GENUINE replay still succeeds and applies the money exactly once', async () => {
    const client_request_id = crypto.randomUUID();
    const body = { customer_id: custId, type: 'purchase', amount: 1000, client_request_id };
    const first = await post(body);
    const second = await post(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.transaction.id).toBe(first.body.transaction.id);
    expect(await balanceOf()).toBe(1000);
    expect(await txFor()).toHaveLength(1);
  });
});
