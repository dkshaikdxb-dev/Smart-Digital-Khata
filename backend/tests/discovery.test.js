// Integration tests for Shop Discovery (M6). Requires a real Postgres
// (DATABASE_URL) with the migrations applied. Public directory of opted-in
// shops: browse/search, product counts, and nearest-first distance sorting.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9199${uniq}`,
    password: 'password123',
    shopName: `${prefix} Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

// A city unique to this run so filters isolate our seeded shops from any other
// listed shops that might exist in the shared test DB.
let CITY;
let listedA; let tokenA;
let listedB; let tokenB;
let unlisted; let tokenU;
// A dedicated shop exercising getShop's localized `category_labels` map: one
// product linked to a base catalog_item carrying a run-unique category, with a
// hi translation of that category seeded into catalog_i18n.
let catShop; let tokenCat;
let CATEGORY;
const CATEGORY_HI = 'खाद्य पदार्थ';
// A dedicated shop exercising getShop's localized product `description`: one
// product whose English name matches a catalog_i18n product term carrying a hi
// `description`. getShop?lang=hi must return the localized description; en/no-lang
// the raw English one. A run-unique term (Salt<uniq>) keeps this isolated from
// product-search-recall.test.js, which owns the shared ('product','Salt','hi') row.
let saltShop; let tokenSalt;
let SALT_TERM;
const SALT_EN_DESC = 'Iodized table salt';
const SALT_HI_DESC = 'आयोडीन युक्त खाने का नमक';
const SALT_NAME_HI = 'नमक';
// A dedicated shop exercising getShop's localized variant-GROUP name
// (base_product). One product linked to a base catalog_item whose `product`
// column is a run-unique master term, with a hi translation of that master term
// seeded into catalog_i18n. getShop?lang=hi must localize base_product; en/no-lang
// returns the raw English master term. Run-unique to avoid cross-file collision.
let baseShop; let tokenBase;
let BASE_TERM;
const BASE_NAME_HI = 'नमक';
// A dedicated shop exercising getShop's localized `brand` (batch LOC-BRAND). One
// product linked to a base catalog_item whose `brand` is a run-unique term, with
// a hi translation of that brand seeded into catalog_i18n (term_type='brand').
// getShop?lang=hi must localize brand; en/no-lang returns the raw English brand.
let brandShop; let tokenBrand;
let BRAND_TERM;
const BRAND_NAME_HI = 'टाटा';

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  CITY = `Discville${uniq}`;

  const a = await register('DiscA', uniq);
  const b = await register('DiscB', `${uniq}1`.slice(-9));
  const u = await register('DiscU', `${uniq}2`.slice(-9));
  listedA = a.shop; tokenA = a.token;
  listedB = b.shop; tokenB = b.token;
  unlisted = u.shop; tokenU = u.token;

  // Coords: A ~ Mumbai, B ~ Delhi (far). The unlisted shop opts out.
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Andheri', latitude = 19.08, longitude = 72.88, is_listed = true WHERE id = $2`,
    [CITY, listedA.id]
  );
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Connaught Place', latitude = 28.6139, longitude = 77.2090, is_listed = true WHERE id = $2`,
    [CITY, listedB.id]
  );
  await pool.query(
    `UPDATE shops SET city = $1, area = 'Hidden', is_listed = false WHERE id = $2`,
    [CITY, unlisted.id]
  );

  // Shop A: 2 active + 1 inactive product → product_count must be 2.
  for (const name of ['Atta', 'Rice']) {
    await withToken(request(app).post('/api/products'), tokenA).send({ name, price: 5000, unit: 'kg' });
  }
  const inactive = await withToken(request(app).post('/api/products'), tokenA)
    .send({ name: 'Discontinued', price: 9000, unit: 'kg' });
  await withToken(request(app).patch(`/api/products/${inactive.body.product.id}`), tokenA)
    .send({ is_active: false });

  // Category-localization fixture: a separate LISTED shop (kept out of CITY so
  // the browse/distance tests are unaffected) with ONE product linked to a base
  // catalog_item that carries a run-unique category, plus a hi translation of
  // that category. getShop?lang=hi should surface it as category_labels[CATEGORY].
  const cat = await register('DiscCat', `${uniq}3`.slice(-9));
  catShop = cat.shop; tokenCat = cat.token;
  CATEGORY = `Food${uniq}`;
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [catShop.id]);
  const catProd = await withToken(request(app).post('/api/products'), tokenCat)
    .send({ name: `Cat Rice ${uniq}`, price: 5000, unit: 'kg' });
  const ci = await pool.query(
    `INSERT INTO catalog_items (category, product, is_global) VALUES ($1, $2, true) RETURNING id`,
    [CATEGORY, `Cat Rice ${uniq}`]
  );
  await pool.query('UPDATE products SET catalog_item_id = $1 WHERE id = $2', [ci.rows[0].id, catProd.body.product.id]);
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('category', $1, 'hi', $2, '', false)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`,
    [CATEGORY, CATEGORY_HI]
  );

  // Description-localization fixture: a separate LISTED shop with ONE product
  // whose English name (Salt<uniq>) matches a catalog_i18n product term that
  // carries a hi `description`. The product also has its own English description.
  const salt = await register('DiscSalt', `${uniq}4`.slice(-9));
  saltShop = salt.shop; tokenSalt = salt.token;
  SALT_TERM = `Salt${uniq}`;
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [saltShop.id]);
  await withToken(request(app).post('/api/products'), tokenSalt)
    .send({ name: SALT_TERM, price: 2800, unit: 'kg', description: SALT_EN_DESC });
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review, description)
     VALUES ('product', $1, 'hi', $2, '', false, $3)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
    [SALT_TERM, SALT_NAME_HI, SALT_HI_DESC]
  );

  // Base-product (variant-group name) localization fixture: a separate LISTED
  // shop with ONE product linked to a base catalog_item whose `product` column
  // is a run-unique master term (Baseprod<uniq>), plus a hi translation of that
  // master term. getShop?lang=hi must localize base_product; en/no-lang returns
  // the raw English master term.
  const base = await register('DiscBase', `${uniq}5`.slice(-9));
  baseShop = base.shop; tokenBase = base.token;
  BASE_TERM = `Baseprod${uniq}`;
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [baseShop.id]);
  const baseProd = await withToken(request(app).post('/api/products'), tokenBase)
    .send({ name: `Base Card ${uniq}`, price: 3200, unit: 'kg' });
  const baseCi = await pool.query(
    `INSERT INTO catalog_items (category, product, is_global) VALUES ($1, $2, true) RETURNING id`,
    [`Food${uniq}5`.slice(0, 40), BASE_TERM]
  );
  await pool.query('UPDATE products SET catalog_item_id = $1 WHERE id = $2', [baseCi.rows[0].id, baseProd.body.product.id]);
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('product', $1, 'hi', $2, '', false)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`,
    [BASE_TERM, BASE_NAME_HI]
  );

  // Brand localization fixture: a separate LISTED shop with ONE product linked to
  // a base catalog_item carrying a run-unique brand (Tata<uniq>), plus a hi
  // translation of that brand (term_type='brand'). getShop?lang=hi must localize
  // brand; en/no-lang returns the raw English brand.
  const brandReg = await register('DiscBrand', `${uniq}6`.slice(-9));
  brandShop = brandReg.shop; tokenBrand = brandReg.token;
  BRAND_TERM = `Tata${uniq}`;
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [brandShop.id]);
  const brandProd = await withToken(request(app).post('/api/products'), tokenBrand)
    .send({ name: `Brand Rice ${uniq}`, price: 5000, unit: 'kg' });
  const brandCi = await pool.query(
    `INSERT INTO catalog_items (category, product, brand, is_global) VALUES ($1, $2, $3, true) RETURNING id`,
    [`Food${uniq}6`.slice(0, 40), `Brand Rice ${uniq}`, BRAND_TERM]
  );
  await pool.query('UPDATE products SET catalog_item_id = $1 WHERE id = $2', [brandCi.rows[0].id, brandProd.body.product.id]);
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('brand', $1, 'hi', $2, '', true)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`,
    [BRAND_TERM, BRAND_NAME_HI]
  );
}, 30000);

afterAll(async () => {
  for (const s of [listedA, listedB, unlisted, catShop, saltShop, baseShop, brandShop]) {
    if (s) await pool.query('DELETE FROM shops WHERE id = $1', [s.id]);
  }
  if (CATEGORY) {
    await pool.query(`DELETE FROM catalog_i18n WHERE term_type = 'category' AND term_en = $1`, [CATEGORY]);
    await pool.query('DELETE FROM catalog_items WHERE category = $1', [CATEGORY]);
  }
  if (SALT_TERM) {
    await pool.query(`DELETE FROM catalog_i18n WHERE term_type = 'product' AND term_en = $1`, [SALT_TERM]);
  }
  if (BASE_TERM) {
    await pool.query(`DELETE FROM catalog_i18n WHERE term_type = 'product' AND term_en = $1`, [BASE_TERM]);
    await pool.query('DELETE FROM catalog_items WHERE product = $1', [BASE_TERM]);
  }
  if (BRAND_TERM) {
    await pool.query(`DELETE FROM catalog_i18n WHERE term_type = 'brand' AND term_en = $1`, [BRAND_TERM]);
    await pool.query('DELETE FROM catalog_items WHERE brand = $1', [BRAND_TERM]);
  }
  await pool.end();
});

describe('owner discovery settings (PATCH /shops/me)', () => {
  it('persists city/area/lat/lng/is_listed and returns them from GET /shops/me', async () => {
    const patch = await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: 'Testnagar', area: 'Sector 5', latitude: 12.34, longitude: 56.78, is_listed: true,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.shop.city).toBe('Testnagar');
    expect(patch.body.shop.area).toBe('Sector 5');
    expect(patch.body.shop.latitude).toBe(12.34);
    expect(patch.body.shop.longitude).toBe(56.78);
    expect(patch.body.shop.is_listed).toBe(true);

    const me = await withToken(request(app).get('/api/shops/me'), tokenU);
    expect(me.status).toBe(200);
    expect(me.body.shop.city).toBe('Testnagar');
    expect(me.body.shop.area).toBe('Sector 5');
    expect(me.body.shop.latitude).toBe(12.34);
    expect(me.body.shop.longitude).toBe(56.78);
    expect(me.body.shop.is_listed).toBe(true);

    // Restore the unlisted state used by the rest of this suite.
    await pool.query(
      `UPDATE shops SET city = $1, latitude = NULL, longitude = NULL, is_listed = false WHERE id = $2`,
      [CITY, unlisted.id]
    );
  });

  it('rejects out-of-range coordinates', async () => {
    const bad = await withToken(request(app).patch('/api/shops/me'), tokenU)
      .send({ latitude: 999 });
    expect(bad.status).toBe(400);
  });

  // The owner Settings page sends null for blank location fields to clear them
  // and opt out of the geo directory — the schema must accept null, not 400.
  it('accepts null to clear location + opt out of discovery', async () => {
    await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: 'Tempcity', area: 'Tempsector', latitude: 10.1, longitude: 20.2, is_listed: true,
    });
    const patch = await withToken(request(app).patch('/api/shops/me'), tokenU).send({
      city: null, area: null, latitude: null, longitude: null, is_listed: false,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.shop.city).toBeNull();
    expect(patch.body.shop.latitude).toBeNull();
    expect(patch.body.shop.longitude).toBeNull();
    expect(patch.body.shop.is_listed).toBe(false);

    // Restore the unlisted-with-CITY state the rest of this suite relies on.
    await pool.query(
      `UPDATE shops SET city = $1, latitude = NULL, longitude = NULL, is_listed = false WHERE id = $2`,
      [CITY, unlisted.id]
    );
  });
});

describe('GET /public/shops', () => {
  it('lists only is_listed shops with correct active product_count', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedA.id);
    expect(ids).toContain(listedB.id);
    expect(ids).not.toContain(unlisted.id);

    const a = res.body.shops.find((s) => s.id === listedA.id);
    expect(a.product_count).toBe(2);
    // Minimal, non-sensitive fields only; no distance without lat/lng.
    // Fulfillment badge fields added: offers_pickup + offers_delivery + delivery_fee.
    expect(Object.keys(a).sort()).toEqual(
      ['area', 'city', 'delivery_fee', 'id', 'name', 'offers_delivery', 'offers_pickup', 'pincode', 'product_count', 'village']
    );
    expect(a.offers_pickup).toBe(true);
    expect(a.offers_delivery).toBe(false);
    expect(a.delivery_fee).toBe(0);
  });

  it('filters by search (name ILIKE)', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&search=DiscA`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedA.id);
    expect(ids).not.toContain(listedB.id);
  });

  it('filters by city', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}xyz`);
    expect(res.status).toBe(200);
    expect(res.body.shops).toHaveLength(0);
  });

  it('returns shops nearest-first with a plausible distance_km when lat/lng supplied', async () => {
    // Query point near shop A (Mumbai). Shop B (Delhi) is ~1100+ km away.
    const res = await request(app).get(`/api/public/shops?city=${CITY}&lat=19.0760&lng=72.8777`);
    expect(res.status).toBe(200);
    const seeded = res.body.shops.filter((s) => s.id === listedA.id || s.id === listedB.id);
    expect(seeded).toHaveLength(2);
    // Nearest first: A before B.
    expect(seeded[0].id).toBe(listedA.id);
    expect(seeded[1].id).toBe(listedB.id);
    expect(seeded[0].distance_km).toBeLessThan(5);
    expect(seeded[1].distance_km).toBeGreaterThan(1000);
  });

  it('clamps limit', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.shops).toHaveLength(1);
  });
});

describe('GET /public/shops?fulfillment (pickup/delivery filter)', () => {
  // A offers pickup only (default); B offers delivery only. This lets each
  // filter discriminate one seeded shop from the other.
  beforeAll(async () => {
    await pool.query(
      'UPDATE shops SET offers_pickup = true, offers_delivery = false WHERE id = $1',
      [listedA.id]
    );
    await pool.query(
      'UPDATE shops SET offers_pickup = false, offers_delivery = true WHERE id = $1',
      [listedB.id]
    );
  });

  it('returns offers_pickup in the shop object', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(res.status).toBe(200);
    const a = res.body.shops.find((s) => s.id === listedA.id);
    expect(a).toBeDefined();
    expect(a.offers_pickup).toBe(true);
  });

  it('fulfillment=pickup returns only shops that offer pickup', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&fulfillment=pickup`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedA.id);
    expect(ids).not.toContain(listedB.id);
    expect(res.body.shops.every((s) => s.offers_pickup === true)).toBe(true);
  });

  it('fulfillment=delivery returns only shops that offer delivery', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&fulfillment=delivery`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((s) => s.id);
    expect(ids).toContain(listedB.id);
    expect(ids).not.toContain(listedA.id);
    expect(res.body.shops.every((s) => s.offers_delivery === true)).toBe(true);
  });

  it('rejects an invalid fulfillment value with 400', async () => {
    const res = await request(app).get(`/api/public/shops?city=${CITY}&fulfillment=teleport`);
    expect(res.status).toBe(400);
  });
});

describe('GET /public/shops/:shopId', () => {
  it('returns a listed shop profile with active products only', async () => {
    const res = await request(app).get(`/api/public/shops/${listedA.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.id).toBe(listedA.id);
    expect(res.body.shop.name).toBe(listedA.name);
    expect(res.body.shop.city).toBe(CITY);
    expect(res.body.shop.area).toBe('Andheri');
    expect(res.body.shop.products).toHaveLength(2);
    const names = res.body.shop.products.map((p) => p.name).sort();
    expect(names).toEqual(['Atta', 'Rice']);
    // Product fields now include category/subcategory + variant metadata
    // (base_product/brand/pack) from the base catalog — all null for these
    // hand-entered, unlinked products.
    // search_text (the normalized all-language search blob) is now returned so
    // the in-shop client filter can match aliases/romanized/native tokens.
    expect(Object.keys(res.body.shop.products[0]).sort())
      .toEqual(['base_product', 'brand', 'category', 'description', 'id', 'image_url', 'name', 'pack', 'price', 'search_text', 'sold_by_weight', 'subcategory', 'unit']);
    expect(res.body.shop.products[0].category).toBeNull();
    expect(res.body.shop.products[0].subcategory).toBeNull();
    expect(res.body.shop.products[0].base_product).toBeNull();
    // No owner/sensitive fields leaked; fulfillment fields (M7) are exposed, plus
    // the shop cover image_url (batch IMG1 — null when no cover uploaded).
    expect(Object.keys(res.body.shop).sort()).toEqual([
      'area', 'city', 'delivery_fee', 'delivery_hours', 'delivery_min_order',
      'delivery_radius_km', 'free_delivery_min', 'id', 'image_url', 'name',
      'offers_delivery', 'offers_pickup', 'products',
    ]);
  });

  it('404s for an unlisted shop', async () => {
    const res = await request(app).get(`/api/public/shops/${unlisted.id}`);
    expect(res.status).toBe(404);
  });

  it('404s for an unknown shop', async () => {
    const res = await request(app).get('/api/public/shops/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /public/shops/:shopId — localized category_labels', () => {
  it('lang=hi returns a category_labels map localizing the shop categories', async () => {
    const res = await request(app).get(`/api/public/shops/${catShop.id}?lang=hi`);
    expect(res.status).toBe(200);
    expect(res.body.shop.category_labels).toBeDefined();
    // The category is localized to its catalog_i18n hi translation...
    expect(res.body.shop.category_labels[CATEGORY]).toBe(CATEGORY_HI);
    // ...while the per-product `category` stays the raw English FILTER KEY.
    expect(res.body.shop.products[0].category).toBe(CATEGORY);
  });

  it('en (and no lang) returns no localized category_labels', async () => {
    for (const url of [`/api/public/shops/${catShop.id}`, `/api/public/shops/${catShop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body.shop.category_labels).toBeUndefined();
    }
  });
});

describe('GET /public/shops/:shopId — localized product description', () => {
  it('lang=hi returns the localized description from catalog_i18n', async () => {
    const res = await request(app).get(`/api/public/shops/${saltShop.id}?lang=hi`);
    expect(res.status).toBe(200);
    const prod = res.body.shop.products.find((p) => p.name === SALT_NAME_HI);
    expect(prod).toBeDefined();
    // The product name is localized AND its description comes from catalog_i18n.
    expect(prod.description).toBe(SALT_HI_DESC);
  });

  it('en (and no lang) returns the raw English description', async () => {
    for (const url of [`/api/public/shops/${saltShop.id}`, `/api/public/shops/${saltShop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      const prod = res.body.shop.products.find((p) => p.name === SALT_TERM);
      expect(prod).toBeDefined();
      expect(prod.description).toBe(SALT_EN_DESC);
    }
  });
});

describe('GET /public/shops/:shopId — localized base_product (variant-group name)', () => {
  it('lang=hi localizes base_product from catalog_i18n', async () => {
    const res = await request(app).get(`/api/public/shops/${baseShop.id}?lang=hi`);
    expect(res.status).toBe(200);
    const prod = res.body.shop.products.find((p) => p.base_product === BASE_NAME_HI);
    expect(prod).toBeDefined();
    expect(prod.base_product).toBe(BASE_NAME_HI);
  });

  it('en (and no lang) returns the raw English base_product', async () => {
    for (const url of [`/api/public/shops/${baseShop.id}`, `/api/public/shops/${baseShop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      const prod = res.body.shop.products.find((p) => p.base_product === BASE_TERM);
      expect(prod).toBeDefined();
      expect(prod.base_product).toBe(BASE_TERM);
    }
  });
});

describe('GET /public/shops/:shopId — localized brand', () => {
  it('lang=hi localizes brand from catalog_i18n', async () => {
    const res = await request(app).get(`/api/public/shops/${brandShop.id}?lang=hi`);
    expect(res.status).toBe(200);
    const prod = res.body.shop.products.find((p) => p.brand === BRAND_NAME_HI);
    expect(prod).toBeDefined();
    expect(prod.brand).toBe(BRAND_NAME_HI);
  });

  it('en (and no lang) returns the raw English brand', async () => {
    for (const url of [`/api/public/shops/${brandShop.id}`, `/api/public/shops/${brandShop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      const prod = res.body.shop.products.find((p) => p.brand === BRAND_TERM);
      expect(prod).toBeDefined();
      expect(prod.brand).toBe(BRAND_TERM);
    }
  });
});

// Localized SHOP NAME (batch SHOPNAME): a shop_name_i18n hi row makes the shop's
// own name render in Hindi under ?lang=hi across getShop, listShops and
// searchProducts, while en / no-lang return the raw English name.
describe('localized shop name (shop_name_i18n)', () => {
  const SHOP_NAME_HI = 'डिस्को हिंदी स्टोर';

  beforeAll(async () => {
    // Set a KNOWN hi row for listedA (UPSERT overrides any auto-seeded one).
    await pool.query(
      `INSERT INTO shop_name_i18n (shop_id, lang, name, source, needs_review)
       VALUES ($1, 'hi', $2, 'owner', false)
       ON CONFLICT (shop_id, lang) DO UPDATE SET name = EXCLUDED.name, source = 'owner'`,
      [listedA.id, SHOP_NAME_HI]
    );
  });

  it('getShop?lang=hi returns the localized shop name; en/no-lang the English one', async () => {
    const hi = await request(app).get(`/api/public/shops/${listedA.id}?lang=hi`);
    expect(hi.status).toBe(200);
    expect(hi.body.shop.name).toBe(SHOP_NAME_HI);

    for (const url of [`/api/public/shops/${listedA.id}`, `/api/public/shops/${listedA.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body.shop.name).toBe(listedA.name);
    }
  });

  it('listShops?lang=hi localizes the shop name; en/no-lang the English one', async () => {
    const hi = await request(app).get(`/api/public/shops?city=${CITY}&lang=hi`);
    expect(hi.status).toBe(200);
    expect(hi.body.shops.find((s) => s.id === listedA.id).name).toBe(SHOP_NAME_HI);

    const en = await request(app).get(`/api/public/shops?city=${CITY}`);
    expect(en.status).toBe(200);
    expect(en.body.shops.find((s) => s.id === listedA.id).name).toBe(listedA.name);
  });

  it('searchProducts?lang=hi localizes shop_name; en/no-lang the English one', async () => {
    const hi = await request(app).get(`/api/public/products/search?q=Atta&lang=hi&city=${CITY}`);
    expect(hi.status).toBe(200);
    const hiHit = hi.body.products.find((p) => p.shop.id === listedA.id);
    expect(hiHit).toBeDefined();
    expect(hiHit.shop.name).toBe(SHOP_NAME_HI);

    const en = await request(app).get(`/api/public/products/search?q=Atta&city=${CITY}`);
    expect(en.status).toBe(200);
    const enHit = en.body.products.find((p) => p.shop.id === listedA.id);
    expect(enHit).toBeDefined();
    expect(enHit.shop.name).toBe(listedA.name);
  });
});

// Auto-seed on signup (batch SHOPNAME): registering a shop populates
// shop_name_i18n with 'auto' rows for the render languages. Assert at least the
// hi row exists and is non-empty.
describe('shop_name_i18n auto-seed on signup', () => {
  it('creates a non-empty hi row for a freshly registered shop', async () => {
    const uniq = `${Date.now()}`.slice(-9);
    const reg = await request(app).post('/api/auth/register').send({
      name: 'AutoSeed Owner',
      email: `autoseed_${uniq}@test.local`,
      phone: `+9198${uniq}`,
      password: 'password123',
      shopName: 'Sri Balaji General Stores',
    });
    expect(reg.status).toBe(201);
    const shopId = reg.body.shop.id;
    try {
      const rows = await pool.query(
        `SELECT lang, name, source FROM shop_name_i18n WHERE shop_id = $1 AND lang = 'hi'`,
        [shopId]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].name.length).toBeGreaterThan(0);
      expect(rows.rows[0].source).toBe('auto');
      // Deterministic hybrid rendering for this known name.
      expect(rows.rows[0].name).toBe('श्री बलजि जनरल स्टोर');
    } finally {
      await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
    }
  });
});
