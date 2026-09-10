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
const crypto = require('crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const enrolmentUtil = require('../src/utils/enrolment');
const settings = require('../src/config/settings');

const uniq = Date.now().toString().slice(-9);

// Owner JWT with the shopId the owner-auth middleware reads (req.user.shopId).
// `sub` becomes created_by on any ledger row written at order time; pass a real
// user UUID when the order debits credits (created_by is a UUID column), else the
// default string is fine for the no-credit paths.
function ownerToken(shop, sub = 'enrol-owner') {
  return jwt.sign({ sub, role: 'owner', shopId: shop }, process.env.JWT_SECRET, {
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

// ---------------------------------------------------------------------------
// Batch R5 — debit enrolment credits at CAPTURE, not at ORDER time. The core fix:
// a Razorpay order records the credit INTENT (wallet_applied_paise, credits_debited
// =false) but debits nothing; the debit happens on the pending->paid transition in
// markPaid, atomically and once. An abandoned checkout stays pending → never debited.
// The full-credit and manual paths still debit at order time (credits_debited=true).
//
// The suite runs Razorpay-UNCONFIGURED, so the razorpay branch is exercised by
// inserting provider='razorpay' pending rows directly and driving the confirm path
// (for the capture case, RAZORPAY keys are put into the settings cache ONLY so the
// confirm signature check can pass — orders are seeded, never network-created).
describe('debit-at-capture: credits debited on the paid transition (Batch R5)', () => {
  let shopC; // abandoned razorpay order
  let shopD; // captured razorpay order
  let shopE; // full-credit path (remaining 0)
  let shopF; // manual-mode partial credit

  const RZP_KEY = 'rzp_test_r5';
  const RZP_SECRET = 'r5_secret_key';

  async function seedWallet(shopId, paise) {
    await pool.query(
      `INSERT INTO referral_wallets (owner_type, owner_id, balance_paise)
       VALUES ('shop', $1, $2)
       ON CONFLICT (owner_type, owner_id) DO UPDATE SET balance_paise = EXCLUDED.balance_paise`,
      [shopId, paise]
    );
  }
  async function walletBalance(shopId) {
    const r = await pool.query(
      "SELECT balance_paise FROM referral_wallets WHERE owner_type='shop' AND owner_id=$1",
      [shopId]
    );
    return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
  }
  async function redeemLedgerCount(shopId) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM referral_ledger l
         JOIN referral_wallets w ON w.id = l.wallet_id
        WHERE w.owner_type='shop' AND w.owner_id=$1 AND l.kind='redeem_enrolment'`,
      [shopId]
    );
    return r.rows[0].n;
  }
  function sign(orderId, paymentId) {
    return crypto.createHmac('sha256', RZP_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  }

  beforeAll(async () => {
    await setSetting('enrolment_fee_enabled', 'true');
    await setSetting('referral_split_infra_pct', '50');
    await setSetting('referral_split_l1_pct', '30');
    await setSetting('referral_split_l2_pct', '15');
    shopC = await makeShop('C');
    shopD = await makeShop('D');
    shopE = await makeShop('E');
    shopF = await makeShop('F');
    createdShops.push(shopC, shopD, shopE, shopF);
    await seedWallet(shopC.shopId, 9900); // exactly the basic fee
    await seedWallet(shopD.shopId, 9900);
    await seedWallet(shopE.shopId, 9900);
    await seedWallet(shopF.shopId, 5000); // less than the fee -> partial credit
  });

  it('ABANDONED razorpay order records the intent but does NOT debit the wallet', async () => {
    // The razorpay branch inserts a pending row with the credit INTENT and
    // credits_debited=false, and debits nothing (see createOrder). Simulate that
    // exact post-order state; the shopper then abandons the checkout (no confirm).
    const ins = await pool.query(
      `INSERT INTO enrolments
         (shop_id, tier, amount_paise, status, provider, provider_order_id,
          split_infra_pct, split_l1_pct, split_l2_pct, wallet_applied_paise, credits_debited)
       VALUES ($1,'basic',9900,'pending','razorpay',$2,50,30,15,9900,false)
       RETURNING id`,
      [shopC.shopId, `order_abandon_${uniq}`]
    );
    expect(ins.rowCount).toBe(1);
    // Balance fully intact, and NO redeem_enrolment ledger row exists until confirm.
    expect(await walletBalance(shopC.shopId)).toBe(9900);
    expect(await redeemLedgerCount(shopC.shopId)).toBe(0);
    const row = await pool.query(
      'SELECT status, credits_debited, wallet_applied_paise FROM enrolments WHERE id=$1',
      [ins.rows[0].id]
    );
    expect(row.rows[0].status).toBe('pending');
    expect(row.rows[0].credits_debited).toBe(false);
    expect(Number(row.rows[0].wallet_applied_paise)).toBe(9900);
  });

  describe('CAPTURED razorpay order via /confirm', () => {
    let orderId;
    let enrolId;
    beforeAll(async () => {
      // Put RAZORPAY keys into the settings cache so verifyPaymentSignature passes.
      // Only the confirm signature check reads these; the order row is seeded below.
      await settings.setMany({ RAZORPAY_KEY_ID: RZP_KEY, RAZORPAY_KEY_SECRET: RZP_SECRET });
      orderId = `order_capture_${uniq}`;
      const ins = await pool.query(
        `INSERT INTO enrolments
           (shop_id, tier, amount_paise, status, provider, provider_order_id,
            split_infra_pct, split_l1_pct, split_l2_pct, wallet_applied_paise, credits_debited)
         VALUES ($1,'basic',9900,'pending','razorpay',$2,50,30,15,9900,false)
         RETURNING id`,
        [shopD.shopId, orderId]
      );
      enrolId = ins.rows[0].id;
    });
    afterAll(async () => {
      // Restore Razorpay-unconfigured for the manual-mode tests that follow.
      await settings.setMany({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' });
    });

    it('confirm debits the wallet by the applied amount exactly once + sets credits_debited', async () => {
      expect(await walletBalance(shopD.shopId)).toBe(9900);
      const paymentId = 'pay_r5_capture';
      const res = await request(app)
        .post('/api/enrolment/confirm')
        .set('Authorization', `Bearer ${ownerToken(shopD.shopId)}`)
        .send({ order_id: orderId, payment_id: paymentId, signature: sign(orderId, paymentId) });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paid');
      // Debited exactly the applied amount on the paid transition; one ledger row.
      expect(await walletBalance(shopD.shopId)).toBe(0);
      expect(await redeemLedgerCount(shopD.shopId)).toBe(1);
      const row = await pool.query(
        'SELECT status, credits_debited, wallet_applied_paise FROM enrolments WHERE id=$1',
        [enrolId]
      );
      expect(row.rows[0].status).toBe('paid');
      expect(row.rows[0].credits_debited).toBe(true);
      expect(Number(row.rows[0].wallet_applied_paise)).toBe(9900);
    });

    it('a second confirm does NOT debit again (the credits_debited guard is idempotent)', async () => {
      const paymentId = 'pay_r5_capture';
      const res = await request(app)
        .post('/api/enrolment/confirm')
        .set('Authorization', `Bearer ${ownerToken(shopD.shopId)}`)
        .send({ order_id: orderId, payment_id: paymentId, signature: sign(orderId, paymentId) });
      expect(res.status).toBe(200);
      expect(await walletBalance(shopD.shopId)).toBe(0);
      expect(await redeemLedgerCount(shopD.shopId)).toBe(1); // still exactly one debit
    });
  });

  it('FULL-CREDIT path debits at order time with credits_debited=true; confirm never re-debits', async () => {
    // balance == fee -> remaining 0 -> the full-credit branch: debit + straight to paid.
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${ownerToken(shopE.shopId, shopE.ownerId)}`)
      .send({ tier: 'basic', use_wallet: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(await walletBalance(shopE.shopId)).toBe(0);
    expect(await redeemLedgerCount(shopE.shopId)).toBe(1);
    const row = await pool.query(
      'SELECT credits_debited, wallet_applied_paise FROM enrolments WHERE shop_id=$1',
      [shopE.shopId]
    );
    expect(row.rows[0].credits_debited).toBe(true);
    expect(Number(row.rows[0].wallet_applied_paise)).toBe(9900);
    // Re-confirm the (already-paid) row → markPaid sees credits_debited=true, no re-debit.
    const idRow = await pool.query('SELECT id FROM enrolments WHERE shop_id=$1', [shopE.shopId]);
    const res2 = await request(app)
      .post('/api/enrolment/confirm')
      .set('Authorization', `Bearer ${ownerToken(shopE.shopId)}`)
      .send({ enrolment_id: idRow.rows[0].id });
    expect(res2.status).toBe(200);
    expect(await walletBalance(shopE.shopId)).toBe(0);
    expect(await redeemLedgerCount(shopE.shopId)).toBe(1); // unchanged — no double-debit
  });

  it('MANUAL mode with partial credit debits at order time (credits_debited=true), no re-debit', async () => {
    // balance < fee, Razorpay unconfigured -> the manual instant-paid branch:
    // applied = balance, remaining charged manually, debit at order time.
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${ownerToken(shopF.shopId, shopF.ownerId)}`)
      .send({ tier: 'basic', use_wallet: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(await walletBalance(shopF.shopId)).toBe(0);        // 5000 - 5000
    expect(await redeemLedgerCount(shopF.shopId)).toBe(1);
    const row = await pool.query(
      'SELECT credits_debited, wallet_applied_paise FROM enrolments WHERE shop_id=$1',
      [shopF.shopId]
    );
    expect(row.rows[0].credits_debited).toBe(true);
    expect(Number(row.rows[0].wallet_applied_paise)).toBe(5000);
    const idRow = await pool.query('SELECT id FROM enrolments WHERE shop_id=$1', [shopF.shopId]);
    const res2 = await request(app)
      .post('/api/enrolment/confirm')
      .set('Authorization', `Bearer ${ownerToken(shopF.shopId)}`)
      .send({ enrolment_id: idRow.rows[0].id });
    expect(res2.status).toBe(200);
    expect(await walletBalance(shopF.shopId)).toBe(0);
    expect(await redeemLedgerCount(shopF.shopId)).toBe(1); // no re-debit; balance >= 0 always
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
