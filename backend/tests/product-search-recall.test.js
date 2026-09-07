// Cross-language product-recall tests (NLQ-A). Proves the consumer search
// endpoint GET /api/public/products/search finds the SAME product whether the
// shopper types English, native script, a romanization, a mixed string, or a
// noisy speech-to-text guess — driven by products.search_text (the normalized
// all-language blob) + pg_trgm fuzzy matching. Requires a real Postgres
// (DATABASE_URL) with ALL migrations applied (incl. 0038 → pg_trgm + search_text).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { refreshProductSearchText } = require('../src/utils/refresh-search-text');

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

let listed; let token;
let saltId;      // the master "Tata Salt" product, catalog-linked with hi i18n
let decoyId;     // a fuzzy-only "Rock Salt Powder" (unlinked) used for ranking
let catalogItemId;

const NAMAK = 'नमक';       // hi native script for salt
const TATA_HI = 'टाटा नमक'; // "Tata salt" in native script (brand not translated)

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9196${uniq}`,
    password: 'password123',
    shopName: `${prefix} Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const l = await register('REC', uniq);
  listed = l.shop; token = l.token;

  await pool.query('UPDATE shops SET city = $1, is_listed = true WHERE id = $2', ['Recall City', listed.id]);

  // Master catalog item: structured brand/product/pack/unit already exist here.
  const ci = await pool.query(
    `INSERT INTO catalog_items (category, subcategory, product, brand, pack, unit, indicative_price, is_global)
     VALUES ('Grocery','Salt & Sugar','Salt','Tata','1 kg','kg',5000,true)
     RETURNING id`
  );
  catalogItemId = ci.rows[0].id;

  // hi translation for the base term 'Salt': native name + romanized aliases.
  await pool.query(
    `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
     VALUES ('product','Salt','hi',$1,'namak namak-1kg',false)
     ON CONFLICT (term_type, term_en, lang) DO UPDATE SET name = EXCLUDED.name, aliases = EXCLUDED.aliases`,
    [NAMAK]
  );

  // The listed shop's product, linked to the master item. Seeded AFTER migrate,
  // so we compute its search_text explicitly via the write-path helper (this is
  // exactly what product.create / catalog.select do live).
  const p = await pool.query(
    `INSERT INTO products (shop_id, name, price, unit, is_active, catalog_item_id)
     VALUES ($1,'Tata Salt 1kg',5000,'kg',true,$2) RETURNING id`,
    [listed.id, catalogItemId]
  );
  saltId = p.rows[0].id;
  await refreshProductSearchText(pool, saltId);

  // A fuzzy-only decoy in the same shop: shares the token "salt" but is NOT the
  // exact phrase and has no native/alias data — used to prove exact/alias ranks
  // at/above fuzzy-only.
  const decoy = await withToken(request(app).post('/api/products'), token)
    .send({ name: 'Rock Salt Powder', price: 3000, unit: 'kg' });
  expect(decoy.status).toBe(201);
  decoyId = decoy.body.product.id;
}, 30000);

afterAll(async () => {
  if (listed) await pool.query('DELETE FROM shops WHERE id = $1', [listed.id]);
  if (catalogItemId) await pool.query('DELETE FROM catalog_items WHERE id = $1', [catalogItemId]);
  await pool.query("DELETE FROM catalog_i18n WHERE term_en = 'Salt' AND lang = 'hi'");
  await pool.end();
});

const search = (q, extra = '') =>
  request(app).get(`/api/public/products/search?q=${encodeURIComponent(q)}${extra}`);

describe('cross-language product recall (GET /api/public/products/search)', () => {
  // The SAME product must surface for every way a shopper might type it.
  const recallCases = [
    ['English',                 'Tata Salt 1kg'],
    ['native script',           NAMAK],
    ['native brand+word',       TATA_HI],
    ['romanized+spoken',        'tata namak 1 kilo'],
    ['mixed script/latin',      'tata namak 1kg'],
    ['noisy ASR (trgm)',        'data salt'],
    // Single-word typos with NO correct token — recovered by pg_trgm word
    // similarity (qn <% search_text), not by substring/token matching.
    ['single-word typo (salt)', 'saltt'],
    ['single-word typo (namak)','namk'],
    ['single-word typo (namak)','namaak'],
  ];

  it.each(recallCases)('finds the same product via %s query', async (_label, q) => {
    const res = await search(q);
    expect(res.status).toBe(200);
    const ids = res.body.products.map((p) => p.id);
    expect(ids).toContain(saltId);
  });

  it('ranks the exact/alias match at or above a fuzzy-only match', async () => {
    const res = await search('Tata Salt 1kg');
    expect(res.status).toBe(200);
    const ids = res.body.products.map((p) => p.id);
    // Exact whole-phrase match ranks first...
    expect(ids[0]).toBe(saltId);
    // ...above the fuzzy-only decoy, which is only recalled via the "salt" token.
    expect(ids).toContain(decoyId);
    expect(ids.indexOf(saltId)).toBeLessThan(ids.indexOf(decoyId));
  });

  it('recalls via a pure alias (romanized) with no decoy noise', async () => {
    const res = await search('namak');
    expect(res.status).toBe(200);
    const ids = res.body.products.map((p) => p.id);
    expect(ids).toContain(saltId);
    // The decoy has no native/alias data, so an alias query does not recall it.
    expect(ids).not.toContain(decoyId);
  });

  it('still matches a native query when lang=hi is requested', async () => {
    // Matching is over search_text (all-language blob), so the native term hits
    // regardless of the requested display language. searchProducts localizes the
    // DISPLAY name via the existing term_en = p.name join; this product's name is
    // not itself a master term, so it displays as the stored English name — the
    // recall (finding the product) is what matters here.
    const res = await search(NAMAK, '&lang=hi');
    expect(res.status).toBe(200);
    const hit = res.body.products.find((p) => p.id === saltId);
    expect(hit).toBeTruthy();
  });

  it('returns [] for clearly-unrelated queries (word-similarity does not over-match)', async () => {
    for (const q of ['zzqwx bicycle chain lubricant', 'xylophone', 'helicopter']) {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
    }
  });
});
