// Rule-based actionable-insights engine (Phase E, extended in Batch L). PURE and
// DETERMINISTIC: given the already-permission-filtered `sections` payload built
// by the dashboard controller, it returns a prioritised list of insight cards.
// No I/O, no clock, no randomness, no external/AI calls — the same sections
// always yield the same insights, so it is trivially unit-testable.
//
// Each rule reads ONLY from sections the caller was allowed to see (the
// controller omits a section the caller's admin sub-role cannot view), so an
// insight can never leak a figure the caller isn't entitled to. Every emitted
// insight also carries the `perm` its data came from — the frontend hides any
// insight whose `perm` the caller lacks, a belt-and-braces second gate.
//
// Batch L: every insight is ALSO tagged with the domain tab it belongs to
// (overview / marketing / growth / finance / research / investor). The Overview
// tab shows every permitted insight (as before); each domain tab additionally
// surfaces just the insights tagged with its own domain. The `domain` tag never
// widens visibility — `perm` remains the only gate on whether a card is emitted.
//
// Money is integer paise everywhere here (same as the rest of the app); the UI
// renders rupees. Insight `metric` is a plain number used only for ordering and
// display, never money math.

// ---- Named thresholds ----------------------------------------------------
// Every magic number a rule fires on lives here so the platform team can tune
// the control room without hunting through logic.
const THRESHOLDS = Object.freeze({
  // >= this many shops with no transaction in the last 30 days → churn risk.
  CHURN_MIN_INACTIVE_SHOPS: 1,
  // Collection rate (paid/purchased over 30d) below this (%) warns; below the
  // urgent floor it escalates.
  COLLECTION_WARN_PCT: 60,
  COLLECTION_URGENT_PCT: 40,
  COLLECTION_HEALTHY_PCT: 80, // shared with the UI colour bands
  // >= this many shops that never activated (0 products OR 0 transactions).
  ACTIVATION_MIN_SHOPS: 1,
  // >= this many consumers who signed up but never placed an order.
  CONSUMER_PENDING_MIN: 1,
  // >= this many staged (inactive) languages waiting on a native audit.
  LANGUAGE_STAGED_MIN: 1,
  // A referrer with >= this many attributed signups is worth rewarding.
  TOP_REFERRER_MIN_SIGNUPS: 3,
  // >= this many Free-plan shops with high 30d GMV → upsell candidates.
  UPSELL_MIN_CANDIDATES: 1,
  // >= this many moderation actions in the last 30d → surface the workload.
  MODERATION_OPEN_MIN: 1,
  // Blocked principals (users + consumers) at or above this → a possible spike.
  BLOCKED_SPIKE_MIN: 5,
  // Week-over-week signup drop (%) at or beyond which growth is stalling. Only
  // fires when the prior week had a meaningful base (avoids 1→0 noise).
  GROWTH_STALL_DROP_PCT: 25,
  GROWTH_STALL_MIN_PREV: 4,
  // Share (%) of total outstanding sitting in the oldest (61+ day) aging bucket
  // at or above which the book is skewing to hard-to-collect debt.
  AGING_RISK_SHARE_PCT: 40,
  // Drop (percentage points) in the 30-day collection rate versus the prior
  // 30-day window at or beyond which collection is trending down.
  COLLECTION_TREND_DROP_PCT: 10,
});

const SEVERITY_RANK = Object.freeze({ urgent: 0, warn: 1, info: 2 });

// buildInsights(sections) → array of insight cards, ordered by severity then by
// descending metric. `sections` is the permission-filtered object the dashboard
// controller assembles; any section may be absent.
function buildInsights(sections = {}) {
  const out = [];
  const { overview, growth, network, revenue, acquisition, languages, trust, finance } = sections;

  // churn_risk — shops with no transaction in the last 30 days.
  if (overview) {
    const inactive = Math.max(0, (overview.total_shops || 0) - (overview.active_shops_30d || 0));
    if (overview.total_shops > 0 && inactive >= THRESHOLDS.CHURN_MIN_INACTIVE_SHOPS) {
      out.push({
        id: 'churn_risk',
        severity: 'warn',
        title: `${inactive} shop${inactive === 1 ? '' : 's'} inactive for 30 days`,
        detail: 'These shops recorded no transaction in the last 30 days — reach out before they churn.',
        metric: inactive,
        action_label: 'Review shops',
        action_link: '/admin',
        perm: 'shops:view',
        domain: 'growth',
        vars: { n: inactive },
      });
    }
  }

  // activation_gap — shops that never activated (no products OR no transactions).
  if (growth && growth.activation) {
    const gap = growth.activation.never_activated || 0;
    if (gap >= THRESHOLDS.ACTIVATION_MIN_SHOPS) {
      out.push({
        id: 'activation_gap',
        severity: 'warn',
        title: `${gap} shop${gap === 1 ? '' : 's'} never activated`,
        detail: 'Signed up but has no products or no transactions yet — a guided-onboarding nudge can convert them.',
        metric: gap,
        action_label: 'Review shops',
        action_link: '/admin',
        perm: 'shops:view',
        domain: 'growth',
        vars: { n: gap },
      });
    }
  }

  // collection_drop — low 30-day collection rate (paid vs purchased).
  if (network && network.purchased_30d_paise > 0) {
    const pct = network.collection_rate_pct;
    if (pct < THRESHOLDS.COLLECTION_WARN_PCT) {
      const severity = pct < THRESHOLDS.COLLECTION_URGENT_PCT ? 'urgent' : 'warn';
      out.push({
        id: 'collection_drop',
        severity,
        title: `Collection rate is ${pct}%`,
        detail: 'Repayments are lagging purchases across the platform over the last 30 days — udhaar is piling up.',
        metric: 100 - pct, // higher shortfall sorts first
        action_label: 'See network health',
        action_link: '/admin/dashboard',
        perm: 'shops:view',
        domain: 'finance',
        vars: { pct },
      });
    }
  }

  // consumer_pending — consumers who signed up but never ordered.
  if (overview && overview.consumers_never_ordered >= THRESHOLDS.CONSUMER_PENDING_MIN) {
    const n = overview.consumers_never_ordered;
    out.push({
      id: 'consumer_pending',
      severity: 'info',
      title: `${n} consumer${n === 1 ? '' : 's'} never ordered`,
      detail: 'They created an account but have not placed a first order — a good re-engagement audience.',
      metric: n,
      action_label: 'View consumers',
      action_link: '/admin/customers',
      perm: 'shops:view',
      domain: 'growth',
      vars: { n },
    });
  }

  // language_staged — staged (inactive) languages ready to launch after audit.
  if (languages && languages.staged_count >= THRESHOLDS.LANGUAGE_STAGED_MIN) {
    const n = languages.staged_count;
    out.push({
      id: 'language_staged',
      severity: 'info',
      title: `${n} language${n === 1 ? '' : 's'} ready to launch`,
      detail: 'Pre-staged languages are waiting on a native-speaker audit before you switch them on.',
      metric: n,
      action_label: 'Open languages',
      action_link: '/admin/languages',
      perm: 'shops:view',
      domain: 'marketing',
      vars: { n },
    });
  }

  // top_referrer — a standout referrer worth rewarding.
  if (acquisition && Array.isArray(acquisition.top_referrers) && acquisition.top_referrers.length) {
    const top = acquisition.top_referrers[0];
    if ((top.referred_count || 0) >= THRESHOLDS.TOP_REFERRER_MIN_SIGNUPS) {
      const label = top.label || top.code;
      out.push({
        id: 'top_referrer',
        severity: 'info',
        title: `Reward top referrer ${label}`,
        detail: `${label} has brought in ${top.referred_count} signups — consider recognising them.`,
        metric: top.referred_count,
        action_label: 'Open referrals',
        action_link: '/admin/referrals',
        perm: 'revenue:view',
        domain: 'marketing',
        vars: { label, n: top.referred_count },
      });
    }
  }

  // upsell_free_highgmv — Free-plan shops with high recent order GMV.
  if (revenue && revenue.upsell_candidates >= THRESHOLDS.UPSELL_MIN_CANDIDATES) {
    const n = revenue.upsell_candidates;
    out.push({
      id: 'upsell_free_highgmv',
      severity: 'info',
      title: `${n} upsell candidate${n === 1 ? '' : 's'}`,
      detail: 'Free-plan shops with strong 30-day order volume — prime for a Pro/Family conversation.',
      metric: n,
      action_label: 'See revenue',
      action_link: '/admin/dashboard',
      perm: 'revenue:view',
      domain: 'finance',
      vars: { n },
    });
  }

  // moderation_open — moderation workload in the last 30 days.
  if (trust && trust.moderation_actions_30d >= THRESHOLDS.MODERATION_OPEN_MIN) {
    const n = trust.moderation_actions_30d;
    out.push({
      id: 'moderation_open',
      severity: 'info',
      title: `${n} moderation action${n === 1 ? '' : 's'} in 30 days`,
      detail: 'Recent trust-and-safety activity — review the audit log to stay on top of it.',
      metric: n,
      action_label: 'Open moderation',
      action_link: '/admin/moderation',
      perm: 'audit:view',
      domain: 'overview',
      vars: { n },
    });
  }

  // blocked_spike — many principals currently blocked.
  if (trust) {
    const blocked = (trust.blocked_users || 0) + (trust.blocked_consumers || 0);
    if (blocked >= THRESHOLDS.BLOCKED_SPIKE_MIN) {
      out.push({
        id: 'blocked_spike',
        severity: 'warn',
        title: `${blocked} accounts currently blocked`,
        detail: 'A high number of blocked users and consumers — confirm this matches expected enforcement.',
        metric: blocked,
        action_label: 'Open moderation',
        action_link: '/admin/moderation',
        perm: 'audit:view',
        domain: 'overview',
        vars: { n: blocked },
      });
    }
  }

  // growth_stall — week-over-week signups fell sharply from a real base. Reads
  // the growth section's `wow` cut (last completed week vs the week before it).
  if (growth && growth.wow && growth.wow.pct != null
      && growth.wow.prev >= THRESHOLDS.GROWTH_STALL_MIN_PREV
      && growth.wow.pct <= -THRESHOLDS.GROWTH_STALL_DROP_PCT) {
    const drop = Math.abs(Math.round(growth.wow.pct));
    out.push({
      id: 'growth_stall',
      severity: 'warn',
      title: `Signups down ${drop}% week-over-week`,
      detail: 'New shop + consumer signups fell versus the previous week — check acquisition channels.',
      metric: drop,
      action_label: 'See growth',
      action_link: '/admin/dashboard',
      perm: 'shops:view',
      domain: 'growth',
      vars: { pct: drop },
    });
  }

  // aging_risk — the oldest (61+ day) bucket is a large share of outstanding, so
  // the book is skewing to hard-to-collect debt. Reads the network section.
  if (network && network.outstanding_total_paise > 0 && network.aging) {
    const old = network.aging.b61_plus_paise || 0;
    const share = Math.round((old / network.outstanding_total_paise) * 100);
    if (old > 0 && share >= THRESHOLDS.AGING_RISK_SHARE_PCT) {
      out.push({
        id: 'aging_risk',
        severity: 'warn',
        title: `${share}% of dues are 61+ days old`,
        detail: 'A large share of outstanding udhaar is ageing past two months — prioritise those follow-ups.',
        metric: share,
        action_label: 'See network health',
        action_link: '/admin/dashboard',
        perm: 'shops:view',
        domain: 'finance',
        vars: { pct: share },
      });
    }
  }

  // collection_trend_down — the 30-day collection rate slipped meaningfully from
  // the prior 30-day window. Reads the finance section's collection_trend cut
  // (revenue:view), so it only ever reaches a caller entitled to revenue data.
  if (finance && finance.collection_trend
      && finance.collection_trend.current_pct != null
      && finance.collection_trend.prior_pct != null) {
    const delta = finance.collection_trend.current_pct - finance.collection_trend.prior_pct;
    if (delta <= -THRESHOLDS.COLLECTION_TREND_DROP_PCT) {
      const drop = Math.abs(Math.round(delta));
      out.push({
        id: 'collection_trend_down',
        severity: 'warn',
        title: `Collection rate down ${drop} points`,
        detail: 'The 30-day collection rate has dropped versus the previous 30 days — repayments are slowing.',
        metric: drop,
        action_label: 'See finance',
        action_link: '/admin/dashboard',
        perm: 'revenue:view',
        domain: 'finance',
        vars: { pts: drop },
      });
    }
  }

  // Order by severity (urgent → warn → info), then by descending metric, then by
  // id for a fully stable, deterministic result.
  out.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    if (b.metric !== a.metric) return b.metric - a.metric;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return out;
}

module.exports = { buildInsights, THRESHOLDS };
