// Integration tests for the seasonal + geo referral campaign engine (Batch
// CAMP1, budget-capped reward overrides). Requires a real Postgres (DATABASE_URL)
// with migrations applied (incl. 0055_referral_campaigns).
//
// A campaign OVERRIDES the default referral reward for a window + place +
// audience, funded by a PRE-FUNDED budget cap so it can NEVER overspend its
// budget (zero-burn against budget). These tests exercise:
//   - a multiplier campaign matching the referred shop's geo + audience doubles
//     the flat bounty and increments spent by the override amount;
//   - the atomic budget cap stops the override once the next full override would
//     exceed it (falls back to base; spent never exceeds budget);
//   - a non-matching geo / audience / window leaves the base reward untouched;
//   - a flat_override campaign replaces the role-specific amount;
//   - the enrolment chain never exceeds poolCap even under a live multiplier
//     campaign (the fee-funded zero-burn cap is never weakened — chain is the
//     flat-path-only deferral, so the chain reward equals the base pool split).
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const { pool } = require('../src/config/db');
const referral = require('../src/utils/referral');

const uniq = Date.now().toString().slice(-9);

const emails = [];
const phones = [];
const campaignIds = [];

let seq = 0;
function nextPhone() {
  return `+9172${uniq}${String(seq++).padStart(2, '0')}`.slice(0, 15);
}

// A fresh owner + shop at a given geo (town=city / village / pincode).
async function makeShop(tag, { city = null, village = null, pincode = null } = {}) {
  const email = `camp_${tag}_${uniq}@test.local`;
  emails.push(email);
  const phone = nextPhone();
  phones.push(phone);
  const owner = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1,$2,$3,'x','owner') RETURNING id`,
    [`Camp ${tag}`, email, phone]
  );
  const ownerId = owner.rows[0].id;
  const shop = await pool.query(
    `INSERT INTO shops (owner_id, name, city, village, pincode) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [ownerId, `Camp Store ${tag}`, city, village, pincode]
  );
  return { ownerId, shopId: shop.rows[0].id };
}

// Attribute newShop to referrerCode (a captured, not-yet-activated referral).
async function attribute(referrerCodeId, code, newShopId, newOwnerId) {
  await pool.query(
    `INSERT INTO referrals (referral_code_id, code, referred_type, referred_user_id, referred_shop_id)
     VALUES ($1,$2,'shop',$3,$4)`,
    [referrerCodeId, code, newOwnerId, newShopId]
  );
}

// Create a campaign + its geo targets. Returns the campaign id.
async function makeCampaign({
  name, status = 'active', audience = 'shop', reward_type = 'multiplier',
  reward_value = { x: 2 }, budget_cap_paise, starts_at = null, ends_at = null,
  priority = 0, targets = [],
}) {
  const c = await pool.query(
    `INSERT INTO referral_campaigns
       (name, status, audience, reward_type, reward_value, budget_cap_paise, starts_at, ends_at, priority)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING id`,
    [name, status, audience, reward_type, JSON.stringify(reward_value), budget_cap_paise, starts_at, ends_at, priority]
  );
  const id = c.rows[0].id;
  campaignIds.push(id);
  for (const t of targets) {
    await pool.query(
      'INSERT INTO referral_campaign_targets (campaign_id, geo_type, geo_value) VALUES ($1,$2,$3)',
      [id, t.geo_type, t.geo_value ?? null]
    );
  }
  return id;
}

// Enable a live, symmetric reward rule (referrer/referee/mitra) for the flat path.
async function setRewardRule({ referrer, referee, mitra }) {
  const rows = [
    ['referral_reward_enabled', 'true'],
    ['referral_reward_paise', String(referrer)],
    ['referral_referee_paise', String(referee)],
    ['referral_mitra_paise', String(mitra)],
  ];
  for (const [k, v] of rows) {
    await pool.query(
      `INSERT INTO platform_settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [k, v]
    );
  }
  // Settle inline so a reward row shows its final amount immediately.
  await pool.query(
    `INSERT INTO platform_settings (key, value) VALUES ('referral_autosettle','true')
     ON CONFLICT (key) DO UPDATE SET value = 'true'`
  );
}

async function rewardsFor(shopId, role) {
  const r = await pool.query(
    `SELECT rr.amount_paise, rr.campaign_id
       FROM referral_rewards rr
       JOIN referrals rf ON rf.id = rr.referral_id
      WHERE rf.referred_shop_id = $1 AND rr.beneficiary_role = $2`,
    [shopId, role]
  );
  return r.rows;
}

async function campaignSpent(id) {
  const r = await pool.query('SELECT spent_paise FROM referral_campaigns WHERE id = $1', [id]);
  return Number(r.rows[0].spent_paise);
}

beforeAll(async () => {
  await setRewardRule({ referrer: 5000, referee: 3000, mitra: 7000 });
});

afterAll(async () => {
  await pool.query("DELETE FROM platform_settings WHERE key IN ('referral_reward_enabled','referral_reward_paise','referral_referee_paise','referral_mitra_paise','referral_autosettle')");
  await pool.query('DELETE FROM referral_campaign_targets WHERE campaign_id = ANY($1)', [campaignIds]);
  await pool.query('DELETE FROM referral_campaigns WHERE id = ANY($1)', [campaignIds]);
  await pool.query('DELETE FROM referrals WHERE referred_user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM referral_codes WHERE owner_user_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))', [emails]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

describe('resolveCampaign + applyCampaign (matching + atomic budget guard)', () => {
  it('a matching multiplier campaign doubles the flat bounty and charges spent', async () => {
    const referrer = await makeShop('mA_ref');
    const refCode = await referral.getOrCreateCodeForUser(referrer.ownerId, 'owner');
    const referee = await makeShop('mA_new', { pincode: `56${uniq}`.slice(0, 6) });
    await attribute(refCode.id, refCode.code, referee.shopId, referee.ownerId);

    const campId = await makeCampaign({
      name: 'Diwali 2x pincode',
      reward_value: { x: 2 },
      budget_cap_paise: 1000000,
      targets: [{ geo_type: 'pincode', geo_value: `56${uniq}`.slice(0, 6) }],
    });

    const res = await referral.maybeActivateReferral(referee.shopId);
    expect(res.activated).toBe(true);
    expect(res.rewarded).toBe(true);

    // Referee base 3000 -> 6000; referrer base 5000 -> 10000; both funded by the campaign.
    const refereeRows = await rewardsFor(referee.shopId, 'referee');
    expect(refereeRows.length).toBe(1);
    expect(Number(refereeRows[0].amount_paise)).toBe(6000);
    expect(refereeRows[0].campaign_id).toBe(campId);

    const referrerRows = await rewardsFor(referee.shopId, 'referrer');
    expect(referrerRows.length).toBe(1);
    expect(Number(referrerRows[0].amount_paise)).toBe(10000);
    expect(referrerRows[0].campaign_id).toBe(campId);

    // spent incremented by both overrides: 6000 + 10000 = 16000.
    expect(await campaignSpent(campId)).toBe(16000);
  });

  it('budget cap stops the override once the next full override would exceed it; spent never exceeds budget', async () => {
    // Budget exactly covers ONE referee override (6000). The second activation
    // finds no remaining budget and falls back to the base reward.
    const town = `Captown_${uniq}`;
    const campId = await makeCampaign({
      name: 'Tight budget town',
      audience: 'shop',
      reward_value: { x: 2 },
      budget_cap_paise: 6000,
      targets: [{ geo_type: 'town', geo_value: town }],
    });

    // Referral #1 — override applies (referee 3000 -> 6000), spent -> 6000.
    const r1ref = await makeShop('bc_ref1');
    const r1code = await referral.getOrCreateCodeForUser(r1ref.ownerId, 'owner');
    const r1new = await makeShop('bc_new1', { city: town });
    await attribute(r1code.id, r1code.code, r1new.shopId, r1new.ownerId);
    // Disable the referrer side for this suite portion by using a mitra-less peer;
    // both referee (3000->6000) and referrer (5000->?) compete for the 6000 budget.
    // Referee is resolved first and takes 6000, exhausting the budget; the
    // referrer then falls back to its base 5000.
    const a1 = await referral.maybeActivateReferral(r1new.shopId);
    expect(a1.activated).toBe(true);

    const referee1 = await rewardsFor(r1new.shopId, 'referee');
    expect(Number(referee1[0].amount_paise)).toBe(6000);
    expect(referee1[0].campaign_id).toBe(campId);

    // Referrer override would need +10000 but only 0 remains -> base 5000, no campaign.
    const referrer1 = await rewardsFor(r1new.shopId, 'referrer');
    expect(Number(referrer1[0].amount_paise)).toBe(5000);
    expect(referrer1[0].campaign_id).toBeNull();

    // Referral #2 — budget already exhausted, both sides fall back to base.
    const r2ref = await makeShop('bc_ref2');
    const r2code = await referral.getOrCreateCodeForUser(r2ref.ownerId, 'owner');
    const r2new = await makeShop('bc_new2', { city: town });
    await attribute(r2code.id, r2code.code, r2new.shopId, r2new.ownerId);
    await referral.maybeActivateReferral(r2new.shopId);

    const referee2 = await rewardsFor(r2new.shopId, 'referee');
    expect(Number(referee2[0].amount_paise)).toBe(3000);
    expect(referee2[0].campaign_id).toBeNull();

    // spent is exactly the budget and never a paise more.
    const spent = await campaignSpent(campId);
    expect(spent).toBe(6000);
    expect(spent).toBeLessThanOrEqual(6000);
  });

  it('a non-matching geo leaves the base reward untouched', async () => {
    const campId = await makeCampaign({
      name: 'Bengaluru only',
      reward_value: { x: 2 },
      budget_cap_paise: 1000000,
      targets: [{ geo_type: 'town', geo_value: `Bengaluru_${uniq}` }],
    });
    const ref = await makeShop('ng_ref');
    const code = await referral.getOrCreateCodeForUser(ref.ownerId, 'owner');
    const nw = await makeShop('ng_new', { city: `Mysuru_${uniq}` }); // different town
    await attribute(code.id, code.code, nw.shopId, nw.ownerId);

    await referral.maybeActivateReferral(nw.shopId);
    const referee = await rewardsFor(nw.shopId, 'referee');
    expect(Number(referee[0].amount_paise)).toBe(3000); // base, untouched
    expect(referee[0].campaign_id).toBeNull();
    expect(await campaignSpent(campId)).toBe(0); // nothing charged
  });

  it('a campaign whose window has not started does not match', async () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const later = new Date(Date.now() + 14 * 86400000).toISOString();
    const campId = await makeCampaign({
      name: 'Future window',
      reward_value: { x: 2 },
      budget_cap_paise: 1000000,
      starts_at: future,
      ends_at: later,
      targets: [{ geo_type: 'all' }],
    });
    const ref = await makeShop('fw_ref');
    const code = await referral.getOrCreateCodeForUser(ref.ownerId, 'owner');
    const nw = await makeShop('fw_new', { city: `Anytown_${uniq}` });
    await attribute(code.id, code.code, nw.shopId, nw.ownerId);

    await referral.maybeActivateReferral(nw.shopId);
    const referee = await rewardsFor(nw.shopId, 'referee');
    expect(Number(referee[0].amount_paise)).toBe(3000);
    expect(referee[0].campaign_id).toBeNull();
    expect(await campaignSpent(campId)).toBe(0);
  });

  it("a 'mitra' audience campaign does not fire for a 'shop' peer referrer", async () => {
    const campId = await makeCampaign({
      name: 'Mitra only',
      audience: 'mitra',
      reward_value: { x: 2 },
      budget_cap_paise: 1000000,
      targets: [{ geo_type: 'all' }],
    });
    const ref = await makeShop('au_ref');
    const code = await referral.getOrCreateCodeForUser(ref.ownerId, 'owner'); // peer (shop) code
    const nw = await makeShop('au_new', { city: `Zville_${uniq}` });
    await attribute(code.id, code.code, nw.shopId, nw.ownerId);

    await referral.maybeActivateReferral(nw.shopId);
    const referrer = await rewardsFor(nw.shopId, 'referrer');
    expect(Number(referrer[0].amount_paise)).toBe(5000); // base, mitra campaign ignored
    expect(referrer[0].campaign_id).toBeNull();
    expect(await campaignSpent(campId)).toBe(0);
  });

  it('a flat_override campaign replaces the role-specific amount', async () => {
    const campId = await makeCampaign({
      name: 'Flat override village',
      audience: 'shop',
      reward_type: 'flat_override',
      reward_value: { referee_paise: 9000, referrer_paise: 11000 },
      budget_cap_paise: 1000000,
      targets: [{ geo_type: 'village', geo_value: `Vlg_${uniq}` }],
    });
    const ref = await makeShop('fo_ref');
    const code = await referral.getOrCreateCodeForUser(ref.ownerId, 'owner');
    const nw = await makeShop('fo_new', { village: `Vlg_${uniq}` });
    await attribute(code.id, code.code, nw.shopId, nw.ownerId);

    await referral.maybeActivateReferral(nw.shopId);
    const referee = await rewardsFor(nw.shopId, 'referee');
    expect(Number(referee[0].amount_paise)).toBe(9000);
    expect(referee[0].campaign_id).toBe(campId);
    const referrer = await rewardsFor(nw.shopId, 'referrer');
    expect(Number(referrer[0].amount_paise)).toBe(11000);
    expect(referrer[0].campaign_id).toBe(campId);
    expect(await campaignSpent(campId)).toBe(20000);
  });

  it('applyCampaign clamps a wild multiplier to x<=10 and charges all-or-nothing', async () => {
    // base 3000, x=50 -> clamped to 10 -> override 30000. Budget is exactly 30000,
    // so the FULL override fits and is charged (proving the clamp: an unclamped x=50
    // would be 150000 > budget -> base fallback; getting 30000 proves clamp to 10).
    const campId = await makeCampaign({
      name: 'Wild multiplier',
      reward_value: { x: 50 },
      budget_cap_paise: 30000,
      targets: [{ geo_type: 'all' }],
    });
    const camp = await pool.query('SELECT id, reward_type, reward_value, budget_cap_paise, spent_paise FROM referral_campaigns WHERE id = $1', [campId]);
    const applied = await referral.applyCampaign(camp.rows[0], 3000, 'referee');
    expect(applied.amount).toBe(30000); // full clamped override, all-or-nothing
    expect(applied.campaignId).toBe(campId);
    expect(await campaignSpent(campId)).toBe(30000);

    // A second apply: remaining budget (0) cannot fund the full override -> base,
    // NO partial (never pays below base), no charge. spent stays under the cap.
    const camp2 = await pool.query('SELECT id, reward_type, reward_value, budget_cap_paise, spent_paise FROM referral_campaigns WHERE id = $1', [campId]);
    const applied2 = await referral.applyCampaign(camp2.rows[0], 3000, 'referee');
    expect(applied2.amount).toBe(3000); // base — never a boundary partial
    expect(applied2.campaignId).toBeNull();
    expect(await campaignSpent(campId)).toBe(30000); // unchanged, never exceeds budget
  });
});

describe('enrolment chain never exceeds poolCap (campaigns are flat-path-only here)', () => {
  it('a live multiplier campaign does NOT inflate the fee-funded chain above poolCap', async () => {
    // Enrolment fee 100000 paise, split L1=10% L2=5% -> poolCap = 15000.
    const referrer = await makeShop('chain_l1');
    const l1code = await referral.getOrCreateCodeForUser(referrer.ownerId, 'owner');
    const enrolee = await makeShop('chain_new', { city: `Chaintown_${uniq}` });
    await attribute(l1code.id, l1code.code, enrolee.shopId, enrolee.ownerId);

    // A matching, well-funded 'shop' multiplier campaign is ACTIVE — it must NOT
    // touch the chain path (deferred), so the chain reward stays at the base
    // pool split and poolCap is never exceeded.
    const campId = await makeCampaign({
      name: 'Chain would-be boost',
      audience: 'shop',
      reward_value: { x: 5 },
      budget_cap_paise: 100000000,
      targets: [{ geo_type: 'town', geo_value: `Chaintown_${uniq}` }],
    });

    const enrol = await pool.query(
      `INSERT INTO enrolments (shop_id, tier, amount_paise, status, split_l1_pct, split_l2_pct)
       VALUES ($1,'basic',100000,'paid',10,5) RETURNING id`,
      [enrolee.shopId]
    );
    const enrolId = enrol.rows[0].id;

    const res = await referral.accrueEnrolmentChainRewards(enrolee.shopId, enrolId);
    expect(res.accrued).toBe(true);
    expect(res.poolCap).toBe(15000);
    // L1 = 10% of 100000 = 10000 (base, NOT multiplied by the campaign).
    expect(res.l1_amount).toBe(10000);
    expect(res.l1_amount + (res.l2_amount || 0)).toBeLessThanOrEqual(res.poolCap);

    // Campaign spend untouched by the chain path.
    expect(await campaignSpent(campId)).toBe(0);

    // Clean up the enrolment rows created here.
    await pool.query('DELETE FROM referral_rewards WHERE source_enrolment_id = $1', [enrolId]);
    await pool.query('DELETE FROM enrolments WHERE id = $1', [enrolId]);
  });
});
