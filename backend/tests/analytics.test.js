// Integration tests for Analytics Phase 1:
//   * POST /api/events            — anonymous, rate-limited event ingest
//   * POST /api/auth/register     — optional signup attribution → shop.signup_*
//   * GET  /api/admin/analytics/funnel — admin acquisition funnel
//
// Requires a real Postgres (DATABASE_URL) with migrations applied through 0035.
// The funnel aggregates PLATFORM-WIDE, so absolute stage counts depend on
// whatever else is in the shared cluster. We therefore assert stage totals with
// `>=` around the seeded contribution, and assert EXACT numbers on bySource rows
// keyed by unique-per-run utm_source tokens that no other suite emits.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Unique attribution sources for this run so bySource assertions are exact.
const SRC_A = `srcA_${uniq}`;
const SRC_B = `srcB_${uniq}`;
const SRC_C = `srcC_${uniq}`;
// Unique anonymous session ids for the top-of-funnel event counts.
const SESS = (n) => `sess_${uniq}_${n}`;

const emails = [];
const phones = [];
const sessionIds = [];
let superAdmin;
let ownerToken; // a non-admin token for the 403 case
const shopIds = [];

let phoneSeq = 0;
function nextPhone() {
  const p = `+919${uniq.slice(-6)}${String(phoneSeq++).padStart(4, '0')}`;
  phones.push(p);
  return p;
}

async function makeAdmin() {
  const email = `an_super_${uniq}@test.local`;
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Analytics Super', email, nextPhone()]
  );
  superAdmin = { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

// Register a shop with optional attribution; returns { token, shop }.
async function register(tag, attribution) {
  const email = `an_owner_${tag}_${uniq}@test.local`;
  emails.push(email);
  const body = {
    name: `An Owner ${tag}`,
    email,
    phone: nextPhone(),
    password: 'password123',
    shopName: `An Shop ${tag}`,
  };
  if (attribution) body.attribution = attribution;
  const res = await request(app).post('/api/auth/register').send(body);
  expect(res.status).toBe(201);
  shopIds.push(res.body.shop.id);
  return { token: res.body.token, shop: res.body.shop };
}

async function addCustomer(shopId) {
  const r = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,0) RETURNING id`,
    [shopId, 'Cust', nextPhone()]
  );
  return r.rows[0].id;
}

async function addTx(shopId, customerId, type, amount) {
  await pool.query(
    `INSERT INTO transactions (shop_id, customer_id, type, amount, method)
     VALUES ($1,$2,$3,$4,$5)`,
    [shopId, customerId, type, amount, type === 'purchase' ? 'credit' : type]
  );
}

async function addPaidLink(shopId, customerId, amount) {
  await pool.query(
    `INSERT INTO payment_orders (id, shop_id, customer_id, amount, status)
     VALUES ($1,$2,$3,$4,'paid')`,
    [`plink_${uniq}_${shopId.slice(0, 8)}`, shopId, customerId, amount]
  );
}

let shopA1; let shopA2; let shopB; let shopC;

beforeAll(async () => {
  await makeAdmin();

  // SRC_A shop 1: purchase (activated) + cash repayment (collecting).
  ({ shop: shopA1 } = await register('a1', { utm_source: SRC_A, utm_medium: 'cpc', session_id: SESS('a1') }));
  const cA1 = await addCustomer(shopA1.id);
  await addTx(shopA1.id, cA1, 'purchase', 200000);
  await addTx(shopA1.id, cA1, 'cash', 50000);

  // SRC_A shop 2: purchase only (activated, NOT collecting).
  ({ shop: shopA2 } = await register('a2', { utm_source: SRC_A }));
  const cA2 = await addCustomer(shopA2.id);
  await addTx(shopA2.id, cA2, 'purchase', 100000);

  // SRC_B shop: no transactions (signup only — not activated, not collecting).
  ({ shop: shopB } = await register('b', { utm_source: SRC_B }));

  // SRC_C shop: purchase (activated) + a PAID payment link (collecting via the
  // payment_orders 'paid' predicate, with NO cash/upi transaction).
  ({ shop: shopC } = await register('c', { utm_source: SRC_C }));
  const cC = await addCustomer(shopC.id);
  await addTx(shopC.id, cC, 'purchase', 300000);
  await addPaidLink(shopC.id, cC, 300000);

  // A plain non-admin owner (no attribution) for the 403 auth check.
  const plain = await register('plain');
  ownerToken = plain.token;

  // Seed anonymous top-of-funnel events via the public ingest endpoint:
  // 3 distinct landing_view sessions, 2 distinct register_start sessions.
  for (let i = 0; i < 3; i++) {
    const sid = SESS(`lv${i}`);
    sessionIds.push(sid);
    await request(app).post('/api/events').send({
      session_id: sid,
      events: [{ name: 'landing_view', utm: { source: SRC_A }, path: '/' }],
    });
  }
  for (let i = 0; i < 2; i++) {
    const sid = SESS(`rs${i}`);
    sessionIds.push(sid);
    await request(app).post('/api/events').send({
      session_id: sid,
      events: [{ name: 'register_start', path: '/register' }],
    });
  }
}, 30000);

afterAll(async () => {
  await pool.query('DELETE FROM analytics_events WHERE session_id = ANY($1)', [sessionIds]);
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

describe('POST /api/events (public ingest)', () => {
  it('inserts allowlisted events and returns 202 { accepted }', async () => {
    const sid = SESS('ing1');
    sessionIds.push(sid);
    const res = await request(app).post('/api/events').send({
      session_id: sid,
      events: [
        { name: 'landing_view', path: '/' },
        { name: 'get_app_click', props: { app: 'owner' } },
        { name: 'register_complete' },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(3);
    const r = await pool.query('SELECT COUNT(*)::int AS c FROM analytics_events WHERE session_id = $1', [sid]);
    expect(r.rows[0].c).toBe(3);
  });

  it('silently drops unknown event names (does not 400 the batch)', async () => {
    const sid = SESS('ing2');
    sessionIds.push(sid);
    const res = await request(app).post('/api/events').send({
      session_id: sid,
      events: [
        { name: 'landing_view' },
        { name: 'evil_hack' },
        { name: 'get_app_click' },
        { name: '' },
      ],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2); // only the two allowlisted survive
  });

  it('clamps an oversized batch to 20 events', async () => {
    const sid = SESS('ing3');
    sessionIds.push(sid);
    const events = [];
    for (let i = 0; i < 25; i++) events.push({ name: 'landing_view' });
    const res = await request(app).post('/api/events').send({ session_id: sid, events });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(20);
  });

  it('truncates long string fields to their caps', async () => {
    const sid = SESS('ing4');
    sessionIds.push(sid);
    const longSource = 'x'.repeat(500);
    const res = await request(app).post('/api/events').send({
      session_id: sid,
      events: [{ name: 'landing_view', utm: { source: longSource } }],
    });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
    const r = await pool.query('SELECT utm_source FROM analytics_events WHERE session_id = $1', [sid]);
    expect(r.rows[0].utm_source.length).toBe(120);
  });

  it('never 500s on malformed bodies — always 202/handled', async () => {
    const bodies = [
      {},
      { events: 'not-an-array' },
      { session_id: 123, events: [null, 42, { name: 123 }, {}] },
      { events: [] },
    ];
    for (const b of bodies) {
      const res = await request(app).post('/api/events').send(b);
      expect(res.status).toBe(202);
      expect(typeof res.body.accepted).toBe('number');
      expect(res.body.accepted).toBe(0);
    }
  });
});

describe('POST /api/auth/register (signup attribution)', () => {
  it('persists attribution onto the new shop signup_* columns', async () => {
    const sid = SESS('reg1');
    const { shop } = await register('attr', {
      session_id: sid,
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'diwali',
      referrer_host: 'partner.example.com',
    });
    const r = await pool.query(
      `SELECT signup_utm_source, signup_utm_medium, signup_utm_campaign,
              signup_referrer_host, signup_session_id
         FROM shops WHERE id = $1`,
      [shop.id]
    );
    expect(r.rows[0]).toEqual({
      signup_utm_source: 'newsletter',
      signup_utm_medium: 'email',
      signup_utm_campaign: 'diwali',
      signup_referrer_host: 'partner.example.com',
      signup_session_id: sid,
    });
  });

  it('still succeeds with attribution omitted (signup_* stay NULL)', async () => {
    const { shop } = await register('noattr');
    const r = await pool.query(
      'SELECT signup_utm_source, signup_session_id FROM shops WHERE id = $1',
      [shop.id]
    );
    expect(r.rows[0].signup_utm_source).toBeNull();
    expect(r.rows[0].signup_session_id).toBeNull();
  });
});

describe('GET /api/admin/analytics/funnel', () => {
  it('requires a token (401) and rejects a non-admin (403)', async () => {
    const anon = await request(app).get('/api/admin/analytics/funnel');
    expect(anon.status).toBe(401);
    const owner = await withToken(request(app).get('/api/admin/analytics/funnel'), ownerToken);
    expect(owner.status).toBe(403);
  });

  it('returns the exact stage shape and window', async () => {
    const res = await withToken(request(app).get('/api/admin/analytics/funnel?days=30'), superAdmin.token);
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(typeof res.body.window.from).toBe('string');
    expect(typeof res.body.window.to).toBe('string');
    const keys = res.body.stages.map((s) => s.key);
    expect(keys).toEqual(['landing_view', 'register_start', 'signup', 'activated', 'collecting']);
    for (const s of res.body.stages) {
      expect(typeof s.label).toBe('string');
      expect(Number.isInteger(s.count)).toBe(true);
    }
  });

  it('clamps days to 1..365', async () => {
    const hi = await withToken(request(app).get('/api/admin/analytics/funnel?days=9999'), superAdmin.token);
    expect(hi.body.days).toBe(365);
    const lo = await withToken(request(app).get('/api/admin/analytics/funnel?days=0'), superAdmin.token);
    expect(lo.body.days).toBe(1);
    const def = await withToken(request(app).get('/api/admin/analytics/funnel'), superAdmin.token);
    expect(def.body.days).toBe(30);
  });

  it('stage counts reflect the seeded cohort (>= contribution)', async () => {
    const res = await withToken(request(app).get('/api/admin/analytics/funnel?days=30'), superAdmin.token);
    const stage = (k) => res.body.stages.find((s) => s.key === k).count;
    // 4 seeded in-window shops carrying an SRC_* source + the plain one = 5 signups.
    expect(stage('signup')).toBeGreaterThanOrEqual(5);
    // A1, A2, C are activated (>=1 transaction).
    expect(stage('activated')).toBeGreaterThanOrEqual(3);
    // A1 (cash) + C (paid link) collecting.
    expect(stage('collecting')).toBeGreaterThanOrEqual(2);
    // 3 distinct landing_view sessions, 2 distinct register_start sessions.
    expect(stage('landing_view')).toBeGreaterThanOrEqual(3);
    expect(stage('register_start')).toBeGreaterThanOrEqual(2);
  });

  it('bySource has exact per-source signup/activated/collecting counts', async () => {
    const res = await withToken(request(app).get('/api/admin/analytics/funnel?days=30'), superAdmin.token);
    const find = (src) => res.body.bySource.find((r) => r.source === src);

    // SRC_A: 2 signups, both activated, 1 collecting (cash repayment on A1).
    expect(find(SRC_A)).toEqual({ source: SRC_A, signups: 2, activated: 2, collecting: 1 });
    // SRC_B: 1 signup, not activated, not collecting.
    expect(find(SRC_B)).toEqual({ source: SRC_B, signups: 1, activated: 0, collecting: 0 });
    // SRC_C: 1 signup, activated, collecting via a PAID payment link (no cash/upi tx).
    expect(find(SRC_C)).toEqual({ source: SRC_C, signups: 1, activated: 1, collecting: 1 });

    // bySource is ordered by signups desc.
    const signups = res.body.bySource.map((r) => r.signups);
    for (let i = 1; i < signups.length; i++) expect(signups[i - 1]).toBeGreaterThanOrEqual(signups[i]);
  });
});
