// Integration tests for the shared master catalog (M6). Requires a real
// Postgres (DATABASE_URL) with ALL migrations applied (incl. 0014). Mirrors the
// style of products.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { importCatalog, deriveUnit } = require('../src/utils/import-catalog');

let tokenA; let shopA;
let tokenB; let shopB;

// catalog_items we seed directly (cleaned up in afterAll).
const seededItemIds = [];

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9199${uniq}`,
    password: 'password123',
    shopName: `${prefix} Test Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

async function seedItem(fields) {
  const r = await pool.query(
    `INSERT INTO catalog_items
       (sku, category, subcategory, product, brand, pack, unit, indicative_price, perishable, is_global)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      fields.sku || null,
      fields.category || null,
      fields.subcategory || null,
      fields.product,
      fields.brand || null,
      fields.pack || null,
      fields.unit || null,
      fields.indicative_price || 0,
      fields.perishable || false,
      fields.is_global !== undefined ? fields.is_global : true,
    ]
  );
  seededItemIds.push(r.rows[0].id);
  return r.rows[0];
}

let riceItem; let dalItem; let soapItem;

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('McatA', uniq);
  const b = await register('McatB', `${uniq}1`.slice(-9));
  tokenA = a.token; shopA = a.shop;
  tokenB = b.token; shopB = b.shop;

  const tag = `T${uniq}`; // unique product-name prefix so search hits only our rows
  riceItem = await seedItem({
    sku: `${tag}-RICE`, category: `${tag} Food`, subcategory: 'Rice',
    product: `${tag} Sona Masuri Rice`, brand: 'India Gate', pack: '1 kg',
    unit: 'kg', indicative_price: 57500,
  });
  dalItem = await seedItem({
    sku: `${tag}-DAL`, category: `${tag} Food`, subcategory: 'Pulses',
    product: `${tag} Toor Dal`, brand: 'Tata Sampann', pack: '1 kg',
    unit: 'kg', indicative_price: 16000,
  });
  soapItem = await seedItem({
    sku: `${tag}-SOAP`, category: `${tag} Personal Care`, subcategory: 'Bath',
    product: `${tag} Lux Soap`, brand: 'Lux', pack: '100 g',
    unit: 'g', indicative_price: 4500,
  });
  // expose the tag for tests
  global.__CAT_TAG = tag;
});

afterAll(async () => {
  // Products reference catalog_items via ON DELETE SET NULL, but delete shops
  // first (cascades their products) then our seeded catalog rows.
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (shopB) await pool.query('DELETE FROM shops WHERE id = $1', [shopB.id]);
  if (seededItemIds.length) {
    await pool.query('DELETE FROM catalog_items WHERE id = ANY($1::uuid[])', [seededItemIds]);
  }
  // Custom items created by the tests (owned by our shops) — clean by product tag.
  await pool.query('DELETE FROM catalog_items WHERE product LIKE $1', [`${global.__CAT_TAG}%`]);
  await pool.end();
});

describe('auth', () => {
  it('requires a token (401)', async () => {
    expect((await request(app).get('/api/catalog')).status).toBe(401);
    expect((await request(app).get('/api/catalog/categories')).status).toBe(401);
    expect((await request(app).post('/api/catalog/select').send({})).status).toBe(401);
  });

  it('rejects a customer role (403)', async () => {
    const jwt = require('jsonwebtoken');
    const custToken = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000001', role: 'customer' },
      process.env.JWT_SECRET
    );
    const res = await withToken(request(app).get('/api/catalog'), custToken);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/catalog', () => {
  it('lists visible base items with carried=false before selection', async () => {
    const tag = global.__CAT_TAG;
    const res = await withToken(request(app).get(`/api/catalog?search=${tag}`), tokenA);
    expect(res.status).toBe(200);
    const rice = res.body.items.find((i) => i.id === riceItem.id);
    expect(rice).toBeTruthy();
    expect(rice.carried).toBe(false);
    expect(rice.product_id).toBeNull();
    expect(rice.shop_price).toBeNull();
    // display_name = [brand, product, pack].filter(Boolean).join(' ')
    expect(rice.display_name).toBe(`India Gate ${tag} Sona Masuri Rice 1 kg`);
    expect(rice.indicative_price).toBe(57500);
  });

  it('narrows by search (product/brand ILIKE)', async () => {
    const tag = global.__CAT_TAG;
    const res = await withToken(request(app).get(`/api/catalog?search=${tag} Toor`), tokenA);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(dalItem.id);
    expect(ids).not.toContain(riceItem.id);
  });

  it('narrows by category and subcategory', async () => {
    const tag = global.__CAT_TAG;
    const res = await withToken(
      request(app).get(`/api/catalog?category=${encodeURIComponent(`${tag} Food`)}&subcategory=Rice`),
      tokenA
    );
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i) => i.id);
    expect(ids).toContain(riceItem.id);
    expect(ids).not.toContain(dalItem.id); // Pulses, not Rice
    expect(ids).not.toContain(soapItem.id);
  });

  it('paginates with a stable cursor', async () => {
    const tag = global.__CAT_TAG;
    const page1 = await withToken(request(app).get(`/api/catalog?search=${tag}&limit=2`), tokenA);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.next_cursor).toBeTruthy();

    const page2 = await withToken(
      request(app).get(`/api/catalog?search=${tag}&limit=2&cursor=${encodeURIComponent(page1.body.next_cursor)}`),
      tokenA
    );
    expect(page2.status).toBe(200);
    // No overlap between pages.
    const ids1 = page1.body.items.map((i) => i.id);
    const ids2 = page2.body.items.map((i) => i.id);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });
});

describe('GET /api/catalog/categories', () => {
  it('returns categories with counts and subcategories', async () => {
    const tag = global.__CAT_TAG;
    const res = await withToken(request(app).get('/api/catalog/categories'), tokenA);
    expect(res.status).toBe(200);
    const food = res.body.categories.find((c) => c.category === `${tag} Food`);
    expect(food).toBeTruthy();
    expect(food.count).toBe(2); // rice + dal
    const subNames = food.subcategories.map((s) => s.name).sort();
    expect(subNames).toEqual(['Pulses', 'Rice']);
  });
});

describe('POST /api/catalog/select', () => {
  it('creates a shop product from a base item and flips carried=true', async () => {
    const sel = await withToken(request(app).post('/api/catalog/select'), tokenA)
      .send({ catalog_item_id: riceItem.id, price: 60000 });
    expect(sel.status).toBe(201);
    expect(sel.body.product.catalog_item_id).toBe(riceItem.id);
    expect(Number(sel.body.product.price)).toBe(60000);
    expect(sel.body.product.is_active).toBe(true);
    expect(sel.body.product.name).toBe(`India Gate ${global.__CAT_TAG} Sona Masuri Rice 1 kg`);
    expect(sel.body.product.unit).toBe('kg');

    // GET now reflects carried + shop_price for this shop only.
    const res = await withToken(request(app).get(`/api/catalog?search=${global.__CAT_TAG}`), tokenA);
    const rice = res.body.items.find((i) => i.id === riceItem.id);
    expect(rice.carried).toBe(true);
    expect(rice.product_id).toBe(sel.body.product.id);
    expect(rice.shop_price).toBe(60000);

    // Shop B still sees it as not carried.
    const resB = await withToken(request(app).get(`/api/catalog?search=${global.__CAT_TAG}`), tokenB);
    const riceB = resB.body.items.find((i) => i.id === riceItem.id);
    expect(riceB.carried).toBe(false);
  });

  it('re-selecting reactivates + reprices without duplicating', async () => {
    // First selection above created the product. Deactivate it via products PATCH.
    const list = await withToken(request(app).get(`/api/catalog?search=${global.__CAT_TAG}`), tokenA);
    const rice = list.body.items.find((i) => i.id === riceItem.id);
    const patch = await withToken(request(app).patch(`/api/products/${rice.product_id}`), tokenA)
      .send({ is_active: false });
    expect(patch.status).toBe(200);
    expect(patch.body.product.is_active).toBe(false);

    // Re-select at a new price.
    const sel = await withToken(request(app).post('/api/catalog/select'), tokenA)
      .send({ catalog_item_id: riceItem.id, price: 62000 });
    expect(sel.status).toBe(201);
    expect(sel.body.product.id).toBe(rice.product_id); // same row
    expect(sel.body.product.is_active).toBe(true); // reactivated
    expect(Number(sel.body.product.price)).toBe(62000); // repriced

    // Exactly one product row links this shop to this item.
    const cnt = await pool.query(
      'SELECT COUNT(*)::int AS n FROM products WHERE shop_id = $1 AND catalog_item_id = $2',
      [shopA.id, riceItem.id]
    );
    expect(cnt.rows[0].n).toBe(1);
  });

  it('404s for an unknown catalog item', async () => {
    const res = await withToken(request(app).post('/api/catalog/select'), tokenA)
      .send({ catalog_item_id: '11111111-1111-4111-8111-111111111111', price: 100 });
    expect(res.status).toBe(404);
  });

  it('400s on a negative price', async () => {
    const res = await withToken(request(app).post('/api/catalog/select'), tokenA)
      .send({ catalog_item_id: riceItem.id, price: -1 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/catalog/custom', () => {
  it('creates a global catalog_item + a shop product', async () => {
    const tag = global.__CAT_TAG;
    const res = await withToken(request(app).post('/api/catalog/custom'), tokenA).send({
      product: `${tag} Homemade Pickle`,
      brand: 'Local',
      pack: '250 g',
      category: `${tag} Food`,
      subcategory: 'Pickles',
      unit: 'g',
      price: 9000,
    });
    expect(res.status).toBe(201);
    expect(res.body.item.id).toBeTruthy();
    expect(res.body.item.sku).toBeNull();
    expect(res.body.item.is_global).toBe(true);
    expect(res.body.item.created_by_shop_id).toBe(shopA.id);
    expect(res.body.product.catalog_item_id).toBe(res.body.item.id);
    expect(res.body.product.name).toBe(`Local ${tag} Homemade Pickle 250 g`);
    expect(Number(res.body.product.price)).toBe(9000);

    // Because is_global=true, shop B can see the custom item in the base too.
    const resB = await withToken(
      request(app).get(`/api/catalog?search=${encodeURIComponent(`${tag} Homemade Pickle`)}`),
      tokenB
    );
    const pickleB = resB.body.items.find((i) => i.id === res.body.item.id);
    expect(pickleB).toBeTruthy();
    expect(pickleB.carried).toBe(false); // B hasn't selected it
  });

  it('400s when product name is missing', async () => {
    const res = await withToken(request(app).post('/api/catalog/custom'), tokenA)
      .send({ price: 100 });
    expect(res.status).toBe(400);
  });
});

describe('import-catalog idempotency', () => {
  it('deriveUnit normalises pack tokens', () => {
    expect(deriveUnit('1 kg')).toBe('kg');
    expect(deriveUnit('100 g')).toBe('g');
    expect(deriveUnit('1 L')).toBe('L');
    expect(deriveUnit('500 ml')).toBe('ml');
    expect(deriveUnit('6-pack')).toBe('pack');
    expect(deriveUnit('1 dozen')).toBe('dozen');
    expect(deriveUnit('assorted')).toBe('unit');
    expect(deriveUnit(null)).toBe('unit');
  });

  it('upserts a tiny fixture idempotently (stable counts, no dupes)', async () => {
    const tag = global.__CAT_TAG;
    const fixture = [
      { sku: `${tag}-IMP1`, category: `${tag} Food`, subcategory: 'Rice', product: `${tag} Import Rice`, brand: 'B1', pack: '1 kg', price_paise: 10000, perishable: false },
      { sku: `${tag}-IMP2`, category: `${tag} Food`, subcategory: 'Oil', product: `${tag} Import Oil`, brand: 'B2', pack: '1 L', price_paise: 20000, perishable: false },
    ];

    const first = await importCatalog({ rows: fixture });
    expect(first.upserted).toBe(2);

    const countAfterFirst = await pool.query(
      "SELECT COUNT(*)::int AS n FROM catalog_items WHERE sku LIKE $1", [`${tag}-IMP%`]
    );
    expect(countAfterFirst.rows[0].n).toBe(2);

    // Re-run with a changed price — should UPDATE in place, not duplicate.
    fixture[0].price_paise = 11111;
    const second = await importCatalog({ rows: fixture });
    expect(second.upserted).toBe(2);

    const countAfterSecond = await pool.query(
      "SELECT COUNT(*)::int AS n FROM catalog_items WHERE sku LIKE $1", [`${tag}-IMP%`]
    );
    expect(countAfterSecond.rows[0].n).toBe(2); // still 2, no dupes

    const updated = await pool.query(
      'SELECT indicative_price, unit FROM catalog_items WHERE sku = $1', [`${tag}-IMP1`]
    );
    expect(Number(updated.rows[0].indicative_price)).toBe(11111);
    expect(updated.rows[0].unit).toBe('kg'); // derived from "1 kg"

    // Cleanup this fixture.
    await pool.query('DELETE FROM catalog_items WHERE sku LIKE $1', [`${tag}-IMP%`]);
  });
});
