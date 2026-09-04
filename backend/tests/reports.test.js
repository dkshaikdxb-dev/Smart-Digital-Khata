// Integration tests for the Reports (CSV) + Analytics feature. Requires a real
// Postgres (DATABASE_URL) with migrations applied. Owner tokens come from
// /api/auth/register (like the other suites); shops/customers/transactions are
// seeded directly via SQL so amounts/dates are fully controlled.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const DAY = 24 * 60 * 60 * 1000;

let token; let shopId; // primary shop under test
let token2; let shopId2; // a second shop, to prove cross-shop isolation
let foreignCustomerId; // a customer that lives in shop2

const auth = (req, t = token) => req.set('Authorization', `Bearer ${t}`);

async function register(label) {
  const uniq = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`;
  const res = await request(app).post('/api/auth/register').send({
    name: `${label} Owner`,
    email: `${label.toLowerCase()}_${uniq}@test.local`,
    phone: `+9198${uniq}`.slice(0, 15),
    password: 'password123',
    shopName: `${label} Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shopId: res.body.shop.id };
}

async function seedCustomer(shop, opts) {
  const {
    name, phone, credit_limit = 0, balance = 0, status = 'active', createdAt = null,
  } = opts;
  const r = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
     RETURNING id`,
    [shop, name, phone, credit_limit, balance, status, createdAt]
  );
  return r.rows[0].id;
}

async function seedTx(shop, customerId, opts) {
  const {
    type, amount, method = 'credit', createdAt = null,
  } = opts;
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))`,
    [shop, customerId, type, amount, method, createdAt]
  );
}

function csvLines(text) {
  return text.replace(/\n+$/, '').split('\n').map((l) => l.replace(/\r$/, ''));
}

const iso = (ms) => new Date(ms).toISOString();

beforeAll(async () => {
  ({ token, shopId } = await register('Rep'));
  ({ token: token2, shopId: shopId2 } = await register('Other'));

  const now = Date.now();
  const uniq = now.toString().slice(-8);

  // --- shop1: a fully controlled data set --------------------------------
  // C1 has a comma in its name (CSV escaping) and balance 0 (out of aging).
  await seedCustomer(shopId, {
    name: 'Acme, Inc.', phone: `+9190${uniq}`, credit_limit: 100000, balance: 0,
  });

  // C2 is an OLD debtor: balance 30000 paise, oldest purchase ~75 days ago
  // -> aging 61_90; that purchase is outside the 30-day overview window.
  const c2 = await seedCustomer(shopId, {
    name: 'Old Debtor', phone: `+9191${uniq}`, balance: 30000,
  });
  await seedTx(shopId, c2, { type: 'purchase', amount: 30000, createdAt: iso(now - 75 * DAY) });

  // C3 is a FRESH debtor: balance 20000 -> aging 0_30. Its recent purchase
  // (10000) and cash collection (6000) drive the overview window numbers.
  const c3 = await seedCustomer(shopId, {
    name: 'Fresh Debtor', phone: `+9192${uniq}`, balance: 20000,
  });
  await seedTx(shopId, c3, { type: 'purchase', amount: 10000, method: 'credit' });
  await seedTx(shopId, c3, { type: 'cash', amount: 6000, method: 'cash' });

  // --- shop2: one customer, to prove cross-shop 404 ----------------------
  foreignCustomerId = await seedCustomer(shopId2, {
    name: 'Foreigner', phone: `+9193${uniq}`, balance: 1000,
  });
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  if (shopId2) await pool.query('DELETE FROM shops WHERE id = $1', [shopId2]);
  await pool.end();
});

describe('reports (CSV)', () => {
  it('customers.csv returns text/csv with the right header and an escaped field', async () => {
    const res = await auth(request(app).get('/api/reports/customers.csv'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="customers.csv"');

    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Name,Phone,Credit Limit (Rs),Balance (Rs),Status,Created');

    // The comma in "Acme, Inc." must be quoted, not split into two columns.
    expect(res.text).toContain('"Acme, Inc."');
    // Credit limit 100000 paise -> "1000.00" rupees.
    const acme = lines.find((l) => l.startsWith('"Acme, Inc."'));
    expect(acme).toContain('1000.00');
    expect(acme).toContain('active');
  });

  it('transactions.csv respects the from/to filter', async () => {
    // Bracket only the ~75-day-old purchase (30000 paise -> 300.00).
    const now = Date.now();
    const res = await auth(
      request(app)
        .get('/api/reports/transactions.csv')
        .query({ from: iso(now - 80 * DAY), to: iso(now - 70 * DAY) })
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Date,Customer,Phone,Type,Method,Amount (Rs),Note');
    const dataRows = lines.slice(1);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0]).toContain('Old Debtor');
    expect(dataRows[0]).toContain('300.00');
    expect(dataRows[0]).toContain('purchase');
    // The recent transactions must be filtered out.
    expect(res.text).not.toContain('Fresh Debtor');
  });

  it('statement.csv 404s for a customer of another shop', async () => {
    const res = await auth(
      request(app).get(`/api/reports/customer/${foreignCustomerId}/statement.csv`)
    );
    expect(res.status).toBe(404);
  });

  it('statement.csv returns a valid statement for an own customer', async () => {
    // Look up C3 (Fresh Debtor) via the API's own customer list.
    const list = await auth(request(app).get('/api/customers'));
    const fresh = list.body.items.find((c) => c.name === 'Fresh Debtor');
    const res = await auth(
      request(app).get(`/api/reports/customer/${fresh.id}/statement.csv`)
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="statement-${fresh.id}.csv"`
    );
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Date,Type,Method,Amount (Rs),Note');
    expect(lines.slice(1)).toHaveLength(2); // one purchase + one cash
  });
});

describe('analytics', () => {
  it('overview computes collection_rate and totals correctly', async () => {
    const res = await auth(request(app).get('/api/analytics/overview').query({ days: 30 }));
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b.period_days).toBe(30);
    // Within 30 days: purchases 10000 paise, collections 6000 paise.
    expect(b.purchases).toBe(10000);
    expect(b.collections).toBe(6000);
    expect(b.collection_rate).toBe(0.6);
    // Outstanding = 30000 (C2) + 20000 (C3); C1 balance 0.
    expect(b.total_outstanding).toBe(50000);
    expect(b.active_customers).toBe(3);
    expect(b.customers_with_dues).toBe(2);
    expect(b.new_customers).toBe(3);
  });

  it('overview reports a 0 rate when there are no purchases', async () => {
    // shop2 has a customer but no transactions -> purchases 0 -> rate 0.
    const res = await auth(request(app).get('/api/analytics/overview').query({ days: 30 }), token2);
    expect(res.status).toBe(200);
    expect(res.body.purchases).toBe(0);
    expect(res.body.collections).toBe(0);
    expect(res.body.collection_rate).toBe(0);
    expect(res.body.total_outstanding).toBe(1000);
    expect(res.body.active_customers).toBe(1);
  });

  it('overview clamps days out of range', async () => {
    // days below 1 clamps up to 1.
    const low = await auth(request(app).get('/api/analytics/overview').query({ days: 0 }));
    expect(low.status).toBe(200);
    expect(low.body.period_days).toBe(1);

    // days above 365 clamps down to 365 rather than erroring.
    const high = await auth(request(app).get('/api/analytics/overview').query({ days: 5000 }));
    expect(high.status).toBe(200);
    expect(high.body.period_days).toBe(365);
  });

  it('aging buckets a ~75-day debt into 61_90 and a fresh debt into 0_30', async () => {
    const res = await auth(request(app).get('/api/analytics/aging'));
    expect(res.status).toBe(200);
    const b = res.body;
    expect(b['0_30']).toBe(20000); // Fresh Debtor
    expect(b['31_60']).toBe(0);
    expect(b['61_90']).toBe(30000); // Old Debtor (~75 days)
    expect(b['90_plus']).toBe(0);
    expect(b.total).toBe(50000);
  });

  it('rejects requests without an owner/staff token', async () => {
    const res = await request(app).get('/api/analytics/overview');
    expect(res.status).toBe(401);
  });
});
