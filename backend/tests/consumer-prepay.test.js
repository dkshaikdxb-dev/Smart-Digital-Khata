// Integration tests for single-merchant consumer pre-pay / advance (batch WALLET1).
// Requires a real Postgres (DATABASE_URL) with migrations applied (incl. 0057, which
// seeds consumer_prepay_enabled + consumer_prepay_max_advance_paise). Money is
// integer paise. A customer may pre-pay a shop ABOVE their due, building a NEGATIVE
// balance = an advance in THAT shop's ledger; the money settles to the shop's own
// Razorpay (settlement path unchanged). These tests set the platform_settings flags
// explicitly so they don't depend on the seeded defaults.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

// Razorpay seam: pretend the shop is configured and stub order/link creation so
// /my/pay can create the payment_orders row without hitting Razorpay's servers.
const mockCreateOrderForShop = jest.fn(async (_shopId, { receipt }) => ({
  id: `order_${Math.random().toString().slice(2, 10)}`,
  receipt,
}));
const mockCreatePaymentLinkForShop = jest.fn(async () => ({
  id: `plink_${Math.random().toString().slice(2, 10)}`,
  short_url: 'https://rzp.io/i/testprepay',
}));
jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: (...a) => mockCreateOrderForShop(...a),
  createPaymentLinkForShop: (...a) => mockCreatePaymentLinkForShop(...a),
}));

// WhatsApp seam: assert the dunning guard by watching whether a reminder is sent.
const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => false),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const notifier = require('../src/services/notification.service');

const uniq = Date.now().toString().slice(-9);
const PHONE = toE164(`96${uniq}`);

const MAX_ADVANCE = 2000000; // ₹20,000 cap used throughout these tests

let shopId;
let ownerId;
let custId;

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shop) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId: shop }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function setPrepay(enabled, maxAdvance = MAX_ADVANCE) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES
       ('consumer_prepay_enabled', $1, NOW()),
       ('consumer_prepay_max_advance_paise', $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [enabled ? 'true' : 'false', String(maxAdvance)]
  );
}

async function setBalance(paise) {
  await pool.query('UPDATE customers SET balance = $1 WHERE id = $2', [paise, custId]);
}

async function getBalance() {
  const r = await pool.query('SELECT balance FROM customers WHERE id = $1', [custId]);
  return Number(r.rows[0].balance);
}

// Open (status 'created') links now count against the advance cap, so each
// scenario starts from a clean slate: close out whatever earlier tests left open.
async function closeOpenLinks() {
  await pool.query(
    `UPDATE payment_orders SET status = 'cancelled' WHERE customer_id = $1 AND status = 'created'`,
    [custId]
  );
}

async function openLinks() {
  const r = await pool.query(
    `SELECT id, amount, status FROM payment_orders
     WHERE customer_id = $1 AND status = 'created' ORDER BY created_at ASC`,
    [custId]
  );
  return r.rows;
}

async function pay(amount) {
  return request(app)
    .post('/api/my/pay')
    .set('Authorization', `Bearer ${customerToken(PHONE)}`)
    .send({ shop_id: shopId, amount });
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Prepay Owner', `prepayowner_${uniq}@test.local`, `+9196${uniq}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(`INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`, [ownerId, 'Prepay Store']);
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [shopId, 'Prepay Customer', PHONE, 100000, 15000] // ₹150 owed
  );
  custId = cust.rows[0].id;
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (ownerId) await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

beforeEach(() => {
  mockSendText.mockClear();
  mockCreateOrderForShop.mockClear();
  mockCreatePaymentLinkForShop.mockClear();
});

describe('POST /my/pay with pre-pay ENABLED', () => {
  const token = () => customerToken(PHONE);
  beforeEach(closeOpenLinks);

  it('accepts an amount ABOVE the due, creates the order, and hints prepay:true', async () => {
    await setPrepay(true);
    await setBalance(15000); // ₹150 owed

    // Pay ₹250 — clears the ₹150 due and pre-loads a ₹100 advance (well under cap).
    const amount = 25000;
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount });
    expect(res.status).toBe(201);
    expect(res.body.link).toBe('https://rzp.io/i/testprepay');
    expect(res.body.prepay).toBe(true);

    // A payment_orders row was created for the full amount.
    const po = await pool.query(
      `SELECT * FROM payment_orders WHERE shop_id = $1 AND customer_id = $2 AND amount = $3`,
      [shopId, custId, amount]
    );
    expect(po.rowCount).toBe(1);
    expect(po.rows[0].status).toBe('created');

    // Simulate the webhook settlement (the settlement path is unchanged: it runs
    // `balance = balance - amount` with no clamp) — the balance goes NEGATIVE = the
    // customer now holds a ₹100 advance at this shop.
    await pool.query(
      `UPDATE customers SET balance = balance - $1 WHERE id = $2 AND shop_id = $3`,
      [amount, custId, shopId]
    );
    expect(await getBalance()).toBe(15000 - amount); // -10000 = ₹100 advance
    expect(await getBalance()).toBeLessThan(0);
  });

  it('accepts a pure advance (no due) when the balance is already zero', async () => {
    await setPrepay(true);
    await setBalance(0);
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount: 50000 }); // ₹500, all advance
    expect(res.status).toBe(201);
    expect(res.body.prepay).toBe(true);
  });

  it('rejects an amount that would push the advance past maxAdvance (422 + the allowed max)', async () => {
    await setPrepay(true);
    await setBalance(15000);
    const amount = 15000 + MAX_ADVANCE + 1; // one paise past the ceiling
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount });
    expect(res.status).toBe(422);
    expect(res.body.details.max_allowed).toBe(15000 + MAX_ADVANCE);
  });

  it('pays exactly up to the cap (due + maxAdvance) at the boundary', async () => {
    await setPrepay(true);
    await setBalance(15000);
    const amount = 15000 + MAX_ADVANCE; // exactly the ceiling
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount });
    expect(res.status).toBe(201);
    expect(res.body.prepay).toBe(true);
  });
});

describe('POST /my/pay with pre-pay DISABLED keeps the old rejection', () => {
  const token = () => customerToken(PHONE);
  beforeEach(closeOpenLinks);

  it('rejects any amount over the outstanding balance (422)', async () => {
    await setPrepay(false);
    await setBalance(15000);
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount: 16000 }); // ₹10 over the due
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Amount exceeds your outstanding balance at this shop');
  });

  it('still accepts a payment up to the due', async () => {
    await setPrepay(false);
    await setBalance(15000);
    const res = await request(app)
      .post('/api/my/pay')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shop_id: shopId, amount: 15000 });
    expect(res.status).toBe(201);
    expect(res.body.prepay).toBe(false);
  });
});

describe('advance cap counts IN-FLIGHT (unpaid) links, not just the current balance', () => {
  beforeEach(async () => {
    await setPrepay(true);
    await setBalance(0);
    await closeOpenLinks();
  });

  it('two rapid link creations: the second, which would breach the cap once both settle, is rejected; the first stays created', async () => {
    const first = MAX_ADVANCE - 5000; // leaves ₹50 of headroom
    const r1 = await pay(first);
    expect(r1.status).toBe(201);
    expect(r1.body.prepay).toBe(true);

    // The balance has NOT moved (no webhook yet) — against the current balance
    // alone this second link would look fine, but together they exceed the cap.
    expect(await getBalance()).toBe(0);
    const r2 = await pay(10000);
    expect(r2.status).toBe(422);
    expect(r2.body.error).toBe('Amount exceeds the most you can pre-pay this shop right now');
    expect(r2.body.details.pending_links).toBe(first);
    expect(r2.body.details.max_allowed).toBe(5000);
    expect(r2.body.details.max_advance).toBe(MAX_ADVANCE);

    // The first link is untouched and the rejected one left no row behind.
    const open = await openLinks();
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(r1.body.order_id);
    expect(Number(open[0].amount)).toBe(first);

    // What is left of the headroom is still payable, to the paise.
    const r3 = await pay(5000);
    expect(r3.status).toBe(201);
    const r4 = await pay(1);
    expect(r4.status).toBe(422);
    expect(r4.body.details.max_allowed).toBe(0);
  });

  it('a paid / cancelled / failed prior link does NOT count against the cap', async () => {
    const r1 = await pay(MAX_ADVANCE);
    expect(r1.status).toBe(201);
    // Fully used up while the link is open...
    expect((await pay(1)).status).toBe(422);

    // ...settled by the webhook (status flips to paid; the balance move is the
    // webhook's business and is deliberately NOT simulated here so that the
    // only thing changing is the row's status).
    await pool.query(`UPDATE payment_orders SET status = 'paid', paid_at = NOW() WHERE id = $1`, [r1.body.order_id]);
    const r2 = await pay(MAX_ADVANCE);
    expect(r2.status).toBe(201);

    for (const closed of ['cancelled', 'failed']) {
      await pool.query(`UPDATE payment_orders SET status = $2 WHERE id = $1`, [r2.body.order_id, closed]);
      // eslint-disable-next-line no-await-in-loop
      const again = await pay(MAX_ADVANCE);
      expect(again.status).toBe(201);
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE payment_orders SET status = 'paid' WHERE id = $1`, [again.body.order_id]);
    }
  });

  it('an open PREPAID-ORDER link (order_id set) never moves the khata, so it is not counted', async () => {
    const orderRow = await pool.query(
      `INSERT INTO orders (shop_id, customer_id, status, payment_mode, payment_status, fulfillment_type, subtotal, delivery_fee)
       VALUES ($1,$2,'pending','prepaid','pending','pickup',5000,0) RETURNING id`,
      [shopId, custId]
    );
    await pool.query(
      `INSERT INTO payment_orders (id, shop_id, customer_id, amount, status, order_id)
       VALUES ($1,$2,$3,$4,'created',$5)`,
      [`ordlink_${uniq}`, shopId, custId, MAX_ADVANCE, orderRow.rows[0].id]
    );
    const r = await pay(MAX_ADVANCE);
    expect(r.status).toBe(201);
  });

  it('CONCURRENT link creations for the same khata are serialized: exactly one wins when both cannot fit', async () => {
    const each = Math.floor(MAX_ADVANCE * 0.6); // two of these = 120% of the cap
    const [a, b] = await Promise.all([pay(each), pay(each)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const open = await openLinks();
    expect(open).toHaveLength(1);
    expect(Number(open[0].amount)).toBe(each);
  });

  it('pre-pay DISABLED ignores open links (unchanged behaviour: only the due can be paid)', async () => {
    await setPrepay(true);
    await setBalance(15000);
    expect((await pay(15000)).status).toBe(201); // one open link for the full due
    await setPrepay(false);
    // Still allowed up to the due, exactly as before this change.
    expect((await pay(15000)).status).toBe(201);
    expect((await pay(15001)).status).toBe(422);
  });
});

describe('negative-balance (advance) audit — never a receivable, never dunned', () => {
  it('GET /my/khata surfaces the live prepay config', async () => {
    await setPrepay(true);
    const res = await request(app)
      .get('/api/my/khata')
      .set('Authorization', `Bearer ${customerToken(PHONE)}`);
    expect(res.status).toBe(200);
    expect(res.body.prepay).toEqual({ enabled: true, max_advance_paise: MAX_ADVANCE });
  });

  it('a customer in advance is EXCLUDED from /summaries/outstanding and does not add to the total', async () => {
    await setBalance(-50000); // ₹500 advance (shop owes the customer)
    const res = await request(app)
      .get('/api/summaries/outstanding')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(res.status).toBe(200);
    const ids = res.body.customers.map((c) => c.id);
    expect(ids).not.toContain(custId);
    // The advance must not net down the receivables total (which is >= 0).
    expect(Number(res.body.total)).toBeGreaterThanOrEqual(0);
  });

  it('sendReminder never duns a customer with an advance (balance < 0) or a settled one', async () => {
    const advance = { id: custId, name: 'Adv', phone: PHONE, balance: -50000, notifications_enabled: true };
    const settled = { id: custId, name: 'Zero', phone: PHONE, balance: 0, notifications_enabled: true };
    await notifier.sendReminder(shopId, advance);
    await notifier.sendReminder(shopId, settled);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('sendReminder DOES dun a customer who genuinely owes (balance > 0)', async () => {
    const debtor = { id: custId, name: 'Owes', phone: PHONE, balance: 15000, notifications_enabled: true };
    await notifier.sendReminder(shopId, debtor);
    expect(mockSendText).toHaveBeenCalledTimes(1);
  });
});
