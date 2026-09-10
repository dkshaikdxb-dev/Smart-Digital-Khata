// Integration tests for shop self-serve promo placement paid with Khata Credits
// + admin moderation (batch PROMO-BUY). Requires a real Postgres (DATABASE_URL)
// with the migrations applied (incl. 0050 wallet + 0045 ads + 0054 shop-promo).
//
// Money is integer paise. The credit debit runs in the SAME transaction as the
// campaign insert (guarded — balance can never go negative); the reject refund is
// idempotent (a double-reject can never double-refund). A shop-bought promo starts
// 'pending_review' and only serves after admin approval.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const wallet = require('../src/utils/wallet');

const uniq = Date.now().toString().slice(-9);
const authHdr = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

let owner; // { token, user, shop }
let marketing; // { id, token }
const townValue = `Promotown${uniq}`;
const villageValue = `Promovillage${uniq}`;
const pincodeValue = '560001';

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

async function ledgerRows(shopId) {
  const r = await pool.query(
    `SELECT l.direction, l.amount_paise, l.kind, l.ref_note
       FROM referral_ledger l
       JOIN referral_wallets w ON w.id = l.wallet_id
      WHERE w.owner_type = 'shop' AND w.owner_id = $1
      ORDER BY l.created_at ASC`,
    [shopId]
  );
  return r.rows;
}

beforeAll(async () => {
  // Ensure the feature is enabled with a known price for the money tests.
  await setSetting('shop_promo_enabled', 'true');
  await setSetting('shop_promo_credits_per_day_paise', '1000'); // ₹10/day
  await setSetting('shop_promo_max_days', '30');

  const m = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','marketing') RETURNING id`,
    [`PROMO Mkt ${uniq}`, `promo_mkt_${uniq}@test.local`, `+9155${uniq}`]
  );
  marketing = { id: m.rows[0].id, token: adminToken(m.rows[0].id) };

  const res = await request(app).post('/api/auth/register').send({
    name: 'PROMO Owner', email: `promo_owner_${uniq}@test.local`, phone: `+9188${uniq}`,
    password: 'password123', shopName: 'PROMO Shop',
  });
  expect(res.status).toBe(201);
  owner = { token: res.body.token, user: res.body.user, shop: res.body.shop };

  // Give the shop a full location so all three geo targets get created.
  await pool.query(
    'UPDATE shops SET city = $2, village = $3, pincode = $4 WHERE id = $1',
    [owner.shop.id, townValue, villageValue, pincodeValue]
  );
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
  await pool.query('DELETE FROM users WHERE id = $1', [marketing.id]);
  await pool.end();
});

describe('migration 0054 — schema + settings', () => {
  test('ad_campaigns gains self_serve + credits_spent_paise, status CHECK widened', async () => {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ad_campaigns' AND column_name IN ('self_serve','credits_spent_paise')
        ORDER BY column_name`
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(['credits_spent_paise', 'self_serve']);

    // The widened CHECK must accept the two new states.
    const c = await pool.query(
      `INSERT INTO ad_campaigns (style, title, status) VALUES ('shop','_probe_','pending_review') RETURNING id`
    );
    await pool.query("UPDATE ad_campaigns SET status = 'rejected' WHERE id = $1", [c.rows[0].id]);
    await pool.query('DELETE FROM ad_campaigns WHERE id = $1', [c.rows[0].id]);
  });

  test('platform_settings seeded the pricing keys', async () => {
    const r = await pool.query(
      `SELECT key FROM platform_settings WHERE key IN
       ('shop_promo_enabled','shop_promo_credits_per_day_paise','shop_promo_max_days')`
    );
    expect(r.rows.length).toBe(3);
  });
});

describe('GET /api/promos/config', () => {
  test('returns live pricing + the shop balance', async () => {
    await creditShop(owner.shop.id, 5000); // ₹50
    const res = await authHdr(request(app).get('/api/promos/config'), owner.token);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.credits_per_day_paise).toBe(1000);
    expect(res.body.max_days).toBe(30);
    expect(res.body.balance_paise).toBe(5000);
  });
});

describe('POST /api/promos/mine — buy a moderated placement', () => {
  let created;

  test('debits credits, creates a pending_review row with the shop geo targets', async () => {
    const before = await shopBalance(owner.shop.id); // 5000
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token)
      .send({ days: 3, offer_text: 'Fresh stock daily', subtitle: 'Visit us' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.cost_paise).toBe(3000); // 3 * 1000
    created = res.body.id;

    // Balance dropped by exactly the cost, in the same transaction.
    expect(await shopBalance(owner.shop.id)).toBe(before - 3000);

    // A debit ledger row of kind 'redeem_promo' exists referencing the promo.
    const rows = await ledgerRows(owner.shop.id);
    const debit = rows.find((r) => r.direction === 'debit' && r.kind === 'redeem_promo');
    expect(debit).toBeTruthy();
    expect(Number(debit.amount_paise)).toBe(3000);
    expect(debit.ref_note).toBe(`promo ${created}`);

    // Row shape: self_serve, style shop, link to the shop, credits recorded.
    const c = await pool.query(
      'SELECT style, self_serve, status, link_type, link_shop_id, credits_spent_paise FROM ad_campaigns WHERE id = $1',
      [created]
    );
    expect(c.rows[0].style).toBe('shop');
    expect(c.rows[0].self_serve).toBe(true);
    expect(c.rows[0].status).toBe('pending_review');
    expect(c.rows[0].link_type).toBe('shop');
    expect(c.rows[0].link_shop_id).toBe(owner.shop.id);
    expect(Number(c.rows[0].credits_spent_paise)).toBe(3000);

    // Three geo targets (pincode + village + town), never 'all'.
    const t = await pool.query('SELECT geo_type, geo_value FROM ad_targets WHERE campaign_id = $1', [created]);
    const kinds = t.rows.map((r) => r.geo_type).sort();
    expect(kinds).toEqual(['pincode', 'town', 'village']);
    expect(t.rows.some((r) => r.geo_type === 'all')).toBe(false);
    expect(t.rows.find((r) => r.geo_type === 'town').geo_value).toBe(townValue);
  });

  test('the pending promo is NOT served publicly (excluded until approved)', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(townValue)}`);
    expect(res.status).toBe(200);
    expect(res.body.promos.some((p) => p.id === created)).toBe(false);
  });

  test('it appears in the owner list + the admin pending queue', async () => {
    const mine = await authHdr(request(app).get('/api/promos/mine'), owner.token);
    expect(mine.status).toBe(200);
    expect(mine.body.promos[0].id).toBe(created);
    expect(mine.body.promos[0].status).toBe('pending_review');

    const pend = await authHdr(request(app).get('/api/admin/promos/pending'), marketing.token);
    expect(pend.status).toBe(200);
    const row = pend.body.items.find((i) => i.id === created);
    expect(row).toBeTruthy();
    expect(row.shop_name).toBe('PROMO Shop');
    expect(Number(row.credits_spent_paise)).toBe(3000);
  });

  test('insufficient credits is rejected — no row, no debit', async () => {
    const before = await shopBalance(owner.shop.id);
    const countBefore = await pool.query('SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE link_shop_id = $1', [owner.shop.id]);
    // 30 days * ₹10 = ₹300 = 30000 paise, far above the remaining balance.
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ days: 30 });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('insufficient_credits');
    expect(await shopBalance(owner.shop.id)).toBe(before); // unchanged
    const countAfter = await pool.query('SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE link_shop_id = $1', [owner.shop.id]);
    expect(countAfter.rows[0].n).toBe(countBefore.rows[0].n); // no row inserted
  });

  test('approve → active → served', async () => {
    const res = await authHdr(request(app).post(`/api/admin/promos/${created}/approve`), marketing.token).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const c = await pool.query('SELECT status FROM ad_campaigns WHERE id = $1', [created]);
    expect(c.rows[0].status).toBe('active');

    const pub = await request(app).get(`/api/public/promos?town=${encodeURIComponent(townValue)}`);
    expect(pub.body.promos.some((p) => p.id === created)).toBe(true);
  });

  test('approve is guarded — re-approving an active promo 409s', async () => {
    const res = await authHdr(request(app).post(`/api/admin/promos/${created}/approve`), marketing.token).send({});
    expect(res.status).toBe(409);
  });
});

describe('reject → refund (idempotent, no double-refund)', () => {
  let promoId;

  test('setup: buy a fresh placement', async () => {
    await creditShop(owner.shop.id, 10000); // top up
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ days: 2 });
    expect(res.status).toBe(201);
    promoId = res.body.id;
    expect(res.body.cost_paise).toBe(2000);
  });

  test('first reject flips to rejected AND refunds exactly the cost', async () => {
    const before = await shopBalance(owner.shop.id);
    const res = await authHdr(request(app).post(`/api/admin/promos/${promoId}/reject`), marketing.token)
      .send({ reason: 'not appropriate' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.refunded_paise).toBe(2000);
    expect(await shopBalance(owner.shop.id)).toBe(before + 2000);

    const rows = await ledgerRows(owner.shop.id);
    const refunds = rows.filter((r) => r.kind === 'refund' && r.ref_note.includes(promoId));
    expect(refunds.length).toBe(1);
    expect(Number(refunds[0].amount_paise)).toBe(2000);
  });

  test('a second reject does NOT double-refund (idempotent)', async () => {
    const before = await shopBalance(owner.shop.id);
    const res = await authHdr(request(app).post(`/api/admin/promos/${promoId}/reject`), marketing.token)
      .send({ reason: 'again' });
    expect(res.status).toBe(409); // already out of pending_review
    expect(await shopBalance(owner.shop.id)).toBe(before); // unchanged

    const rows = await ledgerRows(owner.shop.id);
    const refunds = rows.filter((r) => r.kind === 'refund' && r.ref_note.includes(promoId));
    expect(refunds.length).toBe(1); // still exactly one refund
  });

  test('a rejected promo never serves', async () => {
    const pub = await request(app).get(`/api/public/promos?town=${encodeURIComponent(townValue)}`);
    expect(pub.body.promos.some((p) => p.id === promoId)).toBe(false);
  });
});

describe('disabled flag → 403; balance stays non-negative', () => {
  test('with shop_promo_enabled=false the create is 403 and no debit happens', async () => {
    await setSetting('shop_promo_enabled', 'false');
    const before = await shopBalance(owner.shop.id);
    const res = await authHdr(request(app).post('/api/promos/mine'), owner.token).send({ days: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('shop_promo_disabled');
    expect(await shopBalance(owner.shop.id)).toBe(before);
    await setSetting('shop_promo_enabled', 'true'); // restore
  });

  test('the shop balance is never negative after all the flows', async () => {
    expect(await shopBalance(owner.shop.id)).toBeGreaterThanOrEqual(0);
  });
});
