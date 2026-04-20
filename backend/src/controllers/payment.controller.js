const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const whatsapp = require('../services/whatsapp.service');

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

  const payLink = `${process.env.APP_URL || 'https://pay.example.com'}/pay/${order.id}`;
  const msg =
    `Hi ${order.customer_name}, this is a payment request from ${order.shop_name}.\n` +
    `Amount: ₹${(order.amount / 100).toFixed(2)}\n` +
    `Pay securely: ${payLink}`;

  await whatsapp.sendText(order.customer_phone, msg).catch(() => {});
  res.json({ ok: true, link: payLink });
};
