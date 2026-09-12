// SHOP AVAILABILITY — open/closed toggle, daily hours, festival closures and
// pause chips, enforced at ORDER TIME (batch A).
//
// The whole point of this batch is that ONE definition (src/utils/shopOpen.js)
// answers "is this shop taking orders right now?" for every surface. So this
// file covers, in order:
//
//   1. the rule itself — the full truth table, the precedence, the overnight
//      window either side of midnight, and the platform kill-switch;
//   2. that the SQL predicate used by `?open_now=1` AGREES with the JS rule
//      (the only place the rule is written twice, so it is pinned here);
//   3. the HARD gate — createOrder refuses a closed shop with 409 `shop_closed`
//      in ALL THREE payment modes and leaves NO order, NO khata transaction and
//      NO payment_orders row behind;
//   4. the API shape — discovery.list annotates every row and `?open_now=1`
//      filters, getShop carries the same object;
//   5. the owner endpoints — pause clamp (0 clears / over-max clamps / 'today'
//      lands before tomorrow's midnight), hours must be set in PAIRS, closures
//      upsert + shop-scoped delete + a past date refused;
//   6. the admin flags save with NO typed I CONFIRM (they are policy, not
//      integration credentials).
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0066).
// Razorpay and WhatsApp are mocked, so nothing here touches the network.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockCreateOrderForShop = jest.fn(async (_shopId, { receipt }) => ({
  id: `order_${Math.random().toString().slice(2, 10)}`,
  receipt,
}));
const mockCreatePaymentLinkForShop = jest.fn(async () => ({
  id: `plink_${Math.random().toString().slice(2, 10)}`,
  short_url: 'https://rzp.io/i/testlink',
}));
jest.mock('../src/services/razorpay.service', () => ({
  isConfiguredForShop: jest.fn(async () => true),
  createOrderForShop: (...a) => mockCreateOrderForShop(...a),
  createPaymentLinkForShop: (...a) => mockCreatePaymentLinkForShop(...a),
}));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: jest.fn(async () => ({ ok: true })),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => false),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const shopOpen = require('../src/utils/shopOpen');

const {
  availabilityWith,
  availability,
  getShopHoursConfig,
  resolvePauseUntil,
  openPredicateSql,
  closuresJoinSql,
  todayKey,
  shopTimezone,
  endOfToday,
} = shopOpen;

const uniq = Date.now().toString().slice(-9);
// A token unique to this run, used as a shop-name prefix so the public
// directory search returns ONLY this file's shops.
const TAG = `ZHRS${uniq}`;
const CUST_PHONE = toE164(`76${uniq}`);

const ON = { enabled: true, pause_max_minutes: 1440 };
const OFF = { enabled: false, pause_max_minutes: 1440 };

function customerToken(phone) {
  return jwt.sign({ sub: 'hours-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shopId) {
  return jwt.sign({ sub: 'hours-owner', role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function adminToken(id) {
  return jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

const ownerIds = [];
const shopIds = [];

async function makeShop(name, cols = {}) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, `hrs_${Math.random().toString().slice(2, 12)}_${uniq}@test.local`,
      `+9188${Math.random().toString().slice(2, 11)}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query('INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id', [ownerId, name]);
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  const keys = Object.keys(cols);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE shops SET ${sets} WHERE id = $1`, [shopId, ...keys.map((k) => cols[k])]);
  }
  ownerIds.push(ownerId);
  shopIds.push(shopId);
  return { ownerId, shopId };
}

async function addProduct(shopId, name, price) {
  const r = await pool.query(
    'INSERT INTO products (shop_id, name, price, is_active) VALUES ($1,$2,$3,true) RETURNING id',
    [shopId, name, price]
  );
  return r.rows[0].id;
}

// Counts of everything an order can create for one shop, so "nothing was
// created" is an assertion about the DB, not about the response body.
async function footprint(shopId) {
  const o = await pool.query('SELECT COUNT(*)::int AS n FROM orders WHERE shop_id = $1', [shopId]);
  const t = await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE shop_id = $1', [shopId]);
  const p = await pool.query('SELECT COUNT(*)::int AS n FROM payment_orders WHERE shop_id = $1', [shopId]);
  return { orders: o.rows[0].n, transactions: t.rows[0].n, payment_orders: p.rows[0].n };
}

// A fixed instant: 2026-03-10 12:00:00 in Asia/Kolkata (UTC+5:30).
const NOON_IST = new Date('2026-03-10T06:30:00.000Z');

let closedShopId, closedOwnerId; // is_listed, is_open=false — the order-gate shop
let openShopId; // is_listed, plainly open
let settingsShopId; // owner PATCH/pause/closures target
let pClosed, pOpen;
let superAdmin;

beforeAll(async () => {
  // Every shop in this file is evaluated in the shop timezone; pin it so the
  // assertions read the same clock the helper does.
  process.env.TZ = process.env.TZ || 'Asia/Kolkata';

  const closed = await makeShop(`${TAG} Shuttered Kirana`, { is_listed: true, is_open: false, offers_pickup: true });
  closedShopId = closed.shopId;
  closedOwnerId = closed.ownerId;

  const open = await makeShop(`${TAG} Always Open Kirana`, { is_listed: true, is_open: true, offers_pickup: true });
  openShopId = open.shopId;

  const settings = await makeShop(`${TAG} Settings Kirana`, { is_listed: false });
  settingsShopId = settings.shopId;

  pClosed = await addProduct(closedShopId, 'Salt', 3000);
  pOpen = await addProduct(openShopId, 'Sugar', 4000);

  const a = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Hours Super', `hrs_super_${uniq}@test.local`, `+9154${uniq}`]
  );
  superAdmin = { id: a.rows[0].id, token: adminToken(a.rows[0].id) };
});

afterAll(async () => {
  for (const id of shopIds) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of ownerIds) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (superAdmin) await pool.query('DELETE FROM users WHERE id = $1', [superAdmin.id]);
  // Restore the seeded platform defaults so the file is idempotent.
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES
       ('shop_hours_enabled','true',NOW()),
       ('shop_pause_max_minutes','1440',NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  );
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------
describe('availability() — the ONE rule', () => {
  it('an untouched shop is open (nothing changes on deploy)', () => {
    const a = availabilityWith({ is_open: true }, NOON_IST, ON);
    expect(a).toEqual({ open: true, reason: null, reopens_at: null });
  });

  it("the owner's master switch off reports 'closed' with no reopen time", () => {
    const a = availabilityWith({ is_open: false }, NOON_IST, ON);
    expect(a.open).toBe(false);
    expect(a.reason).toBe('closed');
    expect(a.reopens_at).toBeNull();
  });

  it("a pause in the FUTURE reports 'paused' and reopens when it ends", () => {
    const until = new Date(NOON_IST.getTime() + 30 * 60000);
    const a = availabilityWith({ is_open: true, paused_until: until }, NOON_IST, ON);
    expect(a.open).toBe(false);
    expect(a.reason).toBe('paused');
    expect(a.reopens_at).toBe(until.toISOString());
  });

  it('a pause in the PAST is spent — the shop is open again', () => {
    const until = new Date(NOON_IST.getTime() - 60000);
    expect(availabilityWith({ is_open: true, paused_until: until }, NOON_IST, ON).open).toBe(true);
  });

  it("a closure for TODAY reports 'holiday'; one for tomorrow does not", () => {
    const holiday = availabilityWith({ is_open: true, closed_today: true }, NOON_IST, ON);
    expect(holiday.open).toBe(false);
    expect(holiday.reason).toBe('holiday');
    // Best-effort reopen: the start of tomorrow in the shop timezone.
    expect(new Date(holiday.reopens_at).getTime()).toBe(endOfToday(NOON_IST).getTime());

    // A closure that is NOT today never reaches the row (closed_today is the
    // LEFT JOIN on today's date), so the shop is simply open.
    expect(availabilityWith({ is_open: true, closed_today: false }, NOON_IST, ON).open).toBe(true);
  });

  it('inside a normal daily window is open, outside reports hours + the next opening', () => {
    const inside = availabilityWith({ is_open: true, open_time: '09:00:00', close_time: '18:00:00' }, NOON_IST, ON);
    expect(inside.open).toBe(true);

    // 12:00 IST, window 13:00–18:00 -> not open yet, reopens TODAY at 13:00 IST.
    const before = availabilityWith({ is_open: true, open_time: '13:00:00', close_time: '18:00:00' }, NOON_IST, ON);
    expect(before.open).toBe(false);
    expect(before.reason).toBe('hours');
    expect(new Date(before.reopens_at).toISOString()).toBe('2026-03-10T07:30:00.000Z'); // 13:00 IST

    // 12:00 IST, window 06:00–10:00 -> already shut, reopens TOMORROW at 06:00 IST.
    const after = availabilityWith({ is_open: true, open_time: '06:00:00', close_time: '10:00:00' }, NOON_IST, ON);
    expect(after.open).toBe(false);
    expect(after.reason).toBe('hours');
    expect(new Date(after.reopens_at).toISOString()).toBe('2026-03-11T00:30:00.000Z'); // 06:00 IST next day
  });

  it('an OVERNIGHT window (17:00–01:00) works on BOTH sides of midnight', () => {
    const shop = { is_open: true, open_time: '17:00:00', close_time: '01:00:00' };
    // 12:00 IST — between close and open, so shut.
    expect(availabilityWith(shop, NOON_IST, ON).reason).toBe('hours');
    // 18:00 IST — after opening, before midnight: OPEN.
    expect(availabilityWith(shop, new Date('2026-03-10T12:30:00.000Z'), ON).open).toBe(true);
    // 00:30 IST the next day — still inside the wrapped window: OPEN.
    expect(availabilityWith(shop, new Date('2026-03-10T19:00:00.000Z'), ON).open).toBe(true);
    // 01:30 IST — past the close: shut.
    expect(availabilityWith(shop, new Date('2026-03-10T20:00:00.000Z'), ON).reason).toBe('hours');
  });

  it('precedence: closed > paused > holiday > hours', () => {
    const now = NOON_IST;
    const future = new Date(now.getTime() + 30 * 60000);
    // A pause INSIDE business hours still closes the shop.
    expect(availabilityWith(
      { is_open: true, paused_until: future, open_time: '09:00:00', close_time: '18:00:00' }, now, ON
    ).reason).toBe('paused');
    // A pause OUTSIDE business hours reports the pause, not the generic hours.
    expect(availabilityWith(
      { is_open: true, paused_until: future, open_time: '13:00:00', close_time: '18:00:00' }, now, ON
    ).reason).toBe('paused');
    // A pause on a holiday still reads as the pause (the nearer truth).
    expect(availabilityWith(
      { is_open: true, paused_until: future, closed_today: true }, now, ON
    ).reason).toBe('paused');
    // The master switch beats everything.
    expect(availabilityWith(
      { is_open: false, paused_until: future, closed_today: true }, now, ON
    ).reason).toBe('closed');
    // With no pause, a holiday beats the hours.
    expect(availabilityWith(
      { is_open: true, closed_today: true, open_time: '09:00:00', close_time: '18:00:00' }, now, ON
    ).reason).toBe('holiday');
  });

  it('the kill-switch (shop_hours_enabled=false) forces every shop open', () => {
    const shut = { is_open: false, closed_today: true, paused_until: new Date(NOON_IST.getTime() + 3600000),
      open_time: '13:00:00', close_time: '18:00:00' };
    expect(availabilityWith(shut, NOON_IST, OFF)).toEqual({ open: true, reason: null, reopens_at: null });
  });

  it('a one-sided window is ignored (a half-set window can never shut a shop)', () => {
    expect(availabilityWith({ is_open: true, open_time: '13:00:00', close_time: null }, NOON_IST, ON).open).toBe(true);
    expect(availabilityWith({ is_open: true, open_time: null, close_time: '18:00:00' }, NOON_IST, ON).open).toBe(true);
  });

  it('availability() reads the live platform flag (never throws) and honours it', async () => {
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('shop_hours_enabled','false',NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`
    );
    expect(await getShopHoursConfig()).toMatchObject({ enabled: false });
    expect((await availability({ is_open: false }, NOON_IST)).open).toBe(true);

    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('shop_hours_enabled','true',NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
    );
    expect(await getShopHoursConfig()).toMatchObject({ enabled: true });
    expect((await availability({ is_open: false }, NOON_IST)).open).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. SQL predicate <-> JS rule agreement
// ---------------------------------------------------------------------------
describe('openPredicateSql() agrees with availabilityWith()', () => {
  it('gives the same answer as the JS rule for every shape of shop', async () => {
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 60000);
    const past = new Date(now.getTime() - 60 * 60000);
    // A window that certainly contains "now", and one that certainly does not,
    // built from the CURRENT shop-timezone clock so the test never sits on a
    // boundary.
    const nowLocal = await pool.query("SELECT (NOW() AT TIME ZONE $1)::time AS t", [shopTimezone()]);
    const t = String(nowLocal.rows[0].t);
    const hh = Number(t.slice(0, 2));
    const inWin = [`${String((hh + 23) % 24).padStart(2, '0')}:00`, `${String((hh + 2) % 24).padStart(2, '0')}:00`];
    const outWin = [`${String((hh + 3) % 24).padStart(2, '0')}:00`, `${String((hh + 5) % 24).padStart(2, '0')}:00`];

    const cases = [
      { label: 'plain open', cols: {} },
      { label: 'master switch off', cols: { is_open: false } },
      { label: 'paused (future)', cols: { paused_until: soon } },
      { label: 'pause expired', cols: { paused_until: past } },
      { label: 'inside window', cols: { open_time: inWin[0], close_time: inWin[1] } },
      { label: 'outside window', cols: { open_time: outWin[0], close_time: outWin[1] } },
      { label: 'holiday today', cols: {}, closureToday: true },
    ];

    const cfg = { enabled: true, pause_max_minutes: 1440 };
    for (const c of cases) {
      const s = await makeShop(`${TAG} Agree ${c.label}`, c.cols);
      if (c.closureToday) {
        await pool.query('INSERT INTO shop_closures (shop_id, on_date, reason) VALUES ($1,$2::date,$3)', [
          s.shopId, todayKey(new Date()), 'Diwali',
        ]);
      }
      const r = await pool.query(
        `SELECT ${openPredicateSql('s', 'sc', '$2')} AS sql_open,
                s.is_open AS _is_open, s.paused_until AS _paused_until,
                s.open_time AS _open_time, s.close_time AS _close_time,
                (sc.id IS NOT NULL) AS _closed_today, sc.reason AS _closure_reason
           FROM shops s
           ${closuresJoinSql('s', 'sc', '$3')}
          WHERE s.id = $1`,
        [s.shopId, shopTimezone(), todayKey(new Date())]
      );
      const row = r.rows[0];
      const sqlOpen = row.sql_open;
      const jsOpen = availabilityWith(shopOpen.takeAvailabilityColumns(row), new Date(), cfg).open;
      expect(`${c.label}:${jsOpen}`).toBe(`${c.label}:${sqlOpen}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The HARD gate — order time
// ---------------------------------------------------------------------------
describe('POST /my/orders — a closed shop is REFUSED, in every payment mode', () => {
  const modes = ['credit', 'cash', 'prepaid'];

  it.each(modes)('409 shop_closed for payment_mode=%s, and nothing is written', async (mode) => {
    const before = await footprint(closedShopId);
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({
        shop_id: closedShopId,
        items: [{ product_id: pClosed, quantity: 2 }],
        fulfillment_type: 'pickup',
        payment_mode: mode,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('shop_closed');
    expect(res.body.details).toMatchObject({ reason: 'closed' });
    expect(res.body.details).toHaveProperty('reopens_at');

    // The real guarantee: no order, no khata transaction, no payment order.
    expect(await footprint(closedShopId)).toEqual(before);
  });

  it('names the reason and the reopen time for a PAUSED shop', async () => {
    const until = new Date(Date.now() + 45 * 60000);
    await pool.query('UPDATE shops SET is_open = true, paused_until = $1 WHERE id = $2', [until, closedShopId]);
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({
        shop_id: closedShopId,
        items: [{ product_id: pClosed, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'cash',
      });
    expect(res.status).toBe(409);
    expect(res.body.details.reason).toBe('paused');
    expect(new Date(res.body.details.reopens_at).getTime()).toBe(until.getTime());
    // Put the shop back to plainly closed for the remaining gate tests.
    await pool.query('UPDATE shops SET is_open = false, paused_until = NULL WHERE id = $1', [closedShopId]);
  });

  it('refuses an order on a FESTIVAL CLOSURE day', async () => {
    await pool.query('UPDATE shops SET is_open = true WHERE id = $1', [closedShopId]);
    await pool.query(
      `INSERT INTO shop_closures (shop_id, on_date, reason) VALUES ($1,$2::date,'Diwali')
       ON CONFLICT (shop_id, on_date) DO UPDATE SET reason = EXCLUDED.reason`,
      [closedShopId, todayKey(new Date())]
    );
    const before = await footprint(closedShopId);
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({
        shop_id: closedShopId,
        items: [{ product_id: pClosed, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'credit',
      });
    expect(res.status).toBe(409);
    expect(res.body.details.reason).toBe('holiday');
    expect(await footprint(closedShopId)).toEqual(before);

    await pool.query('DELETE FROM shop_closures WHERE shop_id = $1', [closedShopId]);
    await pool.query('UPDATE shops SET is_open = false WHERE id = $1', [closedShopId]);
  });

  it.each(['credit', 'cash', 'prepaid'])('an OPEN shop still succeeds unchanged (%s)', async (mode) => {
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({
        shop_id: openShopId,
        items: [{ product_id: pOpen, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: mode,
      });
    expect(res.status).toBe(201);
    expect(res.body.order.id).toBeDefined();
    expect(Number(res.body.order.subtotal)).toBe(4000);
  });

  it('the platform kill-switch lets an order through a closed shop', async () => {
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('shop_hours_enabled','false',NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()`
    );
    const res = await request(app)
      .post('/api/my/orders')
      .set('Authorization', `Bearer ${customerToken(CUST_PHONE)}`)
      .send({
        shop_id: closedShopId,
        items: [{ product_id: pClosed, quantity: 1 }],
        fulfillment_type: 'pickup',
        payment_mode: 'cash',
      });
    expect(res.status).toBe(201);
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('shop_hours_enabled','true',NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. The API shape
// ---------------------------------------------------------------------------
describe('public discovery carries availability', () => {
  it('annotates EVERY row and sorts closed shops after open ones without hiding them', async () => {
    const res = await request(app).get(`/api/public/shops?search=${TAG}&limit=50`);
    expect(res.status).toBe(200);
    const rows = res.body.shops;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const s of rows) {
      expect(s.availability).toEqual({
        open: expect.any(Boolean),
        reason: s.availability.open ? null : expect.any(String),
        reopens_at: s.availability.reopens_at === null ? null : expect.any(String),
      });
    }
    const ids = rows.map((s) => s.id);
    // The closed shop is STILL LISTED (a shopper must be able to find it)…
    expect(ids).toContain(closedShopId);
    // …and every open shop comes before every closed one.
    const firstClosed = rows.findIndex((s) => !s.availability.open);
    const lastOpen = rows.map((s) => s.availability.open).lastIndexOf(true);
    if (firstClosed !== -1) expect(lastOpen).toBeLessThan(firstClosed);
    expect(rows.find((s) => s.id === closedShopId).availability).toMatchObject({ open: false, reason: 'closed' });
  });

  it('?open_now=1 filters to shops taking orders right now', async () => {
    const res = await request(app).get(`/api/public/shops?search=${TAG}&open_now=1&limit=50`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(openShopId);
    expect(ids).not.toContain(closedShopId);
    expect(res.body.shops.every((s) => s.availability.open)).toBe(true);
  });

  it('getShop carries the SAME availability object', async () => {
    const openRes = await request(app).get(`/api/public/shops/${openShopId}`);
    expect(openRes.status).toBe(200);
    expect(openRes.body.shop.availability).toEqual({ open: true, reason: null, reopens_at: null });

    const closedRes = await request(app).get(`/api/public/shops/${closedShopId}`);
    expect(closedRes.status).toBe(200);
    expect(closedRes.body.shop.availability).toMatchObject({ open: false, reason: 'closed' });
    // Internal helper columns never leak into the storefront payload.
    for (const k of ['_is_open', '_paused_until', '_open_time', '_close_time', '_closed_today', '_closure_reason']) {
      expect(closedRes.body.shop).not.toHaveProperty(k);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Owner endpoints
// ---------------------------------------------------------------------------
describe('owner availability endpoints', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${ownerToken(settingsShopId)}`);

  it('GET /shops/me returns the raw columns, the derived availability and the closures list', async () => {
    const res = await auth(request(app).get('/api/shops/me'));
    expect(res.status).toBe(200);
    const s = res.body.shop;
    expect(s).toHaveProperty('is_open', true);
    expect(s).toHaveProperty('paused_until', null);
    expect(s).toHaveProperty('open_time', null);
    expect(s).toHaveProperty('close_time', null);
    expect(s.availability).toEqual({ open: true, reason: null, reopens_at: null });
    expect(Array.isArray(res.body.closures)).toBe(true);
  });

  it('PATCH /shops/me flips the master switch and echoes the fresh availability', async () => {
    const off = await auth(request(app).patch('/api/shops/me')).send({ is_open: false });
    expect(off.status).toBe(200);
    expect(off.body.shop.is_open).toBe(false);
    expect(off.body.shop.availability).toMatchObject({ open: false, reason: 'closed' });

    const on = await auth(request(app).patch('/api/shops/me')).send({ is_open: true });
    expect(on.status).toBe(200);
    expect(on.body.shop.availability.open).toBe(true);
  });

  it('PATCH /shops/me requires hours in PAIRS (422 hours_incomplete on a one-sided window)', async () => {
    const oneSided = await auth(request(app).patch('/api/shops/me')).send({ open_time: '09:00' });
    expect(oneSided.status).toBe(422);
    expect(oneSided.body.error).toBe('hours_incomplete');

    const otherSide = await auth(request(app).patch('/api/shops/me')).send({ close_time: '21:00' });
    expect(otherSide.status).toBe(422);

    const halfNull = await auth(request(app).patch('/api/shops/me')).send({ open_time: '09:00', close_time: null });
    expect(halfNull.status).toBe(422);

    const both = await auth(request(app).patch('/api/shops/me')).send({ open_time: '09:00', close_time: '21:00' });
    expect(both.status).toBe(200);
    expect(String(both.body.shop.open_time)).toMatch(/^09:00/);
    expect(String(both.body.shop.close_time)).toMatch(/^21:00/);

    const cleared = await auth(request(app).patch('/api/shops/me')).send({ open_time: null, close_time: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.shop.open_time).toBeNull();
    expect(cleared.body.shop.close_time).toBeNull();
  });

  it('POST /shops/me/pause — 0 clears, over-max clamps, and "today" lands before tomorrow midnight', async () => {
    const cfg = await getShopHoursConfig();

    const paused = await auth(request(app).post('/api/shops/me/pause')).send({ minutes: 30 });
    expect(paused.status).toBe(200);
    const until = new Date(paused.body.paused_until).getTime();
    expect(until).toBeGreaterThan(Date.now() + 25 * 60000);
    expect(until).toBeLessThan(Date.now() + 35 * 60000);
    expect(paused.body.availability).toMatchObject({ open: false, reason: 'paused' });

    const over = await auth(request(app).post('/api/shops/me/pause')).send({ minutes: 43200 });
    expect(over.status).toBe(200);
    const capped = new Date(over.body.paused_until).getTime();
    expect(capped).toBeLessThanOrEqual(Date.now() + cfg.pause_max_minutes * 60000 + 5000);

    const rest = await auth(request(app).post('/api/shops/me/pause')).send({ minutes: 'today' });
    expect(rest.status).toBe(200);
    const restUntil = new Date(rest.body.paused_until).getTime();
    expect(restUntil).toBeGreaterThan(Date.now());
    // Strictly before TOMORROW's midnight in the shop timezone.
    const tomorrowMidnight = endOfToday(new Date(Date.now() + 24 * 3600 * 1000)).getTime();
    expect(restUntil).toBeLessThan(tomorrowMidnight);

    const cleared = await auth(request(app).post('/api/shops/me/pause')).send({ minutes: 0 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.paused_until).toBeNull();
    expect(cleared.body.availability.open).toBe(true);
  });

  it('resolvePauseUntil clamps, clears and resolves "today" without touching the DB', () => {
    const cfg = { enabled: true, pause_max_minutes: 60 };
    expect(resolvePauseUntil(0, cfg, NOON_IST)).toBeNull();
    expect(resolvePauseUntil(-5, cfg, NOON_IST)).toBeNull();
    expect(resolvePauseUntil(30, cfg, NOON_IST).getTime()).toBe(NOON_IST.getTime() + 30 * 60000);
    // Over the ceiling clamps down to it.
    expect(resolvePauseUntil(9999, cfg, NOON_IST).getTime()).toBe(NOON_IST.getTime() + 60 * 60000);
    // 'today' never runs past the platform ceiling either.
    expect(resolvePauseUntil('today', cfg, NOON_IST).getTime())
      .toBeLessThanOrEqual(NOON_IST.getTime() + 60 * 60000);
    // With the default 24h ceiling, 'today' is exactly midnight tonight.
    expect(resolvePauseUntil('today', ON, NOON_IST).getTime()).toBe(endOfToday(NOON_IST).getTime());
  });

  it('closures: add, upsert the reason, reject a past date and a far-future one', async () => {
    const today = todayKey(new Date());
    const plus = (n) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };

    const added = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: plus(3), reason: 'Diwali' });
    expect(added.status).toBe(201);
    expect(added.body.closure).toMatchObject({ on_date: plus(3), reason: 'Diwali' });
    expect(added.body.closures.some((c) => c.on_date === plus(3))).toBe(true);

    // Same date again UPSERTS the reason instead of erroring or duplicating.
    const again = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: plus(3), reason: 'Holi' });
    expect(again.status).toBe(201);
    expect(again.body.closure.reason).toBe('Holi');
    expect(again.body.closures.filter((c) => c.on_date === plus(3))).toHaveLength(1);

    // Today itself is allowed (a shop can shut for the rest of the day).
    const todayClosure = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: today });
    expect(todayClosure.status).toBe(201);
    expect(todayClosure.body.availability).toMatchObject({ open: false, reason: 'holiday' });
    await auth(request(app).delete(`/api/shops/me/closures/${todayClosure.body.closure.id}`));

    const past = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: plus(-1) });
    expect(past.status).toBe(422);
    expect(past.body.error).toBe('closure_past');

    const tooFar = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: plus(400) });
    expect(tooFar.status).toBe(422);
    expect(tooFar.body.error).toBe('closure_too_far');
  });

  it('DELETE /shops/me/closures/:id is SHOP-SCOPED (another shop\'s id is a 404)', async () => {
    const today = todayKey(new Date());
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    const date = d.toISOString().slice(0, 10);

    const mine = await auth(request(app).post('/api/shops/me/closures')).send({ on_date: date, reason: 'Eid' });
    expect(mine.status).toBe(201);
    const id = mine.body.closure.id;

    // Another shop's owner cannot delete it…
    const foreign = await request(app)
      .delete(`/api/shops/me/closures/${id}`)
      .set('Authorization', `Bearer ${ownerToken(openShopId)}`);
    expect(foreign.status).toBe(404);
    const still = await pool.query('SELECT COUNT(*)::int AS n FROM shop_closures WHERE id = $1', [id]);
    expect(still.rows[0].n).toBe(1);

    // …the owning shop can.
    const ok = await auth(request(app).delete(`/api/shops/me/closures/${id}`));
    expect(ok.status).toBe(200);
    expect(ok.body.closures.some((c) => c.id === id)).toBe(false);

    // An unknown id is a 404, never a silent success.
    const missing = await auth(request(app).delete('/api/shops/me/closures/00000000-0000-0000-0000-000000000000'));
    expect(missing.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 6. Admin flags — policy, NOT integration credentials
// ---------------------------------------------------------------------------
describe('admin settings — the two availability flags', () => {
  it('saves with NO `confirm` field (they are not integration keys)', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ shop_hours_enabled: true, shop_pause_max_minutes: 720 });
    expect(res.status).toBe(200); // NOT 428 confirmation_required

    const read = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${superAdmin.token}`);
    expect(read.status).toBe(200);
    expect(read.body.features.shop_hours_enabled).toBe(true);
    expect(read.body.features.shop_pause_max_minutes).toBe(720);

    // And the live reader picks the new ceiling up with no restart.
    expect(await getShopHoursConfig()).toMatchObject({ enabled: true, pause_max_minutes: 720 });

    await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ shop_pause_max_minutes: 1440 });
  });
});
