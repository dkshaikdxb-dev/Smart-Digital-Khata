// Phase G — consumer auth resilience. Number change (money-exact ledger merge),
// PIN login (lock/recover), long session (90d + refresh-on-use) and the
// owner-side merge-aware change-phone. Requires a real Postgres (DATABASE_URL)
// with migrations 0001..0025 applied. See the task notes for the throwaway-cluster
// one-liner.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
const SECRET = process.env.JWT_SECRET;

const app = require('../src/app');
const { pool, withTx } = require('../src/config/db');
const { relinkCustomerPhone } = require('../src/utils/customer-merge');

const uniq = Date.now().toString().slice(-9);
let seq = 0;
const nextPhone = () => `+9190${uniq}${String(seq++).padStart(2, '0')}`;

const createdShops = [];
const createdOwners = [];
const trackedPhones = new Set();

async function makeShop(name) {
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`${name} Owner`, `owner_${name}_${uniq}@test.local`, nextPhone()]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name) VALUES ($1,$2) RETURNING id`,
    [ownerId, `${name} ${uniq}`]
  );
  const shopId = shop.rows[0].id;
  await pool.query('UPDATE users SET shop_id = $1 WHERE id = $2', [shopId, ownerId]);
  createdShops.push(shopId);
  createdOwners.push(ownerId);
  return { shopId, ownerId };
}

// Seed a customers row plus matching transactions. balance is set to the exact
// integer-paise sum of the transactions (Σ purchase − Σ cash/upi), mirroring how
// the app maintains it, so post-merge assertions are meaningful.
async function seedCustomer(shopId, phone, txns, extra = {}) {
  trackedPhones.add(phone);
  const balance = txns.reduce((a, tx) => a + (tx.type === 'purchase' ? tx.amount : -tx.amount), 0);
  const c = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance, credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [shopId, extra.name || 'Cust', phone, balance, extra.credit_limit || 0, extra.notes || null]
  );
  const customerId = c.rows[0].id;
  for (const tx of txns) {
    const method = tx.type === 'purchase' ? 'credit' : tx.type;
    await pool.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method)
       VALUES ($1,$2,$3,$4,$5)`,
      [shopId, customerId, tx.type, tx.amount, method]
    );
  }
  return { customerId, balance };
}

async function loginOtp(phone) {
  const req1 = await request(app).post('/api/customer-auth/request-otp').send({ phone });
  const code = req1.body.dev_code;
  const req2 = await request(app).post('/api/customer-auth/verify-otp').send({ phone, code });
  return req2.body.token;
}

afterAll(async () => {
  for (const id of createdShops) await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  for (const id of createdOwners) await pool.query('DELETE FROM users WHERE id = $1', [id]);
  for (const p of trackedPhones) {
    await pool.query('DELETE FROM customer_users WHERE phone = $1', [p]);
    await pool.query('DELETE FROM customer_otps WHERE phone = $1', [p]);
    await pool.query('DELETE FROM phone_changes WHERE from_phone = $1 OR to_phone = $1', [p]);
  }
  await pool.end();
});

describe('relinkCustomerPhone (money-exact merge)', () => {
  it('merges two rows: target balance == exact Σ of both sides, source gone, txns repointed', async () => {
    const { shopId } = await makeShop('MergeUnit');
    const FROM = nextPhone();
    const TO = nextPhone();
    // FROM: +100 -30 -20 = +50 (5000p). TO: +70 = +70 (7000p). Combined = 12000p.
    const src = await seedCustomer(shopId, FROM,
      [{ type: 'purchase', amount: 10000 }, { type: 'cash', amount: 3000 }, { type: 'upi', amount: 2000 }],
      { credit_limit: 5000, notes: 'source note' });
    const tgt = await seedCustomer(shopId, TO,
      [{ type: 'purchase', amount: 7000 }], { credit_limit: 20000, notes: null });

    const expected = src.balance + tgt.balance; // 5000 + 7000 = 12000
    const out = await withTx((client) => relinkCustomerPhone(client, { shopId, fromPhone: FROM, toPhone: TO }));

    expect(out.merged).toBe(true);
    expect(out.customerId).toBe(tgt.customerId);

    const target = await pool.query('SELECT balance, credit_limit, notes FROM customers WHERE id = $1', [tgt.customerId]);
    expect(Number(target.rows[0].balance)).toBe(expected);
    // Higher credit_limit is kept; target had no notes so the source's carry over.
    expect(Number(target.rows[0].credit_limit)).toBe(20000);
    expect(target.rows[0].notes).toBe('source note');

    // Source row gone; all 4 transactions now belong to the target.
    const gone = await pool.query('SELECT 1 FROM customers WHERE id = $1', [src.customerId]);
    expect(gone.rowCount).toBe(0);
    const txCount = await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE customer_id = $1', [tgt.customerId]);
    expect(txCount.rows[0].n).toBe(4);
    // Balance really equals the arithmetic sum recomputed from those txns.
    const recomputed = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type='purchase' THEN amount ELSE -amount END),0)::bigint AS b
       FROM transactions WHERE customer_id = $1`, [tgt.customerId]);
    expect(Number(recomputed.rows[0].b)).toBe(expected);
  });

  it('no collision → plain rename, same row id, balance unchanged', async () => {
    const { shopId } = await makeShop('RenameUnit');
    const FROM = nextPhone();
    const TO = nextPhone();
    const src = await seedCustomer(shopId, FROM, [{ type: 'purchase', amount: 4200 }]);

    const out = await withTx((client) => relinkCustomerPhone(client, { shopId, fromPhone: FROM, toPhone: TO }));
    expect(out.merged).toBe(false);
    expect(out.relinked).toBe(true);
    expect(out.customerId).toBe(src.customerId);

    const row = await pool.query('SELECT phone, balance FROM customers WHERE id = $1', [src.customerId]);
    expect(row.rows[0].phone).toBe(TO);
    expect(Number(row.rows[0].balance)).toBe(4200);
  });
});

describe('consumer change-number (multi-shop, per-shop merge, identity rename)', () => {
  let OLD; let NEW; let token; let shopA; let shopB;

  beforeAll(async () => {
    OLD = nextPhone();
    NEW = nextPhone();
    shopA = (await makeShop('CNA')).shopId;
    shopB = (await makeShop('CNB')).shopId;
    // Shop A already has the NEW number → will merge. OLD:+7000, NEW:+5000 → 12000.
    await seedCustomer(shopA, OLD, [{ type: 'purchase', amount: 10000 }, { type: 'cash', amount: 3000 }]);
    await seedCustomer(shopA, NEW, [{ type: 'purchase', amount: 5000 }]);
    // Shop B only has OLD → will rename. +20000.
    await seedCustomer(shopB, OLD, [{ type: 'purchase', amount: 20000 }]);
    token = await loginOtp(OLD);
  });

  it('rejects verify with a wrong/absent code and makes no change', async () => {
    const req1 = await request(app).post('/api/customer-auth/change-number/request')
      .set('Authorization', `Bearer ${token}`).send({ new_phone: NEW });
    expect(req1.status).toBe(200);
    expect(req1.body.dev_code).toMatch(/^[0-9]{6}$/);

    const bad = await request(app).post('/api/customer-auth/change-number/verify')
      .set('Authorization', `Bearer ${token}`).send({ new_phone: NEW, code: '000000' });
    expect([400, 401]).toContain(bad.status);
    // No change: OLD identity still resolves, NEW ledger row in shop A intact.
    const still = await pool.query('SELECT phone FROM customer_users WHERE phone = $1', [OLD]);
    expect(still.rowCount).toBe(1);
  });

  it('verifies OTP on the NEW number, relinks all shops, merges per-shop, issues a fresh token', async () => {
    const req1 = await request(app).post('/api/customer-auth/change-number/request')
      .set('Authorization', `Bearer ${token}`).send({ new_phone: NEW });
    const code = req1.body.dev_code;

    const res = await request(app).post('/api/customer-auth/change-number/verify')
      .set('Authorization', `Bearer ${token}`).send({ new_phone: NEW, code });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.customer_user.phone).toBe(NEW);
    expect(res.body.shops_relinked).toBe(2);
    const freshToken = res.body.token;

    // Fresh token /me shows the NEW phone with both shops' exact balances.
    const me = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${freshToken}`);
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe(NEW);
    expect(me.body.has_pin).toBe(false);
    const byShop = Object.fromEntries(me.body.shops.map((s) => [s.shop_id, Number(s.balance)]));
    expect(byShop[shopA]).toBe(12000); // merged 7000 + 5000
    expect(byShop[shopB]).toBe(20000); // renamed

    // Shop A source (OLD) row gone; NEW row holds all 3 transactions.
    const srcGone = await pool.query('SELECT 1 FROM customers WHERE shop_id=$1 AND phone=$2', [shopA, OLD]);
    expect(srcGone.rowCount).toBe(0);
    const newRow = await pool.query('SELECT id FROM customers WHERE shop_id=$1 AND phone=$2', [shopA, NEW]);
    const txn = await pool.query('SELECT COUNT(*)::int AS n FROM transactions WHERE customer_id=$1', [newRow.rows[0].id]);
    expect(txn.rows[0].n).toBe(3);

    // Audit row written (self).
    const audit = await pool.query(
      "SELECT changed_by, shops_relinked FROM phone_changes WHERE from_phone=$1 AND to_phone=$2", [OLD, NEW]);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].changed_by).toBe('self');
    expect(audit.rows[0].shops_relinked).toBe(2);
  });

  it('old phone no longer resolves to the old identity (re-registers as a fresh, empty account)', async () => {
    // OLD identity row was renamed to NEW, so a fresh OTP login on OLD creates a
    // brand-new empty consumer (no shops).
    const newToken = await loginOtp(OLD);
    const me = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${newToken}`);
    expect(me.status).toBe(200);
    expect(me.body.phone).toBe(OLD);
    expect(me.body.shops).toHaveLength(0);
  });
});

describe('consumer change-number into an EXISTING account (identity merge)', () => {
  it('folds the old identity into the pre-existing new-phone account and deletes the old row', async () => {
    const OLD = nextPhone();
    const NEW = nextPhone();
    trackedPhones.add(OLD); trackedPhones.add(NEW);
    const { shopId } = await makeShop('IdMerge');
    await seedCustomer(shopId, OLD, [{ type: 'purchase', amount: 9000 }]);

    const oldToken = await loginOtp(OLD);
    const oldId = jwt.decode(oldToken).sub;
    // Pre-create an account on the NEW phone.
    const newAcc = await pool.query(
      `INSERT INTO customer_users (phone, name) VALUES ($1,'Existing New') RETURNING id`, [NEW]);
    const newId = newAcc.rows[0].id;

    const req1 = await request(app).post('/api/customer-auth/change-number/request')
      .set('Authorization', `Bearer ${oldToken}`).send({ new_phone: NEW });
    const res = await request(app).post('/api/customer-auth/change-number/verify')
      .set('Authorization', `Bearer ${oldToken}`).send({ new_phone: NEW, code: req1.body.dev_code });
    expect(res.status).toBe(200);
    expect(res.body.customer_user.id).toBe(newId); // survivor is the new-phone account

    // Old identity row deleted → old token 404s on /me.
    const oldGone = await pool.query('SELECT 1 FROM customer_users WHERE id=$1', [oldId]);
    expect(oldGone.rowCount).toBe(0);
    const meOld = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(meOld.status).toBe(404);

    // Survivor now owns the relinked ledger.
    const me = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.shops.map((s) => s.shop_id)).toContain(shopId);
    expect(Number(me.body.shops.find((s) => s.shop_id === shopId).balance)).toBe(9000);
  });
});

describe('consumer PIN', () => {
  let PHONE; let token;

  beforeAll(async () => {
    PHONE = nextPhone();
    const { shopId } = await makeShop('PinShop');
    await seedCustomer(shopId, PHONE, [{ type: 'purchase', amount: 1000 }]);
    token = await loginOtp(PHONE);
  });

  it('sets a PIN (auth) and reports has_pin on /me', async () => {
    const set = await request(app).post('/api/customer-auth/pin/set')
      .set('Authorization', `Bearer ${token}`).send({ pin: '1357' });
    expect(set.status).toBe(200);
    expect(set.body.has_pin).toBe(true);
    // stored as bcrypt, never plaintext
    const row = await pool.query('SELECT pin_hash FROM customer_users WHERE phone=$1', [PHONE]);
    expect(row.rows[0].pin_hash.startsWith('$2')).toBe(true);

    const me = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.has_pin).toBe(true);
  });

  it('pin/login with the correct PIN issues a token', async () => {
    const res = await request(app).post('/api/customer-auth/pin/login').send({ phone: PHONE, pin: '1357' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.customer_user.phone).toBe(PHONE);
  });

  it('wrong PIN increments and locks after MAX attempts; correct PIN then still 429 until unlock', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/customer-auth/pin/login').send({ phone: PHONE, pin: '9999' });
      expect([401, 429]).toContain(r.status);
    }
    // Now locked — even the correct PIN is rejected with 429.
    const locked = await request(app).post('/api/customer-auth/pin/login').send({ phone: PHONE, pin: '1357' });
    expect(locked.status).toBe(429);
    const row = await pool.query('SELECT pin_locked_until FROM customer_users WHERE phone=$1', [PHONE]);
    expect(row.rows[0].pin_locked_until).toBeTruthy();
  });

  it('OTP login still works even while the PIN is locked (recovery path)', async () => {
    const otpToken = await loginOtp(PHONE);
    expect(typeof otpToken).toBe('string');
  });

  it('clearing the PIN removes it', async () => {
    // Fresh session token (OTP), then clear.
    const t = await loginOtp(PHONE);
    const clr = await request(app).post('/api/customer-auth/pin/clear').set('Authorization', `Bearer ${t}`).send({});
    expect(clr.status).toBe(200);
    expect(clr.body.has_pin).toBe(false);
    const row = await pool.query('SELECT pin_hash FROM customer_users WHERE phone=$1', [PHONE]);
    expect(row.rows[0].pin_hash).toBe(null);
    // login by PIN now fails uniformly
    const res = await request(app).post('/api/customer-auth/pin/login').send({ phone: PHONE, pin: '1357' });
    expect(res.status).toBe(401);
  });

  it('does not reveal whether an unknown phone exists', async () => {
    const res = await request(app).post('/api/customer-auth/pin/login').send({ phone: nextPhone(), pin: '1357' });
    expect(res.status).toBe(401);
  });
});

describe('long-lived consumer session', () => {
  it('a freshly issued consumer token carries a ~90 day expiry', async () => {
    const PHONE = nextPhone();
    const { shopId } = await makeShop('SessShop');
    await seedCustomer(shopId, PHONE, [{ type: 'purchase', amount: 100 }]);
    const token = await loginOtp(PHONE);
    const dec = jwt.decode(token);
    const days = (dec.exp - dec.iat) / 86400;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
  });

  it('an old-ish token is reissued on /me; a fresh one is not', async () => {
    const PHONE = nextPhone();
    const { shopId } = await makeShop('RefreshShop');
    const seed = await seedCustomer(shopId, PHONE, [{ type: 'purchase', amount: 100 }]);
    // Create the identity via OTP so a real row exists.
    await loginOtp(PHONE);
    const cu = await pool.query('SELECT id FROM customer_users WHERE phone=$1', [PHONE]);
    const id = cu.rows[0].id;

    const now = Math.floor(Date.now() / 1000);
    const oldToken = jwt.sign(
      { sub: id, role: 'customer', phone: PHONE, iat: now - 20 * 86400, exp: now + 90 * 86400 }, SECRET);
    const me = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(me.status).toBe(200);
    expect(typeof me.body.token).toBe('string'); // reissued
    const freshDec = jwt.decode(me.body.token);
    expect((freshDec.exp - freshDec.iat) / 86400).toBeGreaterThan(89);

    // A brand-new token is NOT reissued.
    const freshToken = jwt.sign({ sub: id, role: 'customer', phone: PHONE }, SECRET, { expiresIn: '90d' });
    const me2 = await request(app).get('/api/customer-auth/me').set('Authorization', `Bearer ${freshToken}`);
    expect(me2.body.token).toBeUndefined();
    expect(seed.customerId).toBeTruthy();
  });
});

describe('owner change-phone (merge-aware)', () => {
  let shopId; let ownerToken; let aId; let bId;
  const A = nextPhone();
  const B = nextPhone();

  beforeAll(async () => {
    const s = await makeShop('OwnerMerge');
    shopId = s.shopId;
    ownerToken = jwt.sign({ sub: s.ownerId, role: 'owner', shopId }, SECRET, { expiresIn: '1d' });
    const a = await seedCustomer(shopId, A, [{ type: 'purchase', amount: 8000 }, { type: 'cash', amount: 1000 }]); // 7000
    const b = await seedCustomer(shopId, B, [{ type: 'purchase', amount: 4000 }]); // 4000
    aId = a.customerId; bId = b.customerId;
  });

  it('collision without merge → 409 with merge_required', async () => {
    const res = await request(app).post(`/api/customers/${aId}/change-phone`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ phone: B });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('merge_required');
    expect(res.body.details.target_customer_id).toBe(bId);
  });

  it('collision with merge:true → balances combined exactly; phone_changes changed_by=owner', async () => {
    const res = await request(app).post(`/api/customers/${aId}/change-phone`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ phone: B, merge: true });
    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(true);
    expect(res.body.customer.id).toBe(bId); // target survives
    expect(Number(res.body.customer.balance)).toBe(11000); // 7000 + 4000

    const gone = await pool.query('SELECT 1 FROM customers WHERE id=$1', [aId]);
    expect(gone.rowCount).toBe(0);
    const audit = await pool.query(
      "SELECT changed_by FROM phone_changes WHERE from_phone=$1 AND to_phone=$2 AND changed_by='owner'", [A, B]);
    expect(audit.rowCount).toBe(1);
  });

  it('no collision → simple rename', async () => {
    const C = nextPhone();
    const c = await seedCustomer(shopId, C, [{ type: 'purchase', amount: 500 }]);
    const D = nextPhone();
    trackedPhones.add(D);
    const res = await request(app).post(`/api/customers/${c.customerId}/change-phone`)
      .set('Authorization', `Bearer ${ownerToken}`).send({ phone: D });
    expect(res.status).toBe(200);
    expect(res.body.merged).toBe(false);
    expect(res.body.customer.phone).toBe(D);
    expect(Number(res.body.customer.balance)).toBe(500);
  });
});
