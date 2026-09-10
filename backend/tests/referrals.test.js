// Integration tests for Referrals / onboarding-source attribution (Phase D).
// Requires a real Postgres (DATABASE_URL) with the migrations applied (incl.
// 0024_referrals). See the task notes for the throwaway-cluster one-liner.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const referral = require('../src/utils/referral');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const consumerToken = (id, phone) => jwt.sign({ sub: id, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Track everything created so afterAll can clean up without touching other data.
const emails = [];
const phones = [];
let superAdmin; // { id, token }
let financeAdmin;
let supportAdmin;

// Numeric-only, unique phone per created principal (the register endpoint
// enforces /^\+?[0-9]{10,15}$/, so tags never appear in the phone).
let phoneSeq = 0;
function nextPhone() {
  const p = `+9170${uniq}${String(phoneSeq++).padStart(2, '0')}`.slice(0, 15);
  phones.push(p);
  return p;
}

async function register(tag, extra = {}) {
  const email = `ref_${tag}_${uniq}@test.local`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({
    name: `Ref ${tag}`, email, phone: nextPhone(), password: 'password123', shopName: `Shop ${tag}`, ...extra,
  });
  return res;
}

async function makeAdmin(role) {
  const email = `ref_admin_${role}_${uniq}@test.local`;
  const phone = nextPhone();
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`Ref Admin ${role}`, email, phone, role]
  );
  return { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

beforeAll(async () => {
  superAdmin = await makeAdmin('super');
  financeAdmin = await makeAdmin('finance');
  supportAdmin = await makeAdmin('support');
});

afterAll(async () => {
  // Remove reward rule keys so we do not leak state into other suites.
  await pool.query("DELETE FROM platform_settings WHERE key IN ('referral_reward_enabled','referral_reward_paise','referral_referee_paise','referral_mitra_paise')");
  // referrals / rewards cascade or SET NULL from codes; delete referrals then codes.
  await pool.query('DELETE FROM referrals WHERE code IN (SELECT code FROM referral_codes WHERE owner_user_id IN (SELECT id FROM users WHERE email = ANY($1)))', [emails]);
  await pool.query('DELETE FROM referral_codes WHERE created_by IN (SELECT id FROM users WHERE email = ANY($1)) OR owner_user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM referral_codes WHERE owner_customer_id IN (SELECT id FROM customer_users WHERE phone = ANY($1))', [phones]);
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.query('DELETE FROM customer_users WHERE phone = ANY($1)', [phones]);
  await pool.query('DELETE FROM customer_otps WHERE phone = ANY($1)', [phones]);
  await pool.end();
});

describe('referral code generation (utils/referral)', () => {
  it('genCode is ambiguity-free and 6–8 chars, and highly unique', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      const c = referral.genCode();
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      seen.add(c);
    }
    // 500 draws from 31^6 (~887M) should essentially never collide.
    expect(seen.size).toBeGreaterThan(495);
  });

  it('getOrCreateCodeForUser is idempotent (same code on repeat)', async () => {
    const res = await register('idem');
    expect(res.status).toBe(201);
    const uid = res.body.user.id;
    const a = await referral.getOrCreateCodeForUser(uid, 'owner');
    const b = await referral.getOrCreateCodeForUser(uid, 'owner');
    expect(a.code).toBe(b.code);
    expect(a.id).toBe(b.id);
  });
});

describe('owner register with a referral code', () => {
  let ownerA;
  let codeA;
  let ownerB;

  it('A gets a code, B registers with ref=A → attribution + both sides visible', async () => {
    const ra = await register('A');
    expect(ra.status).toBe(201);
    ownerA = { token: ra.body.token, user: ra.body.user, shop: ra.body.shop };

    // A fetches their code (created on first call).
    const meA = await withToken(request(app).get('/api/me/referral'), ownerA.token);
    expect(meA.status).toBe(200);
    expect(typeof meA.body.code).toBe('string');
    expect(meA.body.link).toContain(`ref=${meA.body.code}`);
    expect(meA.body.link_path.startsWith('/register')).toBe(true);
    codeA = meA.body.code;

    // B registers carrying A's code + a source channel.
    const rb = await register('B', { ref: codeA, source_channel: 'whatsapp' });
    expect(rb.status).toBe(201);
    ownerB = { token: rb.body.token, user: rb.body.user, shop: rb.body.shop };

    // A referrals row now links the new shop to A.
    const row = await pool.query(
      `SELECT referred_type, referred_user_id, referred_shop_id, source_channel
       FROM referrals WHERE referred_user_id = $1`,
      [ownerB.user.id]
    );
    expect(row.rowCount).toBe(1);
    expect(['shop', 'owner']).toContain(row.rows[0].referred_type);
    expect(row.rows[0].referred_shop_id).toBe(ownerB.shop.id);
    expect(row.rows[0].source_channel).toBe('whatsapp');

    // A sees referred_total 1 and the new shop in referred[].
    const meA2 = await withToken(request(app).get('/api/me/referral'), ownerA.token);
    expect(meA2.body.counts.referred_total).toBe(1);
    expect(meA2.body.referred.some((x) => x.label === ownerB.shop.name)).toBe(true);

    // B's referred_by shows A.
    const meB = await withToken(request(app).get('/api/me/referral'), ownerB.token);
    expect(meB.body.referred_by).toBeTruthy();
    expect(meB.body.referred_by.code).toBe(codeA);
    expect(meB.body.referred_by.label).toBe(ownerA.user.name);
  });

  it('chain endpoint returns upline (B→A) and downline (A→B)', async () => {
    const chainB = await withToken(request(app).get('/api/me/referral/chain'), ownerB.token);
    expect(chainB.status).toBe(200);
    expect(chainB.body.upline.some((u) => u.code === codeA)).toBe(true);

    const chainA = await withToken(request(app).get('/api/me/referral/chain'), ownerA.token);
    expect(chainA.body.downline.some((d) => d.label === ownerB.shop.name)).toBe(true);
  });

  it('self-referral is not captured (A uses their own code)', async () => {
    const before = await pool.query('SELECT COUNT(*)::int AS c FROM referrals WHERE referred_user_id = $1', [ownerA.user.id]);
    const r = await referral.captureReferral({
      code: codeA, referredType: 'shop', referredUserId: ownerA.user.id, referredShopId: ownerA.shop.id,
    });
    expect(r.captured).toBe(false);
    expect(r.reason).toBe('self');
    const after = await pool.query('SELECT COUNT(*)::int AS c FROM referrals WHERE referred_user_id = $1', [ownerA.user.id]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it('duplicate capture for the same principal is a no-op (unique index)', async () => {
    const r = await referral.captureReferral({
      code: codeA, referredType: 'shop', referredUserId: ownerB.user.id, referredShopId: ownerB.shop.id,
    });
    expect(r.captured).toBe(false);
    expect(r.reason).toBe('duplicate');
    const row = await pool.query('SELECT COUNT(*)::int AS c FROM referrals WHERE referred_user_id = $1', [ownerB.user.id]);
    expect(row.rows[0].c).toBe(1);
  });

  it('unknown and blank refs never break a signup and write no row', async () => {
    const bad = await register('bad', { ref: 'ZZZZZZ', source_channel: 'poster' });
    expect(bad.status).toBe(201);
    const blank = await register('blank', { ref: '' });
    expect(blank.status).toBe(201);
    const rows = await pool.query('SELECT COUNT(*)::int AS c FROM referrals WHERE referred_user_id = ANY($1)', [[bad.body.user.id, blank.body.user.id]]);
    expect(rows.rows[0].c).toBe(0);
  });
});

describe('consumer first login with a referral code', () => {
  let codeA;
  let consumerPhone;
  let consumerId;

  beforeAll(async () => {
    const ra = await register('cref');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    codeA = meA.body.code;
    consumerPhone = `+9199${uniq}`.slice(0, 15);
    phones.push(consumerPhone);
  });

  it('a NEW consumer verifying OTP with ref → customer referral captured', async () => {
    const otp = await request(app).post('/api/customer-auth/request-otp').send({ phone: consumerPhone });
    expect(otp.status).toBe(200);
    const v = await request(app).post('/api/customer-auth/verify-otp')
      .send({ phone: consumerPhone, code: otp.body.dev_code, ref: codeA, source_channel: 'field' });
    expect(v.status).toBe(200);
    consumerId = v.body.customer_user.id;

    const row = await pool.query('SELECT referred_type, source_channel FROM referrals WHERE referred_customer_id = $1', [consumerId]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].referred_type).toBe('customer');
    expect(row.rows[0].source_channel).toBe('field');

    // The consumer sees who referred them + gets their own code.
    const meC = await withToken(request(app).get('/api/customer-auth/referral'), consumerToken(consumerId, consumerPhone));
    expect(meC.status).toBe(200);
    expect(meC.body.referred_by.code).toBe(codeA);
    expect(meC.body.link_path.startsWith('/c/shops')).toBe(true);
  });

  it('a returning consumer is not re-attributed', async () => {
    // Second login with a DIFFERENT code must not overwrite the first attribution.
    const rb = await register('cref2');
    const meB = await withToken(request(app).get('/api/me/referral'), rb.body.token);
    const otp = await request(app).post('/api/customer-auth/request-otp').send({ phone: consumerPhone });
    const v = await request(app).post('/api/customer-auth/verify-otp')
      .send({ phone: consumerPhone, code: otp.body.dev_code, ref: meB.body.code, source_channel: 'field' });
    expect(v.status).toBe(200);
    const row = await pool.query('SELECT code FROM referrals WHERE referred_customer_id = $1', [consumerId]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].code).toBe(codeA); // still the original referrer
  });
});

describe('activation-triggered double-sided rewards', () => {
  // Codes/ids reused by the admin overview assertions below.
  let mitraCodeId;

  it('capture no longer accrues a reward at signup', async () => {
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: true, amount_paise: 5000, referee_paise: 3000, mitra_paise: 7000 });

    const ra = await register('actA');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    const codeA = meA.body.code;
    const codeIdA = (await pool.query('SELECT id FROM referral_codes WHERE code = $1', [codeA])).rows[0].id;

    // B registers via A's code — captured, but nothing accrues yet.
    const rb = await register('actB', { ref: codeA });
    expect(rb.status).toBe(201);
    const afterCapture = await pool.query(
      "SELECT COUNT(*)::int AS c FROM referral_rewards WHERE beneficiary_code_id = $1 AND status = 'accrued'",
      [codeIdA]
    );
    expect(afterCapture.rows[0].c).toBe(0);
    // And B's referral is not yet activated.
    const notYet = await pool.query('SELECT activated_at FROM referrals WHERE referred_shop_id = $1', [rb.body.shop.id]);
    expect(notYet.rows[0].activated_at).toBeNull();
  });

  it('first collection activates once and accrues referee + referrer; a second does not', async () => {
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: true, amount_paise: 5000, referee_paise: 3000, mitra_paise: 7000 });

    const ra = await register('actRA');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    const codeA = meA.body.code;
    const codeIdA = (await pool.query('SELECT id FROM referral_codes WHERE code = $1', [codeA])).rows[0].id;

    const rb = await register('actRB', { ref: codeA });
    const shopB = rb.body.shop.id;
    const ownerB = rb.body.user.id;

    // First collection → activation.
    const first = await referral.maybeActivateReferral(shopB);
    expect(first.activated).toBe(true);
    expect(first.rewarded).toBe(true);

    const row = await pool.query('SELECT activated_at FROM referrals WHERE referred_shop_id = $1', [shopB]);
    expect(row.rows[0].activated_at).not.toBeNull();

    // Exactly one referrer (5000) reward to A, and one referee (3000) to B's own
    // code. Batch R3 settles rewards into the wallet in real time, so the row is
    // now 'settled' rather than 'accrued' (either counts as earned here).
    const refReward = await pool.query(
      "SELECT amount_paise FROM referral_rewards WHERE beneficiary_code_id = $1 AND beneficiary_role = 'referrer' AND status IN ('accrued','settled')",
      [codeIdA]
    );
    expect(refReward.rowCount).toBe(1);
    expect(Number(refReward.rows[0].amount_paise)).toBe(5000);

    const codeIdB = (await pool.query('SELECT id FROM referral_codes WHERE owner_user_id = $1', [ownerB])).rows[0].id;
    const refereeReward = await pool.query(
      "SELECT amount_paise FROM referral_rewards WHERE beneficiary_code_id = $1 AND beneficiary_role = 'referee' AND status IN ('accrued','settled')",
      [codeIdB]
    );
    expect(refereeReward.rowCount).toBe(1);
    expect(Number(refereeReward.rows[0].amount_paise)).toBe(3000);

    // Total two reward rows for this referral.
    const total = await pool.query(
      'SELECT COUNT(*)::int AS c FROM referral_rewards WHERE referral_id = (SELECT id FROM referrals WHERE referred_shop_id = $1)',
      [shopB]
    );
    expect(total.rows[0].c).toBe(2);

    // Idempotent: a second collection accrues nothing more.
    const second = await referral.maybeActivateReferral(shopB);
    expect(second.activated).toBe(false);
    const totalAgain = await pool.query(
      'SELECT COUNT(*)::int AS c FROM referral_rewards WHERE referral_id = (SELECT id FROM referrals WHERE referred_shop_id = $1)',
      [shopB]
    );
    expect(totalAgain.rows[0].c).toBe(2);

    // B's participant payload reflects its own accrued balance + no activated downline yet.
    const meB = await withToken(request(app).get('/api/me/referral'), rb.body.token);
    expect(Number(meB.body.reward.accrued_paise)).toBe(3000);
    expect(meB.body.counts.activated_total).toBe(0);

    // A's payload shows one activated referral.
    const meA2 = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    expect(meA2.body.counts.activated_total).toBe(1);
    expect(Number(meA2.body.reward.accrued_paise)).toBe(5000);
  });

  it('a non-referred shop activates nothing', async () => {
    const rx = await register('actX'); // no ref
    const res = await referral.maybeActivateReferral(rx.body.shop.id);
    expect(res.activated).toBe(false);
    const rewards = await pool.query(
      `SELECT COUNT(*)::int AS c FROM referral_rewards rr
       JOIN referral_codes rc ON rc.id = rr.beneficiary_code_id
       WHERE rc.owner_user_id = $1`,
      [rx.body.user.id]
    );
    expect(rewards.rows[0].c).toBe(0);
  });

  it('rule disabled → activation stamps but accrues nothing', async () => {
    const ra = await register('actDisA');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    const rb = await register('actDisB', { ref: meA.body.code });

    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: false });

    const res = await referral.maybeActivateReferral(rb.body.shop.id);
    expect(res.activated).toBe(true);
    expect(res.rewarded).toBe(false);
    const stamped = await pool.query('SELECT activated_at FROM referrals WHERE referred_shop_id = $1', [rb.body.shop.id]);
    expect(stamped.rows[0].activated_at).not.toBeNull();
    const rewards = await pool.query(
      'SELECT COUNT(*)::int AS c FROM referral_rewards WHERE referral_id = (SELECT id FROM referrals WHERE referred_shop_id = $1)',
      [rb.body.shop.id]
    );
    expect(rewards.rows[0].c).toBe(0);
  });

  it('first collection via the real transaction endpoint activates', async () => {
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: true, amount_paise: 5000, referee_paise: 3000, mitra_paise: 7000 });

    const ra = await register('txnA');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    const rb = await register('txnB', { ref: meA.body.code });

    // Create a customer at B's shop, then record a cash collection via the API.
    const cust = await withToken(request(app).post('/api/customers'), rb.body.token)
      .send({ name: 'Ledger Cust', phone: nextPhone() });
    expect([200, 201]).toContain(cust.status);
    const customerId = cust.body.customer.id;

    const tx = await withToken(request(app).post('/api/transactions'), rb.body.token)
      .send({ customer_id: customerId, type: 'cash', amount: 1000 });
    expect(tx.status).toBe(201);

    const stamped = await pool.query('SELECT activated_at FROM referrals WHERE referred_shop_id = $1', [rb.body.shop.id]);
    expect(stamped.rows[0].activated_at).not.toBeNull();
  });

  it('a Mitra code accrues mitra + referee (not referrer)', async () => {
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: true, amount_paise: 5000, referee_paise: 3000, mitra_paise: 7000 });

    // A field agent's code, flagged as a Khata Mitra.
    const rm = await register('mitraM');
    const meM = await withToken(request(app).get('/api/me/referral'), rm.body.token);
    const codeM = meM.body.code;
    mitraCodeId = (await pool.query('SELECT id FROM referral_codes WHERE code = $1', [codeM])).rows[0].id;

    const flag = await withToken(request(app).patch(`/api/admin/referral-codes/${mitraCodeId}`), superAdmin.token)
      .send({ is_mitra: true });
    expect(flag.status).toBe(200);
    expect(flag.body.referral_code.is_mitra).toBe(true);

    const rn = await register('mitraN', { ref: codeM, source_channel: 'field' });
    const shopN = rn.body.shop.id;
    const ownerN = rn.body.user.id;

    const res = await referral.maybeActivateReferral(shopN);
    expect(res.activated).toBe(true);
    expect(res.rewarded).toBe(true);

    // A 'mitra' bounty (7000) to the Mitra code — and NO 'referrer' row. R3
    // settles the bounty into the wallet in real time, so the row is 'settled'.
    const mitraReward = await pool.query(
      "SELECT amount_paise FROM referral_rewards WHERE beneficiary_code_id = $1 AND beneficiary_role = 'mitra' AND status IN ('accrued','settled')",
      [mitraCodeId]
    );
    expect(mitraReward.rowCount).toBe(1);
    expect(Number(mitraReward.rows[0].amount_paise)).toBe(7000);
    const referrerReward = await pool.query(
      "SELECT COUNT(*)::int AS c FROM referral_rewards WHERE beneficiary_code_id = $1 AND beneficiary_role = 'referrer'",
      [mitraCodeId]
    );
    expect(referrerReward.rows[0].c).toBe(0);

    // The referee (N) still gets theirs.
    const codeIdN = (await pool.query('SELECT id FROM referral_codes WHERE owner_user_id = $1', [ownerN])).rows[0].id;
    const refereeReward = await pool.query(
      "SELECT amount_paise FROM referral_rewards WHERE beneficiary_code_id = $1 AND beneficiary_role = 'referee' AND status IN ('accrued','settled')",
      [codeIdN]
    );
    expect(refereeReward.rowCount).toBe(1);
    expect(Number(refereeReward.rows[0].amount_paise)).toBe(3000);
  });

  it('overview exposes the funnel and a Mitra rollup', async () => {
    const res = await withToken(request(app).get('/api/admin/referrals/overview'), superAdmin.token);
    expect(res.status).toBe(200);
    expect(res.body.funnel).toBeTruthy();
    expect(typeof res.body.funnel.captured).toBe('number');
    expect(typeof res.body.funnel.activated).toBe('number');
    expect(res.body.funnel.captured).toBeGreaterThanOrEqual(res.body.funnel.activated);
    expect(res.body.funnel.activated).toBeGreaterThan(0);

    expect(Array.isArray(res.body.mitra)).toBe(true);
    const codeM = (await pool.query('SELECT code FROM referral_codes WHERE id = $1', [mitraCodeId])).rows[0].code;
    const row = res.body.mitra.find((m) => m.code === codeM);
    expect(row).toBeTruthy();
    expect(row.onboarded).toBeGreaterThanOrEqual(1);
    expect(row.activated).toBeGreaterThanOrEqual(1);
    expect(Number(row.bounty_accrued_paise)).toBe(7000);

    // reset for other suites
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: false });
  });
});

describe('admin referral analytics + code management', () => {
  it('overview aggregates source mix, signups by type, top referrers, totals', async () => {
    const res = await withToken(request(app).get('/api/admin/referrals/overview'), superAdmin.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.source_channel_mix)).toBe(true);
    expect(res.body.source_channel_mix.some((x) => x.channel === 'whatsapp')).toBe(true);
    expect(Array.isArray(res.body.signups_by_type)).toBe(true);
    expect(Array.isArray(res.body.top_referrers)).toBe(true);
    expect(res.body.totals.total_referrals).toBeGreaterThan(0);
    expect(typeof res.body.reward.accrued_total_paise === 'string' || typeof res.body.reward.accrued_total_paise === 'number').toBe(true);
  });

  it('finance can read overview; support (no revenue:view) is 403', async () => {
    const fin = await withToken(request(app).get('/api/admin/referrals/overview'), financeAdmin.token);
    expect(fin.status).toBe(200);
    const sup = await withToken(request(app).get('/api/admin/referrals/overview'), supportAdmin.token);
    expect(sup.status).toBe(403);
  });

  it('influencer code creation works and appears usable for attribution', async () => {
    const res = await withToken(request(app).post('/api/admin/referral-codes'), superAdmin.token)
      .send({ label: 'DXB Influencer', owner_type: 'influencer' });
    expect(res.status).toBe(201);
    const code = res.body.referral_code.code;
    expect(res.body.referral_code.owner_type).toBe('influencer');
    expect(res.body.referral_code.label).toBe('DXB Influencer');

    // A new owner registering with the influencer code is attributed to it.
    const r = await register('inflref', { ref: code, source_channel: 'poster' });
    expect(r.status).toBe(201);
    const row = await pool.query('SELECT code FROM referrals WHERE referred_user_id = $1', [r.body.user.id]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].code).toBe(code);
  });

  it('support cannot create an influencer code (settings:manage) → 403', async () => {
    const res = await withToken(request(app).post('/api/admin/referral-codes'), supportAdmin.token)
      .send({ label: 'x', owner_type: 'other' });
    expect(res.status).toBe(403);
  });
});
