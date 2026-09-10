// Integration tests for the one-time shop enrolment fee (Batch R1). Requires a
// real Postgres (DATABASE_URL) with migrations applied (incl. 0048_enrolment_fee).
// Razorpay is intentionally UNCONFIGURED in test, so the order/confirm flow runs
// in manual (instant-paid) mode — no network, no live keys.
//
// The feature ships OFF (enrolment_fee_enabled defaults to 'false'). These tests
// flip the flag directly in platform_settings to exercise the enabled paths, and
// restore it to 'false' afterwards so the DB is left dormant.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const enrolmentUtil = require('../src/utils/enrolment');

const uniq = Date.now().toString().slice(-9);

// Owner JWT with the shopId the owner-auth middleware reads (req.user.shopId).
function ownerToken(shop) {
  return jwt.sign({ sub: 'enrol-owner', role: 'owner', shopId: shop }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

async function makeShop(tag) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`Enrol ${tag}`, `enrol_${tag}_${uniq}@test.local`, `+9196${uniq}${tag}`.slice(0, 15)]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, `Enrol Store ${tag}`]
  );
  return { ownerId, shopId: shop.rows[0].id };
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

let shopA;
let shopB;
const createdShops = [];

beforeAll(async () => {
  shopA = await makeShop('1');
  shopB = await makeShop('2');
  createdShops.push(shopA, shopB);
});

afterAll(async () => {
  // Leave the feature dormant, defaults restored.
  await setSetting('enrolment_fee_enabled', 'false');
  await setSetting('referral_split_infra_pct', '50');
  await setSetting('referral_split_l1_pct', '30');
  await setSetting('referral_split_l2_pct', '15');
  for (const s of createdShops) {
    await pool.query('DELETE FROM shops WHERE id = $1', [s.shopId]);
    await pool.query('DELETE FROM users WHERE id = $1', [s.ownerId]);
  }
  await pool.end();
});

describe('enrolment is dormant by default (flag off)', () => {
  beforeAll(async () => {
    await setSetting('enrolment_fee_enabled', 'false');
  });

  it('GET /config returns enabled:false with tier amounts and the split', async () => {
    const res = await request(app)
      .get('/api/enrolment/config')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.tiers).toEqual([
      { tier: 'basic', amount_paise: 9900 },
      { tier: 'premium', amount_paise: 19900 },
    ]);
    // Razorpay unconfigured in test → key_id is null, secret never leaked.
    expect(res.body.key_id).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body.split).toMatchObject({ infra_pct: 50, l1_pct: 30, l2_pct: 15, buffer_pct: 5 });
  });

  it('POST /order is 403 enrolment_disabled when the flag is off', async () => {
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ tier: 'basic' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('enrolment_disabled');
  });

  it('POST /confirm is 403 enrolment_disabled when the flag is off', async () => {
    const res = await request(app)
      .post('/api/enrolment/confirm')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ enrolment_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('enrolment_disabled');
  });
});

describe('enrolment flow with the flag on (manual mode)', () => {
  let hookSpy;

  beforeAll(async () => {
    await setSetting('enrolment_fee_enabled', 'true');
    await setSetting('referral_split_infra_pct', '50');
    await setSetting('referral_split_l1_pct', '30');
    await setSetting('referral_split_l2_pct', '15');
    hookSpy = jest.spyOn(enrolmentUtil, 'onEnrolmentPaid');
  });

  afterAll(() => {
    hookSpy.mockRestore();
  });

  it('POST /order in manual mode creates a pending→paid enrolment and fires the R2 hook', async () => {
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ tier: 'basic' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ manual: true, status: 'paid' });

    // DB shows exactly one paid row for the shop with the snapshotted split.
    const rows = await pool.query(
      `SELECT status, tier, amount_paise, provider, split_infra_pct, split_l1_pct, split_l2_pct, paid_at
         FROM enrolments WHERE shop_id = $1`,
      [shopA.shopId]
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].status).toBe('paid');
    expect(rows.rows[0].tier).toBe('basic');
    expect(Number(rows.rows[0].amount_paise)).toBe(9900);
    expect(rows.rows[0].provider).toBe('manual');
    expect(rows.rows[0].split_infra_pct).toBe(50);
    expect(rows.rows[0].split_l1_pct).toBe(30);
    expect(rows.rows[0].split_l2_pct).toBe(15);
    expect(rows.rows[0].paid_at).toBeTruthy();

    // The R2 hook was invoked exactly once on the paid transition, with (shopId, enrolmentId).
    expect(hookSpy).toHaveBeenCalledTimes(1);
    const idRow = await pool.query('SELECT id FROM enrolments WHERE shop_id = $1', [shopA.shopId]);
    expect(hookSpy).toHaveBeenCalledWith(shopA.shopId, idRow.rows[0].id);
  });

  it('a second POST /order after a paid enrolment is 409 already_enrolled', async () => {
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ tier: 'premium' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_enrolled');
    // Still exactly one row — the blocked order created nothing.
    const rows = await pool.query('SELECT COUNT(*)::int AS n FROM enrolments WHERE shop_id = $1', [shopA.shopId]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('GET /mine shows the paid enrolment', async () => {
    const res = await request(app)
      .get('/api/enrolment/mine')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.tier).toBe('basic');
    expect(res.body.amount_paise).toBe(9900);
    expect(res.body.paid_at).toBeTruthy();
  });

  it('confirming an already-paid enrolment is idempotent — no duplicate, no error', async () => {
    const idRow = await pool.query('SELECT id FROM enrolments WHERE shop_id = $1', [shopA.shopId]);
    const enrolmentId = idRow.rows[0].id;
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM enrolments WHERE shop_id = $1', [shopA.shopId]);

    hookSpy.mockClear();
    const res = await request(app)
      .post('/api/enrolment/confirm')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ enrolment_id: enrolmentId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'paid', tier: 'basic', amount_paise: 9900 });

    const after = await pool.query('SELECT COUNT(*)::int AS n FROM enrolments WHERE shop_id = $1', [shopA.shopId]);
    expect(after.rows[0].n).toBe(before.rows[0].n); // no duplicate row
    // Row was already paid → the paid-transition hook does NOT fire again.
    expect(hookSpy).not.toHaveBeenCalled();
  });

  it('GET /config now reports enabled:true', async () => {
    const res = await request(app)
      .get('/api/enrolment/config')
      .set('Authorization', `Bearer ${ownerToken(shopB.shopId)}`);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});

describe('getEnrolmentConfig math + amountForTier', () => {
  afterAll(async () => {
    // Restore default split for any later reader.
    await setSetting('referral_split_infra_pct', '50');
    await setSetting('referral_split_l1_pct', '30');
    await setSetting('referral_split_l2_pct', '15');
  });

  it('buffer = 100 - infra - l1 - l2 and valid=true when the shares fit', async () => {
    await setSetting('referral_split_infra_pct', '40');
    await setSetting('referral_split_l1_pct', '25');
    await setSetting('referral_split_l2_pct', '20');
    const cfg = await enrolmentUtil.getEnrolmentConfig();
    expect(cfg.split).toEqual({ infra_pct: 40, l1_pct: 25, l2_pct: 20, buffer_pct: 15 });
    expect(cfg.valid).toBe(true);
  });

  it('valid=false when infra + l1 + l2 > 100 (buffer clamps to 0)', async () => {
    await setSetting('referral_split_infra_pct', '60');
    await setSetting('referral_split_l1_pct', '30');
    await setSetting('referral_split_l2_pct', '20');
    const cfg = await enrolmentUtil.getEnrolmentConfig();
    expect(cfg.valid).toBe(false);
    expect(cfg.split.buffer_pct).toBe(0);
  });

  it('amountForTier maps by tier and rejects unknown tiers', () => {
    const cfg = { basic_paise: 9900, premium_paise: 19900 };
    expect(enrolmentUtil.amountForTier('basic', cfg)).toBe(9900);
    expect(enrolmentUtil.amountForTier('premium', cfg)).toBe(19900);
    expect(enrolmentUtil.amountForTier('gold', cfg)).toBeNull();
  });

  it('onEnrolmentPaid delegates to chain accrual and never throws on bad ids (accrued:false)', async () => {
    // R2 fills the stub: onEnrolmentPaid now delegates to the fee-funded chain
    // accrual. With garbage ids it must resolve (best-effort) to accrued:false,
    // never throw into the payment-confirm path.
    const r = await enrolmentUtil.onEnrolmentPaid('shop', 'enrol');
    expect(r.accrued).toBe(false);
  });
});
