// Integration tests for the premium "Branded Store" — a credit-unlocked storefront
// theme (batch STORE1). Requires a real Postgres (DATABASE_URL) with the migrations
// applied (incl. 0050 wallet, 0053 shop image, 0054 shop-promo, 0056 branded store).
//
// Money is integer paise. Activation debits the shop's Khata Credits in the SAME
// transaction as the branded_until extension (guarded — balance can never go
// negative; 402 on insufficient). Brand fields are exposed on the public storefront
// (discovery.getShop) ONLY while branded (branded_until > NOW()), and a branded
// shop's new self-serve promo gets a promo-priority bump.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const wallet = require('../src/utils/wallet');

const uniq = Date.now().toString().slice(-9);
const authHdr = (req, token) => req.set('Authorization', `Bearer ${token}`);

let owner; // { token, user, shop }
const townValue = `Brandtown${uniq}`;

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

async function creditShop(shopId, paise) {
  const w = await wallet.getOrCreateWallet('shop', shopId);
  await wallet.creditWallet({ wallet: w, amount_paise: paise, kind: 'reward_settled' });
}

async function debitAll(shopId) {
  const bal = await shopBalance(shopId);
  if (bal > 0) {
    const w = await wallet.getOrCreateWallet('shop', shopId);
    await wallet.debitWallet({ wallet: w, amount_paise: bal, kind: 'redeem_premium' });
  }
}

async function brandedUntil(shopId) {
  const r = await pool.query('SELECT branded_until FROM shops WHERE id = $1', [shopId]);
  return r.rows[0].branded_until;
}

beforeAll(async () => {
  await setSetting('branded_store_enabled', 'true');
  await setSetting('branded_store_credits_per_day_paise', '2000'); // ₹20/day
  await setSetting('branded_store_max_days', '90');

  const res = await request(app).post('/api/auth/register').send({
    name: 'STORE Owner', email: `store_owner_${uniq}@test.local`, phone: `+9177${uniq}`,
    password: 'password123', shopName: 'STORE Shop',
  });
  expect(res.status).toBe(201);
  owner = { token: res.body.token, user: res.body.user, shop: res.body.shop };

  // List the shop (so getShop serves it) + give it a town so promos get a target.
  await pool.query('UPDATE shops SET is_listed = true, city = $2 WHERE id = $1', [owner.shop.id, townValue]);
});

afterAll(async () => {
  await pool.query('DELETE FROM ad_targets WHERE campaign_id IN (SELECT id FROM ad_campaigns WHERE link_shop_id = $1)', [owner.shop.id]);
  await pool.query('DELETE FROM ad_campaigns WHERE link_shop_id = $1', [owner.shop.id]);
  await pool.query(
    `DELETE FROM referral_ledger WHERE wallet_id IN (
       SELECT id FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1)`,
    [owner.shop.id]
  );
  await pool.query("DELETE FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1", [owner.shop.id]);
  await pool.query('DELETE FROM shops WHERE id = $1', [owner.shop.id]);
  await pool.query('DELETE FROM users WHERE id = $1', [owner.user.id]);
  await pool.end();
});

describe('migration 0056 — schema + settings', () => {
  test('shops gains branded_until + brand_accent + brand_tagline', async () => {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'shops' AND column_name IN ('branded_until','brand_accent','brand_tagline')
        ORDER BY column_name`
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(['brand_accent', 'brand_tagline', 'branded_until']);
  });

  test('platform_settings seeded the branded-store keys', async () => {
    const r = await pool.query(
      `SELECT key FROM platform_settings WHERE key IN
       ('branded_store_enabled','branded_store_credits_per_day_paise','branded_store_max_days')`
    );
    expect(r.rows.length).toBe(3);
  });
});

describe('GET /api/shops/me/branding', () => {
  test('returns live config + state + balance', async () => {
    await creditShop(owner.shop.id, 10000); // ₹100
    const res = await authHdr(request(app).get('/api/shops/me/branding'), owner.token);
    expect(res.status).toBe(200);
    expect(res.body.config.enabled).toBe(true);
    expect(res.body.config.credits_per_day_paise).toBe(2000);
    expect(res.body.config.max_days).toBe(90);
    expect(res.body.is_branded).toBe(false);
    expect(res.body.branded_until).toBeNull();
    expect(res.body.balance_paise).toBe(10000);
  });
});

describe('PATCH /api/shops/me/branding — accent + tagline (allowed anytime)', () => {
  test('rejects a non-hex accent', async () => {
    const res = await authHdr(request(app).patch('/api/shops/me/branding'), owner.token)
      .send({ brand_accent: 'red' });
    expect(res.status).toBe(400);
  });

  test('accepts a #RRGGBB accent + tagline while NOT branded (pre-set)', async () => {
    const res = await authHdr(request(app).patch('/api/shops/me/branding'), owner.token)
      .send({ brand_accent: '#0A7E4F', brand_tagline: 'Freshest in town' });
    expect(res.status).toBe(200);
    expect(res.body.brand_accent).toBe('#0A7E4F');
    expect(res.body.brand_tagline).toBe('Freshest in town');
  });
});

describe('getShop exposure — brand fields only while branded', () => {
  test('NOT branded → is_branded:false and accent/tagline nulled out', async () => {
    const res = await request(app).get(`/api/public/shops/${owner.shop.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.is_branded).toBe(false);
    expect(res.body.shop.brand_accent).toBeNull();
    expect(res.body.shop.brand_tagline).toBeNull();
    expect(res.body.shop.branded_until).toBeUndefined(); // raw value never leaks
  });
});

describe('POST /api/shops/me/branding/activate', () => {
  test('debits credits + sets branded_until in the future + is_branded true', async () => {
    const before = await shopBalance(owner.shop.id); // 10000
    const res = await authHdr(request(app).post('/api/shops/me/branding/activate'), owner.token)
      .send({ days: 3 });
    expect(res.status).toBe(200);
    expect(res.body.cost_paise).toBe(6000); // 3 * 2000
    expect(new Date(res.body.branded_until).getTime()).toBeGreaterThan(Date.now());

    // Balance dropped by exactly the cost.
    expect(await shopBalance(owner.shop.id)).toBe(before - 6000);

    // A debit ledger row of kind 'redeem_premium' referencing the shop exists.
    const led = await pool.query(
      `SELECT l.direction, l.amount_paise, l.kind, l.ref_note
         FROM referral_ledger l JOIN referral_wallets w ON w.id = l.wallet_id
        WHERE w.owner_type = 'shop' AND w.owner_id = $1 AND l.kind = 'redeem_premium'
        ORDER BY l.created_at DESC LIMIT 1`,
      [owner.shop.id]
    );
    expect(led.rowCount).toBe(1);
    expect(Number(led.rows[0].amount_paise)).toBe(6000);

    // The branding endpoint now reports active.
    const g = await authHdr(request(app).get('/api/shops/me/branding'), owner.token);
    expect(g.body.is_branded).toBe(true);
  });

  test('now branded → getShop exposes accent + tagline + is_branded true', async () => {
    const res = await request(app).get(`/api/public/shops/${owner.shop.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.is_branded).toBe(true);
    expect(res.body.shop.brand_accent).toBe('#0A7E4F');
    expect(res.body.shop.brand_tagline).toBe('Freshest in town');
    expect(res.body.shop.branded_until).toBeUndefined();
  });

  test('activating again EXTENDS the existing window (adds to remaining time)', async () => {
    const prev = new Date(await brandedUntil(owner.shop.id)).getTime();
    await creditShop(owner.shop.id, 6000); // top up for another 3 days
    const res = await authHdr(request(app).post('/api/shops/me/branding/activate'), owner.token)
      .send({ days: 3 });
    expect(res.status).toBe(200);
    const now = new Date(res.body.branded_until).getTime();
    // Extended by ~3 days beyond the prior end, not reset to now+3d.
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(now - prev).toBeGreaterThan(threeDaysMs - 60_000);
  });

  test('insufficient balance → 402 and NO debit', async () => {
    await debitAll(owner.shop.id); // drain to 0
    await creditShop(owner.shop.id, 1000); // ₹10, less than 1 day (₹20)
    const before = await shopBalance(owner.shop.id); // 1000
    const res = await authHdr(request(app).post('/api/shops/me/branding/activate'), owner.token)
      .send({ days: 1 });
    expect(res.status).toBe(402);
    expect(res.body.error || res.body.message || '').toMatch(/insufficient|credit/i);
    // Balance untouched — the guarded debit wrote nothing.
    expect(await shopBalance(owner.shop.id)).toBe(before);
  });

  test('feature disabled → 403', async () => {
    await setSetting('branded_store_enabled', 'false');
    await creditShop(owner.shop.id, 10000);
    const before = await shopBalance(owner.shop.id);
    const res = await authHdr(request(app).post('/api/shops/me/branding/activate'), owner.token)
      .send({ days: 1 });
    expect(res.status).toBe(403);
    expect(await shopBalance(owner.shop.id)).toBe(before); // no debit
    await setSetting('branded_store_enabled', 'true'); // restore for any later runs
  });
});

describe('promo priority bump for a branded shop', () => {
  test("a branded shop's new self-serve promo gets the higher priority (10)", async () => {
    // Ensure premium is active + self-serve promos enabled.
    await setSetting('shop_promo_enabled', 'true');
    await setSetting('shop_promo_credits_per_day_paise', '1000');
    await setSetting('shop_promo_max_days', '30');
    await pool.query("UPDATE shops SET branded_until = NOW() + interval '10 days' WHERE id = $1", [owner.shop.id]);
    await creditShop(owner.shop.id, 5000);

    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ days: 2 });
    expect(res.status).toBe(201);
    const row = await pool.query('SELECT priority FROM ad_campaigns WHERE id = $1', [res.body.id]);
    expect(row.rows[0].priority).toBe(10);
  });

  test("a NON-branded shop's new self-serve promo keeps priority 0", async () => {
    await pool.query('UPDATE shops SET branded_until = NULL WHERE id = $1', [owner.shop.id]);
    await creditShop(owner.shop.id, 5000);
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ days: 2 });
    expect(res.status).toBe(201);
    const row = await pool.query('SELECT priority FROM ad_campaigns WHERE id = $1', [res.body.id]);
    expect(row.rows[0].priority).toBe(0);
  });
});
