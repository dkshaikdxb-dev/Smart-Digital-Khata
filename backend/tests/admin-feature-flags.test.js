// Admin "Feature flags & pricing" panel (batch FLAGS1). The session's runtime
// feature flags + fees/prices live in platform_settings (seeded by migrations
// 0048/0052/0054/0056/0057/0058/0059) and are edited from Admin -> Settings
// (perm settings:manage). Their live readers query platform_settings directly,
// so a write here applies at once. Requires a real Postgres (DATABASE_URL) with
// migrations applied.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

let superAdmin;

async function settingValue(key) {
  const r = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}

beforeAll(async () => {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Flags Super', `flags_super_${uniq}@test.local`, `+9153${uniq}`]
  );
  superAdmin = { id: r.rows[0].id, token: tokenFor(r.rows[0].id) };
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = $1', [superAdmin.id]);
  // Restore the seeded defaults touched by these tests so the file is idempotent.
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES
       ('voice_assistant_enabled','true',NOW()),
       ('shop_promo_credits_per_day_paise','1000',NOW()),
       ('referral_split_infra_pct','50',NOW()),
       ('referral_split_l1_pct','30',NOW()),
       ('referral_split_l2_pct','15',NOW()),
       ('meta_autopost_enabled','false',NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  );
  await pool.end();
});

describe('GET /api/admin/settings — features group', () => {
  it('returns a typed features group with the meta_autopost_available marker', async () => {
    const res = await withToken(request(app).get('/api/admin/settings'), superAdmin.token);
    expect(res.status).toBe(200);
    const f = res.body.features;
    expect(f).toBeDefined();

    // Inert Meta auto-post stub is surfaced disabled/locked.
    expect(f).toHaveProperty('meta_autopost_available', false);

    // Booleans are real booleans.
    for (const k of ['voice_assistant_enabled', 'social_share_enabled', 'shop_promo_enabled',
      'branded_store_enabled', 'consumer_prepay_enabled', 'enrolment_fee_enabled']) {
      expect(typeof f[k]).toBe('boolean');
    }
    // Amounts / counts / percents are numbers.
    for (const k of ['enrolment_fee_basic_paise', 'enrolment_fee_premium_paise',
      'shop_promo_credits_per_day_paise', 'shop_promo_max_days',
      'branded_store_credits_per_day_paise', 'branded_store_max_days',
      'consumer_prepay_max_advance_paise', 'delivery_champion_fee_paise',
      'referral_split_infra_pct', 'referral_split_l1_pct', 'referral_split_l2_pct']) {
      expect(typeof f[k]).toBe('number');
      expect(Number.isFinite(f[k])).toBe(true);
    }
  });
});

describe('PATCH /api/admin/settings — flag flip + price persist to the live store', () => {
  it('flips voice_assistant_enabled:false and the live public config reflects it', async () => {
    const patch = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ voice_assistant_enabled: false });
    expect(patch.status).toBe(200);
    expect(await settingValue('voice_assistant_enabled')).toBe('false');

    // Live reader (queries platform_settings directly).
    const cfg = await request(app).get('/api/public/config');
    expect(cfg.body.voice_assistant_enabled).toBe(false);

    // getSettings echoes the new boolean.
    const got = await withToken(request(app).get('/api/admin/settings'), superAdmin.token);
    expect(got.body.features.voice_assistant_enabled).toBe(false);
  });

  it('persists a ₹ price as integer paise TEXT and echoes it as a number', async () => {
    const patch = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ shop_promo_credits_per_day_paise: 1500 });
    expect(patch.status).toBe(200);
    // Stored as String(int) — the shape shopPromo's live reader parses.
    expect(await settingValue('shop_promo_credits_per_day_paise')).toBe('1500');

    const got = await withToken(request(app).get('/api/admin/settings'), superAdmin.token);
    expect(got.body.features.shop_promo_credits_per_day_paise).toBe(1500);
  });
});

describe('PATCH /api/admin/settings — money-critical guards', () => {
  it('rejects a referral split whose infra+l1+l2 > 100 (invalid_split)', async () => {
    const res = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ referral_split_infra_pct: 60, referral_split_l1_pct: 30, referral_split_l2_pct: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_split');
    // Never partially applied — the seeded infra pct is untouched.
    expect(await settingValue('referral_split_infra_pct')).toBe('50');
  });

  it('accepts a split that sums to <= 100', async () => {
    const res = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ referral_split_infra_pct: 50, referral_split_l1_pct: 30, referral_split_l2_pct: 15 });
    expect(res.status).toBe(200);
    expect(await settingValue('referral_split_l1_pct')).toBe('30');
  });

  it('rejects a partial split change whose merged trio > 100 (invalid_split)', async () => {
    // Only infra is provided; it merges over the current l1(30)+l2(15) = 45,
    // so infra=90 -> 135 must be rejected.
    const res = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ referral_split_infra_pct: 90 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_split');
  });

  it('keeps meta_autopost locked — setting it true is rejected (meta_not_available)', async () => {
    const res = await withToken(request(app).patch('/api/admin/settings'), superAdmin.token)
      .send({ meta_autopost_enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('meta_not_available');
    expect(await settingValue('meta_autopost_enabled')).toBe('false');
  });
});
