// Account statement builder — ONE source of truth reused by the consumer
// (`GET /api/my/statement`) and the owner (`GET /api/customers/:id/statement`)
// endpoints. A statement = an opening balance + the dated ledger lines in a
// date range + a closing balance + totals.
//
// Money is integer paise everywhere and the math is EXACT (integer add only):
//   delta(row)      = +amount for a purchase, −amount for everything else
//   opening balance = Σ delta over every transaction STRICTLY BEFORE `from`
//   closing balance = opening + Σ delta over the in-range transactions
//   total purchases = Σ amount of purchases in range
//   total paid      = Σ amount of PAYMENTS (cash/upi) in range
//   total adjusted  = Σ amount of shop ADJUSTMENTS in range
//
// ADJUSTMENTS (batch C) are the fourth transaction type: the shop reducing an
// order it could not fully supply. They lower the balance exactly like a
// payment does — so the delta rule above needs no change — but they are NOT
// money the customer handed over, so they are counted on their own line instead
// of being folded into "total paid". A statement that claimed a customer had
// paid ₹200 they never paid would be a lie in the one document they can take to
// the shop and argue with.
//
// Range semantics: `from`/`to` are plain dates. `from` is inclusive from its
// 00:00; `to` is inclusive of its WHOLE day (compared as `< to + 1 day`), so a
// same-day `from = to` covers exactly that one day.

const { query } = require('../config/db');

// A ledger row's signed effect on the balance, in paise.
function delta(type, amount) {
  return type === 'purchase' ? Number(amount) : -Number(amount);
}

/**
 * Build a statement for a single customers row.
 * @param {string} customerId
 * @param {string|Date} from  inclusive start date (YYYY-MM-DD)
 * @param {string|Date} to    inclusive end date (YYYY-MM-DD)
 * @param {(text:string, params:any[]) => Promise} [runner] optional query fn
 * @returns {Promise<{opening:number, closing:number, total_purchases:number,
 *   total_paid:number, from:string, to:string, lines:Array}>}
 */
async function buildStatement(customerId, from, to, runner = query) {
  const fromDate = toDateStr(from);
  const toDate = toDateStr(to);

  // Opening: everything strictly before the `from` day. Cast to ::date so a
  // bare date compares at that day's 00:00 in the session timezone.
  const open = await runner(
    `SELECT COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE -amount END), 0) AS opening
     FROM transactions
     WHERE customer_id = $1 AND created_at < $2::date`,
    [customerId, fromDate]
  );
  const opening = Number(open.rows[0].opening);

  // In-range lines, oldest first, with a running balance for display.
  const rows = await runner(
    `SELECT id, type, method, amount, note, created_at
     FROM transactions
     WHERE customer_id = $1
       AND created_at >= $2::date
       AND created_at <  ($3::date + 1)
     ORDER BY created_at ASC, id ASC`,
    [customerId, fromDate, toDate]
  );

  let balance = opening;
  let totalPurchases = 0;
  let totalPaid = 0;
  let totalAdjusted = 0;
  const lines = rows.rows.map((r) => {
    const d = delta(r.type, r.amount);
    balance += d;
    if (r.type === 'purchase') totalPurchases += Number(r.amount);
    else if (r.type === 'adjustment') totalAdjusted += Number(r.amount);
    else totalPaid += Number(r.amount);
    return {
      id: r.id,
      created_at: r.created_at,
      type: r.type,
      method: r.method,
      amount: Number(r.amount),
      note: r.note,
      delta: d,
      balance, // running balance after this line
    };
  });

  return {
    from: fromDate,
    to: toDate,
    opening,
    closing: balance, // opening + Σ in-range deltas
    total_purchases: totalPurchases,
    total_paid: totalPaid,
    // Always present (0 when there were none), so a client can render the line
    // unconditionally instead of guessing whether the key exists.
    total_adjusted: totalAdjusted,
    lines,
  };
}

// --- date helpers -----------------------------------------------------------

// Normalize a Date or ISO/date string to a 'YYYY-MM-DD' string. Joi coerces a
// query date to a JS Date; a raw string is used as-is (its date part).
function toDateStr(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Default range = last 90 days (inclusive of today) when a bound is omitted.
function defaultRange(from, to) {
  const today = new Date();
  const end = to || toDateStr(today);
  const start =
    from ||
    toDateStr(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000));
  return { from: toDateStr(start), to: toDateStr(end) };
}

// --- CSV rendering ----------------------------------------------------------
// RFC-4180 style, CRLF rows (Excel-friendly), mirroring report.controller.js.
function csvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

// paise → rupees string with 2 decimals, e.g. 12345 → "123.45".
function rupees(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

function isoDate(d) {
  if (!d) return '';
  return d instanceof Date ? d.toISOString() : String(d);
}

/**
 * Render one statement (optionally for a named shop) as CSV rows: a small
 * header block (shop, range, opening), the dated lines, then closing + totals.
 * `₹` is printed with 2 decimals in CSV; JSON stays in paise.
 */
function statementCsvRows(stmt, { shopName, customerName } = {}) {
  const rows = [];
  if (shopName) rows.push(csvRow(['Shop', shopName]));
  if (customerName) rows.push(csvRow(['Customer', customerName]));
  rows.push(csvRow(['From', stmt.from]));
  rows.push(csvRow(['To', stmt.to]));
  rows.push(csvRow(['Opening balance (Rs)', rupees(stmt.opening)]));
  rows.push('');
  rows.push(csvRow(['Date', 'Type', 'Method', 'Amount (Rs)', 'Balance (Rs)', 'Note']));
  for (const l of stmt.lines) {
    const signed = (l.type === 'purchase' ? '' : '-') + rupees(l.amount);
    rows.push(csvRow([isoDate(l.created_at), l.type, l.method, signed, rupees(l.balance), l.note]));
  }
  rows.push('');
  rows.push(csvRow(['Total purchases (Rs)', rupees(stmt.total_purchases)]));
  rows.push(csvRow(['Total paid (Rs)', rupees(stmt.total_paid)]));
  // Only printed when there actually were shop adjustments, so an untouched
  // statement keeps exactly the shape (and the row count) it has always had.
  if (Number(stmt.total_adjusted) > 0) {
    rows.push(csvRow(['Total adjusted by shop (Rs)', rupees(stmt.total_adjusted)]));
  }
  rows.push(csvRow(['Closing balance (Rs)', rupees(stmt.closing)]));
  return rows;
}

function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(rows.join('\r\n') + '\r\n');
}

module.exports = {
  buildStatement,
  defaultRange,
  toDateStr,
  statementCsvRows,
  sendCsv,
  rupees,
  csvRow,
  csvField,
  isoDate,
};
