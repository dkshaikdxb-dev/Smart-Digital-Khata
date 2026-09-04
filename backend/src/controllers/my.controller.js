const { query } = require('../config/db');
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
