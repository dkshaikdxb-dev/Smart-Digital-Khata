const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const { getConsumerPrepayConfig } = require('../utils/consumerPrepay');
const whatsapp = require('../services/whatsapp.service');
const { toE164 } = require('../utils/phone');
const {
  buildStatement,
  defaultRange,
  statementCsvRows,
  sendCsv,
  csvRow,
  rupees: rupeesCsv,
  isoDate,
} = require('../utils/statement');
// Owner-facing order-alert copy (batch ORDERALERT). The FIRST alert and every
// WhatsApp REMINDER are built by the same helper, so the two can never drift.
const orderAlertCopy = require('../utils/order-alert-copy');
// Shop availability (batch A). The order-time refusal is the HARD guarantee —
// every UI hint elsewhere is courtesy. assertShopOpenTx runs on the
// transaction's own client, before any insert, in all three payment modes.
const { assertShopOpenTx } = require('../utils/shopOpen');

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

  // Surface the live single-merchant pre-pay config so the consumer app can offer
  // the "Add money / Pre-pay" control and cap the entered amount. Disabled-safe.
  const prepay = await getConsumerPrepayConfig();

  res.json({ total_outstanding, shops, prepay });
};

/**
 * GET /my/shop-faqs — the owner-authored FAQ for each of THIS customer's shops.
 * Visibility mirrors khata exactly: a shop appears only when a `customers` row
 * exists for the authenticated customer's E164 phone at that shop. Only ACTIVE
 * faqs are returned, and shops with no active faqs are omitted (so the consumer
 * section only lists shops that actually have FAQs). Read-only, customer-scoped.
 * Returns [{ shop_id, shop_name, faqs: [{ id, question, answer }] }] ordered by
 * shop name then sort_order.
 */
exports.shopFaqs = async (req, res) => {
  const phone = toE164(req.customerUser.phone);

  const r = await query(
    `SELECT s.id AS shop_id, s.name AS shop_name,
            f.id AS faq_id, f.question, f.answer
     FROM customers c
     JOIN shops s ON s.id = c.shop_id
     JOIN shop_faqs f ON f.shop_id = s.id AND f.is_active = true
     WHERE c.phone = $1
     ORDER BY s.name ASC, f.sort_order ASC, f.id ASC`,
    [phone]
  );

  // Group the flat rows by shop, preserving the SQL order (shop name, then
  // sort_order). A customer with a record at several shops that share a phone
  // could produce duplicate (shop, faq) pairs across customer rows; de-dupe by
  // faq id per shop so each question shows once.
  const byShop = new Map();
  for (const row of r.rows) {
    let entry = byShop.get(row.shop_id);
    if (!entry) {
      entry = { shop_id: row.shop_id, shop_name: row.shop_name, faqs: [], _seen: new Set() };
      byShop.set(row.shop_id, entry);
    }
    if (!entry._seen.has(row.faq_id)) {
      entry._seen.add(row.faq_id);
      entry.faqs.push({ id: row.faq_id, question: row.question, answer: row.answer });
    }
  }

  const shops = Array.from(byShop.values()).map(({ _seen, ...rest }) => rest);
  res.json({ shops });
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
 * GET /my/statement?shop_id=&from=&to=&format=json|csv — the consumer's account
 * statement, always scoped to THEIR phone. With shop_id → that one shop; without
 * → an all-shops combined statement grouped by shop. Money stays paise in JSON;
 * CSV prints ₹ with 2 decimals. Reuses the shared buildStatement() helper so the
 * opening/closing math is identical to the owner endpoint.
 */
exports.statement = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shop_id, format } = req.query;
  const { from, to } = defaultRange(req.query.from, req.query.to);
  if (from > to) throw ApiError.badRequest('The "from" date must be on or before the "to" date');

  // Resolve the consumer's customers rows by phone (one shop, or all).
  const params = [phone];
  let where = 'c.phone = $1';
  if (shop_id) {
    params.push(shop_id);
    where += ` AND c.shop_id = $2`;
  }
  const custRes = await query(
    `SELECT c.id AS customer_id, c.shop_id, c.name AS customer_name, s.name AS shop_name
     FROM customers c JOIN shops s ON s.id = c.shop_id
     WHERE ${where}
     ORDER BY s.name ASC`,
    params
  );
  if (shop_id && !custRes.rowCount) throw ApiError.notFound('No khata found at this shop');

  const shops = [];
  const combined = { opening: 0, closing: 0, total_purchases: 0, total_paid: 0 };
  for (const c of custRes.rows) {
    const stmt = await buildStatement(c.customer_id, from, to);
    shops.push({
      shop_id: c.shop_id,
      shop_name: c.shop_name,
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      statement: stmt,
    });
    combined.opening += stmt.opening;
    combined.closing += stmt.closing;
    combined.total_purchases += stmt.total_purchases;
    combined.total_paid += stmt.total_paid;
  }

  if (format === 'csv') {
    const rows = [];
    for (const s of shops) {
      if (rows.length) rows.push('');
      for (const r of statementCsvRows(s.statement, { shopName: s.shop_name, customerName: s.customer_name })) {
        rows.push(r);
      }
    }
    if (shops.length !== 1) {
      const { rupees } = require('../utils/statement');
      rows.push('');
      rows.push(`Combined opening (Rs),${rupees(combined.opening)}`);
      rows.push(`Combined total purchases (Rs),${rupees(combined.total_purchases)}`);
      rows.push(`Combined total paid (Rs),${rupees(combined.total_paid)}`);
      rows.push(`Combined closing (Rs),${rupees(combined.closing)}`);
    }
    const fname = shop_id ? `statement-${from}-to-${to}.csv` : `statement-all-shops-${from}-to-${to}.csv`;
    return sendCsv(res, fname, rows);
  }

  if (shop_id) {
    const only = shops[0] || null;
    return res.json({ from, to, shop: only });
  }
  res.json({ from, to, shops, combined });
};

/**
 * POST /my/pay { shop_id, amount } — pay any shop this customer owes.
 * Creates a payment_orders row + a Razorpay hosted Payment Link, exactly like
 * the owner-initiated flow. The webhook reconciles by provider ids regardless
 * of who initiated, so a customer-initiated order settles the same way.
 *
 * Pre-pay cap (single-merchant advance) is enforced at REQUEST time, inside one
 * transaction that holds the customer's row lock from the check through the
 * INSERT of the payment_orders row:
 *   projected = balance - amount - SUM(amount of this customer's OPEN khata
 *               payment links at this shop)   (open = status 'created', i.e.
 *               NOT IN ('paid','failed','cancelled'); order_id IS NULL because a
 *               prepaid ORDER link never moves the khata balance on settlement)
 *   reject when projected < -maxAdvance.
 * Counting the still-unpaid links closes the window where several links, each
 * individually under the cap against the CURRENT balance, would together exceed
 * max_advance_paise once the webhook settles them. The webhook/settlement path
 * is untouched; a paid/failed/cancelled link no longer counts.
 */
exports.pay = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shop_id, amount } = req.body;

  const prepay = await getConsumerPrepayConfig();

  const result = await withTx(async (client) => {
    // Lock the customer row: a second concurrent /my/pay for the same khata waits
    // here until this one has COMMITTED its payment_orders row, so its own
    // in-flight sum includes ours.
    const own = await client.query(
      `SELECT c.id, c.name, c.phone, c.balance, s.name AS shop_name
       FROM customers c
       JOIN shops s ON s.id = c.shop_id
       WHERE c.phone = $1 AND c.shop_id = $2
       FOR UPDATE OF c`,
      [phone, shop_id]
    );
    if (!own.rowCount) throw ApiError.notFound('No khata found at this shop');
    const customer = own.rows[0];
    const balance = Number(customer.balance);

    // Pay-guard. When single-merchant pre-pay is ON, a customer may clear the due
    // AND pre-load an ADVANCE up to `maxAdvance` beyond it — the money still
    // settles to THIS shop's own Razorpay and the webhook's `balance = balance -
    // amount` naturally drives the balance negative (= advance in this shop's
    // ledger). The only reject is when the amount, together with every link that
    // is still open (created, not yet settled), would push the advance past the
    // cap. When pre-pay is OFF we keep today's behaviour exactly: reject any
    // amount over the outstanding balance.
    if (prepay.enabled) {
      const maxAdvance = prepay.max_advance_paise;
      const open = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payment_orders
         WHERE customer_id = $1 AND shop_id = $2
           AND order_id IS NULL
           AND status NOT IN ('paid', 'failed', 'cancelled')`,
        [customer.id, shop_id]
      );
      const inFlight = Number(open.rows[0].total);
      const projected = balance - inFlight - amount;
      if (projected < -maxAdvance) {
        // The most that can still be paid right now: what remains of due +
        // advance headroom once the open links are counted (never negative).
        const maxAllowed = Math.max(balance - inFlight + maxAdvance, 0);
        throw ApiError.unprocessable(
          'Amount exceeds the most you can pre-pay this shop right now',
          { max_allowed: maxAllowed, max_advance: maxAdvance, balance, pending_links: inFlight }
        );
      }
    } else if (amount > balance) {
      // Pre-pay disabled — never let a customer overpay what they owe at this shop.
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

    const inserted = await client.query(
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
      await client.query(
        `UPDATE payment_orders SET provider_link_id = $1, provider_link_url = $2 WHERE id = $3`,
        [paymentLink.id, link, orderRow.id]
      );
    } catch (err) {
      // Rolls the tx back: no link => no open payment_orders row is left behind
      // to count against this customer's advance headroom.
      throw ApiError.badRequest('Failed to create payment link', err.error?.description || err.message);
    }

    return { link, orderId: orderRow.id, balance };
  });

  // Hint so the client can confirm "you're adding an advance" — true when the paid
  // amount exceeds the current due (the extra pre-loads an advance). Response shape
  // is otherwise unchanged.
  res.status(201).json({
    link: result.link,
    order_id: result.orderId,
    prepay: amount > Math.max(result.balance, 0),
  });
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

// Loose/weighed items are the shop's money-critical case: products.price holds
// paise PER KG and the line price for a chosen weight is round(price_per_kg *
// weight_grams / 1000) in paise. This is ALWAYS recomputed here from the trusted
// product row — a client-sent price or line_total is never used. A weight in
// grams must be a positive integer within [1..100000] (1g..100kg).
const MIN_WEIGHT_GRAMS = 1;
const MAX_WEIGHT_GRAMS = 100000;

function weighedLineTotal(pricePerKg, weightGrams) {
  return Math.round((pricePerKg * weightGrams) / 1000);
}

/** Load & validate the ordered products; return snapshot line items + subtotal. */
async function buildLineItems(shopId, items) {
  const ids = items.map((i) => i.product_id);
  const prodRes = await query(
    `SELECT id, name, price, unit, sold_by_weight, is_active FROM products
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
    const unitPrice = Number(p.price); // paise per KG for a weighed item, else per unit

    if (p.sold_by_weight) {
      // Weighed line: recompute the price server-side from weight_grams. Never
      // trust any client-sent price/line_total. quantity is fixed at 1.
      const grams = Number(item.weight_grams);
      if (!Number.isInteger(grams) || grams < MIN_WEIGHT_GRAMS || grams > MAX_WEIGHT_GRAMS) {
        throw ApiError.unprocessable('A valid weight in grams is required for this item', {
          product_id: item.product_id,
        });
      }
      const lineTotal = weighedLineTotal(unitPrice, grams);
      subtotal += lineTotal;
      lines.push({
        product_id: p.id, name: p.name, unit_price: unitPrice,
        quantity: 1, weight_grams: grams, line_total: lineTotal,
      });
    } else {
      // Unit line: price * integer quantity (unchanged). Any weight_grams is ignored.
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        throw ApiError.unprocessable('A valid quantity is required for this item', {
          product_id: item.product_id,
        });
      }
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;
      lines.push({
        product_id: p.id, name: p.name, unit_price: unitPrice,
        quantity: qty, weight_grams: null, line_total: lineTotal,
      });
    }
  }
  return { lines, subtotal };
}

async function insertOrderItems(client, orderId, lines) {
  const out = [];
  for (const l of lines) {
    const r = await client.query(
      `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total, weight_grams)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, product_id, name, unit_price, quantity, line_total, weight_grams`,
      [orderId, l.product_id, l.name, l.unit_price, l.quantity, l.line_total, l.weight_grams]
    );
    out.push(r.rows[0]);
  }
  return out;
}

/**
 * Resolve the shop OWNER's phone for the new-order alert. The owner is the
 * `users` row with role='owner' scoped to this shop; if that row has no phone we
 * fall back to the shop's owner_id user. (There is no shops.phone column in this
 * schema — the owner's users.phone is the source of truth, and it is NOT NULL.)
 * Returns { phone, shopName } or null when no phone can be resolved.
 */
async function resolveOwnerContact(shopId) {
  const r = await query(
    `SELECT s.name AS shop_name,
            COALESCE(u_role.phone, u_owner.phone) AS phone
       FROM shops s
       LEFT JOIN users u_role
         ON u_role.shop_id = s.id AND u_role.role = 'owner' AND u_role.phone IS NOT NULL
       LEFT JOIN users u_owner
         ON u_owner.id = s.owner_id
      WHERE s.id = $1`,
    [shopId]
  );
  if (!r.rowCount || !r.rows[0].phone) return null;
  // `lang`: the owner's language for the WhatsApp copy. There is NO per-shop or
  // per-owner language column in this schema today (checked across every
  // migration), so this reads a `language` field that does not exist yet and the
  // copy helper resolves the undefined value to its English fallback. Written
  // this way — rather than inventing a column — so a future migration that adds
  // one needs no change here. Same convention as weekly-summary.service.
  return { phone: r.rows[0].phone, shopName: r.rows[0].shop_name, lang: r.rows[0].language };
}

/** Human-readable ₹ from integer paise. */
function rupees(paise) {
  return `₹${(Number(paise) / 100).toFixed(2)}`;
}

/**
 * Fire-and-forget WhatsApp alert to the shop owner when a customer places an
 * order. A WhatsApp failure (or an unconfigured/unreachable Meta API) must NEVER
 * fail or block the order — this is called AFTER the DB commit and every error is
 * swallowed. Message carries what the owner needs to act: customer, item count,
 * total, fulfillment, payment mode, and the address/note for a delivery.
 *
 * The copy itself lives in utils/order-alert-copy (batch ORDERALERT) so this
 * FIRST alert and the repeating WhatsApp REMINDERS (order-alert.service) always
 * say the same thing in the same language. en + hi are authored; every other
 * language falls back to English rather than being machine-translated.
 */
function alertOwnerNewOrder({ shopId, customerName, itemCount, total, fulfillmentType, paymentMode, address, note }) {
  // Resolve + send in the background; never await, never let it reject.
  (async () => {
    const owner = await resolveOwnerContact(shopId);
    if (!owner) return;
    const message = orderAlertCopy.buildOwnerAlert({
      lang: owner.lang,
      shopName: owner.shopName,
      customerName,
      itemCount,
      total,
      fulfillmentType,
      paymentMode,
      address,
      note,
      repeat: null, // the first alert, not a reminder
    });
    await whatsapp.sendText(owner.phone, message);
  })().catch(() => {});
}

/**
 * POST /my/orders — place an order at a shop.
 * credit  → order + items + a khata `purchase` transaction (credit-limit
 *           enforced exactly like the owner transaction flow), all in one tx.
 * prepaid → order + items + a payment_orders row (linked via order_id) + a
 *           Razorpay order & hosted pay link, all in one tx (a failure — DB or
 *           Razorpay — rolls back and creates nothing). No khata entry.
 * cash    → order + items only. NO khata debit, NO Razorpay/pay link. Total is
 *           subtotal + delivery fee; payment_status='pending' (cash owed, to be
 *           collected on fulfillment and marked 'paid' when the owner completes).
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
      // AVAILABILITY GATE (batch A) — first thing in the transaction, before
      // resolveOrCreateCustomer (which can INSERT) and before any order, item
      // or khata row. A 409 here rolls the whole tx back, so a closed shop
      // leaves nothing behind.
      await assertShopOpenTx(client, shop_id);

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

      return { order: { ...order, items: orderItems, total }, customerName: customer.name };
    });

    alertOwnerNewOrder({
      shopId: shop_id,
      customerName: result.customerName,
      itemCount: lines.length,
      total,
      fulfillmentType: fulfillment_type,
      paymentMode: 'credit',
      address,
      note,
    });
    return res.status(201).json({ order: result.order });
  }

  if (payment_mode === 'cash') {
    // Cash on pickup/delivery. No khata debit, no online pay. The order simply
    // records what is owed (payment_status='pending'); the owner collects cash
    // on hand-over and completing the order flips it to 'paid'.
    const result = await withTx(async (client) => {
      // AVAILABILITY GATE (batch A) — same refusal, same place, cash path.
      await assertShopOpenTx(client, shop_id);

      const customer = await resolveOrCreateCustomer(client, shop_id, phone);
      const ord = await client.query(
        `INSERT INTO orders (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, delivery_fee, address, note)
         VALUES ($1,$2,'pending',$3,'cash','pending',$4,$5,$6,$7)
         RETURNING *`,
        [shop_id, customer.id, fulfillment_type, subtotal, fee, address || null, note || null]
      );
      const order = ord.rows[0];
      const orderItems = await insertOrderItems(client, order.id, lines);
      return { order: { ...order, items: orderItems, total }, customerName: customer.name };
    });

    alertOwnerNewOrder({
      shopId: shop_id,
      customerName: result.customerName,
      itemCount: lines.length,
      total,
      fulfillmentType: fulfillment_type,
      paymentMode: 'cash',
      address,
      note,
    });
    return res.status(201).json({ order: result.order });
  }

  // prepaid
  if (!(await razorpay.isConfiguredForShop(shop_id))) {
    throw ApiError.badRequest('This shop cannot take online payments yet.');
  }

  const result = await withTx(async (client) => {
    // AVAILABILITY GATE (batch A) — before the customer row, before the order,
    // and crucially before the Razorpay call, so a closed shop never creates an
    // order, a payment_orders row, or a provider-side order/pay link either.
    await assertShopOpenTx(client, shop_id);

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

    return { order: { ...order, items: orderItems, total }, pay_link: paymentLink.short_url, customerName: customer.name };
  });

  alertOwnerNewOrder({
    shopId: shop_id,
    customerName: result.customerName,
    itemCount: lines.length,
    total,
    fulfillmentType: fulfillment_type,
    paymentMode: 'prepaid',
    address,
    note,
  });
  return res.status(201).json({ order: result.order, pay_link: result.pay_link });
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
 * GET /my/orders.csv?shop_id= — the consumer's orders as CSV, always scoped to
 * THEIR phone. With shop_id → that one shop; without → across every shop. Total
 * is subtotal + delivery_fee (integer paise), rendered as rupees.
 */
exports.ordersCsv = async (req, res) => {
  const phone = toE164(req.customerUser.phone);
  const { shop_id } = req.query;

  const params = [phone];
  let where = 'c.phone = $1';
  if (shop_id) {
    params.push(shop_id);
    where += ` AND o.shop_id = $${params.length}`;
  }
  const r = await query(
    `SELECT o.created_at, s.name AS shop_name,
            o.fulfillment_type, o.payment_mode, o.payment_status,
            o.subtotal, o.delivery_fee
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN shops s ON s.id = o.shop_id
     WHERE ${where}
     ORDER BY o.created_at DESC`,
    params
  );

  const rows = [csvRow([
    'Date', 'Shop', 'Fulfillment', 'Payment Mode', 'Payment Status',
    'Subtotal (Rs)', 'Delivery Fee (Rs)', 'Total (Rs)',
  ])];
  for (const o of r.rows) {
    const total = Number(o.subtotal) + Number(o.delivery_fee);
    rows.push(csvRow([
      isoDate(o.created_at),
      o.shop_name,
      o.fulfillment_type,
      o.payment_mode,
      o.payment_status,
      rupeesCsv(o.subtotal),
      rupeesCsv(o.delivery_fee),
      rupeesCsv(total),
    ]));
  }
  sendCsv(res, shop_id ? 'my-orders.csv' : 'my-orders-all-shops.csv', rows);
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
    `SELECT id, product_id, name, unit_price, quantity, line_total, weight_grams
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

// ---------------------------------------------------------------------------
// Consumer location (batch LOC1) — the shopper's chosen town/village/pincode,
// stored on the GLOBAL customer_users identity (NOT any per-shop `customers`
// ledger row). This is the cross-device backup for the client-side localStorage
// location that later batches send to the promos API. Scoped to the caller's
// customer_users row via req.customerUser.id (the token `sub`).
// ---------------------------------------------------------------------------

const LOC_FIELDS = ['town', 'village', 'pincode'];

/** Normalize a saved location row to the public { town, village, pincode } shape. */
function locShape(row) {
  return {
    town: (row && row.town) || null,
    village: (row && row.village) || null,
    pincode: (row && row.pincode) || null,
  };
}

/**
 * GET /my/location — the logged-in consumer's saved location. Returns nulls
 * when nothing has been saved (or, defensively, when the identity row is gone).
 */
exports.getLocation = async (req, res) => {
  const r = await query(
    'SELECT town, village, pincode FROM customer_users WHERE id = $1',
    [req.customerUser.id]
  );
  res.json(locShape(r.rows[0]));
};

/**
 * PUT /my/location { town?, village?, pincode? } — save the consumer's location
 * onto their customer_users row. Each field is optional; only the keys present
 * in the body change (an omitted key is left untouched). A field sent as '' or
 * null clears it. Never throws on empty. Returns the saved location.
 */
exports.putLocation = async (req, res) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of LOC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      let v = req.body[k];
      if (typeof v === 'string') v = v.trim();
      if (v === '') v = null; // clearing is allowed
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }

  if (!fields.length) {
    const cur = await query(
      'SELECT town, village, pincode FROM customer_users WHERE id = $1',
      [req.customerUser.id]
    );
    return res.json(locShape(cur.rows[0]));
  }

  values.push(req.customerUser.id);
  const r = await query(
    `UPDATE customer_users SET ${fields.join(', ')} WHERE id = $${i} RETURNING town, village, pincode`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Customer not found');
  res.json(locShape(r.rows[0]));
};
