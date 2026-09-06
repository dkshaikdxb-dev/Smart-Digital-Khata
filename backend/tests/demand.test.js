// Integration tests for the pre-order / demand board (Batch F2). Requires a real
// Postgres (DATABASE_URL) with migrations 0001..0029 applied. Covers: an owner
// posting a demand need (item snapshot, status 'open', needed_by stored); board
// visibility scoped to the shop's city (no PII beyond name/area); a claim
// spawning a real PO into the EXISTING pipeline and flowing through to a 0%
// farmer commission exactly as F1; the FOR UPDATE double-claim guard; cancel
// rules; and role/scoping gating. No prices anywhere on the demand surface.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = `d${Date.now().toString().slice(-8)}`;

let shopId; let ownerId; // the posting shop (city Pune)
let farmer; let farmerToken; // farmer in Pune (same city → sees the board)
let farAway; let farAwayToken; // distributor in Delhi (different city → no board)

function ownerToken(shop, owner) {
  return jwt.sign({ sub: owner, role: 'owner', shopId: shop }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

async function registerDistributor(payload) {
  const res = await request(app).post('/api/distributors/register').send(payload);
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  // Fresh commission rate stays unset → farmer accrues 0 (mirrors F1).
  await pool.query("DELETE FROM platform_settings WHERE key = 'SUPPLY_COMMISSION_FRESH_BPS'");

  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Demand Owner', `downer_${uniq}@test.local`, `+9140${uniq.slice(-7)}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, city, area) VALUES ($1,$2,$3,$4) RETURNING id`,
    [ownerId, 'Demand Shop', 'Pune', 'Kothrud']
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);

  const f = await registerDistributor({
    business_name: 'Pune Farm',
    name: 'Kisan',
    phone: `+9141${uniq.slice(-6)}01`,
    password: 'password123',
    city: 'pune', // lowercase — board must match case-insensitively
    kind: 'farmer',
    village: 'Wagholi',
  });
  farmer = f.distributor;
  farmerToken = f.token;

  const away = await registerDistributor({
    business_name: 'Delhi Distributor',
    name: 'Ramesh',
    phone: `+9141${uniq.slice(-6)}02`,
    password: 'password123',
    city: 'Delhi',
    categories: ['grocery'],
  });
  farAway = away.distributor;
  farAwayToken = away.token;
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.query("DELETE FROM users WHERE role = 'distributor' AND phone LIKE $1", [`+9141${uniq.slice(-6)}%`]);
  await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

describe('owner posts a demand need', () => {
  let postId;

  it('creates an open post with snapshotted items + needed_by', async () => {
    const res = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({
        needed_by: '2026-10-01',
        note: 'for the weekend rush',
        items: [
          { name: 'Tomato', unit: 'kg', qty: 30 },
          { name: 'Egg', pack: 'crate', qty: 5 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.demand_post.status).toBe('open');
    expect(res.body.demand_post.items).toHaveLength(2);
    expect(res.body.demand_post.needed_by).toContain('2026-10-01');
    // No prices anywhere on the demand surface.
    const asText = JSON.stringify(res.body.demand_post);
    expect(asText).not.toMatch(/paise|price|₹/i);
    postId = res.body.demand_post.id;
  });

  it('lists the shop’s posts and returns items on GET/:id', async () => {
    const list = await request(app)
      .get('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(list.status).toBe(200);
    const ids = list.body.demand_posts.map((p) => p.id);
    expect(ids).toContain(postId);

    const one = await request(app)
      .get(`/api/demand-posts/${postId}`)
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(one.status).toBe(200);
    const names = one.body.demand_post.items.map((i) => i.name).sort();
    expect(names).toEqual(['Egg', 'Tomato']);
    const tomato = one.body.demand_post.items.find((i) => i.name === 'Tomato');
    expect(tomato.qty).toBe(30);
  });
});

describe('board visibility (city-scoped, no PII)', () => {
  it('a same-city farmer sees the open post; a different-city distributor does not', async () => {
    const near = await request(app)
      .get('/api/demand-board')
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(near.status).toBe(200);
    const nearItems = near.body.demand_posts;
    expect(nearItems.length).toBeGreaterThan(0);
    const one = nearItems[0];
    expect(one.shop_name).toBe('Demand Shop');
    expect(one.shop_area).toBe('Kothrud');
    // No shop PII beyond name/area — no owner phone, no city string, no owner id.
    const asText = JSON.stringify(nearItems);
    expect(asText).not.toContain(`+9140${uniq.slice(-7)}`);
    expect(one).not.toHaveProperty('shop_phone');
    expect(one).not.toHaveProperty('owner_id');

    const far = await request(app)
      .get('/api/demand-board')
      .set('Authorization', `Bearer ${farAwayToken}`);
    expect(far.status).toBe(200);
    expect(far.body.demand_posts).toHaveLength(0);
  });
});

describe('claim spawns a PO into the existing pipeline', () => {
  let claimPostId; let claimedPoId;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({ items: [{ name: 'Onion', unit: 'kg', qty: 20 }, { name: 'Potato', unit: 'kg', qty: 10 }] });
    claimPostId = create.body.demand_post.id;
  });

  it('farmer claims → post becomes claimed with po_id; PO exists (placed, subtotal 0) with same items', async () => {
    const claim = await request(app)
      .post(`/api/demand-board/${claimPostId}/claim`)
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(claim.status).toBe(201);
    expect(claim.body.demand_post.status).toBe('claimed');
    expect(claim.body.purchase_order.status).toBe('placed');
    expect(Number(claim.body.purchase_order.subtotal_paise)).toBe(0);
    claimedPoId = claim.body.purchase_order.id;
    expect(claim.body.demand_post.po_id).toBe(claimedPoId);

    const poItemNames = claim.body.purchase_order.items.map((i) => i.name).sort();
    expect(poItemNames).toEqual(['Onion', 'Potato']);
    const onion = claim.body.purchase_order.items.find((i) => i.name === 'Onion');
    expect(onion.qty).toBe(20);

    // The post is no longer on the board.
    const board = await request(app)
      .get('/api/demand-board')
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(board.body.demand_posts.map((p) => p.id)).not.toContain(claimPostId);
  });

  it('the PO appears for both the farmer and the owner via the existing endpoints', async () => {
    const farmerOrders = await request(app)
      .get('/api/distributor/orders')
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(farmerOrders.body.orders.map((o) => o.id)).toContain(claimedPoId);

    const ownerPOs = await request(app)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(ownerPOs.body.purchase_orders.map((o) => o.id)).toContain(claimedPoId);
  });

  it('farmer prices + delivers → supply ledger + a 0% farmer commission post exactly as F1', async () => {
    const detail = await request(app)
      .get(`/api/distributor/orders/${claimedPoId}`)
      .set('Authorization', `Bearer ${farmerToken}`);
    const onion = detail.body.order.items.find((i) => i.name === 'Onion'); // qty 20
    const potato = detail.body.order.items.find((i) => i.name === 'Potato'); // qty 10

    // 20 * 2500 = 50000 ; 10 * 3300 = 33000 ; subtotal = 83000.
    await request(app)
      .patch(`/api/distributor/orders/${claimedPoId}`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({
        status: 'confirmed',
        items: [
          { id: onion.id, unit_price_paise: 2500 },
          { id: potato.id, unit_price_paise: 3300 },
        ],
      });
    await request(app)
      .patch(`/api/distributor/orders/${claimedPoId}`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ status: 'dispatched' });
    const del = await request(app)
      .patch(`/api/distributor/orders/${claimedPoId}`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ status: 'delivered' });
    expect(del.status).toBe(200);

    const subtotal = 83000;
    const ledger = await pool.query(
      "SELECT * FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
      [claimedPoId]
    );
    expect(ledger.rowCount).toBe(1);
    expect(Number(ledger.rows[0].amount_paise)).toBe(subtotal);

    const comm = await pool.query('SELECT * FROM supply_commissions WHERE po_id = $1', [claimedPoId]);
    expect(comm.rowCount).toBe(1);
    expect(Number(comm.rows[0].gmv_paise)).toBe(subtotal);
    expect(comm.rows[0].rate_bps).toBe(0); // farmer → Fresh rate default 0
    expect(Number(comm.rows[0].amount_paise)).toBe(0);
  });
});

describe('double-claim is impossible', () => {
  let postId;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({ items: [{ name: 'Chilli', unit: 'kg', qty: 3 }] });
    postId = create.body.demand_post.id;
  });

  it('a second claim on a now-claimed post → 409; still exactly one PO', async () => {
    const first = await request(app)
      .post(`/api/demand-board/${postId}/claim`)
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/demand-board/${postId}/claim`)
      .set('Authorization', `Bearer ${farAwayToken}`);
    expect(second.status).toBe(409);

    const pos = await pool.query(
      'SELECT COUNT(*)::int AS n FROM purchase_orders po JOIN demand_posts dp ON dp.po_id = po.id WHERE dp.id = $1',
      [postId]
    );
    expect(pos.rows[0].n).toBe(1);
  });
});

describe('cancel rules', () => {
  it('owner cancels an open post → cancelled + off the board; cancelling a claimed post → 409', async () => {
    const create = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({ items: [{ name: 'Spinach', unit: 'bunch', qty: 8 }] });
    const openId = create.body.demand_post.id;

    const cancel = await request(app)
      .post(`/api/demand-posts/${openId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.demand_post.status).toBe('cancelled');

    const board = await request(app)
      .get('/api/demand-board')
      .set('Authorization', `Bearer ${farmerToken}`);
    expect(board.body.demand_posts.map((p) => p.id)).not.toContain(openId);

    // A claimed post cannot be cancelled.
    const create2 = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({ items: [{ name: 'Carrot', unit: 'kg', qty: 4 }] });
    const claimedId = create2.body.demand_post.id;
    await request(app)
      .post(`/api/demand-board/${claimedId}/claim`)
      .set('Authorization', `Bearer ${farmerToken}`);
    const badCancel = await request(app)
      .post(`/api/demand-posts/${claimedId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(badCancel.status).toBe(409);
  });
});

describe('role + scoping gating', () => {
  let openPostId;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
      .send({ items: [{ name: 'Beans', unit: 'kg', qty: 2 }] });
    openPostId = create.body.demand_post.id;
  });

  it('an owner cannot reach the distributor demand-board routes', async () => {
    const res = await request(app)
      .get('/api/demand-board')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(res.status).toBe(403);
  });

  it('a distributor cannot post to /api/demand-posts', async () => {
    const res = await request(app)
      .post('/api/demand-posts')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ items: [{ name: 'X', qty: 1 }] });
    expect(res.status).toBe(403);
  });

  it('an owner sees only their own shop’s posts', async () => {
    // A second owner/shop in a different city, with its own post.
    const owner2 = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,'x','owner') RETURNING id`,
      ['Other Owner', `oother_${uniq}@test.local`, `+9142${uniq.slice(-7)}`]
    );
    const o2 = owner2.rows[0].id;
    const shop2 = await pool.query(
      `INSERT INTO shops (owner_id, name, city) VALUES ($1,$2,$3) RETURNING id`,
      [o2, 'Other Shop', 'Nagpur']
    );
    const s2 = shop2.rows[0].id;
    await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [s2, o2]);

    const mine = await request(app)
      .get('/api/demand-posts')
      .set('Authorization', `Bearer ${ownerToken(s2, o2)}`);
    expect(mine.status).toBe(200);
    expect(mine.body.demand_posts.map((p) => p.id)).not.toContain(openPostId);

    // Cross-shop GET/:id is a 404 (shop-scoped).
    const cross = await request(app)
      .get(`/api/demand-posts/${openPostId}`)
      .set('Authorization', `Bearer ${ownerToken(s2, o2)}`);
    expect(cross.status).toBe(404);

    await pool.query('DELETE FROM shops WHERE id = $1', [s2]);
    await pool.query('DELETE FROM users WHERE id = $1', [o2]);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/demand-posts');
    expect(res.status).toBe(401);
    const res2 = await request(app).get('/api/demand-board');
    expect(res2.status).toBe(401);
  });
});
