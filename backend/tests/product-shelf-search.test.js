// Integration tests for the SHELF filter on cross-shop product search.
//
// The consumer apps' category chips used to be keywords: "Dairy" ran a text
// search for `milk` and reached 14 of the catalogue's 44 Dairy SKUs. The chip
// now names a shelf — a closed allowlist of real catalog_items category /
// subcategory values (src/utils/catalog-shelves.js) — and `q` is no longer
// required when a shelf is given.
//
// Needs a real Postgres (DATABASE_URL) with all migrations applied. Mirrors the
// setup style of product-search.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { SHELF_KEYS, shelfScope } = require('../src/utils/catalog-shelves');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

let tag;
let shop; let token;
// One product per shelf-relevant catalogue value, plus a shop-typed product
// with NO catalogue link at all.
const ids = {};
let catalogIds = [];

async function addProduct(name, price) {
  const r = await withToken(request(app).post('/api/products'), token)
    .send({ name, price, unit: 'kg' });
  expect(r.status).toBe(201);
  return r.body.product.id;
}

// Create a catalogue item on a REAL shelf value and link a product to it.
async function linkCatalogue(productId, category, subcategory, product) {
  const ci = await pool.query(
    `INSERT INTO catalog_items (category, subcategory, product, unit, indicative_price, is_global)
     VALUES ($1, $2, $3, 'kg', 1000, true) RETURNING id`,
    [category, subcategory, product]
  );
  catalogIds.push(ci.rows[0].id);
  await pool.query('UPDATE products SET catalog_item_id = $1 WHERE id = $2', [ci.rows[0].id, productId]);
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  tag = `SH${uniq}`;

  const reg = await request(app).post('/api/auth/register').send({
    name: 'Shelf Owner',
    email: `shelf_${uniq}@test.local`,
    phone: `+9197${uniq}`,
    password: 'password123',
    shopName: `Shelf Shop ${uniq}`,
  });
  expect(reg.status).toBe(201);
  shop = reg.body.shop;
  token = reg.body.token;
  await pool.query("UPDATE shops SET city = 'Nashik', is_listed = true WHERE id = $1", [shop.id]);

  // Each of these sits on a DIFFERENT real shelf. None of their names contains
  // the other's shelf word, so nothing here can pass by keyword accident.
  ids.haldi = await addProduct(`${tag} Haldi Powder`, 4000);
  await linkCatalogue(ids.haldi, 'Food', 'Spices', `${tag} Haldi Powder`);

  ids.toor = await addProduct(`${tag} Toor Dal`, 12000);
  await linkCatalogue(ids.toor, 'Food', 'Dal & Pulses', `${tag} Toor Dal`);

  ids.bajra = await addProduct(`${tag} Bajra`, 5000);
  await linkCatalogue(ids.bajra, 'Food', 'Millets', `${tag} Bajra`);

  ids.atta = await addProduct(`${tag} Chakki Atta`, 26000);
  await linkCatalogue(ids.atta, 'Food', 'Wheat & Flour', `${tag} Chakki Atta`);

  ids.ghee = await addProduct(`${tag} Vanaspati`, 18000);
  await linkCatalogue(ids.ghee, 'Food', 'Cooking Fats', `${tag} Vanaspati`);

  ids.coil = await addProduct(`${tag} Mosquito Coil`, 3000);
  await linkCatalogue(ids.coil, 'Household', 'Pest Control', `${tag} Mosquito Coil`);

  ids.paste = await addProduct(`${tag} Toothpaste`, 6000);
  await linkCatalogue(ids.paste, 'Personal Care', 'Oral Care', `${tag} Toothpaste`);

  // Hand-entered, no catalogue link: on NO shelf, by design.
  ids.loose = await addProduct(`${tag} Loose Haldi`, 2000);
}, 30000);

afterAll(async () => {
  if (shop) await pool.query('DELETE FROM shops WHERE id = $1', [shop.id]);
  if (catalogIds.length) {
    await pool.query('DELETE FROM catalog_items WHERE id = ANY($1::uuid[])', [catalogIds]);
  }
  await pool.end();
});

// Only this suite's own rows, whatever else lives in the shared test DB.
const mine = (body) => body.products.filter((p) => p.name.startsWith(tag));

describe('GET /api/public/products/search?category=', () => {
  it('filters by a REAL catalogue shelf with no q at all', async () => {
    const res = await request(app).get('/api/public/products/search?category=spices&limit=50');
    expect(res.status).toBe(200);
    const names = mine(res.body).map((p) => p.name);
    expect(names).toEqual([`${tag} Haldi Powder`]);
  });

  it('a shelf spanning several subcategories returns all of them', async () => {
    // atta-rice = Wheat & Flour + Rice + Grains + Millets. Bajra is a millet and
    // the word "rice" appears nowhere in either name — the keyword chip this
    // replaces (`q=rice`) could never have found them.
    const res = await request(app).get('/api/public/products/search?category=atta-rice&limit=50');
    expect(res.status).toBe(200);
    expect(mine(res.body).map((p) => p.name).sort())
      .toEqual([`${tag} Bajra`, `${tag} Chakki Atta`]);

    // cooking-oils folds Cooking Fats in beside Cooking Oils for the same reason.
    const oils = await request(app).get('/api/public/products/search?category=cooking-oils&limit=50');
    expect(oils.status).toBe(200);
    expect(mine(oils.body).map((p) => p.name)).toEqual([`${tag} Vanaspati`]);
  });

  it('a shelf defined by top-level category covers its whole department', async () => {
    const res = await request(app).get('/api/public/products/search?category=household&limit=50');
    expect(res.status).toBe(200);
    expect(mine(res.body).map((p) => p.name)).toEqual([`${tag} Mosquito Coil`]);

    const pc = await request(app).get('/api/public/products/search?category=personal-care&limit=50');
    expect(pc.status).toBe(200);
    expect(mine(pc.body).map((p) => p.name)).toEqual([`${tag} Toothpaste`]);
  });

  it('never returns a product from another shelf', async () => {
    const res = await request(app).get('/api/public/products/search?category=dal-pulses&limit=50');
    expect(res.status).toBe(200);
    const names = mine(res.body).map((p) => p.name);
    expect(names).toEqual([`${tag} Toor Dal`]);
    expect(names).not.toContain(`${tag} Haldi Powder`);
  });

  it('leaves a product with no catalogue link off every shelf', async () => {
    for (const key of SHELF_KEYS) {
      const res = await request(app).get(`/api/public/products/search?category=${key}&limit=50`);
      expect(res.status).toBe(200);
      expect(mine(res.body).map((p) => p.name)).not.toContain(`${tag} Loose Haldi`);
    }
    // It is still findable by name — it is off the SHELF, not out of the app.
    const byName = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent(`${tag} Loose Haldi`)}`
    );
    expect(byName.status).toBe(200);
    expect(mine(byName.body).map((p) => p.name)).toContain(`${tag} Loose Haldi`);
  });

  it('narrows the shelf when q is supplied as well', async () => {
    const hit = await request(app).get(
      '/api/public/products/search?category=spices&q=Haldi&limit=50'
    );
    expect(hit.status).toBe(200);
    expect(mine(hit.body).map((p) => p.name)).toEqual([`${tag} Haldi Powder`]);

    // The same word, the wrong shelf: nothing, rather than the spice.
    const miss = await request(app).get(
      '/api/public/products/search?category=dal-pulses&q=Haldi&limit=50'
    );
    expect(miss.status).toBe(200);
    expect(mine(miss.body)).toHaveLength(0);
  });

  it('rejects a shelf key that is not on the allowlist, and free text', async () => {
    // The allowlisted key answers 200 with no `q` — asserted HERE as well as in
    // its own test, so this one cannot pass on a server that simply ignores
    // `category` and 400s everything for want of a `q`.
    const good = await request(app).get('/api/public/products/search?category=spices');
    expect(good.status).toBe(200);

    for (const bad of ['Spices', 'spices; DROP TABLE products', 'Food', 'made-up']) {
      const res = await request(app).get(
        `/api/public/products/search?category=${encodeURIComponent(bad)}`
      );
      expect(res.status).toBe(400);
    }
  });

  it('still requires SOMETHING to search for', async () => {
    const res = await request(app).get('/api/public/products/search');
    expect(res.status).toBe(400);
  });

  it('does not leak an unlisted or suspended shop through a shelf', async () => {
    await pool.query('UPDATE shops SET is_listed = false WHERE id = $1', [shop.id]);
    const unlisted = await request(app).get('/api/public/products/search?category=spices&limit=50');
    expect(mine(unlisted.body)).toHaveLength(0);

    await pool.query("UPDATE shops SET is_listed = true, status = 'suspended' WHERE id = $1", [shop.id]);
    const suspended = await request(app).get('/api/public/products/search?category=spices&limit=50');
    expect(mine(suspended.body)).toHaveLength(0);

    await pool.query("UPDATE shops SET status = 'active' WHERE id = $1", [shop.id]);
    const back = await request(app).get('/api/public/products/search?category=spices&limit=50');
    expect(mine(back.body)).toHaveLength(1);
  });

  it('still honours the city filter, with a shelf and without one', async () => {
    // Regression control, and not a theoretical one: this endpoint's `city`
    // filter had NO test, and rebuilding the WHERE clause for the shelf filter
    // dropped it outright without a single suite noticing.
    const right = await request(app).get('/api/public/products/search?category=spices&city=Nashik&limit=50');
    expect(mine(right.body)).toHaveLength(1);
    const wrong = await request(app).get('/api/public/products/search?category=spices&city=Kochi&limit=50');
    expect(mine(wrong.body)).toHaveLength(0);

    const byWord = await request(app).get(
      `/api/public/products/search?q=${encodeURIComponent(tag)}&city=Kochi&limit=50`
    );
    expect(mine(byWord.body)).toHaveLength(0);
  });

  it('a query of pure punctuation answers empty instead of 500ing', async () => {
    // normalizeQuery('???') yields no tokens, which used to leave the ORDER BY
    // as `false DESC, 0 DESC, name ASC` — and Postgres reads the bare 0 as a
    // column position, so the endpoint answered 500.
    const res = await request(app).get('/api/public/products/search?q=%3F%3F%3F');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
  });
});

describe('the shelf allowlist itself', () => {
  it('names only values the shipped catalogue actually uses', () => {
    const seed = require('../src/data/catalog-seed.json');
    const cats = new Set(seed.map((s) => s.category));
    const subs = new Set(seed.map((s) => s.subcategory));
    expect(SHELF_KEYS.length).toBeGreaterThan(0);
    for (const key of SHELF_KEYS) {
      const scope = shelfScope(key);
      expect(scope.categories.length + scope.subcategories.length).toBeGreaterThan(0);
      scope.categories.forEach((c) => expect(cats.has(c)).toBe(true));
      scope.subcategories.forEach((s) => expect(subs.has(s)).toBe(true));
    }
  });

  it('answers an unknown key with an empty scope rather than throwing', () => {
    expect(shelfScope('nope')).toEqual({ categories: [], subcategories: [] });
    expect(shelfScope(undefined)).toEqual({ categories: [], subcategories: [] });
  });
});
