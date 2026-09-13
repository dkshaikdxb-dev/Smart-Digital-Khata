const { query } = require('../config/db');

// SHOP TRUST for AI-assisted moderation, PHASE 2 (batch MOD2, migration 0070).
//
// The ONE definition of "how much has this shop earned the benefit of the
// doubt?", and of what that is allowed to change. Everything here is either
// PURE (scoreFor / effectiveThresholds / shouldSpotCheck — unit-testable with
// no database, the same shape as utils/shopOpen.js and utils/orderEdit.js) or a
// tiny never-throwing DB helper (getTrustConfig / getTrust / recordOutcome /
// enqueueSpotCheck), so the rule can never drift between the job, the admin
// queues and the stats.
//
// ===========================================================================
// THE TRUST SCORE, IN WORDS (an admin must be able to explain this to a shop)
// ===========================================================================
// A shop's score is a number from 0 to 1. It answers one question: "of the
// content this shop has submitted, what share was judged acceptable?" — with
// two deliberate corrections.
//
//   1. EVERY SHOP STARTS AT HALF MARKS. The share is counted as if the shop
//      already had one approval and one rejection on the books (a Laplace
//      smoothing of 1). So:
//        - a brand-new shop with no history scores exactly 0.50 — neutral,
//          neither trusted nor distrusted;
//        - one lucky first approval does NOT make a shop trusted (1 approval
//          scores 2/3 = 0.67, not 1.00);
//        - trust has to be EARNED over many items: 20 clean approvals score
//          21/22 = 0.95.
//      base = (approved + 1) / (approved + rejected + 2)
//
//   2. A RECENT REJECTION HURTS MORE THAN AN OLD ONE. On top of the share, a
//      freshness penalty is subtracted. It is 0.30 on the day of the shop's
//      most recent rejection and fades in a straight line to 0 over 90 days.
//      A shop that was rejected yesterday is therefore held to a higher bar
//      than the identical shop rejected four months ago, which is exactly how
//      a human desk already thinks.
//      penalty = 0.30 * (1 - days_since_last_rejection / 90), never below 0
//
//   score = base - penalty, clamped to 0..1
//
// Worked examples (the truth table the tests assert):
//   no history .................... 0.50  neutral
//   20 approved, 0 rejected ....... 0.95  trusted
//   20 approved, 1 rejected 1y ago  0.91  still trusted, but visibly dipped
//   20 approved, 1 rejected today . 0.61  NOT trusted — the recent rejection bites
//   0 approved, 1 rejected today .. 0.03  distrusted
//
// ===========================================================================
// WHAT THE SCORE IS ALLOWED TO CHANGE
// ===========================================================================
// Only the two Phase-1 bars, and only within hard limits:
//   TRUSTED   (score >= 0.85 AND at least `min_items` decided items)
//             auto-approve bar DROPS by `trust_bonus` (default 0.05)
//   DISTRUSTED(score < 0.50 — i.e. worse than a brand-new shop)
//             auto-approve bar RISES by `distrust_penalty` (default 0.10), and
//             the HOLD bar drops by the same amount so borderline "hold"
//             verdicts still reach the top of the admin queue.
//   NEUTRAL   everything else — the plain policy bars.
//
// The AI STILL NEVER REJECTS. Trust cannot invent a rejection, cannot skip the
// human queue for a "hold", and cannot publish a low-confidence verdict:
// HARD_AUTO_APPROVE_FLOOR below is an absolute 0.75 under the effective
// auto-approve threshold, applied AFTER every bonus and whatever the settings
// say. A verdict the model is not at least 75% sure of is never published by
// this system, for any shop, ever.

// ---- Constants (the rule, in one place) -----------------------------------

// Absolute floor under the EFFECTIVE auto-approve threshold. No amount of
// trust, and no setting value (even a hand-edited platform_settings row), can
// push the bar below this. 0.75 is the point below which the model is
// materially unsure; publishing there without a human is not a saving, it is a
// liability.
const HARD_AUTO_APPROVE_FLOOR = 0.75;
// The band the policy thresholds themselves live in (mirrors the Phase-1
// service constants, repeated here so this file is self-contained and pure).
const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 1.0;

// Score at or above which a shop is TRUSTED (with enough history).
const TRUSTED_SCORE = 0.85;
// Score below which a shop is DISTRUSTED. 0.50 is exactly the neutral score of
// a shop with no history, so "distrusted" literally means "has done worse than
// a brand-new shop".
const DISTRUSTED_SCORE = 0.5;

// The freshness penalty: its size on the day of the rejection, and how long it
// takes to fade to nothing.
const RECENCY_PENALTY = 0.3;
const RECENCY_DAYS = 90;

// Laplace smoothing: the imaginary one approval + one rejection every shop
// starts with, which is what puts a fresh shop at exactly 0.5.
const PRIOR_APPROVED = 1;
const PRIOR_TOTAL = 2;

// Defaults for the five settings (they mirror the 0070 seed and are used only
// when a value is missing or unparseable).
const TRUST_DEFAULTS = Object.freeze({
  enabled: true,
  min_items: 5,
  bonus: 0.05,
  penalty: 0.1,
  spot_check_pct: 10,
});

// Clamps for the stored settings, so even a hand-edited row cannot produce an
// absurd bar. The 0.30 ceiling on bonus/penalty keeps trust a NUDGE, not a
// replacement for the policy.
const MAX_ADJUST = 0.3;
const MAX_MIN_ITEMS = 100;

// ---- Pure helpers ---------------------------------------------------------

function clampNum(raw, lo, hi, fallback) {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(raw, lo, hi, fallback) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// Round to 3 decimals — the precision of the NUMERIC(4,3) score column, so what
// is computed here and what is stored are the same number.
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * scoreFor(row, now) — PURE. The trust score of one shop, 0..1, from its
 * counters. See the formula documented at the top of this file.
 *
 * A missing row (a shop with no history at all) is exactly the same as a row of
 * zeros: 0.5, neutral. Garbage counters read as 0 rather than throwing, and an
 * unparseable last_rejected_at reads as "no recent rejection" — a malformed
 * timestamp must never be able to punish a shop.
 */
function scoreFor(row, now) {
  const approved = Math.max(0, Number(row && row.approved_count) || 0);
  const rejected = Math.max(0, Number(row && row.rejected_count) || 0);
  const base = (approved + PRIOR_APPROVED) / (approved + rejected + PRIOR_TOTAL);

  let penalty = 0;
  const last = row && row.last_rejected_at ? new Date(row.last_rejected_at).getTime() : NaN;
  if (Number.isFinite(last)) {
    const nowMs = now ? new Date(now).getTime() : Date.now();
    const days = (nowMs - last) / 86_400_000;
    if (days < RECENCY_DAYS) {
      // Full penalty on the day itself (days <= 0 for a clock skew), fading
      // linearly to zero at RECENCY_DAYS.
      const freshness = Math.min(1, Math.max(0, 1 - days / RECENCY_DAYS));
      penalty = RECENCY_PENALTY * freshness;
    }
  }
  return round3(Math.min(1, Math.max(0, base - penalty)));
}

/**
 * bandFor(trust, cfg) — PURE. Which of the three bands a shop is in:
 * 'trusted' | 'distrusted' | 'neutral'.
 *
 * `min_items` guards the trusted band ONLY. A shop must have that many decided
 * items before a clean record buys it anything — so a single approval can never
 * unlock a lower bar. Distrust deliberately has NO such guard: one bad item is
 * enough to earn a closer look, which is the safe direction to be wrong in.
 */
function bandFor(trust, cfg) {
  const c = cfg || TRUST_DEFAULTS;
  const approved = Math.max(0, Number(trust && trust.approved_count) || 0);
  const rejected = Math.max(0, Number(trust && trust.rejected_count) || 0);
  const score = trust && trust.score != null ? Number(trust.score) : scoreFor(trust);
  if (!Number.isFinite(score)) return 'neutral';
  if (score < DISTRUSTED_SCORE) return 'distrusted';
  if (score >= TRUSTED_SCORE && approved + rejected >= c.min_items) return 'trusted';
  return 'neutral';
}

/**
 * effectiveThresholds(policy, trust, cfg) — PURE. The auto-approve and hold
 * bars a verdict for THIS shop is measured against, after trust.
 *
 * Returns { auto_approve_min, hold_min, band } — the same shape decideOutcome()
 * already takes, so the Phase-1 policy object and this are interchangeable.
 *
 * The rules, in order:
 *   - trust switched off (cfg.enabled false) or no policy => the plain policy
 *     bars, band 'neutral'. Trust is INDEPENDENTLY switchable.
 *   - trusted    => auto_approve_min - bonus
 *   - distrusted => auto_approve_min + penalty, and hold_min - penalty (flag
 *                   more readily, never less)
 *   - then the HARD FLOOR: auto_approve_min can never end below 0.75, whatever
 *     the settings say. A caller passing an absurd bonus (or a hand-edited
 *     setting that escaped the clamp in getTrustConfig) still cannot publish a
 *     low-confidence verdict. Trust may never unlock auto-approval for a
 *     LOW-CONFIDENCE verdict.
 */
function effectiveThresholds(policy, trust, cfg) {
  const base = {
    auto_approve_min: clampNum(policy && policy.auto_approve_min, THRESHOLD_MIN, THRESHOLD_MAX, 0.9),
    hold_min: clampNum(policy && policy.hold_min, THRESHOLD_MIN, THRESHOLD_MAX, 0.9),
  };
  const c = cfg || TRUST_DEFAULTS;
  if (!c.enabled) {
    return { ...base, band: 'neutral' };
  }
  const band = bandFor(trust, c);
  let auto = base.auto_approve_min;
  let hold = base.hold_min;
  if (band === 'trusted') {
    auto = base.auto_approve_min - Math.max(0, Number(c.bonus) || 0);
  } else if (band === 'distrusted') {
    const pen = Math.max(0, Number(c.penalty) || 0);
    auto = base.auto_approve_min + pen;
    hold = base.hold_min - pen;
  }
  return {
    // THE FLOOR. Applied last, unconditionally, to whatever the arithmetic
    // produced. This is the line the batch is not allowed to cross.
    auto_approve_min: round3(Math.min(THRESHOLD_MAX, Math.max(HARD_AUTO_APPROVE_FLOOR, auto))),
    hold_min: round3(Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, hold))),
    band,
  };
}

// ---- Sampling (post-publish spot checks) ----------------------------------
// A seam, not a random number: the service asks THIS module whether to sample,
// and a test swaps the roll source with setSampler() so sampling can be forced
// on (() => 0) or off (() => 0.999) instead of fighting randomness. Production
// uses Math.random.
let sampler = Math.random;

function setSampler(fn) {
  sampler = typeof fn === 'function' ? fn : Math.random;
}

/**
 * shouldSpotCheck(pct, roll) — PURE given a roll. True when this auto-approval
 * should be queued for a post-publish second look.
 *
 * pct <= 0 never samples and pct >= 100 always samples, WITHOUT consulting the
 * roll at all — so "off" and "everything" are exact, not probabilistic.
 */
function shouldSpotCheck(pct, roll) {
  const p = clampInt(pct, 0, 100, TRUST_DEFAULTS.spot_check_pct);
  if (p <= 0) return false;
  if (p >= 100) return true;
  const r = Number.isFinite(Number(roll)) ? Number(roll) : sampler();
  return r * 100 < p;
}

// ---- Live config ----------------------------------------------------------

/**
 * getTrustConfig() — the five trust settings, read LIVE from platform_settings
 * so an admin change applies to the very next job with no restart. Same promise
 * as utils/orderAlerts.getOrderAlertBounds(): it NEVER throws. On any DB or
 * parse error the built-in defaults stand, which keeps the bar at the plain
 * policy value rather than at something a broken read invented.
 *
 * Every value is clamped: bonus/penalty to 0..0.30, min_items to 0..100, pct to
 * 0..100.
 */
async function getTrustConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('ai_moderation_trust_enabled','ai_moderation_trust_min_items',
                      'ai_moderation_trust_bonus','ai_moderation_distrust_penalty',
                      'ai_moderation_spot_check_pct')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;
    return {
      // Absent key => the seeded default (true). An explicit 'false' is off.
      enabled: m.ai_moderation_trust_enabled == null
        ? TRUST_DEFAULTS.enabled
        : m.ai_moderation_trust_enabled === 'true',
      min_items: clampInt(m.ai_moderation_trust_min_items, 0, MAX_MIN_ITEMS, TRUST_DEFAULTS.min_items),
      bonus: clampNum(m.ai_moderation_trust_bonus, 0, MAX_ADJUST, TRUST_DEFAULTS.bonus),
      penalty: clampNum(m.ai_moderation_distrust_penalty, 0, MAX_ADJUST, TRUST_DEFAULTS.penalty),
      spot_check_pct: clampInt(m.ai_moderation_spot_check_pct, 0, 100, TRUST_DEFAULTS.spot_check_pct),
    };
  } catch (_e) {
    return { ...TRUST_DEFAULTS };
  }
}

// A shop with no row yet — the neutral starting point, shaped like a real row.
const NEUTRAL_TRUST = Object.freeze({
  approved_count: 0,
  rejected_count: 0,
  last_rejected_at: null,
  score: 0.5,
});

/**
 * getTrust(shopId) — the shop's stored counters, or the neutral row when it has
 * no history (or when anything at all goes wrong). NEVER throws: a failed
 * lookup must leave Phase-1 behaviour exactly as it was, not block the job.
 */
async function getTrust(shopId) {
  if (!shopId) return { ...NEUTRAL_TRUST };
  try {
    const r = await query(
      `SELECT approved_count, rejected_count, last_rejected_at, score
         FROM shop_moderation_trust WHERE shop_id = $1`,
      [shopId]
    );
    if (!r.rowCount) return { ...NEUTRAL_TRUST };
    const row = r.rows[0];
    return {
      approved_count: Number(row.approved_count) || 0,
      rejected_count: Number(row.rejected_count) || 0,
      last_rejected_at: row.last_rejected_at,
      score: Number(row.score),
    };
  } catch (_e) {
    return { ...NEUTRAL_TRUST };
  }
}

// Run `fn` against a pg client inside a SAVEPOINT, so a failure in this
// bookkeeping can never abort the CALLER'S transaction (in Postgres a failed
// statement poisons the whole transaction, so catching the error is not enough
// on its own). Without a client it is a plain best-effort call. Returns null on
// any failure — fail-open, always.
async function bestEffort(client, name, fn) {
  if (!client || typeof client.query !== 'function') {
    try {
      return await fn(query);
    } catch (_e) {
      return null;
    }
  }
  const sp = `sp_${name}`;
  try {
    await client.query(`SAVEPOINT ${sp}`);
  } catch (_e) {
    return null;
  }
  try {
    const out = await fn((text, params) => client.query(text, params));
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return out;
  } catch (_e) {
    try { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch (_e2) { /* nothing left to do */ }
    return null;
  }
}

/**
 * recordOutcome(client, { shopId, outcome, overturned }) — upsert the shop's
 * counters and recompute its stored score, in the SAME transaction as the
 * decision that caused it (pass the transaction's client; omit it for a
 * standalone write).
 *
 * `outcome` is 'approved' or 'rejected'. Nothing else is accepted — the AI
 * never rejects, and this is the only door into the counters.
 *
 * `overturned: true` marks a rejection that REVERSES an earlier approval (a
 * human rejecting something the AI auto-approved, or a spot check marked bad).
 * That case must move BOTH counters: the earlier approval was counted when the
 * AI published, so it is decremented (never below zero) as the rejection is
 * added. Otherwise a wrong auto-approval would leave the shop looking better
 * than a shop that had simply never been approved.
 *
 * NEVER throws, and never poisons the caller's transaction (SAVEPOINT).
 * Returns the stored row, or null if the bookkeeping could not be written —
 * the decision itself still stands either way.
 */
async function recordOutcome(client, { shopId, outcome, overturned } = {}) {
  if (!shopId || (outcome !== 'approved' && outcome !== 'rejected')) return null;
  return bestEffort(client, 'trust', async (run) => {
    const approvedDelta = outcome === 'approved' ? 1 : 0;
    const rejectedDelta = outcome === 'rejected' ? 1 : 0;
    // An overturn takes the earlier approval back off the board.
    const takeBack = outcome === 'rejected' && overturned === true ? 1 : 0;
    const up = await run(
      `INSERT INTO shop_moderation_trust (shop_id, approved_count, rejected_count, last_rejected_at, score, updated_at)
       VALUES ($1, $2, $3, $4, 0.5, NOW())
       ON CONFLICT (shop_id) DO UPDATE SET
         approved_count = GREATEST(shop_moderation_trust.approved_count + $2 - $5, 0),
         rejected_count = shop_moderation_trust.rejected_count + $3,
         last_rejected_at = COALESCE($4, shop_moderation_trust.last_rejected_at),
         updated_at = NOW()
       RETURNING approved_count, rejected_count, last_rejected_at`,
      [
        shopId,
        approvedDelta,
        rejectedDelta,
        rejectedDelta ? new Date().toISOString() : null,
        takeBack,
      ]
    );
    const row = up.rows[0];
    const score = scoreFor(row);
    await run('UPDATE shop_moderation_trust SET score = $2, updated_at = NOW() WHERE shop_id = $1', [shopId, score]);
    return { ...row, score };
  });
}

/**
 * enqueueSpotCheck(client, { kind, targetId, shopId, verdict }) — queue ONE
 * auto-approved item for a post-publish second look. Idempotent via the
 * UNIQUE (kind, target_id): re-running the job can never double-queue an item.
 * Best-effort — a failure here must never undo the publish it describes.
 */
async function enqueueSpotCheck(client, { kind, targetId, shopId, verdict } = {}) {
  if (!kind || !targetId) return null;
  return bestEffort(client, 'spotcheck', async (run) => {
    const r = await run(
      `INSERT INTO moderation_spot_checks (kind, target_id, shop_id, ai_verdict)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (kind, target_id) DO NOTHING
       RETURNING id`,
      [kind, targetId, shopId || null, verdict ? JSON.stringify(verdict) : null]
    );
    return r.rowCount ? r.rows[0].id : null;
  });
}

/**
 * wasAutoApproved({ kind, targetId }) — did the AI publish this item without a
 * human? Read from the ONE audit trail (an 'ai_auto_approve' row), so there is
 * no second source of truth to drift. Used to decide whether a human rejection
 * is an OVERTURN (and so must decrement the approval it reverses).
 *
 * A photo's AI audit row carries the image id in metadata.image_id (its
 * target_id is the shop); a campaign's target_id IS the campaign. Never throws
 * — on any error it answers false, which is the conservative choice: at worst a
 * rejection is recorded without taking a point back.
 */
async function wasAutoApproved({ kind, targetId } = {}) {
  if (!targetId) return false;
  try {
    const sql = kind === 'shop_image'
      ? `SELECT 1 FROM moderation_actions
          WHERE action = 'ai_auto_approve' AND metadata->>'image_id' = $1 LIMIT 1`
      : `SELECT 1 FROM moderation_actions
          WHERE action = 'ai_auto_approve' AND target_id = $1 LIMIT 1`;
    const r = await query(sql, [kind === 'shop_image' ? String(targetId) : targetId]);
    return r.rowCount > 0;
  } catch (_e) {
    return false;
  }
}

module.exports = {
  // pure
  scoreFor,
  bandFor,
  effectiveThresholds,
  shouldSpotCheck,
  setSampler,
  // live config + storage
  getTrustConfig,
  getTrust,
  recordOutcome,
  enqueueSpotCheck,
  wasAutoApproved,
  // constants (the rule, for callers and tests)
  HARD_AUTO_APPROVE_FLOOR,
  TRUSTED_SCORE,
  DISTRUSTED_SCORE,
  RECENCY_PENALTY,
  RECENCY_DAYS,
  TRUST_DEFAULTS,
  NEUTRAL_TRUST,
};
