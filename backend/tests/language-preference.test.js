// Language preference, end to end (batch LANG). Requires a real Postgres
// (DATABASE_URL) with the migrations applied through 0074.
//
// What this suite is protecting, in plain terms:
//
//   * An admin must be able to correct a string in ANY language the registry
//     knows about. Until now the override endpoint validated against a
//     hardcoded list of seven, so Bengali, Gujarati and Marathi — activated by
//     migration 0033 and shipping 852 audited strings each — were unfixable.
//
//   * A shopkeeper's weekly WhatsApp summary must arrive in the language THEY
//     chose. There was no shops.language column, so every owner in the country
//     got Hindi.
//
//   * A customer's purchase / payment / reminder WhatsApp must arrive in the
//     language THEY chose. There was no customer_language column, so everyone
//     got English — and an English-reading customer must still get exactly the
//     same English they always did.
//
// WhatsApp is never hit for real: sendText is stubbed, and we assert the text
// that would have gone out.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { toE164 } = require('../src/utils/phone');
const whatsapp = require('../src/services/whatsapp.service');
const notifier = require('../src/services/notification.service');
const serverI18n = require('../src/utils/server-i18n');
const weeklyService = require('../src/services/weekly-summary.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);

const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const adminToken = () => jwt.sign({ sub: ADMIN_ID, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const customerToken = (id, phone) =>
  jwt.sign({ sub: id, role: 'customer', phone }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Scratch override keys, so cleanup never disturbs a real row.
const OV_KEY = `test.lang.${uniq}`;
const WA_PAYMENT_KEY = 'wa.tx.payment';
const WA_REMINDER_KEY = 'wa.reminder.intro';

let ownerA; // owner whose shop gets a language
let ownerB; // owner whose shop never sets one (the unchanged-behaviour control)
let shopper; // consumer identity + per-shop khata rows
let sendSpy;

let phoneSeq = 0;
const phones = [];
function nextPhone() {
  const p = toE164(`9${uniq.slice(-6)}${String(phoneSeq++).padStart(3, '0')}`);
  phones.push(p);
  return p;
}

const emails = [];
async function registerOwner(tag) {
  const email = `lang_${tag}_${uniq}@test.local`;
  emails.push(email);
  const res = await request(app).post('/api/auth/register').send({
    name: `Lang Owner ${tag}`,
    email,
    phone: nextPhone(),
    password: 'password123',
    shopName: `Lang Shop ${tag}`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

beforeAll(async () => {
  ownerA = await registerOwner('a');
  ownerB = await registerOwner('b');

  // A consumer identity (the PWA login row) plus a khata at shop A.
  const phone = nextPhone();
  const cu = await pool.query(
    'INSERT INTO customer_users (phone, name) VALUES ($1,$2) RETURNING id',
    [phone, 'Lang Shopper']
  );
  const cust = await pool.query(
    `INSERT INTO customers (shop_id, name, phone, balance, credit_limit)
     VALUES ($1,$2,$3,$4,0) RETURNING id`,
    [ownerA.shop.id, 'Lang Shopper', phone, 50000]
  );
  shopper = {
    phone,
    userId: cu.rows[0].id,
    customerId: cust.rows[0].id,
    token: customerToken(cu.rows[0].id, phone),
  };

  // Shop A must actually notify for the message assertions to mean anything.
  await pool.query("UPDATE shops SET notification_mode = 'active' WHERE id = $1", [ownerA.shop.id]);

  // Every customer-facing message goes through sendText; stub it once. No
  // network, and the weekly job's "is WhatsApp set up?" guard is satisfied so
  // it composes and "sends" rather than skipping.
  sendSpy = jest.spyOn(whatsapp, 'sendText').mockResolvedValue({ ok: true });
  jest.spyOn(whatsapp, 'isConfigured').mockReturnValue(true);
});

afterAll(async () => {
  jest.restoreAllMocks();
  // The scratch overrides MUST go, including the wa.* ones: they are real rows
  // in a shared table and would otherwise leak nonsense into other suites (and
  // into a developer's local app).
  const cleanups = [
    ['DELETE FROM i18n_overrides WHERE key = ANY($1)', [[OV_KEY, WA_PAYMENT_KEY, WA_REMINDER_KEY]]],
    ['DELETE FROM notification_logs WHERE shop_id = ANY($1)', [[ownerA.shop.id, ownerB.shop.id]]],
    ['DELETE FROM customers WHERE phone = ANY($1)', [phones]],
    ['DELETE FROM customer_users WHERE phone = ANY($1)', [phones]],
    ['DELETE FROM shops WHERE id = ANY($1)', [[ownerA.shop.id, ownerB.shop.id]]],
    ['DELETE FROM users WHERE email = ANY($1)', [emails]],
  ];
  for (const [sql, params] of cleanups) {
    await pool.query(sql, params).catch(() => {});
  }
  serverI18n.resetCache();
  await pool.end();
});

/* ------------------------------------------------------------------ F2 ---- */
describe('an admin can correct a string in any language the registry knows', () => {
  // bn/gu/mr are ACTIVE (migration 0033) and were rejected outright before.
  for (const lang of ['bn', 'gu', 'mr']) {
    it(`accepts an override for ${lang} and serves it back`, async () => {
      const res = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
        .send({ lang, key: OV_KEY, value: `${lang}-text` });
      expect(res.status).toBe(200);

      const pub = await request(app).get('/api/i18n/overrides');
      expect(pub.status).toBe(200);
      expect(pub.body.overrides[lang][OV_KEY]).toBe(`${lang}-text`);
    });
  }

  it('accepts a STAGED (not yet activated) language, so it can be pre-translated', async () => {
    // 'pa' is seeded is_active=false by 0022_languages — exactly the row an
    // admin translates before switching the language on.
    const staged = await pool.query("SELECT code, is_active FROM languages WHERE code = 'pa'");
    expect(staged.rowCount).toBe(1);
    expect(staged.rows[0].is_active).toBe(false);

    const res = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'pa', key: OV_KEY, value: 'pa-text' });
    expect(res.status).toBe(200);
  });

  it('still refuses a code that is not in the registry at all', async () => {
    // Regression control: it must remain an ALLOWLIST, not "accept any string".
    for (const bad of ['zz', 'klingon', '../etc', '', 'e', 'toolongcode']) {
      const res = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
        .send({ lang: bad, key: OV_KEY, value: 'x' });
      expect(res.status).toBe(400);
    }
  });

  it('stores a normalised code, so a correction can never land somewhere unreadable', async () => {
    const res = await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'MR', key: OV_KEY, value: 'normalised' });
    expect(res.status).toBe(200);
    const row = await pool.query('SELECT lang FROM i18n_overrides WHERE key = $1 AND value = $2', [OV_KEY, 'normalised']);
    expect(row.rows.map((r) => r.lang)).toEqual(['mr']);
  });
});

/* ------------------------------------------------------------------ F3 ---- */
describe("the owner's language is stored and drives the weekly summary", () => {
  it('PATCH /api/shops/me saves the language and GET reads it back', async () => {
    const res = await withToken(request(app).patch('/api/shops/me'), ownerA.token)
      .send({ language: 'ta' });
    expect(res.status).toBe(200);
    expect(res.body.shop.language).toBe('ta');

    const get = await withToken(request(app).get('/api/shops/me'), ownerA.token);
    expect(get.status).toBe(200);
    expect(get.body.shop.language).toBe('ta');
  });

  it('refuses a language that is not in the registry', async () => {
    const res = await withToken(request(app).patch('/api/shops/me'), ownerA.token)
      .send({ language: 'zz' });
    expect(res.status).toBe(400);
    // ...and the previously saved value is untouched.
    const get = await withToken(request(app).get('/api/shops/me'), ownerA.token);
    expect(get.body.shop.language).toBe('ta');
  });

  it("'' clears it back to 'never told us' (which is not the same as English)", async () => {
    const res = await withToken(request(app).patch('/api/shops/me'), ownerA.token)
      .send({ language: '' });
    expect(res.status).toBe(200);
    expect(res.body.shop.language).toBeNull();
    // Put Tamil back for the send test below.
    await withToken(request(app).patch('/api/shops/me'), ownerA.token).send({ language: 'ta' });
  });

  it('the weekly WhatsApp is composed in the language the owner chose', async () => {
    sendSpy.mockClear();
    const shop = await pool.query('SELECT id, owner_id, name, language FROM shops WHERE id = $1', [ownerA.shop.id]);
    const r = await weeklyService.sendWeeklyForShop(shop.rows[0]);
    expect(r.status).toBe('sent');

    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    // The native Tamil quiet-week/summary text — proof it is NOT the Hindi
    // template everyone used to get regardless of their setting.
    expect(/[஀-௿]/.test(text)).toBe(true);
    expect(/[ऀ-ॿ]/.test(text)).toBe(false); // no Devanagari
  });

  it('a shop that never chose a language still gets the historical Hindi default', async () => {
    // Regression control: this is unchanged behaviour, and it passes on both
    // sides of the fix. Silence here would have meant the fix had quietly
    // re-languaged every existing shop.
    sendSpy.mockClear();
    const shop = await pool.query('SELECT id, owner_id, name, language FROM shops WHERE id = $1', [ownerB.shop.id]);
    expect(shop.rows[0].language).toBeNull();
    const r = await weeklyService.sendWeeklyForShop(shop.rows[0]);
    expect(r.status).toBe('sent');

    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(/[ऀ-ॿ]/.test(text)).toBe(true); // Devanagari → Hindi
  });

  it('an owner on a language with no native template gets English, not Hindi', async () => {
    // bn is active in the app but the composer has no Bengali block. Answering
    // one language nobody asked for with another is not a fallback.
    await withToken(request(app).patch('/api/shops/me'), ownerB.token).send({ language: 'bn' });
    sendSpy.mockClear();
    const shop = await pool.query('SELECT id, owner_id, name, language FROM shops WHERE id = $1', [ownerB.shop.id]);
    await weeklyService.sendWeeklyForShop(shop.rows[0]);

    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(/[ऀ-ॿ]/.test(text)).toBe(false); // not Hindi
    expect(/[A-Za-z]/.test(text)).toBe(true);         // English
    await withToken(request(app).patch('/api/shops/me'), ownerB.token).send({ language: '' });
  });
});

/* ------------------------------------------------------------------ F4 ---- */
describe("the customer's language is stored and drives their WhatsApp", () => {
  it('PUT /api/my/language saves it on the identity AND on every khata row', async () => {
    const res = await withToken(request(app).put('/api/my/language'), shopper.token)
      .send({ language: 'ta' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'ta' });

    const get = await withToken(request(app).get('/api/my/language'), shopper.token);
    expect(get.status).toBe(200);
    expect(get.body.language).toBe('ta');

    const row = await pool.query('SELECT customer_language FROM customers WHERE id = $1', [shopper.customerId]);
    expect(row.rows[0].customer_language).toBe('ta');
  });

  it('refuses a language that is not in the registry, and changes nothing', async () => {
    const res = await withToken(request(app).put('/api/my/language'), shopper.token)
      .send({ language: 'zz' });
    expect(res.status).toBe(400);
    const row = await pool.query('SELECT customer_language FROM customers WHERE id = $1', [shopper.customerId]);
    expect(row.rows[0].customer_language).toBe('ta');
  });

  it('requires a logged-in customer', async () => {
    const res = await request(app).put('/api/my/language').send({ language: 'ta' });
    expect(res.status).toBe(401);
  });

  it('a payment message is composed from the override for the customer language', async () => {
    // The translation is a real i18n_overrides row — the same table the web app
    // and the regional seed use. No second dictionary anywhere.
    await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'ta', key: WA_PAYMENT_KEY, value: 'TA::{name}/{shop}/{amount}' });
    serverI18n.resetCache();

    sendSpy.mockClear();
    const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [shopper.customerId]);
    await notifier.onTransaction(ownerA.shop.id, customer.rows[0], {
      type: 'cash', amount: 25000, method: 'cash', note: null,
    });

    expect(sendSpy).toHaveBeenCalled();
    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(text).toContain('TA::Lang Shopper/');
    expect(text).toContain('₹250.00');
    // The old hardcoded English sentence must be gone.
    expect(text).not.toContain('received your payment of');
  });

  it('a dues reminder is composed from the override too', async () => {
    await withToken(request(app).patch('/api/admin/i18n'), adminToken())
      .send({ lang: 'ta', key: WA_REMINDER_KEY, value: 'TA-REMIND::{name}/{shop}' });
    serverI18n.resetCache();

    sendSpy.mockClear();
    await pool.query('UPDATE customers SET balance = 12345 WHERE id = $1', [shopper.customerId]);
    const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [shopper.customerId]);
    await notifier.sendReminder(ownerA.shop.id, customer.rows[0]);

    expect(sendSpy).toHaveBeenCalled();
    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(text).toContain('TA-REMIND::Lang Shopper/');
    expect(text).not.toContain('friendly reminder from');
  });

  it('a customer with no stored language still gets the EXACT English text as before', async () => {
    // Regression control (passes on both sides of the fix). This is the guard
    // against "translated" quietly meaning "reworded": the English wording,
    // punctuation and the ₹ amount format are byte-for-byte what they were.
    const phone = nextPhone();
    const cust = await pool.query(
      `INSERT INTO customers (shop_id, name, phone, balance) VALUES ($1,$2,$3,$4) RETURNING *`,
      [ownerA.shop.id, 'Plain Cust', phone, 30000]
    );
    expect(cust.rows[0].customer_language).toBeNull();

    sendSpy.mockClear();
    await notifier.onTransaction(ownerA.shop.id, cust.rows[0], {
      type: 'purchase', amount: 45000, method: 'credit', note: 'two kg atta',
    });
    const [, text] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(text).toBe(
      'Hi Plain Cust, this is Lang Shop a.\n'
      + 'Purchase recorded: ₹450.00.\n'
      + 'Outstanding: ₹300.00.\n'
      + 'Note: two kg atta\n'
    );

    sendSpy.mockClear();
    await notifier.sendReminder(ownerA.shop.id, cust.rows[0]);
    const [, rem] = sendSpy.mock.calls[sendSpy.mock.calls.length - 1];
    expect(rem).toBe(
      'Hi Plain Cust, friendly reminder from Lang Shop a.\n'
      + 'Your outstanding amount is ₹300.00. Please pay at your convenience.'
    );
  });

  it('an override with no translation for a key falls back to the English source', async () => {
    // 'mr' has no wa.* overrides; the message must still be a sentence, never a
    // blank and never a raw key name.
    const t = await serverI18n.translator('mr');
    expect(t('wa.tx.outstanding', { amount: '₹10.00' })).toBe('Outstanding: ₹10.00.');
    expect(t('wa.tx.outstanding', { amount: '₹10.00' })).not.toContain('wa.tx');
  });
});

/* ----------------------------------------------------- the public surfaces */
describe('the public WhatsApp-link endpoints carry the reader’s language', () => {
  it('the public khata returns the customer language', async () => {
    const token = `${uniq}`.padStart(16, '0').slice(0, 16) + 'abcdef0123456789';
    await pool.query('UPDATE customers SET share_token = $1 WHERE id = $2', [token, shopper.customerId]);

    const res = await request(app).get(`/api/public/khata/${token}`);
    expect(res.status).toBe(200);
    // The reader's own language, so the page renders in it even when the link
    // is opened on somebody else's phone.
    expect(res.body.khata.language).toBe('ta');
  });
});

/* --------------------------------------------------- order-time stamping -- */
describe('placing an order carries the language onto that shop’s khata row', () => {
  it("stamps customer_language on a shop the shopper had not bought from before", async () => {
    await pool.query("UPDATE customer_users SET language = 'ta' WHERE id = $1", [shopper.userId]);

    // A product to order at shop B.
    const prod = await pool.query(
      `INSERT INTO products (shop_id, name, price, unit, is_active)
       VALUES ($1,'Test Rice',10000,'kg',true) RETURNING id`,
      [ownerB.shop.id]
    );
    const res = await withToken(request(app).post('/api/my/orders'), shopper.token).send({
      shop_id: ownerB.shop.id,
      items: [{ product_id: prod.rows[0].id, quantity: 1 }],
      fulfillment_type: 'pickup',
      payment_mode: 'credit',
    });
    expect(res.status).toBe(201);

    const row = await pool.query(
      'SELECT customer_language FROM customers WHERE shop_id = $1 AND phone = $2',
      [ownerB.shop.id, shopper.phone]
    );
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].customer_language).toBe('ta');
  });
});
