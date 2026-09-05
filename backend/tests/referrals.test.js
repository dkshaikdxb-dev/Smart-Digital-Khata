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
  await pool.query("DELETE FROM platform_settings WHERE key IN ('referral_reward_enabled','referral_reward_paise')");
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

describe('reward-rule accrual scaffolding', () => {
  it('disabled → no accrual; enabled → an accrued row to the referrer', async () => {
    // Ensure disabled.
    await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: false, amount_paise: 0 });

    const ra = await register('rwdA');
    const meA = await withToken(request(app).get('/api/me/referral'), ra.body.token);
    const codeA = meA.body.code;
    const codeIdA = (await pool.query('SELECT id FROM referral_codes WHERE code = $1', [codeA])).rows[0].id;

    // Disabled: registering B with A's code accrues nothing.
    const rbOff = await register('rwdBoff', { ref: codeA });
    const off = await pool.query('SELECT COUNT(*)::int AS c FROM referral_rewards WHERE beneficiary_code_id = $1', [codeIdA]);
    expect(off.rows[0].c).toBe(0);
    expect(rbOff.status).toBe(201);

    // Enable with 5000 paise.
    const patch = await withToken(request(app).patch('/api/admin/referrals/reward-rule'), superAdmin.token)
      .send({ enabled: true, amount_paise: 5000 });
    expect(patch.status).toBe(200);
    expect(patch.body.enabled).toBe(true);
    expect(patch.body.amount_paise).toBe(5000);

    // Enabled: registering C with A's code writes one accrued reward of 5000.
    const rc = await register('rwdC', { ref: codeA });
    expect(rc.status).toBe(201);
    const on = await pool.query(
      `SELECT amount_paise, status FROM referral_rewards WHERE beneficiary_code_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [codeIdA]
    );
    expect(on.rowCount).toBe(1);
    expect(Number(on.rows[0].amount_paise)).toBe(5000);
    expect(on.rows[0].status).toBe('accrued');

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
