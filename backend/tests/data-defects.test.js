// THE HIGH-SEVERITY DATA + REPORTING DEFECTS (batch DATA).
//
// Every test here was written to FAIL on the code as it stood, with the exact
// failing input the forensic audit recorded:
//
//   D1  a listed shop with no catalogue was published as a store with "0 items"
//   D2  `shops.status = 'suspended'` changed nothing at all
//   D3  "total outstanding" summed only the top 200 debtors, in JavaScript
//   D4  every "sales on credit" figure counted orders that were fully reversed
//   D5  three query parameters 500'd with raw Postgres text
//   D6  two unbounded money-path lookups had no index
//   D7  a prepaid order could be COMPLETED without ever being paid
//   D8  an inbound WhatsApp number mapping to two shops picked one at random
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations applied. WhatsApp
// and Razorpay are mocked, so nothing here touches the network.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));

jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: jest.fn(async () => ({ id: 'order_mock', receipt: `rcpt_${Date.now()}` })),
  createPaymentLinkForShop: jest.fn(async () => ({ id: 'plink_mock', short_url: 'https://pay.example/x' })),
  keyIdForShop: jest.fn(async () => 'rzp_test_mock'),
  cancelPaymentLink: jest.fn(async () => ({ ok: true })),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const notifier = require('../src/services/notification.service');
const { computeWeeklyForShop } = require('../src/services/weekly-summary.service');
const waInbound = require('../src/services/whatsapp-inbound.service');

const uniq = Date.now().toString().slice(-9);
const CITY = `Dataville${uniq}`;

let phoneSeq = 0;
const nextPhone = () => toE164(`9${uniq.slice(-6)}${String(phoneSeq++).padStart(3, '0')}`);

// The shop everything money-shaped happens on.
let shopId; let ownerId; let custId; let custPhone;
// D1/D2 directory fixtures.
let emptyShopId; let stockedShopId; let suspendShopId; let suspendProductId; let suspendCustId;
// D8 fixture: one phone, two shops.
let dualShopA; let dualShopB; const DUAL_PHONE = toE164(`8${uniq.slice(-6)}999`);
const createdShopIds = [];
const createdUserIds = [];

const ownerToken = (sid = shopId, uid = ownerId) =>
  jwt.sign({ sub: uid, role: 'owner', shopId: sid }, process.env.JWT_SECRET, { expiresIn: '30d' });
const consumerToken = (phone) =>
  jwt.sign({ sub: `cu_${phone}`, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function makeOwnerAndShop(label, { listed = false, city = null } = {}) {
  const u = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${label} Owner`, `data_${label}_${uniq}@test.local`, nextPhone()]
  );
  const uid = u.rows[0].id;
  const s = await pool.query(
    `INSERT INTO shops (owner_id, name, city, is_listed, offers_pickup)
     VALUES ($1,$2,$3,$4,true) RETURNING id`,
    [uid, `${label} Kirana ${uniq}`, city, listed]
  );
  const sid = s.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [sid, uid]);
  createdShopIds.push(sid);
  createdUserIds.push(uid);
  return { shopId: sid, ownerId: uid };
}

async function addProduct(sid, name = `Atta ${uniq}`, price = 40000) {
  const r = await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, is_active)
     VALUES ($1,$2,$3,'kg',true) RETURNING id`,
    [sid, name, price]
  );
  return r.rows[0].id;
}

/** One CREDIT order plus the `purchase` row it puts on the khata. */
async function creditOrderWithPurchase(amountPaise) {
  const o = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal)
     VALUES ($1,$2,'pending','pickup','credit','pending',$3) RETURNING id`,
    [shopId, custId, amountPaise]
  );
  const orderId = o.rows[0].id;
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source, order_id)
     VALUES ($1,$2,'purchase',$3,'credit','api',$4)`,
    [shopId, custId, amountPaise, orderId]
  );
  await pool.query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [amountPaise, custId]);
  return orderId;
}

beforeAll(async () => {
  const main = await makeOwnerAndShop('main');
  shopId = main.shopId; ownerId = main.ownerId;
  custPhone = nextPhone();
  const c = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,'Data Customer',$2,0) RETURNING id`,
    [shopId, custPhone]
  );
  custId = c.rows[0].id;
}, 30000);

afterAll(async () => {
  for (const id of createdShopIds) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of createdUserIds) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  await pool.end();
});

// ===========================================================================
// D1 — a shop with no catalogue is not a store
// ===========================================================================
describe('D1 — the public directory never surfaces a shop with nothing to sell', () => {
  beforeAll(async () => {
    const empty = await makeOwnerAndShop('empty', { listed: true, city: CITY });
    emptyShopId = empty.shopId;
    const stocked = await makeOwnerAndShop('stocked', { listed: true, city: CITY });
    stockedShopId = stocked.shopId;
    await addProduct(stockedShopId, `Rice ${uniq}`);
  });

  it('a LISTED shop with zero active products is absent from GET /public/shops', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(stockedShopId);
    expect(ids).not.toContain(emptyShopId);
    // And nothing in the directory ever reports "0 items" again.
    for (const s of res.body.shops) expect(s.product_count).toBeGreaterThan(0);
  });

  it('deactivating the last product removes the shop from the directory again', async () => {
    await pool.query('UPDATE products SET is_active = false WHERE shop_id = $1', [stockedShopId]);
    const gone = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(gone.body.shops.map((s) => s.id)).not.toContain(stockedShopId);

    await pool.query('UPDATE products SET is_active = true WHERE shop_id = $1', [stockedShopId]);
    const back = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(back.body.shops.map((s) => s.id)).toContain(stockedShopId);
  });

  it('a deep link to an empty shop still renders, and SAYS it has no items yet', async () => {
    const res = await request(app).get(`/api/public/shops/${emptyShopId}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.products).toEqual([]);
    expect(res.body.shop.catalogue_empty).toBe(true);
    expect(res.body.shop.catalogue_notice_code).toBe('shop_has_no_items_yet');
  });

  it('a stocked shop is NOT flagged as empty', async () => {
    const res = await request(app).get(`/api/public/shops/${stockedShopId}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.catalogue_empty).toBe(false);
    expect(res.body.shop.catalogue_notice_code).toBeNull();
  });
});

// ===========================================================================
// D2 — suspension actually stops a shop
// ===========================================================================
describe('D2 — a suspended shop disappears from discovery and refuses new business', () => {
  beforeAll(async () => {
    const s = await makeOwnerAndShop('susp', { listed: true, city: CITY });
    suspendShopId = s.shopId;
    suspendProductId = await addProduct(suspendShopId, `Dal ${uniq}`, 30000);
    const c = await pool.query(
      `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,'Susp Customer',$2,12345) RETURNING id`,
      [suspendShopId, custPhone]
    );
    suspendCustId = c.rows[0].id;
  });

  it('is listed and orderable while active', async () => {
    const dir = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(dir.body.shops.map((s) => s.id)).toContain(suspendShopId);

    const ok = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${consumerToken(custPhone)}`)
      .send({
        shop_id: suspendShopId,
        items: [{ product_id: suspendProductId, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(ok.status).toBe(201);
  });

  it('vanishes from the directory, the product search and its own storefront once suspended', async () => {
    await pool.query("UPDATE shops SET status = 'suspended' WHERE id = $1", [suspendShopId]);

    const dir = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(dir.body.shops.map((s) => s.id)).not.toContain(suspendShopId);

    const search = await request(app).get(`/api/public/products/search?q=Dal%20${uniq}`);
    expect(search.status).toBe(200);
    expect(search.body.products.map((p) => p.shop.id)).not.toContain(suspendShopId);

    const store = await request(app).get(`/api/public/shops/${suspendShopId}`);
    expect(store.status).toBe(404);
  });

  it('refuses a new credit order with a code the UI can render', async () => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${consumerToken(custPhone)}`)
      .send({
        shop_id: suspendShopId,
        items: [{ product_id: suspendProductId, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('shop_suspended');
    expect(res.body.details.code).toBe('shop_suspended');

    // Nothing was written: no order, and no khata movement.
    const orders = await pool.query(
      "SELECT COUNT(*)::int AS n FROM orders WHERE shop_id = $1 AND created_at > NOW() - INTERVAL '1 minute'",
      [suspendShopId]
    );
    expect(orders.rows[0].n).toBe(1); // only the one placed while active
  });

  it('refuses to generate a new payment link', async () => {
    const suspendOwner = await pool.query('SELECT id FROM users WHERE shop_id = $1 LIMIT 1', [suspendShopId]);
    const res = await request(app)
      .post('/api/payments/orders')
      .set('Authorization', `Bearer ${ownerToken(suspendShopId, suspendOwner.rows[0].id)}`)
      .send({ customer_id: suspendCustId, amount: 10000 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('shop_suspended');
  });

  it('but an existing customer can STILL read their own khata at that shop', async () => {
    const res = await request(app)
      .get('/api/my/khata')
      .set('Authorization', `Bearer ${consumerToken(custPhone)}`);
    expect(res.status).toBe(200);
    const shops = (res.body.shops || []).map((s) => s.shop_id || s.id);
    expect(shops).toContain(suspendShopId);
  });
});

// ===========================================================================
// D3 — total outstanding over EVERY debtor, not the listed page
// ===========================================================================
describe('D3 — /summaries/outstanding totals every debtor, not just the top 200', () => {
  const DEBTORS = 250;
  const PER_DEBTOR = 1000; // ₹10 each
  let bigShopId; let bigOwnerId;

  beforeAll(async () => {
    const s = await makeOwnerAndShop('bigdebt');
    bigShopId = s.shopId; bigOwnerId = s.ownerId;
    // 250 debtors, each owing a DIFFERENT amount so the top-200 cut is a real cut.
    const values = [];
    const params = [bigShopId];
    for (let i = 0; i < DEBTORS; i += 1) {
      params.push(`Debtor ${i}`, toE164(`7${uniq.slice(-6)}${String(i).padStart(3, '0')}`), PER_DEBTOR + i);
      const b = params.length;
      values.push(`($1, $${b - 2}, $${b - 1}, $${b})`);
    }
    await pool.query(
      `INSERT INTO customers (shop_id, name, phone, balance) VALUES ${values.join(',')}`,
      params
    );
  }, 30000);

  it('reports the SQL sum over all 250 debtors, not the sum of the listed page', async () => {
    const trueTotal = await pool.query(
      "SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE shop_id = $1 AND balance > 0 AND status = 'active'",
      [bigShopId]
    );
    const expected = Number(trueTotal.rows[0].s);

    const res = await request(app)
      .get('/api/summaries/outstanding')
      .set('Authorization', `Bearer ${ownerToken(bigShopId, bigOwnerId)}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(expected);
    expect(res.body.total_customers).toBe(DEBTORS);
    // The LIST stays paginated; only the figure is complete.
    expect(res.body.customers).toHaveLength(200);
    const listedSum = res.body.customers.reduce((s, c) => s + Number(c.balance), 0);
    expect(listedSum).toBeLessThan(Number(res.body.total));
  });

  it('agrees with /analytics/overview, which already summed in SQL', async () => {
    const [outstanding, overview] = await Promise.all([
      request(app).get('/api/summaries/outstanding')
        .set('Authorization', `Bearer ${ownerToken(bigShopId, bigOwnerId)}`),
      request(app).get('/api/analytics/overview')
        .set('Authorization', `Bearer ${ownerToken(bigShopId, bigOwnerId)}`),
    ]);
    expect(Number(outstanding.body.total)).toBe(Number(overview.body.total_outstanding));
  });
});

// ===========================================================================
// D4 — "sold on credit" is net of reversals, everywhere
//
// The audit's worked example, to the paise: three credit orders today at
// ₹800 / ₹600 / ₹500, the ₹600 one rejected and reversed. ₹1,300 was sold.
// ===========================================================================
describe('D4 — every sales-on-credit figure is net of cancelled, reversed orders', () => {
  const SOLD_A = 80000; // ₹800
  const REVERSED = 60000; // ₹600 — rejected
  const SOLD_B = 50000; // ₹500
  const GROSS = SOLD_A + REVERSED + SOLD_B; // ₹1,900 — the wrong answer
  const NET = SOLD_A + SOLD_B; // ₹1,300 — the right one
  const COLLECTED = 26000; // ₹260 collected today

  let netBefore; // platform-wide baseline, captured before this suite's fixtures
  let adminId;

  beforeAll(async () => {
    const netRow = await pool.query(
      "SELECT COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE type = 'purchase' AND created_at >= NOW() - INTERVAL '30 days'"
    );
    netBefore = Number(netRow.rows[0].s);

    await creditOrderWithPurchase(SOLD_A);
    const rejected = await creditOrderWithPurchase(REVERSED);
    await creditOrderWithPurchase(SOLD_B);

    // The owner rejects the ₹600 order with one tap. The ledger is append-only:
    // the `purchase` row stays and a compensating `adjustment` is written.
    const rej = await request(app)
      .patch(`/api/orders/${rejected}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'cancelled', reason: 'out of stock' });
    expect(rej.status).toBe(200);
    expect(Number(rej.body.adjustment.amount)).toBe(REVERSED);

    // A repayment, so the collection rate has a real numerator.
    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, source)
       VALUES ($1,$2,'cash',$3,'cash','api')`,
      [shopId, custId, COLLECTED]
    );
    await pool.query('UPDATE customers SET balance = balance - $1 WHERE id = $2', [COLLECTED, custId]);

    const admin = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
       VALUES ('Data Admin',$1,$2,'x','admin','super') RETURNING id`,
      [`data_admin_${uniq}@test.local`, nextPhone()]
    );
    adminId = admin.rows[0].id;
    createdUserIds.push(adminId);
  }, 30000);

  it('the ledger really does still hold the reversed purchase (this is not a delete)', async () => {
    const raw = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type='purchase'),0)::bigint AS purch,
              COALESCE(SUM(amount) FILTER (WHERE type='adjustment'),0)::bigint AS adj
         FROM transactions WHERE shop_id = $1`,
      [shopId]
    );
    expect(Number(raw.rows[0].purch)).toBe(GROSS);
    expect(Number(raw.rows[0].adj)).toBe(REVERSED);
  });

  it('GET /summaries/today reports ₹1,300, not ₹1,900', async () => {
    const res = await request(app).get('/api/summaries/today')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.purchases)).toBe(NET);
    expect(Number(res.body.collections)).toBe(COLLECTED);
  });

  it('GET /summaries/range reports ₹1,300 for today', async () => {
    const res = await request(app)
      .get('/api/summaries/range?from=2000-01-01')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    const total = res.body.series.reduce((s, d) => s + Number(d.purchases), 0);
    expect(total).toBe(NET);
  });

  it('GET /analytics/overview reports ₹1,300 and the HIGHER collection rate', async () => {
    const res = await request(app).get('/api/analytics/overview?days=30')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.purchases)).toBe(NET);
    expect(res.body.collection_rate).toBeCloseTo(COLLECTED / NET, 6);
    // The old, inflated denominator understated the rate by about a third.
    expect(res.body.collection_rate).toBeGreaterThan(COLLECTED / GROSS);
  });

  it("the owner's two numbers reconcile: sales − collections = change in outstanding", async () => {
    const [today, overview] = await Promise.all([
      request(app).get('/api/summaries/today').set('Authorization', `Bearer ${ownerToken()}`),
      request(app).get('/api/analytics/overview?days=30').set('Authorization', `Bearer ${ownerToken()}`),
    ]);
    // This shop started at zero, so the movement IS the outstanding balance.
    expect(Number(today.body.purchases) - Number(today.body.collections))
      .toBe(Number(overview.body.total_outstanding));
  });

  it('the nightly digest says ₹1,300.00', async () => {
    await pool.query('UPDATE shops SET daily_digest = true WHERE id = $1', [shopId]);
    mockSendText.mockClear();
    await notifier.sendOwnerDigest(shopId);
    expect(mockSendText).toHaveBeenCalled();
    const msg = mockSendText.mock.calls[0][1];
    expect(msg).toContain('Sales on credit: ₹1300.00');
    expect(msg).not.toContain('₹1900.00');
  });

  it('the weekly summary reports ₹1,300 of new udhaar', async () => {
    const weekly = await computeWeeklyForShop(shopId, 'en');
    expect(weekly.new_udhaar_paise).toBe(NET);
  });

  it('the platform dashboard moves by ₹1,300, not ₹1,900', async () => {
    const res = await request(app).get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${jwt.sign({ sub: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' })}`);
    expect(res.status).toBe(200);
    const delta = Number(res.body.sections.network.purchased_30d_paise) - netBefore;
    expect(delta).toBe(NET);
  });

  it('an adjustment from a cancelled PREPAID order is NOT subtracted from credit sales', async () => {
    // A prepaid order never posted a `purchase`, so the advance-credit adjustment
    // it leaves on cancellation is not reversing a credit sale. Subtracting it
    // would push the figure BELOW what was actually sold.
    const prepaid = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal)
       VALUES ($1,$2,'pending','pickup','prepaid','paid',$3) RETURNING id`,
      [shopId, custId, 40000]
    );
    const prepaidId = prepaid.rows[0].id;
    await pool.query(
      `INSERT INTO payment_orders (id, shop_id, customer_id, amount, status, provider, order_id, paid_at)
       VALUES ($1,$2,$3,40000,'paid','razorpay',$4,NOW())`,
      [`po_pp_${uniq}`, shopId, custId, prepaidId]
    );
    const rej = await request(app)
      .patch(`/api/orders/${prepaidId}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'cancelled', reason: 'shop closed' });
    expect(rej.status).toBe(200);
    expect(Number(rej.body.adjustment.amount)).toBe(40000);

    const res = await request(app).get('/api/summaries/today')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(Number(res.body.purchases)).toBe(NET);
  });
});

// ===========================================================================
// D5 — bad query parameters are a 400, not a 500 with Postgres text
// ===========================================================================
describe('D5 — unvalidated query parameters return a clean 400', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${ownerToken()}`);

  it('GET /summaries/range?from=yesterday → 400', async () => {
    const res = await auth(request(app).get('/api/summaries/range?from=yesterday'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(JSON.stringify(res.body)).not.toMatch(/timestamp|syntax for type/i);
  });

  it('GET /transactions?customer_id=abc → 400', async () => {
    const res = await auth(request(app).get('/api/transactions?customer_id=abc'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/uuid.*input syntax|syntax for type/i);
  });

  it('GET /transactions?limit=abc → 400 (never LIMIT NaN)', async () => {
    const res = await auth(request(app).get('/api/transactions?limit=abc'));
    expect(res.status).toBe(400);
  });

  it('GET /transactions?from=yesterday → 400', async () => {
    const res = await auth(request(app).get('/api/transactions?from=yesterday'));
    expect(res.status).toBe(400);
  });

  it('valid parameters still work', async () => {
    const ok = await auth(request(app).get(`/api/transactions?customer_id=${custId}&limit=5&type=purchase`));
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body.items)).toBe(true);
    const range = await auth(request(app).get('/api/summaries/range?from=2020-01-01&to=2999-01-01'));
    expect(range.status).toBe(200);
  });
});

// ===========================================================================
// D6 — the money path is indexed
// ===========================================================================
describe('D6 — payment_orders carries the two money-path indexes', () => {
  it('indexes payment_orders(order_id) and (customer_id, shop_id)', async () => {
    const r = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'payment_orders'`
    );
    const defs = r.rows.map((x) => x.indexdef.replace(/\s+/g, ' '));
    expect(defs.some((d) => /\(order_id\)/.test(d))).toBe(true);
    expect(defs.some((d) => /\(customer_id, shop_id\)/.test(d))).toBe(true);
  });
});

// ===========================================================================
// D7 — a prepaid order cannot be completed unpaid
// ===========================================================================
describe('D7 — completing a prepaid order requires the payment to have settled', () => {
  async function prepaidOrder(paymentStatus) {
    const r = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal)
       VALUES ($1,$2,'ready','pickup','prepaid',$3,25000) RETURNING id`,
      [shopId, custId, paymentStatus]
    );
    return r.rows[0].id;
  }

  it('refuses with 409 prepaid_not_paid, and the order stays non-terminal', async () => {
    const id = await prepaidOrder('pending');
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('prepaid_not_paid');
    expect(res.body.details.code).toBe('prepaid_not_paid');

    const row = await pool.query('SELECT status FROM orders WHERE id = $1', [id]);
    expect(row.rows[0].status).toBe('ready');
  });

  it('a still-cancellable unpaid prepaid order can be cancelled instead', async () => {
    const id = await prepaidOrder('pending');
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'cancelled', reason: 'never paid' });
    expect(res.status).toBe(200);
    expect(res.body.adjustment).toBeNull(); // nothing was paid, so nothing moves
  });

  it('a PAID prepaid order still completes normally', async () => {
    const id = await prepaidOrder('paid');
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('completed');
  });

  it('a CASH order still completes and settles on hand-over', async () => {
    const r = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal)
       VALUES ($1,$2,'ready','pickup','cash','pending',25000) RETURNING id`,
      [shopId, custId]
    );
    const res = await request(app)
      .patch(`/api/orders/${r.rows[0].id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.order.payment_status).toBe('paid');
  });
});

// ===========================================================================
// D8 — an ambiguous inbound phone is refused, never guessed
// ===========================================================================
describe('D8 — a WhatsApp number mapping to two shops is refused, not guessed', () => {
  const fromNoPlus = DUAL_PHONE.replace('+', '');

  function payloadFor(body, msgId) {
    return {
      entry: [{ changes: [{ value: { messages: [{ id: msgId, type: 'text', from: fromNoPlus, text: { body } }] } }] }],
    };
  }

  beforeAll(async () => {
    // The same human: OWNER at shop A, STAFF at shop B, one handset.
    const a = await makeOwnerAndShop('dualA');
    dualShopA = a.shopId;
    await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [DUAL_PHONE, a.ownerId]);

    const b = await makeOwnerAndShop('dualB');
    dualShopB = b.shopId;
    const staff = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, shop_id)
       VALUES ('Dual Staff',$1,$2,'x','staff',$3) RETURNING id`,
      [`dual_staff_${uniq}@test.local`, DUAL_PHONE, dualShopB]
    );
    createdUserIds.push(staff.rows[0].id);

    for (const sid of [dualShopA, dualShopB]) {
      await pool.query(
        `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,'Shared Name',$2,0)`,
        [sid, nextPhone()]
      );
    }
  });

  it('resolveSenderShop reports the ambiguity instead of picking a row', async () => {
    const r = await waInbound.resolveSenderShop(fromNoPlus);
    expect(r.shopCount).toBe(2);
    expect(r.shopId).toBeNull();
  });

  it('an `add` from that number writes NOTHING and asks which shop', async () => {
    mockSendText.mockClear();
    await waInbound.handle(payloadFor('add 250 Shared Name', `wa_dual_${uniq}`));

    const tx = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transactions WHERE shop_id = ANY($1::uuid[])`,
      [[dualShopA, dualShopB]]
    );
    expect(tx.rows[0].n).toBe(0);
    const bal = await pool.query(
      'SELECT COALESCE(SUM(balance),0)::bigint AS s FROM customers WHERE shop_id = ANY($1::uuid[])',
      [[dualShopA, dualShopB]]
    );
    expect(Number(bal.rows[0].s)).toBe(0);

    expect(mockSendText).toHaveBeenCalled();
    expect(mockSendText.mock.calls[0][1]).toMatch(/more than one shop/i);
  });

  it('once the ambiguity is gone the same number resolves deterministically and writes', async () => {
    await pool.query("UPDATE users SET status = 'blocked' WHERE phone = $1 AND shop_id = $2", [DUAL_PHONE, dualShopB]);
    const r = await waInbound.resolveSenderShop(fromNoPlus);
    expect(r.shopCount).toBe(1);
    expect(r.shopId).toBe(dualShopA);

    mockSendText.mockClear();
    await waInbound.handle(payloadFor('add 250 Shared Name', `wa_dual_ok_${uniq}`));
    const tx = await pool.query(
      `SELECT shop_id, amount FROM transactions WHERE shop_id = ANY($1::uuid[])`,
      [[dualShopA, dualShopB]]
    );
    expect(tx.rowCount).toBe(1);
    expect(tx.rows[0].shop_id).toBe(dualShopA);
    expect(Number(tx.rows[0].amount)).toBe(25000);
  });
});
