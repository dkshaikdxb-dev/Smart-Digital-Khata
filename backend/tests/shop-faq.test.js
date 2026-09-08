// Integration tests for owner-authored per-store FAQ (Batch FAQ-2): owner CRUD
// scoped to the owner's shop (cross-shop → 404), the per-shop cap, and the
// consumer /my/shop-faqs visibility rule (a customer sees a shop's active faqs
// ONLY when a customers row exists for their phone at that shop). Requires a real
// Postgres (DATABASE_URL) with the migrations applied — including 0041.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');

const uniq = Date.now().toString().slice(-9);
const PHONE = toE164(`98${uniq}`); // customer WITH a record at shop 1
const OTHER_PHONE = toE164(`77${uniq}`); // customer WITHOUT a record at shop 1

let shop1Id;
let shop2Id;
let owner1Id;
let owner2Id;
let owner3Id;

function customerToken(phone) {
  return jwt.sign({ sub: 'test-customer', role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });
}
function ownerToken(shopId) {
  return jwt.sign({ sub: 'test-owner', role: 'owner', shopId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

async function seedShopWithCustomer({ ownerEmail, ownerPhone, shopName, custName, custPhone }) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${shopName} Owner`, ownerEmail, ownerPhone]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query('INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id', [ownerId, shopName]);
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  await pool.query(
    'INSERT INTO customers (shop_id, name, phone, credit_limit, balance) VALUES ($1,$2,$3,50000,0)',
    [shopId, custName, custPhone]
  );
  return { ownerId, shopId };
}

beforeAll(async () => {
  const s1 = await seedShopWithCustomer({
    ownerEmail: `faqowner1_${uniq}@test.local`, ownerPhone: `+9190${uniq}`,
    shopName: 'Ravi Store', custName: 'Ravi Kumar', custPhone: PHONE,
  });
  shop1Id = s1.shopId; owner1Id = s1.ownerId;

  const s2 = await seedShopWithCustomer({
    ownerEmail: `faqowner2_${uniq}@test.local`, ownerPhone: `+9191${uniq}`,
    shopName: 'Meena Mart', custName: 'Meena', custPhone: OTHER_PHONE,
  });
  shop2Id = s2.shopId; owner2Id = s2.ownerId;

  // A third, unrelated owner/shop — no customers at all.
  const owner3 = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ('Solo Owner',$1,$2,'x','owner') RETURNING id`,
    [`faqowner3_${uniq}@test.local`, `+9192${uniq}`]
  );
  owner3Id = owner3.rows[0].id;
});

afterAll(async () => {
  for (const id of [shop1Id, shop2Id]) if (id) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of [owner1Id, owner2Id, owner3Id]) if (id) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  await pool.end();
});

describe('owner /api/shops/faqs CRUD (shop-scoped)', () => {
  let faqId;

  it('rejects unauthenticated create/list with 401', async () => {
    expect((await request(app).get('/api/shops/faqs')).status).toBe(401);
    expect((await request(app).post('/api/shops/faqs').send({ question: 'q', answer: 'a' })).status).toBe(401);
  });

  it('creates a faq for the owner’s own shop', async () => {
    const res = await request(app)
      .post('/api/shops/faqs')
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ question: 'What are your timings?', answer: 'Open 8am to 9pm daily.', sort_order: 2 });
    expect(res.status).toBe(201);
    expect(res.body.faq.shop_id).toBe(shop1Id);
    expect(res.body.faq.question).toBe('What are your timings?');
    faqId = res.body.faq.id;
  });

  it('validates input (empty question → 400)', async () => {
    const res = await request(app)
      .post('/api/shops/faqs')
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ question: '', answer: 'a' });
    expect(res.status).toBe(400);
  });

  it('lists only this shop’s faqs, ordered by sort_order', async () => {
    // Add a lower sort_order row so ordering is observable.
    await request(app)
      .post('/api/shops/faqs')
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ question: 'Do you deliver?', answer: 'Yes, within 3km.', sort_order: 1 });

    const res = await request(app).get('/api/shops/faqs').set('Authorization', `Bearer ${ownerToken(shop1Id)}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.items.every((f) => f.shop_id === shop1Id)).toBe(true);
    // sort_order 1 ("Do you deliver?") comes before sort_order 2.
    expect(res.body.items[0].question).toBe('Do you deliver?');
    expect(res.body.items[1].question).toBe('What are your timings?');

    // Shop 2's owner sees none of shop 1's rows.
    const other = await request(app).get('/api/shops/faqs').set('Authorization', `Bearer ${ownerToken(shop2Id)}`);
    expect(other.body.items.length).toBe(0);
  });

  it('updates a row only within the owner’s shop (cross-shop → 404)', async () => {
    const ok = await request(app)
      .patch(`/api/shops/faqs/${faqId}`)
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ answer: 'Open 9am to 10pm daily.' });
    expect(ok.status).toBe(200);
    expect(ok.body.faq.answer).toBe('Open 9am to 10pm daily.');

    // Another shop's owner cannot touch this row.
    const cross = await request(app)
      .patch(`/api/shops/faqs/${faqId}`)
      .set('Authorization', `Bearer ${ownerToken(shop2Id)}`)
      .send({ answer: 'hacked' });
    expect(cross.status).toBe(404);
  });

  it('deletes a row only within the owner’s shop (cross-shop → 404)', async () => {
    const cross = await request(app)
      .delete(`/api/shops/faqs/${faqId}`)
      .set('Authorization', `Bearer ${ownerToken(shop2Id)}`);
    expect(cross.status).toBe(404);

    const ok = await request(app)
      .delete(`/api/shops/faqs/${faqId}`)
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`);
    expect(ok.status).toBe(200);
  });

  it('enforces the per-shop cap (create beyond 30 → 422)', async () => {
    // Bulk-insert directly to reach the cap quickly, then attempt one more via API.
    const rows = [];
    for (let i = 0; i < 30; i += 1) rows.push(`($1, 'Q${i}', 'A${i}', ${i})`);
    // Clear existing rows for shop1 first so the count is deterministic.
    await pool.query('DELETE FROM shop_faqs WHERE shop_id = $1', [shop1Id]);
    await pool.query(`INSERT INTO shop_faqs (shop_id, question, answer, sort_order) VALUES ${rows.join(',')}`, [shop1Id]);

    const res = await request(app)
      .post('/api/shops/faqs')
      .set('Authorization', `Bearer ${ownerToken(shop1Id)}`)
      .send({ question: 'one too many', answer: 'nope' });
    expect(res.status).toBe(422);
  });
});

describe('consumer GET /api/my/shop-faqs (visibility)', () => {
  beforeAll(async () => {
    // Reset shop1 faqs to a small, known set: 2 active (ordered) + 1 inactive.
    await pool.query('DELETE FROM shop_faqs WHERE shop_id = $1', [shop1Id]);
    await pool.query(
      `INSERT INTO shop_faqs (shop_id, question, answer, sort_order, is_active) VALUES
        ($1, 'Timings?', 'Open 8-9.', 2, true),
        ($1, 'Delivery?', 'Yes.', 1, true),
        ($1, 'Hidden?', 'secret', 0, false)`,
      [shop1Id]
    );
    // Shop 2 has an active faq, but PHONE has NO record there.
    await pool.query('DELETE FROM shop_faqs WHERE shop_id = $1', [shop2Id]);
    await pool.query(
      `INSERT INTO shop_faqs (shop_id, question, answer, sort_order, is_active)
       VALUES ($1, 'Meena timings?', 'Open 10-8.', 0, true)`,
      [shop2Id]
    );
  });

  it('rejects unauthenticated (401) and an owner token (401)', async () => {
    expect((await request(app).get('/api/my/shop-faqs')).status).toBe(401);
    const asOwner = await request(app).get('/api/my/shop-faqs').set('Authorization', `Bearer ${ownerToken(shop1Id)}`);
    expect(asOwner.status).toBe(401);
  });

  it('a customer WITH a record at the shop sees its active faqs (inactive hidden, ordered)', async () => {
    const res = await request(app).get('/api/my/shop-faqs').set('Authorization', `Bearer ${customerToken(PHONE)}`);
    expect(res.status).toBe(200);
    // PHONE has a record only at shop 1, so only shop 1 appears (shop 2 omitted).
    expect(res.body.shops.length).toBe(1);
    const s = res.body.shops[0];
    expect(s.shop_id).toBe(shop1Id);
    expect(s.shop_name).toBe('Ravi Store');
    // 2 active faqs, inactive "Hidden?" excluded, ordered by sort_order.
    expect(s.faqs.length).toBe(2);
    expect(s.faqs[0].question).toBe('Delivery?');
    expect(s.faqs[1].question).toBe('Timings?');
    expect(s.faqs.some((f) => f.question === 'Hidden?')).toBe(false);
  });

  it('a customer WITHOUT a record at the shop does NOT see its faqs', async () => {
    // OTHER_PHONE has a record at shop 2 only. It must see shop 2's faqs, never
    // shop 1's (no record there).
    const res = await request(app).get('/api/my/shop-faqs').set('Authorization', `Bearer ${customerToken(OTHER_PHONE)}`);
    expect(res.status).toBe(200);
    const ids = res.body.shops.map((x) => x.shop_id);
    expect(ids).toContain(shop2Id);
    expect(ids).not.toContain(shop1Id);
  });

  it('omits shops that have no active faqs', async () => {
    // Deactivate every shop-2 faq: OTHER_PHONE then sees no shops at all.
    await pool.query('UPDATE shop_faqs SET is_active = false WHERE shop_id = $1', [shop2Id]);
    const res = await request(app).get('/api/my/shop-faqs').set('Authorization', `Bearer ${customerToken(OTHER_PHONE)}`);
    expect(res.status).toBe(200);
    expect(res.body.shops.length).toBe(0);
  });
});
