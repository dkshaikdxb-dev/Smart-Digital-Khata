// Integration tests for the distributor / supplier ecosystem (Batch O1).
// Requires a real Postgres (DATABASE_URL) with migrations 0001..0027 applied.
// Covers: distributor onboarding + login, supplier discovery scoping, the PO
// lifecycle, the exact-paise B2B ledger, commission accrual + idempotency, the
// forward-move/cancel rules, and role/scoping gating. No external services.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);

let shopAId; let ownerAId; let shopBId; let ownerBId;
let dist1; let dist1Token; // Mumbai, active
let dist2; let dist2Token; // Mumbai, active (a second, unrelated distributor)

// Owner tokens carry the real owner user UUID as `sub` (purchase_orders.placed_by
// is a UUID column). shopAId maps to ownerAId, shopBId to ownerBId.
function ownerToken(shop) {
  const sub = shop === shopBId ? ownerBId : ownerAId;
  return jwt.sign({ sub, role: 'owner', shopId: shop }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
}

async function registerDistributor(payload) {
  const res = await request(app).post('/api/distributors/register').send(payload);
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  // Deterministic commission rate: 100 bps = 1.00%.
  await pool.query(
    `INSERT INTO platform_settings (key, value) VALUES ('SUPPLY_COMMISSION_BPS','100')
     ON CONFLICT (key) DO UPDATE SET value = '100'`
  );

  const ownerA = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Owner A', `ownerA_${uniq}@test.local`, `+9110${uniq}`]
  );
  ownerAId = ownerA.rows[0].id;
  const shopA = await pool.query(
    `INSERT INTO shops (owner_id, name, city) VALUES ($1,$2,$3) RETURNING id`,
    [ownerAId, 'Shop A', 'Mumbai']
  );
  shopAId = shopA.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopAId, ownerAId]);

  const ownerB = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Owner B', `ownerB_${uniq}@test.local`, `+9111${uniq}`]
  );
  ownerBId = ownerB.rows[0].id;
  const shopB = await pool.query(
    `INSERT INTO shops (owner_id, name, city) VALUES ($1,$2,$3) RETURNING id`,
    [ownerBId, 'Shop B', 'Delhi']
  );
  shopBId = shopB.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopBId, ownerBId]);

  const r1 = await registerDistributor({
    business_name: 'Mumbai Wholesalers',
    name: 'Dinesh',
    phone: `+9120${uniq}`,
    password: 'password123',
    city: 'mumbai', // lowercase — discovery must match case-insensitively
    area: 'Andheri',
    categories: ['grocery', 'dairy'],
    brands: ['amul'],
    whatsapp: `+9120${uniq}`,
  });
  dist1 = r1.distributor;
  dist1Token = r1.token;

  const r2 = await registerDistributor({
    business_name: 'Second Supplier',
    name: 'Suresh',
    email: `dist2_${uniq}@test.local`,
    phone: `+9121${uniq}`,
    password: 'password123',
    city: 'Mumbai',
    categories: ['electronics'],
    brands: ['sony'],
  });
  dist2 = r2.distributor;
  dist2Token = r2.token;

  // An inactive Mumbai distributor that discovery must never return.
  await registerDistributor({
    business_name: 'Inactive Supplier',
    name: 'Ghost',
    phone: `+9122${uniq}`,
    password: 'password123',
    city: 'Mumbai',
    categories: ['grocery'],
  });
  await pool.query(
    "UPDATE distributors SET is_active = false WHERE business_name = 'Inactive Supplier'"
  );

  // A Delhi distributor that must not appear for a Mumbai shop.
  await registerDistributor({
    business_name: 'Delhi Distributor',
    name: 'Ramesh',
    phone: `+9123${uniq}`,
    password: 'password123',
    city: 'Delhi',
    categories: ['grocery'],
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE id = ANY($1)', [[shopAId, shopBId].filter(Boolean)]);
  await pool.query("DELETE FROM users WHERE role = 'distributor' AND phone LIKE $1", [`+912%${uniq}`]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[ownerAId, ownerBId].filter(Boolean)]);
  await pool.end();
});

describe('distributor onboarding + auth', () => {
  it('registers, logs in via the shared /auth/login, and does profile GET/PATCH', async () => {
    // Login with the phone identifier + password works for the distributor role.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `+9120${uniq}`, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('distributor');

    const me = await request(app)
      .get('/api/distributor/me')
      .set('Authorization', `Bearer ${dist1Token}`);
    expect(me.status).toBe(200);
    expect(me.body.distributor.business_name).toBe('Mumbai Wholesalers');

    const patch = await request(app)
      .patch('/api/distributor/me')
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ min_order_paise: 50000, area: 'Bandra' });
    expect(patch.status).toBe(200);
    expect(patch.body.distributor.min_order_paise).toBe(50000);
    expect(patch.body.distributor.area).toBe('Bandra');
  });
});

describe('supplier discovery (owner, shop-scoped by city)', () => {
  it('returns only active distributors in the shop city; filters narrow; no PII', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    expect(res.status).toBe(200);
    const names = res.body.suppliers.map((s) => s.business_name);
    expect(names).toContain('Mumbai Wholesalers');
    expect(names).toContain('Second Supplier');
    expect(names).not.toContain('Inactive Supplier');
    expect(names).not.toContain('Delhi Distributor');

    // No PII leaks — only minimal business fields.
    const asText = JSON.stringify(res.body.suppliers);
    expect(asText).not.toContain(`+9120${uniq}`); // phone / whatsapp
    for (const s of res.body.suppliers) {
      expect(s).not.toHaveProperty('phone');
      expect(s).not.toHaveProperty('email');
      expect(s).not.toHaveProperty('user_id');
      expect(s).not.toHaveProperty('whatsapp');
    }

    // Category filter narrows.
    const grocery = await request(app)
      .get('/api/suppliers?category=grocery')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    const groceryNames = grocery.body.suppliers.map((s) => s.business_name);
    expect(groceryNames).toContain('Mumbai Wholesalers');
    expect(groceryNames).not.toContain('Second Supplier'); // electronics only

    // Brand filter narrows.
    const sony = await request(app)
      .get('/api/suppliers?brand=sony')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    const sonyNames = sony.body.suppliers.map((s) => s.business_name);
    expect(sonyNames).toEqual(['Second Supplier']);
  });
});

describe('purchase-order lifecycle + ledger + commission', () => {
  let poId;

  it('owner places a PO (placed, subtotal 0) with snapshotted items', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`)
      .send({
        distributor_id: dist1.id,
        note: 'weekly restock',
        items: [
          { name: 'Toor Dal', brand: 'X', unit: 'kg', qty: 3 },
          { name: 'Milk', brand: 'Amul', unit: 'ltr', qty: 2 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.purchase_order.status).toBe('placed');
    expect(Number(res.body.purchase_order.subtotal_paise)).toBe(0);
    expect(res.body.purchase_order.items).toHaveLength(2);
    poId = res.body.purchase_order.id;
  });

  it('distributor prices items + confirms → exact-paise subtotal', async () => {
    const detail = await request(app)
      .get(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.order.shop_name).toBe('Shop A');
    const items = detail.body.order.items;
    const dal = items.find((i) => i.name === 'Toor Dal'); // qty 3
    const milk = items.find((i) => i.name === 'Milk'); // qty 2

    const priced = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({
        status: 'confirmed',
        items: [
          { id: dal.id, unit_price_paise: 11000 }, // 3 * 11000 = 33000
          { id: milk.id, unit_price_paise: 5234 }, // 2 * 5234 = 10468
        ],
      });
    expect(priced.status).toBe(200);
    expect(priced.body.order.status).toBe('confirmed');
    expect(Number(priced.body.order.subtotal_paise)).toBe(43468); // exact
  });

  it('advances dispatched → delivered and posts ledger + commission (round)', async () => {
    const disp = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'dispatched' });
    expect(disp.status).toBe(200);

    const del = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'delivered' });
    expect(del.status).toBe(200);
    expect(del.body.order.status).toBe('delivered');

    const ledger = await pool.query(
      "SELECT * FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
      [poId]
    );
    expect(ledger.rowCount).toBe(1);
    expect(Number(ledger.rows[0].amount_paise)).toBe(43468);

    const comm = await pool.query('SELECT * FROM supply_commissions WHERE po_id = $1', [poId]);
    expect(comm.rowCount).toBe(1);
    expect(Number(comm.rows[0].gmv_paise)).toBe(43468);
    expect(comm.rows[0].rate_bps).toBe(100);
    // round(43468 * 100 / 10000) = round(434.68) = 435
    expect(Number(comm.rows[0].amount_paise)).toBe(435);
  });

  it('delivering again does not double-post (idempotent)', async () => {
    // Re-issuing 'delivered' is an idempotent no-op (same status → no re-post),
    // and the ledger post itself is guarded — the rows stay singular.
    const again = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'delivered' });
    expect(again.status).toBe(200);
    expect(again.body.order.status).toBe('delivered');

    const ledger = await pool.query(
      "SELECT COUNT(*)::int AS n FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
      [poId]
    );
    expect(ledger.rows[0].n).toBe(1);
    const comm = await pool.query(
      'SELECT COUNT(*)::int AS n FROM supply_commissions WHERE po_id = $1',
      [poId]
    );
    expect(comm.rows[0].n).toBe(1);
  });
});

describe('exact-paise ledger across POs + payment', () => {
  it('balance = Σ supply − Σ payment, and owner/distributor views agree', async () => {
    // A second delivered PO between Shop A and dist1.
    const create = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`)
      .send({ distributor_id: dist1.id, items: [{ name: 'Sugar', qty: 5 }] });
    const po2 = create.body.purchase_order.id;
    const item = create.body.purchase_order.items[0];

    await request(app)
      .patch(`/api/distributor/orders/${po2}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'confirmed', items: [{ id: item.id, unit_price_paise: 4321 }] }); // 5*4321=21605
    await request(app)
      .patch(`/api/distributor/orders/${po2}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'dispatched' });
    await request(app)
      .patch(`/api/distributor/orders/${po2}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'delivered' });

    // Shop A records a payment to dist1.
    const pay = await request(app)
      .post(`/api/distributor/shops/${shopAId}/payment`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ amount_paise: 20000, method: 'upi' });
    expect(pay.status).toBe(201);

    // Expected balance: 43468 (PO1) + 21605 (PO2) − 20000 (payment) = 45073.
    const expected = 43468 + 21605 - 20000;

    const ownerLedger = await request(app)
      .get('/api/suppliers/ledger')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    expect(ownerLedger.status).toBe(200);
    const row = ownerLedger.body.suppliers.find((s) => s.distributor_id === dist1.id);
    expect(row.balance_paise).toBe(expected);

    const distShops = await request(app)
      .get('/api/distributor/shops')
      .set('Authorization', `Bearer ${dist1Token}`);
    const shopRow = distShops.body.shops.find((s) => s.shop_id === shopAId);
    expect(shopRow.balance_paise).toBe(expected); // both sides agree
  });
});

describe('forward-move + cancel rules', () => {
  it('cannot regress or jump; cancel allowed only from placed/confirmed', async () => {
    const create = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`)
      .send({ distributor_id: dist1.id, items: [{ name: 'Rice', qty: 1 }] });
    const poId = create.body.purchase_order.id;

    // Jump placed → delivered is not a single forward step.
    const jump = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'delivered' });
    expect(jump.status).toBe(200); // placed→delivered IS forward (rank 0<3)

    // Regress delivered → confirmed is rejected.
    const regress = await request(app)
      .patch(`/api/distributor/orders/${poId}`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ status: 'confirmed' });
    expect(regress.status).toBe(422);

    // Cancel a delivered order is rejected.
    const cancelDelivered = await request(app)
      .post(`/api/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    expect(cancelDelivered.status).toBe(422);

    // A fresh placed PO can be cancelled by the owner.
    const create2 = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`)
      .send({ distributor_id: dist1.id, items: [{ name: 'Oil', qty: 1 }] });
    const cancel = await request(app)
      .post(`/api/purchase-orders/${create2.body.purchase_order.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.purchase_order.status).toBe('cancelled');
  });
});

describe('role + scoping gating', () => {
  let poForDist1;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`)
      .send({ distributor_id: dist1.id, items: [{ name: 'Salt', qty: 1 }] });
    poForDist1 = create.body.purchase_order.id;
  });

  it('an owner cannot reach distributor routes', async () => {
    const res = await request(app)
      .get('/api/distributor/me')
      .set('Authorization', `Bearer ${ownerToken(shopAId)}`);
    expect(res.status).toBe(403);
  });

  it('a distributor cannot reach owner supplier routes', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${dist1Token}`);
    expect(res.status).toBe(403);
  });

  it('a distributor cannot read another distributor\'s order', async () => {
    const res = await request(app)
      .get(`/api/distributor/orders/${poForDist1}`)
      .set('Authorization', `Bearer ${dist2Token}`);
    expect(res.status).toBe(404);
  });

  it('an owner cannot read another shop\'s PO', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poForDist1}`)
      .set('Authorization', `Bearer ${ownerToken(shopBId)}`);
    expect(res.status).toBe(404);
  });

  it('a distributor cannot record a payment for a shop it does not trade with', async () => {
    // Shop B (Delhi) never placed a PO with dist1.
    const res = await request(app)
      .post(`/api/distributor/shops/${shopBId}/payment`)
      .set('Authorization', `Bearer ${dist1Token}`)
      .send({ amount_paise: 1000 });
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/distributor/me');
    expect(res.status).toBe(401);
    const res2 = await request(app).get('/api/suppliers');
    expect(res2.status).toBe(401);
  });
});
