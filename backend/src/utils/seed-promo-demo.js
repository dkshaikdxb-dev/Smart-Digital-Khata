#!/usr/bin/env node
/**
 * Working-demo seed for the geo-targeted promo system.
 *
 *   npm run seed:promo-demo
 *
 * Makes the consumer promo band VISIBLE end-to-end for testing: it fills blank
 * location fields on the demo shops (town/village/pincode) and creates a few
 * clearly-labelled sample campaigns. A tester who sets the consumer location
 * picker to the demo location then sees the Sponsored slides on the home screen.
 *
 * Everything it creates carries advertiser='DEMO Seed', so it is trivially
 * identified and removed:
 *   DELETE FROM ad_campaigns WHERE advertiser = 'DEMO Seed';   -- targets cascade
 *
 * Idempotent: location fills only touch NULL/blank fields (never an owner's real
 * value), and campaign creation is skipped entirely if any 'DEMO Seed' campaign
 * already exists. Safe to re-run. Not auto-run — the operator runs it via the
 * GitHub workflow (Seed promo demo).
 */
require('dotenv').config();
const { pool } = require('../config/db');

// The demo stores (from seed-demo.js). seed-demo already sets city='Bengaluru'
// and area='MG Road' when blank; we add the village/PIN granularity the geo
// targeting needs.
const DEMO_SHOPS = [
  'Sharma Kirana Store', 'Gupta General Store', 'Patel Provision Mart', 'Reddy Super Bazaar',
  'Khan Daily Needs', 'Iyer Grocery Corner', 'Singh Mini Market', 'Das Family Store',
  'Mehta Kirana Bhandar', 'Nair Fresh Mart',
];

const ADVERTISER = 'DEMO Seed';
const DEMO_TOWN = 'Bengaluru';
const DEMO_AREA = 'MG Road';
const DEMO_VILLAGE = 'MG Road Area';
const DEMO_PINCODE = '560001';

async function main() {
  // 1) Fill blank location on the demo shops (never overwrite a real value).
  const upd = await pool.query(
    `UPDATE shops
        SET city    = COALESCE(NULLIF(city, ''), $1),
            area    = COALESCE(NULLIF(area, ''), $2),
            village = COALESCE(NULLIF(village, ''), $3),
            pincode = COALESCE(NULLIF(pincode, ''), $4),
            updated_at = NOW()
      WHERE name = ANY($5::text[])`,
    [DEMO_TOWN, DEMO_AREA, DEMO_VILLAGE, DEMO_PINCODE, DEMO_SHOPS]
  );
  // eslint-disable-next-line no-console
  console.log(`✓ location filled on ${upd.rowCount} demo shop(s) (town=${DEMO_TOWN}, village=${DEMO_VILLAGE}, pincode=${DEMO_PINCODE})`);

  // 2) Skip campaign creation if the demo campaigns already exist (idempotent).
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE advertiser = $1', [ADVERTISER]);
  if (existing.rows[0].n > 0) {
    // eslint-disable-next-line no-console
    console.log(`↺ ${existing.rows[0].n} '${ADVERTISER}' campaign(s) already exist — skipping creation.`);
    hint();
    return;
  }

  const sharma = await pool.query('SELECT id FROM shops WHERE name = $1 LIMIT 1', ['Sharma Kirana Store']);
  const sharmaId = sharma.rows[0] ? sharma.rows[0].id : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const make = async (c, targets) => {
      const r = await client.query(
        `INSERT INTO ad_campaigns
           (style, title, offer_text, subtitle, glyph, i18n, advertiser,
            link_type, link_shop_id, is_seasonal, starts_at, ends_at, priority, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,'active')
         RETURNING id`,
        [c.style, c.title, c.offer_text, c.subtitle, c.glyph, JSON.stringify(c.i18n || {}), ADVERTISER,
          c.link_type || 'none', c.link_shop_id || null, c.is_seasonal || false,
          c.starts_at || null, c.ends_at || null, c.priority || 0]
      );
      const id = r.rows[0].id;
      for (const t of targets) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
          [id, t.geo_type, t.geo_value]);
      }
    };

    // A · offer tile — an FMCG-style saving, targeted town + pincode.
    await make(
      {
        style: 'offer', title: 'आशीर्वाद आटा', offer_text: '₹20 छूट', subtitle: '5 किलो पैक पर', glyph: '🌾',
        i18n: { en: { title: 'Aashirvaad Atta', offer_text: '₹20 off', subtitle: 'on the 5 kg pack' } }, priority: 100,
      },
      [{ geo_type: 'town', geo_value: DEMO_TOWN }, { geo_type: 'pincode', geo_value: DEMO_PINCODE }]
    );

    // C · featured shop — links to the demo Sharma Kirana store, town-targeted.
    await make(
      {
        style: 'shop', title: 'शर्मा किराना स्टोर', offer_text: 'आज 10% छूट', subtitle: '₹200 से ऊपर के ऑर्डर पर', glyph: '🏪',
        i18n: { en: { title: 'Sharma Kirana Store', offer_text: '10% off today' } },
        link_type: sharmaId ? 'shop' : 'none', link_shop_id: sharmaId, priority: 90,
      },
      [{ geo_type: 'town', geo_value: DEMO_TOWN }]
    );

    // D · festival — seasonal window (yesterday .. +14 days), pincode-targeted.
    const now = Date.now();
    await make(
      {
        style: 'festival', title: 'दिवाली धमाका', offer_text: 'थोक भाव', subtitle: 'बड़ी ख़रीद पर बचत', glyph: '🎆',
        i18n: { en: { title: 'Diwali Dhamaka', offer_text: 'wholesale rates' } },
        is_seasonal: true,
        starts_at: new Date(now - 86400000).toISOString(),
        ends_at: new Date(now + 14 * 86400000).toISOString(),
        priority: 80,
      },
      [{ geo_type: 'pincode', geo_value: DEMO_PINCODE }]
    );

    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log('✓ created 3 DEMO Seed campaigns (A offer, C featured shop, D festival) — all active.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  hint();
}

function hint() {
  // eslint-disable-next-line no-console
  console.log(`→ To see the band: open the consumer app, set the location picker to town '${DEMO_TOWN}' / pincode '${DEMO_PINCODE}'.`);
  // eslint-disable-next-line no-console
  console.log(`→ To remove the demo: DELETE FROM ad_campaigns WHERE advertiser = '${ADVERTISER}';  (targets cascade)`);
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('promo demo seed failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { main };
