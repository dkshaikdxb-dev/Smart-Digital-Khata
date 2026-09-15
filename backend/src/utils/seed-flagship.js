#!/usr/bin/env node
/**
 * Flagship demo storefront — turns the demo shop that already has the rich
 * catalogue (store01, "Sharma Kirana Store") into a fully branded premium
 * storefront with a real photo slider and its own slide in the marketplace
 * carousel.
 *
 *   npm run seed:flagship        (or, normally, npm run data:demo)
 *
 * THIS IS DEMO DATA. It runs only from load-demo-data.js, which a deploy invokes
 * only when the operator set SEED_DEMO_DATA=true, and it keeps the same
 * FORCE_DEMO guard the other two demo seeders keep. Nothing here loads on a
 * normal deploy.
 *
 * WHAT IT SEEDS, and why each piece is what it is:
 *
 *   1. THREE STOREFRONT PHOTOS (shop_images, migration 0062/0063). The committed
 *      tiles under seed-images/ are PRODUCT photos — a packet of atta is not a
 *      shopfront — so the banners are drawn here as SVG and rasterized to WebP
 *      through the SAME utils/image.processImage pipeline an owner's upload goes
 *      through (sharp is already a dependency and renders SVG input). They are
 *      flat vector illustrations with NO text: the runtime container is
 *      node:20-alpine, which ships no fonts, so any <text> would silently
 *      disappear there and nobody would notice. They come out around 6–10 KB
 *      each, which matters on the 2G phones this product is for.
 *
 *      The cap is the ONE cap (utils/shopImages.MAX_SHOP_IMAGES) the upload
 *      endpoint enforces, and the seeder never exceeds it — if the shop already
 *      has photos of its own, only the remaining room is filled.
 *
 *   2. PREMIUM — the "Branded Store" (migration 0056). That is what premium
 *      actually IS in this codebase: branded_until > NOW() unlocks the accent
 *      colour, the tagline and the Premium badge on the public storefront, bumps
 *      the shop's self-serve promos a notch in the serving order, and keeps the
 *      sponsored slide OFF its own storefront slider (0063). `plan` ('pro',
 *      already set by seed-demo) is a BILLING tier — it unlocks nothing on the
 *      storefront — so it is not touched here.
 *
 *   3. ITS OWN SELF-SERVE PROMO in the discovery band, so the shop appears in
 *      the marketplace carousel on the shops page beside the house "Smart Khata"
 *      slides. Same row shape, same geo targets, same priority rule as a real
 *      purchase through POST /api/promos/mine.
 *
 * MONEY. Both purchases are real, guarded debits through utils/wallet.spendCredits
 * (integer paise, append-only ledger, balance can never go negative) at exactly
 * the price platform_settings says: days × credits_per_day_paise, read live. The
 * demo shop has no earned credits, so the seeder first grants it EXACTLY the
 * shortfall for the purchases it is about to make, as one 'adjustment' credit
 * that says in its ledger note that it is a demo grant. Nothing is invented and
 * nothing is left over.
 *
 * MODERATION. Owner storefront photos and shop-bought promos are both moderated:
 * they start 'pending_review' and only go public when an admin approves them. The
 * seeder does not bypass that. It writes each row in 'pending_review' and then
 * approves it ITSELF, with a moderation_actions audit row (admin_user_id NULL,
 * the same way the AI triage job records its own decisions) and a review_note on
 * the row saying a seed did it. See the banner it prints. It does NOT touch the
 * shop's moderation trust counters (0070): no human judged this content, so
 * nothing should be banked against a future auto-approve bar.
 *
 * IDEMPOTENT. Every piece is guarded on its own, so a partial run converges too:
 * the photos are marked with a seed review_note and re-run to the same three,
 * premium is skipped while the window is still open, and the promo is skipped
 * while a seeded one is still pending or live. A second run spends nothing.
 */
require('dotenv').config();
const { pool } = require('../config/db');
const { processImage } = require('./image');
// The ONE storefront-photo cap (also the upload endpoint's 409 threshold).
const { MAX_SHOP_IMAGES } = require('./shopImages');
// Live pricing, read from platform_settings exactly like the owner endpoints do.
const { getBrandedStoreConfig } = require('./brandedStore');
const { getShopPromoConfig } = require('./shopPromo');
// The ONE redemption primitive + the ONE way to put credit in a wallet.
const { spendCredits, getOrCreateWallet, creditWallet } = require('./wallet');
// The ONE moderation audit trail.
const { writeAudit } = require('../controllers/admin.controller');
// The ONE definition of "this shop's own locality" for a self-serve promo.
const { shopTargets } = require('../controllers/promos.controller');

if (process.env.NODE_ENV === 'production' && process.env.FORCE_DEMO !== 'true') {
  console.error('Refusing to seed the flagship demo storefront in production. Set FORCE_DEMO=true to override.');
  process.exit(1);
}

const DEMO_OWNER_EMAIL = 'store01@demo.local';

// The premium theming. English only — this file authors no translations.
const BRAND_ACCENT = '#15803D';
const BRAND_TAGLINE = 'Everyday kirana essentials, freshly stocked';

// How long the demo shop buys each thing for. Both are clamped against the live
// max_days from platform_settings before anything is charged.
const PREMIUM_DAYS = 30;
const PROMO_DAYS = 30;

// Markers. They are also honest review notes: they are what the reviewer (this
// seeder) has to say about the row, and the owner sees them in their own UI.
const PHOTO_NOTE = 'Demo storefront banner generated and approved by the demo data seeder (SEED_DEMO_DATA).';
const PROMO_NOTE = 'Demo placement approved by the demo data seeder (SEED_DEMO_DATA), not by a human reviewer.';
const GRANT_NOTE = 'demo flagship credit grant (SEED_DEMO_DATA)';

// ---------------------------------------------------------------------------
// The banners. Flat vector illustrations of a kirana shop, in the shop's own
// brand palette, drawn with shapes only (see the header: no fonts in the runtime
// image). 1200x600 — the 2:1 a storefront header wants — which the upload
// pipeline's 1600px long edge leaves untouched.
// ---------------------------------------------------------------------------
const W = 1200;
const H = 600;
const P = {
  accent: BRAND_ACCENT,
  accentDark: '#14532D',
  accentLite: '#22C55E',
  warm: '#F59E0B',
  warmDark: '#B45309',
  cream: '#FEF3C7',
  white: '#FFFFFF',
  sky: '#FFF7ED',
  wood: '#A16207',
  jute: '#854D0E',
};

// 1. The shopfront from the street: signboard, striped awning, open shutter,
//    produce crates on the step.
function shopfrontSvg() {
  const stripes = [];
  for (let i = 0; i < 10; i += 1) {
    stripes.push(`<rect x="${200 + i * 80}" y="200" width="80" height="70" fill="${i % 2 ? P.cream : P.accent}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${P.sky}"/>
<circle cx="1010" cy="120" r="70" fill="${P.warm}" opacity="0.35"/>
<rect x="0" y="470" width="${W}" height="130" fill="${P.cream}"/>
<rect x="200" y="90" width="800" height="380" rx="10" fill="${P.white}"/>
<rect x="200" y="90" width="800" height="18" fill="${P.accentDark}"/>
<rect x="260" y="120" width="680" height="72" rx="8" fill="${P.accentDark}"/>
<rect x="290" y="146" width="380" height="20" rx="10" fill="${P.cream}" opacity="0.85"/>
<rect x="700" y="146" width="150" height="20" rx="10" fill="${P.warm}" opacity="0.85"/>
${stripes.join('')}
<rect x="200" y="266" width="800" height="10" fill="${P.accentDark}" opacity="0.25"/>
<rect x="300" y="300" width="230" height="170" rx="6" fill="${P.accentDark}" opacity="0.12"/>
<rect x="330" y="330" width="170" height="140" rx="4" fill="${P.accent}"/>
<rect x="330" y="330" width="170" height="14" fill="${P.accentDark}"/>
<rect x="600" y="310" width="300" height="120" rx="8" fill="${P.accentDark}" opacity="0.10"/>
<rect x="630" y="340" width="110" height="60" rx="6" fill="${P.warm}"/>
<rect x="760" y="340" width="110" height="60" rx="6" fill="${P.accentLite}"/>
<rect x="150" y="400" width="110" height="70" rx="6" fill="${P.wood}"/>
<rect x="150" y="400" width="110" height="12" fill="${P.warmDark}"/>
<circle cx="177" cy="392" r="18" fill="${P.accentLite}"/>
<circle cx="210" cy="386" r="20" fill="${P.warm}"/>
<circle cx="240" cy="394" r="16" fill="${P.accent}"/>
</svg>`;
}

// 2. Inside the shop: jars on the top shelf, sacks of grain below.
function shelvesSvg() {
  const jars = [];
  for (let i = 0; i < 7; i += 1) {
    const x = 140 + i * 130;
    jars.push(`<rect x="${x}" y="150" width="86" height="110" rx="10" fill="${i % 2 ? P.warm : P.accentLite}"/>`);
    jars.push(`<rect x="${x + 18}" y="132" width="50" height="22" rx="6" fill="${P.accentDark}"/>`);
    jars.push(`<rect x="${x + 8}" y="196" width="70" height="26" rx="4" fill="${P.white}" opacity="0.75"/>`);
  }
  const sacks = [];
  for (let i = 0; i < 5; i += 1) {
    const x = 160 + i * 180;
    sacks.push(`<path d="M ${x} 430 L ${x + 20} 330 L ${x + 100} 330 L ${x + 120} 430 Z" fill="${i % 2 ? P.jute : P.wood}"/>`);
    sacks.push(`<rect x="${x + 34}" y="316" width="52" height="20" rx="8" fill="${P.warmDark}"/>`);
    sacks.push(`<rect x="${x + 30}" y="366" width="60" height="26" rx="4" fill="${P.cream}" opacity="0.8"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${P.cream}"/>
<rect x="0" y="0" width="${W}" height="90" fill="${P.accentDark}"/>
<rect x="60" y="34" width="260" height="22" rx="11" fill="${P.cream}" opacity="0.8"/>
<rect x="340" y="34" width="120" height="22" rx="11" fill="${P.warm}" opacity="0.85"/>
${jars.join('')}
<rect x="100" y="260" width="1000" height="18" rx="6" fill="${P.wood}"/>
${sacks.join('')}
<rect x="100" y="430" width="1000" height="18" rx="6" fill="${P.wood}"/>
<rect x="0" y="470" width="${W}" height="130" fill="${P.accent}"/>
<circle cx="200" cy="535" r="34" fill="${P.white}" opacity="0.18"/>
<circle cx="1000" cy="535" r="46" fill="${P.white}" opacity="0.12"/>
</svg>`;
}

// 3. Fresh stock: a crate of produce on the counter.
function produceSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${P.accent}"/>
<circle cx="150" cy="120" r="90" fill="${P.accentLite}" opacity="0.30"/>
<circle cx="1060" cy="150" r="110" fill="${P.accentDark}" opacity="0.35"/>
<rect x="0" y="470" width="${W}" height="130" fill="${P.accentDark}"/>
<rect x="380" y="300" width="440" height="180" rx="12" fill="${P.wood}"/>
<rect x="380" y="300" width="440" height="22" rx="8" fill="${P.warmDark}"/>
<rect x="408" y="344" width="384" height="16" rx="6" fill="${P.jute}"/>
<rect x="408" y="396" width="384" height="16" rx="6" fill="${P.jute}"/>
<rect x="408" y="448" width="384" height="16" rx="6" fill="${P.jute}"/>
<circle cx="424" cy="284" r="38" fill="${P.accentLite}"/>
<circle cx="500" cy="272" r="46" fill="${P.warm}"/>
<circle cx="592" cy="258" r="54" fill="${P.cream}"/>
<circle cx="686" cy="268" r="48" fill="${P.accentLite}"/>
<circle cx="770" cy="280" r="40" fill="${P.warm}"/>
<path d="M 592 204 q 40 -44 78 -30 q -14 42 -62 44 Z" fill="${P.accentDark}"/>
<rect x="150" y="380" width="150" height="100" rx="10" fill="${P.cream}"/>
<rect x="150" y="380" width="150" height="20" rx="8" fill="${P.warm}"/>
<rect x="186" y="416" width="78" height="30" rx="6" fill="${P.wood}" opacity="0.5"/>
<rect x="900" y="360" width="130" height="120" rx="10" fill="${P.cream}"/>
<rect x="900" y="360" width="130" height="20" rx="8" fill="${P.warm}"/>
<rect x="928" y="400" width="74" height="34" rx="6" fill="${P.wood}" opacity="0.5"/>
</svg>`;
}

// Ordered: the street view leads (it is the slide a shopper sees first), then
// the shelves, then the produce.
const BANNERS = [shopfrontSvg, shelvesSvg, produceSvg];

/**
 * Rasterize one banner SVG to WebP through the same pipeline an owner upload
 * uses. processImage falls back to the ORIGINAL bytes when sharp is unavailable
 * or cannot decode the input — for an upload that is the right call, but here it
 * would store raw SVG in a column the storefront serves as an image, so we
 * refuse instead of storing something unexpected.
 */
async function renderBanner(svg) {
  const out = await processImage(Buffer.from(svg), {
    maxDim: 1600,
    quality: 78,
    fallbackMime: 'image/svg+xml',
  });
  if (out.mime !== 'image/webp') {
    throw new Error('sharp did not produce WebP for the seeded storefront banner — refusing to store raw SVG');
  }
  return out;
}

// ---------------------------------------------------------------------------

/** The shop's Khata Credit balance in paise (0 when it has no wallet yet). */
async function balancePaise(shopId) {
  const r = await pool.query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

/**
 * The flagship seed. Returns a summary of what is now true, so the caller can
 * print it and a test can assert on it.
 */
async function seedFlagship() {
  const owner = await pool.query('SELECT id, shop_id FROM users WHERE email = $1', [DEMO_OWNER_EMAIL]);
  if (!owner.rowCount || !owner.rows[0].shop_id) {
    throw new Error(`Demo shop not found (owner ${DEMO_OWNER_EMAIL}). Run "npm run seed:demo" first.`);
  }
  const ownerUserId = owner.rows[0].id;
  const shopId = owner.rows[0].shop_id;

  const shopRow = await pool.query(
    `SELECT id, name, city, area, village, pincode, brand_accent, brand_tagline,
            (branded_until IS NOT NULL AND branded_until > NOW()) AS is_branded
       FROM shops WHERE id = $1`,
    [shopId]
  );
  if (!shopRow.rowCount) throw new Error('Demo shop row missing');
  const shop = shopRow.rows[0];

  const [brandCfg, promoCfg] = await Promise.all([getBrandedStoreConfig(), getShopPromoConfig()]);

  // ---- what still has to be bought on THIS run --------------------------
  const premiumDays = Math.min(PREMIUM_DAYS, brandCfg.max_days);
  const promoDays = Math.min(PROMO_DAYS, promoCfg.max_days);
  const premiumCost = premiumDays * brandCfg.credits_per_day_paise;
  const promoCost = promoDays * promoCfg.credits_per_day_paise;

  // A seeded placement that is still pending or live means there is nothing to
  // buy. `ends_at` guards the case where an old seeded promo simply expired.
  const livePromo = await pool.query(
    `SELECT id, status, credits_spent_paise FROM ad_campaigns
      WHERE self_serve = true AND link_shop_id = $1 AND review_note = $2
        AND status IN ('pending_review','active')
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY created_at DESC LIMIT 1`,
    [shopId, PROMO_NOTE]
  );

  const needPremium = brandCfg.enabled && premiumCost > 0 && !shop.is_branded;
  const needPromo = promoCfg.enabled && promoCost > 0 && livePromo.rowCount === 0;

  // ---- the credit grant: EXACTLY the shortfall, once --------------------
  // The demo shop has never earned a referral reward, so it cannot buy anything.
  // Top it up by the difference between what it holds and what this run is about
  // to spend — no more — as one 'adjustment' credit whose ledger note says what
  // it is. A second run needs nothing and grants nothing.
  const due = (needPremium ? premiumCost : 0) + (needPromo ? promoCost : 0);
  let granted = 0;
  if (due > 0) {
    const have = await balancePaise(shopId);
    if (have < due) {
      granted = due - have;
      const wallet = await getOrCreateWallet('shop', shopId);
      await creditWallet({
        wallet,
        amount_paise: granted,
        kind: 'adjustment',
        ref_note: GRANT_NOTE,
        created_by: null,
      });
    }
  }

  // ---- 1. PREMIUM (Branded Store) ---------------------------------------
  // Mirrors POST /api/shops/me/branding/activate: the guarded debit and the
  // branded_until extension commit together, priced from the live config.
  let premium = { bought: false, days: 0, cost_paise: 0 };
  if (needPremium) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await spendCredits(
        {
          shop: shopId,
          amount_paise: premiumCost,
          purpose: 'redeem_premium',
          ref_note: `branded store ${shopId}`,
          created_by: ownerUserId,
        },
        client
      );
      await client.query(
        `UPDATE shops
            SET branded_until = GREATEST(COALESCE(branded_until, NOW()), NOW()) + make_interval(days => $2),
                updated_at = NOW()
          WHERE id = $1`,
        [shopId, premiumDays]
      );
      await client.query('COMMIT');
      premium = { bought: true, days: premiumDays, cost_paise: premiumCost };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // The accent + tagline are what premium actually shows. Set them only when
  // blank, so a later hand edit on the demo shop survives a re-run.
  await pool.query(
    `UPDATE shops
        SET brand_accent = COALESCE(brand_accent, $2),
            brand_tagline = COALESCE(brand_tagline, $3),
            updated_at = NOW()
      WHERE id = $1`,
    [shopId, BRAND_ACCENT, BRAND_TAGLINE]
  );

  // ---- 2. STOREFRONT PHOTOS ---------------------------------------------
  const existing = await pool.query(
    'SELECT id, review_note FROM shop_images WHERE shop_id = $1',
    [shopId]
  );
  const mine = existing.rows.filter((r) => r.review_note === PHOTO_NOTE);
  const theirs = existing.rowCount - mine.length; // photos the seeder must not touch
  // Never exceed the ONE cap, and never push out a photo somebody else added.
  const room = Math.max(0, MAX_SHOP_IMAGES - theirs);
  const wanted = Math.min(BANNERS.length, room);
  let photos = { seeded: mine.length, rebuilt: false, other: theirs };

  if (mine.length !== wanted) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mine.length) {
        await client.query('DELETE FROM shop_images WHERE id = ANY($1::uuid[])', [mine.map((r) => r.id)]);
      }
      const base = await client.query(
        'SELECT COALESCE(MAX(position) + 1, 0)::int AS n FROM shop_images WHERE shop_id = $1',
        [shopId]
      );
      let pos = base.rows[0].n;
      for (const svgOf of BANNERS.slice(0, wanted)) {
        const img = await renderBanner(svgOf());
        // Written the way a real upload is written — 'pending_review', because
        // this shop is not on the slides_auto_publish trust list — and then
        // approved below by this seeder acting as the admin reviewer.
        const ins = await client.query(
          `INSERT INTO shop_images (shop_id, position, mime, data, updated_at, status, review_note)
           VALUES ($1,$2,$3,$4,NOW(),'pending_review',$5)
           RETURNING id`,
          [shopId, pos, img.mime, img.data, PHOTO_NOTE]
        );
        const imageId = ins.rows[0].id;
        await client.query(
          `UPDATE shop_images SET status = 'active', reviewed_at = NOW() WHERE id = $1`,
          [imageId]
        );
        await writeAudit(
          {
            adminUserId: null,
            action: 'shop_image.approve',
            targetType: 'shop',
            targetId: shopId,
            reason: PHOTO_NOTE,
            metadata: { image_id: imageId, to: 'active', seeded: true },
            client,
          }
        );
        pos += 1;
      }
      await client.query('COMMIT');
      photos = { seeded: wanted, rebuilt: true, other: theirs };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ---- 3. THE SHOP'S OWN SLIDE IN THE MARKETPLACE CAROUSEL ---------------
  // Mirrors POST /api/promos/mine (paid path): same row shape, same 'shop'
  // style, same glyph, same geo targets, the same branded priority bump, and the
  // debit in the SAME transaction as the insert. placement is left at its
  // default 'discovery', which is the band on the shops page.
  let promo = { created: false, id: livePromo.rowCount ? livePromo.rows[0].id : null, days: 0, cost_paise: 0 };
  if (needPromo) {
    // Re-read is_branded: premium may have been bought a moment ago, and the
    // priority bump is exactly the rule the real purchase applies.
    const branded = await pool.query(
      'SELECT (branded_until IS NOT NULL AND branded_until > NOW()) AS is_branded FROM shops WHERE id = $1',
      [shopId]
    );
    const priority = branded.rows[0].is_branded ? 10 : 0;
    // English only. The subtitle is the shop's OWN location out of its row, not
    // a phrase invented here, and no i18n overrides are written: this seeder
    // authors no translations.
    const where = [shop.area, shop.city].filter(Boolean).join(', ');
    const subtitle = where || null;
    const offerText = 'Full kirana catalogue online';
    const targets = shopTargets(shop);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO ad_campaigns
           (style, title, offer_text, subtitle, glyph, i18n, advertiser,
            link_type, link_shop_id, is_seasonal, starts_at, ends_at, priority,
            status, self_serve, credits_spent_paise, created_by)
         VALUES ('shop', $1, $2, $3, '🏪', '{}'::jsonb, $4,
                 'shop', $5, false, NOW(), NOW() + make_interval(days => $6), $7,
                 'pending_review', true, $8, $9)
         RETURNING id`,
        [shop.name, offerText, subtitle, shop.name, shopId, promoDays, priority, promoCost, ownerUserId]
      );
      const campaignId = ins.rows[0].id;
      for (const t of targets) {
        await client.query(
          'INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [campaignId, t.geo_type, t.geo_value]
        );
      }
      await spendCredits(
        {
          shop: shopId,
          amount_paise: promoCost,
          purpose: 'redeem_promo',
          ref_note: `promo ${campaignId}`,
          created_by: ownerUserId,
        },
        client
      );
      // The approval, on the same transition the admin endpoint uses, so the row
      // really passes through pending_review instead of being born live.
      await client.query(
        `UPDATE ad_campaigns
            SET status = 'active', review_note = $2, updated_at = NOW()
          WHERE id = $1 AND self_serve = true AND status = 'pending_review'`,
        [campaignId, PROMO_NOTE]
      );
      await writeAudit(
        {
          adminUserId: null,
          action: 'promo.approve',
          targetType: 'campaign',
          targetId: campaignId,
          reason: PROMO_NOTE,
          metadata: { shop_id: shopId, to: 'active', seeded: true },
          client,
        }
      );
      await client.query('COMMIT');
      promo = { created: true, id: campaignId, days: promoDays, cost_paise: promoCost };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  const summary = {
    shop_id: shopId,
    shop_name: shop.name,
    photos: photos.seeded,
    other_photos: photos.other,
    photos_rebuilt: photos.rebuilt,
    premium,
    promo,
    granted_paise: granted,
    balance_paise: await balancePaise(shopId),
  };
  report(summary);
  return summary;
}

function report(s) {
  /* eslint-disable no-console */
  console.log(`\n✓ Flagship demo storefront: ${s.shop_name}`);
  console.log(
    `  photos      ${s.photos} storefront banner(s) live` +
      `${s.other_photos ? ` (+${s.other_photos} not seeded by this script, left alone)` : ''}` +
      `${s.photos_rebuilt ? ' — regenerated this run' : ' — already present, unchanged'}`
  );
  console.log(
    `  premium     ${s.premium.bought
      ? `bought ${s.premium.days} day(s) for ${s.premium.cost_paise} paise`
      : 'already active — nothing bought'}`
  );
  console.log(
    `  promo       ${s.promo.created
      ? `bought ${s.promo.days} day(s) for ${s.promo.cost_paise} paise`
      : 'already placed — nothing bought'}`
  );
  console.log(
    `  credits     ${s.granted_paise ? `${s.granted_paise} paise granted for those purchases, ` : 'nothing granted, '}` +
      `balance now ${s.balance_paise} paise`
  );
  if (s.premium.bought || s.promo.created || s.photos_rebuilt) {
    console.log('  !! MODERATION: this seed APPROVED its own content. The storefront photos and');
    console.log('  !! the shop promo were written as \'pending_review\' and then approved by the');
    console.log('  !! seeder ITSELF, acting as the admin reviewer — moderation_actions rows with');
    console.log('  !! admin_user_id NULL record every one of them. A real owner\'s upload or promo');
    console.log('  !! still waits for a human. Nothing here changes that path.');
  }
  /* eslint-enable no-console */
}

module.exports = { seedFlagship, PHOTO_NOTE, PROMO_NOTE, GRANT_NOTE, BRAND_ACCENT, BRAND_TAGLINE };

// Only run (and own the pool lifecycle) when invoked directly as a script — when
// required from a test the pool must stay open for the rest of the suite.
if (require.main === module) {
  seedFlagship()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Flagship seed failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}
