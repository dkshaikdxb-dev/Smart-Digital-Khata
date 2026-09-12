// EDIT THE ORDER WHILE ACCEPTING (batch C) — the owner reduces an order the
// shop cannot fully supply, and the money follows.
//
// THIS BATCH TOUCHES MONEY, so the assertions below are deliberately about
// PAISE and about what is NOT written, not just about status codes:
//
//   1. credit  — the balance drops by exactly the reduction, ONE 'adjustment'
//                row is posted with order_id set, and the ORIGINAL purchase row
//                is byte-for-byte untouched (the ledger is append-only);
//   2. prepaid — the same adjustment drives the balance NEGATIVE, i.e. the
//                difference becomes an ADVANCE at this shop; payment_orders is
//                untouched and no refund call is made;
//   3. cash    — the totals change and NO transaction exists at all;
//   4. every refusal writes NOTHING: an increase, an unknown line, another
//      order's line, emptying the order, a non-editable status, another shop;
//   5. idempotency — the same client_request_id twice moves the money ONCE;
//   6. the delivery fee is recomputed by the SAME rule createOrder uses;
//   7. concurrency — two simultaneous edits do not double-apply;
//   8. the widened CHECK is a non-event for every aggregate: the digest and the
//      analytics numbers are identical with an 'adjustment' row present.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0068).
// WhatsApp is mocked, so nothing here touches the network.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));

// Razorpay is mocked to a hard failure on every call: if ANY code path in this
// batch tried to refund or re-charge, these tests would fail loudly rather than
// quietly hitting a stub that says yes.
const mockRefund = jest.fn(async () => { throw new Error('no refund pipeline exists'); });
jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: jest.fn(async () => { throw new Error('unexpected razorpay call'); }),
  createPaymentLinkForShop: jest.fn(async () => { throw new Error('unexpected razorpay call'); }),
  refund: (...a) => mockRefund(...a),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const orderEdit = require('../src/utils/orderEdit');
const copy = require('../src/utils/order-customer-copy');

const uniq = Date.now().toString().slice(-9);
const OWNER_PHONE = toE164(`63${uniq}`);
const CUST_PHONE = toE164(`64${uniq}`);
const OTHER_OWNER_PHONE = toE164(`65${uniq}`);
const OTHER_CUST_PHONE = toE164(`66${uniq}`);

let shopId, ownerId, custId;
let otherShopId, otherOwnerId, otherCustId;

function ownerToken(sid, sub) {
  return jwt.sign({ sub: sub || ownerId, role: 'owner', shopId: sid || shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

/**
 * Build an order directly with two lines: Atta 2 × ₹100 and Dal 3 × ₹50.
 * subtotal = 20000 + 15000 = 35000 paise. The consumer create path is covered
 * by my.test/orders.test; what this file cares about is the reduction.
 */
async function makeOrder({
  shop = shopId, customer = custId, status = 'pending',
  paymentMode = 'cash', paymentStatus = 'pending',
  fulfillment = 'pickup', deliveryFee = 0,
  lines = [
    { name: 'Atta 1kg', unit_price: 10000, quantity: 2, line_total: 20000 },
    { name: 'Dal 1kg', unit_price: 5000, quantity: 3, line_total: 15000 },
  ],
} = {}) {
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const r = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status,
                         subtotal, delivery_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [shop, customer, status, fulfillment, paymentMode, paymentStatus, subtotal, deliveryFee]
  );
  const id = r.rows[0].id;
  const items = [];
  for (const l of lines) {
    const li = await pool.query(
      `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total, weight_grams)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, l.name, l.unit_price, l.quantity, l.line_total, l.weight_grams || null]
    );
    items.push(li.rows[0]);
  }
  return { id, items, subtotal, deliveryFee };
}

/** The khata purchase a CREDIT order would have created, posted the same way. */
async function postOrderPurchase(orderId, customerId, amount) {
  const r = await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
     VALUES ($1,$2,'purchase',$3,'credit',$4,'api') RETURNING *`,
    [shopId, customerId, amount, `Order ${orderId}`]
  );
  await pool.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [amount, customerId]);
  return r.rows[0];
}

const orderRow = async (id) => (await pool.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
const itemRows = async (id) => (await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY name', [id])).rows;
const editRows = async (id) => (await pool.query('SELECT * FROM order_edits WHERE order_id = $1 ORDER BY name', [id])).rows;
const txRows = async (cid) => (await pool.query('SELECT * FROM transactions WHERE customer_id = $1 ORDER BY created_at, id', [cid])).rows;
const balance = async (cid) => Number((await pool.query('SELECT balance FROM customers WHERE id = $1', [cid])).rows[0].balance);

function patchItems(id, body, token) {
  return request(app)
    .patch(`/api/orders/${id}/items`)
    .set('Authorization', `Bearer ${token || ownerToken()}`)
    .send(body);
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Edit Owner', `edit_owner_${uniq}@test.local`, OWNER_PHONE]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_pickup, offers_delivery, delivery_fee, free_delivery_min)
     VALUES ($1,'Edit Kirana', true, true, 4000, 30000) RETURNING id`,
    [ownerId]
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Ramesh Kumar',$2) RETURNING id`,
    [shopId, CUST_PHONE]
  );
  custId = cust.rows[0].id;

  // A SECOND shop, so cross-shop scoping is a real assertion and not a guess.
  const o2 = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Other Owner', `edit_other_${uniq}@test.local`, OTHER_OWNER_PHONE]
  );
  otherOwnerId = o2.rows[0].id;
  const s2 = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,'Other Kirana') RETURNING id`,
    [otherOwnerId]
  );
  otherShopId = s2.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [otherShopId, otherOwnerId]);
  const c2 = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Other Customer',$2) RETURNING id`,
    [otherShopId, OTHER_CUST_PHONE]
  );
  otherCustId = c2.rows[0].id;
});

afterAll(async () => {
  for (const sid of [shopId, otherShopId]) if (sid) await pool.query('DELETE FROM shops WHERE id = $1', [sid]);
  for (const uid of [ownerId, otherOwnerId]) if (uid) await pool.query('DELETE FROM users WHERE id = $1', [uid]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM orders WHERE shop_id = ANY($1)', [[shopId, otherShopId]]);
  await pool.query('DELETE FROM transactions WHERE customer_id = ANY($1)', [[custId, otherCustId]]);
  await pool.query('UPDATE customers SET balance = 0, credit_limit = 0 WHERE id = ANY($1)', [[custId, otherCustId]]);
  mockSendText.mockClear();
  mockRefund.mockClear();
});

// ---------------------------------------------------------------------------
// 1. CREDIT — the khata already holds the original total.
// ---------------------------------------------------------------------------

describe('credit order: one compensating adjustment, original purchase untouched', () => {
  it('drops the totals, posts ONE adjustment, and lowers the balance by exactly the reduction', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    const purchase = await postOrderPurchase(ord.id, custId, ord.subtotal);
    expect(await balance(custId)).toBe(35000);

    // Remove the Dal line entirely (3 × ₹50 = ₹150) and halve the Atta line
    // (2 -> 1, −₹100). Reduction = 25000 paise.
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    const atta = ord.items.find((i) => i.name.startsWith('Atta'));
    const res = await patchItems(ord.id, {
      lines: [{ order_item_id: dal.id, qty: 0 }, { order_item_id: atta.id, qty: 1 }],
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.order.subtotal)).toBe(10000);
    expect(Number(res.body.order.total)).toBe(10000);

    const row = await orderRow(ord.id);
    expect(Number(row.subtotal)).toBe(10000);
    expect(Number(row.original_subtotal)).toBe(35000);
    expect(row.edited_at).toBeTruthy();
    expect(row.edited_by).toBe(ownerId);

    // The lines themselves.
    const items = await itemRows(ord.id);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Atta 1kg');
    expect(Number(items[0].quantity)).toBe(1);
    expect(Number(items[0].line_total)).toBe(10000);

    // EXACTLY ONE adjustment, linked to the order, for the exact reduction.
    const txs = await txRows(custId);
    const adjustments = txs.filter((t) => t.type === 'adjustment');
    expect(adjustments).toHaveLength(1);
    expect(Number(adjustments[0].amount)).toBe(25000);
    expect(adjustments[0].method).toBe('adjustment');
    expect(adjustments[0].order_id).toBe(ord.id);
    expect(adjustments[0].created_by).toBe(ownerId);

    // THE LEDGER IS APPEND-ONLY: the original purchase row is unchanged.
    const stillThere = txs.find((t) => t.id === purchase.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere.type).toBe('purchase');
    expect(Number(stillThere.amount)).toBe(35000);
    expect(stillThere.created_at.getTime()).toBe(purchase.created_at.getTime());

    // The balance moved by exactly the reduction, no more and no less.
    expect(await balance(custId)).toBe(35000 - 25000);

    // The audit: one row per changed line, both negative.
    const edits = await editRows(ord.id);
    expect(edits).toHaveLength(2);
    const byName = Object.fromEntries(edits.map((e) => [e.name, e]));
    expect(byName['Atta 1kg']).toMatchObject({ qty_before: 2, qty_after: 1 });
    expect(Number(byName['Atta 1kg'].amount_delta)).toBe(-10000);
    expect(byName['Dal 1kg']).toMatchObject({ qty_before: 3, qty_after: 0 });
    expect(Number(byName['Dal 1kg'].amount_delta)).toBe(-15000);
    for (const e of edits) expect(e.edited_by).toBe(ownerId);
  });

  it('tells the customer what changed, with the new total', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));

    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });

    expect(mockSendText).toHaveBeenCalledTimes(1);
    const [phone, msg] = mockSendText.mock.calls[0];
    expect(phone).toBe(CUST_PHONE);
    expect(msg).toContain('Dal 1kg');
    expect(msg).toContain('₹200.00');  // the new total
    expect(msg).toContain('₹150.00');  // what came off the khata
    expect(msg).toMatch(/khata/i);
    // Never promises money back that is not coming.
    expect(msg).not.toMatch(/refund/i);
  });

  it('snapshots original_subtotal on the FIRST edit only', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const [atta, dal] = [ord.items.find((i) => i.name.startsWith('Atta')), ord.items.find((i) => i.name.startsWith('Dal'))];

    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 1 }] });
    const first = await orderRow(ord.id);
    expect(Number(first.original_subtotal)).toBe(35000);

    await patchItems(ord.id, { lines: [{ order_item_id: atta.id, qty: 1 }] });
    const second = await orderRow(ord.id);
    // Still the ORIGINAL 35000, not the 25000 the second edit started from.
    expect(Number(second.original_subtotal)).toBe(35000);
    expect(Number(second.subtotal)).toBe(15000);
    expect(await balance(custId)).toBe(15000);
    expect((await editRows(ord.id))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. PREPAID — already paid online; the difference becomes an ADVANCE.
// ---------------------------------------------------------------------------

describe('prepaid order: the difference becomes an advance, never a refund', () => {
  it('posts the adjustment, drives the balance negative, and touches no payment_orders row', async () => {
    const ord = await makeOrder({ paymentMode: 'prepaid', paymentStatus: 'paid' });
    const po = await pool.query(
      `INSERT INTO payment_orders (id, shop_id, customer_id, amount, status, provider, order_id, paid_at)
       VALUES ($1,$2,$3,$4,'paid','razorpay',$5,NOW()) RETURNING *`,
      [`po_edit_${uniq}`, shopId, custId, ord.subtotal, ord.id]
    );
    expect(await balance(custId)).toBe(0);

    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    const res = await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });
    expect(res.status).toBe(200);

    // The balance is NEGATIVE by exactly the reduction: an advance at this shop,
    // using the mechanism the consumer pre-pay flow already proves.
    expect(await balance(custId)).toBe(-15000);

    const adjustments = (await txRows(custId)).filter((t) => t.type === 'adjustment');
    expect(adjustments).toHaveLength(1);
    expect(Number(adjustments[0].amount)).toBe(15000);
    expect(adjustments[0].order_id).toBe(ord.id);

    // The payment row is exactly as it was — not reversed, not re-amounted.
    const after = await pool.query('SELECT * FROM payment_orders WHERE id = $1', [po.rows[0].id]);
    expect(after.rows[0]).toEqual(po.rows[0]);

    // And NOTHING called a refund.
    expect(mockRefund).not.toHaveBeenCalled();

    // The customer is told plainly that it is credit at the shop.
    const msg = mockSendText.mock.calls[0][1];
    expect(msg).toMatch(/credit at/i);
    expect(msg).not.toMatch(/refund/i);
  });
});

// ---------------------------------------------------------------------------
// 3. CASH — nothing was ever posted, so nothing is posted now.
// ---------------------------------------------------------------------------

describe('cash order: totals change, NO transaction is created at all', () => {
  it('writes no ledger row and leaves the balance alone', async () => {
    const ord = await makeOrder({ paymentMode: 'cash', paymentStatus: 'pending' });
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));

    const res = await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });
    expect(res.status).toBe(200);
    expect(Number(res.body.order.subtotal)).toBe(20000);
    expect(res.body.adjustment).toBeNull();

    expect(await txRows(custId)).toHaveLength(0);
    expect(await balance(custId)).toBe(0);
    // The audit still happened — a cash edit is no less auditable.
    expect(await editRows(ord.id)).toHaveLength(1);

    // …and the customer is told what to pay on hand-over instead.
    const msg = mockSendText.mock.calls[0][1];
    expect(msg).toContain('₹200.00');
  });
});

// ---------------------------------------------------------------------------
// 4. REFUSALS — every one of them writes NOTHING.
// ---------------------------------------------------------------------------

describe('refusals write nothing', () => {
  async function expectUntouched(ord, balanceBefore = 0) {
    const row = await orderRow(ord.id);
    expect(Number(row.subtotal)).toBe(ord.subtotal);
    expect(row.edited_at).toBeNull();
    expect(row.original_subtotal).toBeNull();
    expect(await editRows(ord.id)).toHaveLength(0);
    expect((await txRows(custId)).filter((t) => t.type === 'adjustment')).toHaveLength(0);
    expect(await balance(custId)).toBe(balanceBefore);
    const items = await itemRows(ord.id);
    expect(items).toHaveLength(ord.items.length);
  }

  it('422 increase_not_allowed for a qty ABOVE the current one', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const atta = ord.items.find((i) => i.name.startsWith('Atta'));

    const res = await patchItems(ord.id, { lines: [{ order_item_id: atta.id, qty: 5 }] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('increase_not_allowed');
    await expectUntouched(ord, 35000);
  });

  it('422 increase_not_allowed even when another line in the same request is a reduction', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const [atta, dal] = [ord.items.find((i) => i.name.startsWith('Atta')), ord.items.find((i) => i.name.startsWith('Dal'))];

    const res = await patchItems(ord.id, {
      lines: [{ order_item_id: dal.id, qty: 0 }, { order_item_id: atta.id, qty: 9 }],
    });
    expect(res.status).toBe(422);
    await expectUntouched(ord);
  });

  it('404 line_not_found for an unknown order_item_id', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const res = await patchItems(ord.id, {
      lines: [{ order_item_id: '11111111-1111-4111-8111-111111111111', qty: 0 }],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('line_not_found');
    await expectUntouched(ord);
  });

  it('404 line_not_found for a line belonging to ANOTHER order', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const other = await makeOrder({ paymentMode: 'cash' });
    const res = await patchItems(ord.id, { lines: [{ order_item_id: other.items[0].id, qty: 0 }] });
    expect(res.status).toBe(404);
    await expectUntouched(ord);
    // The other order is untouched too.
    expect(await itemRows(other.id)).toHaveLength(2);
  });

  it('422 cancel_instead when every line would go to zero', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const res = await patchItems(ord.id, {
      lines: ord.items.map((i) => ({ order_item_id: i.id, qty: 0 })),
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('cancel_instead');
    await expectUntouched(ord, 35000);
  });

  it('404 for another shop\'s order — never 403', async () => {
    const ord = await makeOrder({ shop: otherShopId, customer: otherCustId, paymentMode: 'cash' });
    const res = await patchItems(ord.id, { lines: [{ order_item_id: ord.items[0].id, qty: 0 }] });
    expect(res.status).toBe(404);
    expect(await editRows(ord.id)).toHaveLength(0);
    expect(await itemRows(ord.id)).toHaveLength(2);
  });

  it('400 on a malformed body (no lines, a negative qty, a non-uuid line)', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    for (const body of [
      {},
      { lines: [] },
      { lines: [{ order_item_id: ord.items[0].id, qty: -1 }] },
      { lines: [{ order_item_id: 'not-a-uuid', qty: 0 }] },
      { lines: [{ order_item_id: ord.items[0].id, qty: 1.5 }] },
    ]) {
      const res = await patchItems(ord.id, body);
      expect(res.status).toBe(400);
    }
    await expectUntouched(ord);
  });
});

// ---------------------------------------------------------------------------
// 5. STATUS GATE
// ---------------------------------------------------------------------------

describe('status gate', () => {
  it('is editable in pending and accepted', async () => {
    for (const status of ['pending', 'accepted']) {
      const ord = await makeOrder({ paymentMode: 'cash', status });
      const res = await patchItems(ord.id, { lines: [{ order_item_id: ord.items[0].id, qty: 1 }] });
      expect(res.status).toBe(200);
    }
  });

  it('409 order_not_editable once the goods are being assembled or the order is done', async () => {
    for (const status of ['preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']) {
      const ord = await makeOrder({ paymentMode: 'cash', status });
      const res = await patchItems(ord.id, { lines: [{ order_item_id: ord.items[0].id, qty: 0 }] });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('order_not_editable');
      expect(await editRows(ord.id)).toHaveLength(0);
      expect(await itemRows(ord.id)).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. IDEMPOTENCY + CONCURRENCY — the money applies exactly once.
// ---------------------------------------------------------------------------

describe('idempotency and concurrency', () => {
  it('the same client_request_id twice applies the money ONCE', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    const key = '22222222-2222-4222-8222-222222222222';
    const body = { lines: [{ order_item_id: dal.id, qty: 0 }], client_request_id: key };

    const first = await patchItems(ord.id, body);
    expect(first.status).toBe(200);
    expect(first.body.replayed).toBe(false);

    const second = await patchItems(ord.id, body);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(Number(second.body.order.subtotal)).toBe(20000);

    expect((await txRows(custId)).filter((t) => t.type === 'adjustment')).toHaveLength(1);
    expect(await balance(custId)).toBe(20000);
    expect(await editRows(ord.id)).toHaveLength(1);
    // The replay sends no second "your order was reduced" message.
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });

  it('two concurrent edits of the same order do not double-apply', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    const body = { lines: [{ order_item_id: dal.id, qty: 0 }] };

    const [a, b] = await Promise.all([patchItems(ord.id, body), patchItems(ord.id, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);

    // The row lock serialised them: the first removed the line, the second then
    // found no such line at all and was refused. Exactly ONE reduction landed.
    expect((await txRows(custId)).filter((t) => t.type === 'adjustment')).toHaveLength(1);
    expect(await balance(custId)).toBe(20000);
    expect(Number((await orderRow(ord.id)).subtotal)).toBe(20000);
    expect(await editRows(ord.id)).toHaveLength(1);
  });

  it('a request that changes nothing writes nothing and notifies nobody', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const atta = ord.items.find((i) => i.name.startsWith('Atta'));

    const res = await patchItems(ord.id, { lines: [{ order_item_id: atta.id, qty: 2 }] });
    expect(res.status).toBe(200);
    expect(Number(res.body.order.subtotal)).toBe(35000);
    expect(await editRows(ord.id)).toHaveLength(0);
    expect((await orderRow(ord.id)).edited_at).toBeNull();
    expect(await balance(custId)).toBe(35000);
    expect(mockSendText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. DELIVERY FEE — recomputed by the SAME rule createOrder uses.
// ---------------------------------------------------------------------------

describe('delivery fee recomputation', () => {
  // The shop: flat fee ₹40, free over ₹300.
  it('re-adds the fee when the reduction drops the order back under free_delivery_min', async () => {
    // ₹350 of goods, delivered free.
    const ord = await makeOrder({
      paymentMode: 'credit', paymentStatus: 'not_required',
      fulfillment: 'delivery', deliveryFee: 0,
      lines: [
        { name: 'Rice 5kg', unit_price: 25000, quantity: 1, line_total: 25000 },
        { name: 'Oil 1L', unit_price: 10000, quantity: 1, line_total: 10000 },
      ],
    });
    await postOrderPurchase(ord.id, custId, ord.subtotal); // 35000, fee 0

    const oil = ord.items.find((i) => i.name.startsWith('Oil'));
    const res = await patchItems(ord.id, { lines: [{ order_item_id: oil.id, qty: 0 }] });
    expect(res.status).toBe(200);

    const row = await orderRow(ord.id);
    expect(Number(row.subtotal)).toBe(25000);
    // Under ₹300 again → the shop's flat ₹40 applies once more.
    expect(Number(row.delivery_fee)).toBe(4000);
    expect(Number(res.body.order.total)).toBe(29000);

    // The reduction posted is the TOTAL difference, fee included: 35000 - 29000.
    const adj = (await txRows(custId)).filter((t) => t.type === 'adjustment');
    expect(adj).toHaveLength(1);
    expect(Number(adj[0].amount)).toBe(6000);
    expect(await balance(custId)).toBe(35000 - 6000);
  });

  it('waives the fee when the order is still over the threshold, and leaves pickup free', async () => {
    const ord = await makeOrder({
      paymentMode: 'cash', fulfillment: 'delivery', deliveryFee: 0,
      lines: [
        { name: 'Rice 5kg', unit_price: 25000, quantity: 2, line_total: 50000 },
        { name: 'Oil 1L', unit_price: 10000, quantity: 1, line_total: 10000 },
      ],
    });
    const oil = ord.items.find((i) => i.name.startsWith('Oil'));
    await patchItems(ord.id, { lines: [{ order_item_id: oil.id, qty: 0 }] });
    const row = await orderRow(ord.id);
    expect(Number(row.subtotal)).toBe(50000);
    expect(Number(row.delivery_fee)).toBe(0); // still over ₹300

    const pick = await makeOrder({ paymentMode: 'cash', fulfillment: 'pickup' });
    await patchItems(pick.id, { lines: [{ order_item_id: pick.items[0].id, qty: 1 }] });
    expect(Number((await orderRow(pick.id)).delivery_fee)).toBe(0);
  });

  it('does NOT re-enforce delivery_min_order on an order that already exists', async () => {
    await pool.query('UPDATE shops SET delivery_min_order = 30000 WHERE id = $1', [shopId]);
    try {
      const ord = await makeOrder({ paymentMode: 'cash', fulfillment: 'delivery', deliveryFee: 4000 });
      const dal = ord.items.find((i) => i.name.startsWith('Dal'));
      const res = await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });
      // 20000 is well under the ₹300 delivery minimum, and it is still fine:
      // the shop has already chosen to serve this order.
      expect(res.status).toBe(200);
      expect(Number((await orderRow(ord.id)).subtotal)).toBe(20000);
    } finally {
      await pool.query('UPDATE shops SET delivery_min_order = 0 WHERE id = $1', [shopId]);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. THE WIDENED CHECK IS A NON-EVENT FOR EVERY AGGREGATE.
// ---------------------------------------------------------------------------

describe('widened transactions CHECK: the aggregates are unchanged', () => {
  it('accepts adjustment/adjustment and still rejects an unknown type or method', async () => {
    await expect(pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method) VALUES ($1,$2,'adjustment',100,'adjustment')`,
      [shopId, custId]
    )).resolves.toBeTruthy();
    await expect(pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method) VALUES ($1,$2,'refund',100,'cash')`,
      [shopId, custId]
    )).rejects.toThrow();
    await expect(pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method) VALUES ($1,$2,'cash',100,'bank')`,
      [shopId, custId]
    )).rejects.toThrow();
  });

  it('purchases and collections give the SAME numbers with an adjustment row present', async () => {
    const sums = async () => (await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type='purchase' THEN amount END),0)::bigint AS purchases,
              COALESCE(SUM(CASE WHEN type IN ('cash','upi') THEN amount END),0)::bigint AS collections
         FROM transactions WHERE shop_id = $1`,
      [shopId]
    )).rows[0];

    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'purchase',50000,'credit','api'), ($1,$2,'cash',20000,'cash','api')`,
      [shopId, custId]
    );
    const before = await sums();
    expect(Number(before.purchases)).toBe(50000);
    expect(Number(before.collections)).toBe(20000);

    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'adjustment',7777,'adjustment','api')`,
      [shopId, custId]
    );
    const after = await sums();
    expect(after).toEqual(before);
  });

  it('the owner analytics overview is identical with an adjustment present', async () => {
    const tok = `Bearer ${ownerToken()}`;
    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'purchase',60000,'credit','api'), ($1,$2,'upi',15000,'upi','api')`,
      [shopId, custId]
    );
    const before = await request(app).get('/api/analytics/overview?days=30').set('Authorization', tok);
    expect(before.status).toBe(200);

    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'adjustment',9999,'adjustment','api')`,
      [shopId, custId]
    );
    const after = await request(app).get('/api/analytics/overview?days=30').set('Authorization', tok);
    expect(after.body.purchases).toBe(before.body.purchases);
    expect(after.body.collections).toBe(before.body.collections);
    expect(after.body.collection_rate).toBe(before.body.collection_rate);
  });

  it('a statement counts an adjustment on its own line, never as money the customer paid', async () => {
    const { buildStatement } = require('../src/utils/statement');
    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'purchase',40000,'credit','api'), ($1,$2,'cash',10000,'cash','api'),
              ($1,$2,'adjustment',5000,'adjustment','api')`,
      [shopId, custId]
    );
    const today = new Date().toISOString().slice(0, 10);
    const st = await buildStatement(custId, today, today);
    expect(st.total_purchases).toBe(40000);
    expect(st.total_paid).toBe(10000);        // NOT 15000
    expect(st.total_adjusted).toBe(5000);
    // The balance math is unchanged: an adjustment lowers it like a payment.
    expect(st.closing).toBe(40000 - 10000 - 5000);
  });
});

// ---------------------------------------------------------------------------
// 9. THE PAYLOADS — owner and consumer both carry the audit.
// ---------------------------------------------------------------------------

describe('payloads', () => {
  it('the owner order detail carries the edit history with WHO made it', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 1 }] });

    const res = await request(app).get(`/api/orders/${ord.id}`).set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.order.edits).toHaveLength(1);
    expect(res.body.order.edits[0]).toMatchObject({ name: 'Dal 1kg', qty_before: 3, qty_after: 1 });
    expect(res.body.order.edits[0].edited_by_name).toBe('Edit Owner');
    expect(res.body.order.edited_at).toBeTruthy();
    expect(Number(res.body.order.original_subtotal)).toBe(35000);
  });

  it('an untouched order still carries an EMPTY edits array', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const res = await request(app).get(`/api/orders/${ord.id}`).set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.body.order.edits).toEqual([]);
    expect(res.body.order.edited_at).toBeNull();
  });

  it('the consumer order detail explains the change, without naming the staff member', async () => {
    const ord = await makeOrder({ paymentMode: 'cash' });
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });

    const res = await request(app)
      .get(`/api/my/orders/${ord.id}`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`);
    expect(res.status).toBe(200);
    expect(res.body.order.edits).toHaveLength(1);
    expect(res.body.order.edits[0]).toMatchObject({ name: 'Dal 1kg', qty_before: 3, qty_after: 0 });
    expect(res.body.order.edits[0].edited_by).toBeUndefined();
    expect(res.body.order.edits[0].edited_by_name).toBeUndefined();
    expect(Number(res.body.order.total)).toBe(20000);
    expect(Number(res.body.order.original_subtotal)).toBe(35000);
    // A CASH order never posts a ledger row, so the adjusted figure is 0 and the
    // screen falls back to "pay this instead" rather than claiming a khata move.
    expect(res.body.order.adjusted_total).toBe(0);
  });

  it('the consumer payload carries the EXACT paise the khata moved by', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });

    const res = await request(app)
      .get(`/api/my/orders/${ord.id}`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`);
    // The figure the customer reads is the ledger's, not one derived from
    // subtotals — so it stays right even when a delivery fee moved with it.
    expect(res.body.order.adjusted_total).toBe(15000);
  });

  it('the adjustment shows up on the consumer khata with its own type', async () => {
    const ord = await makeOrder({ paymentMode: 'credit', paymentStatus: 'not_required' });
    await postOrderPurchase(ord.id, custId, ord.subtotal);
    const dal = ord.items.find((i) => i.name.startsWith('Dal'));
    await patchItems(ord.id, { lines: [{ order_item_id: dal.id, qty: 0 }] });

    const res = await request(app)
      .get(`/api/my/khata/${shopId}`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`);
    expect(res.status).toBe(200);
    const types = res.body.transactions.map((t) => t.type);
    expect(types).toContain('adjustment');
    expect(Number(res.body.balance)).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// 10. THE SHARED HELPER — the rule itself, tested without a database.
// ---------------------------------------------------------------------------

describe('utils/orderEdit (pure)', () => {
  const items = [
    { id: 'a', name: 'Atta', unit_price: 10000, quantity: 2, line_total: 20000, weight_grams: null },
    { id: 'b', name: 'Rice loose', unit_price: 6000, quantity: 1, line_total: 1500, weight_grams: 250 },
  ];

  it('computes the new totals and the per-line audit', () => {
    const plan = orderEdit.planReduction(items, [{ order_item_id: 'a', qty: 1 }]);
    expect(plan.newSubtotal).toBe(11500);
    expect(plan.subtotalDelta).toBe(-10000);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].amount_delta).toBe(-10000);
  });

  it('never recomputes a WEIGHED line from its per-kg price', () => {
    // Removing the weighed line takes off its stored ₹15, not 250 × ₹60.
    const plan = orderEdit.planReduction(items, [{ order_item_id: 'b', qty: 0 }]);
    expect(plan.newSubtotal).toBe(20000);
    expect(plan.changes[0].amount_delta).toBe(-1500);
  });

  it('refuses an increase, a duplicate and an unknown line', () => {
    expect(() => orderEdit.planReduction(items, [{ order_item_id: 'a', qty: 3 }]))
      .toThrow('increase_not_allowed');
    expect(() => orderEdit.planReduction(items, [{ order_item_id: 'a', qty: 1 }, { order_item_id: 'a', qty: 0 }]))
      .toThrow('duplicate_line');
    expect(() => orderEdit.planReduction(items, [{ order_item_id: 'zz', qty: 0 }]))
      .toThrow('line_not_found');
    expect(() => orderEdit.planReduction(items, items.map((i) => ({ order_item_id: i.id, qty: 0 }))))
      .toThrow('cancel_instead');
  });

  it('applies the same delivery-fee rule the order was created with', () => {
    const shop = { delivery_fee: 4000, free_delivery_min: 30000 };
    expect(orderEdit.deliveryFeeFor({ fulfillmentType: 'pickup', subtotal: 100, shop })).toBe(0);
    expect(orderEdit.deliveryFeeFor({ fulfillmentType: 'delivery', subtotal: 29999, shop })).toBe(4000);
    expect(orderEdit.deliveryFeeFor({ fulfillmentType: 'delivery', subtotal: 30000, shop })).toBe(0);
    // No threshold configured → the flat fee always applies.
    expect(orderEdit.deliveryFeeFor({ fulfillmentType: 'delivery', subtotal: 999999, shop: { delivery_fee: 4000, free_delivery_min: null } })).toBe(4000);
  });

  it('knows which payment modes carry a khata entry to compensate', () => {
    expect(orderEdit.needsLedgerAdjustment('credit')).toBe(true);
    expect(orderEdit.needsLedgerAdjustment('prepaid')).toBe(true);
    expect(orderEdit.needsLedgerAdjustment('cash')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. THE CUSTOMER COPY — en + hi authored, honest English fallback.
// ---------------------------------------------------------------------------

describe('customer copy for a reduced order', () => {
  const base = {
    customerName: 'Ramesh', shopName: 'Edit Kirana',
    changes: [{ name: 'Dal 1kg', qty_before: 3, qty_after: 0 }, { name: 'Atta 1kg', qty_before: 2, qty_after: 1 }],
    oldTotal: 35000, newTotal: 10000, reduction: 25000,
  };

  it('names every changed line and both totals', () => {
    const msg = copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'credit' });
    expect(msg).toContain('Dal 1kg');
    expect(msg).toContain('Atta 1kg');
    expect(msg).toContain('2 → 1'); // the reduced line, before → after
    expect(msg).toContain('₹100.00');
    expect(msg).toContain('₹350.00');
  });

  it('is authored in Hindi', () => {
    const hi = copy.buildOrderEditMessage({ ...base, lang: 'hi', paymentMode: 'credit' });
    expect(hi).toMatch(/[ऀ-ॿ]/);
    expect(hi).not.toBe(copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'credit' }));
    // The amounts stay in Latin digits whatever the language.
    expect(hi).toContain('₹100.00');
  });

  it('falls back to English for an unauthored language rather than machine-translating', () => {
    const ta = copy.buildOrderEditMessage({ ...base, lang: 'ta', paymentMode: 'credit' });
    expect(ta).toBe(copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'credit' }));
  });

  it('says "credit at the shop" for prepaid and "pay this instead" for cash', () => {
    const prepaid = copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'prepaid' });
    expect(prepaid).toMatch(/credit at Edit Kirana/i);
    expect(prepaid).not.toMatch(/refund/i);

    const cash = copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'cash' });
    expect(cash).toMatch(/Please pay ₹100\.00 instead of ₹350\.00/);
  });

  it('mentions the delivery fee only when it actually moved', () => {
    const moved = copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'cash', oldFee: 0, newFee: 4000 });
    expect(moved).toMatch(/Delivery fee is now ₹40\.00/);
    const still = copy.buildOrderEditMessage({ ...base, lang: 'en', paymentMode: 'cash', oldFee: 0, newFee: 0 });
    expect(still).not.toMatch(/Delivery fee/);
  });

  it('omits the money line entirely when there is nothing to give back', () => {
    const none = copy.buildOrderEditMessage({
      ...base, lang: 'en', paymentMode: 'credit', newTotal: 35000, reduction: 0,
    });
    expect(none).not.toMatch(/taken off your khata/);
    expect(none).toContain('Dal 1kg');
  });
});
