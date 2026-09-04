// Integration tests for the Product Image subsystem. Requires a real Postgres
// (DATABASE_URL) with the migrations applied — same setup as products.test.js.
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
    phone: `+9198${uniq}`,
    password: 'password123',
    shopName: `${prefix} Test Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, shop: res.body.shop };
}

async function createProduct(token, name) {
  const res = await withToken(request(app).post('/api/products'), token).send({
    name, price: 1000, unit: 'unit',
  });
  expect(res.status).toBe(201);
  return res.body.product.id;
}

beforeAll(async () => {
  const uniq = Date.now().toString().slice(-9);
  const a = await register('ImgA', uniq);
  const b = await register('ImgB', `${uniq}1`.slice(-9));
  tokenA = a.token; shopA = a.shop;
  tokenB = b.token; shopB = b.shop;
});

afterAll(async () => {
  if (shopA) await pool.query('DELETE FROM shops WHERE id = $1', [shopA.id]);
  if (shopB) await pool.query('DELETE FROM shops WHERE id = $1', [shopB.id]);
  await pool.end();
});

describe('product image upload / serve / delete', () => {
  let productId;

  beforeAll(async () => {
    productId = await createProduct(tokenA, 'Photographed Rice');
  });

  it('owner uploads a photo -> 200 and a cache-busted image_url', async () => {
    const res = await withToken(request(app).post(`/api/products/${productId}/image`), tokenA)
      .attach('image', PNG_1x1, { filename: 'rice.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.product.image_url).toMatch(
      new RegExp(`^/api/products/${productId}/image\\?v=\\d+$`)
    );
    // Never leak raw bytes in JSON.
    expect(res.body.product.image_data).toBeUndefined();
  });

  it('serves the image publicly (no auth) with an image content-type', async () => {
    const res = await request(app).get(`/api/products/${productId}/image`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\//);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.headers.etag).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns 304 when If-None-Match matches the ETag', async () => {
    const first = await request(app).get(`/api/products/${productId}/image`);
    const res = await request(app)
      .get(`/api/products/${productId}/image`)
      .set('If-None-Match', first.headers.etag);
    expect(res.status).toBe(304);
  });

  it("rejects another shop's owner uploading to this product", async () => {
    const res = await withToken(request(app).post(`/api/products/${productId}/image`), tokenB)
      .attach('image', PNG_1x1, { filename: 'x.png', contentType: 'image/png' });
    expect([403, 404]).toContain(res.status);
  });

  it('rejects a non-image upload with 400', async () => {
    const res = await withToken(request(app).post(`/api/products/${productId}/image`), tokenA)
      .attach('image', Buffer.from('not an image'), {
        filename: 'note.txt', contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });

  it('rejects an upload with no file with 400', async () => {
    const res = await withToken(request(app).post(`/api/products/${productId}/image`), tokenA);
    expect(res.status).toBe(400);
  });

  it('deletes/clears the image, then serve returns 404', async () => {
    const del = await withToken(request(app).delete(`/api/products/${productId}/image`), tokenA);
    expect(del.status).toBe(200);
    expect(del.body.product.image_url).toBeNull();

    const gone = await request(app).get(`/api/products/${productId}/image`);
    expect(gone.status).toBe(404);
  });

  it('404s serving an image for an unknown product', async () => {
    const res = await request(app).get('/api/products/00000000-0000-0000-0000-000000000000/image');
    expect(res.status).toBe(404);
  });
});
