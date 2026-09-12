// ONE-TAP ACCEPT with coarse ready-time chips, and "need more time" (batch B).
//
// The point of this batch is that ONE tap both accepts the order and makes a
// promise the customer can act on, and that the SAME promise then reaches every
// surface. So this file covers, in order:
//
//   1. the accept path — status + eta_minutes + promised_at + eta_set_at AND the
//      implicit ORDERALERT acknowledgement, all in ONE call and one row version;
//   2. the honest no-time accept — all three columns stay NULL, never invented;
//   3. `eta_minutes` on any other transition — 422 `eta_not_applicable` with
//      NOTHING written, rather than a silently dropped half-request;
//   4. the clamp and the live chip config — over-max clamps, 0/negative/decimal
//      are 400s, a settings list is parsed/de-duped/sorted/capped, and a
//      MALFORMED setting falls back to the defaults instead of throwing;
//   5. `PATCH /:id/eta` — the busy-mode re-promise, its 422/409/404 edges;
//   6. the customer copy — en + hi authored, an unauthored language falls back
//      to English, and the accepted line carries a CLOCK TIME, not "in 30 minutes";
//   7. the payloads — owner list/get AND the consumer endpoints carry the fields;
//   8. the admin settings — chips + ceiling save with NO typed I CONFIRM, and a
//      malformed chip list is a clear 400.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0067).
// WhatsApp is mocked, so nothing here touches the network.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const mockSendText = jest.fn(async () => ({ ok: true }));
jest.mock('../src/services/whatsapp.service', () => ({
  sendText: (...a) => mockSendText(...a),
  sendTemplate: jest.fn(async () => ({ skipped: true })),
  isConfigured: jest.fn(() => true),
}));

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const eta = require('../src/utils/orderEta');
const copy = require('../src/utils/order-customer-copy');

const uniq = Date.now().toString().slice(-9);
const OWNER_PHONE = toE164(`73${uniq}`);
const CUST_PHONE = toE164(`74${uniq}`);
const OTHER_OWNER_PHONE = toE164(`75${uniq}`);
const OTHER_CUST_PHONE = toE164(`76${uniq}`);

let shopId, ownerId, custId;
let otherShopId, otherOwnerId, otherCustId;
let adminId;

function ownerToken(sid, sub) {
  return jwt.sign({ sub: sub || ownerId, role: 'owner', shopId: sid || shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function adminToken() {
  return jwt.sign({ sub: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Insert an order directly — the consumer create path is covered elsewhere and
// the ready-time machinery only cares about shop/customer/status.
async function makeOrder({ shop = shopId, customer = custId, status = 'pending', fulfillment = 'pickup' } = {}) {
  const r = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status,
                         subtotal, delivery_fee)
     VALUES ($1,$2,$3,$4,'cash','pending',5000,0)
     RETURNING id`,
    [shop, customer, status, fulfillment]
  );
  const id = r.rows[0].id;
  await pool.query(
    `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
     VALUES ($1,'Atta 5kg',5000,1,5000)`,
    [id]
  );
  return id;
}

async function orderRow(id) {
  const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return r.rows[0];
}

// Write a platform setting straight to the table. utils/orderEta reads
// platform_settings LIVE on every call, so a direct write is visible at once —
// which is the property being pinned here.
async function setPlatform(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Eta Owner', `eta_owner_${uniq}@test.local`, OWNER_PHONE]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_pickup, offers_delivery)
     VALUES ($1,'Eta Kirana', true, true) RETURNING id`,
    [ownerId]
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Ramesh Kumar',$2) RETURNING id`,
    [shopId, CUST_PHONE]
  );
  custId = cust.rows[0].id;

  // A SECOND shop, so cross-shop scoping is a real assertion and not a guess.
  const o2 = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Other Owner', `eta_other_${uniq}@test.local`, OTHER_OWNER_PHONE]
  );
  otherOwnerId = o2.rows[0].id;
  const s2 = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,'Other Kirana') RETURNING id`,
    [otherOwnerId]
  );
  otherShopId = s2.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [otherShopId, otherOwnerId]);
  const c2 = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Other Customer',$2) RETURNING id`,
    [otherShopId, OTHER_CUST_PHONE]
  );
  otherCustId = c2.rows[0].id;

  const admin = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Eta Admin', `eta_admin_${uniq}@test.local`, toE164(`77${uniq}`)]
  );
  adminId = admin.rows[0].id;
});

afterAll(async () => {
  for (const sid of [shopId, otherShopId]) if (sid) await pool.query('DELETE FROM shops WHERE id = $1', [sid]);
  for (const uid of [ownerId, otherOwnerId, adminId]) if (uid) await pool.query('DELETE FROM users WHERE id = $1', [uid]);
  await pool.end();
});

beforeEach(async () => {
  await pool.query('DELETE FROM orders WHERE shop_id = ANY($1)', [[shopId, otherShopId]]);
  await setPlatform('order_eta_chips', '15,30,60');
  await setPlatform('order_eta_max_minutes', '240');
  mockSendText.mockClear();
});

// ---------------------------------------------------------------------------

describe('one-tap accept (PATCH /orders/:id/status with a chip)', () => {
  it('sets status, the promise AND the implicit acknowledgement in one call', async () => {
    const id = await makeOrder();
    const before = await orderRow(id);
    expect(before.acknowledged_at).toBeNull();
    expect(before.eta_minutes).toBeNull();

    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'accepted', eta_minutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('accepted');
    expect(res.body.order.eta_minutes).toBe(30);
    expect(res.body.order.promised_at).toBeTruthy();

    const row = await orderRow(id);
    expect(row.eta_minutes).toBe(30);
    expect(row.eta_set_at).toBeTruthy();
    // promised_at ≈ eta_set_at + 30 min, both stamped by the SAME NOW().
    const delta = (new Date(row.promised_at) - new Date(row.eta_set_at)) / 60000;
    expect(Math.round(delta)).toBe(30);
    // ...and it is genuinely in the future relative to the test's own clock.
    expect(new Date(row.promised_at).getTime()).toBeGreaterThan(Date.now());
    // The implicit ORDERALERT acknowledgement rode along in the same UPDATE.
    expect(row.acknowledged_at).toBeTruthy();
  });

  it('silences the repeating new-order alert — no extra tap needed', async () => {
    const id = await makeOrder();
    const tok = `Bearer ${ownerToken()}`;
    const listed = await request(app).get('/api/orders/alerts').set('Authorization', tok);
    expect(listed.body.items.map((o) => o.id)).toContain(id);

    await request(app).patch(`/api/orders/${id}/status`).set('Authorization', tok)
      .send({ status: 'accepted', eta_minutes: 15 });

    const after = await request(app).get('/api/orders/alerts').set('Authorization', tok);
    expect(after.body.items.map((o) => o.id)).not.toContain(id);
  });

  it('accepts WITHOUT a time — all three columns stay NULL, and it still acknowledges', async () => {
    const id = await makeOrder();
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);

    const row = await orderRow(id);
    expect(row.status).toBe('accepted');
    expect(row.eta_minutes).toBeNull();
    expect(row.promised_at).toBeNull();
    expect(row.eta_set_at).toBeNull();
    expect(row.acknowledged_at).toBeTruthy();
  });

  it('refuses eta_minutes on any other transition (422) and writes NOTHING', async () => {
    const id = await makeOrder({ status: 'accepted' });
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'preparing', eta_minutes: 30 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('eta_not_applicable');

    const row = await orderRow(id);
    expect(row.status).toBe('accepted'); // the status change was refused too
    expect(row.eta_minutes).toBeNull();
    expect(row.promised_at).toBeNull();
  });

  it('clamps a chip above the live platform ceiling instead of rejecting it', async () => {
    await setPlatform('order_eta_max_minutes', '240');
    const id = await makeOrder();
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'accepted', eta_minutes: 600 });
    expect(res.status).toBe(200);
    expect((await orderRow(id)).eta_minutes).toBe(240);
  });

  it('rejects 0, a negative and a non-integer eta with a 400', async () => {
    for (const bad of [0, -5, 12.5, 'soon']) {
      const id = await makeOrder();
      const res = await request(app)
        .patch(`/api/orders/${id}/status`)
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ status: 'accepted', eta_minutes: bad });
      expect(res.status).toBe(400);
      const row = await orderRow(id);
      expect(row.status).toBe('pending');
      expect(row.eta_minutes).toBeNull();
    }
  });

  it('sends the customer a WhatsApp line carrying the promised clock time', async () => {
    const id = await makeOrder();
    await request(app).patch(`/api/orders/${id}/status`).set('Authorization', `Bearer ${ownerToken()}`)
      .send({ status: 'accepted', eta_minutes: 30 });
    // Fire-and-forget: let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 30));
    expect(mockSendText).toHaveBeenCalledTimes(1);
    const [phone, text] = mockSendText.mock.calls[0];
    expect(phone).toBe(CUST_PHONE);
    expect(text).toMatch(/\d{1,2}:\d{2}\s?(AM|PM|am|pm)/);
    expect(text).not.toMatch(/in 30 minutes/i);
    // The old hardcoded sentence is GONE, not merely supplemented.
    expect(text).not.toMatch(/is now accepted/i);
  });
});

// ---------------------------------------------------------------------------

describe('the eta helper and its live config', () => {
  it('parses, de-dupes, sorts and caps a chip list from settings', async () => {
    await setPlatform('order_eta_chips', '60, 15,30,15,90,120');
    const cfg = await eta.getEtaConfig();
    expect(cfg.chips).toEqual([15, 30, 60, 90]); // sorted, de-duped, max 4
    expect(cfg.max_minutes).toBe(240);
  });

  it('drops chips above the ceiling and keeps the rest', async () => {
    await setPlatform('order_eta_max_minutes', '45');
    await setPlatform('order_eta_chips', '15,30,60');
    const cfg = await eta.getEtaConfig();
    expect(cfg.chips).toEqual([15, 30]);
    expect(cfg.max_minutes).toBe(45);
  });

  it('falls back to the defaults on a malformed setting rather than throwing', async () => {
    await setPlatform('order_eta_chips', 'soon, later; whenever');
    await setPlatform('order_eta_max_minutes', 'lots');
    const cfg = await eta.getEtaConfig();
    expect(cfg.chips).toEqual([15, 30, 60]);
    expect(cfg.max_minutes).toBe(240);
  });

  it('clamps and refuses honestly, and promisedAt is pure', () => {
    const cfg = { chips: [15, 30, 60], max_minutes: 240 };
    expect(eta.clampEta(30, cfg)).toBe(30);
    expect(eta.clampEta(9999, cfg)).toBe(240);
    expect(eta.clampEta(0, cfg)).toBeNull();
    expect(eta.clampEta(-1, cfg)).toBeNull();
    expect(eta.clampEta(12.5, cfg)).toBeNull();
    expect(eta.clampEta('soon', cfg)).toBeNull();
    expect(eta.clampEta(undefined, cfg)).toBeNull();

    const now = new Date('2026-01-01T10:00:00Z');
    expect(eta.promisedAt(now, 30).toISOString()).toBe('2026-01-01T10:30:00.000Z');
    expect(eta.promisedAt(now, null)).toBeNull();
  });

  it('serves the live chips to the owner clients over GET /orders/eta-config', async () => {
    await setPlatform('order_eta_chips', '20,40');
    const res = await request(app).get('/api/orders/eta-config').set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.chips).toEqual([20, 40]);
    expect(res.body.max_minutes).toBe(240);
  });
});

// ---------------------------------------------------------------------------

describe('"need more time" (PATCH /orders/:id/eta)', () => {
  it('re-promises an accepted order and moves promised_at FORWARD', async () => {
    const id = await makeOrder();
    const tok = `Bearer ${ownerToken()}`;
    await request(app).patch(`/api/orders/${id}/status`).set('Authorization', tok)
      .send({ status: 'accepted', eta_minutes: 15 });
    const first = await orderRow(id);

    const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', tok)
      .send({ eta_minutes: 60 });
    expect(res.status).toBe(200);

    const second = await orderRow(id);
    expect(second.eta_minutes).toBe(60);
    expect(new Date(second.promised_at).getTime()).toBeGreaterThan(new Date(first.promised_at).getTime());
    // Recomputed from NOW, not extended from the old promise.
    const delta = (new Date(second.promised_at) - new Date(second.eta_set_at)) / 60000;
    expect(Math.round(delta)).toBe(60);
    expect(new Date(second.eta_set_at).getTime()).toBeGreaterThanOrEqual(new Date(first.eta_set_at).getTime());
    expect(second.status).toBe('accepted'); // it is not a status change
  });

  it('works while the order is preparing — that is when an owner finds out', async () => {
    const id = await makeOrder({ status: 'preparing' });
    const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
      .send({ eta_minutes: 30 });
    expect(res.status).toBe(200);
    expect((await orderRow(id)).eta_minutes).toBe(30);
  });

  it('tells the customer the time MOVED rather than sending a second "ready by"', async () => {
    const id = await makeOrder({ status: 'accepted' });
    await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
      .send({ eta_minutes: 30 });
    await new Promise((r) => setTimeout(r, 30));
    expect(mockSendText).toHaveBeenCalledTimes(1);
    const text = mockSendText.mock.calls[0][1];
    expect(text).toMatch(/needs a little longer/i);
    expect(text).toMatch(/\d{1,2}:\d{2}\s?(AM|PM|am|pm)/);
  });

  it('422 not_accepted_yet on a still-pending order, and nothing is written', async () => {
    const id = await makeOrder();
    const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
      .send({ eta_minutes: 30 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('not_accepted_yet');
    const row = await orderRow(id);
    expect(row.eta_minutes).toBeNull();
    expect(row.promised_at).toBeNull();
  });

  it('409 on a completed or cancelled order', async () => {
    for (const status of ['completed', 'cancelled']) {
      const id = await makeOrder({ status });
      const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
        .send({ eta_minutes: 30 });
      expect(res.status).toBe(409);
      expect((await orderRow(id)).eta_minutes).toBeNull();
    }
  });

  it('is scoped to the shop — another shop\'s order is a 404, never a 403', async () => {
    const id = await makeOrder({ shop: otherShopId, customer: otherCustId, status: 'accepted' });
    const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
      .send({ eta_minutes: 30 });
    expect(res.status).toBe(404);
    expect((await orderRow(id)).eta_minutes).toBeNull();
  });

  it('rejects a 0/negative/non-integer eta with a 400', async () => {
    const id = await makeOrder({ status: 'accepted' });
    for (const bad of [0, -1, 2.5, 'soon']) {
      const res = await request(app).patch(`/api/orders/${id}/eta`).set('Authorization', `Bearer ${ownerToken()}`)
        .send({ eta_minutes: bad });
      expect(res.status).toBe(400);
    }
    expect((await orderRow(id)).eta_minutes).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('customer copy helper (en authored, hi authored, the rest fall back)', () => {
  const at = new Date('2026-01-01T11:15:00Z'); // 16:45 in Asia/Kolkata

  it('carries a CLOCK time on the accepted line, never a relative phrase', () => {
    const msg = copy.buildCustomerMessage({
      lang: 'en', customerName: 'Ramesh', shopName: 'Eta Kirana', status: 'accepted', promisedAt: at,
    });
    expect(msg).toContain('Eta Kirana has accepted your order');
    expect(msg).toMatch(/\d{1,2}:\d{2}\s?(AM|PM|am|pm)/);
    expect(msg).not.toMatch(/\bin \d+ minutes?\b/i);
    // Rendered in the shop timezone (process.env.TZ || 'Asia/Kolkata'), so a
    // server in another zone still promises the time the shop means.
    expect(copy.formatClock(at)).toMatch(/4:45/);
  });

  it('uses the honest no-time wording when no promise was made', () => {
    const msg = copy.buildCustomerMessage({
      lang: 'en', customerName: 'Ramesh', shopName: 'Eta Kirana', status: 'accepted', promisedAt: null,
    });
    expect(msg).toContain('will tell you when it is ready');
    expect(msg).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it('has its own line for a re-promise', () => {
    const msg = copy.buildCustomerMessage({
      lang: 'en', customerName: 'Ramesh', shopName: 'Eta Kirana', status: 'accepted', promisedAt: at, updated: true,
    });
    expect(msg).toMatch(/needs a little longer/i);
  });

  it('covers every plain status line the old hardcoded sentence used to cover', () => {
    for (const status of ['preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']) {
      const msg = copy.buildCustomerMessage({
        lang: 'en', customerName: 'Ramesh', shopName: 'Eta Kirana', status,
      });
      expect(msg).toContain('Ramesh');
      expect(msg).toContain('Eta Kirana');
      expect(msg).not.toContain(`is now ${status}`);
    }
    // An unknown future stage still produces a sentence, not silence.
    expect(copy.buildCustomerMessage({
      lang: 'en', customerName: 'Ramesh', shopName: 'Eta Kirana', status: 'packed',
    })).toContain('is now packed');
  });

  it('is authored in Hindi and falls back to English for unauthored languages', () => {
    const hi = copy.buildCustomerMessage({
      lang: 'hi', customerName: 'Ramesh', shopName: 'Dukaan', status: 'accepted', promisedAt: at,
    });
    expect(hi).toContain('स्वीकार');
    expect(hi).toMatch(/\d{1,2}:\d{2}/); // the clock face stays in Latin digits

    // ta is deliberately NOT authored — it must read as English, never as
    // machine-translated text nobody has checked.
    const ta = copy.buildCustomerMessage({
      lang: 'ta', customerName: 'Ramesh', shopName: 'Dukaan', status: 'ready',
    });
    expect(ta).toBe('Hi Ramesh, your order at Dukaan is ready.');
    expect(copy.resolveLang('ta')).toBe('en');
    expect(copy.resolveLang('hi-IN')).toBe('hi');
    expect(copy.LANGS).toEqual(['en', 'hi']);
  });
});

// ---------------------------------------------------------------------------

describe('order payloads carry the promise everywhere', () => {
  it('owner list + get, and the consumer list + get', async () => {
    const id = await makeOrder();
    const tok = `Bearer ${ownerToken()}`;
    await request(app).patch(`/api/orders/${id}/status`).set('Authorization', tok)
      .send({ status: 'accepted', eta_minutes: 30 });

    const list = await request(app).get('/api/orders').set('Authorization', tok);
    const listed = list.body.items.find((o) => o.id === id);
    expect(listed.eta_minutes).toBe(30);
    expect(listed.promised_at).toBeTruthy();

    const got = await request(app).get(`/api/orders/${id}`).set('Authorization', tok);
    expect(got.body.order.eta_minutes).toBe(30);
    expect(got.body.order.promised_at).toBeTruthy();

    const ctok = `Bearer ${customerToken(CUST_PHONE)}`;
    const mine = await request(app).get('/api/my/orders').set('Authorization', ctok);
    const mineRow = mine.body.items.find((o) => o.id === id);
    expect(mineRow.eta_minutes).toBe(30);
    expect(mineRow.promised_at).toBeTruthy();

    const mineOne = await request(app).get(`/api/my/orders/${id}`).set('Authorization', ctok);
    expect(mineOne.body.order.eta_minutes).toBe(30);
    expect(mineOne.body.order.promised_at).toBeTruthy();
  });

  it('an order accepted without a time carries nulls, not a guess', async () => {
    const id = await makeOrder();
    const tok = `Bearer ${ownerToken()}`;
    await request(app).patch(`/api/orders/${id}/status`).set('Authorization', tok).send({ status: 'accepted' });
    const got = await request(app).get(`/api/orders/${id}`).set('Authorization', tok);
    expect(got.body.order.eta_minutes).toBeNull();
    expect(got.body.order.promised_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('admin settings (policy, not credentials — no I CONFIRM)', () => {
  it('round-trips the chips and the ceiling with NO confirm field', async () => {
    const tok = `Bearer ${adminToken()}`;
    const before = await request(app).get('/api/admin/settings').set('Authorization', tok);
    expect(before.status).toBe(200);
    expect(before.body.features).toHaveProperty('order_eta_chips');
    expect(before.body.features).toHaveProperty('order_eta_max_minutes');

    const saved = await request(app).patch('/api/admin/settings').set('Authorization', tok)
      .send({ order_eta_chips: '60,10,20', order_eta_max_minutes: 180 }); // no `confirm` at all
    expect(saved.status).toBe(200);

    const after = await request(app).get('/api/admin/settings').set('Authorization', tok);
    expect(after.body.features.order_eta_chips).toBe('10,20,60'); // stored sorted
    expect(after.body.features.order_eta_max_minutes).toBe(180);

    // Put the defaults back so the rest of the suite reads what it documents.
    await request(app).patch('/api/admin/settings').set('Authorization', tok)
      .send({ order_eta_chips: '15,30,60', order_eta_max_minutes: 240 });
  });

  it('rejects a malformed chip list with a clear 400 and writes nothing', async () => {
    const tok = `Bearer ${adminToken()}`;
    const bad = [
      'soon,later',          // not numbers
      '15,30,60,90,120',     // more than four chips
      '15,15',               // duplicates
      '0,30',                // zero is not a promise
      '15,3000',             // above the ceiling
      '',                    // empty
    ];
    for (const chips of bad) {
      const res = await request(app).patch('/api/admin/settings').set('Authorization', tok)
        .send({ order_eta_chips: chips });
      expect(res.status).toBe(400);
    }
    const after = await request(app).get('/api/admin/settings').set('Authorization', tok);
    expect(after.body.features.order_eta_chips).toBe('15,30,60');
  });
});
