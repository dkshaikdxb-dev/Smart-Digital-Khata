// Integration tests for Phase A "My Account": profiles (owner + consumer) and
// the reusable account statement (opening/closing math + CSV). Requires a real
// Postgres (DATABASE_URL) with migrations applied incl. 0021_my_account. See the
// task notes for the throwaway-cluster one-liner.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

const CUST_PHONE = toE164(`98${uniq}`);

let ownerA;
let ownerB;
let custA; // customers row (ownerA shop) with phone = CUST_PHONE
let custB; // customers row (ownerB shop) with phone = CUST_PHONE
let custUserId; // customer_users.id for CUST_PHONE

function customerToken(phone, sub) {
  return jwt.sign({ sub, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function register(prefix, u) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${u}@test.local`,
    phone: `+9199${u}`,
    password: 'password123',
    shopName: `${prefix} Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop, user: res.body.user };
}

beforeAll(async () => {
  ownerA = await register('AcctA', uniq);
  ownerB = await register('AcctB', `${uniq}1`.slice(-9));

  const cA = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,'Ravi Kumar',$2,0,0) RETURNING id`,
    [ownerA.shop.id, CUST_PHONE]
  );
  custA = cA.rows[0].id;

  const cB = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
     VALUES ($1,'Ravi K',$2,0,0) RETURNING id`,
    [ownerB.shop.id, CUST_PHONE]
  );
  custB = cB.rows[0].id;

  const cu = await pool.query(
    `INSERT INTO customer_users (phone, name) VALUES ($1,'Ravi Kumar') RETURNING id`,
    [CUST_PHONE]
  );
  custUserId = cu.rows[0].id;

  // Seed custA transactions across dates (all timestamps at midday UTC so the
  // date-range boundaries never straddle a day for any reasonable session TZ).
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, created_at) VALUES
      ($1,$2,'purchase',10000,'credit','Jan 1 groceries', '2026-01-01 12:00:00+00'),
      ($1,$2,'purchase', 5000,'credit','Jan 10 milk',     '2026-01-10 12:00:00+00'),
      ($1,$2,'cash',     3000,'cash',  'Feb 1 payment',   '2026-02-01 12:00:00+00'),
      ($1,$2,'purchase', 2000,'credit','Feb 15 oil',      '2026-02-15 12:00:00+00'),
      ($1,$2,'upi',      4000,'upi',   'Mar 1 payment',   '2026-03-01 12:00:00+00')`,
    [ownerA.shop.id, custA]
  );

  // custB: a single purchase so the all-shops combined view has two shops.
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, created_at) VALUES
      ($1,$2,'purchase',6000,'credit','Jan 20 rice','2026-01-20 12:00:00+00')`,
    [ownerB.shop.id, custB]
  );
});

afterAll(async () => {
  for (const id of [ownerA?.shop?.id, ownerB?.shop?.id]) {
    if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  }
  for (const id of [ownerA?.user?.id, ownerB?.user?.id]) {
    if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
  if (custUserId) await pool.query('DELETE FROM customer_users WHERE id = $1', [custUserId]);
  await pool.end();
});

describe('owner personal profile (/api/me/profile)', () => {
  it('GET returns the signed-in user profile incl. optional PII fields', async () => {
    const res = await withToken(request(app).get('/api/me/profile'), ownerA.token);
    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(ownerA.user.id);
    expect(res.body.profile.role).toBe('owner');
    expect(res.body.profile).toHaveProperty('gender');
    expect(res.body.profile).toHaveProperty('date_of_birth');
  });

  it('PATCH updates optional fields; gender enum + past dob accepted', async () => {
    const res = await withToken(request(app).patch('/api/me/profile'), ownerA.token)
      .send({ gender: 'male', date_of_birth: '1990-05-20', name: 'Acct A Owner' });
    expect(res.status).toBe(200);
    expect(res.body.profile.gender).toBe('male');
    expect(res.body.profile.date_of_birth).toContain('1990-05-20');
    expect(res.body.profile.name).toBe('Acct A Owner');
  });

  it('rejects an invalid gender (400)', async () => {
    const res = await withToken(request(app).patch('/api/me/profile'), ownerA.token)
      .send({ gender: 'unknown' });
    expect(res.status).toBe(400);
  });

  it('rejects a future date_of_birth (400)', async () => {
    const res = await withToken(request(app).patch('/api/me/profile'), ownerA.token)
      .send({ date_of_birth: '2999-01-01' });
    expect(res.status).toBe(400);
  });

  it('email stays UNIQUE — clashing with another user is 409', async () => {
    const res = await withToken(request(app).patch('/api/me/profile'), ownerA.token)
      .send({ email: ownerB.user.email });
    expect(res.status).toBe(409);
  });

  it('optional fields are omittable — a name-only PATCH still succeeds', async () => {
    const res = await withToken(request(app).patch('/api/me/profile'), ownerA.token)
      .send({ name: 'Acct A Owner 2' });
    expect(res.status).toBe(200);
    expect(res.body.profile.name).toBe('Acct A Owner 2');
    // gender set earlier is untouched.
    expect(res.body.profile.gender).toBe('male');
  });
});

describe('consumer profile (/api/customer-auth/profile)', () => {
  const token = () => customerToken(CUST_PHONE, custUserId);

  it('PATCH updates customer_users; phone stays the login id (unchanged)', async () => {
    const res = await withToken(request(app).patch('/api/customer-auth/profile'), token())
      .send({ name: 'Ravi K', email: 'ravi@test.local', gender: 'male', date_of_birth: '1992-03-04' });
    expect(res.status).toBe(200);
    expect(res.body.customer_user.name).toBe('Ravi K');
    expect(res.body.customer_user.email).toBe('ravi@test.local');
    expect(res.body.customer_user.gender).toBe('male');
    expect(res.body.customer_user.phone).toBe(CUST_PHONE);
  });

  it('GET /me now returns gender/email/date_of_birth', async () => {
    const res = await withToken(request(app).get('/api/customer-auth/me'), token());
    expect(res.status).toBe(200);
    expect(res.body.customer_user.email).toBe('ravi@test.local');
    expect(res.body.customer_user.gender).toBe('male');
    expect(res.body.customer_user.date_of_birth).toContain('1992-03-04');
  });

  it('rejects a future date_of_birth (400)', async () => {
    const res = await withToken(request(app).patch('/api/customer-auth/profile'), token())
      .send({ date_of_birth: '2999-01-01' });
    expect(res.status).toBe(400);
  });
});

describe('account statement math', () => {
  const FROM = '2026-01-05';
  const TO = '2026-02-20';
  // opening = deltas before FROM = +10000 (Jan 1)
  // in range: Jan 10 +5000, Feb 1 -3000, Feb 15 +2000 = +4000
  // closing = 14000; purchases = 7000; paid = 3000; Mar 1 excluded.
  const EXP = { opening: 10000, closing: 14000, purchases: 7000, paid: 3000, lines: 3 };

  it('owner GET /api/customers/:id/statement is exact for a sub-range', async () => {
    const res = await withToken(
      request(app).get(`/api/customers/${custA}/statement?from=${FROM}&to=${TO}`),
      ownerA.token
    );
    expect(res.status).toBe(200);
    const s = res.body.statement;
    expect(s.opening).toBe(EXP.opening);
    expect(s.closing).toBe(EXP.closing);
    expect(s.total_purchases).toBe(EXP.purchases);
    expect(s.total_paid).toBe(EXP.paid);
    expect(s.lines).toHaveLength(EXP.lines);
    // Running balance on the last line equals the closing balance.
    expect(s.lines[s.lines.length - 1].balance).toBe(EXP.closing);
  });

  it('owner statement CSV returns text/csv with the totals', async () => {
    const res = await withToken(
      request(app).get(`/api/customers/${custA}/statement?from=${FROM}&to=${TO}&format=csv`),
      ownerA.token
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.text).toMatch(/Opening balance/);
    expect(res.text).toMatch(/140\.00/); // closing 14000 paise
  });

  it("owner statement is shop-scoped — another shop's customer is 404", async () => {
    const res = await withToken(
      request(app).get(`/api/customers/${custA}/statement?from=${FROM}&to=${TO}`),
      ownerB.token
    );
    expect(res.status).toBe(404);
  });

  it('rejects from > to (400)', async () => {
    const res = await withToken(
      request(app).get(`/api/customers/${custA}/statement?from=2026-05-01&to=2026-01-01`),
      ownerA.token
    );
    expect(res.status).toBe(400);
  });

  it('consumer GET /api/my/statement?shop_id matches the same math', async () => {
    const res = await request(app)
      .get(`/api/my/statement?shop_id=${ownerA.shop.id}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE, custUserId)}`);
    expect(res.status).toBe(200);
    const s = res.body.shop.statement;
    expect(s.opening).toBe(EXP.opening);
    expect(s.closing).toBe(EXP.closing);
    expect(s.total_purchases).toBe(EXP.purchases);
    expect(s.total_paid).toBe(EXP.paid);
  });

  it('consumer all-shops statement groups by shop with a combined total', async () => {
    const res = await request(app)
      .get(`/api/my/statement?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE, custUserId)}`);
    expect(res.status).toBe(200);
    expect(res.body.shops).toHaveLength(2);
    // ownerB shop: single Jan 20 +6000 purchase in range → closing 6000.
    // Combined closing = 14000 (A) + 6000 (B) = 20000.
    expect(res.body.combined.closing).toBe(20000);
    expect(res.body.combined.total_purchases).toBe(EXP.purchases + 6000);
  });

  it('consumer statement CSV returns text/csv', async () => {
    const res = await request(app)
      .get(`/api/my/statement?shop_id=${ownerA.shop.id}&from=${FROM}&to=${TO}&format=csv`)
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE, custUserId)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('rejects an owner token on the consumer statement (401)', async () => {
    const res = await request(app)
      .get(`/api/my/statement?shop_id=${ownerA.shop.id}`)
      .set('Authorization', `Bearer ${ownerA.token}`);
    expect(res.status).toBe(401);
  });
});
