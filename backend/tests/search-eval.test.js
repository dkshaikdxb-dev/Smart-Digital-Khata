// Multilingual Native-Language Search EVALUATION (HARDEN-EVAL).
//
// This is a MEASUREMENT harness, not a behaviour change: it seeds a small real
// catalog (backend/tests/fixtures/search-eval-set.js) into the socket-Postgres
// harness — catalog_items + catalog_i18n + one listed shop + linked products,
// with products.search_text populated via the live write-path helper
// refreshProductSearchText — then replays every labelled QUERY through the
// DEPLOYED consumer endpoint GET /api/public/products/search and computes
// Recall@1, Recall@5, per-category Recall, and negativeReject. It prints a
// compact table and asserts regression-guard floors picked from the MEASURED
// numbers. No AI/ML, no new dependency, no GPU/vector/semantic/NMT — pure
// deterministic string/Postgres recall. Requires a real Postgres (DATABASE_URL)
// with ALL migrations applied (incl. 0038 → pg_trgm + search_text).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { refreshProductSearchText } = require('../src/utils/refresh-search-text');
const { CATALOG, QUERIES, CATEGORIES } = require('./fixtures/search-eval-set');

// key -> seeded products.id, filled during seeding; the eval matches recall by
// this stable product id (never by display name, which localization can change).
const productIdByKey = {};
let listed;
let catalogItemIds = [];

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9195${uniq}`,
    password: 'password123',
    shopName: `${prefix} Shop ${uniq}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const l = await register('EVAL', uniq);
  listed = l.shop;

  // A single listed shop hosts the whole eval catalog (mirrors the recall
  // harness: is_listed gates public search visibility).
  await pool.query('UPDATE shops SET city = $1, is_listed = true WHERE id = $2', ['Eval City', listed.id]);

  for (const item of CATALOG) {
    // Master catalog item: structured product/brand/pack/unit.
    const ci = await pool.query(
      `INSERT INTO catalog_items (category, subcategory, product, brand, pack, unit, indicative_price, is_global)
       VALUES ('Grocery', $1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [item.term_en, item.term_en, item.brand, item.pack, item.unit, item.price]
    );
    const catalogItemId = ci.rows[0].id;
    catalogItemIds.push(catalogItemId);

    // Per-language i18n for the base term: native name + romanized aliases. The
    // PK is (term_type, term_en, lang); term_en === catalog_items.product so
    // refreshProductSearchText folds these into the product's search_text.
    for (const lang of Object.keys(item.i18n)) {
      const { name, aliases } = item.i18n[lang];
      await pool.query(
        `INSERT INTO catalog_i18n (term_type, term_en, lang, name, aliases, needs_review)
         VALUES ('product', $1, $2, $3, $4, false)
         ON CONFLICT (term_type, term_en, lang)
           DO UPDATE SET name = EXCLUDED.name, aliases = EXCLUDED.aliases`,
        [item.term_en, lang, name, aliases || '']
      );
    }

    // The listed shop's product, linked to the master item. Seeded AFTER
    // migrate, so we populate search_text explicitly via the write-path helper
    // (exactly what product.create / catalog.select do live) — this is the REAL
    // folded blob the eval measures over.
    const displayName = [item.brand, item.term_en, item.pack].filter(Boolean).join(' ');
    const p = await pool.query(
      `INSERT INTO products (shop_id, name, price, unit, is_active, catalog_item_id)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [listed.id, displayName, item.price, item.unit, catalogItemId]
    );
    productIdByKey[item.key] = p.rows[0].id;
    await refreshProductSearchText(pool, p.rows[0].id);
  }
}, 60000);

afterAll(async () => {
  if (listed) await pool.query('DELETE FROM shops WHERE id = $1', [listed.id]);
  for (const id of catalogItemIds) await pool.query('DELETE FROM catalog_items WHERE id = $1', [id]);
  for (const item of CATALOG) {
    await pool.query("DELETE FROM catalog_i18n WHERE term_type = 'product' AND term_en = $1", [item.term_en]);
  }
  await pool.end();
});

const search = (q, lang) => {
  const langPart = lang ? `&lang=${encodeURIComponent(lang)}` : '';
  return request(app).get(`/api/public/products/search?q=${encodeURIComponent(q)}${langPart}`);
};

// Accept a string key or an array of acceptable keys (brand-only queries may
// legitimately map to a set). Returns the set of expected seeded product ids.
const expectedIds = (expect) =>
  (Array.isArray(expect) ? expect : [expect]).map((k) => productIdByKey[k]);

const pct = (n, d) => (d === 0 ? 0 : n / d);
const fmt = (x) => (x * 100).toFixed(1).padStart(5) + '%';

describe('multilingual search evaluation (Recall@1 / Recall@5)', () => {
  // Computed once in beforeAll of this block so every assertion reads the SAME
  // measured run and the printed table matches the thresholds.
  const metrics = {
    overall: { n: 0, hit1: 0, hit5: 0 },
    byCat: Object.fromEntries(CATEGORIES.map((c) => [c, { n: 0, hit1: 0, hit5: 0 }])),
    negTotal: 0,
    negReject: 0,
    perQuery: [],
  };
  const describeMetrics = {};

  beforeAll(async () => {
    for (const item of QUERIES) {
      const res = await search(item.q, item.lang);
      expect(res.status).toBe(200);
      const ids = res.body.products.map((p) => p.id);

      if (item.category === 'negative') {
        metrics.negTotal += 1;
        const rejected = res.body.products.length === 0;
        if (rejected) metrics.negReject += 1;
        metrics.perQuery.push({ ...item, rank: rejected ? -1 : 0, ok: rejected });
        continue;
      }

      const wants = expectedIds(item.expect);
      // Rank of the FIRST expected product in the ranked list (-1 if absent).
      let rank = -1;
      for (let i = 0; i < ids.length; i += 1) {
        if (wants.includes(ids[i])) { rank = i; break; }
      }
      const hit1 = rank === 0;
      const hit5 = rank >= 0 && rank < 5;
      metrics.overall.n += 1;
      metrics.overall.hit1 += hit1 ? 1 : 0;
      metrics.overall.hit5 += hit5 ? 1 : 0;
      const c = metrics.byCat[item.category];
      c.n += 1;
      c.hit1 += hit1 ? 1 : 0;
      c.hit5 += hit5 ? 1 : 0;
      metrics.perQuery.push({ ...item, rank, ok: hit5 });
    }

    // Compact table so the numbers are visible in CI output.
    const R1 = pct(metrics.overall.hit1, metrics.overall.n);
    const R5 = pct(metrics.overall.hit5, metrics.overall.n);
    const negR = pct(metrics.negReject, metrics.negTotal);
    const lines = [];
    lines.push('');
    lines.push('=== Multilingual Search Recall Evaluation ===');
    lines.push(`catalog: ${CATALOG.length} products | queries: ${QUERIES.length} (positive ${metrics.overall.n}, negative ${metrics.negTotal})`);
    lines.push('');
    lines.push('category      N   Recall@1  Recall@5');
    lines.push('-------------------------------------');
    for (const cat of CATEGORIES) {
      if (cat === 'negative') continue;
      const m = metrics.byCat[cat];
      lines.push(`${cat.padEnd(12)} ${String(m.n).padStart(2)}   ${fmt(pct(m.hit1, m.n))}    ${fmt(pct(m.hit5, m.n))}`);
    }
    lines.push('-------------------------------------');
    lines.push(`${'OVERALL'.padEnd(12)} ${String(metrics.overall.n).padStart(2)}   ${fmt(R1)}    ${fmt(R5)}`);
    lines.push('');
    lines.push(`negativeReject: ${fmt(negR)} (${metrics.negReject}/${metrics.negTotal} absent queries correctly returned no product)`);
    // Surface any positive miss (recalled below rank 5, or not at all) for triage.
    const misses = metrics.perQuery.filter((r) => r.category !== 'negative' && !r.ok);
    if (misses.length) {
      lines.push('');
      lines.push('MISSES (expected product not in top-5):');
      for (const m of misses) lines.push(`  [${m.category}] "${m.q}" -> expect ${JSON.stringify(m.expect)} (rank ${m.rank})`);
    }
    lines.push('=============================================');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Stash for the assertions below.
    describeMetrics.R1 = R1;
    describeMetrics.R5 = R5;
    describeMetrics.negR = negR;
    describeMetrics.byCat = metrics.byCat;
  }, 60000);

  // ---------------------------------------------------------------------------
  // Regression-guard thresholds. Each floor is set a notch BELOW the measured
  // value so it catches a real recall regression without flapping. Rationale is
  // one line per threshold; category floors are used only where a category is
  // genuinely harder than the overall bar.
  // ---------------------------------------------------------------------------

  it('overall Recall@5 stays high (measured 1.00; floor 0.90 = every reasonable phrasing must still surface the product)', () => {
    expect(describeMetrics.R5).toBeGreaterThanOrEqual(0.90);
  });

  it('overall Recall@1 stays high (measured 1.00; floor 0.70 = the intended product should usually rank first)', () => {
    expect(describeMetrics.R1).toBeGreaterThanOrEqual(0.70);
  });

  it('negativeReject stays high (measured 1.00; floor 0.90 = absent items must not over-match via fuzzy)', () => {
    expect(describeMetrics.negR).toBeGreaterThanOrEqual(0.90);
  });

  it('asr_error category recall stays healthy (noisy speech-to-text is the hardest bucket; floor 0.60 @5)', () => {
    // ASR slips lean on trigram/word-similarity rather than a clean token, so its
    // floor is set below the overall bar per the spec's harder-category guidance.
    expect(pct(describeMetrics.byCat.asr_error.hit5, describeMetrics.byCat.asr_error.n)).toBeGreaterThanOrEqual(0.60);
  });

  it('spelling category recall stays healthy (single-word typos rely on fuzzy match; floor 0.75 @5)', () => {
    expect(pct(describeMetrics.byCat.spelling.hit5, describeMetrics.byCat.spelling.n)).toBeGreaterThanOrEqual(0.75);
  });

  it('native + romanized + brand + packsize recall is essentially perfect (clean token match; floor 1.00 @5)', () => {
    for (const cat of ['native', 'romanized', 'brand', 'packsize']) {
      const m = describeMetrics.byCat[cat];
      expect(pct(m.hit5, m.n)).toBeGreaterThanOrEqual(1.0);
    }
  });
});
