#!/usr/bin/env node
/**
 * Commerce demo seeder — products + sample orders for the demo shop, so the
 * new owner Catalog/Orders pages and the customer PWA are not empty on a fresh
 * install.
 *
 *   npm run seed:commerce
 *
 * SAFE BY DESIGN:
 *   - Only ever touches the canonical demo shop (owner store01@demo.local),
 *     never a real shop. Run `npm run seed:demo` first to create it.
 *   - Idempotent: if that shop already has products, it does nothing.
 *   - Refuses to run in production unless FORCE_DEMO=true (same guard as
 *     seed:demo), so it can never scribble demo rows onto live data by accident.
 *
 * Order subtotals are computed from the line items (never hard-coded), matching
 * how the real order-create endpoint derives them.
 */
require('dotenv').config();
const { pool } = require('../config/db');

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DEMO !== 'true') {
  console.error('Refusing to seed demo commerce in production. Set FORCE_DEMO=true to override.');
  process.exit(1);
}

const DEMO_OWNER_EMAIL = 'store01@demo.local';

// price is paise. is_active=false ones exercise the "Hidden" badge / active filter.
const PRODUCTS = [
  { name: 'Aashirvaad Atta 5kg', description: 'Whole wheat flour', price: 28500, unit: 'bag', is_active: true },
  { name: 'India Gate Basmati 1kg', description: 'Premium basmati rice', price: 14000, unit: 'kg', is_active: true },
  { name: 'Fortune Sunflower Oil 1L', description: 'Refined cooking oil', price: 15500, unit: 'litre', is_active: true },
  { name: 'Tata Salt 1kg', description: 'Iodised salt', price: 2800, unit: 'kg', is_active: true },
  { name: 'Sugar 1kg (loose)', description: 'Loose sugar', price: 4500, unit: 'kg', is_active: false },
];

// Orders reference products by index into PRODUCTS; qty per line. One of each
// interesting shape: prepaid/delivery/pending, credit/pickup/accepted,
// prepaid/delivery/completed+paid.
const ORDERS = [
  {
    status: 'pending', fulfillment_type: 'delivery', payment_mode: 'prepaid', payment_status: 'pending',
    address: '12 MG Road, Bengaluru', note: 'Ring the bell',
    lines: [{ p: 0, qty: 1 }, { p: 2, qty: 1 }],
  },
  {
    status: 'accepted', fulfillment_type: 'pickup', payment_mode: 'credit', payment_status: 'not_required',
    address: null, note: 'Will collect by 6pm',
    lines: [{ p: 1, qty: 1 }, { p: 3, qty: 2 }],
  },
  {
    status: 'completed', fulfillment_type: 'delivery', payment_mode: 'prepaid', payment_status: 'paid',
    address: '5 Brigade Road, Bengaluru', note: null,
    lines: [{ p: 2, qty: 2 }],
  },
];

async function seedCommerce() {
  const client = await pool.connect();
  try {
    const owner = await client.query('SELECT shop_id FROM users WHERE email = $1', [DEMO_OWNER_EMAIL]);
    if (!owner.rowCount || !owner.rows[0].shop_id) {
      console.error(`Demo shop not found (owner ${DEMO_OWNER_EMAIL}). Run "npm run seed:demo" first.`);
      process.exit(1);
    }
    const shopId = owner.rows[0].shop_id;

    const existing = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE shop_id = $1', [shopId]);
    if (existing.rows[0].n > 0) {
      console.log(`✓ Demo shop already has ${existing.rows[0].n} products — nothing to do.`);
      return;
    }

    await client.query('BEGIN');

    // Products
    const productIds = [];
    for (const p of PRODUCTS) {
      const r = await client.query(
        `INSERT INTO products (shop_id, name, description, price, unit, is_active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [shopId, p.name, p.description, p.price, p.unit, p.is_active]
      );
      productIds.push(r.rows[0].id);
    }

    // A customer to attach the demo orders to (first demo customer of this shop).
    const cust = await client.query(
      'SELECT id FROM customers WHERE shop_id = $1 ORDER BY created_at ASC LIMIT 1',
      [shopId]
    );
    let orderCount = 0;
    if (cust.rowCount) {
      const customerId = cust.rows[0].id;
      for (const o of ORDERS) {
        const items = o.lines.map((l) => {
          const prod = PRODUCTS[l.p];
          return {
            product_id: productIds[l.p],
            name: prod.name,
            unit_price: prod.price,
            quantity: l.qty,
            line_total: prod.price * l.qty,
          };
        });
        const subtotal = items.reduce((s, it) => s + it.line_total, 0);
        const ord = await client.query(
          `INSERT INTO orders
             (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, address, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [shopId, customerId, o.status, o.fulfillment_type, o.payment_mode, o.payment_status, subtotal, o.address, o.note]
        );
        const orderId = ord.rows[0].id;
        for (const it of items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [orderId, it.product_id, it.name, it.unit_price, it.quantity, it.line_total]
          );
        }
        orderCount++;
      }
    }

    await client.query('COMMIT');
    console.log(`✓ Seeded ${PRODUCTS.length} products and ${orderCount} orders for the demo shop.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

seedCommerce()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Commerce seed failed:', err.message);
    pool.end().finally(() => process.exit(1));
  });
