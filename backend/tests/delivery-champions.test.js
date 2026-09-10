// Integration tests for the Delivery Champion layer (batch DELIV1). Requires a
// real Postgres (DATABASE_URL) with all migrations (incl. 0059) applied.
//
// Covers: owner champion CRUD (unique random token); atomic assign of a delivery
// order (deliveries row + order -> out_for_delivery); assign rejects a pickup
// order, another shop's order and a double-assign; the PUBLIC champion token
// endpoints (token validated, never an id) return ONLY that champion's own
// deliveries; guarded, idempotent transitions picked_up -> delivered that flip the
// order to completed; wrong/unknown token -> 404; a transition can't regress.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);

function ownerToken(shopId) {
  return jwt.sign({ sub: `owner-${shopId}`, role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function makeShop(name) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, `${name}_${uniq}@t.local`, `+9188${Math.random().toString().slice(2, 11)}`]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, offers_delivery, delivery_fee) VALUES ($1,$2,true,3000) RETURNING id`,
    [ownerId, name]
  );
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  return { ownerId, shopId };
}

async function makeCustomer(shopId, name, phone) {
  const r = await pool.query(
    `INSERT INTO customers (shop_id, name, phone) VALUES ($1,$2,$3) RETURNING id`,
    [shopId, name, phone]
  );
  return r.rows[0].id;
}

async function makeOrder(shopId, customerId, fulfillment, status = 'ready') {
  const r = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, subtotal, delivery_fee, address)
     VALUES ($1,$2,$3,$4,'credit',10000,3000,'12 Main St') RETURNING id`,
    [shopId, customerId, status, fulfillment]
  );
  const orderId = r.rows[0].id;
  await pool.query(
    `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
     VALUES ($1,'Rice',5000,2,10000)`,
    [orderId]
  );
  return orderId;
}

let shopA, shopB;
let custA;

beforeAll(async () => {
  shopA = await makeShop(`DchampA${uniq}`);
  shopB = await makeShop(`DchampB${uniq}`);
  custA = await makeCustomer(shopA.shopId, 'Asha', `+9199${uniq}1`);
});

afterAll(async () => {
  for (const s of [shopA, shopB]) {
    if (s) await pool.query('DELETE FROM shops WHERE id = $1', [s.shopId]);
    if (s) await pool.query('DELETE FROM users WHERE id = $1', [s.ownerId]);
  }
  await pool.end();
});

describe('owner champion CRUD', () => {
  it('creates a champion with a unique 32-hex access token + share link', async () => {
    const res = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Ravi', phone: '+919000000001', area: 'Sector 5' });
    expect(res.status).toBe(201);
    const c = res.body.champion;
    expect(c.name).toBe('Ravi');
    expect(c.access_token).toMatch(/^[a-f0-9]{32}$/);
    expect(c.link).toContain(`/d/${c.access_token}`);
    expect(c.is_active).toBe(true);

    const res2 = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Second' });
    expect(res2.status).toBe(201);
    expect(res2.body.champion.access_token).not.toBe(c.access_token);
  });

  it('lists only this shop’s champions', async () => {
    await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopB.shopId)}`)
      .send({ name: 'OtherShopGuy' });
    const list = await request(app)
      .get('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`);
    expect(list.status).toBe(200);
    const names = list.body.items.map((x) => x.name);
    expect(names).toContain('Ravi');
    expect(names).not.toContain('OtherShopGuy');
  });

  it('toggles is_active via PATCH; a foreign champion is 404', async () => {
    const create = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Toggle Me' });
    const id = create.body.champion.id;
    const patch = await request(app)
      .patch(`/api/delivery/champions/${id}`)
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.champion.is_active).toBe(false);
    // Shop B cannot touch shop A's champion.
    const foreign = await request(app)
      .patch(`/api/delivery/champions/${id}`)
      .set('Authorization', `Bearer ${ownerToken(shopB.shopId)}`)
      .send({ name: 'hijack' });
    expect(foreign.status).toBe(404);
  });
});

describe('owner assign (atomic)', () => {
  let champId;
  beforeAll(async () => {
    const c = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Assigner Champ' });
    champId = c.body.champion.id;
  });

  it('assigns a delivery order → deliveries row + order out_for_delivery', async () => {
    const orderId = await makeOrder(shopA.shopId, custA, 'delivery');
    const res = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId, fee_paise: 2500 });
    expect(res.status).toBe(201);
    expect(res.body.delivery.status).toBe('assigned');
    expect(res.body.delivery.fee_paise).toBe('2500');
    expect(res.body.order.status).toBe('out_for_delivery');

    const ord = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(ord.rows[0].status).toBe('out_for_delivery');
  });

  it('uses the platform default fee when none is provided', async () => {
    const orderId = await makeOrder(shopA.shopId, custA, 'delivery');
    const res = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId });
    expect(res.status).toBe(201);
    expect(res.body.delivery.fee_paise).toBe('2000');
  });

  it('rejects a pickup order (422)', async () => {
    const orderId = await makeOrder(shopA.shopId, custA, 'pickup');
    const res = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId });
    expect(res.status).toBe(422);
    const d = await pool.query('SELECT 1 FROM deliveries WHERE order_id = $1', [orderId]);
    expect(d.rowCount).toBe(0);
  });

  it('rejects another shop’s order (404)', async () => {
    const custB = await makeCustomer(shopB.shopId, 'Bina', `+9199${uniq}2`);
    const orderId = await makeOrder(shopB.shopId, custB, 'delivery');
    const res = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId });
    expect(res.status).toBe(404);
  });

  it('rejects a double-assign (409)', async () => {
    const orderId = await makeOrder(shopA.shopId, custA, 'delivery');
    const first = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: champId });
    expect(second.status).toBe(409);
  });

  it('rejects assigning to an inactive champion (422)', async () => {
    const c = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Sleeping' });
    await request(app)
      .patch(`/api/delivery/champions/${c.body.champion.id}`)
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ is_active: false });
    const orderId = await makeOrder(shopA.shopId, custA, 'delivery');
    const res = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: c.body.champion.id });
    expect(res.status).toBe(422);
  });
});

describe('public champion token endpoints', () => {
  let token, tokenOther, orderId, deliveryId;

  beforeAll(async () => {
    const c = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Token Champ', phone: '+919777777777' });
    token = c.body.champion.access_token;

    const other = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Other Champ' });
    tokenOther = other.body.champion.access_token;

    orderId = await makeOrder(shopA.shopId, custA, 'delivery');
    const assign = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId, champion_id: c.body.champion.id });
    deliveryId = assign.body.delivery.id;
  });

  it('GET /t/:token returns only this champion’s deliveries with contact + items', async () => {
    const res = await request(app).get(`/api/delivery/t/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.champion.name).toBe('Token Champ');
    expect(res.body.deliveries.length).toBe(1);
    const d = res.body.deliveries[0];
    expect(d.delivery_id).toBe(deliveryId);
    expect(d.customer_name).toBe('Asha');
    expect(d.customer_phone).toBeTruthy();
    expect(d.address).toBe('12 Main St');
    expect(d.items_summary).toContain('2x Rice');

    // The OTHER champion sees none of it.
    const other = await request(app).get(`/api/delivery/t/${tokenOther}`);
    expect(other.status).toBe(200);
    expect(other.body.deliveries.length).toBe(0);
  });

  it('unknown / malformed token → 404', async () => {
    const unknown = await request(app).get(`/api/delivery/t/${'a'.repeat(32)}`);
    expect(unknown.status).toBe(404);
    const malformed = await request(app).get('/api/delivery/t/not-a-real-token');
    expect(malformed.status).toBe(400); // fails the token pattern at validation
  });

  it('picked_up → delivered advances and completes the order', async () => {
    const p = await request(app)
      .post(`/api/delivery/t/${token}/${deliveryId}/status`)
      .send({ status: 'picked_up' });
    expect(p.status).toBe(200);
    expect(p.body.delivery.status).toBe('picked_up');
    expect(p.body.delivery.picked_up_at).toBeTruthy();

    const d = await request(app)
      .post(`/api/delivery/t/${token}/${deliveryId}/status`)
      .send({ status: 'delivered' });
    expect(d.status).toBe(200);
    expect(d.body.delivery.status).toBe('delivered');
    expect(d.body.order_completed).toBe(true);

    const ord = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(ord.rows[0].status).toBe('completed');

    // Delivered delivery no longer appears in the active list.
    const list = await request(app).get(`/api/delivery/t/${token}`);
    expect(list.body.deliveries.length).toBe(0);
  });

  it('a repeat delivered is an idempotent no-op (200), not a double-fire', async () => {
    const again = await request(app)
      .post(`/api/delivery/t/${token}/${deliveryId}/status`)
      .send({ status: 'delivered' });
    expect(again.status).toBe(200);
    expect(again.body.noop).toBe(true);
  });

  it('cannot regress delivered → picked_up (409)', async () => {
    const back = await request(app)
      .post(`/api/delivery/t/${token}/${deliveryId}/status`)
      .send({ status: 'picked_up' });
    expect(back.status).toBe(409);
  });

  it('cannot skip assigned → delivered (409)', async () => {
    const orderId2 = await makeOrder(shopA.shopId, custA, 'delivery');
    const c = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Skip Champ' });
    const tok = c.body.champion.access_token;
    const assign = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId2, champion_id: c.body.champion.id });
    const did = assign.body.delivery.id;
    const res = await request(app)
      .post(`/api/delivery/t/${tok}/${did}/status`)
      .send({ status: 'delivered' });
    expect(res.status).toBe(409);
  });

  it('a champion cannot update another champion’s delivery (404)', async () => {
    const orderId3 = await makeOrder(shopA.shopId, custA, 'delivery');
    const c = await request(app)
      .post('/api/delivery/champions')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ name: 'Victim Champ' });
    const assign = await request(app)
      .post('/api/delivery/assign')
      .set('Authorization', `Bearer ${ownerToken(shopA.shopId)}`)
      .send({ order_id: orderId3, champion_id: c.body.champion.id });
    const did = assign.body.delivery.id;
    // tokenOther is a different champion — must not be able to touch this delivery.
    const res = await request(app)
      .post(`/api/delivery/t/${tokenOther}/${did}/status`)
      .send({ status: 'picked_up' });
    expect(res.status).toBe(404);
  });
});
