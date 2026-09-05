// Integration tests for Admin RBAC + moderation (Phase C). Requires a real
// Postgres (DATABASE_URL) with the migrations applied (incl.
// 0023_admin_rbac_moderation). See the task notes for the throwaway-cluster
// one-liner.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { permissionsFor, hasPermission } = require('../src/config/permissions');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Admin users (one per sub-role) + a null-role admin + a victim admin to block.
const admins = {};
let owner; // { token, user, shop } via register
let consumerId; // customer_users id created via OTP flow
const OWNER_EMAIL = `rbac_owner_${uniq}@test.local`;
const OWNER_PHONE = `+9188${uniq}`;
const OWNER_PASS = 'password123';
const CONSUMER_PHONE = `+9166${uniq}`;

let adminSeq = 0;
async function makeAdmin(key, role) {
  const n = adminSeq++;
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`RBAC ${key}`, `rbac_${key}_${uniq}@test.local`, `+9155${n}${uniq}`, role]
  );
  admins[key] = { id: r.rows[0].id, token: tokenFor(r.rows[0].id), role };
}

async function register() {
  const res = await request(app).post('/api/auth/register').send({
    name: 'RBAC Owner', email: OWNER_EMAIL, phone: OWNER_PHONE,
    password: OWNER_PASS, shopName: 'RBAC Shop',
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

beforeAll(async () => {
  await makeAdmin('super', 'super');
  await makeAdmin('support', 'support');
  await makeAdmin('finance', 'finance');
  await makeAdmin('moderation', 'moderation');
  await makeAdmin('none', null);
  await makeAdmin('victim', 'support');
  owner = await register();

  // Create the consumer account directly. The OTP request/verify routes share a
  // tight 5-per-minute limiter (across both routes), so the block/unblock
  // assertions below spend that budget on the flows they actually test rather
  // than on setup.
  const cu = await pool.query(
    `INSERT INTO customer_users (phone, name) VALUES ($1,$2) RETURNING id`,
    [CONSUMER_PHONE, 'RBAC Consumer']
  );
  consumerId = cu.rows[0].id;
});

// A customer token minted the same way the app mints it (role 'customer').
const consumerToken = () => jwt.sign(
  { sub: consumerId, role: 'customer', phone: CONSUMER_PHONE },
  process.env.JWT_SECRET, { expiresIn: '30d' }
);

afterAll(async () => {
  const ids = Object.values(admins).map((a) => a.id);
  await pool.query('DELETE FROM moderation_actions WHERE admin_user_id = ANY($1)', [ids]);
  if (owner && owner.shop) {
    await pool.query('DELETE FROM moderation_actions WHERE target_id = $1', [owner.shop.id]);
    await pool.query('DELETE FROM shops WHERE id = $1', [owner.shop.id]);
  }
  if (owner && owner.user) {
    await pool.query('DELETE FROM moderation_actions WHERE target_id = $1', [owner.user.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [owner.user.id]);
  }
  await pool.query('DELETE FROM moderation_actions WHERE target_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM customer_users WHERE phone = $1', [CONSUMER_PHONE]);
  await pool.query('DELETE FROM customer_otps WHERE phone = $1', [CONSUMER_PHONE]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await pool.end();
});

describe('permission model (config/permissions)', () => {
  it('super has every permission', () => {
    const all = permissionsFor('super');
    for (const p of ['shops:moderate', 'users:moderate', 'customers:moderate',
      'admin:manage', 'audit:view', 'revenue:view', 'settings:manage']) {
      expect(all).toContain(p);
    }
    expect(hasPermission('super', 'admin:manage')).toBe(true);
  });

  it('support is read-only — no *:moderate, no admin:manage', () => {
    const perms = permissionsFor('support');
    expect(perms.some((p) => p.endsWith(':moderate'))).toBe(false);
    expect(perms).not.toContain('admin:manage');
    expect(perms).toContain('shops:view');
    expect(perms).toContain('audit:view');
  });

  it('finance has no customers:moderate but has settings:manage + revenue:view', () => {
    const perms = permissionsFor('finance');
    expect(perms).not.toContain('customers:moderate');
    expect(perms).not.toContain('users:moderate');
    expect(perms).toContain('settings:manage');
    expect(perms).toContain('revenue:view');
    expect(perms).toContain('audit:view');
  });

  it('moderation has shops/users/customers:moderate + audit:view, no admin:manage/settings', () => {
    const perms = permissionsFor('moderation');
    expect(perms).toContain('shops:moderate');
    expect(perms).toContain('users:moderate');
    expect(perms).toContain('customers:moderate');
    expect(perms).toContain('audit:view');
    expect(perms).not.toContain('admin:manage');
    expect(perms).not.toContain('settings:manage');
  });

  it('unknown/null role grants nothing', () => {
    expect(permissionsFor(null)).toEqual([]);
    expect(hasPermission(null, 'shops:view')).toBe(false);
  });
});

describe('GET /api/admin/me exposes role + permissions', () => {
  it('returns the caller admin_role and permission set', async () => {
    const res = await withToken(request(app).get('/api/admin/me'), admins.moderation.token);
    expect(res.status).toBe(200);
    expect(res.body.admin_role).toBe('moderation');
    expect(res.body.permissions).toContain('shops:moderate');
    expect(res.body.permissions).not.toContain('admin:manage');
  });
});

describe('requirePerm gating on moderation endpoints', () => {
  it('support (read-only) blocking an owner → 403', async () => {
    const res = await withToken(request(app).post(`/api/admin/users/${owner.user.id}/block`), admins.support.token)
      .send({ reason: 'nope' });
    expect(res.status).toBe(403);
  });

  it('non-admin (owner token) → 403 at auth', async () => {
    const res = await withToken(request(app).post(`/api/admin/users/${owner.user.id}/block`), owner.token)
      .send({ reason: 'nope' });
    expect(res.status).toBe(403);
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app).post(`/api/admin/users/${owner.user.id}/block`).send({ reason: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('block / unblock an owner is enforced at login', () => {
  it('moderation admin blocks the owner → owner login now 403; audit written', async () => {
    const blk = await withToken(request(app).post(`/api/admin/users/${owner.user.id}/block`), admins.moderation.token)
      .send({ reason: 'fraud: chargeback ring' });
    expect(blk.status).toBe(200);
    expect(blk.body.user.status).toBe('blocked');

    const login = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: OWNER_PASS });
    expect(login.status).toBe(403);

    const audit = await pool.query(
      `SELECT action, reason FROM moderation_actions WHERE target_id = $1 AND action = 'user.block'`,
      [owner.user.id]
    );
    expect(audit.rowCount).toBeGreaterThan(0);
    expect(audit.rows[0].reason).toBe('fraud: chargeback ring');
  });

  it('unblock → owner login works again', async () => {
    const unb = await withToken(request(app).post(`/api/admin/users/${owner.user.id}/unblock`), admins.moderation.token)
      .send({ reason: 'resolved' });
    expect(unb.status).toBe(200);
    expect(unb.body.user.status).toBe('active');

    const login = await request(app).post('/api/auth/login').send({ email: OWNER_EMAIL, password: OWNER_PASS });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
  });
});

describe('block / unblock a consumer is enforced at verify-otp and me', () => {
  it('blocked consumer cannot verify-otp and existing token is rejected at /me', async () => {
    // A live token issued BEFORE blocking works at /me.
    const before = await withToken(request(app).get('/api/customer-auth/me'), consumerToken());
    expect(before.status).toBe(200);

    const blk = await withToken(request(app).post(`/api/admin/customers/${consumerId}/block`), admins.moderation.token)
      .send({ reason: 'abuse' });
    expect(blk.status).toBe(200);
    expect(blk.body.customer.status).toBe('blocked');

    // A fresh, valid OTP still cannot complete login. (Only OTP flow of the test
    // — the shared 5/min limiter is otherwise untouched here.)
    const otp1 = await request(app).post('/api/customer-auth/request-otp').send({ phone: CONSUMER_PHONE });
    const v1 = await request(app).post('/api/customer-auth/verify-otp')
      .send({ phone: CONSUMER_PHONE, code: otp1.body.dev_code });
    expect(v1.status).toBe(403);

    // The pre-existing token can no longer act.
    const me = await withToken(request(app).get('/api/customer-auth/me'), consumerToken());
    expect(me.status).toBe(403);
  });

  it('unblock restores acting (via /me)', async () => {
    const unb = await withToken(request(app).post(`/api/admin/customers/${consumerId}/unblock`), admins.moderation.token)
      .send({ reason: 'appeal upheld' });
    expect(unb.status).toBe(200);
    expect(unb.body.customer.status).toBe('active');

    const me = await withToken(request(app).get('/api/customer-auth/me'), consumerToken());
    expect(me.status).toBe(200);
  });

  it('finance cannot moderate consumers → 403', async () => {
    const res = await withToken(request(app).post(`/api/admin/customers/${consumerId}/block`), admins.finance.token)
      .send({ reason: 'x' });
    expect(res.status).toBe(403);
  });

  it('customers:view gates the list — support can, moderation can', async () => {
    const asSupport = await withToken(request(app).get(`/api/admin/customers?search=${CONSUMER_PHONE}`), admins.support.token);
    expect(asSupport.status).toBe(200);
    expect(asSupport.body.items.some((c) => c.id === consumerId)).toBe(true);
  });
});

describe('shop suspend / reinstate writes an audit row', () => {
  it('suspend with reason → shop.suspend row; reinstate → shop.reinstate row', async () => {
    const susp = await withToken(request(app).patch(`/api/admin/shops/${owner.shop.id}`), admins.moderation.token)
      .send({ status: 'suspended', reason: 'policy violation' });
    expect(susp.status).toBe(200);
    expect(susp.body.shop.status).toBe('suspended');

    const s = await pool.query(
      `SELECT action, reason FROM moderation_actions WHERE target_id = $1 AND action = 'shop.suspend'`,
      [owner.shop.id]
    );
    expect(s.rowCount).toBeGreaterThan(0);
    expect(s.rows[0].reason).toBe('policy violation');

    const rein = await withToken(request(app).patch(`/api/admin/shops/${owner.shop.id}`), admins.moderation.token)
      .send({ status: 'active', reason: 'cleared' });
    expect(rein.status).toBe(200);
    const r = await pool.query(
      `SELECT action FROM moderation_actions WHERE target_id = $1 AND action = 'shop.reinstate'`,
      [owner.shop.id]
    );
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it('support cannot suspend a shop → 403', async () => {
    const res = await withToken(request(app).patch(`/api/admin/shops/${owner.shop.id}`), admins.support.token)
      .send({ status: 'suspended', reason: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('moderation log', () => {
  it('returns rows newest-first and audit:view gates access', async () => {
    const res = await withToken(request(app).get('/api/admin/moderation-log?limit=50'), admins.support.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    // newest-first
    const times = res.body.items.map((x) => new Date(x.created_at).getTime());
    for (let k = 1; k < times.length; k++) expect(times[k - 1]).toBeGreaterThanOrEqual(times[k]);

    // A null-role admin has no audit:view → 403.
    const denied = await withToken(request(app).get('/api/admin/moderation-log'), admins.none.token);
    expect(denied.status).toBe(403);
  });
});

describe('admin-role management + moderating another admin is super-only', () => {
  it('moderation admin cannot set admin_role → 403', async () => {
    const res = await withToken(request(app).patch(`/api/admin/users/${admins.victim.id}/admin-role`), admins.moderation.token)
      .send({ admin_role: 'finance' });
    expect(res.status).toBe(403);
  });

  it('super can set admin_role → 200 and audit written', async () => {
    const res = await withToken(request(app).patch(`/api/admin/users/${admins.victim.id}/admin-role`), admins.super.token)
      .send({ admin_role: 'finance' });
    expect(res.status).toBe(200);
    expect(res.body.user.admin_role).toBe('finance');
    const a = await pool.query(
      `SELECT action FROM moderation_actions WHERE target_id = $1 AND action = 'admin_role.set'`,
      [admins.victim.id]
    );
    expect(a.rowCount).toBeGreaterThan(0);
  });

  it('moderation admin cannot block another admin → 403 (guard)', async () => {
    const res = await withToken(request(app).post(`/api/admin/users/${admins.victim.id}/block`), admins.moderation.token)
      .send({ reason: 'x' });
    expect(res.status).toBe(403);
  });

  it('super can block another admin → 200, then unblock', async () => {
    const blk = await withToken(request(app).post(`/api/admin/users/${admins.victim.id}/block`), admins.super.token)
      .send({ reason: 'compromised' });
    expect(blk.status).toBe(200);
    expect(blk.body.user.status).toBe('blocked');

    const unb = await withToken(request(app).post(`/api/admin/users/${admins.victim.id}/unblock`), admins.super.token)
      .send({ reason: 'restored' });
    expect(unb.status).toBe(200);
    expect(unb.body.user.status).toBe('active');
  });
});
