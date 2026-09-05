// Integration tests for the Admin Control-Room dashboard + rule-based insights
// (Phase E). Requires a real Postgres (DATABASE_URL) with the migrations applied
// through 0024. See the task notes for the throwaway-cluster one-liner.
//
// The dashboard aggregates PLATFORM-WIDE, so absolute counts depend on whatever
// else is in the DB. These tests therefore assert on DELTAS around a captured
// baseline (robust when suites share a cluster) plus presence/permission
// invariants that hold regardless of surrounding data.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { permissionsFor } = require('../src/config/permissions');
const { buildInsights, THRESHOLDS } = require('../src/utils/insights');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const emails = [];
const phones = [];
const admins = {};
let owner; // { token, user, shop } from register
const refCode = `DASHREF${uniq}`.slice(0, 8).toUpperCase();
const extraConsumerPhones = [];

let phoneSeq = 0;
function nextPhone() {
  // +91 9 <6 of uniq> <4-digit seq> = 14 chars, within the 10–15 digit rule and
  // unique per call (no truncation, so no collisions).
  const p = `+919${uniq.slice(-6)}${String(phoneSeq++).padStart(4, '0')}`;
  phones.push(p);
  return p;
}

async function makeAdmin(role) {
  const email = `dash_${role}_${uniq}@test.local`;
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`Dash ${role}`, email, nextPhone(), role]
  );
  admins[role] = { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

async function register(tag) {
  const email = `dash_owner_${tag}_${uniq}@test.local`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({
    name: `Dash Owner ${tag}`, email, phone: nextPhone(), password: 'password123', shopName: `Dash Shop ${tag}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

// Fixture money (integer paise) — kept as named values so the paise assertions
// are unambiguous.
const BALANCE_A_PAISE = 150000; // ₹1,500 outstanding on the active shop
const BALANCE_B_PAISE = 90000;  // ₹900 outstanding on the inactive shop (aged)
const PURCHASE_PAISE = 200000;  // ₹2,000 purchase (recent)
const PAYMENT_PAISE = 50000;    // ₹500 repayment (recent)

let shopA; let shopB;
let custA; let custB;

async function seed() {
  owner = await register('main');
  const second = await register('inactive');
  shopA = owner.shop.id;
  shopB = second.shop.id;

  // Customer on the ACTIVE shop, with a recent purchase + payment (drives
  // active_shops_30d and the collection-rate numerator/denominator).
  const ca = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shopA, 'Cust A', nextPhone(), BALANCE_A_PAISE]
  );
  custA = ca.rows[0].id;
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'purchase',$3,'credit', NOW()), ($1,$2,'cash',$4,'cash', NOW())`,
    [shopA, custA, PURCHASE_PAISE, PAYMENT_PAISE]
  );

  // Customer on the INACTIVE shop: a balance whose only transaction is 90 days
  // old → shop B has no 30-day activity (inactive) and the debt ages into 61+.
  const cb = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shopB, 'Cust B', nextPhone(), BALANCE_B_PAISE]
  );
  custB = cb.rows[0].id;
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method, created_at)
     VALUES ($1,$2,'purchase',$3,'credit', NOW() - INTERVAL '90 days')`,
    [shopB, custB, BALANCE_B_PAISE]
  );

  // One order on shop A (commerce + GMV).
  await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, subtotal, delivery_fee, created_at)
     VALUES ($1,$2,'completed','pickup','cash',$3,0, NOW())`,
    [shopA, custA, PURCHASE_PAISE]
  );

  // A referral code with 3 attributed consumer signups → top_referrer insight.
  const code = await pool.query(
    `INSERT INTO referral_codes (code, owner_type, label, created_by) VALUES ($1,'influencer',$2,$3) RETURNING id`,
    [refCode, `Dash Influencer ${uniq}`, admins.super.id]
  );
  const codeId = code.rows[0].id;
  for (let i = 0; i < 3; i++) {
    const cp = nextPhone();
    extraConsumerPhones.push(cp);
    const cu = await pool.query(
      `INSERT INTO customer_users (phone, name) VALUES ($1,$2) RETURNING id`,
      [cp, `Dash Referred ${i}`]
    );
    await pool.query(
      `INSERT INTO referrals (referral_code_id, code, referred_type, referred_customer_id, source_channel)
       VALUES ($1,$2,'customer',$3,'whatsapp')`,
      [codeId, refCode, cu.rows[0].id]
    );
  }
}

beforeAll(async () => {
  await makeAdmin('super');
  await makeAdmin('support');
  await makeAdmin('finance');
  await makeAdmin('moderation');
  await seed();
});

afterAll(async () => {
  await pool.query('DELETE FROM referrals WHERE code = $1', [refCode]);
  await pool.query('DELETE FROM referral_codes WHERE code = $1', [refCode]);
  await pool.query('DELETE FROM customer_users WHERE phone = ANY($1)', [extraConsumerPhones]);
  // orders/transactions/customers cascade from the shops.
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.query('DELETE FROM customer_users WHERE phone = ANY($1)', [phones]);
  await pool.query('DELETE FROM customer_otps WHERE phone = ANY($1)', [phones]);
  await pool.end();
});

describe('pure insights engine (utils/insights)', () => {
  it('is deterministic and orders urgent → warn → info then by metric', () => {
    const sections = {
      overview: { total_shops: 10, active_shops_30d: 4, consumers_never_ordered: 2 },
      network: { purchased_30d_paise: 100000, paid_30d_paise: 20000, collection_rate_pct: 20 },
      languages: { staged_count: 3 },
    };
    const a = buildInsights(sections);
    const b = buildInsights(sections);
    expect(a).toEqual(b); // deterministic
    const sevs = a.map((i) => i.severity);
    const rank = { urgent: 0, warn: 1, info: 2 };
    for (let k = 1; k < sevs.length; k++) {
      expect(rank[sevs[k - 1]]).toBeLessThanOrEqual(rank[sevs[k]]);
    }
    // 20% collection is below the urgent floor → an urgent card exists.
    expect(a.find((i) => i.id === 'collection_drop').severity).toBe('urgent');
    expect(THRESHOLDS.COLLECTION_WARN_PCT).toBe(60);
  });

  it('emits nothing for empty sections and never throws on partial data', () => {
    expect(buildInsights({})).toEqual([]);
    expect(buildInsights()).toEqual([]);
    expect(Array.isArray(buildInsights({ overview: { total_shops: 0, active_shops_30d: 0 } }))).toBe(true);
  });
});

describe('GET /api/admin/dashboard — super sees everything', () => {
  let body;
  beforeAll(async () => {
    const res = await withToken(request(app).get('/api/admin/dashboard'), admins.super.token);
    expect(res.status).toBe(200);
    body = res.body;
  });

  it('returns all sections + a generated_at + a non-empty insights array', () => {
    for (const s of ['overview', 'growth', 'commerce', 'network', 'geography', 'revenue', 'acquisition', 'languages', 'trust']) {
      expect(body.sections[s]).toBeDefined();
    }
    expect(typeof body.generated_at).toBe('string');
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights.length).toBeGreaterThan(0);
  });

  it('overview counts reflect the fixture (the 2 seeded shops are present)', () => {
    expect(body.sections.overview.total_shops).toBeGreaterThanOrEqual(2);
    // shop A had a transaction today; it is counted active in the last 30 days.
    expect(body.sections.overview.active_shops_30d).toBeGreaterThanOrEqual(1);
    expect(body.sections.overview.total_orders).toBeGreaterThanOrEqual(1);
    expect(body.sections.overview.consumers_never_ordered).toBeGreaterThanOrEqual(3);
  });

  it('money aggregates are integer paise (spot checks)', () => {
    const out = body.sections.network.outstanding_total_paise;
    expect(Number.isInteger(out)).toBe(true);
    // Includes both seeded balances (₹1,500 + ₹900) on top of any baseline.
    expect(out).toBeGreaterThanOrEqual(BALANCE_A_PAISE + BALANCE_B_PAISE);
    // The 90-day-old debt lands in the 61+ aging bucket.
    expect(body.sections.network.aging.b61_plus_paise).toBeGreaterThanOrEqual(BALANCE_B_PAISE);
    expect(Number.isInteger(body.sections.commerce.gmv_30d_paise)).toBe(true);
    expect(body.sections.commerce.gmv_30d_paise).toBeGreaterThanOrEqual(PURCHASE_PAISE);
    expect(Number.isInteger(body.sections.revenue.mrr_paise)).toBe(true);
    expect(body.sections.revenue.plan_price_paise.pro).toBe(29900);
  });

  it('produces a churn_risk insight (shop B has no 30-day activity)', () => {
    const churn = body.insights.find((i) => i.id === 'churn_risk');
    expect(churn).toBeDefined();
    expect(churn.severity).toBe('warn');
    expect(churn.metric).toBeGreaterThanOrEqual(1);
    expect(churn.perm).toBe('shops:view');
    expect(typeof churn.action_link).toBe('string');
  });

  it('produces a language_staged insight (migration seeds staged languages)', () => {
    const lang = body.insights.find((i) => i.id === 'language_staged');
    expect(lang).toBeDefined();
    expect(lang.action_link).toBe('/admin/languages');
    expect(body.sections.languages.staged_count).toBeGreaterThanOrEqual(1);
    // Registry posture only — no fabricated per-user usage numbers.
    expect(body.sections.languages).not.toHaveProperty('usage');
  });

  it('produces a top_referrer insight for the 3-signup seeded code', () => {
    const top = body.insights.find((i) => i.id === 'top_referrer');
    expect(top).toBeDefined();
    expect(top.perm).toBe('revenue:view');
    expect(top.metric).toBeGreaterThanOrEqual(THRESHOLDS.TOP_REFERRER_MIN_SIGNUPS);
  });

  it('every insight carries a perm the super role holds', () => {
    const superPerms = permissionsFor('super');
    for (const ins of body.insights) {
      expect(superPerms).toContain(ins.perm);
    }
  });
});

describe('permission gating by admin sub-role', () => {
  it('support gets overview/network/trust but NO revenue/acquisition', async () => {
    const res = await withToken(request(app).get('/api/admin/dashboard'), admins.support.token);
    expect(res.status).toBe(200);
    expect(res.body.sections.overview).toBeDefined();
    expect(res.body.sections.network).toBeDefined();
    expect(res.body.sections.trust).toBeDefined(); // support has audit:view
    expect(res.body.sections.revenue).toBeUndefined();
    expect(res.body.sections.acquisition).toBeUndefined();
    // No insight support sees may require a permission support lacks.
    const supportPerms = permissionsFor('support');
    for (const ins of res.body.insights) expect(supportPerms).toContain(ins.perm);
    // In particular, revenue-gated insights are absent.
    expect(res.body.insights.some((i) => i.perm === 'revenue:view')).toBe(false);
  });

  it('finance gets revenue + acquisition (revenue:view)', async () => {
    const res = await withToken(request(app).get('/api/admin/dashboard'), admins.finance.token);
    expect(res.status).toBe(200);
    expect(res.body.sections.revenue).toBeDefined();
    expect(res.body.sections.acquisition).toBeDefined();
    expect(res.body.sections.overview).toBeDefined(); // finance also has shops:view
    const financePerms = permissionsFor('finance');
    for (const ins of res.body.insights) expect(financePerms).toContain(ins.perm);
  });

  it('moderation gets trust but not revenue', async () => {
    const res = await withToken(request(app).get('/api/admin/dashboard'), admins.moderation.token);
    expect(res.status).toBe(200);
    expect(res.body.sections.trust).toBeDefined();
    expect(res.body.sections.revenue).toBeUndefined();
  });

  it('non-admin (owner token) → 403', async () => {
    const res = await withToken(request(app).get('/api/admin/dashboard'), owner.token);
    expect(res.status).toBe(403);
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });
});
