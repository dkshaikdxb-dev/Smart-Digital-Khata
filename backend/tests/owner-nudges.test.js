// Owner Help "lane A" — plain-language shop nudges (Phase F). Requires a real
// Postgres (DATABASE_URL) with the migrations applied through 0024. See the task
// notes for the throwaway-cluster one-liner.
//
// The endpoint is SHOP-SCOPED, so unlike the platform dashboard these tests can
// assert exact figures on a freshly-seeded shop (the shop's own rows only), plus
// isolation (another shop's data never appears) and the auth gate. The pure
// builder is unit-tested directly with hand-built payloads.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { buildOwnerNudges, THRESHOLDS } = require('../src/utils/owner-nudges');

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
  const email = `own_${tag}_${uniq}@test.local`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({
    name: `Own Owner ${tag}`, email, phone: nextPhone(), password: 'password123', shopName: `Own Shop ${tag}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

// Fixture money (integer paise), kept as named values so the paise assertions are
// unambiguous.
const PAY_CASH_PAISE = 30000; // ₹300 collected today (cash)
const PAY_UPI_PAISE = 20000;  // ₹200 collected today (upi)
const COLLECTED_TODAY_PAISE = PAY_CASH_PAISE + PAY_UPI_PAISE; // ₹500
const OLD_DUE_PAISE = 70000;  // ₹700 stale due (last activity 40 days ago)
const NEAR_LIMIT_BAL_PAISE = 95000;  // ₹950 balance
const NEAR_LIMIT_CAP_PAISE = 100000; // ₹1,000 credit limit (95% → near limit)
const OUTSTANDING_TOTAL_PAISE = OLD_DUE_PAISE + NEAR_LIMIT_BAL_PAISE; // ₹1,650
const SHOP_B_BAL_PAISE = 999999; // a distinct balance on the OTHER shop

let ownerA; let ownerB; let ownerC;
let staffA;

async function seedShopA(shopId) {
  // Customer with two PAYMENTS today (cash + upi) → collected_today.
  const payCust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,0) RETURNING id`,
    [shopId, 'Pay Cust', nextPhone()]
  );
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'cash',$3,'cash', NOW()), ($1,$2,'upi',$4,'upi', NOW())`,
    [shopId, payCust.rows[0].id, PAY_CASH_PAISE, PAY_UPI_PAISE]
  );

  // Stale-dues customer: balance > 0 whose only activity is 40 days old.
  const dueCust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shopId, 'Old Due Cust', nextPhone(), OLD_DUE_PAISE]
  );
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'purchase',$3,'credit', NOW() - INTERVAL '40 days')`,
    [shopId, dueCust.rows[0].id, OLD_DUE_PAISE]
  );

  // Near-limit customer: 95% of a real credit limit, recent (created_at NOW) so it
  // is NOT counted as a stale due.
  await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance, credit_limit) VALUES ($1,$2,$3,$4,$5)`,
    [shopId, 'Near Limit Cust', nextPhone(), NEAR_LIMIT_BAL_PAISE, NEAR_LIMIT_CAP_PAISE]
  );

  // An order with items → top_item (best-selling by quantity).
  const order = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, subtotal, delivery_fee, created_at)
     VALUES ($1,$2,'completed','pickup','cash',50000,0, NOW()) RETURNING id`,
    [shopId, payCust.rows[0].id]
  );
  await pool.query(
    `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
     VALUES ($1,'Rice',10000,5,50000), ($1,'Sugar',5000,2,10000)`,
    [order.rows[0].id]
  );
}

beforeAll(async () => {
  ownerA = await register('a');
  ownerB = await register('b');
  ownerC = await register('c'); // empty shop
  staffA = { token: staffToken(ownerA.user.id, ownerA.shop.id) };

  await seedShopA(ownerA.shop.id);

  // Shop B has its OWN customer with a distinct balance — used to prove scoping.
  await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4)`,
    [ownerB.shop.id, 'B Cust', nextPhone(), SHOP_B_BAL_PAISE]
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

describe('pure builder (utils/owner-nudges)', () => {
  it('emits every rule with correct paise/counts and a fixed deterministic order', () => {
    const data = {
      payments_today_paise: COLLECTED_TODAY_PAISE,
      trailing_daily_avg_paise: 0, // no clear delta → base collected_today key
      dues_count: 3,
      dues_total_paise: OLD_DUE_PAISE,
      outstanding_total_paise: OUTSTANDING_TOTAL_PAISE,
      near_limit_count: 2,
      top_item: { name: 'Rice', quantity: 5 },
      busy_day: { dow: 5, count: 9 },
    };
    const a = buildOwnerNudges(data);
    const b = buildOwnerNudges(data);
    expect(a).toEqual(b); // deterministic

    // Fixed narrative order.
    expect(a.map((n) => n.id)).toEqual([
      'collected_today', 'dues_pending', 'near_limit', 'outstanding_total', 'top_item', 'busy_day',
    ]);

    const byId = Object.fromEntries(a.map((n) => [n.id, n]));
    expect(byId.collected_today.key).toBe('own.nudge.collected_today');
    expect(byId.collected_today.amount_paise).toBe(COLLECTED_TODAY_PAISE);
    expect(byId.collected_today.tone).toBe('good');

    expect(byId.dues_pending.vars.n).toBe(3);
    expect(byId.dues_pending.amount_paise).toBe(OLD_DUE_PAISE);
    expect(byId.dues_pending.tone).toBe('attention');
    expect(byId.dues_pending.action).toBe('remind');

    expect(byId.near_limit.vars.n).toBe(2);
    expect(byId.near_limit.vars.pct).toBe(THRESHOLDS.NEAR_LIMIT_PCT);

    expect(byId.outstanding_total.amount_paise).toBe(OUTSTANDING_TOTAL_PAISE);
    expect(byId.top_item.vars.item).toBe('Rice');
    expect(byId.busy_day.vars.dow).toBe(5);
  });

  it('adds a delta clause only when today clearly differs from the average', () => {
    const up = buildOwnerNudges({ payments_today_paise: 100000, trailing_daily_avg_paise: 40000 });
    expect(up[0].key).toBe('own.nudge.collected_today_up');
    expect(up[0].delta_paise).toBe(60000);

    const down = buildOwnerNudges({ payments_today_paise: 40000, trailing_daily_avg_paise: 100000 });
    expect(down[0].key).toBe('own.nudge.collected_today_down');
    expect(down[0].delta_paise).toBe(60000);

    // A tiny difference stays on the base key (below the delta floor).
    const flat = buildOwnerNudges({ payments_today_paise: 50000, trailing_daily_avg_paise: 49000 });
    expect(flat[0].key).toBe('own.nudge.collected_today');
    expect(flat[0].delta_paise).toBeUndefined();
  });

  it('emits nothing for an empty shop and never throws on partial data', () => {
    expect(buildOwnerNudges({})).toEqual([]);
    expect(buildOwnerNudges()).toEqual([]);
    expect(Array.isArray(buildOwnerNudges({ payments_today_paise: 0 }))).toBe(true);
    expect(buildOwnerNudges({ payments_today_paise: 0 })).toEqual([]);
  });
});

describe('GET /api/insights/owner — shop A (owner)', () => {
  let body;
  beforeAll(async () => {
    const res = await withToken(request(app).get('/api/insights/owner'), ownerA.token);
    expect(res.status).toBe(200);
    body = res.body;
  });

  it('returns { nudges, generated_at }', () => {
    expect(Array.isArray(body.nudges)).toBe(true);
    expect(typeof body.generated_at).toBe('string');
    expect(body.nudges.length).toBeGreaterThan(0);
  });

  it('collected_today reflects today\'s cash+upi in exact paise', () => {
    const n = body.nudges.find((x) => x.id === 'collected_today');
    expect(n).toBeDefined();
    expect(n.amount_paise).toBe(COLLECTED_TODAY_PAISE);
    expect(Number.isInteger(n.amount_paise)).toBe(true);
  });

  it('dues_pending has the right stale count + total, and is actionable', () => {
    const n = body.nudges.find((x) => x.id === 'dues_pending');
    expect(n).toBeDefined();
    expect(n.vars.n).toBe(1);
    expect(n.amount_paise).toBe(OLD_DUE_PAISE);
    expect(n.vars.days).toBe(THRESHOLDS.DUES_STALE_DAYS);
    expect(n.action).toBe('remind');
  });

  it('near_limit fires for the 95%-of-limit customer', () => {
    const n = body.nudges.find((x) => x.id === 'near_limit');
    expect(n).toBeDefined();
    expect(n.vars.n).toBe(1);
  });

  it('outstanding_total sums only THIS shop\'s positive balances (isolation)', () => {
    const n = body.nudges.find((x) => x.id === 'outstanding_total');
    expect(n).toBeDefined();
    // Exactly the two shop-A balances — shop B\'s ₹9,999.99 must NOT be included.
    expect(n.amount_paise).toBe(OUTSTANDING_TOTAL_PAISE);
    expect(n.amount_paise).not.toBe(SHOP_B_BAL_PAISE);
  });

  it('top_item is the best seller by quantity (Rice)', () => {
    const n = body.nudges.find((x) => x.id === 'top_item');
    expect(n).toBeDefined();
    expect(n.vars.item).toBe('Rice');
  });
});

describe('GET /api/insights/owner — auth + scoping', () => {
  it('staff of the same shop can see it (auth gate: staff ok)', async () => {
    const res = await withToken(request(app).get('/api/insights/owner'), staffA.token);
    expect(res.status).toBe(200);
    const n = res.body.nudges.find((x) => x.id === 'collected_today');
    expect(n.amount_paise).toBe(COLLECTED_TODAY_PAISE);
  });

  it('owner of ANOTHER shop sees their own data only — never shop A\'s', async () => {
    const res = await withToken(request(app).get('/api/insights/owner'), ownerB.token);
    expect(res.status).toBe(200);
    const out = res.body.nudges.find((x) => x.id === 'outstanding_total');
    expect(out.amount_paise).toBe(SHOP_B_BAL_PAISE); // shop B\'s own balance
    expect(out.amount_paise).not.toBe(OUTSTANDING_TOTAL_PAISE);
    // Shop A\'s collections must not leak into shop B\'s nudges.
    expect(res.body.nudges.some((x) => x.id === 'collected_today')).toBe(false);
  });

  it('a fresh shop with no data returns a friendly empty payload', async () => {
    const res = await withToken(request(app).get('/api/insights/owner'), ownerC.token);
    expect(res.status).toBe(200);
    expect(res.body.nudges).toEqual([]);
    expect(typeof res.body.generated_at).toBe('string');
  });

  it('401 without a token', async () => {
    const res = await request(app).get('/api/insights/owner');
    expect(res.status).toBe(401);
  });
});
