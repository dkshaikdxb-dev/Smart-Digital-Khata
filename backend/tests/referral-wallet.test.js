// Integration tests for the closed-loop referral wallet ("Khata Credits"),
// real-time settlement, the influencer flat-bounty/budget-cap path, and
// dues-credit redemption (Batch R3). Requires a real Postgres (DATABASE_URL)
// with migrations applied (incl. 0048 + 0049 + 0050).
//
// Money is integer paise; every balance mutation is transactional; the balance
// can never go negative (guarded debit); settlement is idempotent. Razorpay is
// unconfigured in test, so the enrolment order runs in manual (instant-paid) mode.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const wallet = require('../src/utils/wallet');
const referral = require('../src/utils/referral');

const uniq = Date.now().toString().slice(-9);

const shopIds = [];
const ownerIds = [];
const codeIds = [];

let seq = 0;
function nextPhone() {
  return `+9172${uniq}${String(seq++).padStart(2, '0')}`.slice(0, 15);
}

async function makeShop(tag) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`Wallet ${tag}`, `wallet_${tag}_${uniq}@test.local`, nextPhone()]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, `Wallet Store ${tag}`]
  );
  const shopId = shop.rows[0].id;
  ownerIds.push(ownerId);
  shopIds.push(shopId);
  return { ownerId, shopId };
}

async function peerCodeFor(ownerId) {
  const c = await referral.getOrCreateCodeForUser(ownerId, 'owner');
  codeIds.push(c.id);
  return c;
}

async function influencerCode(tag) {
  const c = await referral.createUniqueCode({ ownerType: 'influencer', label: `Inf ${tag}` });
  codeIds.push(c.id);
  return c;
}

async function attribute(code, referredUserId, referredShopId) {
  await pool.query(
    `INSERT INTO referrals (referral_code_id, code, referred_type, referred_user_id, referred_shop_id)
     VALUES ($1,$2,'shop',$3,$4)`,
    [code.id, code.code, referredUserId, referredShopId]
  );
}

async function paidEnrolment(shopId, amountPaise, l1Pct, l2Pct, infraPct = 50) {
  const r = await pool.query(
    `INSERT INTO enrolments
       (shop_id, tier, amount_paise, status, provider,
        split_infra_pct, split_l1_pct, split_l2_pct, paid_at)
     VALUES ($1,'basic',$2,'paid','manual',$3,$4,$5,NOW())
     RETURNING id`,
    [shopId, amountPaise, infraPct, l1Pct, l2Pct]
  );
  return r.rows[0].id;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

function shopWalletRow(shopId) {
  return pool.query(
    "SELECT id, balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
}
function codeWalletRow(codeId) {
  return pool.query(
    "SELECT id, balance_paise FROM referral_wallets WHERE owner_type = 'code' AND owner_id = $1",
    [codeId]
  );
}

const FEE = 10000; // ₹100
const L1 = 30;
const L2 = 15;
const POOL = Math.floor((FEE * (L1 + L2)) / 100); // 4500
const L1_AMT = Math.floor((FEE * L1) / 100); // 3000

afterAll(async () => {
  await pool.query(
    `DELETE FROM referral_ledger WHERE wallet_id IN (
       SELECT id FROM referral_wallets
        WHERE (owner_type = 'shop' AND owner_id = ANY($1))
           OR (owner_type = 'code' AND owner_id = ANY($2)))`,
    [shopIds, codeIds]
  );
  await pool.query(
    "DELETE FROM referral_wallets WHERE (owner_type='shop' AND owner_id = ANY($1)) OR (owner_type='code' AND owner_id = ANY($2))",
    [shopIds, codeIds]
  );
  await pool.query(
    `DELETE FROM referral_rewards
       WHERE source_shop_id = ANY($1)
          OR beneficiary_code_id = ANY($2)
          OR referral_id IN (SELECT id FROM referrals WHERE referred_shop_id = ANY($1))`,
    [shopIds, codeIds]
  );
  await pool.query('DELETE FROM referrals WHERE referred_shop_id = ANY($1)', [shopIds]);
  await pool.query('DELETE FROM enrolments WHERE shop_id = ANY($1)', [shopIds]);
  await pool.query('DELETE FROM referral_codes WHERE id = ANY($1)', [codeIds]);
  await pool.query('DELETE FROM shops WHERE id = ANY($1)', [shopIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ownerIds]);
  await setSetting('enrolment_fee_enabled', 'false');
  await pool.end();
});

describe('wallet primitives — non-negative + transactional', () => {
  it('creditWallet raises the balance and writes balance_after; debitWallet lowers it', async () => {
    const w = await wallet.getOrCreateWallet('shop', (await makeShop('P1')).shopId);
    const b1 = await wallet.creditWallet({ wallet: w, amount_paise: 5000, kind: 'adjustment' });
    expect(b1).toBe(5000);
    const b2 = await wallet.creditWallet({ wallet: w, amount_paise: 2500, kind: 'adjustment' });
    expect(b2).toBe(7500);
    const b3 = await wallet.debitWallet({ wallet: w, amount_paise: 1000, kind: 'adjustment' });
    expect(b3).toBe(6500);

    const led = await pool.query(
      'SELECT direction, amount_paise, balance_after_paise FROM referral_ledger WHERE wallet_id = $1 ORDER BY created_at ASC',
      [w.id]
    );
    expect(led.rows.map((r) => Number(r.balance_after_paise))).toEqual([5000, 7500, 6500]);
    expect(led.rows.map((r) => r.direction)).toEqual(['credit', 'credit', 'debit']);
  });

  it('a guarded debit can NEVER overdraw the balance (throws insufficient, writes nothing)', async () => {
    const w = await wallet.getOrCreateWallet('shop', (await makeShop('P2')).shopId);
    await wallet.creditWallet({ wallet: w, amount_paise: 1000, kind: 'adjustment' });

    await expect(
      wallet.debitWallet({ wallet: w, amount_paise: 1001, kind: 'adjustment' })
    ).rejects.toMatchObject({ code: 'insufficient' });

    // Balance is untouched and no debit row was written.
    const row = await pool.query('SELECT balance_paise FROM referral_wallets WHERE id = $1', [w.id]);
    expect(Number(row.rows[0].balance_paise)).toBe(1000);
    const debits = await pool.query(
      "SELECT COUNT(*)::int AS c FROM referral_ledger WHERE wallet_id = $1 AND direction = 'debit'",
      [w.id]
    );
    expect(debits.rows[0].c).toBe(0);
  });

  it('rejects non-integer / non-positive amounts', async () => {
    const w = await wallet.getOrCreateWallet('shop', (await makeShop('P3')).shopId);
    await expect(wallet.creditWallet({ wallet: w, amount_paise: 0, kind: 'adjustment' })).rejects.toThrow();
    await expect(wallet.creditWallet({ wallet: w, amount_paise: -5, kind: 'adjustment' })).rejects.toThrow();
    await expect(wallet.creditWallet({ wallet: w, amount_paise: 1.5, kind: 'adjustment' })).rejects.toThrow();
  });
});

describe('real-time settlement (chain reward → peer shop wallet)', () => {
  it('a chain reward settles into the referrer SHOP wallet with one reward_settled credit; idempotent', async () => {
    const A = await makeShop('SA');
    const B = await makeShop('SB');
    const aCode = await peerCodeFor(A.ownerId);
    await attribute(aCode, B.ownerId, B.shopId); // A referred B

    const enrol = await paidEnrolment(B.shopId, FEE, L1, L2);
    const res = await referral.accrueEnrolmentChainRewards(B.shopId, enrol);
    expect(res.accrued).toBe(true);
    expect(res.l1_amount).toBe(L1_AMT);

    // The chain reward is now SETTLED (not merely accrued).
    const reward = await pool.query(
      "SELECT id, status FROM referral_rewards WHERE source_enrolment_id = $1 AND beneficiary_role = 'chain_l1'",
      [enrol]
    );
    expect(reward.rows[0].status).toBe('settled');

    // A's SHOP wallet balance equals the reward, with exactly one reward_settled credit.
    const w = await shopWalletRow(A.shopId);
    expect(w.rowCount).toBe(1);
    expect(Number(w.rows[0].balance_paise)).toBe(L1_AMT);
    const credits = await pool.query(
      "SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_paise),0)::bigint AS s FROM referral_ledger WHERE wallet_id = $1 AND kind = 'reward_settled'",
      [w.rows[0].id]
    );
    expect(credits.rows[0].c).toBe(1);
    expect(Number(credits.rows[0].s)).toBe(L1_AMT);

    // Idempotent: re-settling the same reward is a no-op — no double-credit.
    const again = await referral.settleReward({ id: reward.rows[0].id });
    expect(again.settled).toBe(false);
    const w2 = await shopWalletRow(A.shopId);
    expect(Number(w2.rows[0].balance_paise)).toBe(L1_AMT);
  });

  it('autosettle=false leaves rewards accrued; an admin settle drains them', async () => {
    await setSetting('referral_autosettle', 'false');
    try {
      const A = await makeShop('NSA');
      const B = await makeShop('NSB');
      const aCode = await peerCodeFor(A.ownerId);
      await attribute(aCode, B.ownerId, B.shopId);
      const enrol = await paidEnrolment(B.shopId, FEE, L1, L2);
      await referral.accrueEnrolmentChainRewards(B.shopId, enrol);

      // With autosettle off the reward stays 'accrued' and the wallet is empty.
      const reward = await pool.query(
        "SELECT id, status FROM referral_rewards WHERE source_enrolment_id = $1 AND beneficiary_role = 'chain_l1'",
        [enrol]
      );
      expect(reward.rows[0].status).toBe('accrued');
      expect((await shopWalletRow(A.shopId)).rowCount).toBe(0);

      // Draining settles it into the wallet.
      const drain = await referral.settleAllAccrued();
      expect(drain.settled).toBeGreaterThanOrEqual(1);
      const w = await shopWalletRow(A.shopId);
      expect(Number(w.rows[0].balance_paise)).toBe(L1_AMT);
    } finally {
      await setSetting('referral_autosettle', 'true');
    }
  });
});

describe('influencer flat-bounty + budget cap (non-peer path, zero-burn)', () => {
  it('accrues the flat bounty to a code wallet, capped by budget, never above poolCap', async () => {
    // Budget cap = exactly one 2000 bounty.
    const inf = await influencerCode('BC');
    await pool.query('UPDATE referral_codes SET flat_bounty_paise = 2000, budget_cap_paise = 2000 WHERE id = $1', [inf.id]);

    // First referred shop → bounty 2000 (min(flat 2000, budget 2000, pool 4500)).
    const N1 = await makeShop('IN1');
    await attribute(inf, N1.ownerId, N1.shopId);
    const e1 = await paidEnrolment(N1.shopId, FEE, L1, L2);
    const r1 = await referral.accrueEnrolmentChainRewards(N1.shopId, e1);
    expect(r1).toMatchObject({ accrued: true, influencer_amount: 2000 });
    expect(2000).toBeLessThanOrEqual(POOL);

    let cw = await codeWalletRow(inf.id);
    expect(Number(cw.rows[0].balance_paise)).toBe(2000);

    // Second referred shop → budget exhausted → accrues nothing.
    const N2 = await makeShop('IN2');
    await attribute(inf, N2.ownerId, N2.shopId);
    const e2 = await paidEnrolment(N2.shopId, FEE, L1, L2);
    const r2 = await referral.accrueEnrolmentChainRewards(N2.shopId, e2);
    expect(r2).toEqual({ accrued: false, reason: 'budget_exhausted' });
    cw = await codeWalletRow(inf.id);
    expect(Number(cw.rows[0].balance_paise)).toBe(2000); // unchanged

    // The influencer chain has NO L2.
    const l2 = await pool.query(
      "SELECT COUNT(*)::int AS c FROM referral_rewards WHERE source_enrolment_id = $1 AND beneficiary_role = 'chain_l2'",
      [e1]
    );
    expect(l2.rows[0].c).toBe(0);
  });

  it('clamps the bounty to poolCap when the flat amount exceeds the pool', async () => {
    const inf = await influencerCode('PC');
    // flat 5000 > poolCap 4500, uncapped budget → bounty = poolCap.
    await pool.query('UPDATE referral_codes SET flat_bounty_paise = 5000, budget_cap_paise = NULL WHERE id = $1', [inf.id]);
    const N = await makeShop('IPC');
    await attribute(inf, N.ownerId, N.shopId);
    const e = await paidEnrolment(N.shopId, FEE, L1, L2);
    const r = await referral.accrueEnrolmentChainRewards(N.shopId, e);
    expect(r.accrued).toBe(true);
    expect(r.influencer_amount).toBe(POOL);
    const cw = await codeWalletRow(inf.id);
    expect(Number(cw.rows[0].balance_paise)).toBe(POOL);
  });

  it('a non-peer code with NO flat bounty accrues nothing', async () => {
    const inf = await influencerCode('NB');
    const N = await makeShop('INB');
    await attribute(inf, N.ownerId, N.shopId);
    const e = await paidEnrolment(N.shopId, FEE, L1, L2);
    const r = await referral.accrueEnrolmentChainRewards(N.shopId, e);
    expect(r).toEqual({ accrued: false, reason: 'non_peer_referrer' });
  });
});

describe('zero-burn invariant across a funded enrolment', () => {
  it('chain + influencer settled ≤ floor(fee*(l1+l2)%)', async () => {
    const A = await makeShop('ZA');
    const B = await makeShop('ZB');
    const aCode = await peerCodeFor(A.ownerId);
    await attribute(aCode, B.ownerId, B.shopId);
    const enrol = await paidEnrolment(B.shopId, FEE, L1, L2);
    await referral.accrueEnrolmentChainRewards(B.shopId, enrol);

    const sum = await pool.query(
      `SELECT COALESCE(SUM(amount_paise),0)::bigint AS s FROM referral_rewards
        WHERE source_enrolment_id = $1
          AND beneficiary_role IN ('chain_l1','chain_l2','influencer')
          AND status IN ('accrued','settled')`,
      [enrol]
    );
    expect(Number(sum.rows[0].s)).toBeLessThanOrEqual(POOL);
  });
});

describe('dues-credit redemption — use_wallet on an enrolment order', () => {
  function ownerToken(sub, shop) {
    return jwt.sign({ sub, role: 'owner', shopId: shop }, process.env.JWT_SECRET, { expiresIn: '30d' });
  }

  beforeAll(async () => {
    await setSetting('enrolment_fee_enabled', 'true');
    await setSetting('enrolment_fee_basic_paise', String(FEE));
  });

  it('credits fully covering the fee mark the enrolment paid with NO Razorpay charge', async () => {
    const S = await makeShop('RD1');
    const w = await wallet.getOrCreateWallet('shop', S.shopId);
    await wallet.creditWallet({ wallet: w, amount_paise: FEE + 500, kind: 'adjustment' }); // more than the fee

    const token = ownerToken(S.ownerId, S.shopId);
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'basic', use_wallet: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.wallet_applied_paise).toBe(FEE);
    expect(res.body.charge_paise).toBe(0);

    // Balance dropped by exactly the fee; the enrolment records the applied credit.
    const after = await shopWalletRow(S.shopId);
    expect(Number(after.rows[0].balance_paise)).toBe(500);
    const enr = await pool.query(
      "SELECT status, wallet_applied_paise FROM enrolments WHERE shop_id = $1 AND status = 'paid'",
      [S.shopId]
    );
    expect(enr.rowCount).toBe(1);
    expect(Number(enr.rows[0].wallet_applied_paise)).toBe(FEE);

    // A redeem_enrolment debit is on the ledger.
    const debit = await pool.query(
      "SELECT amount_paise FROM referral_ledger WHERE wallet_id = $1 AND kind = 'redeem_enrolment'",
      [w.id]
    );
    expect(debit.rowCount).toBe(1);
    expect(Number(debit.rows[0].amount_paise)).toBe(FEE);
  });

  it('a partial balance applies min(balance, fee) and can never overdraw', async () => {
    const S = await makeShop('RD2');
    const w = await wallet.getOrCreateWallet('shop', S.shopId);
    await wallet.creditWallet({ wallet: w, amount_paise: 4000, kind: 'adjustment' }); // less than the fee

    const token = ownerToken(S.ownerId, S.shopId);
    const res = await request(app)
      .post('/api/enrolment/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ tier: 'basic', use_credits: true }); // alias
    expect(res.status).toBe(200);
    expect(res.body.wallet_applied_paise).toBe(4000);

    // The whole (partial) balance was spent — never more.
    const after = await shopWalletRow(S.shopId);
    expect(Number(after.rows[0].balance_paise)).toBe(0);
  });

  afterAll(async () => {
    await setSetting('enrolment_fee_enabled', 'false');
    await setSetting('enrolment_fee_basic_paise', '9900');
  });
});

describe('admin economics aggregate', () => {
  let superToken;

  beforeAll(async () => {
    const admin = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
       VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
      ['Wallet Admin', `wallet_admin_${uniq}@test.local`, nextPhone()]
    );
    ownerIds.push(admin.rows[0].id);
    superToken = jwt.sign({ sub: admin.rows[0].id, role: 'admin', adminRole: 'super' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  });

  it('returns gross fees, chain/influencer spend, wallet liability and the zero-burn flag', async () => {
    const res = await request(app)
      .get('/api/admin/referral/economics')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const b = res.body;
    // Seeded scenario has funded enrolments and settled chain/influencer rewards.
    expect(b.total_paid_enrolments).toBeGreaterThan(0);
    expect(b.gross_fees_paise).toBeGreaterThan(0);
    expect(b.chain_paid_paise).toBeGreaterThan(0);
    expect(b.influencer_spend_paise).toBeGreaterThan(0);
    expect(b.wallet_liability_paise).toBeGreaterThanOrEqual(0);
    // The invariant holds: the network never pays out more than the pool funded.
    expect(b.chain_paid_paise + b.influencer_spend_paise).toBeLessThanOrEqual(b.referral_pool_collected_paise);
    expect(b.zero_burn_ok).toBe(true);
    expect(b.infra_retained_paise).toBe(b.gross_fees_paise - b.chain_paid_paise - b.influencer_spend_paise);
  });

  it('PATCH /referral/codes/:id sets flat_bounty_paise + budget_cap_paise and rejects negatives', async () => {
    const inf = await influencerCode('CFG');
    const ok = await request(app)
      .patch(`/api/admin/referral/codes/${inf.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ flat_bounty_paise: 1500, budget_cap_paise: 30000, label: 'Configured' });
    expect(ok.status).toBe(200);
    expect(ok.body.referral_code.flat_bounty_paise).toBe(1500);
    expect(ok.body.referral_code.budget_cap_paise).toBe(30000);
    expect(ok.body.referral_code.label).toBe('Configured');

    const bad = await request(app)
      .patch(`/api/admin/referral/codes/${inf.id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ flat_bounty_paise: -1 });
    expect(bad.status).toBe(400);
  });
});
