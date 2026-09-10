// Integration tests for the fee-funded 2-level referral chain (Batch R2, the
// zero-burn engine). Requires a real Postgres (DATABASE_URL) with migrations
// applied (incl. 0048_enrolment_fee + 0049_referral_chain).
//
// When a shop pays its one-time enrolment fee, that fee is split across the
// referral chain — the direct referrer (L1) and the referrer's referrer (L2) —
// drawn ENTIRELY from the fee just collected, so the platform never advances its
// own capital (zero burn). A fee-paid shop's later activation must NOT also fire
// the old platform-funded flat bounty (the fee-funded chain replaces it).
//
// Money is integer paise; every split is integer floor math. The split snapshot
// is written directly on the enrolment rows here, so the chain math is immune to
// concurrent platform_settings changes from sibling test files.
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const { pool } = require('../src/config/db');
const referral = require('../src/utils/referral');

const uniq = Date.now().toString().slice(-9);

const shopIds = [];
const ownerIds = [];
const codeIds = [];

let seq = 0;
function nextPhone() {
  return `+9171${uniq}${String(seq++).padStart(2, '0')}`.slice(0, 15);
}

// A fresh owner + shop. Returns { ownerId, shopId }.
async function makeShop(tag) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`Chain ${tag}`, `chain_${tag}_${uniq}@test.local`, nextPhone()]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, `Chain Store ${tag}`]
  );
  const shopId = shop.rows[0].id;
  ownerIds.push(ownerId);
  shopIds.push(shopId);
  return { ownerId, shopId };
}

// A peer referral code owned by a shop owner (owner_type='owner', is_mitra=false).
async function peerCodeFor(ownerId) {
  const c = await referral.getOrCreateCodeForUser(ownerId, 'owner');
  codeIds.push(c.id);
  return c;
}

// A non-peer influencer code (no system account; owner_type='influencer').
async function influencerCode(tag) {
  const c = await referral.createUniqueCode({ ownerType: 'influencer', label: `Inf ${tag}` });
  codeIds.push(c.id);
  return c;
}

// Attribute `shopId`/`userId` to `code` (a direct referrals insert, no reward).
async function attribute(code, referredUserId, referredShopId) {
  await pool.query(
    `INSERT INTO referrals (referral_code_id, code, referred_type, referred_user_id, referred_shop_id)
     VALUES ($1,$2,'shop',$3,$4)`,
    [code.id, code.code, referredUserId, referredShopId]
  );
}

// A PAID enrolment with an explicit split snapshot. Returns the enrolment id.
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

// A ← B ← C : A referred B, B referred C. Peer codes for A and B.
let A;
let B;
let C;
let aCode;
let bCode;

const FEE = 10000; // ₹100
const L1 = 30;
const L2 = 15;
const POOL = Math.floor((FEE * (L1 + L2)) / 100); // 4500
const L1_AMT = Math.floor((FEE * L1) / 100);       // 3000
const L2_AMT = Math.floor((FEE * L2) / 100);       // 1500

beforeAll(async () => {
  A = await makeShop('A');
  B = await makeShop('B');
  C = await makeShop('C');
  aCode = await peerCodeFor(A.ownerId);
  bCode = await peerCodeFor(B.ownerId);
  // B referred by A; C referred by B.
  await attribute(aCode, B.ownerId, B.shopId);
  await attribute(bCode, C.ownerId, C.shopId);
});

afterAll(async () => {
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
  // Leave the shared flag / reward rule dormant + at defaults.
  await setSetting('enrolment_fee_enabled', 'false');
  await pool.query(
    "DELETE FROM platform_settings WHERE key IN ('referral_reward_enabled','referral_reward_paise','referral_referee_paise','referral_mitra_paise')"
  );
  await pool.end();
});

async function chainRows(enrolmentId) {
  const r = await pool.query(
    `SELECT beneficiary_code_id, amount_paise, beneficiary_role, level, source_shop_id
       FROM referral_rewards
      WHERE source_enrolment_id = $1
      ORDER BY level ASC`,
    [enrolmentId]
  );
  return r.rows;
}

describe('two-level chain accrual (peer referrers)', () => {
  it("paying C's fee accrues chain_l1 to B and chain_l2 to A; sums = pool cap", async () => {
    const enrol = await paidEnrolment(C.shopId, FEE, L1, L2);
    const res = await referral.accrueEnrolmentChainRewards(C.shopId, enrol);
    expect(res).toEqual({ accrued: true, l1_amount: L1_AMT, l2_amount: L2_AMT, poolCap: POOL });

    const rows = await chainRows(enrol);
    expect(rows).toHaveLength(2);
    const l1 = rows.find((x) => x.level === 1);
    const l2 = rows.find((x) => x.level === 2);
    expect(l1.beneficiary_role).toBe('chain_l1');
    expect(l1.beneficiary_code_id).toBe(bCode.id);
    expect(Number(l1.amount_paise)).toBe(L1_AMT);
    expect(l1.source_shop_id).toBe(C.shopId);
    expect(l2.beneficiary_role).toBe('chain_l2');
    expect(l2.beneficiary_code_id).toBe(aCode.id);
    expect(Number(l2.amount_paise)).toBe(L2_AMT);

    // Zero-burn invariant: SUM(chain rewards) <= floor(fee*(l1+l2)%).
    const sum = rows.reduce((acc, x) => acc + Number(x.amount_paise), 0);
    expect(sum).toBeLessThanOrEqual(POOL);
    expect(sum).toBe(L1_AMT + L2_AMT);
  });

  it("paying B's fee accrues chain_l1 to A and NO L2 (A has no referrer)", async () => {
    const enrol = await paidEnrolment(B.shopId, FEE, L1, L2);
    const res = await referral.accrueEnrolmentChainRewards(B.shopId, enrol);
    expect(res).toEqual({ accrued: true, l1_amount: L1_AMT, l2_amount: 0, poolCap: POOL });

    const rows = await chainRows(enrol);
    expect(rows).toHaveLength(1);
    expect(rows[0].beneficiary_role).toBe('chain_l1');
    expect(rows[0].beneficiary_code_id).toBe(aCode.id);
    expect(Number(rows[0].amount_paise)).toBe(L1_AMT);
  });

  it('is idempotent — a second accrual for the same enrolment inserts nothing new', async () => {
    // A dedicated shop referred by A (one paid enrolment per shop is enforced).
    const D = await makeShop('D');
    await attribute(aCode, D.ownerId, D.shopId);
    const enrol = await paidEnrolment(D.shopId, FEE, L1, L2);
    const first = await referral.accrueEnrolmentChainRewards(D.shopId, enrol);
    expect(first.accrued).toBe(true);
    const countAfterFirst = (await chainRows(enrol)).length;

    const second = await referral.accrueEnrolmentChainRewards(D.shopId, enrol);
    expect(second).toEqual({ accrued: false, reason: 'already_accrued' });
    const countAfterSecond = (await chainRows(enrol)).length;
    expect(countAfterSecond).toBe(countAfterFirst); // no double-accrual
  });
});

describe('non-accruing attributions', () => {
  it('an organic shop (no referrer) accrues nothing and does not error', async () => {
    const O = await makeShop('O');
    const enrol = await paidEnrolment(O.shopId, FEE, L1, L2);
    const res = await referral.accrueEnrolmentChainRewards(O.shopId, enrol);
    expect(res).toEqual({ accrued: false, reason: 'no_referrer' });
    expect(await chainRows(enrol)).toHaveLength(0);
  });

  it('a non-peer (influencer) referrer earns no %-chain reward', async () => {
    const N = await makeShop('N');
    const inf = await influencerCode('N');
    await attribute(inf, N.ownerId, N.shopId);
    const enrol = await paidEnrolment(N.shopId, FEE, L1, L2);
    const res = await referral.accrueEnrolmentChainRewards(N.shopId, enrol);
    expect(res).toEqual({ accrued: false, reason: 'non_peer_referrer' });
    expect(await chainRows(enrol)).toHaveLength(0);
  });

  it('an unpaid enrolment does not accrue', async () => {
    const P = await makeShop('P0');
    await attribute(aCode, P.ownerId, P.shopId);
    const r = await pool.query(
      `INSERT INTO enrolments (shop_id, tier, amount_paise, status, provider, split_l1_pct, split_l2_pct)
       VALUES ($1,'basic',$2,'pending','manual',$3,$4) RETURNING id`,
      [P.shopId, FEE, L1, L2]
    );
    const res = await referral.accrueEnrolmentChainRewards(P.shopId, r.rows[0].id);
    expect(res).toEqual({ accrued: false, reason: 'not_paid' });
  });
});

describe('flat-bounty suppression for fee-paid shops', () => {
  beforeAll(async () => {
    await setSetting('referral_reward_enabled', 'true');
    await setSetting('referral_reward_paise', '5000');
    await setSetting('referral_referee_paise', '2000');
  });

  function flatRows(shopId) {
    return pool.query(
      `SELECT COUNT(*)::int AS n FROM referral_rewards
         WHERE beneficiary_role IN ('referrer','referee','mitra')
           AND referral_id IN (SELECT id FROM referrals WHERE referred_shop_id = $1)`,
      [shopId]
    );
  }

  it('a fee-paid shop (flag on) activates WITHOUT the flat bounty (reason fee_funded)', async () => {
    await setSetting('enrolment_fee_enabled', 'true');
    const F = await makeShop('F');
    await attribute(aCode, F.ownerId, F.shopId);
    await paidEnrolment(F.shopId, FEE, L1, L2); // F has PAID its fee

    const res = await referral.maybeActivateReferral(F.shopId);
    expect(res).toEqual({ activated: true, rewarded: false, reason: 'fee_funded' });

    // No flat referrer/referee rows were inserted for F.
    const n = await flatRows(F.shopId);
    expect(n.rows[0].n).toBe(0);
    // Activation is still real — activated_at stamped.
    const act = await pool.query(
      'SELECT activated_at FROM referrals WHERE referred_shop_id = $1',
      [F.shopId]
    );
    expect(act.rows[0].activated_at).toBeTruthy();
  });

  it('a NON-fee shop (flag on) still accrues the flat bounty exactly as before', async () => {
    await setSetting('enrolment_fee_enabled', 'true');
    const G = await makeShop('G');
    await peerCodeFor(G.ownerId); // referee side gets its own code
    await attribute(aCode, G.ownerId, G.shopId); // referred by A, but G pays NO fee

    const res = await referral.maybeActivateReferral(G.shopId);
    expect(res.activated).toBe(true);
    expect(res.rewarded).toBe(true);

    // The flat referrer + referee rows were inserted.
    const n = await flatRows(G.shopId);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(1);
  });
});
