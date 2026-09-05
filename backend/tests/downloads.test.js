// Integration tests for #5 role-based downloads (CSV exports gated by role /
// permission). Requires a real Postgres (DATABASE_URL) with migrations applied.
// Owner tokens come from /api/auth/register; admin/consumer tokens are minted
// directly (like admin-rbac.test.js / my.test.js); data is seeded via SQL so
// amounts and scoping are fully controlled.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, t) => req.set('Authorization', `Bearer ${t}`);

let owner1; let owner2; // { token, shopId } via register
const admins = {};
let catalogItemId;
const CONSUMER_PHONE = toE164(`98${uniq}`);
const OTHER_PHONE = toE164(`77${uniq}`);

const consumerToken = (phone) => jwt.sign(
  { sub: `cust-${uniq}`, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' }
);

async function register(label) {
  const u = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)}`;
  const res = await request(app).post('/api/auth/register').send({
    name: `${label} Owner`,
    email: `${label.toLowerCase()}_${u}@test.local`,
    phone: `+9198${u}`.slice(0, 15),
    password: 'password123',
    shopName: `${label} Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shopId: res.body.shop.id };
}

let adminSeq = 0;
async function makeAdmin(key, role) {
  const n = adminSeq++;
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`DL ${key}`, `dl_${key}_${uniq}@test.local`, `+9155${n}${uniq}`, role]
  );
  admins[key] = { id: r.rows[0].id, token: jwt.sign({ sub: r.rows[0].id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' }) };
}

async function seedCustomer(shopId, name, phone, balance) {
  const r = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING id`,
    [shopId, name, phone, balance]
  );
  return r.rows[0].id;
}

async function seedOrder(shopId, customerId, { subtotal, delivery_fee = 0, fulfillment = 'delivery', mode = 'cash', pstatus = 'pending' }) {
  await pool.query(
    `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, delivery_fee)
     VALUES ($1,$2,'pending',$3,$4,$5,$6,$7)`,
    [shopId, customerId, fulfillment, mode, pstatus, subtotal, delivery_fee]
  );
}

function csvLines(text) {
  return text.replace(/\n+$/, '').split('\n').map((l) => l.replace(/\r$/, ''));
}

beforeAll(async () => {
  owner1 = await register('Dl1');
  owner2 = await register('Dl2');
  await makeAdmin('super', 'super');
  await makeAdmin('support', 'support'); // shops:view + users:view + audit:view, NO revenue:view

  // --- shop1: products (one linked to a base catalog item for brand/pack) ---
  const ci = await pool.query(
    `INSERT INTO catalog_items (product, brand, pack, unit) VALUES ('Basmati Rice','Acme','5kg','kg') RETURNING id`
  );
  catalogItemId = ci.rows[0].id;
  await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, sold_by_weight, is_active, catalog_item_id)
     VALUES ($1,'Basmati Rice',12345,'kg',true,true,$2)`,
    [owner1.shopId, catalogItemId]
  );
  await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, is_active) VALUES ($1,'Plain Soap',5000,'unit',true)`,
    [owner1.shopId]
  );

  // shop1 customers: two debtors (non-zero) + one paid-up (excluded).
  const d1 = await seedCustomer(owner1.shopId, 'Debtor One', `+9110${uniq}`, 30000);
  await seedCustomer(owner1.shopId, 'Debtor Two', `+9111${uniq}`, 12345); // 123.45 spot check
  await seedCustomer(owner1.shopId, 'Paid Up', `+9112${uniq}`, 0);
  await seedOrder(owner1.shopId, d1, { subtotal: 10000, delivery_fee: 2000 }); // total 120.00

  // shop2: a foreign product/customer/order that must never leak into shop1.
  await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, is_active) VALUES ($1,'SecretProduct',9999,'unit',true)`,
    [owner2.shopId]
  );
  const f = await seedCustomer(owner2.shopId, 'Foreigner', OTHER_PHONE, 9999);
  await seedOrder(owner2.shopId, f, { subtotal: 7777, delivery_fee: 0 });

  // Consumer: a customers row (with the consumer's phone) + an order at shop1,
  // and a foreign order (OTHER_PHONE) at shop2 that must not appear for them.
  const cc = await seedCustomer(owner1.shopId, 'Consumer C', CONSUMER_PHONE, 4000);
  await seedOrder(owner1.shopId, cc, { subtotal: 4000, delivery_fee: 0, mode: 'credit', pstatus: 'not_required' });
});

afterAll(async () => {
  for (const id of [owner1 && owner1.shopId, owner2 && owner2.shopId]) {
    if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  }
  const ids = Object.values(admins).map((a) => a.id);
  if (ids.length) await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  if (catalogItemId) await pool.query('DELETE FROM catalog_items WHERE id = $1', [catalogItemId]);
  await pool.end();
});

describe('owner exports (report.routes)', () => {
  it('orders.csv → 200 text/csv, attachment, shop-scoped', async () => {
    const res = await withToken(request(app).get('/api/reports/orders.csv'), owner1.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="orders.csv"');
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Date,Customer,Fulfillment,Payment Mode,Payment Status,Subtotal (Rs),Delivery Fee (Rs),Total (Rs)');
    // shop1 order total = 10000 + 2000 = 12000 paise → 120.00.
    const row = lines.find((l) => l.includes('Debtor One'));
    expect(row).toContain('120.00');
    // shop2's order must be absent.
    expect(res.text).not.toContain('7777');
    expect(res.text).not.toContain('77.77');
  });

  it('catalogue.csv → 200 with brand/pack from the linked catalog item, rupee price', async () => {
    const res = await withToken(request(app).get('/api/reports/catalogue.csv'), owner1.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Name,Brand,Pack,Unit,Price (Rs),Sold by weight,Active');
    const rice = lines.find((l) => l.startsWith('Basmati Rice'));
    expect(rice).toContain('Acme');
    expect(rice).toContain('5kg');
    expect(rice).toContain('123.45'); // 12345 paise
    expect(rice).toContain('yes'); // sold_by_weight
    // shop2's product is absent.
    expect(res.text).not.toContain('SecretProduct');
  });

  it('khata-outstanding.csv → 200, only non-zero balances, highest first', async () => {
    const res = await withToken(request(app).get('/api/reports/khata-outstanding.csv'), owner1.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Name,Phone,Balance (Rs)');
    const data = lines.slice(1).filter(Boolean);
    // Debtor One (300.00) before Debtor Two (123.45); Paid Up (0) excluded.
    const names = data.map((l) => l.split(',')[0]);
    expect(names).toContain('Debtor One');
    expect(names).toContain('Debtor Two');
    expect(names).not.toContain('Paid Up');
    expect(data[0]).toContain('300.00');
    expect(names.indexOf('Debtor One')).toBeLessThan(names.indexOf('Debtor Two'));
  });

  it('rejects a request without an owner/staff token (401)', async () => {
    const res = await request(app).get('/api/reports/orders.csv');
    expect(res.status).toBe(401);
  });
});

describe('consumer export (my.routes)', () => {
  it('my/orders.csv → 200 text/csv, scoped to the caller phone', async () => {
    const res = await withToken(request(app).get('/api/my/orders.csv'), consumerToken(CONSUMER_PHONE));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Date,Shop,Fulfillment,Payment Mode,Payment Status,Subtotal (Rs),Delivery Fee (Rs),Total (Rs)');
    const data = lines.slice(1).filter(Boolean);
    expect(data).toHaveLength(1); // only the consumer's one order
    expect(data[0]).toContain('40.00'); // 4000 paise
    // The foreign shop2 order (OTHER_PHONE) must not appear.
    expect(res.text).not.toContain('77.77');
  });

  it('another phone sees only its own (empty here) — no cross-phone leak', async () => {
    const res = await withToken(request(app).get('/api/my/orders.csv'), consumerToken(`+9199${uniq}`));
    expect(res.status).toBe(200);
    const data = csvLines(res.text).slice(1).filter(Boolean);
    expect(data).toHaveLength(0);
  });

  it('rejects an owner token (customerAuth requires role customer)', async () => {
    const res = await withToken(request(app).get('/api/my/orders.csv'), owner1.token);
    expect(res.status).toBe(401);
  });
});

describe('admin exports (permission-gated)', () => {
  it('super downloads every export as text/csv', async () => {
    for (const path of ['shops', 'users', 'moderation-log', 'referrals', 'revenue']) {
      const res = await withToken(request(app).get(`/api/admin/exports/${path}.csv`), admins.super.token);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toBe(`attachment; filename="${path}.csv"`);
    }
  });

  it('revenue.csv renders plan prices as rupees and an MRR total', async () => {
    const res = await withToken(request(app).get('/api/admin/exports/revenue.csv'), admins.super.token);
    expect(res.status).toBe(200);
    const lines = csvLines(res.text);
    expect(lines[0]).toBe('Plan,Monthly Price (Rs),Shops,Monthly Total (Rs)');
    const pro = lines.find((l) => l.startsWith('pro,'));
    expect(pro).toContain('299.00'); // 29900 paise
    expect(res.text).toMatch(/MRR total \(Rs\),\d+\.\d{2}/);
  });

  it('support: revenue.csv → 403 (no revenue:view), shops.csv → 200, moderation-log.csv → 200', async () => {
    const rev = await withToken(request(app).get('/api/admin/exports/revenue.csv'), admins.support.token);
    expect(rev.status).toBe(403);
    const shops = await withToken(request(app).get('/api/admin/exports/shops.csv'), admins.support.token);
    expect(shops.status).toBe(200);
    expect(shops.headers['content-type']).toMatch(/text\/csv/);
    const mod = await withToken(request(app).get('/api/admin/exports/moderation-log.csv'), admins.support.token);
    expect(mod.status).toBe(200);
  });

  it('a non-admin (owner) hitting an admin export → 403', async () => {
    const res = await withToken(request(app).get('/api/admin/exports/shops.csv'), owner1.token);
    expect(res.status).toBe(403);
  });

  it('shops.csv is whole-platform and includes both seeded shops', async () => {
    const res = await withToken(request(app).get('/api/admin/exports/shops.csv'), admins.super.token);
    expect(res.text).toContain('Dl1 Shop');
    expect(res.text).toContain('Dl2 Shop');
  });
});
