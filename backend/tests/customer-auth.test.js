// Integration tests for Customer Accounts + OTP Auth. Requires a real Postgres
// (DATABASE_URL) with the migrations applied. See the task notes for the
// one-liner that spins up a throwaway cluster.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

// Unique phone/emails per run so repeated local runs don't collide.
const uniq = Date.now().toString().slice(-9);
const PHONE = `+9198${uniq}`;
const OTHER_PHONE = `+9177${uniq}`;

let shop1Id;
let shop2Id;
let shop2ExtraId;
let owner1Id;
let owner2Id;

async function seedShopWithCustomer({ ownerEmail, shopName, custName, custPhone, balance }) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [custName + ' Owner', ownerEmail, `+9190${uniq}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, shopName]
  );
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4)`,
    [shopId, custName, custPhone, balance]
  );
  return { ownerId, shopId };
}

beforeAll(async () => {
  const s1 = await seedShopWithCustomer({
    ownerEmail: `owner1_${uniq}@test.local`,
    shopName: 'Ravi Store',
    custName: 'Ravi Kumar',
    custPhone: PHONE,
    balance: 15000, // ₹150 owed
  });
  shop1Id = s1.shopId;
  owner1Id = s1.ownerId;

  const s2 = await seedShopWithCustomer({
    ownerEmail: `owner2_${uniq}@test.local`,
    shopName: 'Meena Mart',
    custName: 'Ravi K',
    custPhone: PHONE,
    balance: -5000, // ₹50 in credit
  });
  shop2Id = s2.shopId;
  owner2Id = s2.ownerId;

  // An unrelated customer with a different phone — must never appear for PHONE.
  const other = await seedShopWithCustomer({
    ownerEmail: `owner3_${uniq}@test.local`,
    shopName: 'Other Shop',
    custName: 'Someone Else',
    custPhone: OTHER_PHONE,
    balance: 9999,
  });
  // Track the extra shop for teardown.
  shop2ExtraId = other.shopId;
});

afterAll(async () => {
  for (const id of [shop1Id, shop2Id, shop2ExtraId]) {
    if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  }
  for (const id of [owner1Id, owner2Id]) {
    if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`owner3_${uniq}@test.local`]);
  await pool.query('DELETE FROM customer_users WHERE phone = $1', [PHONE]);
  await pool.query('DELETE FROM customer_otps WHERE phone = $1', [PHONE]);
  await pool.end();
});

describe('customer-auth', () => {
  let devCode;
  let token;

  it('request-otp returns ok and a dev_code in non-production', async () => {
    const res = await request(app).post('/api/customer-auth/request-otp').send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dev_code).toMatch(/^[0-9]{6}$/);
    devCode = res.body.dev_code;

    // Stored only as a bcrypt hash, never plaintext.
    const row = await pool.query('SELECT code_hash FROM customer_otps WHERE phone = $1', [PHONE]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].code_hash).not.toBe(devCode);
    expect(row.rows[0].code_hash.startsWith('$2')).toBe(true);
  });

  it('verify-otp with the wrong code returns 401 and increments attempts', async () => {
    const wrong = devCode === '000000' ? '111111' : '000000';
    const res = await request(app)
      .post('/api/customer-auth/verify-otp')
      .send({ phone: PHONE, code: wrong });
    expect(res.status).toBe(401);

    const row = await pool.query('SELECT attempts FROM customer_otps WHERE phone = $1', [PHONE]);
    expect(row.rows[0].attempts).toBe(1);
  });

  it('verify-otp with the correct code returns a JWT and creates a customer_user', async () => {
    const res = await request(app)
      .post('/api/customer-auth/verify-otp')
      .send({ phone: PHONE, code: devCode });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.customer_user.phone).toBe(PHONE);
    // name seeded from a matching customers row.
    expect(res.body.customer_user.name).toBeTruthy();
    expect(res.body.customer_user.last_login_at).toBeTruthy();
    token = res.body.token;

    const cu = await pool.query('SELECT * FROM customer_users WHERE phone = $1', [PHONE]);
    expect(cu.rowCount).toBe(1);
    // OTP row consumed on success.
    const otp = await pool.query('SELECT 1 FROM customer_otps WHERE phone = $1', [PHONE]);
    expect(otp.rowCount).toBe(0);
  });

  it('GET /me returns the customer_user and every shop for that phone with balances', async () => {
    const res = await request(app)
      .get('/api/customer-auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.customer_user.phone).toBe(PHONE);

    const shops = res.body.shops;
    expect(Array.isArray(shops)).toBe(true);
    expect(shops).toHaveLength(2);

    const byName = Object.fromEntries(shops.map((s) => [s.shop_name, s]));
    expect(byName['Ravi Store']).toBeTruthy();
    expect(byName['Meena Mart']).toBeTruthy();
    expect(Number(byName['Ravi Store'].balance)).toBe(15000);
    expect(Number(byName['Meena Mart'].balance)).toBe(-5000);
    // Shape includes shop_id + customer_id.
    expect(byName['Ravi Store'].shop_id).toBe(shop1Id);
    expect(byName['Ravi Store'].customer_id).toBeTruthy();
    // The unrelated shop (different phone) is not present.
    expect(byName['Other Shop']).toBeUndefined();
  });

  it('rejects an expired code with 401', async () => {
    const reqOtp = await request(app)
      .post('/api/customer-auth/request-otp')
      .send({ phone: PHONE });
    expect(reqOtp.status).toBe(200);
    const code = reqOtp.body.dev_code;

    // Force the code to be expired.
    await pool.query(
      "UPDATE customer_otps SET expires_at = NOW() - INTERVAL '1 minute' WHERE phone = $1",
      [PHONE]
    );

    const res = await request(app)
      .post('/api/customer-auth/verify-otp')
      .send({ phone: PHONE, code });
    expect(res.status).toBe(401);
  });

  it('customer token cannot reach owner/admin endpoints', async () => {
    // Role-gated admin endpoint → outright 403 (customer role not allowed).
    const admin = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(admin.status);

    // Owner customer-list endpoint: a customer token carries no shopId, so it
    // can see NONE of a shop's customers (data isolation holds).
    const custList = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);
    expect(custList.body.items || []).toHaveLength(0);
  });
});
