// Integration tests for the Family Payments feature. Requires a real Postgres
// (DATABASE_URL) with the migrations applied. See the PR/task notes for the
// one-liner that spins up a throwaway cluster.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

let token;
let shopId;
// customers
let alice; let bob; let carol; let outsider;

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

async function createCustomer(name, phone) {
  const res = await auth(request(app).post('/api/customers')).send({ name, phone });
  expect(res.status).toBe(201);
  return res.body.customer;
}

async function purchase(customerId, amount) {
  return auth(request(app).post('/api/transactions')).send({
    customer_id: customerId,
    type: 'purchase',
    amount,
  });
}

beforeAll(async () => {
  // Unique email/phone per run so repeated local runs don't collide.
  const uniq = Date.now().toString().slice(-9);
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Fam Owner',
    email: `fam_${uniq}@test.local`,
    phone: `+9199${uniq}`,
    password: 'password123',
    shopName: 'Family Test Shop',
  });
  expect(reg.status).toBe(201);
  token = reg.body.token;
  shopId = reg.body.shop.id;

  alice = await createCustomer('Alice', `+9190${uniq}`);
  bob = await createCustomer('Bob', `+9191${uniq}`);
  carol = await createCustomer('Carol', `+9192${uniq}`);
  outsider = await createCustomer('Outsider', `+9193${uniq}`);
});

afterAll(async () => {
  // Clean up this run's shop (cascades to customers/families/transactions).
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.end();
});

describe('families', () => {
  let familyId;

  it('creates a family with members and a payer', async () => {
    const res = await auth(request(app).post('/api/families')).send({
      name: 'Sharma',
      credit_limit: 50000, // ₹500
      payer_customer_id: alice.id,
      member_ids: [alice.id, bob.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.family.name).toBe('Sharma');
    expect(res.body.family.payer_customer_id).toBe(alice.id);
    familyId = res.body.family.id;

    // Members were linked.
    const detail = await auth(request(app).get(`/api/families/${familyId}`));
    expect(detail.status).toBe(200);
    expect(detail.body.members).toHaveLength(2);
    expect(detail.body.payer.id).toBe(alice.id);
    expect(detail.body.combined_limit).toBe(50000);
  });

  it('lists families with member count and combined balance', async () => {
    const res = await auth(request(app).get('/api/families'));
    expect(res.status).toBe(200);
    const fam = res.body.items.find((f) => f.id === familyId);
    expect(Number(fam.member_count)).toBe(2);
    expect(Number(fam.combined_balance)).toBe(0);
  });

  it('adds and removes a member', async () => {
    const add = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: carol.id,
      sub_limit: 10000,
    });
    expect(add.status).toBe(201);
    expect(add.body.member.id).toBe(carol.id);
    expect(Number(add.body.member.sub_limit)).toBe(10000);

    let detail = await auth(request(app).get(`/api/families/${familyId}`));
    expect(detail.body.members).toHaveLength(3);

    const del = await auth(
      request(app).delete(`/api/families/${familyId}/members/${carol.id}`)
    );
    expect(del.status).toBe(200);

    detail = await auth(request(app).get(`/api/families/${familyId}`));
    expect(detail.body.members).toHaveLength(2);
    // sub_limit cleared on removal.
    const c = await pool.query('SELECT family_id, family_sub_limit FROM customers WHERE id=$1', [carol.id]);
    expect(c.rows[0].family_id).toBeNull();
    expect(c.rows[0].family_sub_limit).toBeNull();
  });

  it('rejects adding a customer that is already in another family', async () => {
    const other = await auth(request(app).post('/api/families')).send({
      name: 'Verma',
      member_ids: [outsider.id],
    });
    expect(other.status).toBe(201);

    const res = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: outsider.id,
    });
    expect(res.status).toBe(409);
  });

  it('blocks a purchase that exceeds the member family_sub_limit (422)', async () => {
    // Give Bob a tight sub-limit of ₹100.
    const add = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: bob.id,
      sub_limit: 10000,
    });
    expect(add.status).toBe(201);

    const ok = await purchase(bob.id, 8000); // ₹80 — under sub-limit
    expect(ok.status).toBe(201);

    const blocked = await purchase(bob.id, 5000); // would reach ₹130 > ₹100
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toMatch(/sub-limit/i);
  });

  it('blocks a purchase that exceeds the shared family credit_limit (422)', async () => {
    // Family limit is ₹500. Bob already owes ₹80 (from the sub-limit test).
    // Push Alice near the shared ceiling, then a small extra tips it over.
    const p1 = await purchase(alice.id, 40000); // ₹400 → combined ₹480
    expect(p1.status).toBe(201);

    const blocked = await purchase(alice.id, 5000); // combined would be ₹530 > ₹500
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toMatch(/family credit limit/i);

    // A non-family customer is unaffected by family limits.
    const free = await purchase(outsider.id, 100000);
    expect(free.status).toBe(201);
  });

  it('aggregates all members transactions in the statement, newest first', async () => {
    const res = await auth(request(app).get(`/api/families/${familyId}/statement`));
    expect(res.status).toBe(200);
    // Alice: 1 purchase (₹400). Bob: 1 purchase (₹80). = 2 successful entries.
    expect(res.body.transactions.length).toBe(2);
    const customerIds = res.body.transactions.map((t) => t.customer_id);
    expect(customerIds).toContain(alice.id);
    expect(customerIds).toContain(bob.id);
    // Newest first.
    const times = res.body.transactions.map((t) => new Date(t.created_at).getTime());
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
  });

  it('remind returns 422 when no payer is set', async () => {
    const noPayer = await auth(request(app).post('/api/families')).send({
      name: 'NoPayer',
      member_ids: [],
    });
    expect(noPayer.status).toBe(201);
    const res = await auth(
      request(app).post(`/api/families/${noPayer.body.family.id}/remind`)
    );
    expect(res.status).toBe(422);
  });

  it('sends one combined reminder to the payer', async () => {
    const res = await auth(request(app).post(`/api/families/${familyId}/remind`));
    expect(res.status).toBe(200);
    // WhatsApp is unconfigured in tests → sendText returns {skipped}, still ok.
    expect(res.body.ok).toBe(true);
    expect(res.body.combined_outstanding).toBeGreaterThan(0);
  });

  it('returns 404 for a family in another shop / nonexistent', async () => {
    const res = await auth(
      request(app).get('/api/families/00000000-0000-0000-0000-000000000000')
    );
    expect(res.status).toBe(404);
  });
});
