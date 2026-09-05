const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
// Reuse the ONE set of CSV helpers (statement.js) so amount/quoting/CRLF
// behaviour is identical everywhere. `rupees` renders integer paise as a
// 2-decimal rupee string; `isoDate` stabilises a pg Date; `sendCsv` writes the
// text/csv attachment with CRLF rows.
const { csvRow, rupees, isoDate, sendCsv } = require('../utils/statement');

// GET /reports/customers.csv — all active customers for this shop.
exports.customersCsv = async (req, res) => {
  const r = await query(
    `SELECT name, phone, credit_limit, balance, status, created_at
     FROM customers
     WHERE shop_id = $1 AND status = 'active'
     ORDER BY name ASC`,
    [req.user.shopId]
  );

  const rows = [csvRow(['Name', 'Phone', 'Credit Limit (Rs)', 'Balance (Rs)', 'Status', 'Created'])];
  for (const c of r.rows) {
    rows.push(csvRow([
      c.name,
      c.phone,
      rupees(c.credit_limit),
      rupees(c.balance),
      c.status,
      isoDate(c.created_at),
    ]));
  }
  sendCsv(res, 'customers.csv', rows);
};

// GET /reports/transactions.csv?from=&to= — this shop's transactions, optional
// ISO date range (inclusive).
exports.transactionsCsv = async (req, res) => {
  const { from, to } = req.query;
  const r = await query(
    `SELECT t.created_at, c.name AS customer_name, c.phone,
            t.type, t.method, t.amount, t.note
     FROM transactions t
     JOIN customers c ON c.id = t.customer_id
     WHERE t.shop_id = $1
       AND ($2::timestamptz IS NULL OR t.created_at >= $2)
       AND ($3::timestamptz IS NULL OR t.created_at <= $3)
     ORDER BY t.created_at DESC`,
    [req.user.shopId, from || null, to || null]
  );

  const rows = [csvRow(['Date', 'Customer', 'Phone', 'Type', 'Method', 'Amount (Rs)', 'Note'])];
  for (const t of r.rows) {
    rows.push(csvRow([
      isoDate(t.created_at),
      t.customer_name,
      t.phone,
      t.type,
      t.method,
      rupees(t.amount),
      t.note,
    ]));
  }
  sendCsv(res, 'transactions.csv', rows);
};

// GET /reports/customer/:id/statement.csv — one customer's full statement,
// newest first. 404 when the customer does not belong to this shop.
exports.statementCsv = async (req, res) => {
  const { id } = req.params;
  const own = await query(
    'SELECT id FROM customers WHERE id = $1 AND shop_id = $2',
    [id, req.user.shopId]
  );
  if (!own.rowCount) throw ApiError.notFound('Customer not found');

  const r = await query(
    `SELECT created_at, type, method, amount, note
     FROM transactions
     WHERE customer_id = $1
     ORDER BY created_at DESC`,
    [id]
  );

  const rows = [csvRow(['Date', 'Type', 'Method', 'Amount (Rs)', 'Note'])];
  for (const t of r.rows) {
    rows.push(csvRow([
      isoDate(t.created_at),
      t.type,
      t.method,
      rupees(t.amount),
      t.note,
    ]));
  }
  sendCsv(res, `statement-${id}.csv`, rows);
};

// GET /reports/orders.csv?from=&to= — this shop's orders, optional ISO date
// range (inclusive). Total is subtotal + delivery_fee (both integer paise).
exports.ordersCsv = async (req, res) => {
  const { from, to } = req.query;
  const r = await query(
    `SELECT o.created_at, c.name AS customer_name,
            o.fulfillment_type, o.payment_mode, o.payment_status,
            o.subtotal, o.delivery_fee
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.shop_id = $1
       AND ($2::timestamptz IS NULL OR o.created_at >= $2)
       AND ($3::timestamptz IS NULL OR o.created_at <= $3)
     ORDER BY o.created_at DESC`,
    [req.user.shopId, from || null, to || null]
  );

  const rows = [csvRow([
    'Date', 'Customer', 'Fulfillment', 'Payment Mode', 'Payment Status',
    'Subtotal (Rs)', 'Delivery Fee (Rs)', 'Total (Rs)',
  ])];
  for (const o of r.rows) {
    const total = Number(o.subtotal) + Number(o.delivery_fee);
    rows.push(csvRow([
      isoDate(o.created_at),
      o.customer_name,
      o.fulfillment_type,
      o.payment_mode,
      o.payment_status,
      rupees(o.subtotal),
      rupees(o.delivery_fee),
      rupees(total),
    ]));
  }
  sendCsv(res, 'orders.csv', rows);
};

// GET /reports/catalogue.csv — this shop's products. brand/pack come from the
// linked base catalog item (LEFT JOIN, nullable for hand-entered products).
exports.catalogueCsv = async (req, res) => {
  const r = await query(
    `SELECT p.name, ci.brand, ci.pack, p.unit, p.price, p.sold_by_weight, p.is_active
     FROM products p
     LEFT JOIN catalog_items ci ON ci.id = p.catalog_item_id
     WHERE p.shop_id = $1
     ORDER BY p.name ASC`,
    [req.user.shopId]
  );

  const rows = [csvRow(['Name', 'Brand', 'Pack', 'Unit', 'Price (Rs)', 'Sold by weight', 'Active'])];
  for (const p of r.rows) {
    rows.push(csvRow([
      p.name,
      p.brand,
      p.pack,
      p.unit,
      rupees(p.price),
      p.sold_by_weight ? 'yes' : 'no',
      p.is_active ? 'yes' : 'no',
    ]));
  }
  sendCsv(res, 'catalogue.csv', rows);
};

// GET /reports/khata-outstanding.csv — the "who owes me" list: this shop's
// customers with a non-zero balance, highest balance first.
exports.khataOutstandingCsv = async (req, res) => {
  const r = await query(
    `SELECT name, phone, balance
     FROM customers
     WHERE shop_id = $1 AND balance <> 0
     ORDER BY balance DESC, name ASC`,
    [req.user.shopId]
  );

  const rows = [csvRow(['Name', 'Phone', 'Balance (Rs)'])];
  for (const c of r.rows) {
    rows.push(csvRow([c.name, c.phone, rupees(c.balance)]));
  }
  sendCsv(res, 'khata-outstanding.csv', rows);
};
