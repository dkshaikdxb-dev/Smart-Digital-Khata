const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');

// --- CSV helpers ------------------------------------------------------------
// The project deliberately avoids extra npm deps, so CSV is built by hand.
// RFC-4180 style: a field is wrapped in double-quotes only when it contains a
// comma, double-quote, CR or LF; inside a quoted field every double-quote is
// doubled. Rows are joined with CRLF (Excel-friendly).
function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

// paise (BIGINT) -> rupees string with 2 decimals, e.g. 12345 -> "123.45".
function rupees(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

// timestamptz comes back from pg as a JS Date; emit a stable ISO string.
function isoDate(d) {
  if (!d) return '';
  return d instanceof Date ? d.toISOString() : String(d);
}

function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(rows.join('\r\n') + '\r\n');
}

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
