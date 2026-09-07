const { query } = require('../config/db');

// Admin acquisition funnel (Analytics Phase 1). Read-only aggregation over
// analytics_events (anonymous top-of-funnel) joined conceptually with the signup
// cohort (shops created in the window) and the real ledger tables for the
// activation / collection steps.
//
// Stage definitions (frozen contract §3):
//   landing_view / register_start
//     = DISTINCT anonymous session_id in analytics_events with that event name
//       and ts inside the window. Top-of-funnel; NOT cohort-joined.
//   signup
//     = the COHORT: shops with created_at inside the window. Anchors the rest.
//   activated
//     = of the signup cohort, shops with >=1 khata transaction EVER. A khata
//       transaction is any row in `transactions` for the shop (type is one of
//       purchase / cash / upi). Predicate:
//         EXISTS (SELECT 1 FROM transactions t WHERE t.shop_id = s.id)
//   collecting
//     = of the signup cohort, shops that have recorded a COLLECTION / REPAYMENT.
//       In this schema a repayment that reduces a customer's udhaar is a
//       transaction of type 'cash' or 'upi' (type 'purchase' is credit taken,
//       NOT a collection), and a paid payment link is a payment_orders row with
//       status = 'paid'. Predicate:
//         EXISTS (SELECT 1 FROM transactions t
//                  WHERE t.shop_id = s.id AND t.type IN ('cash','upi'))
//         OR EXISTS (SELECT 1 FROM payment_orders po
//                     WHERE po.shop_id = s.id AND po.status = 'paid')
//
// bySource groups the signup cohort by signup_utm_source (NULL/blank → "(direct)"),
// ordered by signups desc, capped to the top 12 sources with the remainder folded
// into a single "(other)" bucket.

const SOURCE_CAP = 12;

// Distinct-session top-of-funnel count for one event name in the window.
async function distinctSessions(eventName, from, to) {
  const r = await query(
    `SELECT COUNT(DISTINCT session_id)::int AS c
       FROM analytics_events
      WHERE event_name = $1 AND ts >= $2 AND ts < $3 AND session_id IS NOT NULL`,
    [eventName, from, to]
  );
  return r.rows[0] ? r.rows[0].c : 0;
}

exports.funnel = async (req, res) => {
  const raw = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, raw)) : 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  // The signup cohort with its per-shop activation / collection flags and its
  // attribution source, computed once and reused for the stage totals + bySource.
  const cohort = await query(
    `WITH cohort AS (
       SELECT
         s.id,
         COALESCE(NULLIF(TRIM(s.signup_utm_source), ''), '(direct)') AS source,
         EXISTS (SELECT 1 FROM transactions t WHERE t.shop_id = s.id) AS activated,
         (
           EXISTS (SELECT 1 FROM transactions t
                    WHERE t.shop_id = s.id AND t.type IN ('cash','upi'))
           OR EXISTS (SELECT 1 FROM payment_orders po
                       WHERE po.shop_id = s.id AND po.status = 'paid')
         ) AS collecting
       FROM shops s
       WHERE s.created_at >= $1 AND s.created_at < $2
     )
     SELECT
       source,
       COUNT(*)::int                                AS signups,
       COUNT(*) FILTER (WHERE activated)::int       AS activated,
       COUNT(*) FILTER (WHERE collecting)::int      AS collecting
     FROM cohort
     GROUP BY source
     ORDER BY signups DESC, source ASC`,
    [fromIso, toIso]
  );

  // Stage totals derived from the same cohort grouping (sum across sources).
  let signupCount = 0;
  let activatedCount = 0;
  let collectingCount = 0;
  for (const row of cohort.rows) {
    signupCount += row.signups;
    activatedCount += row.activated;
    collectingCount += row.collecting;
  }

  const [landingView, registerStart] = await Promise.all([
    distinctSessions('landing_view', fromIso, toIso),
    distinctSessions('register_start', fromIso, toIso),
  ]);

  // Cap to the top sources; fold the remainder into a single "(other)" bucket.
  const top = cohort.rows.slice(0, SOURCE_CAP).map((r) => ({
    source: r.source,
    signups: r.signups,
    activated: r.activated,
    collecting: r.collecting,
  }));
  const rest = cohort.rows.slice(SOURCE_CAP);
  if (rest.length) {
    const other = rest.reduce(
      (acc, r) => {
        acc.signups += r.signups;
        acc.activated += r.activated;
        acc.collecting += r.collecting;
        return acc;
      },
      { source: '(other)', signups: 0, activated: 0, collecting: 0 }
    );
    top.push(other);
  }

  res.json({
    days,
    window: { from: fromIso, to: toIso },
    stages: [
      { key: 'landing_view', label: 'Visited', count: landingView },
      { key: 'register_start', label: 'Started sign-up', count: registerStart },
      { key: 'signup', label: 'Created shop', count: signupCount },
      { key: 'activated', label: 'Recorded first khata', count: activatedCount },
      { key: 'collecting', label: 'Collected a payment', count: collectingCount },
    ],
    bySource: top,
  });
};
