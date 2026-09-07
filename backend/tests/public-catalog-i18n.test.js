// Integration tests for the LOCALIZED consumer catalogue (⑥). Both public
// consumer paths — GET /public/catalog/:shopId (product.controller.publicCatalog)
// and GET /public/shops/:shopId (discovery.controller.getShop) — take an optional
// ?lang= and, when lang != en, LEFT JOIN catalog_i18n on the stored English
// product name (COALESCE(cp.name, products.name) AS name), with English fallback.
// Requires a real Postgres (DATABASE_URL) with ALL migrations applied (incl.
// 0019). Mirrors the style of discovery.test.js / catalog-i18n.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

let token; let shop; let tag;
let ricePid; let dalPid;
const RICE_HI = 'परीक्षण चावल';

async function register(uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: 'ConsI18n Owner',
    email: `consi18n_${uniq}@test.local`,
    phone: `+9197${uniq}`,
    password: 'password123',
    shopName: `ConsI18n Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  tag = `CI${uniq}`;
  const a = await register(uniq);
  token = a.token; shop = a.shop;

  // List the shop so both public endpoints return it.
  await pool.query('UPDATE shops SET is_listed = true WHERE id = $1', [shop.id]);

  // A product whose English name equals a catalog_i18n product term_en (WITH a
  // hi translation), and one with NO translation (English-fallback case).
  const rice = await withToken(request(app).post('/api/products'), token)
    .send({ name: `${tag} Localized Rice`, price: 5000, unit: 'kg' });
  expect(rice.status).toBe(201);
  ricePid = rice.body.product.id;

  const dal = await withToken(request(app).post('/api/products'), token)
    .send({ name: `${tag} Plain Dal`, price: 6000, unit: 'kg' });
  expect(dal.status).toBe(201);
  dalPid = dal.body.product.id;

  // Master translation for the rice product only.
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('product', $1, 'hi', $2, '', false)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`,
    [`${tag} Localized Rice`, RICE_HI]
  );
}, 30000);

afterAll(async () => {
  if (shop) await pool.query('DELETE FROM shops WHERE id = $1', [shop.id]);
  await pool.query('DELETE FROM catalog_i18n WHERE term_en LIKE $1', [`${tag}%`]);
  await pool.end();
});

describe('GET /api/public/catalog/:shopId — localized names', () => {
  it('lang=hi returns the localized name; untranslated product falls back to English', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=hi`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.products.map((p) => [p.id, p]));
    expect(byId[ricePid].name).toBe(RICE_HI);
    expect(byId[dalPid].name).toBe(`${tag} Plain Dal`); // English fallback
    // search_text (the normalized all-language search blob) is now returned so
    // the in-shop client filter can match aliases/romanized/native tokens.
    expect(Object.keys(byId[ricePid]).sort())
      .toEqual(['description', 'id', 'image_url', 'name', 'price', 'search_text', 'unit']);
  });

  it('lang=en and no lang return the raw English name', async () => {
    for (const url of [`/api/public/catalog/${shop.id}`, `/api/public/catalog/${shop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      const rice = res.body.products.find((p) => p.id === ricePid);
      expect(rice.name).toBe(`${tag} Localized Rice`);
    }
  });

  it('an unknown lang falls back to raw (no error)', async () => {
    const res = await request(app).get(`/api/public/catalog/${shop.id}?lang=zz`);
    expect(res.status).toBe(200);
    const rice = res.body.products.find((p) => p.id === ricePid);
    expect(rice.name).toBe(`${tag} Localized Rice`);
  });
});

describe('GET /api/public/shops/:shopId — localized names', () => {
  it('lang=hi localizes the product name; untranslated falls back; shape unchanged', async () => {
    const res = await request(app).get(`/api/public/shops/${shop.id}?lang=hi`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.shop.products.map((p) => [p.id, p]));
    expect(byId[ricePid].name).toBe(RICE_HI);
    expect(byId[dalPid].name).toBe(`${tag} Plain Dal`);
    // Same public product keys as the en path (base_product/brand/pack null here),
    // plus search_text (the normalized all-language search blob) for the in-shop
    // client filter.
    expect(Object.keys(byId[ricePid]).sort()).toEqual(
      ['base_product', 'brand', 'category', 'description', 'id', 'image_url', 'name', 'pack', 'price', 'search_text', 'sold_by_weight', 'subcategory', 'unit']
    );
  });

  it('lang=en and no lang return the raw English name', async () => {
    for (const url of [`/api/public/shops/${shop.id}`, `/api/public/shops/${shop.id}?lang=en`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      const rice = res.body.shop.products.find((p) => p.id === ricePid);
      expect(rice.name).toBe(`${tag} Localized Rice`);
    }
  });
});
