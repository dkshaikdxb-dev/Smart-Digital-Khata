// Integration tests for the Fresh Produce / farmer supplier flavour (Batch F1).
// Requires a real Postgres (DATABASE_URL) with migrations 0001..0028 applied.
// Covers: farmer registration (forced min_order 0 + default Fresh Produce
// category), discovery filtering by kind + ?fresh=1, and the exact-paise
// commission-by-kind rule (farmer accrues a rate_bps 0 / amount 0 commission row
// while the supply ledger + shop balance are unchanged, idempotently). The
// existing distributor.test.js guards the unchanged 1% distributor path.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = `f${Date.now().toString().slice(-8)}`;

let shopId; let ownerId;
let farmer; let farmerToken; // Fresh Produce farmer, city Nashik
let dist; let distToken; // regular distributor, city Nashik

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

// Drive a placed PO to delivered at a known subtotal via the distributor API.
async function deliverPO(token, distributorId, unitPricePaise, qty) {
  const create = await request(app)
    .post('/api/purchase-orders')
    .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`)
    .send({ distributor_id: distributorId, items: [{ name: 'Tomatoes', qty }] });
  expect(create.status).toBe(201);
  const poId = create.body.purchase_order.id;
  const item = create.body.purchase_order.items[0];

  await request(app)
    .patch(`/api/distributor/orders/${poId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'confirmed', items: [{ id: item.id, unit_price_paise: unitPricePaise }] });
  await request(app)
    .patch(`/api/distributor/orders/${poId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'dispatched' });
  const del = await request(app)
    .patch(`/api/distributor/orders/${poId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'delivered' });
  expect(del.status).toBe(200);
  return poId;
}

beforeAll(async () => {
  // Deterministic distributor commission rate: 100 bps = 1.00%. The Fresh rate
  // (SUPPLY_COMMISSION_FRESH_BPS) is deliberately left unset → code fallback 0.
  await pool.query(
    `INSERT INTO platform_settings (key, value) VALUES ('SUPPLY_COMMISSION_BPS','100')
     ON CONFLICT (key) DO UPDATE SET value = '100'`
  );
  await pool.query("DELETE FROM platform_settings WHERE key = 'SUPPLY_COMMISSION_FRESH_BPS'");

  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    ['Farmer Owner', `fowner_${uniq}@test.local`, `+9130${uniq.slice(-7)}`]
  );
  ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, city) VALUES ($1,$2,$3) RETURNING id`,
    [ownerId, 'Farmer Shop', 'Nashik']
  );
  shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.query("DELETE FROM users WHERE role = 'distributor' AND phone LIKE $1", [`+9131${uniq.slice(-6)}%`]);
  await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  await pool.end();
});

describe('farmer registration', () => {
  it('registers a farmer with no categories → kind farmer, min_order 0, Fresh Produce, is_farmer', async () => {
    const r = await registerDistributor({
      business_name: 'Green Valley Farm',
      name: 'Kisan',
      phone: `+9131${uniq.slice(-6)}01`,
      password: 'password123',
      city: 'Nashik',
      kind: 'farmer',
      village: 'Ozar',
    });
    farmer = r.distributor;
    farmerToken = r.token;
    expect(farmer.kind).toBe('farmer');
    expect(farmer.is_farmer).toBe(true);
    expect(farmer.village).toBe('Ozar');
    expect(farmer.min_order_paise).toBe(0);
    expect(farmer.categories).toContain('Fresh Produce');

    // Login via the shared /auth/login still works for the farmer role.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `+9131${uniq.slice(-6)}01`, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('distributor');
  });

  it('forces min_order to 0 even when a farmer supplies one, but respects explicit categories', async () => {
    const r = await registerDistributor({
      business_name: 'Orchard Co',
      name: 'Baug',
      phone: `+9131${uniq.slice(-6)}02`,
      password: 'password123',
      city: 'Nashik',
      kind: 'farmer',
      village: 'Pimpalgaon',
      min_order_paise: 50000, // ignored — not on the register schema
      categories: ['Mangoes', 'Grapes'],
    });
    expect(r.distributor.min_order_paise).toBe(0);
    expect(r.distributor.categories).toEqual(['Mangoes', 'Grapes']);
    expect(r.distributor.categories).not.toContain('Fresh Produce');
  });

  it('a register with no kind yields a plain distributor (backward-compat)', async () => {
    const r = await registerDistributor({
      business_name: 'Nashik Distributors',
      name: 'Vitthal',
      phone: `+9131${uniq.slice(-6)}03`,
      password: 'password123',
      city: 'Nashik',
      categories: ['grocery'],
    });
    dist = r.distributor;
    distToken = r.token;
    expect(dist.kind).toBe('distributor');
    expect(dist.is_farmer).toBe(false);
  });
});

describe('discovery filtering by kind + fresh', () => {
  it('?kind=farmer, ?kind=distributor, ?fresh=1 narrow correctly; no PII', async () => {
    const all = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    expect(all.status).toBe(200);
    const allNames = all.body.suppliers.map((s) => s.business_name);
    expect(allNames).toContain('Green Valley Farm');
    expect(allNames).toContain('Nashik Distributors');

    const farmers = await request(app)
      .get('/api/suppliers?kind=farmer')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    const farmerRows = farmers.body.suppliers;
    const farmerNames = farmerRows.map((s) => s.business_name);
    expect(farmerNames).toContain('Green Valley Farm');
    expect(farmerNames).not.toContain('Nashik Distributors');
    const gv = farmerRows.find((s) => s.business_name === 'Green Valley Farm');
    expect(gv.is_farmer).toBe(true);
    expect(gv.village).toBe('Ozar');

    const dists = await request(app)
      .get('/api/suppliers?kind=distributor')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    const distNames = dists.body.suppliers.map((s) => s.business_name);
    expect(distNames).toContain('Nashik Distributors');
    expect(distNames).not.toContain('Green Valley Farm');

    const fresh = await request(app)
      .get('/api/suppliers?fresh=1')
      .set('Authorization', `Bearer ${ownerToken(shopId, ownerId)}`);
    const freshNames = fresh.body.suppliers.map((s) => s.business_name);
    expect(freshNames).toContain('Green Valley Farm');
    expect(freshNames).not.toContain('Nashik Distributors');

    // No PII leaks on any discovery row.
    for (const s of farmerRows) {
      expect(s).not.toHaveProperty('phone');
      expect(s).not.toHaveProperty('email');
      expect(s).not.toHaveProperty('user_id');
      expect(s).not.toHaveProperty('whatsapp');
    }
  });
});

describe('commission by kind (exact paise)', () => {
  it('a distributor PO accrues 1%; a farmer PO accrues rate_bps 0 / amount 0, ledger + balance unchanged, idempotent', async () => {
    const subtotal = 43468; // 4 * 10867
    // Distributor path: 1% of 43468 = round(434.68) = 435.
    const distPo = await deliverPO(distToken, dist.id, 10867, 4);
    const distComm = await pool.query('SELECT * FROM supply_commissions WHERE po_id = $1', [distPo]);
    expect(distComm.rowCount).toBe(1);
    expect(distComm.rows[0].rate_bps).toBe(100);
    expect(Number(distComm.rows[0].amount_paise)).toBe(Math.round((subtotal * 100) / 10000));
    expect(Number(distComm.rows[0].amount_paise)).toBe(435);

    // Farmer path: same subtotal, Fresh rate defaults to 0.
    const farmerPo = await deliverPO(farmerToken, farmer.id, 10867, 4);
    const fComm = await pool.query('SELECT * FROM supply_commissions WHERE po_id = $1', [farmerPo]);
    expect(fComm.rowCount).toBe(1); // still inserted — GMV is real, rate is 0
    expect(Number(fComm.rows[0].gmv_paise)).toBe(subtotal);
    expect(fComm.rows[0].rate_bps).toBe(0);
    expect(Number(fComm.rows[0].amount_paise)).toBe(0);

    // The supply ledger 'supply' row === subtotal, unchanged by kind.
    const ledger = await pool.query(
      "SELECT * FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
      [farmerPo]
    );
    expect(ledger.rowCount).toBe(1);
    expect(Number(ledger.rows[0].amount_paise)).toBe(subtotal);

    // Shop → farmer balance === subtotal (only this one farmer PO between them).
    const balRes = await pool.query(
      `SELECT SUM(CASE WHEN type = 'supply' THEN amount_paise ELSE -amount_paise END)::bigint AS bal
         FROM supply_ledger WHERE shop_id = $1 AND distributor_id = $2`,
      [shopId, farmer.id]
    );
    expect(Number(balRes.rows[0].bal)).toBe(subtotal);

    // Delivering again does NOT double-post for the farmer either.
    const again = await request(app)
      .patch(`/api/distributor/orders/${farmerPo}`)
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ status: 'delivered' });
    expect(again.status).toBe(200);
    const ledgerN = await pool.query(
      "SELECT COUNT(*)::int AS n FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
      [farmerPo]
    );
    expect(ledgerN.rows[0].n).toBe(1);
    const commN = await pool.query(
      'SELECT COUNT(*)::int AS n FROM supply_commissions WHERE po_id = $1',
      [farmerPo]
    );
    expect(commN.rows[0].n).toBe(1);
  });
});
