const { withTx, query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const notifier = require('../services/notification.service');

/**
 * Create a ledger entry.
 *  - type=purchase → customer owes more → balance +=
 *  - type=cash|upi → payment received → balance -=
 */
exports.create = async (req, res) => {
  const { customer_id, type, amount, method = 'credit', note } = req.body;
  const delta = type === 'purchase' ? Number(amount) : -Number(amount);

  const result = await withTx(async (client) => {
    const c = await client.query(
      'SELECT id, shop_id, name, phone, credit_limit, balance, notifications_enabled FROM customers WHERE id=$1 AND shop_id=$2 FOR UPDATE',
      [customer_id, req.user.shopId]
    );
    if (!c.rowCount) throw ApiError.notFound('Customer not found');
    const customer = c.rows[0];

    const newBalance = Number(customer.balance) + delta;
    if (type === 'purchase' && Number(customer.credit_limit) > 0 && newBalance > Number(customer.credit_limit)) {
      throw ApiError.unprocessable('Credit limit exceeded', {
        credit_limit: customer.credit_limit,
        current_balance: customer.balance,
        attempted: amount,
      });
    }

    const tx = await client.query(
      `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.user.shopId, customer_id, type, amount, method, note || null, req.user.sub]
    );

    await client.query(
      'UPDATE customers SET balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, customer_id]
    );

    return { transaction: tx.rows[0], customer: { ...customer, balance: newBalance } };
  });

  // Fire-and-forget WhatsApp notification based on shop notification mode
  notifier.onTransaction(req.user.shopId, result.customer, result.transaction).catch(() => {});

  res.status(201).json(result);
};

exports.list = async (req, res) => {
  const { customer_id, type, from, to } = req.query;
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const params = [req.user.shopId];
  let where = 'shop_id = $1';
  if (customer_id) { params.push(customer_id); where += ` AND customer_id = $${params.length}`; }
  if (type) { params.push(type); where += ` AND type = $${params.length}`; }
  if (from) { params.push(from); where += ` AND created_at >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND created_at <= $${params.length}`; }
  params.push(limit);
  const r = await query(
    `SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ items: r.rows });
};

exports.get = async (req, res) => {
  const r = await query(
    'SELECT * FROM transactions WHERE id = $1 AND shop_id = $2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Transaction not found');
  res.json({ transaction: r.rows[0] });
};
