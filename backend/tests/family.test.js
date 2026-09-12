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

// A member who already OWES brings that balance into the shared line, so the
// family credit_limit (and a supplied sub_limit) are re-validated on every
// membership change with the SAME semantics as transaction.create:
// credit_limit > 0 enforced (0 = unlimited), reject when combined > limit.
describe('family credit limit is re-checked on membership changes', () => {
  const LIMIT = 50000; // ₹500
  let familyId;
  let anchor; let heavy; let light; let f1; let f2;

  async function familyOf(customerId) {
    const r = await pool.query('SELECT family_id, family_sub_limit FROM customers WHERE id=$1', [customerId]);
    return r.rows[0];
  }

  beforeAll(async () => {
    const uniq = Date.now().toString().slice(-8);
    anchor = await createCustomer('Anchor Member', `+9170${uniq}`);
    heavy = await createCustomer('Heavy Debtor', `+9171${uniq}`);
    light = await createCustomer('Light Debtor', `+9172${uniq}`);
    f1 = await createCustomer('Founder One', `+9173${uniq}`);
    f2 = await createCustomer('Founder Two', `+9174${uniq}`);
    // Balances (in paise) BEFORE any family exists: anchor ₹300, heavy ₹300,
    // light ₹100, founders ₹300 each.
    expect((await purchase(anchor.id, 30000)).status).toBe(201);
    expect((await purchase(heavy.id, 30000)).status).toBe(201);
    expect((await purchase(light.id, 10000)).status).toBe(201);
    expect((await purchase(f1.id, 30000)).status).toBe(201);
    expect((await purchase(f2.id, 30000)).status).toBe(201);

    const res = await auth(request(app).post('/api/families')).send({
      name: 'Limited',
      credit_limit: LIMIT,
      member_ids: [anchor.id],
    });
    expect(res.status).toBe(201);
    familyId = res.body.family.id;
  });

  it('addMember: a member whose balance would push the family over its limit -> 409, family unchanged', async () => {
    // ₹300 (anchor) + ₹300 (heavy) = ₹600 > ₹500.
    const res = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: heavy.id,
    });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('family_limit_exceeded');
    expect(res.body.error).toMatch(/family credit limit exceeded/i);
    expect(res.body.details.family_credit_limit).toBe(LIMIT);
    expect(res.body.details.combined_balance).toBe(60000);
    expect(res.body.details.joining_balance).toBe(30000);

    // Nothing changed: heavy is still unaffiliated and the family still has one member.
    expect((await familyOf(heavy.id)).family_id).toBeNull();
    const detail = await auth(request(app).get(`/api/families/${familyId}`));
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.combined_balance).toBe(30000);
  });

  it('addMember: within the limit -> 201 (and exactly AT the limit is allowed, mirroring purchases)', async () => {
    // ₹300 + ₹100 = ₹400 <= ₹500.
    const res = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: light.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.member.id).toBe(light.id);
    expect((await familyOf(light.id)).family_id).toBe(familyId);

    // Raise light to exactly the ceiling: combined ₹500 == limit -> still fine.
    expect((await purchase(light.id, 10000)).status).toBe(201);
    const detail = await auth(request(app).get(`/api/families/${familyId}`));
    expect(detail.body.combined_balance).toBe(LIMIT);
  });

  it('addMember: re-adding an existing member to change sub_limit does not double-count their balance', async () => {
    // Family sits exactly at the limit; re-adding light (₹200) must not count ₹200 twice.
    const res = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: light.id,
      sub_limit: 25000,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.member.sub_limit)).toBe(25000);
  });

  it('addMember: a sub_limit already exceeded by the member balance -> 409 family_sub_limit_exceeded', async () => {
    const res = await auth(request(app).post(`/api/families/${familyId}/members`)).send({
      customer_id: light.id,
      sub_limit: 15000, // light owes ₹200 > ₹150
    });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('family_sub_limit_exceeded');
    expect(res.body.details.current_balance).toBe(20000);
    // The previous sub-limit is untouched.
    expect(Number((await familyOf(light.id)).family_sub_limit)).toBe(25000);
  });

  it('create with members over the limit -> 409 and no family / no links are created', async () => {
    const res = await auth(request(app).post('/api/families')).send({
      name: 'Overdrawn',
      credit_limit: LIMIT,
      payer_customer_id: f1.id,
      member_ids: [f1.id, f2.id], // ₹300 + ₹300 = ₹600 > ₹500
    });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('family_limit_exceeded');
    expect(res.body.details.combined_balance).toBe(60000);

    const list = await auth(request(app).get('/api/families'));
    expect(list.body.items.find((f) => f.name === 'Overdrawn')).toBeUndefined();
    expect((await familyOf(f1.id)).family_id).toBeNull();
    expect((await familyOf(f2.id)).family_id).toBeNull();
  });

  it('create with credit_limit 0 (unlimited) accepts any combined balance, and a fitting limit is 201', async () => {
    const unlimited = await auth(request(app).post('/api/families')).send({
      name: 'Unlimited',
      credit_limit: 0,
      member_ids: [f1.id, f2.id],
    });
    expect(unlimited.status).toBe(201);
    // Undo so the founders can be reused.
    for (const id of [f1.id, f2.id]) {
      // eslint-disable-next-line no-await-in-loop
      const del = await auth(request(app).delete(`/api/families/${unlimited.body.family.id}/members/${id}`));
      expect(del.status).toBe(200);
    }

    const fits = await auth(request(app).post('/api/families')).send({
      name: 'Fits',
      credit_limit: 60000, // exactly ₹600 — combined == limit is allowed
      member_ids: [f1.id, f2.id],
    });
    expect(fits.status).toBe(201);
  });
});

// Member names are localized the same way /customers does it (name_local),
// under the same ?lang= rule; the family label itself is owner-typed and is
// never localized.
describe('family name_local / customer_name_local (?lang=)', () => {
  let familyId;
  let member;

  beforeAll(async () => {
    const uniq = Date.now().toString().slice(-8);
    member = await createCustomer('Ramesh Kumar', `+9175${uniq}`);
    const res = await auth(request(app).post('/api/families')).send({
      name: 'Kumar Household',
      payer_customer_id: member.id,
      member_ids: [member.id],
    });
    expect(res.status).toBe(201);
    familyId = res.body.family.id;
    expect((await purchase(member.id, 2500)).status).toBe(201);
  });

  const TELUGU = /[\u0C00-\u0C7F]/;

  it('GET /families/:id?lang=te adds name_local to each member and the payer; label untouched', async () => {
    const res = await auth(request(app).get(`/api/families/${familyId}?lang=te`));
    expect(res.status).toBe(200);
    const m = res.body.members.find((x) => x.id === member.id);
    expect(m.name).toBe('Ramesh Kumar');
    expect(typeof m.name_local).toBe('string');
    expect(m.name_local.length).toBeGreaterThan(0);
    expect(m.name_local).toMatch(TELUGU);
    expect(res.body.payer.id).toBe(member.id);
    expect(res.body.payer.name_local).toBe(m.name_local);
    expect(res.body.family.name).toBe('Kumar Household');
    expect(res.body.family.name_local).toBeUndefined();
    // Rest of the payload is unchanged.
    expect(Object.keys(m).sort()).toEqual(['balance', 'id', 'name', 'name_local', 'phone', 'sub_limit']);
    expect(res.body.combined_balance).toBe(2500);
  });

  it('GET /families/:id with no lang / lang=en / unknown lang omits name_local', async () => {
    for (const q of ['', '?lang=en', '?lang=xx']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await auth(request(app).get(`/api/families/${familyId}${q}`));
      expect(res.status).toBe(200);
      const m = res.body.members.find((x) => x.id === member.id);
      expect(m.name).toBe('Ramesh Kumar');
      expect(m.name_local).toBeUndefined();
      expect(res.body.payer.name_local).toBeUndefined();
      expect(Object.keys(m).sort()).toEqual(['balance', 'id', 'name', 'phone', 'sub_limit']);
    }
  });

  it('GET /families/:id/statement?lang=te adds customer_name_local beside customer_name; absent without lang', async () => {
    const withLang = await auth(request(app).get(`/api/families/${familyId}/statement?lang=te`));
    expect(withLang.status).toBe(200);
    expect(withLang.body.transactions).toHaveLength(1);
    const row = withLang.body.transactions[0];
    expect(row.customer_name).toBe('Ramesh Kumar');
    expect(row.customer_name_local).toMatch(TELUGU);
    expect(Object.keys(row).sort()).toEqual(
      ['amount', 'created_at', 'customer_id', 'customer_name', 'customer_name_local', 'id', 'method', 'note', 'type']
    );

    const noLang = await auth(request(app).get(`/api/families/${familyId}/statement`));
    expect(noLang.status).toBe(200);
    expect(noLang.body.transactions[0].customer_name).toBe('Ramesh Kumar');
    expect(noLang.body.transactions[0].customer_name_local).toBeUndefined();
  });
});
