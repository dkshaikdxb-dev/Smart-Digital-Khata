#!/usr/bin/env node
/**
 * House promo seed for the geo-targeted promo band.
 *
 *   npm run seed:promo-demo
 *
 * Seeds a small set of REAL, useful, house-authored promo cards (advertiser =
 * 'Smart Khata') so the consumer promo band is populated out of the box on a fresh
 * install. They are district-wide (geo 'all'), so they show for every shopper
 * regardless of location — no shop-location backfill is needed.
 *
 * CONVENTION (the correct one): the BASE columns hold the ENGLISH source, and the
 * native languages live in i18n[hi|ta|te|kn|ml|ur]. Serving does
 * COALESCE(i18n->lang->>field, base), so a viewer in one of those languages sees
 * the native text and everyone else (incl. bn/gu/mr, which promo serving does not
 * localize) honestly falls back to the English base.
 *
 * Everything it creates carries advertiser='Smart Khata', so it is trivially
 * identified and removed:
 *   DELETE FROM ad_campaigns WHERE advertiser = 'Smart Khata';   -- targets cascade
 *
 * Idempotent: creation is skipped entirely if any 'Smart Khata' campaign already
 * exists. Safe to re-run. Not auto-run — the operator runs it via the GitHub
 * workflow (Seed promo demo).
 */
require('dotenv').config();
const { pool } = require('../config/db');

// The house advertiser. Doubles as the idempotency sentinel + removal hint.
const ADVERTISER = 'Smart Khata';

// The house promo cards. Base fields are ENGLISH; i18n carries the native text for
// the six languages the promo band localizes (hi/ta/te/kn/ml/ur). bn/gu/mr are
// intentionally absent — they fall back to the English base (honesty; no machine
// translation). All are geo 'all' (everywhere) and link_type 'none'.
const HOUSE_PROMOS = [
  {
    // An "offer" style: pay-later at the local kirana.
    style: 'offer',
    title: 'Shop local, pay later',
    offer_text: 'Khata udhaar',
    subtitle: 'at your kirana',
    glyph: '🛍️',
    priority: 50,
    i18n: {
      hi: { title: 'स्थानीय दुकान से खरीदें, बाद में चुकाएँ', offer_text: 'खाता उधार', subtitle: 'आपकी किराना दुकान पर' },
      ta: { title: 'உள்ளூரில் வாங்குங்கள், பின்னர் செலுத்துங்கள்', offer_text: 'கடன் கணக்கு', subtitle: 'உங்கள் மளிகைக் கடையில்' },
      te: { title: 'స్థానికంగా కొనండి, తర్వాత చెల్లించండి', offer_text: 'ఖాతా అప్పు', subtitle: 'మీ కిరాణా దుకాణంలో' },
      kn: { title: 'ಸ್ಥಳೀಯವಾಗಿ ಖರೀದಿಸಿ, ನಂತರ ಪಾವತಿಸಿ', offer_text: 'ಖಾತೆ ಸಾಲ', subtitle: 'ನಿಮ್ಮ ಕಿರಾಣಿ ಅಂಗಡಿಯಲ್ಲಿ' },
      ml: { title: 'പ്രാദേശികമായി വാങ്ങുക, പിന്നീട് പണം നൽകുക', offer_text: 'കടം കണക്ക്', subtitle: 'നിങ്ങളുടെ പലചരക്ക് കടയിൽ' },
      ur: { title: 'مقامی دکان سے خریدیں، بعد میں ادا کریں', offer_text: 'کھاتہ ادھار', subtitle: 'آپ کی کرانہ دکان پر' },
    },
  },
  {
    // A "festival" style seasonal banner (always-on window for the demo).
    style: 'festival',
    title: 'Festival deals near you',
    offer_text: 'Seasonal savings',
    subtitle: 'at local shops',
    glyph: '🎉',
    is_seasonal: true,
    priority: 40,
    i18n: {
      hi: { title: 'आपके पास त्योहारी ऑफ़र', offer_text: 'मौसमी बचत', subtitle: 'स्थानीय दुकानों पर' },
      ta: { title: 'உங்கள் அருகில் பண்டிகை சலுகைகள்', offer_text: 'பருவகால சேமிப்பு', subtitle: 'உள்ளூர் கடைகளில்' },
      te: { title: 'మీ దగ్గర పండుగ ఆఫర్లు', offer_text: 'సీజనల్ పొదుపు', subtitle: 'స్థానిక దుకాణాల్లో' },
      kn: { title: 'ನಿಮ್ಮ ಹತ್ತಿರ ಹಬ್ಬದ ಕೊಡುಗೆಗಳು', offer_text: 'ಋತುಮಾನ ಉಳಿತಾಯ', subtitle: 'ಸ್ಥಳೀಯ ಅಂಗಡಿಗಳಲ್ಲಿ' },
      ml: { title: 'നിങ്ങളുടെ അടുത്ത് ഉത്സവ ഓഫറുകൾ', offer_text: 'സീസണൽ ലാഭം', subtitle: 'പ്രാദേശിക കടകളിൽ' },
      ur: { title: 'آپ کے قریب تہواری آفرز', offer_text: 'موسمی بچت', subtitle: 'مقامی دکانوں پر' },
    },
  },
];

async function main() {
  // Remove the legacy inverted-language demo banners ('DEMO Seed') if any remain
  // from a previous run, so this seed is a true REPLACE. Runs every time (even
  // when the house promos already exist) and is a no-op once they are gone; their
  // ad_targets cascade on delete.
  const purged = await pool.query("DELETE FROM ad_campaigns WHERE advertiser = 'DEMO Seed'");
  if (purged.rowCount) {
    // eslint-disable-next-line no-console
    console.log(`🧹 Removed ${purged.rowCount} legacy 'DEMO Seed' campaign(s).`);
  }

  // Skip creation if the house campaigns already exist (idempotent).
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM ad_campaigns WHERE advertiser = $1', [ADVERTISER]);
  if (existing.rows[0].n > 0) {
    // eslint-disable-next-line no-console
    console.log(`↺ ${existing.rows[0].n} '${ADVERTISER}' campaign(s) already exist — skipping creation.`);
    hint();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of HOUSE_PROMOS) {
      // eslint-disable-next-line no-await-in-loop
      const r = await client.query(
        `INSERT INTO ad_campaigns
           (style, title, offer_text, subtitle, glyph, i18n, advertiser,
            link_type, is_seasonal, priority, status)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'none',$8,$9,'active')
         RETURNING id`,
        [c.style, c.title, c.offer_text, c.subtitle, c.glyph, JSON.stringify(c.i18n || {}),
          ADVERTISER, c.is_seasonal || false, c.priority || 0]
      );
      const id = r.rows[0].id;
      // District-wide: one 'all' target so it shows everywhere.
      // eslint-disable-next-line no-await-in-loop
      await client.query('INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)', [id, 'all', null]);
    }
    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log(`✓ created ${HOUSE_PROMOS.length} '${ADVERTISER}' house campaign(s) — all active, everywhere.`);
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
  console.log('→ To see the band: open the consumer app — these show for every location (geo all).');
  // eslint-disable-next-line no-console
  console.log(`→ To remove them: DELETE FROM ad_campaigns WHERE advertiser = '${ADVERTISER}';  (targets cascade)`);
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('promo house seed failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { main };
