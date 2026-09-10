// Integration tests for the Shop Cover Image subsystem (batch IMG1). Requires a
// real Postgres (DATABASE_URL) with migrations applied — same setup as
// product-images.test.js. Mirrors the product image tests: owner-scoped upload,
// public serve, mime validation, and 404 when no cover exists.
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
    phone: `+9197${uniq}`,
    password: 'password123',
    shopName: `${prefix} Cover Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('CovA', uniq);
  const b = await register('CovB', `${uniq}1`.slice(-9));
  tokenA = a.token; shopA = a.shop;
  tokenB = b.token; shopB = b.shop;
});

afterAll(async () => {
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (shopB) await pool.query('DELETE FROM shops WHERE id = $1', [shopB.id]);
  await pool.end();
});

describe('shop cover image upload / serve', () => {
  it('404s serving a cover for a shop that has none yet', async () => {
    const res = await request(app).get(`/api/shops/${shopB.id}/image`);
    expect(res.status).toBe(404);
  });

  it('owner uploads a cover -> 200 and a cache-busted image_url', async () => {
    const res = await withToken(request(app).post('/api/shops/me/image'), tokenA)
      .attach('image', PNG_1x1, { filename: 'cover.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.image_url).toMatch(
      new RegExp(`^/api/shops/${shopA.id}/image\\?v=\\d+$`)
    );
  });

  it('exposes image_url via GET /api/shops/me and never leaks the raw bytes', async () => {
    const res = await withToken(request(app).get('/api/shops/me'), tokenA);
    expect(res.status).toBe(200);
    expect(res.body.shop.image_url).toMatch(/^\/api\/shops\/.+\/image\?v=\d+$/);
    expect(res.body.shop.image_data).toBeUndefined();
  });

  it('serves the cover publicly (no auth) with an image content-type + immutable cache', async () => {
    const res = await request(app).get(`/api/shops/${shopA.id}/image`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\//);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns 304 when If-None-Match matches the ETag', async () => {
    const first = await request(app).get(`/api/shops/${shopA.id}/image`);
    const res = await request(app)
      .get(`/api/shops/${shopA.id}/image`)
      .set('If-None-Match', first.headers.etag);
    expect(res.status).toBe(304);
  });

  it("is owner-scoped: shopB's cover is unaffected by shopA's upload (still 404)", async () => {
    const res = await request(app).get(`/api/shops/${shopB.id}/image`);
    expect(res.status).toBe(404);
  });

  it('rejects a non-image upload with 400', async () => {
    const res = await withToken(request(app).post('/api/shops/me/image'), tokenA)
      .attach('image', Buffer.from('not an image'), {
        filename: 'note.txt', contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });

  it('rejects an upload with no file with 400', async () => {
    const res = await withToken(request(app).post('/api/shops/me/image'), tokenA);
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated cover upload', async () => {
    const res = await request(app).post('/api/shops/me/image')
      .attach('image', PNG_1x1, { filename: 'cover.png', contentType: 'image/png' });
    expect([401, 403]).toContain(res.status);
  });

  it('404s serving a cover for an unknown shop id', async () => {
    const res = await request(app).get('/api/shops/00000000-0000-0000-0000-000000000000/image');
    expect(res.status).toBe(404);
  });
});
