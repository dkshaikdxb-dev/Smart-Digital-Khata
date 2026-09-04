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
      'SELECT id, shop_id, name, phone, credit_limit, balance, notifications_enabled, family_id, family_sub_limit FROM customers WHERE id=$1 AND shop_id=$2 FOR UPDATE',
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

    // Family credit enforcement (only relevant when this member is in a family
    // and the entry increases what is owed).
    if (type === 'purchase' && customer.family_id) {
      // (a) Per-member sub-limit within the family.
      if (customer.family_sub_limit != null && newBalance > Number(customer.family_sub_limit)) {
        throw ApiError.unprocessable('Family sub-limit exceeded', {
          family_sub_limit: customer.family_sub_limit,
          current_balance: customer.balance,
          attempted: amount,
        });
      }

      // (b) Shared family credit limit against the SUM of all members' balances.
      // Lock the family row to serialize concurrent purchases across members.
      const fam = await client.query(
        'SELECT id, credit_limit FROM families WHERE id=$1 AND shop_id=$2 FOR UPDATE',
        [customer.family_id, req.user.shopId]
      );
      if (fam.rowCount && Number(fam.rows[0].credit_limit) > 0) {
        const agg = await client.query(
          'SELECT COALESCE(SUM(balance),0) AS total FROM customers WHERE family_id=$1 AND shop_id=$2',
          [customer.family_id, req.user.shopId]
        );
        const combinedNew = Number(agg.rows[0].total) + delta;
        if (combinedNew > Number(fam.rows[0].credit_limit)) {
          throw ApiError.unprocessable('Family credit limit exceeded', {
            family_credit_limit: fam.rows[0].credit_limit,
            combined_balance: agg.rows[0].total,
            attempted: amount,
          });
        }
      }
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
