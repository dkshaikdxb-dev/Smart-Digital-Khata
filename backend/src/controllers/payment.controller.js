const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');

exports.createOrder = async (req, res) => {
  const { customer_id, amount, note } = req.body;
  const c = await query(
    'SELECT id, name, phone, balance FROM customers WHERE id=$1 AND shop_id=$2',
    [customer_id, req.user.shopId]
  );
  if (!c.rowCount) throw ApiError.notFound('Customer not found');

  const receipt = `c_${customer_id.slice(0, 8)}_${Date.now()}`;
  const order = await razorpay.createOrder({
    amount,
    receipt,
    notes: { shop_id: req.user.shopId, customer_id, note: note || '' },
  });

  const r = await query(
    `INSERT INTO payment_orders
       (id, shop_id, customer_id, amount, currency, status, provider, provider_order_id, notes)
     VALUES ($1,$2,$3,$4,'INR','created','razorpay',$5,$6)
     RETURNING *`,
    [order.receipt, req.user.shopId, customer_id, amount, order.id, note || null]
  );

  res.status(201).json({ order: r.rows[0], provider: { id: order.id, key_id: process.env.RAZORPAY_KEY_ID } });
};

exports.getOrder = async (req, res) => {
  const r = await query(
    'SELECT * FROM payment_orders WHERE id=$1 AND shop_id=$2',
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');
  res.json({ order: r.rows[0] });
};

/**
 * Share a Razorpay-hosted Payment Link with the customer via WhatsApp.
 * Razorpay hosts the checkout page, so no custom pay page is needed.
 */
exports.sharePaymentLink = async (req, res) => {
  const r = await query(
    `SELECT po.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS shop_name
     FROM payment_orders po
     JOIN customers c ON c.id = po.customer_id
     JOIN shops s ON s.id = po.shop_id
     WHERE po.id=$1 AND po.shop_id=$2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');
  const order = r.rows[0];

  let shortUrl;
  let providerLinkId = null;
  try {
    const link = await razorpay.createPaymentLink({
      amount: order.amount,
      description: order.notes || `Payment to ${order.shop_name}`,
      customer: {
        name: order.customer_name,
        contact: toE164(order.customer_phone),
      },
      reference_id: order.id,
      notes: { shop_id: order.shop_id, customer_id: order.customer_id, order_id: order.id },
      callback_url: `${process.env.APP_URL || ''}/api/payments/orders/${order.id}/return`,
    });
    shortUrl = link.short_url;
    providerLinkId = link.id;
    await query(
      `UPDATE payment_orders SET provider_link_id = $1, provider_link_url = $2 WHERE id = $3`,
      [providerLinkId, shortUrl, order.id]
    );
  } catch (err) {
    throw ApiError.badRequest('Failed to create payment link', err.error?.description || err.message);
  }

  const msg =
    `Hi ${order.customer_name}, this is a payment request from ${order.shop_name}.\n` +
    `Amount: ₹${(order.amount / 100).toFixed(2)}\n` +
    `Pay securely: ${shortUrl}`;
  await whatsapp.sendText(order.customer_phone, msg).catch(() => {});

  res.json({ ok: true, link: shortUrl, provider_link_id: providerLinkId });
};

/**
 * Public read-only payment status — used by the post-payment redirect.
 */
exports.getOrderPublic = async (req, res) => {
  const r = await query(
    `SELECT po.id, po.amount, po.currency, po.status, po.paid_at,
            c.name AS customer_name, s.name AS shop_name
     FROM payment_orders po
     JOIN customers c ON c.id = po.customer_id
     JOIN shops s ON s.id = po.shop_id
     WHERE po.id=$1`,
    [req.params.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');
  res.json({ order: r.rows[0] });
};
