const { query } = require('../config/db');

// Deterministic "strategist" seeder. It turns LIVE product metrics into editorial
// briefs using a FROZEN template library — NO LLM, NO randomness, NO clock inside
// the pure part. buildBriefs(metrics, periodKey) is pure and unit-testable (same
// input → identical output); runStrategist() reads the real numbers, computes the
// ISO-week periodKey, and inserts each brief as an 'idea' item, idempotently via
// the unique seed_key index (ON CONFLICT DO NOTHING). Every brief starts at
// 'idea' — a human/agent drafts it and nothing auto-advances past the human gate.
//
// Money is INTEGER PAISE end-to-end; briefs display a rounded rupee figure.

// Round integer paise to whole rupees for human-facing brief copy.
function rupees(paise) {
  return Math.round(Number(paise || 0) / 100);
}

// Normalise the metrics bag so a missing field renders as 0, never "undefined".
function normalize(metrics) {
  const m = metrics || {};
  return {
    totalShops: Number(m.totalShops || 0),
    activeShops: Number(m.activeShops || 0),
    collection30dPaise: Number(m.collection30dPaise || 0),
    supplyGmv30dPaise: Number(m.supplyGmv30dPaise || 0),
  };
}

// The FROZEN template library. Each template is a channel's recurring brief for a
// period, with an explicit engine (A=record / B=reach) and autonomy tier per the
// playbook:
//   - money/credit storytelling + everything on the 'reach' engine → Tier 1
//   - evergreen 'record' how-tos (no live figures) → Tier 0
//   - the investor/ecosystem newsletter → Tier 2
// Tiers 1 and 2 need a human approval before they can ever be scheduled/published.
// A brief carries NO body: drafting (human or, later, an LLM agent) fills that in.
const TEMPLATES = Object.freeze([
  {
    channel: 'blog',
    engine: 'record',
    autonomy_tier: 1, // references live collection money → human review
    language: 'en',
    title: (m) => `Data story: shopkeepers recovered ₹${rupees(m.collection30dPaise)} across ${m.activeShops} active shops`,
    brief: (m, pk) =>
      `Period ${pk}. Engine: Record. Angle — the money shopkeepers recover. In the last 30 days ₹${rupees(m.collection30dPaise)} in udhaar was collected across ${m.activeShops} active shops (of ${m.totalShops} on the platform). Tell one shopkeeper's before/after recovery story and close on how the ledger surfaces overdue dues. Verify every figure against the dashboard before publishing.`,
  },
  {
    channel: 'linkedin',
    engine: 'reach',
    autonomy_tier: 1, // reach engine → human review
    language: 'en',
    title: (m) => `Ecosystem post: ₹${rupees(m.supplyGmv30dPaise)} of supply GMV moved through the distributor/farmer network`,
    brief: (m, pk) =>
      `Period ${pk}. Engine: Reach. Audience — distributors, farmers and B2B partners on LinkedIn. Frame the supply side: ₹${rupees(m.supplyGmv30dPaise)} of delivered purchase-order GMV in the last 30 days across ${m.activeShops} active shops. Angle — the local retail supply chain going digital. One clear call to action for distributors to join.`,
  },
  {
    channel: 'whatsapp_tip',
    engine: 'reach',
    autonomy_tier: 1, // reach engine + broadcast → human review
    language: 'en',
    title: () => 'Weekly WhatsApp tip: chase the oldest dues first',
    brief: (m, pk) =>
      `Period ${pk}. Engine: Reach. A short, warm WhatsApp broadcast tip for shop owners (2–3 lines, plus one line they can forward). This week: sort udhaar by age and send a friendly reminder to the oldest three. Keep it practical and non-preachy.`,
  },
  {
    channel: 'reel',
    engine: 'record',
    autonomy_tier: 0, // evergreen how-to, no live figures → auto-safe
    language: 'en',
    title: () => 'Evergreen reel: record an udhaar entry in 10 seconds',
    brief: (m, pk) =>
      `Period ${pk}. Engine: Record. A 20–30s evergreen screen-capture reel showing how fast it is to add a credit entry and mark a repayment. No live numbers, no claims — pure product how-to, safe to reuse.`,
  },
  {
    channel: 'newsletter_ecosystem',
    engine: 'reach',
    autonomy_tier: 2, // investor/ecosystem narrative → highest scrutiny
    language: 'en',
    title: (m) => `Ecosystem letter: ${m.activeShops} active shops, ₹${rupees(m.collection30dPaise)} recovered`,
    brief: (m, pk) =>
      `Period ${pk}. Engine: Reach. The investor/ecosystem newsletter — the highest-scrutiny channel. Lead with the north-star: ${m.activeShops} active shops of ${m.totalShops} total, ₹${rupees(m.collection30dPaise)} in dues recovered and ₹${rupees(m.supplyGmv30dPaise)} of supply GMV in the last 30 days. Narrative around retail formalisation. Every figure must be reconciled with the control room before this goes out.`,
  },
]);

// buildBriefs(metrics, periodKey) — PURE. Same metrics + periodKey ⇒ identical
// output. seed_key = `${channel}:${periodKey}` so a re-run in the same period is
// a no-op at the unique index.
function buildBriefs(metrics, periodKey) {
  const m = normalize(metrics);
  return TEMPLATES.map((tpl) => ({
    channel: tpl.channel,
    engine: tpl.engine,
    autonomy_tier: tpl.autonomy_tier,
    language: tpl.language,
    title: tpl.title(m, periodKey),
    brief: tpl.brief(m, periodKey),
    source: 'strategist',
    meta: { seed_key: `${tpl.channel}:${periodKey}` },
  }));
}

// isoWeekKey(date) → "YYYY-Www" (ISO-8601 week). Pure given its argument; only
// runStrategist() passes the wall clock in. Deterministic for a fixed input.
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week day: Mon=1..Sun=7.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Shift to the Thursday of this week — the ISO week's year is that Thursday's.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// A single-scalar helper (first column of the first row).
async function scalar(sql, params) {
  const r = await query(sql, params);
  const row = r.rows[0] || {};
  const k = Object.keys(row)[0];
  return row[k];
}

// Read the small, deterministic set of live product metrics the briefs are
// grounded in — mirrors the dashboard controller's queries so the numbers match
// the control room. Money stays integer paise.
async function readMetrics() {
  const [totalShops, activeShops, collection, supplyGmv] = await Promise.all([
    scalar('SELECT COUNT(*)::int AS c FROM shops'),
    scalar("SELECT COUNT(DISTINCT shop_id)::int AS c FROM transactions WHERE created_at >= NOW() - INTERVAL '30 days'"),
    // Collection = repayments (cash + upi) in the last 30 days, in paise.
    scalar("SELECT COALESCE(SUM(amount),0)::bigint AS s FROM transactions WHERE type IN ('cash','upi') AND created_at >= NOW() - INTERVAL '30 days'"),
    // Supply GMV = delivered purchase-order subtotals in the last 30 days, in paise.
    scalar("SELECT COALESCE(SUM(subtotal_paise),0)::bigint AS s FROM purchase_orders WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '30 days'"),
  ]);
  return {
    totalShops: Number(totalShops || 0),
    activeShops: Number(activeShops || 0),
    collection30dPaise: Number(collection || 0),
    supplyGmv30dPaise: Number(supplyGmv || 0),
  };
}

// runStrategist(now) — read live metrics, compute the ISO-week periodKey, and
// insert each brief as an 'idea' item. Idempotent: the unique seed_key index
// swallows a duplicate insert (ON CONFLICT DO NOTHING), so re-running in the
// same week inserts nothing new. Returns { periodKey, inserted, total }.
async function runStrategist(now = new Date()) {
  const periodKey = isoWeekKey(now);
  const metrics = await readMetrics();
  const briefs = buildBriefs(metrics, periodKey);
  let inserted = 0;
  for (const b of briefs) {
    const r = await query(
      `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, brief, status, source, meta)
       VALUES ($1,$2,$3,$4,$5,$6,'idea',$7,$8::jsonb)
       ON CONFLICT ((meta->>'seed_key')) WHERE meta ? 'seed_key' DO NOTHING
       RETURNING id`,
      [b.channel, b.engine, b.autonomy_tier, b.language, b.title, b.brief, b.source, JSON.stringify(b.meta)]
    );
    if (r.rowCount) inserted += 1;
  }
  return { periodKey, inserted, total: briefs.length, metrics };
}

module.exports = {
  buildBriefs,
  isoWeekKey,
  readMetrics,
  runStrategist,
  // exported for tests / introspection
  TEMPLATES,
};
