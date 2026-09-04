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

// 50 everyday kirana products. price is paise (₹ = price/100). Names are
// BILINGUAL — "Telugu · English" — so a Telugu-first shopper reads the local
// term while the English brand/keyword stays visible (and keeps the emoji
// matcher working). Descriptions are Telugu. A real shop enters its own
// language; this is demo data and the Telugu wording still deserves a native
// QA pass.
const PRODUCTS = [
  ['గోధుమ పిండి · Aashirvaad Atta 5kg', 'గోధుమ పిండి', 28500, 'bag'],
  ['గోధుమ పిండి · Aashirvaad Atta 10kg', 'గోధుమ పిండి', 55000, 'bag'],
  ['బాస్మతి బియ్యం · India Gate Basmati Rice 1kg', 'ప్రీమియం బాస్మతి', 14000, 'kg'],
  ['బాస్మతి బియ్యం · India Gate Basmati Rice 5kg', 'ప్రీమియం బాస్మతి', 65000, 'bag'],
  ['సోన మసూరి బియ్యం · Sona Masoori Rice 5kg', 'నిత్యం వాడే బియ్యం', 32000, 'bag'],
  ['కంది పప్పు · Toor Dal (Arhar) 1kg', 'కంది పప్పు', 16000, 'kg'],
  ['పెసర పప్పు · Moong Dal 1kg', 'పెసర పప్పు', 13500, 'kg'],
  ['శనగ పప్పు · Chana Dal 1kg', 'శనగ పప్పు', 9500, 'kg'],
  ['మినప పప్పు · Urad Dal 1kg', 'మినప పప్పు', 14500, 'kg'],
  ['మసూర్ పప్పు · Masoor Dal 1kg', 'ఎర్ర పప్పు', 11000, 'kg'],
  ['రాజ్మా · Rajma 1kg', 'రాజ్మా చిక్కుడు గింజలు', 15000, 'kg'],
  ['కాబూలీ శనగలు · Kabuli Chana 1kg', 'తెల్ల శనగలు', 12000, 'kg'],
  ['అటుకులు · Poha 500g', 'అటుకులు', 3500, 'packet'],
  ['రవ్వ · Sooji / Rava 500g', 'రవ్వ', 3000, 'packet'],
  ['మైదా · Maida 1kg', 'మైదా పిండి', 5000, 'kg'],
  ['శనగ పిండి · Besan 1kg', 'శనగ పిండి', 9000, 'kg'],
  ['పొద్దుతిరుగుడు నూనె · Fortune Sunflower Oil 1L', 'వంట నూనె', 15500, 'litre'],
  ['సోయా నూనె · Fortune Soya Oil 1L', 'సోయా వంట నూనె', 14000, 'litre'],
  ['నూనె · Saffola Gold Oil 1L', 'మిశ్రమ వంట నూనె', 19000, 'litre'],
  ['ఆవనూనె · Mustard Oil 1L', 'ఆవనూనె', 16500, 'litre'],
  ['నెయ్యి · Amul Ghee 1L', 'స్వచ్ఛమైన నెయ్యి', 62000, 'tin'],
  ['పంచదార · Sugar 1kg', 'పంచదార', 4500, 'kg'],
  ['ఉప్పు · Tata Salt 1kg', 'అయోడైజ్డ్ ఉప్పు', 2800, 'kg'],
  ['బెల్లం · Jaggery (Gud) 1kg', 'సహజ తీపి', 6000, 'kg'],
  ['పసుపు · Turmeric Powder 200g', 'పసుపు', 5500, 'packet'],
  ['కారం · Red Chilli Powder 200g', 'మిరప కారం', 7000, 'packet'],
  ['ధనియాల పొడి · Coriander Powder 200g', 'ధనియాల పొడి', 5000, 'packet'],
  ['గరం మసాలా · Garam Masala 100g', 'మసాలా మిశ్రమం', 6500, 'packet'],
  ['జీలకర్ర · Cumin Seeds 200g', 'జీలకర్ర', 8000, 'packet'],
  ['ఆవాలు · Mustard Seeds 200g', 'ఆవాలు', 3500, 'packet'],
  ['మిరియాలు · Black Pepper 100g', 'మిరియాలు', 9000, 'packet'],
  ['టీ పొడి · Tata Tea Gold 500g', 'తేయాకు', 26000, 'packet'],
  ['టీ పొడి · Red Label Tea 250g', 'తేయాకు', 13000, 'packet'],
  ['కాఫీ · Bru Instant Coffee 100g', 'ఇన్‌స్టంట్ కాఫీ', 22000, 'jar'],
  ['బోర్న్‌విటా · Bournvita 500g', 'మాల్ట్ డ్రింక్', 24500, 'jar'],
  ['వెన్న · Amul Butter 500g', 'టేబుల్ వెన్న', 27500, 'packet'],
  ['పాల పొడి · Amulya Milk Powder 500g', 'పాల పొడి', 26000, 'packet'],
  ['బిస్కెట్లు · Parle-G Biscuits 800g', 'గ్లూకోజ్ బిస్కెట్లు', 8000, 'packet'],
  ['బిస్కెట్లు · Britannia Marie Gold 250g', 'టీ బిస్కెట్లు', 4000, 'packet'],
  ['బిస్కెట్లు · Good Day Biscuits 200g', 'కుకీలు', 3500, 'packet'],
  ['నూడుల్స్ · Maggi Noodles 6-pack', 'ఇన్‌స్టంట్ నూడుల్స్', 8400, 'pack'],
  ['నమ్‌కీన్ · Kurkure 100g', 'నమ్‌కీన్ స్నాక్', 2000, 'packet'],
  ['సబ్బు · Lifebuoy Soap 4-pack', 'స్నానపు సబ్బు', 8000, 'pack'],
  ['సబ్బు · Lux Soap 3-pack', 'స్నానపు సబ్బు', 9000, 'pack'],
  ['సబ్బు పొడి · Surf Excel 1kg', 'డిటర్జెంట్ పొడి', 12500, 'packet'],
  ['గిన్నెల సబ్బు · Vim Dishwash Bar 3-pack', 'గిన్నెలు కడిగే సబ్బు', 3000, 'pack'],
  ['టూత్‌పేస్ట్ · Colgate Toothpaste 200g', 'టూత్‌పేస్ట్', 11000, 'tube'],
  ['టాయిలెట్ క్లీనర్ · Harpic 500ml', 'టాయిలెట్ క్లీనర్', 9500, 'bottle'],
  ['దోమల మందు · Good Knight Refill', 'దోమల మందు', 7500, 'piece'],
  ['అగర్‌బత్తి · Agarbatti Pack', 'అగరుబత్తులు', 3000, 'packet'],
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
