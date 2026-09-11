// Integration tests for the Storefront Photo Gallery (batch LITE). Requires a
// real Postgres (DATABASE_URL) with migrations applied — same harness as
// shop-image.test.js (the single cover). Covers: owner upload (adds a row +
// cache-busted url), the 3-photo cap (4th → 409 shop_images_full), the ordered
// list, scoped delete (another shop's image → 404), the public serve (bytes +
// content-type, missing → 404), and getShop's images array + legacy fallback.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');

// A real (decodable) 1x1 PNG so sharp can process it.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let tokenA; let shopA;
let tokenB; let shopB;

const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function register(prefix, uniq) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+9195${uniq}`,
    password: 'password123',
    shopName: `${prefix} Gallery Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

const uploadPhoto = (token) =>
  withToken(request(app).post('/api/shops/me/images'), token)
    .attach('image', PNG_1x1, { filename: 'photo.png', contentType: 'image/png' });

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('GalA', uniq);
  const b = await register('GalB', `${uniq}1`.slice(-9));
  tokenA = a.token; shopA = a.shop;
  tokenB = b.token; shopB = b.shop;
  // Both shops must be listed so the public getShop endpoint returns them.
  await pool.query('UPDATE shops SET is_listed = true WHERE id = ANY($1::uuid[])', [[shopA.id, shopB.id]]);
});

afterAll(async () => {
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (shopB) await pool.query('DELETE FROM shops WHERE id = $1', [shopB.id]);
  await pool.end();
});

describe('storefront photo gallery — upload + cap', () => {
  it('owner uploads a photo -> 201, a shop_images row, and a cache-busted url', async () => {
    const res = await uploadPhoto(tokenA);
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.position).toBe(0);
    expect(res.body.url).toMatch(new RegExp(`^/api/shop-images/${res.body.id}\\?v=\\d+$`));

    const row = await pool.query('SELECT COUNT(*)::int AS n FROM shop_images WHERE shop_id = $1', [shopA.id]);
    expect(row.rows[0].n).toBe(1);
  });

  it('allows a 2nd and 3rd photo, then rejects the 4th with 409 shop_images_full', async () => {
    const second = await uploadPhoto(tokenA);
    expect(second.status).toBe(201);
    expect(second.body.position).toBe(1);
    const third = await uploadPhoto(tokenA);
    expect(third.status).toBe(201);
    expect(third.body.position).toBe(2);

    const fourth = await uploadPhoto(tokenA);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error).toBe('shop_images_full');

    const row = await pool.query('SELECT COUNT(*)::int AS n FROM shop_images WHERE shop_id = $1', [shopA.id]);
    expect(row.rows[0].n).toBe(3);
  });

  it('rejects a non-image gallery upload with 400', async () => {
    const res = await withToken(request(app).post('/api/shops/me/images'), tokenB)
      .attach('image', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated gallery upload', async () => {
    const res = await request(app).post('/api/shops/me/images')
      .attach('image', PNG_1x1, { filename: 'photo.png', contentType: 'image/png' });
    expect([401, 403]).toContain(res.status);
  });
});

describe('storefront photo gallery — list + delete (scoped)', () => {
  it('lists the shop photos ordered by position', async () => {
    const res = await withToken(request(app).get('/api/shops/me/images'), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(3);
    expect(res.body.images.map((im) => im.position)).toEqual([0, 1, 2]);
    res.body.images.forEach((im) => {
      expect(im.url).toMatch(new RegExp(`^/api/shop-images/${im.id}\\?v=\\d+$`));
    });
  });

  it('deletes one photo and renumbers the rest to 0..n-1', async () => {
    const list = await withToken(request(app).get('/api/shops/me/images'), tokenA);
    const middle = list.body.images[1];
    const del = await withToken(request(app).delete(`/api/shops/me/images/${middle.id}`), tokenA);
    expect(del.status).toBe(200);

    const after = await withToken(request(app).get('/api/shops/me/images'), tokenA);
    expect(after.body.images).toHaveLength(2);
    expect(after.body.images.map((im) => im.position)).toEqual([0, 1]);
    expect(after.body.images.find((im) => im.id === middle.id)).toBeUndefined();
  });

  it("is shop-scoped: deleting another shop's photo 404s and leaves it intact", async () => {
    const bUpload = await uploadPhoto(tokenB);
    expect(bUpload.status).toBe(201);
    const bImageId = bUpload.body.id;

    // shopA's token trying to delete shopB's image → 404.
    const cross = await withToken(request(app).delete(`/api/shops/me/images/${bImageId}`), tokenA);
    expect(cross.status).toBe(404);

    // shopB's image is untouched.
    const bList = await withToken(request(app).get('/api/shops/me/images'), tokenB);
    expect(bList.body.images.find((im) => im.id === bImageId)).toBeTruthy();
  });

  it('404s deleting an unknown image id', async () => {
    const res = await withToken(request(app).delete('/api/shops/me/images/00000000-0000-0000-0000-000000000000'), tokenA);
    expect(res.status).toBe(404);
  });
});

describe('storefront photo gallery — public serve', () => {
  it('serves a gallery photo publicly (no auth) with an image content-type + immutable cache', async () => {
    const list = await withToken(request(app).get('/api/shops/me/images'), tokenA);
    const first = list.body.images[0];
    // Strip the ?v= — the serve route takes the bare id.
    const id = first.id;
    const res = await request(app).get(`/api/shop-images/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\//);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns 304 when If-None-Match matches the ETag', async () => {
    const list = await withToken(request(app).get('/api/shops/me/images'), tokenA);
    const id = list.body.images[0].id;
    const first = await request(app).get(`/api/shop-images/${id}`);
    const res = await request(app).get(`/api/shop-images/${id}`).set('If-None-Match', first.headers.etag);
    expect(res.status).toBe(304);
  });

  it('404s serving an unknown gallery image id', async () => {
    const res = await request(app).get('/api/shop-images/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('404s serving a malformed gallery image id', async () => {
    const res = await request(app).get('/api/shop-images/not-a-uuid');
    expect(res.status).toBe(404);
  });
});

describe('getShop — images array + legacy fallback', () => {
  it('returns the gallery images ordered by position (one getShop request)', async () => {
    const res = await request(app).get(`/api/public/shops/${shopA.id}`);
    expect(res.status).toBe(200);
    const s = res.body.shop;
    expect(Array.isArray(s.images)).toBe(true);
    expect(s.images.length).toBe(2); // shopA has 2 photos after the earlier delete
    s.images.forEach((im) => expect(im.url).toMatch(/^\/api\/shop-images\/[0-9a-f-]{36}\?v=\d+$/i));
  });

  it('LEGACY FALLBACK: no shop_images but a legacy image_url cover -> images:[{url:image_url}]', async () => {
    // shopB currently has 1 gallery photo (from the scoping test) — clear it, set
    // a legacy cover pointer, and assert the fallback kicks in.
    await pool.query('DELETE FROM shop_images WHERE shop_id = $1', [shopB.id]);
    const legacyUrl = `/api/shops/${shopB.id}/image?v=1234567890`;
    await pool.query('UPDATE shops SET image_url = $1 WHERE id = $2', [legacyUrl, shopB.id]);

    const res = await request(app).get(`/api/public/shops/${shopB.id}`);
    expect(res.status).toBe(200);
    const s = res.body.shop;
    expect(s.image_url).toBe(legacyUrl); // image_url still in the payload
    expect(s.images).toEqual([{ url: legacyUrl }]);
  });

  it('returns images:[] when the shop has neither gallery photos nor a legacy cover', async () => {
    await pool.query('DELETE FROM shop_images WHERE shop_id = $1', [shopB.id]);
    await pool.query('UPDATE shops SET image_url = NULL WHERE id = $1', [shopB.id]);

    const res = await request(app).get(`/api/public/shops/${shopB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.shop.images).toEqual([]);
  });
});
