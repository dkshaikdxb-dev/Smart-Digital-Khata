const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const notifier = require('../services/notification.service');

exports.remindCustomer = async (req, res) => {
  const r = await query(
    'SELECT * FROM customers WHERE id=$1 AND shop_id=$2',
    [req.params.customerId, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  await notifier.sendReminder(req.user.shopId, r.rows[0]);
  res.json({ ok: true });
};

exports.broadcast = async (req, res) => {
  const mode = req.body.mode || 'outstanding';
  const where = mode === 'outstanding' ? 'shop_id=$1 AND balance > 0 AND status=\'active\'' : 'shop_id=$1 AND status=\'active\'';
  const r = await query(`SELECT * FROM customers WHERE ${where} LIMIT 500`, [req.user.shopId]);
  let sent = 0;
  for (const c of r.rows) {
    await notifier.sendReminder(req.user.shopId, c);
    sent += 1;
  }
  res.json({ ok: true, sent });
};
