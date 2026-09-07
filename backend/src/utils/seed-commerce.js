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
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

// Pre-generated product image tiles committed under seed-images/. Attach one to
// any product whose (English) name contains the keyword. Real shops replace
// these by uploading a photo; products with no match keep the emoji fallback.
const IMAGE_DIR = path.join(__dirname, 'seed-images');
const IMAGE_MATCH = [
  ['atta', 'atta'], ['basmati', 'basmati'], ['toor', 'toor-dal'],
  ['sunflower oil', 'sunflower-oil'], ['ghee', 'ghee'], ['sugar', 'sugar'],
  ['salt', 'salt'], ['turmeric', 'turmeric'], ['tea', 'tea'],
  ['butter', 'butter'], ['bath soap', 'lux-soap'], ['detergent powder', 'surf-excel'],
  ['toothpaste', 'colgate'],
];
function imageFileFor(name) {
  const n = String(name).toLowerCase();
  for (const [kw, slug] of IMAGE_MATCH) {
    if (n.includes(kw)) {
      const f = path.join(IMAGE_DIR, `${slug}.webp`);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DEMO !== 'true') {
  console.error('Refusing to seed demo commerce in production. Set FORCE_DEMO=true to override.');
  process.exit(1);
}

const DEMO_OWNER_EMAIL = 'store01@demo.local';

// 50 everyday kirana products. price is paise (₹ = price/100). Names are now a
// CLEAN ENGLISH BASE NAME — each chosen to match a `catalog_i18n` product
// `term_en` so it LOCALIZES at display time via the consumer catalogue's
// ?lang= join (COALESCE(cp.name, products.name)). A Telugu/Hindi/… shopper sees
// the native term; ?lang=en (or none) shows this English base. A couple of
// items (e.g. Salt) have no master translation and stay English by design — a
// good demo of the English fallback. Descriptions are short English.
const PRODUCTS = [
  ['Whole Wheat Atta', 'Stone-ground whole wheat flour', 28500, 'bag'],
  ['Multigrain Atta', 'Multigrain flour blend', 55000, 'bag'],
  ['Basmati Rice', 'Long-grain aromatic rice', 14000, 'kg'],
  ['Sona Masuri Rice', 'Everyday medium-grain rice', 65000, 'bag'],
  ['Ponni Rice', 'Popular South Indian rice', 32000, 'bag'],
  ['Toor Dal', 'Split pigeon peas (arhar)', 16000, 'kg'],
  ['Moong Dal', 'Split green gram', 13500, 'kg'],
  ['Chana Dal', 'Split Bengal gram', 9500, 'kg'],
  ['Urad Dal Split', 'Split black gram', 14500, 'kg'],
  ['Masoor Dal', 'Split red lentils', 11000, 'kg'],
  ['Rajma Chitra', 'Speckled kidney beans', 15000, 'kg'],
  ['Kabuli Chana', 'White chickpeas', 12000, 'kg'],
  ['Poha', 'Flattened rice flakes', 3500, 'packet'],
  ['Sooji/Rava', 'Semolina', 3000, 'packet'],
  ['Maida', 'Refined wheat flour', 5000, 'kg'],
  ['Besan', 'Gram flour', 9000, 'kg'],
  ['Sunflower Oil', 'Refined sunflower cooking oil', 15500, 'litre'],
  ['Mustard Oil', 'Cold-pressed mustard oil', 16500, 'litre'],
  ['Groundnut Oil', 'Refined groundnut oil', 19000, 'litre'],
  ['Coconut Oil', 'Pure coconut oil', 16500, 'litre'],
  ['Desi Ghee', 'Pure clarified butter', 62000, 'tin'],
  ['Sugar', 'Refined white sugar', 4500, 'kg'],
  ['Salt', 'Iodized table salt', 2800, 'kg'],
  ['Jaggery', 'Natural cane jaggery (gud)', 6000, 'kg'],
  ['Turmeric Powder', 'Ground turmeric', 5500, 'packet'],
  ['Red Chilli Powder', 'Ground red chilli', 7000, 'packet'],
  ['Coriander Powder', 'Ground coriander', 5000, 'packet'],
  ['Garam Masala', 'Blended whole-spice powder', 6500, 'packet'],
  ['Cumin Seeds', 'Whole jeera', 8000, 'packet'],
  ['Mustard Seeds', 'Whole mustard seeds', 3500, 'packet'],
  ['Black Pepper', 'Whole black peppercorns', 9000, 'packet'],
  ['Tea', 'Loose black tea', 26000, 'packet'],
  ['Green Tea', 'Green tea leaves', 13000, 'packet'],
  ['Instant Coffee', 'Instant coffee granules', 22000, 'jar'],
  ['Honey', 'Pure natural honey', 24500, 'jar'],
  ['Butter', 'Table butter', 27500, 'packet'],
  ['Paneer', 'Fresh cottage cheese', 26000, 'packet'],
  ['Curd', 'Fresh set curd', 8000, 'packet'],
  ['Toned Milk', 'Toned dairy milk', 4000, 'packet'],
  ['Full Cream Milk', 'Full cream dairy milk', 3500, 'packet'],
  ['Oats', 'Rolled breakfast oats', 8400, 'pack'],
  ['Peanuts', 'Raw groundnuts', 2000, 'packet'],
  ['Bath Soap', 'Everyday bathing soap', 8000, 'pack'],
  ['Shampoo', 'Hair shampoo', 9000, 'pack'],
  ['Detergent Powder', 'Laundry detergent powder', 12500, 'packet'],
  ['Detergent Liquid', 'Liquid dishwash', 3000, 'pack'],
  ['Toothpaste', 'Fluoride toothpaste', 11000, 'tube'],
  ['Toothbrush', 'Soft-bristle toothbrush', 7500, 'piece'],
  ['Mosquito Coils', 'Mosquito repellent coils', 3000, 'packet'],
  ['Hair Oil', 'Nourishing hair oil', 9000, 'bottle'],
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
      throw new Error(`Demo shop not found (owner ${DEMO_OWNER_EMAIL}). Run "npm run seed:demo" first.`);
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
    let imagedCount = 0;
    for (const [name, description, price, unit] of PRODUCTS) {
      const r = await client.query(
        `INSERT INTO products (shop_id, name, description, price, unit, is_active)
         VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
        [shopId, name, description, price, unit]
      );
      const id = r.rows[0].id;
      productIds.push(id);

      // Attach a pre-generated image tile if one matches this product.
      const imgFile = imageFileFor(name);
      if (imgFile) {
        const bytes = fs.readFileSync(imgFile);
        await client.query(
          `UPDATE products
             SET image_data = $1,
                 image_mime = 'image/webp',
                 image_updated_at = NOW(),
                 image_url = '/api/products/' || id || '/image?v=' || EXTRACT(EPOCH FROM NOW())::bigint
           WHERE id = $2`,
          [bytes, id]
        );
        imagedCount += 1;
      }
    }

    // Variant demo: carry a few variant-rich base products (multiple brands ×
    // pack sizes) so the storefront shows brand + size selectors. Linked to the
    // catalog so each shop product exposes base_product/brand/pack. Skips
    // silently if the base catalog hasn't been imported yet.
    let variantCount = 0;
    const VARIANT_PRODUCTS = ['Sona Masuri Rice', 'Marie Biscuits', 'Cream Biscuits'];
    const ci = await client.query(
      `SELECT id, product, brand, pack, indicative_price
         FROM catalog_items
        WHERE product = ANY($1) AND is_global = true
        ORDER BY product, brand, pack`,
      [VARIANT_PRODUCTS]
    );
    for (const row of ci.rows) {
      const name = [row.brand, row.product, row.pack].filter(Boolean).join(' ');
      await client.query(
        `INSERT INTO products (shop_id, name, description, price, unit, is_active, catalog_item_id)
         VALUES ($1,$2,$3,$4,$5,true,$6)`,
        [shopId, name, row.product, Number(row.indicative_price) || 0, row.pack || 'unit', row.id]
      );
      variantCount += 1;
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
    console.log(`\n✓ Seeded ${PRODUCTS.length} products (${imagedCount} with images, ${variantCount} variant SKUs) and ${orderCount} orders for the demo shop.`);
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

module.exports = { seedCommerce };

// Only run (and own the pool lifecycle) when invoked directly as a script — when
// required from a test the pool must stay open for the rest of the suite.
if (require.main === module) {
  seedCommerce()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Commerce seed failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}
