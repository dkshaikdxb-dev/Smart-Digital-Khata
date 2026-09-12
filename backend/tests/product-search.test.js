// Integration tests for cross-shop product search (PSEARCH).
// GET /api/public/products/search finds ACTIVE products in LISTED shops whose
// (localized or base English) name matches `q`. Requires a real Postgres
// (DATABASE_URL) with ALL migrations applied (incl. catalog_i18n). Mirrors the
// style of discovery.test.js / public-catalog-i18n.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { refreshProductSearchText } = require('../src/utils/refresh-search-text');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

// A tag unique to this run so the search terms only ever match our seeded rows,
// isolating them from any other products in the shared test DB.
let tag;
let listed; let tokenL;
let unlisted; let tokenU;
let riceId;
const RICE_HI = 'चावल'; // localized fragment used for the lang=hi test

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9198${uniq}`,
    password: 'password123',
    shopName: `${prefix} Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  tag = `PS${uniq}`;

  const l = await register('PSL', uniq);
  const u = await register('PSU', `${uniq}1`.slice(-9));
  listed = l.shop; tokenL = l.token;
  unlisted = u.shop; tokenU = u.token;

  // Listed shop near Mumbai; unlisted shop opts out.
  await pool.query(
    `UPDATE shops SET city = 'Mumbai', area = 'Andheri', latitude = 19.08, longitude = 72.88, is_listed = true WHERE id = $1`,
    [listed.id]
  );
  await pool.query('UPDATE shops SET is_listed = false WHERE id = $1', [unlisted.id]);

  // Listed shop: 1 active Rice + 1 active Sugar + 1 INACTIVE rice-like product.
  const rice = await withToken(request(app).post('/api/products'), tokenL)
    .send({ name: `${tag} Rice`, price: 5000, unit: 'kg' });
  expect(rice.status).toBe(201);
  riceId = rice.body.product.id;

  await withToken(request(app).post('/api/products'), tokenL)
    .send({ name: `${tag} Sugar`, price: 4000, unit: 'kg' });

  const inactive = await withToken(request(app).post('/api/products'), tokenL)
    .send({ name: `${tag} Discontinued`, price: 9000, unit: 'kg' });
  await withToken(request(app).patch(`/api/products/${inactive.body.product.id}`), tokenL)
    .send({ is_active: false });

  // Unlisted shop has an active Rice too — it must NEVER surface.
  await withToken(request(app).post('/api/products'), tokenU)
    .send({ name: `${tag} Rice`, price: 5500, unit: 'kg' });

  // Master catalog item + hi translation for the listed Rice. Search now matches
  // over products.search_text (the normalized all-language blob), so the native
  // term must be folded into that blob: link the product to a catalog_items row
  // whose English `product` term carries the hi translation, then recompute
  // search_text via the same helper the write path uses.
  const ci = await pool.query(
    `INSERT INTO catalog_items (product, unit, indicative_price, is_global)
     VALUES ($1, 'kg', 5000, true) RETURNING id`,
    [`${tag} Rice`]
  );
  const catalogItemId = ci.rows[0].id;
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('product', $1, 'hi', $2, '', false)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name`,
    [`${tag} Rice`, `${tag} ${RICE_HI}`]
  );
  await pool.query('UPDATE products SET catalog_item_id = $1 WHERE id = $2', [catalogItemId, riceId]);
  await refreshProductSearchText(pool, riceId);
}, 30000);

afterAll(async () => {
  for (const s of [listed, unlisted]) {
    if (s) await pool.query('DELETE FROM shops WHERE id = $1', [s.id]);
  }
  await pool.query('DELETE FROM catalog_i18n WHERE term_en LIKE $1', [`${tag}%`]);
  await pool.query('DELETE FROM catalog_items WHERE product LIKE $1', [`${tag}%`]);
  await pool.end();
});

describe('GET /api/public/products/search', () => {
  it('returns active products from listed shops with their shop, excluding inactive + unlisted', async () => {
    const res = await request(app).get(`/api/public/products/search?q=${encodeURIComponent(tag)}`);
    expect(res.status).toBe(200);
    // Only the listed shop's 2 ACTIVE products (Rice + Sugar). The inactive
    // product and the unlisted shop's Rice are excluded.
    expect(res.body.products).toHaveLength(2);
    const names = res.body.products.map((p) => p.name).sort();
    expect(names).toEqual([`${tag} Rice`, `${tag} Sugar`]);
    for (const p of res.body.products) {
      expect(p.shop.id).toBe(listed.id);
      expect(typeof p.price).toBe('number');
      expect(p.shop.distance_km).toBeUndefined(); // no lat/lng supplied
    }
  });

  it('matches the base name and returns the product with its shop + paise price', async () => {
    // The exact-phrase query recalls the shop's tag-sharing products (Rice +
    // Sugar), but the exact whole-phrase match (Rice) ranks first.
    const res = await request(app).get(`/api/public/products/search?q=${encodeURIComponent(`${tag} Rice`)}`);
    expect(res.status).toBe(200);
    const p = res.body.products[0];
    expect(p.id).toBe(riceId); // exact/alias ranked at top
    expect(p.name).toBe(`${tag} Rice`);
    expect(p.price).toBe(5000); // integer paise, Number
    expect(p.unit).toBe('kg');
    expect(p.shop.id).toBe(listed.id);
    expect(p.shop.city).toBe('Mumbai');
    expect(p.shop.area).toBe('Andheri');
    expect(p.shop.offers_delivery).toBe(false);
    expect(p.shop.delivery_fee).toBe(0);
    // Minimal, non-sensitive product + shop shape (search_text is NOT exposed on
    // the cross-shop search response — only on the in-shop catalog paths).
    expect(Object.keys(p).sort()).toEqual(
      ['id', 'image_url', 'name', 'price', 'shop', 'sold_by_weight', 'unit']
    );
    // The nested shop is a payload a consumer SEES, so it carries the same
    // `availability` object (batch A) as the directory and the storefront.
    expect(Object.keys(p.shop).sort()).toEqual(
      ['area', 'availability', 'city', 'delivery_fee', 'id', 'name', 'offers_delivery']
    );
    expect(p.shop.availability).toEqual({ open: true, reason: null, reopens_at: null });
  });

  it('matches a native-script term via search_text and localizes the name under lang=hi', async () => {
    // The native term चावल is folded into the linked product's search_text, so it
    // matches on BOTH the base and hi paths (search is language-agnostic). Under
    // lang=hi the DISPLAY name is localized.
    const hi = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent(`${tag} ${RICE_HI}`)}&lang=hi`
    );
    expect(hi.status).toBe(200);
    expect(hi.body.products[0].id).toBe(riceId); // exact native phrase ranks first
    expect(hi.body.products[0].name).toBe(`${tag} ${RICE_HI}`); // localized name returned

    // The base (en) path still MATCHES the product (search_text carries चावल),
    // but returns the stored English display name.
    const base = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent(`${tag} ${RICE_HI}`)}`
    );
    expect(base.status).toBe(200);
    expect(base.body.products[0].id).toBe(riceId);
    expect(base.body.products[0].name).toBe(`${tag} Rice`);
  });

  it('sorts nearest-first with a plausible distance_km when lat/lng supplied', async () => {
    const res = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent(`${tag} Rice`)}&lat=19.0760&lng=72.8777`
    );
    expect(res.status).toBe(200);
    const rice = res.body.products.find((p) => p.id === riceId);
    expect(rice).toBeTruthy();
    expect(rice.shop.distance_km).toBeLessThan(5);
  });

  it('returns [] for a non-matching q', async () => {
    const res = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent('bicycle chain lubricant xyz')}`
    );
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('400s when q is missing', async () => {
    const res = await request(app).get('/api/public/products/search');
    expect(res.status).toBe(400);
  });
});
