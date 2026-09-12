// Repeating new-order alert until the owner acknowledges (batch ORDERALERT).
//
// Covers the owner-facing endpoints (alerts list / ack / mute / the shop
// settings clamp), the implicit acknowledgement on a status change, the
// migration backfill, and the BullMQ tick's processor — including the two
// safety properties that matter most:
//   * an acknowledgement that lands between the candidate SELECT and the UPDATE
//     wins (the re-check happens under a row lock), and
//   * a WhatsApp send that THROWS neither fails the tick nor rolls the alert
//     counter back.
//
// Requires a real Postgres (DATABASE_URL) with ALL migrations (incl. 0065).
// WhatsApp is mocked AND the tick takes an injected `send`, so nothing here
// touches the network.
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
const alertSvc = require('../src/services/order-alert.service');
const copy = require('../src/utils/order-alert-copy');
const { needsAlerting } = require('../src/utils/orderAlerts');

const uniq = Date.now().toString().slice(-9);
const OWNER_PHONE = toE164(`63${uniq}`);
const OTHER_OWNER_PHONE = toE164(`64${uniq}`);

let shopId, ownerId, custId;
let otherShopId, otherOwnerId, otherCustId;
let adminId;

function ownerToken(sid, sub) {
  return jwt.sign({ sub: sub || ownerId, role: 'owner', shopId: sid }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function adminToken() {
  return jwt.sign({ sub: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Insert an order directly (the consumer create path is covered elsewhere); the
// alert machinery only cares about shop/customer/status/timestamps.
async function makeOrder({ shop = shopId, customer = custId, status = 'pending', minutesAgo = 0, items = 1, subtotal = 5000 } = {}) {
  const r = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status,
                         subtotal, delivery_fee, address, note, created_at, updated_at)
     VALUES ($1,$2,$3,'pickup','cash','pending',$4,0,NULL,NULL,
             NOW() - ($5 * interval '1 minute'), NOW() - ($5 * interval '1 minute'))
     RETURNING id`,
    [shop, customer, status, subtotal, minutesAgo]
  );
  const id = r.rows[0].id;
  for (let i = 0; i < items; i += 1) {
    await pool.query(
      `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
       VALUES ($1,$2,$3,1,$3)`,
      [id, `Item ${i + 1}`, subtotal]
    );
  }
  return id;
}

async function orderRow(id) {
  const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return r.rows[0];
}

async function setShopAlert(sid, patch) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) { sets.push(`${k} = $${i++}`); vals.push(v); }
  vals.push(sid);
  await pool.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

beforeAll(async () => {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Alert Owner', `alert_owner_${uniq}@test.local`, OWNER_PHONE]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_pickup, offers_delivery)
     VALUES ($1,'Alert Kirana', true, true) RETURNING id`,
    [ownerId]
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Ramesh Kumar',$2) RETURNING id`,
    [shopId, toE164(`65${uniq}`)]
  );
  custId = cust.rows[0].id;

  // A SECOND shop, so cross-shop scoping is a real assertion and not a guess.
  const o2 = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Other Owner', `alert_other_${uniq}@test.local`, OTHER_OWNER_PHONE]
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
    [otherShopId, toE164(`66${uniq}`)]
  );
  otherCustId = c2.rows[0].id;

  // A super admin, for the platform-bounds settings assertions.
  const admin = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin','super') RETURNING id`,
    ['Alert Admin', `alert_admin_${uniq}@test.local`, toE164(`67${uniq}`)]
  );
  adminId = admin.rows[0].id;
});

afterAll(async () => {
  for (const sid of [shopId, otherShopId]) if (sid) await pool.query('DELETE FROM shops WHERE id = $1', [sid]);
  for (const uid of [ownerId, otherOwnerId, adminId]) if (uid) await pool.query('DELETE FROM users WHERE id = $1', [uid]);
  await pool.end();
});

// Every test starts from a clean slate: no orders, default alert policy, unmuted.
beforeEach(async () => {
  mockSendText.mockClear();
  await pool.query('DELETE FROM orders WHERE shop_id = ANY($1::uuid[])', [[shopId, otherShopId]]);
  await setShopAlert(shopId, {
    order_alert_enabled: true,
    order_alert_repeat_minutes: 5,
    order_alert_max_repeats: 6,
    order_alert_muted_until: null,
  });
  await setShopAlert(otherShopId, { order_alert_enabled: true, order_alert_muted_until: null });
});

describe('GET /api/orders/alerts', () => {
  it('returns only pending + unacknowledged orders, OLDEST FIRST, with the settings block', async () => {
    const newest = await makeOrder({ minutesAgo: 1 });
    const oldest = await makeOrder({ minutesAgo: 30, items: 3, subtotal: 12000 });
    const accepted = await makeOrder({ minutesAgo: 20, status: 'accepted' });
    const acked = await makeOrder({ minutesAgo: 25 });
    await pool.query('UPDATE orders SET acknowledged_at = NOW() WHERE id = $1', [acked]);

    const res = await request(app)
      .get('/api/orders/alerts')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(res.status).toBe(200);

    const ids = res.body.items.map((i) => i.id);
    expect(ids).toEqual([oldest, newest]); // oldest first
    expect(ids).not.toContain(accepted);
    expect(ids).not.toContain(acked);

    const first = res.body.items[0];
    expect(first.customer_name).toBe('Ramesh Kumar');
    expect(first.item_count).toBe(3);
    expect(Number(first.total)).toBe(12000);
    expect(first.fulfillment_type).toBe('pickup');
    expect(first.payment_mode).toBe('cash');
    expect(first.alert_count).toBe(0);
    expect(first.age_seconds).toBeGreaterThanOrEqual(60 * 29);
    expect(first.created_at).toBeTruthy();
    // 2G payload: no line items travel with the banner.
    expect(first.items).toBeUndefined();

    expect(res.body.alert).toEqual({
      enabled: true,
      repeat_minutes: 5,
      max_repeats: 6,
      muted_until: null,
    });
  });

  it('is scoped to the caller shop and adds customer_name_local only with ?lang=', async () => {
    await makeOrder();
    await makeOrder({ shop: otherShopId, customer: otherCustId });

    const plain = await request(app)
      .get('/api/orders/alerts')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(plain.body.items).toHaveLength(1);
    expect(plain.body.items[0].customer_name_local).toBeUndefined();

    const localized = await request(app)
      .get('/api/orders/alerts?lang=hi')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(localized.status).toBe(200);
    expect(localized.body.items[0].customer_name_local).toBeTruthy();
    expect(localized.body.items[0].customer_name).toBe('Ramesh Kumar'); // raw untouched

    const other = await request(app)
      .get('/api/orders/alerts')
      .set('Authorization', `Bearer ${ownerToken(otherShopId, otherOwnerId)}`);
    expect(other.body.items).toHaveLength(1);
    expect(other.body.items[0].customer_name).toBe('Other Customer');
  });

  it('reflects the live settings block (muted + disabled)', async () => {
    await setShopAlert(shopId, { order_alert_enabled: false });
    await request(app)
      .post('/api/orders/alerts/mute')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ minutes: 30 });

    const res = await request(app)
      .get('/api/orders/alerts')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(res.body.alert.enabled).toBe(false);
    expect(res.body.alert.muted_until).toBeTruthy();
  });
});

describe('POST /api/orders/:id/ack', () => {
  it('stamps the timestamp, is idempotent, and removes the order from the alerts list', async () => {
    const id = await makeOrder({ minutesAgo: 10 });

    const first = await request(app)
      .post(`/api/orders/${id}/ack`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.id).toBe(id);
    expect(first.body.acknowledged_at).toBeTruthy();

    // Second call: 200, SAME timestamp, never overwritten.
    const second = await request(app)
      .post(`/api/orders/${id}/ack`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.acknowledged_at).toBe(first.body.acknowledged_at);

    // The ack records WHO, and does NOT change the status.
    const row = await orderRow(id);
    expect(row.status).toBe('pending');
    expect(row.acknowledged_by).toBe(ownerId);
    expect(needsAlerting(row)).toBe(false);

    const list = await request(app)
      .get('/api/orders/alerts')
      .set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(list.body.items.map((i) => i.id)).not.toContain(id);
  });

  it('404s for another shop\'s order and leaves it untouched', async () => {
    const id = await makeOrder({ shop: otherShopId, customer: otherCustId });
    const res = await request(app)
      .post(`/api/orders/${id}/ack`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({});
    expect(res.status).toBe(404);
    const row = await orderRow(id);
    expect(row.acknowledged_at).toBeNull();
  });
});

describe('implicit acknowledgement on a status change', () => {
  it('accepting an order auto-acknowledges it', async () => {
    const id = await makeOrder();
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);
    const row = await orderRow(id);
    expect(row.status).toBe('accepted');
    expect(row.acknowledged_at).toBeTruthy();
    expect(row.acknowledged_by).toBe(ownerId);
    expect(needsAlerting(row)).toBe(false);
  });

  it('cancelling an order auto-acknowledges it too', async () => {
    const id = await makeOrder();
    const res = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    const row = await orderRow(id);
    expect(row.status).toBe('cancelled');
    expect(row.acknowledged_at).toBeTruthy();
  });

  it('an earlier explicit "Seen" timestamp is NOT overwritten by accepting', async () => {
    const id = await makeOrder();
    const ack = await request(app)
      .post(`/api/orders/${id}/ack`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({});
    await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({ status: 'accepted' });
    const row = await orderRow(id);
    expect(new Date(row.acknowledged_at).toISOString()).toBe(new Date(ack.body.acknowledged_at).toISOString());
  });
});

describe('POST /api/orders/alerts/mute', () => {
  it('clamps to 1..720 and 0 clears', async () => {
    const tok = `Bearer ${ownerToken(shopId)}`;

    const over = await request(app).post('/api/orders/alerts/mute').set('Authorization', tok).send({ minutes: 5000 });
    expect(over.status).toBe(200);
    expect(over.body.minutes).toBe(720);

    const under = await request(app).post('/api/orders/alerts/mute').set('Authorization', tok).send({ minutes: 0 });
    expect(under.status).toBe(200);
    expect(under.body.muted_until).toBeNull();

    const ok = await request(app).post('/api/orders/alerts/mute').set('Authorization', tok).send({ minutes: 30 });
    expect(ok.body.minutes).toBe(30);
    const s = await pool.query('SELECT order_alert_muted_until FROM shops WHERE id = $1', [shopId]);
    expect(new Date(s.rows[0].order_alert_muted_until).getTime()).toBeGreaterThan(Date.now());

    const cleared = await request(app).post('/api/orders/alerts/mute').set('Authorization', tok).send({ minutes: 0 });
    expect(cleared.body.muted_until).toBeNull();
  });
});

describe('PATCH /api/shops/me clamps the alert cadence to the platform bounds', () => {
  it('clamps the interval below the min and above the max, and the repeat cap', async () => {
    const tok = `Bearer ${ownerToken(shopId)}`;

    const low = await request(app).patch('/api/shops/me').set('Authorization', tok)
      .send({ order_alert_repeat_minutes: 1 });
    expect(low.status).toBe(200);
    expect(low.body.shop.order_alert_repeat_minutes).toBe(2); // platform min

    const high = await request(app).patch('/api/shops/me').set('Authorization', tok)
      .send({ order_alert_repeat_minutes: 900 });
    expect(high.body.shop.order_alert_repeat_minutes).toBe(60); // platform max

    const capped = await request(app).patch('/api/shops/me').set('Authorization', tok)
      .send({ order_alert_max_repeats: 999 });
    expect(capped.body.shop.order_alert_max_repeats).toBe(20); // platform cap

    const off = await request(app).patch('/api/shops/me').set('Authorization', tok)
      .send({ order_alert_enabled: false });
    expect(off.body.shop.order_alert_enabled).toBe(false);

    // All four surface on GET /api/shops/me.
    const me = await request(app).get('/api/shops/me').set('Authorization', tok);
    expect(me.body.shop).toHaveProperty('order_alert_enabled', false);
    expect(me.body.shop).toHaveProperty('order_alert_repeat_minutes', 60);
    expect(me.body.shop).toHaveProperty('order_alert_max_repeats', 20);
    expect(me.body.shop).toHaveProperty('order_alert_muted_until');
  });
});

describe('admin platform bounds (no I CONFIRM — these are not credentials)', () => {
  it('reads and writes the three bounds without a typed confirmation', async () => {
    const tok = `Bearer ${adminToken()}`;
    const before = await request(app).get('/api/admin/settings').set('Authorization', tok);
    expect(before.status).toBe(200);
    expect(before.body.features).toHaveProperty('order_alert_min_minutes');
    expect(before.body.features).toHaveProperty('order_alert_max_minutes');
    expect(before.body.features).toHaveProperty('order_alert_max_repeats_cap');

    const saved = await request(app).patch('/api/admin/settings').set('Authorization', tok)
      .send({ order_alert_min_minutes: 3 }); // no `confirm` field at all
    expect(saved.status).toBe(200);

    const after = await request(app).get('/api/admin/settings').set('Authorization', tok);
    expect(after.body.features.order_alert_min_minutes).toBe(3);

    // Put it back so the clamp test above keeps its documented numbers.
    await request(app).patch('/api/admin/settings').set('Authorization', tok)
      .send({ order_alert_min_minutes: 2 });
  });
});

describe('migration 0065 backfill', () => {
  it('leaves non-pending orders acknowledged and pending ones alerting', async () => {
    // The backfill ran at migrate time; re-running its exact statement must be a
    // no-op for pending rows and idempotent for the rest.
    const done = await makeOrder({ status: 'completed' });
    const pending = await makeOrder();
    await pool.query(
      `UPDATE orders SET acknowledged_at = updated_at
        WHERE status <> 'pending' AND acknowledged_at IS NULL`
    );
    expect((await orderRow(done)).acknowledged_at).toBeTruthy();
    expect((await orderRow(pending)).acknowledged_at).toBeNull();
    expect(needsAlerting(await orderRow(pending))).toBe(true);
  });
});

describe('order-alert.service runTick()', () => {
  it('does NOT alert an order younger than repeat_minutes', async () => {
    const id = await makeOrder({ minutesAgo: 2 }); // repeat_minutes is 5
    const send = jest.fn(async () => {});
    const res = await alertSvc.runTick({ send });
    expect(res.alerted).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect((await orderRow(id)).alert_count).toBe(0);
  });

  it('alerts an order older than repeat_minutes and advances alert_count/last_alert_at', async () => {
    const id = await makeOrder({ minutesAgo: 12, items: 2, subtotal: 7500 });
    const send = jest.fn(async () => {});
    const res = await alertSvc.runTick({ send });
    expect(res.alerted).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);

    const [to, body] = send.mock.calls[0];
    expect(to).toBe(OWNER_PHONE);
    expect(body).toContain('REMINDER 1/6');
    expect(body).toContain('Alert Kirana');
    expect(body).toContain('Ramesh Kumar');
    expect(body).toContain('Waiting 12 min');
    expect(body).toMatch(/₹75\.00/); // subtotal 7500 paise + no delivery fee
    expect(body).toContain('Items: 2');

    const row = await orderRow(id);
    expect(row.alert_count).toBe(1);
    expect(row.last_alert_at).toBeTruthy();

    // Immediately due again? No — the cadence restarts from last_alert_at.
    send.mockClear();
    const again = await alertSvc.runTick({ send });
    expect(again.alerted).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('stops at max_repeats', async () => {
    await setShopAlert(shopId, { order_alert_max_repeats: 2, order_alert_repeat_minutes: 2 });
    const id = await makeOrder({ minutesAgo: 60 });
    const send = jest.fn(async () => {});

    for (let i = 1; i <= 2; i += 1) {
      // Push last_alert_at back so the next tick is due again.
      await pool.query(`UPDATE orders SET last_alert_at = last_alert_at - interval '10 minutes' WHERE id = $1`, [id]);
      const r = await alertSvc.runTick({ send });
      expect(r.alerted).toBe(1);
      expect((await orderRow(id)).alert_count).toBe(i);
    }

    await pool.query(`UPDATE orders SET last_alert_at = last_alert_at - interval '10 minutes' WHERE id = $1`, [id]);
    send.mockClear();
    const capped = await alertSvc.runTick({ send });
    expect(capped.alerted).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect((await orderRow(id)).alert_count).toBe(2);

    // The banner STAYS (the order is still unacknowledged) — it just goes quiet.
    const list = await request(app).get('/api/orders/alerts').set('Authorization', `Bearer ${ownerToken(shopId)}`);
    expect(list.body.items.map((i) => i.id)).toContain(id);
  });

  it('skips a shop with order_alert_enabled = false', async () => {
    await setShopAlert(shopId, { order_alert_enabled: false });
    const id = await makeOrder({ minutesAgo: 30 });
    const send = jest.fn(async () => {});
    const res = await alertSvc.runTick({ send });
    expect(res.alerted).toBe(0);
    expect((await orderRow(id)).alert_count).toBe(0);
  });

  it('skips while muted_until is in the future and works again once it has passed', async () => {
    const id = await makeOrder({ minutesAgo: 30 });
    await setShopAlert(shopId, { order_alert_muted_until: new Date(Date.now() + 30 * 60_000) });

    const send = jest.fn(async () => {});
    expect((await alertSvc.runTick({ send })).alerted).toBe(0);
    expect((await orderRow(id)).alert_count).toBe(0);

    // The mute window passes.
    await setShopAlert(shopId, { order_alert_muted_until: new Date(Date.now() - 60_000) });
    expect((await alertSvc.runTick({ send })).alerted).toBe(1);
    expect((await orderRow(id)).alert_count).toBe(1);
  });

  it('an order acknowledged between the select and the update is NOT alerted (re-check under lock)', async () => {
    const id = await makeOrder({ minutesAgo: 30 });

    // The tick's candidate SELECT sees it...
    const candidates = await alertSvc.selectCandidates(200);
    expect(candidates.map((c) => c.id)).toContain(id);

    // ...and THEN the owner taps "Seen" (this is the mid-flight ack).
    const ack = await request(app)
      .post(`/api/orders/${id}/ack`)
      .set('Authorization', `Bearer ${ownerToken(shopId)}`)
      .send({});
    expect(ack.status).toBe(200);

    // The claim re-locks the row and re-checks: the owner wins, nothing is sent
    // and the counter never moves.
    const claim = await alertSvc.claimOrder(id);
    expect(claim).toBeNull();
    expect((await orderRow(id)).alert_count).toBe(0);

    // Same through the public entry point.
    const send = jest.fn(async () => {});
    expect((await alertSvc.runTick({ send })).alerted).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('a WhatsApp send that THROWS does not fail the tick and does not roll the counter back', async () => {
    const id = await makeOrder({ minutesAgo: 30 });
    const send = jest.fn(async () => { throw new Error('Meta down'); });

    await expect(alertSvc.runTick({ send })).resolves.toBeDefined();
    expect(send).toHaveBeenCalledTimes(1);
    // The counter was committed BEFORE the send, so the failure leaves it bumped
    // — otherwise an outage would turn into an infinite retry storm.
    expect((await orderRow(id)).alert_count).toBe(1);
    expect((await orderRow(id)).last_alert_at).toBeTruthy();
  });

  it('honours the per-tick cap and takes the OLDEST orders first', async () => {
    const older = await makeOrder({ minutesAgo: 40 });
    await makeOrder({ minutesAgo: 20 });
    const send = jest.fn(async () => {});
    const res = await alertSvc.runTick({ send, limit: 1 });
    expect(res.candidates).toBe(1);
    expect(res.alerted).toBe(1);
    expect((await orderRow(older)).alert_count).toBe(1);
  });

  it('defaults to the real WhatsApp seam when no send is injected', async () => {
    await makeOrder({ minutesAgo: 30 });
    mockSendText.mockClear();
    const res = await alertSvc.runTick();
    expect(res.alerted).toBe(1);
    expect(mockSendText).toHaveBeenCalledTimes(1);
    expect(mockSendText.mock.calls[0][0]).toBe(OWNER_PHONE);
  });
});

describe('order-alert copy helper (en authored, hi authored, the rest fall back)', () => {
  it('builds the first alert and the reminder from the same facts', () => {
    const facts = {
      shopName: 'Alert Kirana',
      customerName: 'Ramesh',
      itemCount: 2,
      total: 15000,
      fulfillmentType: 'delivery',
      paymentMode: 'cash',
      address: '4 Market Rd',
      note: 'Ring bell',
    };
    const first = copy.buildOwnerAlert({ lang: 'en', ...facts, repeat: null });
    expect(first).toContain('New order at Alert Kirana');
    expect(first).toContain('Items: 2 · Total: ₹150.00');
    expect(first).toContain('Cash on delivery');
    expect(first).toContain('Address: 4 Market Rd');
    expect(first).not.toContain('REMINDER');

    const rep = copy.buildOwnerAlert({ lang: 'en', ...facts, repeat: { n: 3, max: 6, ageSeconds: 3900 } });
    expect(rep).toContain('REMINDER 3/6');
    expect(rep).toContain('Waiting 1 hr 5 min');
    expect(rep).toContain('Ramesh');
  });

  it('is authored in Hindi and falls back to English for unauthored languages', () => {
    const hi = copy.buildOwnerAlert({
      lang: 'hi', shopName: 'Dukaan', customerName: 'Ramesh', itemCount: 1, total: 5000,
      fulfillmentType: 'pickup', paymentMode: 'credit', repeat: null,
    });
    expect(hi).toContain('नया ऑर्डर');
    expect(hi).toContain('ग्राहक: Ramesh');

    // ta is deliberately NOT authored — it must read as English, never as
    // machine-translated text nobody has checked.
    const ta = copy.buildOwnerAlert({
      lang: 'ta', shopName: 'Dukaan', customerName: 'Ramesh', itemCount: 1, total: 5000,
      fulfillmentType: 'pickup', paymentMode: 'credit', repeat: null,
    });
    expect(ta).toContain('New order at Dukaan');
    expect(copy.resolveLang('ta')).toBe('en');
    expect(copy.resolveLang('hi-IN')).toBe('hi');
    expect(copy.LANGS).toEqual(['en', 'hi']);
  });
});
