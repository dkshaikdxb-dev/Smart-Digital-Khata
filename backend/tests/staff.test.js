// Integration tests for Staff Accounts. Requires a real Postgres (DATABASE_URL)
// with all migrations applied (incl. 0016_staff_accounts). See the task notes
// for the one-liner that spins up a throwaway cluster.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

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

function login(identifier, password) {
  return request(app).post('/api/auth/login').send({ email: identifier, password });
}

let ownerA;
let ownerB;

// Staff identifiers (phone globally unique across all users).
const STAFF_PHONE = `+9181${uniq}`;
const STAFF_EMAIL = `staff_${uniq}@test.local`;
const STAFF_PASS = 'staffpass1';

beforeAll(async () => {
  ownerA = await register('StaffA', uniq);
  ownerB = await register('StaffB', `${uniq}1`.slice(-9));
});

afterAll(async () => {
  if (ownerA && ownerA.shop) await pool.query('DELETE FROM shops WHERE id = $1', [ownerA.shop.id]);
  if (ownerB && ownerB.shop) await pool.query('DELETE FROM shops WHERE id = $1', [ownerB.shop.id]);
  // Owner rows are removed via shop cascade? No — users reference shop with ON
  // DELETE SET NULL, so clean the owners (and any orphaned staff) explicitly.
  await pool.query('DELETE FROM users WHERE phone = $1', [STAFF_PHONE]);
  if (ownerA) await pool.query('DELETE FROM users WHERE id = $1', [ownerA.user.id]);
  if (ownerB) await pool.query('DELETE FROM users WHERE id = $1', [ownerB.user.id]);
  await pool.end();
});

describe('staff accounts', () => {
  let staffId;

  it('owner creates a staff account (201), hash never returned', async () => {
    const res = await withToken(request(app).post('/api/staff'), ownerA.token).send({
      name: 'Asha Staff',
      phone: STAFF_PHONE,
      email: STAFF_EMAIL,
      password: STAFF_PASS,
    });
    expect(res.status).toBe(201);
    expect(res.body.staff.name).toBe('Asha Staff');
    expect(res.body.staff.phone).toBe(STAFF_PHONE);
    expect(res.body.staff.email).toBe(STAFF_EMAIL);
    expect(res.body.staff.is_active).toBe(true);
    expect(res.body.staff.created_at).toBeTruthy();
    expect(res.body.staff.password_hash).toBeUndefined();
    staffId = res.body.staff.id;
  });

  it('GET /api/staff lists the staff for the owner shop', async () => {
    const res = await withToken(request(app).get('/api/staff'), ownerA.token);
    expect(res.status).toBe(200);
    const found = res.body.items.find((s) => s.id === staffId);
    expect(found).toBeTruthy();
    expect(found.phone).toBe(STAFF_PHONE);
    expect(found.password_hash).toBeUndefined();
  });

  it('staff can log in by PHONE and gets a staff token scoped to the owner shop', async () => {
    const res = await login(STAFF_PHONE, STAFF_PASS);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('staff');
    expect(res.body.user.shop_id).toBe(ownerA.shop.id);
  });

  it('staff can log in by EMAIL as well', async () => {
    const res = await login(STAFF_EMAIL, STAFF_PASS);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('staff');
    expect(res.body.user.shop_id).toBe(ownerA.shop.id);
  });

  it('wrong password → 401', async () => {
    const res = await login(STAFF_PHONE, 'wrongpass');
    expect(res.status).toBe(401);
  });

  it('duplicate phone → 409', async () => {
    const res = await withToken(request(app).post('/api/staff'), ownerA.token).send({
      name: 'Dupe Phone',
      phone: STAFF_PHONE,
      password: STAFF_PASS,
    });
    expect(res.status).toBe(409);
  });

  it('duplicate email → 409', async () => {
    const res = await withToken(request(app).post('/api/staff'), ownerA.token).send({
      name: 'Dupe Email',
      phone: `+9182${uniq}`,
      email: STAFF_EMAIL,
      password: STAFF_PASS,
    });
    expect(res.status).toBe(409);
  });

  it('PATCH deactivate → staff login now 403; reactivate → login works', async () => {
    const off = await withToken(request(app).patch(`/api/staff/${staffId}`), ownerA.token)
      .send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.staff.is_active).toBe(false);

    const blocked = await login(STAFF_PHONE, STAFF_PASS);
    expect(blocked.status).toBe(403);

    const on = await withToken(request(app).patch(`/api/staff/${staffId}`), ownerA.token)
      .send({ is_active: true });
    expect(on.status).toBe(200);
    expect(on.body.staff.is_active).toBe(true);

    const ok = await login(STAFF_PHONE, STAFF_PASS);
    expect(ok.status).toBe(200);
  });

  it('PATCH resets password → new password works, old fails', async () => {
    const patch = await withToken(request(app).patch(`/api/staff/${staffId}`), ownerA.token)
      .send({ password: 'newpass123' });
    expect(patch.status).toBe(200);

    expect((await login(STAFF_PHONE, 'newpass123')).status).toBe(200);
    expect((await login(STAFF_PHONE, STAFF_PASS)).status).toBe(401);
  });

  it('a staff token is REJECTED (403) by owner-only staff management + billing', async () => {
    const staffLogin = await login(STAFF_PHONE, 'newpass123');
    const staffToken = staffLogin.body.token;

    const listAsStaff = await withToken(request(app).get('/api/staff'), staffToken);
    expect(listAsStaff.status).toBe(403);

    const createAsStaff = await withToken(request(app).post('/api/staff'), staffToken).send({
      name: 'Nope', phone: `+9183${uniq}`, password: STAFF_PASS,
    });
    expect(createAsStaff.status).toBe(403);

    // Billing mutation is owner-only now.
    const upgrade = await withToken(request(app).post('/api/subscriptions/upgrade'), staffToken)
      .send({ plan: 'pro' });
    expect(upgrade.status).toBe(403);

    // But a read-only subscription view stays available to staff.
    const view = await withToken(request(app).get('/api/subscriptions/me'), staffToken);
    expect(view.status).toBe(200);
  });

  it('an owner of another shop cannot PATCH or DELETE this shop staff (404)', async () => {
    const patch = await withToken(request(app).patch(`/api/staff/${staffId}`), ownerB.token)
      .send({ name: 'Hijack' });
    expect(patch.status).toBe(404);

    const del = await withToken(request(app).delete(`/api/staff/${staffId}`), ownerB.token);
    expect(del.status).toBe(404);
  });

  it('DELETE removes the staff → subsequent login fails', async () => {
    const del = await withToken(request(app).delete(`/api/staff/${staffId}`), ownerA.token);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const gone = await login(STAFF_PHONE, 'newpass123');
    expect(gone.status).toBe(401);

    const list = await withToken(request(app).get('/api/staff'), ownerA.token);
    expect(list.body.items.some((s) => s.id === staffId)).toBe(false);
  });
});
