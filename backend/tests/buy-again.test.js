// Integration tests for GET /api/my/buy-again — the signed-in shopper's own
// previously ordered items, most frequently ordered first.
//
// A rural grocery basket barely changes month to month, so this is the fastest
// path back to what someone actually wants. It is also a leak risk: it reads
// order_items, which every shop's every customer writes into. The scoping tests
// below are the point of this file as much as the ordering ones.
//
// Requires a real Postgres (DATABASE_URL) with the migrations applied.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const MINE = toE164(`96${uniq}`);
const THEIRS = toE164(`95${uniq}`);

let shopA; let shopB;
let ownerIds = [];
let myCustA; let myCustB; let theirCust;

const customerToken = (phone) =>
  jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });

async function makeShop(name, suffix) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, `ba_${suffix}_${uniq}@test.local`, `+9194${suffix}${uniq}`.slice(0, 14)]
  );
  ownerIds.push(owner.rows[0].id);
  const shop = await pool.query('INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id', [
    owner.rows[0].id, name,
  ]);
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shop.rows[0].id, owner.rows[0].id]);
  return shop.rows[0].id;
}

async function makeCustomer(shopId, name, phone) {
  const r = await pool.query(
    'INSERT INTO customers (shop_id, name, phone) VALUES ($1,$2,$3) RETURNING id',
    [shopId, name, phone]
  );
  return r.rows[0].id;
}

// An order with its lines. `status` lets a test place a cancelled one.
// Money values are incidental here: this endpoint returns none of them.
async function placeOrder(shopId, customerId, lines, { status = 'completed', daysAgo = 0 } = {}) {
  const o = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode,
                         subtotal, delivery_fee, created_at)
     VALUES ($1,$2,$3,'pickup','cash',0,0, NOW() - ($4 || ' days')::interval) RETURNING id`,
    [shopId, customerId, status, String(daysAgo)]
  );
  for (const name of lines) {
    await pool.query(
      `INSERT INTO order_items (order_id, name, unit_price, quantity, line_total)
       VALUES ($1,$2,1000,1,1000)`,
      [o.rows[0].id, name]
    );
  }
  return o.rows[0].id;
}

beforeAll(async () => {
  shopA = await makeShop(`BuyAgain A ${uniq}`, 'a');
  shopB = await makeShop(`BuyAgain B ${uniq}`, 'b');
  myCustA = await makeCustomer(shopA, 'Me at A', MINE);
  myCustB = await makeCustomer(shopB, 'Me at B', MINE);
  theirCust = await makeCustomer(shopA, 'Someone else', THEIRS);

  // My history. Atta three times, dal twice, and chai once — plus the same dal
  // bought later from the OTHER shop, which must fold into one line.
  await placeOrder(shopA, myCustA, ['Chakki Atta', 'Toor Dal'], { daysAgo: 40 });
  await placeOrder(shopA, myCustA, ['Chakki Atta', 'Chai Patti'], { daysAgo: 30 });
  await placeOrder(shopA, myCustA, ['Chakki Atta'], { daysAgo: 20 });
  await placeOrder(shopB, myCustB, ['toor dal'], { daysAgo: 5 });
  // A cancelled basket: never handed over, so never "bought again".
  await placeOrder(shopA, myCustA, ['Mustard Oil'], { status: 'cancelled', daysAgo: 2 });

  // Somebody else's history, at the same shop.
  await placeOrder(shopA, theirCust, ['Sarson Ka Tel', 'Sarson Ka Tel'], { daysAgo: 10 });
}, 30000);

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE id = ANY($1::uuid[])', [[shopA, shopB]]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ownerIds]);
  await pool.end();
});

describe('GET /api/my/buy-again', () => {
  it('returns the shopper’s own items, most frequently ordered first', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((i) => i.name);
    expect(names).toEqual(['Chakki Atta', 'toor dal', 'Chai Patti']);
    expect(res.body.items[0].times).toBe(3);
    expect(res.body.items[1].times).toBe(2);
  });

  it('folds the same item bought at two shops into one line, showing the latest shop', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    const dal = res.body.items.find((i) => i.name.toLowerCase() === 'toor dal');
    expect(dal.times).toBe(2);
    // Bought at A 40 days ago, at B 5 days ago: B is where a tap should lead.
    expect(dal.shop_id).toBe(shopB);
    expect(dal.shop_name).toBe(`BuyAgain B ${uniq}`);
  });

  it('leaves a cancelled order out', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    expect(res.body.items.map((i) => i.name)).not.toContain('Mustard Oil');
  });

  it('never returns another shopper’s items, even from the same shop', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    expect(res.body.items.map((i) => i.name)).not.toContain('Sarson Ka Tel');

    const theirs = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(THEIRS)}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.items.map((i) => i.name)).toEqual(['Sarson Ka Tel']);
    expect(theirs.body.items.map((i) => i.name)).not.toContain('Chakki Atta');
  });

  it('carries no price, and no field that could be read as one', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    for (const item of res.body.items) {
      expect(Object.keys(item).sort())
        .toEqual(['last_ordered_at', 'name', 'shop_id', 'shop_name', 'times']);
    }
  });

  it('honours the cap, and defaults to eight', async () => {
    const res = await request(app)
      .get('/api/my/buy-again?limit=1')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Chakki Atta');

    const bad = await request(app)
      .get('/api/my/buy-again?limit=500')
      .set('Authorization', `Bearer ${customerToken(MINE)}`);
    expect(bad.status).toBe(400);
  });

  it('answers a brand-new shopper with an empty list, not an error', async () => {
    const res = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${customerToken(toE164(`93${uniq}`))}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('refuses an anonymous caller and an owner token', async () => {
    const anon = await request(app).get('/api/my/buy-again');
    expect(anon.status).toBe(401);

    const owner = jwt.sign({ sub: 'o', role: 'owner', shopId: shopA }, process.env.JWT_SECRET);
    const asOwner = await request(app)
      .get('/api/my/buy-again')
      .set('Authorization', `Bearer ${owner}`);
    expect(asOwner.status).toBe(401);
  });
});
