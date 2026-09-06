// Public runtime config for the marketing landing + admin-editable landing
// WhatsApp number. Requires a real Postgres (DATABASE_URL) with migrations
// applied. The number is stored in platform_settings (LANDING_WHATSAPP),
// digits-only, and exposed unauthenticated at GET /api/public/config.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

let superAdmin;

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Cfg Super', `cfg_super_${uniq}@test.local`, `+9152${uniq}`, ]
  );
  superAdmin = { id: r.rows[0].id, token: tokenFor(r.rows[0].id) };
  // Clean any prior value so the "default" assertion is deterministic.
  await pool.query("DELETE FROM platform_settings WHERE key = 'LANDING_WHATSAPP'");
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = $1', [superAdmin.id]);
  await pool.query("DELETE FROM platform_settings WHERE key = 'LANDING_WHATSAPP'");
  await pool.end();
});

describe('GET /api/public/config (unauthenticated)', () => {
  it('returns landing_whatsapp: null when unset', async () => {
    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('landing_whatsapp', null);
  });

  it('needs no auth (public)', async () => {
    const res = await request(app).get('/api/public/config'); // no Authorization header
    expect(res.status).toBe(200);
  });
});

describe('admin sets the landing WhatsApp number', () => {
  it('PATCH /api/admin/settings stores digits only and /public/config exposes them', async () => {
    // A messy input with +, spaces and dashes must normalise to bare digits.
    const patch = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ landing_whatsapp: '+91 97314-22995' });
    expect(patch.status).toBe(200);

    const cfg = await request(app).get('/api/public/config');
    expect(cfg.body.landing_whatsapp).toBe('919731422995');

    // Admin getSettings echoes it back under `landing.whatsapp`.
    const got = await withToken(request(app).get('/api/admin/settings'), superAdmin.token);
    expect(got.status).toBe(200);
    expect(got.body.landing).toBeDefined();
    expect(got.body.landing.whatsapp).toBe('919731422995');
  });

  it('clearing it (empty string) reverts /public/config to null', async () => {
    const patch = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ landing_whatsapp: '' });
    expect(patch.status).toBe(200);
    const cfg = await request(app).get('/api/public/config');
    expect(cfg.body.landing_whatsapp).toBeNull();
  });
});
