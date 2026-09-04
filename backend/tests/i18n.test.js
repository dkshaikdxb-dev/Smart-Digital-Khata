// Integration tests for the live translation override feature (M13). Requires a
// real Postgres (DATABASE_URL) with the migrations applied.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const adminToken = () => jwt.sign({ sub: 'test-admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const ownerToken = () => jwt.sign({ sub: 'test-owner', role: 'owner', shopId: 'none' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

// Use a scratch key so we can clean up without disturbing other rows.
const KEY = `test.override.${Date.now()}`;

afterAll(async () => {
  await pool.query('DELETE FROM i18n_overrides WHERE key = $1', [KEY]);
  await pool.end();
});

describe('public GET /api/i18n/overrides', () => {
  it('returns { overrides: {} } shape and the cross-origin/cache headers', async () => {
    const res = await request(app).get('/api/i18n/overrides');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overrides');
    expect(typeof res.body.overrides).toBe('object');
    expect(res.headers['cache-control']).toContain('max-age=60');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});

describe('admin PATCH /api/admin/i18n', () => {
  it('upserts an override, then the public GET reflects it', async () => {
    const up = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'hi', key: KEY, value: 'नमस्ते' });
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ ok: true });

    const get = await request(app).get('/api/i18n/overrides');
    expect(get.status).toBe(200);
    expect(get.body.overrides.hi[KEY]).toBe('नमस्ते');
  });

  it('upsert overwrites an existing value', async () => {
    await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'hi', key: KEY, value: 'first' });
    const up = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'hi', key: KEY, value: 'second' });
    expect(up.status).toBe(200);
    const get = await request(app).get('/api/i18n/overrides');
    expect(get.body.overrides.hi[KEY]).toBe('second');
  });

  it('empty value deletes the override (reverts to built-in)', async () => {
    const up = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'hi', key: KEY, value: '   ' });
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ ok: true });

    const get = await request(app).get('/api/i18n/overrides');
    expect(get.body.overrides.hi && get.body.overrides.hi[KEY]).toBeUndefined();
  });

  it('rejects an invalid lang with 400', async () => {
    const res = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'xx', key: KEY, value: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin token (401/403)', async () => {
    const res = await withToken(request(app).patch('/api/admin/i18n'), ownerToken())
      .send({ lang: 'hi', key: KEY, value: 'x' });
    expect([401, 403]).toContain(res.status);
  });

  it('rejects a missing token (401)', async () => {
    const res = await request(app).patch('/api/admin/i18n')
      .send({ lang: 'hi', key: KEY, value: 'x' });
    expect(res.status).toBe(401);
  });
});
