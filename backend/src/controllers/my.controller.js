const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const { toE164 } = require('../utils/phone');

// Customer-facing cross-shop khata. Every row is derived from the `customers`
// table by matching the authenticated customer's phone — a customer can only
// ever see (and pay) shops where a record exists for THEIR phone.

/**
 * GET /my/khata — everything this customer owes across every shop.
 */
exports.khata = async (req, res) => {
  const phone = toE164(req.customerUser.phone);

  const r = await query(
    `SELECT c.shop_id, s.name AS shop_name, c.id AS customer_id, c.balance, c.credit_limit
     FROM customers c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.phone = $1
     ORDER BY s.name ASC`,
    [phone]
  );

  const shops = r.rows;
  const total_outstanding = shops.reduce((sum, s) => sum + Number(s.balance), 0);

  res.json({ total_outstanding, shops });
};

/**
 * GET /my/khata/:shopId — this customer's ledger at a single shop.
 */
exports.shopKhata = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shopId } = req.params;

  const own = await query(
    `SELECT c.id AS customer_id, c.balance, s.name AS shop_name
     FROM customers c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.phone = $1 AND c.shop_id = $2`,
    [phone, shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('No khata found at this shop');
  const row = own.rows[0];

  const tx = await query(
    `SELECT id, type, amount, method, note, created_at
     FROM transactions
     WHERE customer_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [row.customer_id]
  );

  res.json({
    shop_name: row.shop_name,
    customer_id: row.customer_id,
    balance: row.balance,
    transactions: tx.rows,
  });
};

/**
 * POST /my/pay { shop_id, amount } — pay any shop this customer owes.
 * Creates a payment_orders row + a Razorpay hosted Payment Link, exactly like
 * the owner-initiated flow. The webhook reconciles by provider ids regardless
 * of who initiated, so a customer-initiated order settles the same way.
 */
exports.pay = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shop_id, amount } = req.body;

  const own = await query(
    `SELECT c.id, c.name, c.phone, c.balance, s.name AS shop_name
     FROM customers c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.phone = $1 AND c.shop_id = $2`,
    [phone, shop_id]
  );
  if (!own.rowCount) throw ApiError.notFound('No khata found at this shop');
  const customer = own.rows[0];

  // Never let a customer overpay what they owe at this shop.
  if (amount > Number(customer.balance)) {
    throw ApiError.unprocessable('Amount exceeds your outstanding balance at this shop');
  }

  if (!(await razorpay.isConfiguredForShop(shop_id))) {
    throw ApiError.badRequest('This shop has not connected Razorpay yet.');
  }

  const receipt = `c_${customer.id.slice(0, 8)}_${Date.now()}`;
  const order = await razorpay.createOrderForShop(shop_id, {
    amount,
    receipt,
    notes: { shop_id, customer_id: customer.id, note: 'Customer self-pay' },
  });

  const inserted = await query(
    `INSERT INTO payment_orders
       (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes)
     VALUES ($1,$2,$3,$4,'INR','created','razorpay',$5,$6)
     RETURNING *`,
    [order.receipt, shop_id, customer.id, amount, order.id, null]
  );
  const orderRow = inserted.rows[0];

  let link;
  try {
    const paymentLink = await razorpay.createPaymentLinkForShop(shop_id, {
      amount: orderRow.amount,
      description: `Payment to ${customer.shop_name}`,
      customer: {
        name: customer.name,
        contact: toE164(customer.phone),
      },
      reference_id: orderRow.id,
      notes: { shop_id, customer_id: customer.id, order_id: orderRow.id },
      callback_url: `${process.env.APP_URL || ''}/api/payments/orders/${orderRow.id}/return`,
    });
    link = paymentLink.short_url;
    await query(
      `UPDATE payment_orders SET provider_link_id = $1, provider_link_url = $2 WHERE id = $3`,
      [paymentLink.id, link, orderRow.id]
    );
  } catch (err) {
    throw ApiError.badRequest('Failed to create payment link', err.error?.description || err.message);
  }

  res.status(201).json({ link, order_id: orderRow.id });
};

// ---------------------------------------------------------------------------
// Orders (M5b) — a customer orders from a shop's catalog. Orders are CREDIT
// (added to the khata) or PREPAID (paid online to the shop's own Razorpay).
// Every /my/orders row is scoped to the authenticated customer's phone.
// ---------------------------------------------------------------------------

/**
 * Resolve (locking FOR UPDATE) the customer's `customers` row at a shop by
 * phone, auto-creating one if the customer has never dealt with this shop —
 * so a customer can order from a brand-new shop. Runs inside a transaction.
 */
async function resolveOrCreateCustomer(client, shopId, phone) {
  const existing = await client.query(
    `SELECT id, shop_id, name, phone, credit_limit, balance,
            family_id, family_sub_limit
     FROM customers WHERE shop_id = $1 AND phone = $2 FOR UPDATE`,
    [shopId, phone]
  );
  if (existing.rowCount) return existing.rows[0];

  // Verify the shop exists before auto-creating (nicer than an FK error).
  const shop = await client.query('SELECT id FROM shops WHERE id = $1', [shopId]);
  if (!shop.rowCount) throw ApiError.notFound('Shop not found');

  const nameRes = await client.query(
    'SELECT name FROM customer_users WHERE phone = $1',
    [phone]
  );
  const name = (nameRes.rows[0] && nameRes.rows[0].name) || 'Customer';
  const created = await client.query(
    `INSERT INTO customers (shop_id, name, phone)
     VALUES ($1, $2, $3)
     RETURNING id, shop_id, name, phone, credit_limit, balance,
               family_id, family_sub_limit`,
    [shopId, name, phone]
  );
  return created.rows[0];
}

/** Load & validate the ordered products; return snapshot line items + subtotal. */
async function buildLineItems(shopId, items) {
  const ids = items.map((i) => i.product_id);
  const prodRes = await query(
    `SELECT id, name, price, is_active FROM products
     WHERE shop_id = $1 AND id = ANY($2::uuid[])`,
    [shopId, ids]
  );
  const byId = Object.fromEntries(prodRes.rows.map((p) => [p.id, p]));

  const lines = [];
  let subtotal = 0;
  for (const item of items) {
    const p = byId[item.product_id];
    if (!p) throw ApiError.unprocessable('Product not available at this shop', { product_id: item.product_id });
    if (!p.is_active) throw ApiError.unprocessable('Product is not available', { product_id: item.product_id });
    const unitPrice = Number(p.price);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    lines.push({ product_id: p.id, name: p.name, unit_price: unitPrice, quantity: item.quantity, line_total: lineTotal });
  }
  return { lines, subtotal };
}

async function insertOrderItems(client, orderId, lines) {
  const out = [];
  for (const l of lines) {
    const r = await client.query(
      `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, product_id, name, unit_price, quantity, line_total`,
      [orderId, l.product_id, l.name, l.unit_price, l.quantity, l.line_total]
    );
    out.push(r.rows[0]);
  }
  return out;
}

/**
 * POST /my/orders — place an order at a shop.
 * credit  → order + items + a khata `purchase` transaction (credit-limit
 *           enforced exactly like the owner transaction flow), all in one tx.
 * prepaid → order + items + a payment_orders row (linked via order_id) + a
 *           Razorpay order & hosted pay link, all in one tx (a failure — DB or
 *           Razorpay — rolls back and creates nothing). No khata entry.
 */
exports.createOrder = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shop_id, items, fulfillment_type, payment_mode, address, note } = req.body;

  if (!items.length) throw ApiError.unprocessable('Order must have at least one item');
  if (fulfillment_type === 'delivery' && !(address && address.trim())) {
    throw ApiError.unprocessable('A delivery address is required for delivery orders');
  }

  const { lines, subtotal } = await buildLineItems(shop_id, items);

  // Fulfillment settings gate the order and decide the delivery fee (MONEY).
  const shopRes = await query(
    `SELECT id, offers_pickup, offers_delivery, delivery_fee, free_delivery_min, delivery_min_order
       FROM shops WHERE id = $1`,
    [shop_id]
  );
  if (!shopRes.rowCount) throw ApiError.notFound('Shop not found');
  const shop = shopRes.rows[0];

  // Mode availability.
  if (fulfillment_type === 'delivery' && !shop.offers_delivery) {
    throw ApiError.badRequest('This shop does not offer delivery.');
  }
  if (fulfillment_type === 'pickup' && !shop.offers_pickup) {
    throw ApiError.badRequest('This shop does not offer pickup.');
  }

  // Delivery-only minimum-order gate.
  const deliveryMinOrder = Number(shop.delivery_min_order) || 0;
  if (fulfillment_type === 'delivery' && subtotal < deliveryMinOrder) {
    throw ApiError.unprocessable(
      `Minimum order for delivery is ₹${(deliveryMinOrder / 100).toFixed(2)}`,
      { delivery_min_order: deliveryMinOrder, subtotal }
    );
  }

  // Delivery fee: pickup is always free; for delivery the flat fee applies
  // unless a free-delivery threshold is met. All integer paise.
  const freeMin = shop.free_delivery_min == null ? null : Number(shop.free_delivery_min);
  const fee =
    fulfillment_type === 'delivery' && !(freeMin != null && subtotal >= freeMin)
      ? Number(shop.delivery_fee) || 0
      : 0;
  const total = subtotal + fee;

  if (payment_mode === 'credit') {
    const result = await withTx(async (client) => {
      const customer = await resolveOrCreateCustomer(client, shop_id, phone);

      // Enforce credit limits exactly like transaction.controller: a credit
      // order is a `purchase` that increases what the customer owes. The khata
      // is credited with the ORDER TOTAL (subtotal + delivery fee), so limits
      // are enforced against `total`, not the bare subtotal.
      const newBalance = Number(customer.balance) + total;
      if (Number(customer.credit_limit) > 0 && newBalance > Number(customer.credit_limit)) {
        throw ApiError.unprocessable('Credit limit exceeded', {
          credit_limit: customer.credit_limit,
          current_balance: customer.balance,
          attempted: total,
        });
      }
      if (customer.family_id) {
        if (customer.family_sub_limit != null && newBalance > Number(customer.family_sub_limit)) {
          throw ApiError.unprocessable('Family sub-limit exceeded', {
            family_sub_limit: customer.family_sub_limit,
            current_balance: customer.balance,
            attempted: total,
          });
        }
        const fam = await client.query(
          'SELECT id, credit_limit FROM families WHERE id=$1 AND shop_id=$2 FOR UPDATE',
          [customer.family_id, shop_id]
        );
        if (fam.rowCount && Number(fam.rows[0].credit_limit) > 0) {
          const agg = await client.query(
            'SELECT COALESCE(SUM(balance),0) AS total FROM customers WHERE family_id=$1 AND shop_id=$2',
            [customer.family_id, shop_id]
          );
          const combinedNew = Number(agg.rows[0].total) + total;
          if (combinedNew > Number(fam.rows[0].credit_limit)) {
            throw ApiError.unprocessable('Family credit limit exceeded', {
              family_credit_limit: fam.rows[0].credit_limit,
              combined_balance: agg.rows[0].total,
              attempted: total,
            });
          }
        }
      }

      const ord = await client.query(
        `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, delivery_fee, address, note)
         VALUES ($1,$2,'pending',$3,'credit','not_required',$4,$5,$6,$7)
         RETURNING *`,
        [shop_id, customer.id, fulfillment_type, subtotal, fee, address || null, note || null]
      );
      const order = ord.rows[0];
      const orderItems = await insertOrderItems(client, order.id, lines);

      await client.query(
        `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
         VALUES ($1,$2,'purchase',$3,'credit',$4,'api')`,
        [shop_id, customer.id, total, `Order ${order.id}`]
      );
      await client.query(
        'UPDATE customers SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance, customer.id]
      );

      return { order: { ...order, items: orderItems, total } };
    });

    return res.status(201).json(result);
  }

  // prepaid
  if (!(await razorpay.isConfiguredForShop(shop_id))) {
    throw ApiError.badRequest('This shop cannot take online payments yet.');
  }

  const result = await withTx(async (client) => {
    const customer = await resolveOrCreateCustomer(client, shop_id, phone);

    const ord = await client.query(
      `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, delivery_fee, address, note)
       VALUES ($1,$2,'pending',$3,'prepaid','pending',$4,$5,$6,$7)
       RETURNING *`,
      [shop_id, customer.id, fulfillment_type, subtotal, fee, address || null, note || null]
    );
    const order = ord.rows[0];
    const orderItems = await insertOrderItems(client, order.id, lines);

    // The customer pays the ORDER TOTAL (subtotal + delivery fee) online.
    const receipt = `o_${order.id.slice(0, 8)}_${Date.now()}`;
    const rzpOrder = await razorpay.createOrderForShop(shop_id, {
      amount: total,
      receipt,
      notes: { shop_id, customer_id: customer.id, order_id: order.id },
    });

    const po = await client.query(
      `INSERT INTO payment_orders
         (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes, order_id)
       VALUES ($1,$2,$3,$4,'INR','created','razorpay',$5,$6,$7)
       RETURNING *`,
      [rzpOrder.receipt, shop_id, customer.id, total, rzpOrder.id, `Order ${order.id}`, order.id]
    );
    const orderRow = po.rows[0];

    const paymentLink = await razorpay.createPaymentLinkForShop(shop_id, {
      amount: orderRow.amount,
      description: `Order at shop`,
      customer: { name: customer.name, contact: toE164(customer.phone) },
      reference_id: orderRow.id,
      notes: { shop_id, customer_id: customer.id, order_id: order.id },
      callback_url: `${process.env.APP_URL || ''}/api/payments/orders/${orderRow.id}/return`,
    });
    await client.query(
      `UPDATE payment_orders SET provider_link_id = $1, provider_link_url = $2 WHERE id = $3`,
      [paymentLink.id, paymentLink.short_url, orderRow.id]
    );

    return { order: { ...order, items: orderItems, total }, pay_link: paymentLink.short_url };
  });

  return res.status(201).json(result);
};

/**
 * GET /my/orders — this customer's orders across every shop, newest first,
 * with shop_name + item count.
 */
exports.listOrders = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const r = await query(
    `SELECT o.*, (o.subtotal + o.delivery_fee) AS total,
            s.name AS shop_name, COUNT(oi.id)::int AS item_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN shops s ON s.id = o.shop_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE c.phone = $1
     GROUP BY o.id, s.name
     ORDER BY o.created_at DESC`,
    [phone]
  );
  res.json({ items: r.rows });
};

/**
 * GET /my/orders/:id — order detail incl items. 404 if not this customer's.
 */
exports.getOrder = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const r = await query(
    `SELECT o.*, (o.subtotal + o.delivery_fee) AS total, s.name AS shop_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN shops s ON s.id = o.shop_id
     WHERE o.id = $1 AND c.phone = $2`,
    [req.params.id, phone]
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
 * POST /my/orders/:id/cancel — cancel a still-pending order (else 409).
 * credit  → REVERSE the khata: insert a compensating `cash` (payment-in) entry
 *           for the subtotal and decrement the balance, so the ledger stays
 *           honest (the original purchase entry remains, netted by the reversal).
 * prepaid unpaid → just cancel.
 * prepaid already paid → cancel + note that a refund is manual (no auto-refund).
 */
exports.cancelOrder = async (req, res) => {
  const phone = toE164(req.customerUser.phone);

  const result = await withTx(async (client) => {
    const r = await client.query(
      `SELECT o.*, c.id AS cust_id, c.balance
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1 AND c.phone = $2
       FOR UPDATE OF o, c`,
      [req.params.id, phone]
    );
    if (!r.rowCount) throw ApiError.notFound('Order not found');
    const order = r.rows[0];

    if (order.status !== 'pending') {
      throw ApiError.conflict('Only a pending order can be cancelled');
    }

    if (order.payment_mode === 'credit') {
      // Compensating entry keeps the ledger honest and auditable. Reverse the
      // full amount that was added to the khata: subtotal + delivery fee.
      const reversal = Number(order.subtotal) + Number(order.delivery_fee);
      await client.query(
        `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
         VALUES ($1,$2,'cash',$3,'cash',$4,'api')`,
        [order.shop_id, order.cust_id, reversal, `Reversal — order ${order.id} cancelled`]
      );
      await client.query(
        'UPDATE customers SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
        [reversal, order.cust_id]
      );
    }

    const paidPrepaid = order.payment_mode === 'prepaid' && order.payment_status === 'paid';
    const upd = await client.query(
      `UPDATE orders
         SET status = 'cancelled',
             note = CASE WHEN $2 THEN COALESCE(note, '') || ' [Cancelled after payment — refund to be processed manually.]' ELSE note END,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [order.id, paidPrepaid]
    );
    return { order: upd.rows[0] };
  });

  res.json(result);
};
