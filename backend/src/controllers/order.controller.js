const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');

// Owner/staff order management, scoped to req.user.shopId. A shop only ever
// sees and mutates its OWN orders.

// Linear status pipeline. A "forward move" is any status with a strictly higher
// rank; 'cancelled' is a valid move from any non-terminal status. Anything else
// (backward, same, or unknown) is a nonsense transition.
const STATUS_RANK = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  completed: 5,
};
const TERMINAL = new Set(['completed', 'cancelled']);

/**
 * GET /orders?status= — this shop's orders (optional status filter), newest
 * first, with the customer's name/phone and an item count.
 */
exports.list = async (req, res) => {
  const params = [req.user.shopId];
  let where = 'o.shop_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND o.status = $${params.length}`;
  }
  const r = await query(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
            COUNT(oi.id)::int AS item_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${where}
     GROUP BY o.id, c.name, c.phone
     ORDER BY o.created_at DESC`,
    params
  );
  res.json({ items: r.rows });
};

/**
 * GET /orders/:id — full detail (items + customer). 404 if not this shop's.
 */
exports.get = async (req, res) => {
  const r = await query(
    `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.shop_id = $2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');

  const items = await query(
    `SELECT id, product_id, name, unit_price, quantity, line_total
     FROM order_items WHERE order_id = $1 ORDER BY name ASC`,
    [req.params.id]
  );
  res.json({ order: { ...r.rows[0], items: items.rows } });
};

/**
 * PATCH /orders/:id/status { status } — advance the order.
 *  - A completed/cancelled order is terminal → 409.
 *  - Only a strictly-forward move or 'cancelled' is allowed → else 422.
 * On success the customer is notified over WhatsApp (respecting
 * notifications_enabled), fire-and-forget.
 */
exports.updateStatus = async (req, res) => {
  const { status: next } = req.body;

  const result = await withTx(async (client) => {
    const r = await client.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
              c.notifications_enabled, s.name AS shop_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1 AND o.shop_id = $2
       FOR UPDATE OF o`,
      [req.params.id, req.user.shopId]
    );
    if (!r.rowCount) throw ApiError.notFound('Order not found');
    const order = r.rows[0];

    if (TERMINAL.has(order.status)) {
      throw ApiError.conflict('Cannot modify a completed or cancelled order');
    }

    const forward = next === 'cancelled' || STATUS_RANK[next] > STATUS_RANK[order.status];
    if (!forward) {
      throw ApiError.unprocessable('Invalid status transition', {
        from: order.status,
        to: next,
      });
    }

    const upd = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [next, order.id]
    );
    return {
      order: upd.rows[0],
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        notifications_enabled: order.notifications_enabled,
      },
      shopName: order.shop_name,
    };
  });

  if (result.customer.notifications_enabled !== false) {
    whatsapp
      .sendText(
        result.customer.phone,
        `Hi ${result.customer.name}, your order at ${result.shopName} is now ${result.order.status}.`
      )
      .catch(() => {});
  }

  res.json({ order: result.order });
};
