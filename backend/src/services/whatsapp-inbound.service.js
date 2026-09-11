const { query, withTx } = require('../config/db');
const logger = require('../utils/logger');
const whatsapp = require('./whatsapp.service');
const { maybeActivateReferral } = require('../utils/referral');

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

  const match = await findCustomer(shop_id, parsed.target);
  if (match.ambiguous) {
    // A name matched more than one customer — do NOT guess and move money onto a
    // random customer. Ask the sender to disambiguate with a phone number.
    await whatsapp.sendText(
      fromPhone,
      `More than one customer matches "${parsed.target}". Please use the customer's phone number instead.`
    );
    return;
  }
  const customer = match.customer;
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

  // A rejection message set inside the tx and sent after rollback.
  let rejection = null;
  const committed = await withTx(async (client) => {
    // Lock the customer row and read fresh limits (mirrors transaction.controller).
    const cRes = await client.query(
      `SELECT id, balance, credit_limit, family_id, family_sub_limit
       FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [customer.id, shop_id]
    );
    if (!cRes.rowCount) {
      rejection = `Customer "${parsed.target}" not found.`;
      return null;
    }
    const c = cRes.rows[0];
    const newBalance = Number(c.balance) + delta;

    // Credit / family-limit enforcement — ONLY a `purchase` (add) increases what
    // is owed, so only that path is gated (mirrors transaction.controller).
    if (parsed.action === 'add') {
      const limitMsg = await purchaseLimitError(client, c, shop_id, newBalance);
      if (limitMsg) {
        rejection = `Cannot add ₹${parsed.amount.toFixed(2)} for ${customer.name}: ${limitMsg}.`;
        return null;
      }
    }

    await client.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
       VALUES ($1,$2,$3,$4,$5,$6,'whatsapp')`,
      [shop_id, customer.id, txType, amountPaise, txType === 'purchase' ? 'credit' : txType, parsed.note || null]
    );
    await client.query(
      `UPDATE customers SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [delta, customer.id]
    );
    return { newBalance };
  });

  if (rejection) {
    await whatsapp.sendText(fromPhone, rejection);
    return;
  }

  // A `paid`/`upi` command records a cash/upi COLLECTION for this shop — activate
  // its referral on the first one. AFTER the DB commit; swallows its own errors.
  if (txType === 'cash' || txType === 'upi') {
    await maybeActivateReferral(shop_id);
  }

  const newBal = committed.newBalance;
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

/**
 * Resolve the customer a WhatsApp command targets, safely.
 *   - An EXACT phone match (with or without the +country prefix) always wins.
 *   - Otherwise fall back to a name match ONLY when it identifies EXACTLY ONE
 *     customer. A name that matches 0 or >1 customers must NOT be guessed —
 *     applying money to a random customer is worse than doing nothing.
 * Deterministic ORDER BY so results never depend on scan order.
 * @returns {{ customer: object|null, ambiguous?: boolean }}
 */
async function findCustomer(shopId, target) {
  // 1) Exact phone (either stored form). Deterministic pick if a shop somehow
  //    has duplicate phones.
  const byPhone = await query(
    `SELECT id, name, phone, balance, credit_limit, family_id, family_sub_limit
     FROM customers
     WHERE shop_id = $1 AND (phone = $2 OR phone = $3)
     ORDER BY id ASC
     LIMIT 1`,
    [shopId, target, `+${target}`]
  );
  if (byPhone.rowCount) return { customer: byPhone.rows[0] };

  // 2) Name fallback — only when it uniquely identifies one customer.
  const byName = await query(
    `SELECT id, name, phone, balance, credit_limit, family_id, family_sub_limit
     FROM customers
     WHERE shop_id = $1 AND name ILIKE $2
     ORDER BY id ASC
     LIMIT 2`,
    [shopId, `%${target}%`]
  );
  if (byName.rowCount === 1) return { customer: byName.rows[0] };
  if (byName.rowCount > 1) return { customer: null, ambiguous: true };
  return { customer: null };
}

/**
 * Credit / family-limit check for a `purchase` (add) that raises `newBalance`.
 * Mirrors the enforcement in transaction.controller.create. Returns a short
 * human-readable reason string when the addition would breach a limit, or null
 * when it is allowed. Runs inside the caller's transaction (locks the family row
 * FOR UPDATE, exactly like the owner flow) so concurrent purchases serialize.
 */
async function purchaseLimitError(client, customer, shopId, newBalance) {
  if (Number(customer.credit_limit) > 0 && newBalance > Number(customer.credit_limit)) {
    return 'credit limit exceeded';
  }
  if (customer.family_id) {
    if (customer.family_sub_limit != null && newBalance > Number(customer.family_sub_limit)) {
      return 'family sub-limit exceeded';
    }
    const fam = await client.query(
      'SELECT id, credit_limit FROM families WHERE id=$1 AND shop_id=$2 FOR UPDATE',
      [customer.family_id, shopId]
    );
    if (fam.rowCount && Number(fam.rows[0].credit_limit) > 0) {
      const agg = await client.query(
        'SELECT COALESCE(SUM(balance),0) AS total FROM customers WHERE family_id=$1 AND shop_id=$2',
        [customer.family_id, shopId]
      );
      const delta = newBalance - Number(customer.balance);
      const combinedNew = Number(agg.rows[0].total) + delta;
      if (combinedNew > Number(fam.rows[0].credit_limit)) {
        return 'family credit limit exceeded';
      }
    }
  }
  return null;
}

module.exports = { handle, findCustomer, purchaseLimitError };
