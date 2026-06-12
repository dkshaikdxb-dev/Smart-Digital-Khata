const { query, withTx } = require('../config/db');
const logger = require('../utils/logger');
const whatsapp = require('./whatsapp.service');

/**
 * Parses an inbound WhatsApp text message and turns it into a ledger entry.
 * Supported command shapes (case-insensitive):
 *   add <amount> <customer phone or name>
 *   paid <amount> <customer phone or name>   (cash)
 *   upi  <amount> <customer phone or name>
 *   balance <customer phone or name>
 * Examples:
 *   add 250 9876543210
 *   paid 500 Ramesh
 *   upi 120 9876543210 tea & sugar
 */
async function handle(payload, { alreadyProcessed } = {}) {
  const entries = payload?.entry || [];
  for (const e of entries) {
    for (const change of e.changes || []) {
      const messages = change.value?.messages || [];
      for (const m of messages) {
        if (m.type !== 'text') continue;
        if (alreadyProcessed && (await alreadyProcessed(m.id))) {
          logger.info({ id: m.id }, 'WA message already processed');
          continue;
        }
        const from = m.from; // no '+'
        const text = m.text.body.trim();
        await processMessage(from, text).catch((err) =>
          logger.warn({ err: err.message, from, text }, 'processMessage failed')
        );
      }
    }
  }
}

async function processMessage(fromPhone, text) {
  // Look up the user by phone → get their shop
  const userRes = await query(
    `SELECT u.id, u.shop_id FROM users u WHERE u.phone = $1 OR u.phone = $2`,
    [fromPhone, `+${fromPhone}`]
  );
  if (!userRes.rowCount) {
    await whatsapp.sendText(fromPhone, 'Number not registered with Smart Digital Khata. Please sign up first.');
    return;
  }
  const { shop_id } = userRes.rows[0];

  const parsed = parseCommand(text);
  if (!parsed) {
    await whatsapp.sendText(
      fromPhone,
      'Unrecognised command. Try:\n' +
        'add 250 9876543210\n' +
        'paid 500 Ramesh\n' +
        'upi 120 9876543210\n' +
        'balance 9876543210'
    );
    return;
  }

  const customer = await findCustomer(shop_id, parsed.target);
  if (!customer) {
    await whatsapp.sendText(fromPhone, `Customer "${parsed.target}" not found.`);
    return;
  }

  if (parsed.action === 'balance') {
    await whatsapp.sendText(
      fromPhone,
      `${customer.name} — Outstanding: ₹${(customer.balance / 100).toFixed(2)}`
    );
    return;
  }

  const amountPaise = Math.round(parsed.amount * 100);
  const delta = parsed.action === 'add' ? amountPaise : -amountPaise;
  const txType = parsed.action === 'add' ? 'purchase' : parsed.action === 'upi' ? 'upi' : 'cash';

  await withTx(async (client) => {
    await client.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
       VALUES ($1,$2,$3,$4,$5,$6,'whatsapp')`,
      [shop_id, customer.id, txType, amountPaise, txType === 'purchase' ? 'credit' : txType, parsed.note || null]
    );
    await client.query(
      `UPDATE customers SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [delta, customer.id]
    );
  });

  const newBal = Number(customer.balance) + delta;
  await whatsapp.sendText(
    fromPhone,
    `OK. ${parsed.action === 'add' ? 'Added' : 'Received'} ₹${parsed.amount.toFixed(2)} for ${customer.name}.\n` +
      `New balance: ₹${(newBal / 100).toFixed(2)}`
  );
}

function parseCommand(text) {
  const lower = text.toLowerCase();
  const m = lower.match(/^(add|paid|upi|cash|balance)\s+(.*)$/i);
  if (!m) return null;
  const action = m[1] === 'cash' ? 'paid' : m[1];
  const rest = m[2].trim();

  if (action === 'balance') return { action: 'balance', target: rest };

  const am = rest.match(/^([0-9]+(?:\.[0-9]{1,2})?)\s+(.*)$/);
  if (!am) return null;
  const amount = parseFloat(am[1]);
  const tail = am[2].trim();
  const tokens = tail.split(/\s+/);
  const target = tokens[0];
  const note = tokens.slice(1).join(' ') || null;
  return { action, amount, target, note };
}

async function findCustomer(shopId, target) {
  const r = await query(
    `SELECT id, name, phone, balance FROM customers
     WHERE shop_id = $1
       AND (phone = $2 OR phone = $3 OR name ILIKE $4)
     LIMIT 1`,
    [shopId, target, `+${target}`, `%${target}%`]
  );
  return r.rows[0] || null;
}

module.exports = { handle };
