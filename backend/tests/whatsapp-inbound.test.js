// Integration tests for the WhatsApp inbound money commands (Fix 3).
// Requires a real Postgres (DATABASE_URL) with migrations applied — same
// socket-Postgres harness as the rest of the suite. WhatsApp sends are no-ops
// in test (WHATSAPP_* unset → sendText returns {skipped} without any network).
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const waInbound = require('../src/services/whatsapp-inbound.service');

const uniq = Date.now().toString().slice(-9);

let shopId;
let ownerPhoneNoPlus; // the WhatsApp sender (owner), with no leading '+'

// Build a minimal Meta inbound payload carrying one text message.
function payloadFor(fromNoPlus, body, msgId) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: msgId, type: 'text', from: fromNoPlus, text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  const reg = await request(app).post('/api/auth/register').send({
    name: 'WA Owner',
    email: `waowner_${uniq}@test.local`,
    phone: `+9188${uniq}`,
    password: 'password123',
    shopName: 'WhatsApp Test Shop',
  });
  expect(reg.status).toBe(201);
  shopId = reg.body.shop.id;
  ownerPhoneNoPlus = `9188${uniq}`; // register stored '+9188…'; sender comes without '+'
});

afterAll(async () => {
  if (shopId) await pool.query('DELETE FROM shops WHERE id = $1', [shopId]);
  await pool.end();
});

describe('findCustomer selection safety', () => {
  it('returns ambiguous (never a guess) when a name matches more than one customer', async () => {
    await pool.query(
      `INSERT INTO customers (shop_id, name, phone, balance) VALUES
         ($1,'Ramesh Kumar',$2,0),
         ($1,'Ramesh Verma',$3,0)`,
      [shopId, `+9170${uniq}`, `+9171${uniq}`]
    );
    const res = await waInbound.findCustomer(shopId, 'Ramesh');
    expect(res.ambiguous).toBe(true);
    expect(res.customer).toBeNull();
  });

  it('prefers an exact phone match', async () => {
    const res = await waInbound.findCustomer(shopId, `9170${uniq}`);
    expect(res.customer).toBeTruthy();
    expect(res.customer.name).toBe('Ramesh Kumar');
  });

  it('falls back to a name only when it matches exactly one customer', async () => {
    const res = await waInbound.findCustomer(shopId, 'Verma');
    expect(res.customer).toBeTruthy();
    expect(res.customer.name).toBe('Ramesh Verma');
    expect(res.ambiguous).toBeFalsy();
  });
});

describe('WhatsApp add command safety', () => {
  it('an ambiguous name does NOT mutate any customer balance', async () => {
    // Two 'Ramesh' rows already exist from the block above (both balance 0).
    await waInbound.handle(payloadFor(ownerPhoneNoPlus, 'add 100 Ramesh', `wa_amb_${uniq}`));

    const rows = await pool.query(
      `SELECT balance FROM customers WHERE shop_id = $1 AND name ILIKE '%Ramesh%'`,
      [shopId]
    );
    expect(rows.rowCount).toBe(2);
    for (const r of rows.rows) expect(Number(r.balance)).toBe(0);

    // And no whatsapp-sourced transaction was written.
    const tx = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transactions WHERE shop_id = $1 AND source = 'whatsapp'`,
      [shopId]
    );
    expect(tx.rows[0].n).toBe(0);
  });

  it('an add that would exceed the credit limit is rejected (balance unchanged)', async () => {
    const cust = await pool.query(
      `INSERT INTO customers (shop_id, name, phone, credit_limit, balance)
       VALUES ($1,'Solo Buyer',$2,10000,0) RETURNING id`,
      [shopId, `+9172${uniq}`]
    );
    const custId = cust.rows[0].id;

    // 200 rupees = 20000 paise > 10000 credit limit → rejected, no mutation.
    await waInbound.handle(payloadFor(ownerPhoneNoPlus, `add 200 9172${uniq}`, `wa_over_${uniq}`));
    let bal = await pool.query('SELECT balance FROM customers WHERE id = $1', [custId]);
    expect(Number(bal.rows[0].balance)).toBe(0);

    // A within-limit add is applied normally.
    await waInbound.handle(payloadFor(ownerPhoneNoPlus, `add 50 9172${uniq}`, `wa_ok_${uniq}`));
    bal = await pool.query('SELECT balance FROM customers WHERE id = $1', [custId]);
    expect(Number(bal.rows[0].balance)).toBe(5000);
  });
});
