// Integration tests for the localized owner catalogue (⑥ Owner catalogue in
// local language). Requires a real Postgres (DATABASE_URL) with ALL migrations
// applied (incl. 0019). Mirrors the style of catalog.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { importCatalogI18n } = require('../src/utils/import-catalog-i18n');

let tokenA; let shopA;

const seededItemIds = [];
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9198${uniq}`,
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
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     RETURNING *`,
    [
      fields.sku, fields.category, fields.subcategory, fields.product,
      fields.brand || null, fields.pack || null, fields.unit || null,
      fields.indicative_price || 0, fields.perishable || false,
    ]
  );
  seededItemIds.push(r.rows[0].id);
  return r.rows[0];
}

async function seedI18n(row) {
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET
       name = EXCLUDED.name, aliases = EXCLUDED.aliases, needs_review = EXCLUDED.needs_review`,
    [row.term_type, row.term_en, row.lang, row.name, row.aliases || '', row.needs_review || false]
  );
}

let tag; let riceItem; let dalItem;
// The Hindi name we seed for the rice product, and an alias to search by.
const RICE_HI = 'परीक्षण चावल';
const RICE_ALIAS = 'testchawal pariksha';

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('I18nA', uniq);
  tokenA = a.token; shopA = a.shop;

  tag = `TI${uniq}`; // unique prefix so search hits only our rows
  riceItem = await seedItem({
    sku: `${tag}-RICE`, category: `${tag} Food`, subcategory: `${tag} Rice`,
    product: `${tag} Sona Masuri Rice`, brand: 'India Gate', pack: '1 kg',
    unit: 'kg', indicative_price: 57500,
  });
  // A second product WITH NO translation row (English-fallback case).
  dalItem = await seedItem({
    sku: `${tag}-DAL`, category: `${tag} Food`, subcategory: `${tag} Rice`,
    product: `${tag} Toor Dal`, brand: 'Tata', pack: '1 kg',
    unit: 'kg', indicative_price: 16000,
  });

  // Localize the rice product + its category/subcategory into Hindi.
  await seedI18n({ term_type: 'product', term_en: `${tag} Sona Masuri Rice`, lang: 'hi', name: RICE_HI, aliases: RICE_ALIAS });
  await seedI18n({ term_type: 'category', term_en: `${tag} Food`, lang: 'hi', name: 'परीक्षण खाद्य' });
  await seedI18n({ term_type: 'subcategory', term_en: `${tag} Rice`, lang: 'hi', name: 'परीक्षण अनाज' });
});

afterAll(async () => {
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (seededItemIds.length) {
    await pool.query('DELETE FROM catalog_items WHERE id = ANY($1::uuid[])', [seededItemIds]);
  }
  await pool.query('DELETE FROM catalog_i18n WHERE term_en LIKE $1', [`${tag}%`]);
  await pool.end();
});

describe('GET /api/catalog?lang=hi — localized display', () => {
  it('returns product_local translated and display_name_local assembled', async () => {
    const res = await withToken(request(app).get(`/api/catalog?lang=hi&search=${tag} Sona`), tokenA);
    expect(res.status).toBe(200);
    const rice = res.body.items.find((i) => i.id === riceItem.id);
    expect(rice).toBeTruthy();
    expect(rice.product_local).toBe(RICE_HI);
    // Brand & pack stay English; only the product word is localized.
    expect(rice.display_name_local).toBe(`India Gate ${RICE_HI} 1 kg`);
    // English fields kept for back-compat.
    expect(rice.product).toBe(`${tag} Sona Masuri Rice`);
    expect(rice.display_name).toBe(`India Gate ${tag} Sona Masuri Rice 1 kg`);
  });

  it('falls back to English when no translation row exists', async () => {
    const res = await withToken(request(app).get(`/api/catalog?lang=hi&search=${tag} Toor`), tokenA);
    expect(res.status).toBe(200);
    const dal = res.body.items.find((i) => i.id === dalItem.id);
    expect(dal).toBeTruthy();
    expect(dal.product_local).toBe(`${tag} Toor Dal`); // English fallback
    expect(dal.display_name_local).toBe(`Tata ${tag} Toor Dal 1 kg`);
  });
});

describe('GET /api/catalog?lang=hi — multilingual search', () => {
  it('finds the item searching in Hindi', async () => {
    const res = await withToken(request(app).get(`/api/catalog?lang=hi&search=${encodeURIComponent('चावल')}`), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toContain(riceItem.id);
  });

  it('finds the item searching in English', async () => {
    const res = await withToken(request(app).get(`/api/catalog?lang=hi&search=${tag} Sona`), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toContain(riceItem.id);
  });

  it('finds the item searching by a romanized alias', async () => {
    const res = await withToken(request(app).get('/api/catalog?lang=hi&search=testchawal'), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.id)).toContain(riceItem.id);
  });
});

describe('GET /api/catalog — en regression (shape unchanged)', () => {
  it('omits the localized fields when lang=en or omitted', async () => {
    for (const url of [`/api/catalog?search=${tag} Sona`, `/api/catalog?lang=en&search=${tag} Sona`]) {
      const res = await withToken(request(app).get(url), tokenA);
      expect(res.status).toBe(200);
      const rice = res.body.items.find((i) => i.id === riceItem.id);
      expect(rice).toBeTruthy();
      expect(rice).not.toHaveProperty('product_local');
      expect(rice).not.toHaveProperty('display_name_local');
      expect(rice.display_name).toBe(`India Gate ${tag} Sona Masuri Rice 1 kg`);
    }
  });

  it('rejects an unknown lang (400)', async () => {
    const res = await withToken(request(app).get('/api/catalog?lang=zz'), tokenA);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/catalog/categories?lang=hi', () => {
  it('localizes labels but keeps the English keys', async () => {
    const res = await withToken(request(app).get('/api/catalog/categories?lang=hi'), tokenA);
    expect(res.status).toBe(200);
    const food = res.body.categories.find((c) => c.category === `${tag} Food`);
    expect(food).toBeTruthy();
    expect(food.category).toBe(`${tag} Food`); // English key preserved
    expect(food.category_local).toBe('परीक्षण खाद्य'); // localized label
    const sub = food.subcategories.find((s) => s.name === `${tag} Rice`);
    expect(sub).toBeTruthy();
    expect(sub.name).toBe(`${tag} Rice`); // English key preserved
    expect(sub.name_local).toBe('परीक्षण अनाज');
  });

  it('en response omits *_local (shape unchanged)', async () => {
    const res = await withToken(request(app).get('/api/catalog/categories'), tokenA);
    expect(res.status).toBe(200);
    const food = res.body.categories.find((c) => c.category === `${tag} Food`);
    expect(food).toBeTruthy();
    expect(food).not.toHaveProperty('category_local');
    expect(food.subcategories[0]).not.toHaveProperty('name_local');
  });
});

describe('import-catalog-i18n idempotency', () => {
  it('upserts translation rows idempotently (stable counts, no dupes)', async () => {
    const fixture = [
      {
        term_type: 'product', term_en: `${tag} Import Rice`,
        translations: {
          hi: { name: 'आयात चावल', aliases: 'aayat', needs_review: false },
          ta: { name: 'இறக்குமதி அரிசி', aliases: '', needs_review: false },
        },
      },
      {
        term_type: 'category', term_en: `${tag} Import Cat`,
        translations: { hi: { name: 'आयात श्रेणी', aliases: '', needs_review: true } },
      },
    ];

    const first = await importCatalogI18n({ rows: fixture });
    expect(first.upserted).toBe(3); // 2 hi + 1 ta + ... = hi,ta for product + hi for category = 3

    const countAfterFirst = await pool.query(
      'SELECT COUNT(*)::int AS n FROM catalog_i18n WHERE term_en LIKE $1', [`${tag} Import%`]
    );
    expect(countAfterFirst.rows[0].n).toBe(3);

    // Re-run with a changed name — should UPDATE in place, not duplicate.
    fixture[0].translations.hi.name = 'आयात चावल २';
    const second = await importCatalogI18n({ rows: fixture });
    expect(second.upserted).toBe(3);

    const countAfterSecond = await pool.query(
      'SELECT COUNT(*)::int AS n FROM catalog_i18n WHERE term_en LIKE $1', [`${tag} Import%`]
    );
    expect(countAfterSecond.rows[0].n).toBe(3); // still 3, no dupes

    const updated = await pool.query(
      "SELECT name FROM catalog_i18n WHERE term_type='product' AND term_en=$1 AND lang='hi'",
      [`${tag} Import Rice`]
    );
    expect(updated.rows[0].name).toBe('आयात चावल २');

    await pool.query('DELETE FROM catalog_i18n WHERE term_en LIKE $1', [`${tag} Import%`]);
  });
});
