const crypto = require('crypto');
const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');
const { relinkCustomerPhone } = require('../utils/customer-merge');
const {
  buildStatement,
  defaultRange,
  statementCsvRows,
  sendCsv,
} = require('../utils/statement');

exports.list = async (req, res) => {
  const search = (req.query.search || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Number(req.query.offset || 0);

  const params = [req.user.shopId];
  let where = 'shop_id = $1';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }
  params.push(limit, offset);
  const r = await query(
    `SELECT id, name, phone, credit_limit, balance, status, notifications_enabled, created_at
     FROM customers WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ items: r.rows, limit, offset });
};

exports.create = async (req, res) => {
  const { name, phone, credit_limit = 0, notes = null } = req.body;
  try {
    const r = await query(
      `INSERT INTO customers (shop_id, name, phone, credit_limit, notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.user.shopId, name, phone, credit_limit, notes]
    );
    res.status(201).json({ customer: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      throw ApiError.conflict('A customer with that phone number already exists in this shop');
    }
    throw err;
  }
};

exports.get = async (req, res) => {
  const r = await query(
    'SELECT * FROM customers WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ customer: r.rows[0] });
};

exports.update = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(req.body)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (!fields.length) return res.json({ ok: true });
  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE customers SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING *`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json({ customer: r.rows[0] });
};

/**
 * POST /customers/:id/change-phone — the explicit, merge-aware way for an
 * owner/staff to move one of THIS shop's customers to a new number. Normalizes to
 * E.164, then:
 *   - new number is free in this shop → rename in place;
 *   - new number already belongs to ANOTHER customer here → 409 (merge_required)
 *     unless merge:true, in which case the two ledgers are combined money-exactly
 *     via relinkCustomerPhone (source = :id → target = the existing new-phone row).
 * Every change is audited in phone_changes (changed_by='owner'). The existing
 * PATCH still works for plain edits; this is the safe path the UI calls.
 */
exports.changePhone = async (req, res) => {
  const phone = toE164(req.body.phone);
  const merge = req.body.merge === true;

  const own = await query(
    'SELECT id, phone FROM customers WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');
  const source = own.rows[0];

  if (source.phone === phone) {
    const same = await query('SELECT * FROM customers WHERE id = $1', [source.id]);
    return res.json({ customer: same.rows[0], merged: false });
  }

  // Does another customer in this shop already hold the new number?
  const coll = await query(
    'SELECT id FROM customers WHERE shop_id = $1 AND phone = $2',
    [req.user.shopId, phone]
  );
  const collision = coll.rowCount && coll.rows[0].id !== source.id;
  if (collision && !merge) {
    throw ApiError.conflict('A customer already has this number in this shop — merge?', {
      code: 'merge_required',
      target_customer_id: coll.rows[0].id,
    });
  }

  const result = await withTx(async (client) => {
    const outcome = await relinkCustomerPhone(client, {
      shopId: req.user.shopId,
      fromPhone: source.phone,
      toPhone: phone,
    });
    await client.query(
      `INSERT INTO phone_changes (customer_user_id, from_phone, to_phone, changed_by, actor_id, shops_relinked)
       VALUES (NULL,$1,$2,'owner',$3,$4)`,
      [source.phone, phone, req.user.sub, outcome.relinked ? 1 : 0]
    );
    const cust = await client.query('SELECT * FROM customers WHERE id = $1', [outcome.customerId]);
    return { customer: cust.rows[0], merged: outcome.merged };
  });

  res.json({ customer: result.customer, merged: result.merged });
};

/**
 * Generate (or reuse) the customer's read-only khata link and optionally
 * WhatsApp it to them. The link needs no login — the unguessable token IS
 * the access. Owner can revoke by regenerating (regenerate=true).
 */
exports.shareLink = async (req, res) => {
  const own = await query(
    'SELECT id, name, phone, share_token, notifications_enabled FROM customers WHERE id=$1 AND shop_id=$2',
    [req.params.id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');
  const customer = own.rows[0];

  let token = customer.share_token;
  if (!token || req.body?.regenerate === true) {
    token = crypto.randomBytes(16).toString('hex');
    await query('UPDATE customers SET share_token=$1, updated_at=NOW() WHERE id=$2', [token, customer.id]);
  }

  const base = process.env.ADMIN_URL || process.env.APP_URL || '';
  const link = `${base}/khata/${token}`;

  let sent = false;
  if (req.body?.send === true && customer.notifications_enabled !== false) {
    const shopRes = await query('SELECT name FROM shops WHERE id=$1', [req.user.shopId]);
    const shopName = shopRes.rows[0]?.name || 'your shop';
    await whatsapp
      .sendText(customer.phone, `Hi ${customer.name}, view your khata with ${shopName} anytime here:\n${link}`)
      .then(() => { sent = true; })
      .catch(() => {});
  }

  res.json({ ok: true, link, sent });
};

/** Public, unauthenticated: the customer's own khata via share token. */
exports.publicKhata = async (req, res) => {
  const { token } = req.params;
  if (!/^[a-f0-9]{32}$/.test(token)) throw ApiError.notFound('Khata not found');

  const r = await query(
    `SELECT c.id, c.name, c.balance, c.share_token, s.name AS shop_name
     FROM customers c JOIN shops s ON s.id = c.shop_id
     WHERE c.share_token = $1 AND c.status = 'active'`,
    [token]
  );
  if (!r.rowCount) throw ApiError.notFound('Khata not found');
  const customer = r.rows[0];

  const tx = await query(
    `SELECT type, amount, method, note, created_at
     FROM transactions WHERE customer_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [customer.id]
  );

  res.json({
    khata: {
      customer_name: customer.name,
      shop_name: customer.shop_name,
      balance: customer.balance,
      transactions: tx.rows,
    },
  });
};

/**
 * GET /customers/:id/statement?from=&to=&format=json|csv — a full account
 * statement (opening balance, dated lines, closing balance, totals) for one of
 * THIS shop's customers, for printing or handing over. Scoped to req.user.shopId
 * (404 for another shop's customer). Reuses the shared buildStatement() helper so
 * the math matches the consumer endpoint exactly.
 */
exports.statement = async (req, res) => {
  const { id } = req.params;
  const own = await query(
    'SELECT id, name, phone FROM customers WHERE id = $1 AND shop_id = $2',
    [id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');
  const customer = own.rows[0];

  const { from, to } = defaultRange(req.query.from, req.query.to);
  if (from > to) throw ApiError.badRequest('The "from" date must be on or before the "to" date');

  const stmt = await buildStatement(id, from, to);

  if (req.query.format === 'csv') {
    const rows = statementCsvRows(stmt, { customerName: customer.name });
    return sendCsv(res, `statement-${id}-${from}-to-${to}.csv`, rows);
  }
  res.json({
    from,
    to,
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    statement: stmt,
  });
};

exports.ledger = async (req, res) => {
  const { id } = req.params;
  const own = await query(
    'SELECT id, name, phone, credit_limit, balance FROM customers WHERE id=$1 AND shop_id=$2',
    [id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');

  const tx = await query(
    `SELECT id, type, amount, method, note, created_at
     FROM transactions
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [id]
  );
  res.json({ customer: own.rows[0], transactions: tx.rows });
};
