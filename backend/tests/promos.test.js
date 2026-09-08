// Integration tests for the PUBLIC promo serving API (batch ADS4). Requires a
// real Postgres (DATABASE_URL) with the migrations applied (incl. 0045). Serves
// localized, geo-matched, in-window, active campaigns to the consumer app and
// records best-effort impression/click beacons.
//
// Isolation in the shared test DB: campaigns are targeted at RUN-UNIQUE geo
// values so no other test's campaigns match our location queries, and seeded at
// a very high priority base so any incidental active 'all' campaign from another
// suite sorts BELOW ours (and is dropped by LIMIT 5). Assertions therefore check
// for OUR campaign ids, never exact whole-array equality (except where a geo is
// run-unique enough that only ours can match).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
// Run-unique geo values. Mixed case in the seed so the case-insensitive match is
// genuinely exercised by a differently-cased query.
const TOWN = `PromoTown${uniq}`;
const VILLAGE = `PromoVillage${uniq}`;
const PINCODE = `9${uniq}`.slice(0, 6);
// Priority base far above anything the admin API (default 0) would ever set, so
// our seeds deterministically win the priority sort against foreign campaigns.
const PBASE = 2000000;

const seeded = []; // campaign ids, for cleanup

// Insert one active-by-default campaign with the given targets. Overrides let a
// test flip status / window / priority / i18n. Returns the new campaign id.
async function seedCampaign({ title, targets, status = 'active', starts_at = null, ends_at = null, priority = PBASE, i18n = {}, offer_text = null, subtitle = null }) {
  const c = await pool.query(
    `INSERT INTO ad_campaigns
       (style, title, offer_text, subtitle, i18n, status, starts_at, ends_at, priority)
     VALUES ('offer',$1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING id`,
    [title, offer_text, subtitle, JSON.stringify(i18n), status, starts_at, ends_at, priority]
  );
  const id = c.rows[0].id;
  for (const t of targets) {
    await pool.query(
      'INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
      [id, t.geo_type, t.geo_value ?? null]
    );
  }
  seeded.push(id);
  return id;
}

afterAll(async () => {
  if (seeded.length) await pool.query('DELETE FROM ad_campaigns WHERE id = ANY($1)', [seeded]);
  await pool.end();
});

describe('GET /api/public/promos — geo match', () => {
  let townId; let villageId; let pincodeId; let allId;

  beforeAll(async () => {
    townId = await seedCampaign({ title: 'Town promo', targets: [{ geo_type: 'town', geo_value: TOWN }] });
    villageId = await seedCampaign({ title: 'Village promo', targets: [{ geo_type: 'village', geo_value: VILLAGE }] });
    pincodeId = await seedCampaign({ title: 'Pincode promo', targets: [{ geo_type: 'pincode', geo_value: PINCODE }] });
    allId = await seedCampaign({ title: 'All promo', targets: [{ geo_type: 'all' }] });
  });

  const ids = (res) => res.body.promos.map((p) => p.id);

  test('a town-targeted campaign shows for that ?town= and not for a different town', async () => {
    const hit = await request(app).get(`/api/public/promos?town=${encodeURIComponent(TOWN)}`);
    expect(hit.status).toBe(200);
    expect(ids(hit)).toContain(townId);

    const miss = await request(app).get(`/api/public/promos?town=${encodeURIComponent(TOWN)}Nope`);
    expect(ids(miss)).not.toContain(townId);
  });

  test('town match is trimmed + case-insensitive', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(`  ${TOWN.toUpperCase()}  `)}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(townId);
  });

  test('village- and pincode-targeted campaigns match their values', async () => {
    const v = await request(app).get(`/api/public/promos?village=${encodeURIComponent(VILLAGE)}`);
    expect(ids(v)).toContain(villageId);
    const p = await request(app).get(`/api/public/promos?pincode=${encodeURIComponent(PINCODE)}`);
    expect(ids(p)).toContain(pincodeId);
    // pincode is an exact match, not the town's fuzzy compare.
    const pmiss = await request(app).get(`/api/public/promos?pincode=${encodeURIComponent(PINCODE)}0`);
    expect(ids(pmiss)).not.toContain(pincodeId);
  });

  test("an 'all' campaign shows for everyone, including a located shopper", async () => {
    const located = await request(app).get(`/api/public/promos?town=${encodeURIComponent(TOWN)}`);
    expect(ids(located)).toContain(allId);
  });

  test("a no-location request returns ONLY 'all' campaigns (no leak of town-targeted)", async () => {
    const res = await request(app).get('/api/public/promos');
    expect(res.status).toBe(200);
    const got = ids(res);
    expect(got).toContain(allId);
    expect(got).not.toContain(townId);
    expect(got).not.toContain(villageId);
    expect(got).not.toContain(pincodeId);
  });
});

describe('GET /api/public/promos — eligibility (status + window)', () => {
  const XTOWN = `${TOWN}Excl`;
  let activeId; let pausedId; let draftId; let futureId; let pastId;

  beforeAll(async () => {
    const day = 24 * 60 * 60 * 1000;
    const future = new Date(Date.now() + 30 * day).toISOString();
    const past = new Date(Date.now() - 30 * day).toISOString();
    activeId = await seedCampaign({ title: 'Active', targets: [{ geo_type: 'town', geo_value: XTOWN }] });
    pausedId = await seedCampaign({ title: 'Paused', status: 'paused', targets: [{ geo_type: 'town', geo_value: XTOWN }] });
    draftId = await seedCampaign({ title: 'Draft', status: 'draft', targets: [{ geo_type: 'town', geo_value: XTOWN }] });
    futureId = await seedCampaign({ title: 'Future', starts_at: future, targets: [{ geo_type: 'town', geo_value: XTOWN }] });
    pastId = await seedCampaign({ title: 'Past', ends_at: past, targets: [{ geo_type: 'town', geo_value: XTOWN }] });
  });

  test('only the active, in-window campaign shows; paused/draft/future/past excluded', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(XTOWN)}`);
    expect(res.status).toBe(200);
    const got = res.body.promos.map((p) => p.id);
    expect(got).toContain(activeId);
    expect(got).not.toContain(pausedId);
    expect(got).not.toContain(draftId);
    expect(got).not.toContain(futureId);
    expect(got).not.toContain(pastId);
  });
});

describe('GET /api/public/promos — rank, cap, distinct', () => {
  const RTOWN = `${TOWN}Rank`;
  const rankIds = [];

  beforeAll(async () => {
    // Seed 6 town-targeted campaigns at descending priorities (all above PBASE so
    // they dominate any foreign campaign). Highest priority = index 0.
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      const id = await seedCampaign({
        title: `Rank ${i}`,
        priority: PBASE + 100 - i,
        targets: [{ geo_type: 'town', geo_value: RTOWN }],
      });
      rankIds.push(id);
    }
  });

  test('LIMIT 5 with highest priority first (6 seeded, 5 returned, lowest dropped)', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(RTOWN)}`);
    expect(res.status).toBe(200);
    // Only our RTOWN campaigns can match this run-unique town, so the response is
    // exactly our top 5 by priority, in order.
    expect(res.body.promos).toHaveLength(5);
    expect(res.body.promos.map((p) => p.id)).toEqual(rankIds.slice(0, 5));
    expect(res.body.promos.map((p) => p.id)).not.toContain(rankIds[5]);
  });

  test('a campaign matching two of the viewer geos appears once', async () => {
    const town = `${TOWN}Two`;
    const village = `${VILLAGE}Two`;
    const id = await seedCampaign({
      title: 'Two-geo',
      targets: [{ geo_type: 'town', geo_value: town }, { geo_type: 'village', geo_value: village }],
    });
    const res = await request(app).get(
      `/api/public/promos?town=${encodeURIComponent(town)}&village=${encodeURIComponent(village)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.promos.filter((p) => p.id === id)).toHaveLength(1);
  });
});

describe('GET /api/public/promos — localized creative + shape', () => {
  const LTOWN = `${TOWN}L10n`;
  let id;

  beforeAll(async () => {
    id = await seedCampaign({
      title: 'Base title',
      offer_text: 'Base offer',
      subtitle: 'Base subtitle',
      i18n: { hi: { title: 'हिंदी शीर्षक' } },
      targets: [{ geo_type: 'town', geo_value: LTOWN }],
    });
  });

  test('?lang=hi returns the i18n.hi title; other fields fall back to base', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}&lang=hi`);
    expect(res.status).toBe(200);
    const promo = res.body.promos.find((p) => p.id === id);
    expect(promo.title).toBe('हिंदी शीर्षक');
    expect(promo.offer_text).toBe('Base offer'); // no hi override -> base
    expect(promo.subtitle).toBe('Base subtitle');
  });

  test('no lang (base) returns the base title', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}`);
    const promo = res.body.promos.find((p) => p.id === id);
    expect(promo.title).toBe('Base title');
  });

  test('an unknown lang with no override falls back to base', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}&lang=ta`);
    const promo = res.body.promos.find((p) => p.id === id);
    expect(promo.title).toBe('Base title');
  });

  test('response carries sponsored=true and OMITS internal counters + raw i18n', async () => {
    const res = await request(app).get(`/api/public/promos?town=${encodeURIComponent(LTOWN)}`);
    const promo = res.body.promos.find((p) => p.id === id);
    expect(promo.sponsored).toBe(true);
    expect(promo).not.toHaveProperty('impressions');
    expect(promo).not.toHaveProperty('clicks');
    expect(promo).not.toHaveProperty('i18n');
    expect(Object.keys(promo).sort()).toEqual(
      [
        'advertiser', 'glyph', 'id', 'image_url', 'link_product_id', 'link_shop_id',
        'link_type', 'link_url', 'offer_text', 'sponsored', 'style', 'subtitle', 'title',
      ].sort()
    );
  });
});

describe('POST /api/public/promos/:id/{impression,click} — beacons', () => {
  const BTOWN = `${TOWN}Beacon`;
  let id;

  beforeAll(async () => {
    id = await seedCampaign({ title: 'Beacon', targets: [{ geo_type: 'town', geo_value: BTOWN }] });
  });

  const counters = async () => {
    const r = await pool.query('SELECT impressions, clicks FROM ad_campaigns WHERE id = $1', [id]);
    return { impressions: Number(r.rows[0].impressions), clicks: Number(r.rows[0].clicks) };
  };

  test('impression increments the counter and returns 204', async () => {
    const before = await counters();
    const res = await request(app).post(`/api/public/promos/${id}/impression`);
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const after = await counters();
    expect(after.impressions).toBe(before.impressions + 1);
    expect(after.clicks).toBe(before.clicks);
  });

  test('click increments the counter and returns 204', async () => {
    const before = await counters();
    const res = await request(app).post(`/api/public/promos/${id}/click`);
    expect(res.status).toBe(204);
    const after = await counters();
    expect(after.clicks).toBe(before.clicks + 1);
    expect(after.impressions).toBe(before.impressions);
  });

  test('a malformed uuid is rejected (400) without touching a row', async () => {
    const res = await request(app).post('/api/public/promos/not-a-uuid/impression');
    expect(res.status).toBe(400);
  });

  test('a well-formed but unknown uuid returns 204 (best-effort no-op)', async () => {
    const res = await request(app).post('/api/public/promos/00000000-0000-0000-0000-000000000000/click');
    expect(res.status).toBe(204);
  });

  test('a beacon for a non-active campaign does not increment', async () => {
    const paused = await seedCampaign({ title: 'Paused beacon', status: 'paused', targets: [{ geo_type: 'all' }] });
    const before = await pool.query('SELECT impressions FROM ad_campaigns WHERE id = $1', [paused]);
    const res = await request(app).post(`/api/public/promos/${paused}/impression`);
    expect(res.status).toBe(204);
    const after = await pool.query('SELECT impressions FROM ad_campaigns WHERE id = $1', [paused]);
    expect(Number(after.rows[0].impressions)).toBe(Number(before.rows[0].impressions));
  });
});
