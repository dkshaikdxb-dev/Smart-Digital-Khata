// Integration tests for the FREE owner promo request path + review_note + localized
// serving honesty (batch PROMO free). Requires a real Postgres (DATABASE_URL) with
// the migrations applied (incl. 0045 ads, 0054 shop-promo, 0061 free+review).
//
// The FREE path must NEVER touch the wallet: no debit, credits_spent_paise=0, and
// it works even at a zero balance. It is gated by shop_promo_free_enabled, its
// window is clamped to shop_promo_free_max_days, and it is throttled to
// shop_promo_free_max_active concurrent pending+active free promos per shop. A
// rejected free promo refunds nothing (there is nothing to refund) but still
// persists the admin's review_note.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
const authHdr = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

let owner; // { token, user, shop }
let marketing; // { id, token }
const townValue = `Freetown${uniq}`;

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

async function shopBalance(shopId) {
  const r = await pool.query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

async function ledgerCount(shopId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM referral_ledger l
       JOIN referral_wallets w ON w.id = l.wallet_id
      WHERE w.owner_type = 'shop' AND w.owner_id = $1`,
    [shopId]
  );
  return r.rows[0].n;
}

async function campaignCount(shopId) {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE link_shop_id = $1', [shopId]);
  return r.rows[0].n;
}

beforeAll(async () => {
  // Free feature ON with a known window + cap.
  await setSetting('shop_promo_free_enabled', 'true');
  await setSetting('shop_promo_free_max_days', '7');
  await setSetting('shop_promo_free_max_active', '1');
  // Keep the PAID feature enabled so the free branch does not depend on it.
  await setSetting('shop_promo_enabled', 'true');
  await setSetting('shop_promo_credits_per_day_paise', '1000');
  await setSetting('shop_promo_max_days', '30');

  const m = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','marketing') RETURNING id`,
    [`FREE Mkt ${uniq}`, `free_mkt_${uniq}@test.local`, `+9156${uniq}`]
  );
  marketing = { id: m.rows[0].id, token: adminToken(m.rows[0].id) };

  const res = await request(app).post('/api/auth/register').send({
    name: 'FREE Owner', email: `free_owner_${uniq}@test.local`, phone: `+9189${uniq}`,
    password: 'password123', shopName: 'FREE Shop',
  });
  expect(res.status).toBe(201);
  owner = { token: res.body.token, user: res.body.user, shop: res.body.shop };

  // A unique town so the approved promo's serving query matches only ours.
  await pool.query('UPDATE shops SET city = $2, village = NULL, pincode = NULL WHERE id = $1', [owner.shop.id, townValue]);
});

afterAll(async () => {
  await pool.query('DELETE FROM ad_targets WHERE campaign_id IN (SELECT id FROM ad_campaigns WHERE link_shop_id = $1)', [owner.shop.id]);
  await pool.query('DELETE FROM ad_campaigns WHERE link_shop_id = $1', [owner.shop.id]);
  await pool.query('DELETE FROM ad_campaigns WHERE advertiser = $1', [`House ${uniq}`]);
  await pool.query(
    `DELETE FROM referral_ledger WHERE wallet_id IN (
       SELECT id FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1)`,
    [owner.shop.id]
  );
  await pool.query("DELETE FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1", [owner.shop.id]);
  await pool.query('DELETE FROM shops WHERE id = $1', [owner.shop.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [owner.user.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [marketing.id]);
  await pool.end();
});

describe('GET /api/promos/config — free block', () => {
  test('returns the free config + this shop’s active_count', async () => {
    const res = await authHdr(request(app).get('/api/promos/config'), owner.token);
    expect(res.status).toBe(200);
    expect(res.body.free).toBeTruthy();
    expect(res.body.free.enabled).toBe(true);
    expect(res.body.free.max_days).toBe(7);
    expect(res.body.free.max_active).toBe(1);
    expect(res.body.free.active_count).toBe(0);
  });
});

describe('POST /api/promos/mine {mode:free}', () => {
  let freeId;

  test('free submit at ZERO balance → 201 pending_review, credits_spent_paise=0, no debit, days clamped', async () => {
    expect(await shopBalance(owner.shop.id)).toBe(0); // no wallet / zero balance
    const ledgerBefore = await ledgerCount(owner.shop.id);

    // Ask for 30 days — above the free ceiling (7); it must be clamped, not rejected.
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token)
      .send({ mode: 'free', days: 30, offer_text: 'Fresh stock daily', subtitle: 'Visit us' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.cost_paise).toBe(0);
    expect(res.body.mode).toBe('free');
    freeId = res.body.id;

    // Wallet untouched: balance still zero, no new ledger rows.
    expect(await shopBalance(owner.shop.id)).toBe(0);
    expect(await ledgerCount(owner.shop.id)).toBe(ledgerBefore);

    // Row shape: self_serve, credits_spent_paise = 0 (NOT null), pending_review.
    const c = await pool.query(
      'SELECT self_serve, status, credits_spent_paise, starts_at, ends_at FROM ad_campaigns WHERE id = $1',
      [freeId]
    );
    expect(c.rows[0].self_serve).toBe(true);
    expect(c.rows[0].status).toBe('pending_review');
    expect(Number(c.rows[0].credits_spent_paise)).toBe(0);

    // Window clamped to 7 days (± a small tolerance for exec time).
    const days = (new Date(c.rows[0].ends_at) - new Date(c.rows[0].starts_at)) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    // config now reports the outstanding free promo against the cap.
    const cfg = await authHdr(request(app).get('/api/promos/config'), owner.token);
    expect(cfg.body.free.active_count).toBe(1);
  });

  test('a second free submit while one is pending → 409 free_promo_limit_reached, no new row', async () => {
    const before = await campaignCount(owner.shop.id);
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token)
      .send({ mode: 'free', days: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('free_promo_limit_reached');
    expect(await campaignCount(owner.shop.id)).toBe(before);
  });

  test('reject the free promo → rejected, review_note persisted, NO refund (balance stays 0)', async () => {
    const res = await authHdr(request(app).post(`/api/admin/promos/${freeId}/reject`), marketing.token)
      .send({ review_note: 'needs a clearer offer' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.refunded_paise).toBe(0); // nothing was spent

    expect(await shopBalance(owner.shop.id)).toBe(0);
    expect(await ledgerCount(owner.shop.id)).toBe(0); // no refund ledger row

    const c = await pool.query('SELECT status, review_note FROM ad_campaigns WHERE id = $1', [freeId]);
    expect(c.rows[0].status).toBe('rejected');
    expect(c.rows[0].review_note).toBe('needs a clearer offer');

    // The owner sees the review_note on their placement.
    const mine = await authHdr(request(app).get('/api/promos/mine'), owner.token);
    const row = mine.body.promos.find((p) => p.id === freeId);
    expect(row.review_note).toBe('needs a clearer offer');
    expect(row.is_free).toBe(true);
  });

  test('after the reject the slot frees up → a new free submit succeeds and approves + serves', async () => {
    // Slot is free again (the rejected one no longer counts).
    const cfg = await authHdr(request(app).get('/api/promos/config'), owner.token);
    expect(cfg.body.free.active_count).toBe(0);

    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token)
      .send({ mode: 'free', days: 2, offer_text: 'Now open late' });
    expect(res.status).toBe(201);
    const id = res.body.id;

    // Not served while pending.
    const pubBefore = await request(app).get(`/api/public/promos?town=${encodeURIComponent(townValue)}`);
    expect(pubBefore.body.promos.some((p) => p.id === id)).toBe(false);

    const appr = await authHdr(request(app).post(`/api/admin/promos/${id}/approve`), marketing.token).send({});
    expect(appr.status).toBe(200);
    expect(appr.body.status).toBe('active');

    const pub = await request(app).get(`/api/public/promos?town=${encodeURIComponent(townValue)}`);
    expect(pub.body.promos.some((p) => p.id === id)).toBe(true);
    // Balance still zero throughout the free lifecycle.
    expect(await shopBalance(owner.shop.id)).toBe(0);
  });
});

describe('free path gating', () => {
  test('with shop_promo_free_enabled=false a free submit is 403 free_promo_disabled', async () => {
    await setSetting('shop_promo_free_enabled', 'false');
    // Config reflects the disabled free feature.
    const cfg = await authHdr(request(app).get('/api/promos/config'), owner.token);
    expect(cfg.body.free.enabled).toBe(false);

    const before = await campaignCount(owner.shop.id);
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ mode: 'free', days: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('free_promo_disabled');
    expect(await campaignCount(owner.shop.id)).toBe(before); // no row
    await setSetting('shop_promo_free_enabled', 'true'); // restore
  });
});

describe('localized serving honesty (base=English, i18n native, bn falls back)', () => {
  let id;
  const LTOWN = `FreeL10n${uniq}`;

  beforeAll(async () => {
    // An admin-authored house campaign: English base + a Tamil override, no bn.
    const c = await pool.query(
      `INSERT INTO ad_campaigns (style, title, offer_text, subtitle, i18n, advertiser, status, priority)
       VALUES ('offer',$1,$2,$3,$4::jsonb,$5,'active',5) RETURNING id`,
      ['Shop local, pay later', 'Khata udhaar', 'at your kirana',
        JSON.stringify({ ta: { title: 'உள்ளூரில் வாங்குங்கள்' } }), `House ${uniq}`]
    );
    id = c.rows[0].id;
    await pool.query('INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)', [id, 'town', LTOWN]);
  });

  test('?lang=ta returns the Tamil title; other fields fall back to the English base', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}&lang=ta`);
    const p = res.body.promos.find((x) => x.id === id);
    expect(p.title).toBe('உள்ளூரில் வாங்குங்கள்');
    expect(p.offer_text).toBe('Khata udhaar'); // no ta override -> base
    expect(p.subtitle).toBe('at your kirana');
  });

  test('?lang=bn (not localized for promos) honestly returns the English base', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}&lang=bn`);
    const p = res.body.promos.find((x) => x.id === id);
    expect(p.title).toBe('Shop local, pay later');
    expect(p.offer_text).toBe('Khata udhaar');
  });
});
