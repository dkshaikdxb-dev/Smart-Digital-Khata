#!/usr/bin/env node
/**
 * Demo data seeder — 10 stores, 100 customers, sample transactions.
 *
 *   npm run seed:demo
 *
 * Idempotent: stores that already exist are skipped.
 * Refuses to run in production unless FORCE_DEMO=true.
 *
 * Store owner logins (all end with the same password suffix):
 *   store01@demo.local .. store10@demo.local / Store01@Demo2026 .. Store10@Demo2026
 * Customers have no logins by design — they are WhatsApp-side entities.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DEMO !== 'true') {
  console.error('Refusing to seed demo data in production. Set FORCE_DEMO=true to override.');
  process.exit(1);
}

const SHOPS = [
  'Sharma Kirana Store', 'Gupta General Store', 'Patel Provision Mart', 'Reddy Super Bazaar',
  'Khan Daily Needs', 'Iyer Grocery Corner', 'Singh Mini Market', 'Das Family Store',
  'Mehta Kirana Bhandar', 'Nair Fresh Mart',
];

const FIRST = ['Ramesh','Suresh','Mahesh','Rajesh','Dinesh','Prakash','Anita','Sunita','Kavita','Savita',
  'Amit','Sumit','Rohit','Mohit','Ajay','Vijay','Sanjay','Deepak','Pooja','Neha',
  'Arun','Varun','Tarun','Kiran','Manoj','Vinod','Ashok','Alok','Ravi','Shiva',
  'Geeta','Seeta','Meena','Reena','Lata','Asha','Usha','Nisha','Rekha','Radha'];
const LAST = ['Kumar','Sharma','Verma','Gupta','Patel','Reddy','Khan','Iyer','Singh','Das',
  'Mehta','Nair','Yadav','Joshi','Mishra','Pandey','Chauhan','Bhatt','Rao','Pillai'];

function pick(arr, i) { return arr[i % arr.length]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Marker note on the recent demo collections so re-runs can converge (delete +
// re-insert) instead of piling up rows.
const RECENT_COLLECTION_NOTE = 'demo recent collection';

/**
 * Post-loop polish for the demo dataset. Idempotent and safe to re-run on top of
 * already-seeded (skipped) shops:
 *   1. LIST all 10 demo shops (is_listed = true) with a placeholder city/area
 *      when blank, so GET /api/public/shops surfaces every demo store.
 *   2. Seed a few cash/upi COLLECTION transactions dated in the last 7 days for
 *      each demo shop, so owner Insights shows non-zero Collections + a non-zero
 *      collection rate (and a referred shop can "activate"). Money in paise.
 */
async function finalizeDemoShops() {
  // Three collections spread across the last 6 days (well inside the 7-day
  // Insights window): cash, upi, cash.
  const RECENT = [
    { daysAgo: 1, method: 'cash', amount: 35000 },
    { daysAgo: 3, method: 'upi', amount: 22000 },
    { daysAgo: 5, method: 'cash', amount: 18000 },
  ];

  for (let s = 1; s <= 10; s++) {
    const nn = String(s).padStart(2, '0');
    const email = `store${nn}@demo.local`;
    const owner = await pool.query('SELECT shop_id FROM users WHERE email = $1', [email]);
    if (!owner.rowCount || !owner.rows[0].shop_id) continue;
    const shopId = owner.rows[0].shop_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. List the shop in the public directory (with a sensible default
      //    location so the geo directory can place it), without clobbering any
      //    real values already set.
      await client.query(
        `UPDATE shops
            SET is_listed = true,
                city = COALESCE(NULLIF(city, ''), 'Bengaluru'),
                area = COALESCE(NULLIF(area, ''), 'MG Road')
          WHERE id = $1`,
        [shopId]
      );

      // 2. Refresh this shop's recent demo collections (idempotent via marker).
      const cust = await client.query(
        'SELECT id FROM customers WHERE shop_id = $1 ORDER BY created_at ASC LIMIT 1',
        [shopId]
      );
      if (cust.rowCount) {
        const custId = cust.rows[0].id;
        await client.query(
          'DELETE FROM transactions WHERE shop_id = $1 AND note = $2',
          [shopId, RECENT_COLLECTION_NOTE]
        );
        for (const p of RECENT) {
          // type = method (cash|upi) marks it a collection; amount in paise.
          await client.query(
            `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source, created_at)
             VALUES ($1,$2,$3,$4,$3,$5,'manual', NOW() - ($6 || ' days')::interval)`,
            [shopId, custId, p.method, p.amount, RECENT_COLLECTION_NOTE, p.daysAgo]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function seedDemo() {
  const credentials = [];
  let customerSeq = 0;

  for (let s = 1; s <= 10; s++) {
    const nn = String(s).padStart(2, '0');
    const email = `store${nn}@demo.local`;
    const password = `Store${nn}@Demo2026`;
    const ownerPhone = `+9198760000${nn}`;
    const shopName = SHOPS[s - 1];

    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rowCount) {
      console.log(`-- skip ${email} (already seeded)`);
      credentials.push({ email, password, shop: shopName, phone: ownerPhone, skipped: true });
      continue;
    }

    const hash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const u = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1,$2,$3,$4,'owner') RETURNING id`,
        [`${shopName.split(' ')[0]} Owner`, email, ownerPhone, hash]
      );
      const shop = await client.query(
        `INSERT INTO shops (owner_id, name, notification_mode, plan)
         VALUES ($1,$2,'smart', $3) RETURNING id`,
        [u.rows[0].id, shopName, s <= 3 ? 'pro' : 'free']
      );
      const shopId = shop.rows[0].id;
      await client.query('UPDATE users SET shop_id=$1 WHERE id=$2', [shopId, u.rows[0].id]);

      // 10 customers per store, each with 1–4 transactions over the last 14 days
      for (let c = 0; c < 10; c++) {
        customerSeq += 1;
        const custName = `${pick(FIRST, customerSeq)} ${pick(LAST, customerSeq + s)}`;
        const custPhone = `+91987610${String(customerSeq).padStart(4, '0')}`;
        const creditLimit = [0, 50000, 100000, 200000][rand(0, 3)]; // ₹0 / 500 / 1000 / 2000

        const cust = await client.query(
          `INSERT INTO customers (shop_id, name, phone, credit_limit)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [shopId, custName, custPhone, creditLimit]
        );
        const custId = cust.rows[0].id;

        let balance = 0;
        const txCount = rand(1, 4);
        for (let t = 0; t < txCount; t++) {
          const daysAgo = rand(0, 14);
          const isPurchase = t < txCount - 1 || rand(0, 1) === 1;
          if (isPurchase) {
            const amount = rand(10, 80) * 1000; // ₹100–₹800
            balance += amount;
            await client.query(
              `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source, created_at)
               VALUES ($1,$2,'purchase',$3,'credit',$4,'manual', NOW() - ($5 || ' days')::interval)`,
              [shopId, custId, amount, 'demo purchase', daysAgo]
            );
          } else if (balance > 0) {
            const amount = Math.min(balance, rand(10, 50) * 1000);
            balance -= amount;
            const method = rand(0, 1) ? 'cash' : 'upi';
            await client.query(
              `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source, created_at)
               VALUES ($1,$2,$3,$4,$3,'demo payment','manual', NOW() - ($5 || ' days')::interval)`,
              [shopId, custId, method, amount, daysAgo]
            );
          }
        }
        await client.query('UPDATE customers SET balance=$1 WHERE id=$2', [balance, custId]);
      }
      await client.query('COMMIT');
      console.log(`✓ ${shopName} — ${email}`);
      credentials.push({ email, password, shop: shopName, phone: ownerPhone });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`x failed ${shopName}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  // Post-loop polish — runs for ALL demo shops (freshly seeded OR skipped/
  // existing) so re-running the seed converges. Idempotent.
  await finalizeDemoShops();

  console.log('\n================ STORE OWNER LOGINS ================');
  console.log('Email                 | Password          | Shop');
  console.log('----------------------|-------------------|---------------------------');
  for (const c of credentials) {
    console.log(`${c.email.padEnd(21)} | ${c.password.padEnd(17)} | ${c.shop}${c.skipped ? ' (existing)' : ''}`);
  }
  console.log('====================================================');
  console.log('Customers have no logins by design (WhatsApp-side only).');
  console.log('Their demo phones: +919876100001 .. +919876100100');
  return credentials;
}

module.exports = { seedDemo, finalizeDemoShops };

// Only run (and own the pool lifecycle) when invoked directly as a script — when
// required from a test the pool must stay open for the rest of the suite.
if (require.main === module) {
  seedDemo()
    .then(() => pool.end())
    .catch((e) => { console.error(e); pool.end().finally(() => process.exit(1)); });
}
