// Integration tests for the language activation registry (Phase B). Requires a
// real Postgres (DATABASE_URL) with migrations applied (incl. 0022_languages).
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

// The admin subject is a real user id (UUID) in production — use one here so the
// activated_by UUID column is populated.
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const adminToken = () => jwt.sign({ sub: ADMIN_ID, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const ownerToken = () => jwt.sign({ sub: 'test-owner', role: 'owner', shopId: 'none' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

// A scratch code created/removed by these tests only.
const NEW_CODE = 'xx';

afterAll(async () => {
  // Restore the seed state so the suite is re-runnable.
  await pool.query('DELETE FROM languages WHERE code = $1', [NEW_CODE]);
  await pool.query(
    `UPDATE languages SET is_active = false, activated_at = NULL, activated_by = NULL, audit_status = 'pending'
     WHERE code = 'mr'`
  );
  await pool.query("UPDATE languages SET is_active = true WHERE code = 'ta'");
  await pool.end();
});

describe('public GET /api/public/languages', () => {
  it('returns the active languages, none of the staged inactive ones, sorted', async () => {
    const res = await request(app).get('/api/public/languages');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');

    const langs = res.body.languages;
    expect(Array.isArray(langs)).toBe(true);

    const codes = langs.map((l) => l.code);
    // The 7 currently-live languages are active.
    for (const c of ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']) {
      expect(codes).toContain(c);
    }
    // Staged capacity languages are NOT shown until activated.
    for (const c of ['mr', 'bn', 'gu', 'pa', 'or', 'as']) {
      expect(codes).not.toContain(c);
    }

    // Ordered by sort_order.
    const orders = langs.map((l) => l.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));

    // Minimal shape + Urdu is RTL.
    const ur = langs.find((l) => l.code === 'ur');
    expect(ur).toMatchObject({ code: 'ur', rtl: true });
    expect(ur).toHaveProperty('label');
    expect(ur).toHaveProperty('english_name');
    // No leakage of admin-only fields.
    expect(ur).not.toHaveProperty('is_active');
    expect(ur).not.toHaveProperty('audit_status');
  });
});

describe('admin activation flow', () => {
  it('activates a staged language (mr) → appears in the public list with activated_at/by', async () => {
    const res = await withToken(request(app).patch('/api/admin/languages/mr'), adminToken())
      .send({ is_active: true });
    expect(res.status).toBe(200);
    expect(res.body.language.is_active).toBe(true);
    expect(res.body.language.activated_at).toBeTruthy();
    expect(res.body.language.activated_by).toBe(ADMIN_ID);

    const pub = await request(app).get('/api/public/languages');
    expect(pub.body.languages.map((l) => l.code)).toContain('mr');
  });

  it('deactivates an active language (ta) → drops from the public list', async () => {
    const off = await withToken(request(app).patch('/api/admin/languages/ta'), adminToken())
      .send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.language.is_active).toBe(false);

    const pub = await request(app).get('/api/public/languages');
    expect(pub.body.languages.map((l) => l.code)).not.toContain('ta');

    // Restore so nothing regresses for the rest of the suite.
    const on = await withToken(request(app).patch('/api/admin/languages/ta'), adminToken())
      .send({ is_active: true });
    expect(on.status).toBe(200);
    const pub2 = await request(app).get('/api/public/languages');
    expect(pub2.body.languages.map((l) => l.code)).toContain('ta');
  });

  it('rejects an invalid audit_status with 400', async () => {
    const res = await withToken(request(app).patch('/api/admin/languages/mr'), adminToken())
      .send({ audit_status: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown code', async () => {
    const res = await withToken(request(app).patch('/api/admin/languages/zz'), adminToken())
      .send({ is_active: true });
    expect(res.status).toBe(404);
  });
});

describe('admin add a staged language', () => {
  it('creates a new language (inactive), then rejects a duplicate with 409', async () => {
    const res = await withToken(request(app).post('/api/admin/languages'), adminToken())
      .send({ code: NEW_CODE, label: 'Xhosa-test', english_name: 'Test Language', rtl: false });
    expect([200, 201]).toContain(res.status);
    expect(res.body.language.code).toBe(NEW_CODE);
    expect(res.body.language.is_active).toBe(false);
    expect(res.body.language.audit_status).toBe('pending');

    // Appears in the admin list, but not the public one (inactive).
    const adminList = await withToken(request(app).get('/api/admin/languages'), adminToken());
    expect(adminList.status).toBe(200);
    expect(adminList.body.languages.map((l) => l.code)).toContain(NEW_CODE);

    const pub = await request(app).get('/api/public/languages');
    expect(pub.body.languages.map((l) => l.code)).not.toContain(NEW_CODE);

    // Duplicate → 409.
    const dup = await withToken(request(app).post('/api/admin/languages'), adminToken())
      .send({ code: NEW_CODE, label: 'again', english_name: 'again' });
    expect(dup.status).toBe(409);
  });
});

describe('admin authorization', () => {
  it('rejects a non-admin (owner) token with 403', async () => {
    const res = await withToken(request(app).get('/api/admin/languages'), ownerToken());
    expect(res.status).toBe(403);
  });

  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/admin/languages');
    expect(res.status).toBe(401);
  });
});
