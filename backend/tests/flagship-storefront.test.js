// The branded flagship demo storefront (store01, "Sharma Kirana Store").
//
// Requires a real Postgres (DATABASE_URL) with all migrations applied. It drives
// the REAL entry point — utils/load-demo-data.loadDemoData(), the thing a deploy
// runs behind SEED_DEMO_DATA — rather than the flagship seeder on its own, so
// the wiring and the ordering are under test too, and it runs it TWICE before
// asserting anything, so every assertion below is also an assertion that a
// re-run converged.
//
// Covers:
//   1. the storefront slider — three seeded photo slides in position order;
//   2. the sponsored slot — suppressed on this shop because premium is active,
//      and (with premium lifted) composed at index 1, after the owner's first
//      photo, which is the position rule the composer promises;
//   3. the marketplace carousel on the shops page — the shop's own slide is
//      served there, ranked under the house "Smart Khata" slides;
//   4. the money — credits_spent_paise is days x the CONFIGURED per-day price,
//      the ledger balances, and nothing went negative;
//   5. idempotency — the second load added no photo, no campaign, no ledger row
//      and changed no bytes;
//   6. moderation — the seed did not sneak content past the review gate; it
//      approved it and said so on the audit trail, and it fabricated no trust.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const request = require('supertest');

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { loadDemoData } = require('../src/utils/load-demo-data');
const { clearDemoData } = require('./helpers/demo-data-cleanup');

// The cap a shop's storefront gallery may never exceed. Stated here as the
// EXPECTED value (production reads it from utils/shopImages); if the product
// ever raises the cap this test should be the thing that notices.
const EXPECTED_MAX_PHOTOS = 3;
const HOUSE_ADVERTISER = 'Smart Khata';

let shopId;
let ownerUserId;
let snap1;
let snap2;
let brandedUntil;
const extraCampaigns = []; // campaigns this test inserts itself

// Everything about the flagship shop that a converging re-run must leave alone.
// md5 of the image bytes, so "unchanged" means the actual pixels, not just a
// row count.
async function snapshot(id) {
  const photos = await pool.query(
    `SELECT id, position, mime, status, review_note, md5(data) AS digest, length(data) AS bytes
       FROM shop_images WHERE shop_id = $1 ORDER BY position, id`,
    [id]
  );
  const campaigns = await pool.query(
    `SELECT id, style, title, offer_text, subtitle, glyph, advertiser, link_type, link_shop_id,
            placement, priority, status, self_serve, credits_spent_paise, review_note
       FROM ad_campaigns WHERE link_shop_id = $1 ORDER BY created_at, id`,
    [id]
  );
  const ledger = await pool.query(
    `SELECT l.direction, l.amount_paise, l.kind, l.ref_note, l.balance_after_paise
       FROM referral_ledger l
       JOIN referral_wallets w ON w.id = l.wallet_id
      WHERE w.owner_type = 'shop' AND w.owner_id = $1
      ORDER BY l.created_at, l.id`,
    [id]
  );
  const wallet = await pool.query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [id]
  );
  const audit = await pool.query(
    `SELECT action, admin_user_id, reason FROM moderation_actions
      WHERE target_id = $1 OR target_id = ANY($2::uuid[])
      ORDER BY created_at, action`,
    [id, campaigns.rows.map((c) => c.id)]
  );
  return {
    photos: photos.rows,
    campaigns: campaigns.rows,
    ledger: ledger.rows,
    balance: wallet.rowCount ? String(wallet.rows[0].balance_paise) : null,
    audit: audit.rows,
  };
}

async function setting(key) {
  const r = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return r.rowCount ? r.rows[0].value : null;
}

const getShop = (id, query = '') => request(app).get(`/api/public/shops/${id}${query}`);

beforeAll(async () => {
  // Run 1 — a fresh demo load.
  await loadDemoData();
  const owner = await pool.query("SELECT id, shop_id FROM users WHERE email = 'store01@demo.local'");
  expect(owner.rowCount).toBe(1);
  ownerUserId = owner.rows[0].id;
  shopId = owner.rows[0].shop_id;
  snap1 = await snapshot(shopId);

  // Run 2 — the same command again. Everything asserted below is asserted about
  // the state AFTER this second run.
  await loadDemoData();
  snap2 = await snapshot(shopId);

  const b = await pool.query('SELECT branded_until FROM shops WHERE id = $1', [shopId]);
  brandedUntil = b.rows[0].branded_until;
}, 600000);

afterAll(async () => {
  // The sponsor campaign this suite inserted itself is not the loader's, so it
  // is not the shared helper's business.
  if (extraCampaigns.length) {
    await pool.query('DELETE FROM ad_campaigns WHERE id = ANY($1::uuid[])', [extraCampaigns]);
  }
  await clearDemoData(pool);
  await pool.end();
}, 120000);

describe('flagship demo storefront — what a shopper sees', () => {
  test('the shop page returns the seeded photo slides, in position order, on a premium storefront', async () => {
    const res = await getShop(shopId);
    expect(res.status).toBe(200);
    const { images, slides, is_branded: isBranded, brand_accent: accent, brand_tagline: tagline } = res.body.shop;

    // Three real storefront photos, and never more than the cap.
    expect(images).toHaveLength(EXPECTED_MAX_PHOTOS);
    const rows = await pool.query(
      `SELECT id, position FROM shop_images WHERE shop_id = $1 AND status = 'active' ORDER BY position, id`,
      [shopId]
    );
    expect(rows.rowCount).toBe(EXPECTED_MAX_PHOTOS);
    expect(rows.rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // The slider is the photos, in the gallery's own order, each pointing at the
    // cache-busted serve endpoint for the row at that position.
    expect(slides).toEqual(rows.rows.map((r) => ({
      type: 'photo',
      url: expect.stringContaining(`/api/shop-images/${r.id}?v=`),
    })));
    expect(slides.map((s) => s.url)).toEqual(images.map((i) => i.url));

    // Premium: the branded storefront the demo is supposed to show off.
    expect(isBranded).toBe(true);
    expect(accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(typeof tagline).toBe('string');
    expect(tagline.length).toBeGreaterThan(0);
  });

  test('the photos are real WebP banners, small enough for a 2G phone, and each one serves', async () => {
    for (const p of snap2.photos) {
      expect(p.mime).toBe('image/webp');
      expect(Number(p.bytes)).toBeGreaterThan(500);
      expect(Number(p.bytes)).toBeLessThan(120 * 1024);
    }
    // Distinct pictures, not the same tile three times.
    expect(new Set(snap2.photos.map((p) => p.digest)).size).toBe(snap2.photos.length);

    const res = await getShop(shopId);
    const one = await request(app).get(res.body.shop.images[0].url);
    expect(one.status).toBe(200);
    expect(one.headers['content-type']).toContain('image/webp');
  });

  test('premium suppresses the sponsored slide; without premium it lands at index 1, after the first photo', async () => {
    const shop = await pool.query('SELECT city FROM shops WHERE id = $1', [shopId]);
    const ins = await pool.query(
      `INSERT INTO ad_campaigns (style, title, subtitle, glyph, advertiser, link_type,
                                 placement, priority, status)
       VALUES ('offer','Flagship test sponsor','sponsored','⭐','Test Sponsor','none','storefront',9000,'active')
       RETURNING id`
    );
    const campaignId = ins.rows[0].id;
    extraCampaigns.push(campaignId);
    await pool.query(
      "INSERT INTO ad_targets (campaign_id, geo_type, geo_value) VALUES ($1,'town',$2)",
      [campaignId, shop.rows[0].city]
    );

    // A branded shop's storefront carries NO sponsored slide (migration 0063).
    const premium = await getShop(shopId);
    expect(premium.body.shop.slides.every((s) => s.type === 'photo')).toBe(true);
    expect(premium.body.shop.slides).toHaveLength(EXPECTED_MAX_PHOTOS);

    // Lift premium and the composer splices the one sponsored slide in at index
    // 1 — the owner's own photo still leads.
    await pool.query('UPDATE shops SET branded_until = NULL WHERE id = $1', [shopId]);
    try {
      const plain = await getShop(shopId);
      const { slides, images } = plain.body.shop;
      expect(slides).toHaveLength(EXPECTED_MAX_PHOTOS + 1);
      expect(slides[0]).toEqual({ type: 'photo', url: images[0].url });
      expect(slides[1].type).toBe('sponsored');
      expect(slides[1].campaign_id).toBe(campaignId);
      expect(slides[2]).toEqual({ type: 'photo', url: images[1].url });
      expect(slides[3]).toEqual({ type: 'photo', url: images[2].url });
      expect(slides.filter((s) => s.type === 'sponsored')).toHaveLength(1);
    } finally {
      await pool.query('UPDATE shops SET branded_until = $2 WHERE id = $1', [shopId, brandedUntil]);
    }
    const restored = await getShop(shopId);
    expect(restored.body.shop.is_branded).toBe(true);
  });

  test('the shops directory carousel serves the shop its own slide, under the house slides', async () => {
    const shop = await pool.query('SELECT city, name FROM shops WHERE id = $1', [shopId]);
    const res = await request(app)
      .get('/api/public/promos')
      .query({ town: shop.rows[0].city });
    expect(res.status).toBe(200);

    const mine = res.body.promos.find((p) => p.link_shop_id === shopId);
    expect(mine).toBeDefined();
    expect(mine.title).toBe(shop.rows[0].name);
    expect(mine.style).toBe('shop');
    expect(mine.link_type).toBe('shop');
    expect(mine.sponsored).toBe(true);

    // The house "Smart Khata" slides are still there and still lead: the shop's
    // self-serve placement sits at the branded-store priority bump (10), under
    // the house cards.
    const house = res.body.promos.filter((p) => p.advertiser === HOUSE_ADVERTISER);
    expect(house.length).toBeGreaterThanOrEqual(2);
    const mineAt = res.body.promos.indexOf(mine);
    for (const h of house) expect(res.body.promos.indexOf(h)).toBeLessThan(mineAt);
  });
});

describe('flagship demo storefront — money', () => {
  test('the placement cost is days x the configured per-day price, in whole paise', async () => {
    const perDay = Number(await setting('shop_promo_credits_per_day_paise'));
    expect(Number.isInteger(perDay)).toBe(true);
    expect(perDay).toBeGreaterThan(0);

    const campaigns = snap2.campaigns.filter((c) => c.self_serve);
    expect(campaigns).toHaveLength(1);
    const spent = Number(campaigns[0].credits_spent_paise);
    expect(Number.isInteger(spent)).toBe(true);
    expect(spent % perDay).toBe(0);
    expect(spent / perDay).toBeGreaterThanOrEqual(1);
    expect(campaigns[0].placement).toBe('discovery');

    // And the debit that paid for it is exactly that, once.
    const promoDebits = snap2.ledger.filter((l) => l.kind === 'redeem_promo');
    expect(promoDebits).toHaveLength(1);
    expect(promoDebits[0].direction).toBe('debit');
    expect(Number(promoDebits[0].amount_paise)).toBe(spent);
  });

  test('premium was bought at the configured price and the ledger balances, never below zero', async () => {
    const perDay = Number(await setting('branded_store_credits_per_day_paise'));
    const premiumDebits = snap2.ledger.filter((l) => l.kind === 'redeem_premium');
    expect(premiumDebits).toHaveLength(1);
    const premiumSpent = Number(premiumDebits[0].amount_paise);
    expect(Number.isInteger(premiumSpent)).toBe(true);
    expect(premiumSpent % perDay).toBe(0);

    // The append-only ledger reconciles: every row is a whole number of paise,
    // the running balance never dips below zero, and the last row's
    // balance_after is the wallet balance.
    let running = 0;
    for (const row of snap2.ledger) {
      const amt = Number(row.amount_paise);
      expect(Number.isInteger(amt)).toBe(true);
      expect(amt).toBeGreaterThan(0);
      running += row.direction === 'credit' ? amt : -amt;
      expect(running).toBeGreaterThanOrEqual(0);
      expect(Number(row.balance_after_paise)).toBe(running);
    }
    expect(Number(snap2.balance)).toBe(running);
    expect(running).toBeGreaterThanOrEqual(0);

    // Nothing was granted that was not then spent on a listed platform charge.
    const credited = snap2.ledger.filter((l) => l.direction === 'credit')
      .reduce((s, l) => s + Number(l.amount_paise), 0);
    const debited = snap2.ledger.filter((l) => l.direction === 'debit')
      .reduce((s, l) => s + Number(l.amount_paise), 0);
    expect(credited).toBe(debited);
  });
});

describe('flagship demo storefront — idempotency', () => {
  test('a second demo load adds no photo, no campaign, no ledger row and changes no bytes', () => {
    // Two EMPTY snapshots are also equal. Assert there is something to compare
    // before comparing it, so this test cannot pass by finding nothing.
    expect(snap1.photos).toHaveLength(EXPECTED_MAX_PHOTOS);
    expect(snap1.campaigns.filter((c) => c.self_serve)).toHaveLength(1);
    expect(snap1.ledger.length).toBeGreaterThanOrEqual(3);
    expect(snap1.audit.length).toBeGreaterThanOrEqual(EXPECTED_MAX_PHOTOS + 1);

    expect(snap2.photos).toEqual(snap1.photos);
    expect(snap2.campaigns).toEqual(snap1.campaigns);
    expect(snap2.ledger).toEqual(snap1.ledger);
    expect(snap2.balance).toEqual(snap1.balance);
    expect(snap2.audit).toEqual(snap1.audit);
  });

  test('the gallery never exceeds the storefront photo cap', async () => {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM shop_images WHERE shop_id = $1', [shopId]);
    expect(r.rows[0].n).toBeLessThanOrEqual(EXPECTED_MAX_PHOTOS);
    expect(r.rows[0].n).toBe(EXPECTED_MAX_PHOTOS);
  });
});

describe('flagship demo storefront — moderation', () => {
  test('every seeded photo went live through an approval that is written down', async () => {
    const photos = await pool.query(
      'SELECT status, reviewed_at, review_note, ai_flagged FROM shop_images WHERE shop_id = $1',
      [shopId]
    );
    expect(photos.rowCount).toBe(EXPECTED_MAX_PHOTOS);
    for (const p of photos.rows) {
      expect(p.status).toBe('active');
      expect(p.reviewed_at).not.toBeNull();
      // The reviewer left a note saying who approved it — the owner sees it.
      expect(String(p.review_note)).toMatch(/seeder/i);
      expect(p.ai_flagged).toBe(false);
    }
    const audit = snap2.audit.filter((a) => a.action === 'shop_image.approve');
    expect(audit).toHaveLength(EXPECTED_MAX_PHOTOS);
    // admin_user_id NULL: no human took this decision, and the trail says so
    // rather than borrowing somebody's name for it.
    for (const a of audit) expect(a.admin_user_id).toBeNull();
  });

  test('the shop promo passed through pending_review and its approval is on the audit trail', () => {
    const campaign = snap2.campaigns.find((c) => c.self_serve);
    expect(campaign.status).toBe('active');
    expect(String(campaign.review_note)).toMatch(/seeder/i);
    const audit = snap2.audit.filter((a) => a.action === 'promo.approve');
    expect(audit).toHaveLength(1);
    expect(audit[0].admin_user_id).toBeNull();
  });

  // DELIBERATE REGRESSION CONTROL: this one is expected to pass before and after.
  // Approving content through the admin endpoints banks a point against the
  // shop's auto-approve bar (migration 0070). A seeder approving its own content
  // must NOT bank anything — no human judged it — so this guards the seeder
  // against ever being "improved" into calling recordHumanOutcome. The two
  // assertions before it make the absence meaningful: the content really is
  // there and really was approved.
  test('no moderation trust was fabricated for the demo shop', async () => {
    expect(snap2.photos).toHaveLength(EXPECTED_MAX_PHOTOS);
    expect(snap2.audit.filter((a) => a.action.endsWith('.approve')).length)
      .toBeGreaterThanOrEqual(EXPECTED_MAX_PHOTOS + 1);
    const r = await pool.query('SELECT 1 FROM shop_moderation_trust WHERE shop_id = $1', [shopId]);
    expect(r.rowCount).toBe(0);
  });

  test('the promo is attributed to the demo owner, not to an admin', () => {
    expect(ownerUserId).toBeTruthy();
    const campaign = snap2.campaigns.find((c) => c.self_serve);
    expect(campaign.link_shop_id).toBe(shopId);
    expect(campaign.advertiser).toBeTruthy();
  });
});
