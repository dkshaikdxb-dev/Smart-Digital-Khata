// Owner Help "lane B" — weekly WhatsApp summary (Batch J). Requires a real
// Postgres (DATABASE_URL) with the migrations applied through 0026. The pure
// composer is unit-tested with hand-built payloads; the HTTP endpoint and the
// worker function are tested against a freshly-seeded, SHOP-SCOPED fixture.
//
// The worker (runWeeklySummaries) is invoked DIRECTLY — never through Redis — so
// this suite runs with no Redis available. WhatsApp is never hit for real: the
// send is stubbed (jest.spyOn) so there is zero network, and we assert the guards
// (opt-in, last-sent >6 days, whatsapp-configured) around it.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { buildWeeklySummary } = require('../src/utils/weekly-summary');
const weeklyService = require('../src/services/weekly-summary.service');
const whatsapp = require('../src/services/whatsapp.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const staffToken = (sub, shopId) => jwt.sign({ sub, role: 'staff', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });

const emails = [];
const phones = [];

let phoneSeq = 0;
function nextPhone() {
  const p = `+919${uniq.slice(-6)}${String(phoneSeq++).padStart(4, '0')}`;
  phones.push(p);
  return p;
}

async function register(tag) {
  const email = `wk_${tag}_${uniq}@test.local`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({
    name: `Wk Owner ${tag}`, email, phone: nextPhone(), password: 'password123', shopName: `Wk Shop ${tag}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

// Fixture money (integer paise), named so the paise assertions are unambiguous.
const CASH_PAISE = 2840000;   // ₹28,400 collected this week (cash)
const UPI_PAISE = 0;
const COLLECTED_PAISE = CASH_PAISE + UPI_PAISE;
const NEW_UDHAAR_PAISE = 675000; // ₹6,750 new udhaar this week (purchase)
const DUE_A_PAISE = 400000;      // ₹4,000 outstanding balance (customer 1)
const DUE_B_PAISE = 275000;      // ₹2,750 outstanding balance (customer 2)
const DUES_TOTAL_PAISE = DUE_A_PAISE + DUE_B_PAISE; // ₹6,750
const SHOP_B_COLLECTED_PAISE = 111100; // a distinct collection on the OTHER shop

let ownerA; let ownerB; let ownerC;
let staffA;

async function seedShopA(shopId) {
  // A collecting customer: one cash payment this week (₹28,400) and a purchase
  // this week (₹6,750 new udhaar). Its balance stays > 0 so it counts as a due.
  const c1 = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shopId, 'Due Cust 1', nextPhone(), DUE_A_PAISE]
  );
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'cash',$3,'cash', NOW() - INTERVAL '1 day'),
            ($1,$2,'purchase',$4,'credit', NOW() - INTERVAL '2 days')`,
    [shopId, c1.rows[0].id, CASH_PAISE, NEW_UDHAAR_PAISE]
  );

  // A second due customer (balance > 0), no recent activity.
  await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4)`,
    [shopId, 'Due Cust 2', nextPhone(), DUE_B_PAISE]
  );

  // An order this week with items → top seller (Rice by quantity).
  const order = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, subtotal, delivery_fee, created_at)
     VALUES ($1,$2,'completed','pickup','cash',60000,0, NOW() - INTERVAL '1 day') RETURNING id`,
    [shopId, c1.rows[0].id]
  );
  await pool.query(
    `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
     VALUES ($1,'Rice',10000,5,50000), ($1,'Sugar',5000,2,10000)`,
    [order.rows[0].id]
  );

  // A stale transaction OUTSIDE the 7-day window must NOT count toward collected.
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'cash',$3,'cash', NOW() - INTERVAL '30 days')`,
    [shopId, c1.rows[0].id, 9999999]
  );
}

beforeAll(async () => {
  ownerA = await register('a');
  ownerB = await register('b');
  ownerC = await register('c'); // opted OUT of weekly summary
  staffA = { token: staffToken(ownerA.user.id, ownerA.shop.id) };

  await seedShopA(ownerA.shop.id);

  // Shop B has its OWN collection this week — used to prove scoping/isolation.
  const bCust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,0) RETURNING id`,
    [ownerB.shop.id, 'B Cust', nextPhone()]
  );
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'upi',$3,'upi', NOW() - INTERVAL '1 day')`,
    [ownerB.shop.id, bCust.rows[0].id, SHOP_B_COLLECTED_PAISE]
  );

  // Shop C opts OUT of the weekly summary.
  await pool.query(`UPDATE shops SET weekly_summary = false WHERE id = $1`, [ownerC.shop.id]);
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

describe('pure composer (utils/weekly-summary)', () => {
  it('exact paise for collected + dues, correct dues count, deterministic, localized', () => {
    const data = {
      collected_paise: COLLECTED_PAISE,
      new_udhaar_paise: NEW_UDHAAR_PAISE,
      dues_count: 2,
      dues_total_paise: DUES_TOTAL_PAISE,
      top_item: 'Rice',
      busy_day_dow: 6, // Saturday
    };
    const a = buildWeeklySummary(data, 'hi');
    const b = buildWeeklySummary(data, 'hi');
    expect(a).toEqual(b); // deterministic

    // Exact integer paise are carried through untouched (no rounding drift).
    expect(a.collected_paise).toBe(COLLECTED_PAISE);
    expect(a.dues_total_paise).toBe(DUES_TOTAL_PAISE);
    expect(a.dues_count).toBe(2);
    expect(a.top_item).toBe('Rice');
    expect(a.busy_day_dow).toBe(6);
    expect(a.quiet).toBe(false);

    // The message is Hindi, quotes the grouped rupee amounts, the dues count, the
    // Saturday best-day and the top seller.
    expect(a.lang).toBe('hi');
    expect(a.message).toContain('₹28,400'); // collected, Indian grouping
    expect(a.message).toContain('₹6,750');  // udhaar/dues
    expect(a.message).toContain('(2 ग्राहक)');
    expect(a.message).toContain('शनिवार');   // Saturday
    expect(a.message).toContain('Rice');
  });

  it('empty shop yields a sensible quiet-week summary (not an empty string)', () => {
    const q = buildWeeklySummary({}, 'hi');
    expect(q.quiet).toBe(true);
    expect(typeof q.message).toBe('string');
    expect(q.message.length).toBeGreaterThan(0);
    expect(q.collected_paise).toBe(0);
    expect(q.dues_count).toBe(0);
    // Never throws on partial/garbage data.
    expect(() => buildWeeklySummary()).not.toThrow();
    expect(() => buildWeeklySummary({ dues_count: 'x', collected_paise: null })).not.toThrow();
  });

  it('falls back through owner-lang → hi → en for unknown languages', () => {
    expect(buildWeeklySummary({ collected_paise: 100 }, 'zz').lang).toBe('hi');
    expect(buildWeeklySummary({ collected_paise: 100 }, 'en').lang).toBe('en');
    expect(buildWeeklySummary({ collected_paise: 100 }, 'ur').lang).toBe('ur');
  });

  it('composes a Tamil (ta) message from the NATIVE template, not the English one', () => {
    const data = {
      collected_paise: COLLECTED_PAISE,
      new_udhaar_paise: NEW_UDHAAR_PAISE,
      dues_count: 2,
      dues_total_paise: DUES_TOTAL_PAISE,
      top_item: 'Rice',
      busy_day_dow: 6, // Saturday → சனி
    };
    const a = buildWeeklySummary(data, 'ta');
    expect(a.lang).toBe('ta');
    // Native Tamil script header + fragments (proves it is NOT the English template).
    expect(a.message).toContain('இந்த வாரம் உங்கள் கடையில்');
    expect(a.message).toContain('வசூல்');
    expect(a.message).toContain('நிலுவையில்');
    expect(a.message).toContain('சனி'); // Saturday, in Tamil
    // Tokens are filled with the exact grouped amounts + count + item.
    expect(a.message).toContain('₹28,400');
    expect(a.message).toContain('₹6,750');
    expect(a.message).toContain('(2 வாடிக்கையாளர்கள்)');
    expect(a.message).toContain('Rice');
    // The English template header must never appear in a ta message.
    expect(a.message).not.toContain('This week at your shop');
    // At least one character is in the Tamil Unicode block (U+0B80–U+0BFF).
    expect(/[஀-௿]/.test(a.message)).toBe(true);
  });

  it('quiet-week ta message is native Tamil (not English)', () => {
    const q = buildWeeklySummary({}, 'ta');
    expect(q.quiet).toBe(true);
    expect(/[஀-௿]/.test(q.message)).toBe(true);
    expect(q.message).not.toContain('A quiet week');
  });
});

describe('GET /api/insights/owner/weekly', () => {
  it('returns the shop-scoped summary with exact paise (owner)', async () => {
    const res = await withToken(request(app).get('/api/insights/owner/weekly?lang=hi'), ownerA.token);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.collected_paise).toBe(COLLECTED_PAISE);
    expect(Number.isInteger(s.collected_paise)).toBe(true);
    expect(s.new_udhaar_paise).toBe(NEW_UDHAAR_PAISE);
    expect(s.dues_count).toBe(2);
    expect(s.dues_total_paise).toBe(DUES_TOTAL_PAISE);
    expect(s.top_item).toBe('Rice');
    expect(typeof s.message).toBe('string');
  });

  it('staff of the same shop can read it (auth gate: staff ok)', async () => {
    const res = await withToken(request(app).get('/api/insights/owner/weekly'), staffA.token);
    expect(res.status).toBe(200);
    expect(res.body.summary.collected_paise).toBe(COLLECTED_PAISE);
  });

  it('another shop sees only its own data — never shop A\'s', async () => {
    const res = await withToken(request(app).get('/api/insights/owner/weekly'), ownerB.token);
    expect(res.status).toBe(200);
    expect(res.body.summary.collected_paise).toBe(SHOP_B_COLLECTED_PAISE);
    expect(res.body.summary.collected_paise).not.toBe(COLLECTED_PAISE);
  });

  it('401 without a token', async () => {
    const res = await request(app).get('/api/insights/owner/weekly');
    expect(res.status).toBe(401);
  });
});

describe('weekly worker (runWeeklySummaries — invoked directly, no Redis)', () => {
  let sendSpy;
  let cfgSpy;

  beforeAll(() => {
    // Stub the WhatsApp send so there is NO network, and force isConfigured=true
    // so the worker proceeds past the "not configured" guard.
    sendSpy = jest.spyOn(whatsapp, 'sendText').mockResolvedValue({ messages: [{ id: 'stub' }] });
    cfgSpy = jest.spyOn(whatsapp, 'isConfigured').mockReturnValue(true);
  });

  afterAll(() => {
    sendSpy.mockRestore();
    cfgSpy.mockRestore();
  });

  it('composes + sends for the opted-in shop, stamps last_sent, logs, and skips the opted-out shop', async () => {
    const before = await pool.query('SELECT weekly_summary_last_sent_at FROM shops WHERE id=$1', [ownerA.shop.id]);
    expect(before.rows[0].weekly_summary_last_sent_at).toBeNull();

    await weeklyService.runWeeklySummaries();

    // Shop A (opted in) got a message; the text is shop A's own collected amount.
    const sentToA = sendSpy.mock.calls.find((c) => String(c[1]).includes('28,400'));
    expect(sentToA).toBeDefined();

    // last_sent stamped for A.
    const afterA = await pool.query('SELECT weekly_summary_last_sent_at FROM shops WHERE id=$1', [ownerA.shop.id]);
    expect(afterA.rows[0].weekly_summary_last_sent_at).not.toBeNull();

    // A notification_logs row was written for A.
    const logs = await pool.query(
      `SELECT * FROM notification_logs WHERE shop_id=$1 AND kind='weekly_summary'`,
      [ownerA.shop.id]
    );
    expect(logs.rowCount).toBe(1);
    expect(logs.rows[0].channel).toBe('whatsapp');
    expect(logs.rows[0].status).toBe('sent');

    // Shop C (opted OUT) never got a send and has no last_sent / log.
    const afterC = await pool.query('SELECT weekly_summary_last_sent_at FROM shops WHERE id=$1', [ownerC.shop.id]);
    expect(afterC.rows[0].weekly_summary_last_sent_at).toBeNull();
    const logsC = await pool.query(
      `SELECT * FROM notification_logs WHERE shop_id=$1 AND kind='weekly_summary'`,
      [ownerC.shop.id]
    );
    expect(logsC.rowCount).toBe(0);
  });

  it('does NOT resend within 6 days (last-sent guard)', async () => {
    sendSpy.mockClear();
    // A was just sent (last_sent = NOW()); a fresh run must not resend to it.
    await weeklyService.runWeeklySummaries();
    const resentToA = sendSpy.mock.calls.find((c) => String(c[1]).includes('28,400'));
    expect(resentToA).toBeUndefined();

    // Still exactly one log row for A (no duplicate).
    const logs = await pool.query(
      `SELECT * FROM notification_logs WHERE shop_id=$1 AND kind='weekly_summary'`,
      [ownerA.shop.id]
    );
    expect(logs.rowCount).toBe(1);
  });

  it('skips sending (no stamp) when WhatsApp is not configured', async () => {
    cfgSpy.mockReturnValueOnce(false);
    // Move A back to eligible (older than 6 days) so only the configured guard is
    // in play for this call.
    await pool.query(
      `UPDATE shops SET weekly_summary_last_sent_at = NOW() - INTERVAL '10 days' WHERE id=$1`,
      [ownerA.shop.id]
    );
    sendSpy.mockClear();
    const report = await weeklyService.sendWeeklyForShop({ id: ownerA.shop.id, owner_id: ownerA.user.id, name: 'Wk Shop a' });
    expect(report.status).toBe('skipped');
    expect(report.reason).toBe('whatsapp_unconfigured');
    expect(sendSpy).not.toHaveBeenCalled();
    // last_sent unchanged from the 10-days-ago value we set (not re-stamped).
    const row = await pool.query('SELECT weekly_summary_last_sent_at FROM shops WHERE id=$1', [ownerA.shop.id]);
    expect(row.rows[0].weekly_summary_last_sent_at.getTime()).toBeLessThan(Date.now() - 8 * 24 * 3600 * 1000);
  });
});
