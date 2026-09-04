#!/usr/bin/env node
/**
 * Commerce demo seeder — a full 50-product kirana catalog + sample orders for
 * the demo shop, so the owner Catalog/Orders pages and the customer PWA look
 * real, and consumers have a shop to browse.
 *
 *   npm run seed:commerce
 *
 * SAFE BY DESIGN:
 *   - Only ever touches the canonical demo shop (owner store01@demo.local),
 *     never a real shop. Run `npm run seed:demo` first to create it.
 *   - Reseeds the demo shop's catalog (clears its old demo products/orders,
 *     then inserts the 50 below) so re-runs converge on a clean catalog.
 *   - Marks the demo shop LISTED with a location so it shows up in Discovery
 *     and the consumer link works.
 *   - Refuses to run in production unless FORCE_DEMO=true.
 *
 * On success it prints the CONSUMER LINK for the shop.
 */
require('dotenv').config();
const { pool } = require('../config/db');

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DEMO !== 'true') {
  console.error('Refusing to seed demo commerce in production. Set FORCE_DEMO=true to override.');
  process.exit(1);
}

const DEMO_OWNER_EMAIL = 'store01@demo.local';

// 50 everyday kirana products. price is paise (₹ = price/100). A shop can hold
// product names in any language/script; these use common recognisable names.
const PRODUCTS = [
  ['Aashirvaad Atta 5kg', 'Whole wheat flour', 28500, 'bag'],
  ['Aashirvaad Atta 10kg', 'Whole wheat flour', 55000, 'bag'],
  ['India Gate Basmati Rice 1kg', 'Premium basmati', 14000, 'kg'],
  ['India Gate Basmati Rice 5kg', 'Premium basmati', 65000, 'bag'],
  ['Sona Masoori Rice 5kg', 'Everyday rice', 32000, 'bag'],
  ['Toor Dal (Arhar) 1kg', 'Split pigeon peas', 16000, 'kg'],
  ['Moong Dal 1kg', 'Split green gram', 13500, 'kg'],
  ['Chana Dal 1kg', 'Split chickpeas', 9500, 'kg'],
  ['Urad Dal 1kg', 'Split black gram', 14500, 'kg'],
  ['Masoor Dal 1kg', 'Red lentils', 11000, 'kg'],
  ['Rajma 1kg', 'Kidney beans', 15000, 'kg'],
  ['Kabuli Chana 1kg', 'White chickpeas', 12000, 'kg'],
  ['Poha 500g', 'Flattened rice', 3500, 'packet'],
  ['Sooji / Rava 500g', 'Semolina', 3000, 'packet'],
  ['Maida 1kg', 'Refined flour', 5000, 'kg'],
  ['Besan 1kg', 'Gram flour', 9000, 'kg'],
  ['Fortune Sunflower Oil 1L', 'Refined cooking oil', 15500, 'litre'],
  ['Fortune Soya Oil 1L', 'Refined soya oil', 14000, 'litre'],
  ['Saffola Gold Oil 1L', 'Blended cooking oil', 19000, 'litre'],
  ['Mustard Oil 1L', 'Kachi ghani', 16500, 'litre'],
  ['Amul Ghee 1L', 'Pure ghee', 62000, 'tin'],
  ['Sugar 1kg', 'Refined sugar', 4500, 'kg'],
  ['Tata Salt 1kg', 'Iodised salt', 2800, 'kg'],
  ['Jaggery (Gud) 1kg', 'Natural sweetener', 6000, 'kg'],
  ['Turmeric Powder 200g', 'Haldi', 5500, 'packet'],
  ['Red Chilli Powder 200g', 'Lal mirch', 7000, 'packet'],
  ['Coriander Powder 200g', 'Dhania', 5000, 'packet'],
  ['Garam Masala 100g', 'Spice blend', 6500, 'packet'],
  ['Cumin Seeds 200g', 'Jeera', 8000, 'packet'],
  ['Mustard Seeds 200g', 'Rai', 3500, 'packet'],
  ['Black Pepper 100g', 'Kali mirch', 9000, 'packet'],
  ['Tata Tea Gold 500g', 'Tea leaves', 26000, 'packet'],
  ['Red Label Tea 250g', 'Tea leaves', 13000, 'packet'],
  ['Bru Instant Coffee 100g', 'Instant coffee', 22000, 'jar'],
  ['Bournvita 500g', 'Malt drink', 24500, 'jar'],
  ['Amul Butter 500g', 'Table butter', 27500, 'packet'],
  ['Amulya Milk Powder 500g', 'Dairy whitener', 26000, 'packet'],
  ['Parle-G Biscuits 800g', 'Glucose biscuits', 8000, 'packet'],
  ['Britannia Marie Gold 250g', 'Tea biscuits', 4000, 'packet'],
  ['Good Day Biscuits 200g', 'Cookies', 3500, 'packet'],
  ['Maggi Noodles 6-pack', 'Instant noodles', 8400, 'pack'],
  ['Kurkure 100g', 'Namkeen snack', 2000, 'packet'],
  ['Lifebuoy Soap 4-pack', 'Bath soap', 8000, 'pack'],
  ['Lux Soap 3-pack', 'Bath soap', 9000, 'pack'],
  ['Surf Excel 1kg', 'Detergent powder', 12500, 'packet'],
  ['Vim Dishwash Bar 3-pack', 'Dishwash', 3000, 'pack'],
  ['Colgate Toothpaste 200g', 'Toothpaste', 11000, 'tube'],
  ['Harpic 500ml', 'Toilet cleaner', 9500, 'bottle'],
  ['Good Knight Refill', 'Mosquito repellent', 7500, 'piece'],
  ['Agarbatti Pack', 'Incense sticks', 3000, 'packet'],
];

// A few sample orders (reference product indices) so the owner Orders page and
// customer order history are populated too.
const ORDERS = [
  { status: 'pending', fulfillment_type: 'delivery', payment_mode: 'prepaid', payment_status: 'pending',
    address: '12 MG Road, Bengaluru', note: 'Ring the bell', lines: [{ p: 0, q: 1 }, { p: 16, q: 1 }, { p: 21, q: 2 }] },
  { status: 'accepted', fulfillment_type: 'pickup', payment_mode: 'credit', payment_status: 'not_required',
    address: null, note: 'Will collect by 6pm', lines: [{ p: 2, q: 1 }, { p: 5, q: 1 }] },
  { status: 'completed', fulfillment_type: 'delivery', payment_mode: 'prepaid', payment_status: 'paid',
    address: '5 Brigade Road, Bengaluru', note: null, lines: [{ p: 20, q: 1 }, { p: 31, q: 1 }] },
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

    await client.query('BEGIN');

    // Make the shop discoverable so the consumer link + Discovery work.
    await client.query(
      `UPDATE shops
         SET is_listed = true,
             city = COALESCE(NULLIF(city, ''), 'Bengaluru'),
             area = COALESCE(NULLIF(area, ''), 'MG Road'),
             latitude = COALESCE(latitude, 12.9716),
             longitude = COALESCE(longitude, 77.5946)
       WHERE id = $1`,
      [shopId]
    );

    // Clear prior demo catalog/orders for THIS demo shop, then reseed.
    await client.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = $1)', [shopId]);
    await client.query('DELETE FROM orders WHERE shop_id = $1', [shopId]);
    await client.query('DELETE FROM products WHERE shop_id = $1', [shopId]);

    const productIds = [];
    for (const [name, description, price, unit] of PRODUCTS) {
      const r = await client.query(
        `INSERT INTO products (shop_id, name, description, price, unit, is_active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [shopId, name, description, price, unit]
      );
      productIds.push(r.rows[0].id);
    }

    const cust = await client.query(
      'SELECT id FROM customers WHERE shop_id = $1 ORDER BY created_at ASC LIMIT 1',
      [shopId]
    );
    let orderCount = 0;
    if (cust.rowCount) {
      const customerId = cust.rows[0].id;
      for (const o of ORDERS) {
        const items = o.lines.map((l) => {
          const [name, , price] = PRODUCTS[l.p];
          return { product_id: productIds[l.p], name, unit_price: price, quantity: l.q, line_total: price * l.q };
        });
        const subtotal = items.reduce((s, it) => s + it.line_total, 0);
        const ord = await client.query(
          `INSERT INTO orders
             (shop_id, customer_id, status, fulfillment_type, payment_mode, payment_status, subtotal, address, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [shopId, customerId, o.status, o.fulfillment_type, o.payment_mode, o.payment_status, subtotal, o.address, o.note]
        );
        for (const it of items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, name, unit_price, quantity, line_total)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [ord.rows[0].id, it.product_id, it.name, it.unit_price, it.quantity, it.line_total]
          );
        }
        orderCount++;
      }
    }

    await client.query('COMMIT');

    const domain = (process.env.APP_URL || 'https://khata.dadashaik.com').replace(/\/+$/, '');
    console.log(`\n✓ Seeded ${PRODUCTS.length} products and ${orderCount} orders for the demo shop.`);
    console.log('================ CONSUMER LINKS ================');
    console.log(`Shop catalog (share with customers): ${domain}/c/shop/${shopId}`);
    console.log(`Discover all listed shops:            ${domain}/c/shops`);
    console.log(`Shop id: ${shopId}`);
    console.log('================================================');
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
