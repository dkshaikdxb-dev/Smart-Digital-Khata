// Integration tests for the geo-targeted promo campaigns + the marketing admin
// role (batch ADS2). Requires a real Postgres (DATABASE_URL) with the migrations
// applied (incl. 0045_ad_campaigns). Mirrors the admin-rbac harness.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

const uniq = Date.now().toString().slice(-9);
const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const admins = {};
let owner; // { token, user, shop }
let productId; // a product in the owner's shop, for link_type='product'

let adminSeq = 0;
async function makeAdmin(key, role) {
  const n = adminSeq++;
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`ADS ${key}`, `ads_${key}_${uniq}@test.local`, `+9155${n}${uniq}`, role]
  );
  admins[key] = { id: r.rows[0].id, token: tokenFor(r.rows[0].id), role };
}

beforeAll(async () => {
  await makeAdmin('marketing', 'marketing');
  await makeAdmin('support', 'support');
  await makeAdmin('super', 'super');

  const res = await request(app).post('/api/auth/register').send({
    name: 'ADS Owner', email: `ads_owner_${uniq}@test.local`, phone: `+9188${uniq}`,
    password: 'password123', shopName: 'ADS Shop',
  });
  expect(res.status).toBe(201);
  owner = { token: res.body.token, user: res.body.user, shop: res.body.shop };

  const p = await pool.query(
    `INSERT INTO products (shop_id, name, price) VALUES ($1,$2,$3) RETURNING id`,
    [owner.shop.id, 'ADS Product', 1000]
  );
  productId = p.rows[0].id;
});

afterAll(async () => {
  const ids = Object.values(admins).map((a) => a.id);
  await pool.query('DELETE FROM ad_campaigns WHERE created_by = ANY($1)', [ids]);
  if (owner && owner.shop) {
    await pool.query('DELETE FROM products WHERE shop_id = $1', [owner.shop.id]);
    await pool.query('DELETE FROM shops WHERE id = $1', [owner.shop.id]);
  }
  if (owner && owner.user) await pool.query('DELETE FROM users WHERE id = $1', [owner.user.id]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  await pool.end();
});

describe('migration 0045 — schema + role CHECK', () => {
  test('ad_campaigns and ad_targets tables exist', async () => {
    const r = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('ad_campaigns','ad_targets') ORDER BY table_name`
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(['ad_campaigns', 'ad_targets']);
  });

  test("admin_role CHECK accepts 'marketing' and rejects a bogus role", async () => {
    // The marketing admin created in beforeAll already proves acceptance; assert
    // rejection of an unknown role explicitly.
    await expect(
      pool.query(
        `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
         VALUES ($1,$2,$3,'x','admin','wizard') RETURNING id`,
        ['Bad Role', `ads_bad_${uniq}@test.local`, `+9144${uniq}`]
      )
    ).rejects.toThrow();
  });
});

describe('permission gating', () => {
  test('a non-admin (owner) token is refused', async () => {
    const res = await auth(request(app).get('/api/admin/ads'), owner.token);
    expect([401, 403]).toContain(res.status);
  });

  test('a support admin (no ads:view) cannot list', async () => {
    const res = await auth(request(app).get('/api/admin/ads'), admins.support.token);
    expect(res.status).toBe(403);
  });

  test('a support admin (no ads:manage) cannot create', async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.support.token)
      .send({ style: 'offer', title: 'x', targets: [{ geo_type: 'all' }] });
    expect(res.status).toBe(403);
  });

  test('a marketing admin (ads:view) can list', async () => {
    const res = await auth(request(app).get('/api/admin/ads'), admins.marketing.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('validation', () => {
  test('a bad style is rejected', async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({ style: 'banner', title: 'x', targets: [{ geo_type: 'all' }] });
    expect(res.status).toBe(400);
  });

  test('title is required', async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({ style: 'offer', targets: [{ geo_type: 'all' }] });
    expect(res.status).toBe(400);
  });

  test("link_type='shop' with a missing link_shop_id is rejected", async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({ style: 'shop', title: 'Shop promo', link_type: 'shop', targets: [{ geo_type: 'all' }] });
    expect(res.status).toBe(400);
  });

  test("link_type='shop' with a nonexistent shop is rejected", async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({
        style: 'shop', title: 'Shop promo', link_type: 'shop',
        link_shop_id: '00000000-0000-0000-0000-000000000000', targets: [{ geo_type: 'all' }],
      });
    expect(res.status).toBe(400);
  });

  test("geo_type='all' stores a single all-row (dupes collapsed, geo_value null)", async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({
        style: 'festival', title: 'Diwali dhamaka',
        targets: [{ geo_type: 'all' }, { geo_type: 'all', geo_value: 'ignored' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.campaign.targets).toHaveLength(1);
    expect(res.body.campaign.targets[0]).toMatchObject({ geo_type: 'all', geo_value: null });
    await auth(request(app).delete(`/api/admin/ads/${res.body.campaign.id}`), admins.marketing.token);
  });
});

describe('CSV export', () => {
  test('marketing (ads:view) downloads text/csv with the header row and a row incl. a computed ctr', async () => {
    const created = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({
        style: 'offer', title: 'CTR export test', advertiser: 'Acme',
        targets: [{ geo_type: 'town', geo_value: 'Pune' }, { geo_type: 'all' }],
      });
    expect(created.status).toBe(201);
    const id = created.body.campaign.id;
    // Seed impressions/clicks so the export computes a non-zero CTR (5/20 = 25.0).
    await pool.query('UPDATE ad_campaigns SET impressions = 20, clicks = 5 WHERE id = $1', [id]);

    const res = await auth(request(app).get('/api/admin/ads/export.csv'), admins.marketing.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/campaigns\.csv/);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe(
      'id,title,advertiser,style,status,targets,starts_at,ends_at,priority,impressions,clicks,ctr_percent,created_at'
    );
    const row = lines.find((l) => l.startsWith(id));
    expect(row).toBeTruthy();
    // targets space-joined (town:Pune + the everywhere 'all' row), then the
    // seeded impressions/clicks and their computed ctr_percent.
    expect(row).toContain('town:Pune');
    expect(row).toContain('all');
    expect(row).toContain(',20,5,25,');

    await auth(request(app).delete(`/api/admin/ads/${id}`), admins.marketing.token);
  });

  test('a support admin (no ads:view) is refused with 403', async () => {
    const res = await auth(request(app).get('/api/admin/ads/export.csv'), admins.support.token);
    expect(res.status).toBe(403);
  });
});

describe('marketing CRUD lifecycle', () => {
  let campaignId;

  test('create with town+village+pincode targets + a valid shop link', async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({
        style: 'offer',
        title: 'Chai special',
        offer_text: '₹20 off',
        glyph: '☕',
        i18n: { hi: { title: 'चाय ऑफर' } },
        link_type: 'shop',
        link_shop_id: owner.shop.id,
        priority: 5,
        targets: [
          { geo_type: 'town', geo_value: 'Pune' },
          { geo_type: 'village', geo_value: 'Wagholi' },
          { geo_type: 'pincode', geo_value: '412207' },
        ],
      });
    expect(res.status).toBe(201);
    campaignId = res.body.campaign.id;
    expect(res.body.campaign.status).toBe('draft');
    expect(res.body.campaign.created_by).toBe(admins.marketing.id);
    expect(res.body.campaign.i18n).toEqual({ hi: { title: 'चाय ऑफर' } });
    const byType = Object.fromEntries(res.body.campaign.targets.map((t) => [t.geo_type, t.geo_value]));
    expect(byType).toEqual({ town: 'Pune', village: 'Wagholi', pincode: '412207' });
  });

  test('product link with a valid product is accepted', async () => {
    const res = await auth(request(app).post('/api/admin/ads'), admins.marketing.token)
      .send({
        style: 'product', title: 'Featured product', link_type: 'product',
        link_product_id: productId, targets: [{ geo_type: 'town', geo_value: 'Pune' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.campaign.link_product_id).toBe(productId);
    await auth(request(app).delete(`/api/admin/ads/${res.body.campaign.id}`), admins.marketing.token);
  });

  test('list includes the campaign with targets, newest first', async () => {
    const res = await auth(request(app).get('/api/admin/ads'), admins.marketing.token);
    expect(res.status).toBe(200);
    const found = res.body.items.find((c) => c.id === campaignId);
    expect(found).toBeTruthy();
    expect(found.targets).toHaveLength(3);
  });

  test('filter by geo matches a target value', async () => {
    const res = await auth(request(app).get('/api/admin/ads?geo=Wagholi'), admins.marketing.token);
    expect(res.status).toBe(200);
    expect(res.body.items.some((c) => c.id === campaignId)).toBe(true);
  });

  test('get one returns campaign + targets', async () => {
    const res = await auth(request(app).get(`/api/admin/ads/${campaignId}`), admins.marketing.token);
    expect(res.status).toBe(200);
    expect(res.body.campaign.id).toBe(campaignId);
    expect(res.body.campaign.targets).toHaveLength(3);
  });

  test('update replaces the target set', async () => {
    const res = await auth(request(app).put(`/api/admin/ads/${campaignId}`), admins.marketing.token)
      .send({
        style: 'offer', title: 'Chai special (v2)', offer_text: '₹25 off',
        link_type: 'none', targets: [{ geo_type: 'pincode', geo_value: '411001' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.campaign.title).toBe('Chai special (v2)');
    expect(res.body.campaign.link_type).toBe('none');
    expect(res.body.campaign.link_shop_id).toBeNull();
    expect(res.body.campaign.targets).toHaveLength(1);
    expect(res.body.campaign.targets[0]).toMatchObject({ geo_type: 'pincode', geo_value: '411001' });
  });

  test('patch status to active', async () => {
    const res = await auth(request(app).patch(`/api/admin/ads/${campaignId}/status`), admins.marketing.token)
      .send({ status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe('active');
  });

  test('patch status rejects a bad value', async () => {
    const res = await auth(request(app).patch(`/api/admin/ads/${campaignId}/status`), admins.marketing.token)
      .send({ status: 'live' });
    expect(res.status).toBe(400);
  });

  test('delete removes the campaign (targets cascade)', async () => {
    const del = await auth(request(app).delete(`/api/admin/ads/${campaignId}`), admins.marketing.token);
    expect(del.status).toBe(200);
    const after = await auth(request(app).get(`/api/admin/ads/${campaignId}`), admins.marketing.token);
    expect(after.status).toBe(404);
    const t = await pool.query('SELECT COUNT(*)::int AS c FROM ad_targets WHERE campaign_id = $1', [campaignId]);
    expect(t.rows[0].c).toBe(0);
  });
});
