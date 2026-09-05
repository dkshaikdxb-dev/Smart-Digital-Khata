// Integration tests for idempotent khata writes (offline/2G replay safety).
// Requires a real Postgres (DATABASE_URL) with migrations 0001..0018 applied.
// See the PR/task notes for the one-liner that spins up a throwaway cluster.
const crypto = require('crypto');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

let token;
let shopId;
let alice;

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

async function createCustomer(name, phone, extra = {}) {
  const res = await auth(request(app).post('/api/customers')).send({ name, phone, ...extra });
  expect(res.status).toBe(201);
  return res.body.customer;
}

function post(body) {
  return auth(request(app).post('/api/transactions')).send(body);
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const reg = await request(app).post('/api/auth/register').send({
    name: 'Idem Owner',
    email: `idem_${uniq}@test.local`,
    phone: `+9198${uniq}`,
    password: 'password123',
    shopName: 'Idempotency Test Shop',
  });
  expect(reg.status).toBe(201);
  token = reg.body.token;
  shopId = reg.body.shop.id;

  alice = await createCustomer('Alice', `+9190${uniq}`);
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.end();
});

describe('transaction idempotency', () => {
  it('same client_request_id twice → one row, balance applied once, same tx id', async () => {
    const crid = crypto.randomUUID();

    const first = await post({ customer_id: alice.id, type: 'purchase', amount: 5000, client_request_id: crid });
    expect(first.status).toBe(201);
    expect(Number(first.body.customer.balance)).toBe(5000);
    const txId = first.body.transaction.id;

    const second = await post({ customer_id: alice.id, type: 'purchase', amount: 5000, client_request_id: crid });
    expect(second.status).toBe(201);
    // Same row returned, and the balance reflects the CURRENT (single) apply.
    expect(second.body.transaction.id).toBe(txId);
    expect(Number(second.body.customer.balance)).toBe(5000);

    // Exactly one row persisted for this idempotency key.
    const rows = await pool.query(
      'SELECT COUNT(*)::int AS n FROM transactions WHERE shop_id=$1 AND client_request_id=$2',
      [shopId, crid]
    );
    expect(rows.rows[0].n).toBe(1);

    const c = await pool.query('SELECT balance FROM customers WHERE id=$1', [alice.id]);
    expect(Number(c.rows[0].balance)).toBe(5000);
  });

  it('different client_request_id → two rows, balance applied twice', async () => {
    const before = await pool.query('SELECT balance FROM customers WHERE id=$1', [alice.id]);
    const start = Number(before.rows[0].balance);

    const a = await post({ customer_id: alice.id, type: 'purchase', amount: 3000, client_request_id: crypto.randomUUID() });
    const b = await post({ customer_id: alice.id, type: 'purchase', amount: 3000, client_request_id: crypto.randomUUID() });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.transaction.id).not.toBe(b.body.transaction.id);

    const c = await pool.query('SELECT balance FROM customers WHERE id=$1', [alice.id]);
    expect(Number(c.rows[0].balance)).toBe(start + 6000);
  });

  it('omitted client_request_id → works as before, no dedupe', async () => {
    const before = await pool.query('SELECT balance FROM customers WHERE id=$1', [alice.id]);
    const start = Number(before.rows[0].balance);

    const a = await post({ customer_id: alice.id, type: 'cash', amount: 1000 });
    const b = await post({ customer_id: alice.id, type: 'cash', amount: 1000 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.transaction.id).not.toBe(b.body.transaction.id);
    expect(a.body.transaction.client_request_id).toBeNull();

    const c = await pool.query('SELECT balance FROM customers WHERE id=$1', [alice.id]);
    expect(Number(c.rows[0].balance)).toBe(start - 2000);
  });

  it('idempotent replay does not re-trigger credit-limit rejection', async () => {
    const uniq = Date.now().toString().slice(-9);
    // Tight limit of ₹100 (10000 paise).
    const bob = await createCustomer('Bob', `+9195${uniq}`, { credit_limit: 10000 });
    const crid = crypto.randomUUID();

    // First write brings the balance right up to the limit — allowed.
    const first = await post({ customer_id: bob.id, type: 'purchase', amount: 10000, client_request_id: crid });
    expect(first.status).toBe(201);
    expect(Number(first.body.customer.balance)).toBe(10000);

    // Replaying the exact same write must return the stored row (201), NOT a 422
    // credit-limit rejection, and must not move the balance.
    const replay = await post({ customer_id: bob.id, type: 'purchase', amount: 10000, client_request_id: crid });
    expect(replay.status).toBe(201);
    expect(replay.body.transaction.id).toBe(first.body.transaction.id);
    expect(Number(replay.body.customer.balance)).toBe(10000);

    // A genuinely new purchase over the limit is still rejected.
    const over = await post({ customer_id: bob.id, type: 'purchase', amount: 1, client_request_id: crypto.randomUUID() });
    expect(over.status).toBe(422);
  });
});
