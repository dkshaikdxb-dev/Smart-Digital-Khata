// Integration tests for the FULL storefront slider (batch STOREFRONT-FULL).
// Requires a real Postgres (DATABASE_URL) with the migrations applied (incl.
// 0045 ads, 0050 wallet, 0056 branded store, 0062 shop_images, 0063 this batch).
//
// Covers:
//   A. MODERATION of owner photos — a new upload is 'pending_review' and NOT served
//      publicly; admin approve → served; admin reject persists review_note + is
//      not served; the per-shop trust toggle (slides_auto_publish) makes a new
//      upload 'active' at once; the queue/toggle are gated by ads:manage.
//   B. SPONSORED SLOT — a placement='storefront' campaign is composed into
//      getShop's `slides` at index 1 (after the owner's first photo; index 0 when
//      the shop has no photos), geo-matched to the shop's own town/village/pincode
//      ('all' always matches), in-window, highest priority wins, never more than
//      one; placement='discovery' campaigns are NOT injected into storefronts and
//      storefront campaigns are NOT served by the discovery band; the sponsored
//      text is localized via ?lang= with base fallback; the existing beacons
//      accept the storefront campaign. `images` stays photos-only (back-compat).
//   C. BUY-OUT — the sponsored slide is omitted while the shop is branded or has
//      bought itself ad-free; the buy-out spends EXACTLY days*credits_per_day in
//      the same transaction as the window extension (402 + unchanged balance when
//      short; 403 when disabled), extends an existing window, and the composer
//      then omits the slide.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const wallet = require('../src/utils/wallet');

// A real (decodable) 1x1 PNG so sharp can process it.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const uniq = Date.now().toString().slice(-9);
const authHdr = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Run-unique geography so no other suite's campaigns can match our storefronts.
const TOWN = `SfTown${uniq}`;
const VILLAGE = `SfVillage${uniq}`;
const PINCODE = `8${uniq}`.slice(0, 6);
// Priority base far above anything the admin API (default 0) would ever set.
const PBASE = 3000000;

let ownerA; // { token, user, shop } — the moderation + composition shop
let ownerB; // a second shop, no photos (index-0 rule) + another geography
let marketing; // { id, token } — holds ads:manage
let support; // { id, token } — no ads:*
const seeded = []; // campaign ids for cleanup

const uploadPhoto = (token) =>
  authHdr(request(app).post('/api/shops/me/images'), token)
    .attach('image', PNG_1x1, { filename: 'photo.png', contentType: 'image/png' });

async function register(prefix, phoneSeed) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+91${phoneSeed}${uniq}`,
    password: 'password123',
    shopName: `${prefix} Storefront Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

async function makeAdmin(key, role, phoneSeed) {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`SF ${key}`, `sf_${key}_${uniq}@test.local`, `+91${phoneSeed}${uniq}`, role]
  );
  return { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

async function shopBalance(shopId) {
  const r = await pool.query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

async function creditShop(shopId, paise) {
  const w = await wallet.getOrCreateWallet('shop', shopId);
  await wallet.creditWallet({ wallet: w, amount_paise: paise, kind: 'reward_settled' });
}

async function debitAll(shopId) {
  const bal = await shopBalance(shopId);
  if (bal > 0) {
    const w = await wallet.getOrCreateWallet('shop', shopId);
    await wallet.debitWallet({ wallet: w, amount_paise: bal, kind: 'redeem_premium' });
  }
}

// Insert one active-by-default campaign with the given placement + targets.
async function seedCampaign({
  title, targets, placement = 'storefront', status = 'active', starts_at = null, ends_at = null,
  priority = PBASE, i18n = {}, offer_text = null, subtitle = null, glyph = '🏷️', link_type = 'none', link_url = null,
}) {
  const c = await pool.query(
    `INSERT INTO ad_campaigns
       (style, title, offer_text, subtitle, glyph, i18n, status, starts_at, ends_at, priority, placement, link_type, link_url)
     VALUES ('offer',$1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [title, offer_text, subtitle, glyph, JSON.stringify(i18n), status, starts_at, ends_at, priority, placement, link_type, link_url]
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

const getShop = (shopId, q = '') => request(app).get(`/api/public/shops/${shopId}${q}`);
const sponsoredOf = (res) => res.body.shop.slides.filter((s) => s.type === 'sponsored');

beforeAll(async () => {
  await setSetting('storefront_ad_free_enabled', 'true');
  await setSetting('storefront_ad_free_credits_per_day_paise', '500'); // ₹5/day
  await setSetting('storefront_ad_free_max_days', '30');

  marketing = await makeAdmin('mkt', 'marketing', '61');
  support = await makeAdmin('sup', 'support', '62');
  ownerA = await register('SfA', '63');
  ownerB = await register('SfB', '64');

  // Both listed (so getShop serves them) with a full location for the geo match.
  await pool.query(
    `UPDATE shops SET is_listed = true, city = $2, village = $3, pincode = $4,
            branded_until = NULL, storefront_ad_free_until = NULL, slides_auto_publish = false
      WHERE id = $1`,
    [ownerA.shop.id, TOWN, VILLAGE, PINCODE]
  );
  await pool.query(
    `UPDATE shops SET is_listed = true, city = $2, branded_until = NULL,
            storefront_ad_free_until = NULL, slides_auto_publish = false
      WHERE id = $1`,
    [ownerB.shop.id, `${TOWN}B`]
  );
});

afterAll(async () => {
  if (seeded.length) await pool.query('DELETE FROM ad_campaigns WHERE id = ANY($1)', [seeded]);
  for (const o of [ownerA, ownerB]) {
    if (!o) continue;
    await pool.query(
      `DELETE FROM referral_ledger WHERE wallet_id IN (
         SELECT id FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1)`,
      [o.shop.id]
    );
    await pool.query("DELETE FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1", [o.shop.id]);
    await pool.query('DELETE FROM shops WHERE id = $1', [o.shop.id]); // shop_images cascade
    await pool.query('DELETE FROM users WHERE id = $1', [o.user.id]);
  }
  await pool.query("DELETE FROM moderation_actions WHERE admin_user_id = ANY($1)", [[marketing.id, support.id]]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[marketing.id, support.id]]);
  await pool.end();
});

describe('migration 0063 — schema + settings', () => {
  test('shop_images gains status/review_note/reviewed_at; shops gains the trust + ad-free columns; ad_campaigns gains placement', async () => {
    const cols = async (table, names) => {
      const r = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = $1 AND column_name = ANY($2::text[]) ORDER BY column_name`,
        [table, names]
      );
      return r.rows.map((x) => x.column_name);
    };
    expect(await cols('shop_images', ['status', 'review_note', 'reviewed_at'])).toEqual(['review_note', 'reviewed_at', 'status']);
    expect(await cols('shops', ['slides_auto_publish', 'storefront_ad_free_until'])).toEqual(['slides_auto_publish', 'storefront_ad_free_until']);
    expect(await cols('ad_campaigns', ['placement'])).toEqual(['placement']);
  });

  test('the CHECKs reject an unknown photo status / placement; defaults are active / discovery', async () => {
    await expect(
      pool.query(
        `INSERT INTO shop_images (shop_id, position, mime, data, status)
         VALUES ($1, 99, 'image/webp', '\\x00'::bytea, 'weird')`,
        [ownerA.shop.id]
      )
    ).rejects.toThrow();
    await expect(
      pool.query("INSERT INTO ad_campaigns (style, title, placement) VALUES ('offer','_probe_','sidebar')")
    ).rejects.toThrow();
    // Pre-existing rows (no explicit status/placement) keep serving exactly as
    // before the migration: photos are 'active', campaigns are 'discovery'.
    const img = await pool.query(
      `INSERT INTO shop_images (shop_id, position, mime, data)
       VALUES ($1, 99, 'image/webp', '\\x00'::bytea) RETURNING status`,
      [ownerA.shop.id]
    );
    expect(img.rows[0].status).toBe('active');
    await pool.query('DELETE FROM shop_images WHERE shop_id = $1 AND position = 99', [ownerA.shop.id]);
    const c = await pool.query("INSERT INTO ad_campaigns (style, title) VALUES ('offer','_probe_') RETURNING id, placement");
    expect(c.rows[0].placement).toBe('discovery');
    await pool.query('DELETE FROM ad_campaigns WHERE id = $1', [c.rows[0].id]);
  });

  test('platform_settings seeded the buy-out keys', async () => {
    const r = await pool.query(
      `SELECT key FROM platform_settings WHERE key IN
       ('storefront_ad_free_enabled','storefront_ad_free_credits_per_day_paise','storefront_ad_free_max_days')`
    );
    expect(r.rows.length).toBe(3);
  });
});

describe('A. moderation — pending photos are never public', () => {
  let pendingId;

  test('a new owner upload starts pending_review (untrusted shop) and reports its status', async () => {
    const res = await uploadPhoto(ownerA.token);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.review_note).toBeNull();
    pendingId = res.body.id;

    const mine = await authHdr(request(app).get('/api/shops/me/images'), ownerA.token);
    expect(mine.status).toBe(200);
    const row = mine.body.images.find((im) => im.id === pendingId);
    expect(row.status).toBe('pending_review');
    expect(row.review_note).toBeNull();
  });

  test('the pending photo is NOT served publicly (images:[] and no photo slide)', async () => {
    const res = await getShop(ownerA.shop.id);
    expect(res.status).toBe(200);
    expect(res.body.shop.images).toEqual([]);
    expect(res.body.shop.slides.filter((s) => s.type === 'photo')).toEqual([]);
  });

  test('the raw bytes stay servable by id (the admin queue renders them)', async () => {
    const res = await request(app).get(`/api/shop-images/${pendingId}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\//);
  });

  test('the queue is gated: owner → 401/403, support admin (no ads:manage) → 403', async () => {
    const o = await authHdr(request(app).get('/api/admin/shop-images/pending'), ownerA.token);
    expect([401, 403]).toContain(o.status);
    const s = await authHdr(request(app).get('/api/admin/shop-images/pending'), support.token);
    expect(s.status).toBe(403);
    const t = await authHdr(request(app).patch(`/api/admin/shops/${ownerA.shop.id}/slides`), support.token)
      .send({ auto_publish: true });
    expect(t.status).toBe(403);
  });

  test('the admin queue lists it with the shop name, url and uploaded_at', async () => {
    const res = await authHdr(request(app).get('/api/admin/shop-images/pending'), marketing.token);
    expect(res.status).toBe(200);
    const row = res.body.items.find((i) => i.id === pendingId);
    expect(row).toBeTruthy();
    expect(row.shop_id).toBe(ownerA.shop.id);
    expect(row.shop_name).toBe('SfA Storefront Shop');
    expect(row.url).toMatch(new RegExp(`^/api/shop-images/${pendingId}\\?v=\\d+$`));
    expect(row.uploaded_at).toBeTruthy();
    expect(row.auto_publish).toBe(false);
    expect(Array.isArray(res.body.auto_publish_shops)).toBe(true);
  });

  test('approve → active, served publicly as images[0] and a photo slide, reviewed_at set, audited', async () => {
    const res = await authHdr(request(app).post(`/api/admin/shop-images/${pendingId}/approve`), marketing.token).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const row = await pool.query('SELECT status, reviewed_at FROM shop_images WHERE id = $1', [pendingId]);
    expect(row.rows[0].status).toBe('active');
    expect(row.rows[0].reviewed_at).toBeTruthy();

    const pub = await getShop(ownerA.shop.id);
    expect(pub.body.shop.images).toHaveLength(1);
    expect(pub.body.shop.images[0].url).toMatch(new RegExp(`^/api/shop-images/${pendingId}\\?v=\\d+$`));
    expect(pub.body.shop.slides[0]).toEqual({ type: 'photo', url: pub.body.shop.images[0].url });

    // Gone from the queue.
    const q = await authHdr(request(app).get('/api/admin/shop-images/pending'), marketing.token);
    expect(q.body.items.some((i) => i.id === pendingId)).toBe(false);

    const audit = await pool.query(
      "SELECT 1 FROM moderation_actions WHERE action = 'shop_image.approve' AND target_id = $1 AND admin_user_id = $2",
      [ownerA.shop.id, marketing.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  test('approving an already-active photo 409s; an unknown/malformed id 404s', async () => {
    const again = await authHdr(request(app).post(`/api/admin/shop-images/${pendingId}/approve`), marketing.token).send({});
    expect(again.status).toBe(409);
    const unknown = await authHdr(request(app).post('/api/admin/shop-images/00000000-0000-0000-0000-000000000000/approve'), marketing.token).send({});
    expect(unknown.status).toBe(404);
    const bad = await authHdr(request(app).post('/api/admin/shop-images/not-a-uuid/reject'), marketing.token).send({});
    expect(bad.status).toBe(404);
  });

  test('reject persists review_note (owner sees it) and the photo is NOT served', async () => {
    const up = await uploadPhoto(ownerA.token);
    expect(up.status).toBe(201);
    expect(up.body.status).toBe('pending_review');
    const id = up.body.id;

    const rej = await authHdr(request(app).post(`/api/admin/shop-images/${id}/reject`), marketing.token)
      .send({ review_note: 'Blurry photo, please retake' });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe('rejected');

    const mine = await authHdr(request(app).get('/api/shops/me/images'), ownerA.token);
    const row = mine.body.images.find((im) => im.id === id);
    expect(row.status).toBe('rejected');
    expect(row.review_note).toBe('Blurry photo, please retake');

    const pub = await getShop(ownerA.shop.id);
    expect(pub.body.shop.images).toHaveLength(1); // still only the approved one
    expect(pub.body.shop.images.some((im) => im.url.includes(id))).toBe(false);
    expect(pub.body.shop.slides.some((s) => s.type === 'photo' && s.url.includes(id))).toBe(false);

    // A rejected photo still counts against the 3-photo cap until the owner
    // removes it; deleting it frees the slot (scoped delete unchanged).
    const del = await authHdr(request(app).delete(`/api/shops/me/images/${id}`), ownerA.token);
    expect(del.status).toBe(200);
  });

  test('trust toggle: PATCH /admin/shops/:id/slides { auto_publish:true } → a new upload is active at once', async () => {
    const t = await authHdr(request(app).patch(`/api/admin/shops/${ownerA.shop.id}/slides`), marketing.token)
      .send({ auto_publish: true });
    expect(t.status).toBe(200);
    expect(t.body.auto_publish).toBe(true);

    const q = await authHdr(request(app).get('/api/admin/shop-images/pending'), marketing.token);
    expect(q.body.auto_publish_shops.some((s) => s.shop_id === ownerA.shop.id)).toBe(true);

    const up = await uploadPhoto(ownerA.token);
    expect(up.status).toBe(201);
    expect(up.body.status).toBe('active');

    const pub = await getShop(ownerA.shop.id);
    expect(pub.body.shop.images).toHaveLength(2);
    expect(pub.body.shop.images.some((im) => im.url.includes(up.body.id))).toBe(true);

    const audit = await pool.query(
      "SELECT 1 FROM moderation_actions WHERE action = 'shop.slides_auto_publish.on' AND target_id = $1",
      [ownerA.shop.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  test('trust toggle off again → uploads go back to pending_review', async () => {
    const t = await authHdr(request(app).patch(`/api/admin/shops/${ownerA.shop.id}/slides`), marketing.token)
      .send({ auto_publish: false });
    expect(t.status).toBe(200);
    expect(t.body.auto_publish).toBe(false);
    const up = await uploadPhoto(ownerA.token); // 3rd photo (cap)
    expect(up.status).toBe(201);
    expect(up.body.status).toBe('pending_review');
    const pub = await getShop(ownerA.shop.id);
    expect(pub.body.shop.images).toHaveLength(2); // the pending one is not served
    // Take it down again so the shop stays at exactly 2 active photos for B.
    await authHdr(request(app).delete(`/api/shops/me/images/${up.body.id}`), ownerA.token);
  });

  test('an active photo can be taken down by a reject (trusted uploads stay moderatable)', async () => {
    const pub = await getShop(ownerA.shop.id);
    const liveUrl = pub.body.shop.images[1].url;
    const liveId = liveUrl.match(/\/api\/shop-images\/([0-9a-f-]{36})/i)[1];
    const rej = await authHdr(request(app).post(`/api/admin/shop-images/${liveId}/reject`), marketing.token)
      .send({ review_note: 'Not a photo of the shop' });
    expect(rej.status).toBe(200);
    const after = await getShop(ownerA.shop.id);
    expect(after.body.shop.images).toHaveLength(1);
    // Rescue it (approve from rejected) — the note left earlier is kept.
    const ok = await authHdr(request(app).post(`/api/admin/shop-images/${liveId}/approve`), marketing.token).send({});
    expect(ok.status).toBe(200);
    const row = await pool.query('SELECT status, review_note FROM shop_images WHERE id = $1', [liveId]);
    expect(row.rows[0].status).toBe('active');
    expect(row.rows[0].review_note).toBe('Not a photo of the shop');
    expect((await getShop(ownerA.shop.id)).body.shop.images).toHaveLength(2);
  });
});

describe('B. sponsored slot — composition, geo, window, placement, localization, beacons', () => {
  let townId; let lowId; let discoveryId;

  beforeAll(async () => {
    townId = await seedCampaign({
      title: 'Base title',
      offer_text: 'Base offer',
      subtitle: 'Base subtitle',
      i18n: { ta: { title: 'தமிழ் தலைப்பு' } },
      glyph: '🛒',
      link_type: 'url',
      link_url: 'https://example.com/offer',
      targets: [{ geo_type: 'town', geo_value: TOWN }],
    });
    // A second storefront campaign for the same town at LOWER priority: never
    // composed while the higher one is live (at most one, highest wins).
    lowId = await seedCampaign({
      title: 'Lower priority',
      priority: PBASE - 1,
      targets: [{ geo_type: 'village', geo_value: VILLAGE }, { geo_type: 'pincode', geo_value: PINCODE }],
    });
    // A discovery-band campaign for the same town: must NOT enter a storefront.
    discoveryId = await seedCampaign({
      title: 'Discovery only',
      placement: 'discovery',
      priority: PBASE + 10,
      targets: [{ geo_type: 'town', geo_value: TOWN }],
    });
  });

  test('exactly one sponsored slide at index 1 (after the first owner photo) with the spec shape; images stays photos-only', async () => {
    const res = await getShop(ownerA.shop.id);
    expect(res.status).toBe(200);
    const { slides, images } = res.body.shop;
    expect(images).toHaveLength(2);
    images.forEach((im) => expect(Object.keys(im)).toEqual(['url']));
    expect(slides).toHaveLength(3);
    expect(slides[0]).toEqual({ type: 'photo', url: images[0].url });
    expect(slides[1].type).toBe('sponsored');
    expect(slides[2]).toEqual({ type: 'photo', url: images[1].url });
    expect(sponsoredOf(res)).toHaveLength(1);
    expect(slides[1]).toEqual({
      type: 'sponsored',
      campaign_id: townId,
      title: 'Base title',
      offer_text: 'Base offer',
      subtitle: 'Base subtitle',
      glyph: '🛒',
      image_url: null,
      link_type: 'url',
      link_shop_id: null,
      link_product_id: null,
      link_url: 'https://example.com/offer',
    });
    // Internal helper columns never leak.
    expect(res.body.shop).not.toHaveProperty('_village');
    expect(res.body.shop).not.toHaveProperty('_sponsored_ok');
    expect(res.body.shop).not.toHaveProperty('storefront_ad_free_until');
  });

  test('highest priority wins; when it is paused the next (village/pincode-matched) one takes the slot', async () => {
    await pool.query("UPDATE ad_campaigns SET status = 'paused' WHERE id = $1", [townId]);
    const res = await getShop(ownerA.shop.id);
    expect(sponsoredOf(res)).toHaveLength(1);
    expect(sponsoredOf(res)[0].campaign_id).toBe(lowId);
    await pool.query("UPDATE ad_campaigns SET status = 'active' WHERE id = $1", [townId]);
  });

  test('placement=discovery is NOT injected into a storefront, and a storefront campaign is NOT served by the discovery band', async () => {
    const res = await getShop(ownerA.shop.id);
    expect(sponsoredOf(res).map((s) => s.campaign_id)).not.toContain(discoveryId);

    const band = await request(app).get(`/api/public/promos?town=${encodeURIComponent(TOWN)}&village=${encodeURIComponent(VILLAGE)}&pincode=${encodeURIComponent(PINCODE)}`);
    expect(band.status).toBe(200);
    const ids = band.body.promos.map((p) => p.id);
    expect(ids).toContain(discoveryId);
    expect(ids).not.toContain(townId);
    expect(ids).not.toContain(lowId);
  });

  test('geo is respected: a shop in another town gets no slide from these campaigns; an "all" storefront campaign reaches it at index 0 (no photos)', async () => {
    const none = await getShop(ownerB.shop.id);
    expect(none.status).toBe(200);
    expect(none.body.shop.slides).toEqual([]);

    const allId = await seedCampaign({ title: 'Everywhere', priority: PBASE - 100, targets: [{ geo_type: 'all' }] });
    const res = await getShop(ownerB.shop.id);
    expect(res.body.shop.images).toEqual([]);
    expect(res.body.shop.slides).toHaveLength(1);
    expect(res.body.shop.slides[0].type).toBe('sponsored');
    expect(res.body.shop.slides[0].campaign_id).toBe(allId);
    // Shop A (with photos) still gets its higher-priority town campaign at index 1.
    const a = await getShop(ownerA.shop.id);
    expect(a.body.shop.slides[1].campaign_id).toBe(townId);
    await pool.query("UPDATE ad_campaigns SET status = 'paused' WHERE id = $1", [allId]);
  });

  test('window is respected: a future-dated / expired storefront campaign is not composed', async () => {
    const day = 24 * 60 * 60 * 1000;
    const futureId = await seedCampaign({
      title: 'Future', priority: PBASE + 50, starts_at: new Date(Date.now() + 30 * day).toISOString(),
      targets: [{ geo_type: 'town', geo_value: TOWN }],
    });
    const pastId = await seedCampaign({
      title: 'Past', priority: PBASE + 60, ends_at: new Date(Date.now() - 30 * day).toISOString(),
      targets: [{ geo_type: 'town', geo_value: TOWN }],
    });
    const res = await getShop(ownerA.shop.id);
    const ids = sponsoredOf(res).map((s) => s.campaign_id);
    expect(ids).not.toContain(futureId);
    expect(ids).not.toContain(pastId);
    expect(ids).toEqual([townId]);
  });

  test('?lang=ta localizes the sponsored title via i18n; fields without an override fall back to base', async () => {
    const ta = await getShop(ownerA.shop.id, '?lang=ta');
    expect(ta.status).toBe(200);
    const s = sponsoredOf(ta)[0];
    expect(s.campaign_id).toBe(townId);
    expect(s.title).toBe('தமிழ் தலைப்பு');
    expect(s.offer_text).toBe('Base offer');
    expect(s.subtitle).toBe('Base subtitle');

    const hi = await getShop(ownerA.shop.id, '?lang=hi'); // no hi override → base
    expect(sponsoredOf(hi)[0].title).toBe('Base title');
  });

  test('the existing impression/click beacons accept the storefront campaign', async () => {
    const before = await pool.query('SELECT impressions, clicks FROM ad_campaigns WHERE id = $1', [townId]);
    const imp = await request(app).post(`/api/public/promos/${townId}/impression`);
    expect(imp.status).toBe(204);
    const clk = await request(app).post(`/api/public/promos/${townId}/click`);
    expect(clk.status).toBe(204);
    const after = await pool.query('SELECT impressions, clicks FROM ad_campaigns WHERE id = $1', [townId]);
    expect(Number(after.rows[0].impressions)).toBe(Number(before.rows[0].impressions) + 1);
    expect(Number(after.rows[0].clicks)).toBe(Number(before.rows[0].clicks) + 1);
  });

  test('admin builder: placement is stored, listed, filterable and exported', async () => {
    const created = await authHdr(request(app).post('/api/admin/ads'), marketing.token).send({
      style: 'offer', title: 'Builder storefront', placement: 'storefront',
      targets: [{ geo_type: 'town', geo_value: `${TOWN}Builder` }],
    });
    expect(created.status).toBe(201);
    expect(created.body.campaign.placement).toBe('storefront');
    seeded.push(created.body.campaign.id);

    const dflt = await authHdr(request(app).post('/api/admin/ads'), marketing.token).send({
      style: 'offer', title: 'Builder default', targets: [{ geo_type: 'all' }],
    });
    expect(dflt.body.campaign.placement).toBe('discovery');
    seeded.push(dflt.body.campaign.id);

    const bad = await authHdr(request(app).post('/api/admin/ads'), marketing.token).send({
      style: 'offer', title: 'Bad placement', placement: 'sidebar', targets: [{ geo_type: 'all' }],
    });
    expect(bad.status).toBe(400);

    const list = await authHdr(request(app).get('/api/admin/ads?placement=storefront'), marketing.token);
    expect(list.status).toBe(200);
    expect(list.body.items.some((c) => c.id === created.body.campaign.id)).toBe(true);
    expect(list.body.items.every((c) => c.placement === 'storefront')).toBe(true);

    const upd = await authHdr(request(app).put(`/api/admin/ads/${created.body.campaign.id}`), marketing.token).send({
      style: 'offer', title: 'Builder storefront v2', placement: 'discovery', targets: [{ geo_type: 'all' }],
    });
    expect(upd.status).toBe(200);
    expect(upd.body.campaign.placement).toBe('discovery');

    const csv = await authHdr(request(app).get('/api/admin/ads/export.csv'), marketing.token);
    expect(csv.status).toBe(200);
    expect(csv.text.split('\r\n')[0]).toContain(',placement,');
    const row = csv.text.split('\r\n').find((l) => l.startsWith(townId));
    expect(row).toContain(',offer,storefront,');
  });
});

describe('C. buy-out — omitted when branded / ad-free; credit economics', () => {
  test('branded shop (branded_until > now) → no sponsored slide', async () => {
    await pool.query("UPDATE shops SET branded_until = NOW() + interval '5 days' WHERE id = $1", [ownerA.shop.id]);
    const res = await getShop(ownerA.shop.id);
    expect(sponsoredOf(res)).toHaveLength(0);
    expect(res.body.shop.slides.every((s) => s.type === 'photo')).toBe(true);
    expect(res.body.shop.slides).toHaveLength(2);
    await pool.query('UPDATE shops SET branded_until = NULL WHERE id = $1', [ownerA.shop.id]);
    expect(sponsoredOf(await getShop(ownerA.shop.id))).toHaveLength(1); // back
  });

  test('an EXPIRED ad-free window does not suppress the slide', async () => {
    await pool.query("UPDATE shops SET storefront_ad_free_until = NOW() - interval '1 minute' WHERE id = $1", [ownerA.shop.id]);
    expect(sponsoredOf(await getShop(ownerA.shop.id))).toHaveLength(1);
    await pool.query('UPDATE shops SET storefront_ad_free_until = NULL WHERE id = $1', [ownerA.shop.id]);
  });

  test('GET /api/shops/me/storefront-ad-free returns the live config + balance + window (owner only)', async () => {
    await creditShop(ownerA.shop.id, 2000); // ₹20
    const res = await authHdr(request(app).get('/api/shops/me/storefront-ad-free'), ownerA.token);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.credits_per_day_paise).toBe(500);
    expect(res.body.max_days).toBe(30);
    expect(res.body.balance_paise).toBe(2000);
    expect(res.body.ad_free_until).toBeNull();
    expect(res.body.is_ad_free).toBe(false);
  });

  test('insufficient balance → 402, balance unchanged, window untouched, slide still composed', async () => {
    const before = await shopBalance(ownerA.shop.id); // 2000 < 5 days * 500
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), ownerA.token).send({ days: 5 });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('insufficient_credits');
    expect(await shopBalance(ownerA.shop.id)).toBe(before);
    const row = await pool.query('SELECT storefront_ad_free_until FROM shops WHERE id = $1', [ownerA.shop.id]);
    expect(row.rows[0].storefront_ad_free_until).toBeNull();
    expect(sponsoredOf(await getShop(ownerA.shop.id))).toHaveLength(1);
  });

  test('buy 3 days → spends EXACTLY 3*500 in the same tx, ad_free_until ≈ now+3d, and the composer omits the slide', async () => {
    const before = await shopBalance(ownerA.shop.id); // 2000
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), ownerA.token).send({ days: 3 });
    expect(res.status).toBe(200);
    expect(res.body.cost_paise).toBe(1500);
    const until = new Date(res.body.ad_free_until).getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(until - Date.now()).toBeGreaterThan(threeDaysMs - 60_000);
    expect(until - Date.now()).toBeLessThan(threeDaysMs + 60_000);

    expect(await shopBalance(ownerA.shop.id)).toBe(before - 1500);
    const led = await pool.query(
      `SELECT l.direction, l.amount_paise, l.kind, l.ref_note
         FROM referral_ledger l JOIN referral_wallets w ON w.id = l.wallet_id
        WHERE w.owner_type = 'shop' AND w.owner_id = $1 AND l.ref_note = $2`,
      [ownerA.shop.id, `storefront ad-free ${ownerA.shop.id}`]
    );
    expect(led.rowCount).toBe(1);
    expect(led.rows[0].direction).toBe('debit');
    expect(Number(led.rows[0].amount_paise)).toBe(1500);
    expect(led.rows[0].kind).toBe('redeem_premium');

    const g = await authHdr(request(app).get('/api/shops/me/storefront-ad-free'), ownerA.token);
    expect(g.body.is_ad_free).toBe(true);
    expect(new Date(g.body.ad_free_until).getTime()).toBe(until);

    const pub = await getShop(ownerA.shop.id);
    expect(sponsoredOf(pub)).toHaveLength(0);
    expect(pub.body.shop.slides).toHaveLength(2);
    expect(pub.body.shop.images).toHaveLength(2); // photos unaffected
  });

  test('buying again EXTENDS the existing window (adds to remaining time)', async () => {
    const prev = new Date((await authHdr(request(app).get('/api/shops/me/storefront-ad-free'), ownerA.token)).body.ad_free_until).getTime();
    await creditShop(ownerA.shop.id, 1000); // 2 more days
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), ownerA.token).send({ days: 2 });
    expect(res.status).toBe(200);
    expect(res.body.cost_paise).toBe(1000);
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const next = new Date(res.body.ad_free_until).getTime();
    expect(next - prev).toBeGreaterThan(twoDaysMs - 60_000);
    expect(next - prev).toBeLessThan(twoDaysMs + 60_000);
    expect(await shopBalance(ownerA.shop.id)).toBe(500); // 2000 - 1500 + 1000 - 1000
  });

  test('days above the live max_days → 400, no debit', async () => {
    await creditShop(ownerA.shop.id, 100000);
    const before = await shopBalance(ownerA.shop.id);
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), ownerA.token).send({ days: 31 });
    expect(res.status).toBe(400);
    expect(await shopBalance(ownerA.shop.id)).toBe(before);
  });

  test('feature disabled → 403, no debit', async () => {
    await setSetting('storefront_ad_free_enabled', 'false');
    const before = await shopBalance(ownerA.shop.id);
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), ownerA.token).send({ days: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('storefront_ad_free_disabled');
    expect(await shopBalance(ownerA.shop.id)).toBe(before);
    const g = await authHdr(request(app).get('/api/shops/me/storefront-ad-free'), ownerA.token);
    expect(g.body.enabled).toBe(false);
    await setSetting('storefront_ad_free_enabled', 'true'); // restore
  });

  test('staff cannot buy the ad-free window (owner-only route)', async () => {
    // A staff token for shop A: the /me/storefront-ad-free routes are auth(['owner']).
    const staffTok = jwt.sign({ sub: ownerA.user.id, role: 'staff', shopId: ownerA.shop.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await authHdr(request(app).post('/api/shops/me/storefront-ad-free'), staffTok).send({ days: 1 });
    expect([401, 403]).toContain(res.status);
  });

  test('the shop balance is never negative after all the flows', async () => {
    await debitAll(ownerA.shop.id);
    expect(await shopBalance(ownerA.shop.id)).toBe(0);
  });
});
