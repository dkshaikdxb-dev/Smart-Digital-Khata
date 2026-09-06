// Deterministic on-device analyst engine (Batch P). PURE and DETERMINISTIC:
// given the already-permission-filtered `sections` payload the dashboard
// controller assembles, it returns an ordered list of analytical commentary
// blocks. No I/O, no clock, no randomness, no external/AI calls — the same
// sections always yield the same commentary, so it is trivially unit-testable,
// exactly like utils/insights.js (which it mirrors).
//
// Each block turns a domain's real numbers into a structured interpretation:
//   Observation   → what the data literally shows (the numbers).
//   Interpretation→ what it means / why it matters.
//   Recommendation→ the concrete next action.
// plus a `tone` chip (positive | neutral | watch | risk) — distinct from insight
// severity — and a `metrics` list of small label:value display pairs.
//
// PERMISSION-GATING is identical to insights: a block is ONLY built from a
// section the caller was given (the controller omits a section the caller's
// admin sub-role cannot see), and every block carries the `perm` its data came
// from so the frontend can second-gate. A block can therefore never surface a
// figure the caller isn't entitled to see.
//
// The generated prose is English; the UI shows the server's English and MAY be
// overridden per field by an i18n key `commentary.<id>.<field>` (English
// fallback), the same pattern as insightText — the prose is NOT translated into
// the seven languages.
//
// Money is integer paise everywhere here (same as the rest of the app); display
// values round to grouped rupees exactly like the page's rupees() helper. No
// money math is ever done in floats.

const { THRESHOLDS: INS } = require('./insights');

// ---- Named thresholds ----------------------------------------------------
// Every magic number a rule keys on lives here so the platform team can tune the
// commentary without hunting through logic. Shared numbers are reused from the
// insights THRESHOLDS table (imported as INS) rather than re-declared, so the
// two engines can never drift apart.
const THRESHOLDS = Object.freeze({
  // Share (%) of shops that transacted in the last 30 days at/above which the
  // active base reads healthy; below the watch floor it reads thin.
  ACTIVE_RATIO_HEALTHY_PCT: 50,
  ACTIVE_RATIO_WATCH_PCT: 30,
  // Share (%) of consumers who never ordered at/above which re-engagement is a
  // real opportunity worth flagging.
  NEVER_ORDERED_WATCH_PCT: 50,
  // Share (%) of total attributed signups sitting in a single acquisition
  // channel at/above which the mix is over-concentrated (a reach risk).
  CHANNEL_CONCENTRATION_WATCH_PCT: 70,
  // Share (%) of shops listed in the marketplace at/above which discovery reads
  // healthy.
  LISTED_SHARE_HEALTHY_PCT: 50,
  // Share (%) of shops with an order (deepest activation step) at/above which
  // the funnel is converting well.
  ORDER_ACTIVATION_HEALTHY_PCT: 40,
  // Share (%) of a shop's products linked to the base catalogue at/above which
  // catalogue adoption reads healthy.
  BASE_ADOPTION_HEALTHY_PCT: 50,
  // Share (%) of signups that are referral-driven at/above which the referral
  // engine is a meaningful acquisition lever.
  REFERRAL_SHARE_HEALTHY_PCT: 20,
  // Collection-rate bands (shared with insights + the UI colour bands).
  COLLECTION_HEALTHY_PCT: INS.COLLECTION_HEALTHY_PCT, // 80
  COLLECTION_WARN_PCT: INS.COLLECTION_WARN_PCT,       // 60
  COLLECTION_URGENT_PCT: INS.COLLECTION_URGENT_PCT,   // 40
  // 61+ day aging share (%) at/above which the book skews to hard-to-collect
  // debt (shared with insights.aging_risk).
  AGING_RISK_SHARE_PCT: INS.AGING_RISK_SHARE_PCT,     // 40
  // Week-over-week / period-over-period drop (%) at/beyond which growth is
  // stalling, and the minimum prior base that avoids 1→0 noise (shared).
  GROWTH_STALL_DROP_PCT: INS.GROWTH_STALL_DROP_PCT,   // 25
  GROWTH_STALL_MIN_PREV: INS.GROWTH_STALL_MIN_PREV,   // 4
  // 30-day collection-rate drop (points) at/beyond which collection is trending
  // down (shared with insights.collection_trend_down).
  COLLECTION_TREND_DROP_PCT: INS.COLLECTION_TREND_DROP_PCT, // 10
});

// Tone order for a stable, deterministic sort within a domain (most concerning
// first, then id). Distinct from insight severity.
const TONE_RANK = Object.freeze({ risk: 0, watch: 1, neutral: 2, positive: 3 });

// Fixed domain display order (mirrors the dashboard tab order).
const DOMAIN_RANK = Object.freeze({
  overview: 0, marketing: 1, growth: 2, finance: 3, research: 4, investor: 5,
});

// ---- Display helpers (pure) ----------------------------------------------
// Mirror the admin page's rupees()/num(): integer paise → grouped rupees; counts
// → grouped integers. Percentages are already computed as plain numbers.
const rupees = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
const num = (n) => Number(n || 0).toLocaleString('en-IN');
// Integer share of `part` out of `whole` as a whole-number percent (no float
// money math — this is a count/paise ratio used only for display + thresholds).
const share = (part, whole) => (whole > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0);
// Week-over-week / growth movement phrase from a signed percent (already rounded
// by the controller). `null` handled by callers before this is reached.
const movePhrase = (p) => (p > 0 ? `up ${p}%` : p < 0 ? `down ${Math.abs(p)}%` : 'flat');

// buildCommentary(sections) → array of analyst blocks. `sections` is the
// permission-filtered object the dashboard controller assembles; any section may
// be absent. Blocks are grouped by domain (fixed order), then most-concerning
// tone first, then id — fully deterministic.
function buildCommentary(sections = {}) {
  const out = [];
  const { overview, marketing, growth, finance, network, research, investor } = sections;

  // Helper that pushes a well-formed block; keeps each rule terse.
  const push = (b) => out.push(b);

  // ---- Overview (perm shops:view) — top-line synthesis --------------------
  if (overview && overview.total_shops > 0) {
    const activePct = share(overview.active_shops_30d, overview.total_shops);
    const tone = activePct >= THRESHOLDS.ACTIVE_RATIO_HEALTHY_PCT ? 'positive'
      : activePct >= THRESHOLDS.ACTIVE_RATIO_WATCH_PCT ? 'neutral' : 'watch';
    push({
      id: 'overview_scale',
      domain: 'overview',
      perm: 'shops:view',
      tone,
      title: 'Platform scale and active base',
      observation: `The platform holds ${num(overview.total_shops)} shops — ${num(overview.active_shops_30d)} transacted in the last 30 days — and ${num(overview.total_consumers)} consumers.`,
      interpretation: `${activePct}% of shops were active this month; that is the engaged base the rest of the funnel builds on.`,
      recommendation: tone === 'positive'
        ? 'Keep the active cohort supplied and lean on it for referrals and case studies.'
        : 'Prioritise re-activation outreach to dormant shops before spending on new acquisition.',
      metrics: [
        { label: 'Total shops', value: num(overview.total_shops) },
        { label: 'Active (30d)', value: num(overview.active_shops_30d) },
        { label: 'Active share', value: `${activePct}%` },
        { label: 'Consumers', value: num(overview.total_consumers) },
      ],
    });
  }

  if (overview && overview.total_consumers > 0) {
    const neverPct = share(overview.consumers_never_ordered, overview.total_consumers);
    const tone = neverPct >= THRESHOLDS.NEVER_ORDERED_WATCH_PCT ? 'watch'
      : overview.consumers_never_ordered > 0 ? 'neutral' : 'positive';
    push({
      id: 'overview_consumer_engagement',
      domain: 'overview',
      perm: 'shops:view',
      tone,
      title: 'Consumer activation',
      observation: `${num(overview.consumers_never_ordered)} of ${num(overview.total_consumers)} consumers have never placed an order (${neverPct}%).`,
      interpretation: neverPct >= THRESHOLDS.NEVER_ORDERED_WATCH_PCT
        ? 'A large idle audience signed up but never converted to a first order.'
        : 'Most consumers who signed up have gone on to order at least once.',
      recommendation: neverPct >= THRESHOLDS.NEVER_ORDERED_WATCH_PCT
        ? 'Run a first-order re-engagement campaign (reminder + incentive) against the idle consumers.'
        : 'Maintain onboarding nudges so new consumers keep reaching a first order.',
      metrics: [
        { label: 'Never ordered', value: num(overview.consumers_never_ordered) },
        { label: 'Consumers', value: num(overview.total_consumers) },
        { label: 'Idle share', value: `${neverPct}%` },
      ],
    });
  }

  // ---- Marketing (perm shops:view) — attribution + reach ------------------
  if (marketing && Array.isArray(marketing.source_channel_mix) && marketing.source_channel_mix.length) {
    const mix = marketing.source_channel_mix;
    const total = mix.reduce((sum, r) => sum + (Number(r.c) || 0), 0);
    if (total > 0) {
      const leader = mix[0]; // controller orders by count desc
      const leadPct = share(leader.c, total);
      const tone = leadPct >= THRESHOLDS.CHANNEL_CONCENTRATION_WATCH_PCT ? 'watch'
        : mix.length > 1 ? 'positive' : 'neutral';
      push({
        id: 'marketing_channels',
        domain: 'marketing',
        perm: 'shops:view',
        tone,
        title: 'Acquisition channel mix',
        observation: `${num(total)} attributed signups across ${num(mix.length)} channel${mix.length === 1 ? '' : 's'}; ${leader.channel} leads with ${num(leader.c)} (${leadPct}%).`,
        interpretation: leadPct >= THRESHOLDS.CHANNEL_CONCENTRATION_WATCH_PCT
          ? `Acquisition is concentrated in ${leader.channel} — a shift there would swing overall reach.`
          : 'Signups are spread across more than one channel, which diversifies acquisition risk.',
        recommendation: leadPct >= THRESHOLDS.CHANNEL_CONCENTRATION_WATCH_PCT
          ? `Invest in a second channel to reduce dependence on ${leader.channel}.`
          : `Double down on ${leader.channel} while testing the smaller channels for headroom.`,
        metrics: [
          { label: 'Attributed signups', value: num(total) },
          { label: 'Leading channel', value: `${leader.channel}` },
          { label: 'Leader share', value: `${leadPct}%` },
        ],
      });
    }
  }

  if (marketing && Array.isArray(marketing.top_referrers) && marketing.top_referrers.length) {
    const top = marketing.top_referrers[0];
    const label = top.label || top.code;
    const n = top.referred_count || 0;
    const tone = n >= INS.TOP_REFERRER_MIN_SIGNUPS ? 'positive' : 'neutral';
    push({
      id: 'marketing_referral_leaders',
      domain: 'marketing',
      perm: 'shops:view',
      tone,
      title: 'Referral leaders',
      observation: `Top referrer ${label} has driven ${num(n)} attributed signup${n === 1 ? '' : 's'}.`,
      interpretation: n >= INS.TOP_REFERRER_MIN_SIGNUPS
        ? 'A standout advocate is producing a meaningful share of word-of-mouth growth.'
        : 'Referral activity exists but no single advocate has broken out yet.',
      recommendation: n >= INS.TOP_REFERRER_MIN_SIGNUPS
        ? `Recognise and reward ${label}, and study what makes their outreach convert.`
        : 'Promote the referral programme so more owners and consumers start sharing codes.',
      metrics: [
        { label: 'Top referrer', value: `${label}` },
        { label: 'Signups driven', value: num(n) },
      ],
    });
  }

  if (marketing && marketing.total_shops > 0) {
    const listedPct = marketing.listed_share_pct;
    const tone = listedPct >= THRESHOLDS.LISTED_SHARE_HEALTHY_PCT ? 'positive' : 'watch';
    push({
      id: 'marketing_listing',
      domain: 'marketing',
      perm: 'shops:view',
      tone,
      title: 'Marketplace listing coverage',
      observation: `${num(marketing.listed_shops)} of ${num(marketing.total_shops)} shops are listed in the marketplace (${listedPct}%).`,
      interpretation: listedPct >= THRESHOLDS.LISTED_SHARE_HEALTHY_PCT
        ? 'A healthy share of shops are discoverable to consumers.'
        : 'Most shops are not listed, so consumer discovery is limited to a minority of the network.',
      recommendation: listedPct >= THRESHOLDS.LISTED_SHARE_HEALTHY_PCT
        ? 'Keep listing quality high and surface top listed shops to consumers.'
        : 'Nudge unlisted shops through the listing flow to widen consumer-facing supply.',
      metrics: [
        { label: 'Listed shops', value: num(marketing.listed_shops) },
        { label: 'Total shops', value: num(marketing.total_shops) },
        { label: 'Listed share', value: `${listedPct}%` },
      ],
    });
  }

  // ---- Growth (perm shops:view) — signup trend + activation ---------------
  if (growth && growth.wow && growth.wow.pct != null) {
    const { prev, last, pct } = growth.wow;
    const stalling = pct <= -THRESHOLDS.GROWTH_STALL_DROP_PCT && prev >= THRESHOLDS.GROWTH_STALL_MIN_PREV;
    const tone = stalling ? 'risk' : pct < 0 ? 'watch' : pct > 0 ? 'positive' : 'neutral';
    push({
      id: 'growth_signups',
      domain: 'growth',
      perm: 'shops:view',
      tone,
      title: 'Weekly signup trend',
      observation: `Combined shop + consumer signups moved from ${num(prev)} to ${num(last)} between the two most recent complete weeks (${movePhrase(pct)}).`,
      interpretation: stalling
        ? 'Signups fell sharply from a real base — growth is stalling week-over-week.'
        : pct < 0 ? 'Signups dipped versus the prior week; watch whether it is a blip or a trend.'
          : pct > 0 ? 'Signups grew versus the prior week — acquisition is trending up.'
            : 'Signups held flat versus the prior week.',
      recommendation: pct < 0
        ? 'Check each acquisition channel for the drop and revive the weakest one.'
        : 'Sustain the channels driving the gain and document what is working.',
      metrics: [
        { label: 'Prior week', value: num(prev) },
        { label: 'Last full week', value: num(last) },
        { label: 'Week over week', value: pct > 0 ? `+${pct}%` : `${pct}%` },
      ],
    });
  }

  if (growth && growth.activation && growth.activation.total_shops > 0) {
    const a = growth.activation;
    const orderPct = share(a.shops_with_order, a.total_shops);
    const tone = a.never_activated === 0 ? 'positive'
      : orderPct >= THRESHOLDS.ORDER_ACTIVATION_HEALTHY_PCT ? 'neutral' : 'watch';
    push({
      id: 'growth_activation',
      domain: 'growth',
      perm: 'shops:view',
      tone,
      title: 'Activation funnel',
      observation: `Of ${num(a.total_shops)} shops, ${num(a.shops_with_product)} added a product, ${num(a.shops_with_transaction)} recorded a transaction and ${num(a.shops_with_order)} received an order; ${num(a.never_activated)} never activated.`,
      interpretation: a.never_activated === 0
        ? 'Every shop has cleared the basic activation bar.'
        : `The funnel narrows to ${orderPct}% of shops receiving an order, and ${num(a.never_activated)} never activated at all.`,
      recommendation: a.never_activated === 0
        ? 'Focus on deepening usage rather than first activation.'
        : 'Target guided onboarding at the never-activated shops to move them into the funnel.',
      metrics: [
        { label: 'Registered', value: num(a.total_shops) },
        { label: 'With a product', value: num(a.shops_with_product) },
        { label: 'With an order', value: num(a.shops_with_order) },
        { label: 'Never activated', value: num(a.never_activated) },
      ],
    });
  }

  // ---- Finance ------------------------------------------------------------
  // Collection trend + MRR/plan mix come from the finance section (revenue:view).
  // The aging-skew block reads the network section (shops:view) but is tagged to
  // the finance domain — each block carries the perm of the data it came from,
  // exactly like insights.aging_risk.
  if (finance && finance.collection_trend && finance.collection_trend.current_pct != null) {
    const ct = finance.collection_trend;
    const cur = ct.current_pct;
    const prior = ct.prior_pct;
    const dropped = prior != null && (cur - prior) <= -THRESHOLDS.COLLECTION_TREND_DROP_PCT;
    const tone = cur < THRESHOLDS.COLLECTION_URGENT_PCT ? 'risk'
      : (cur < THRESHOLDS.COLLECTION_WARN_PCT || dropped) ? 'watch'
        : cur >= THRESHOLDS.COLLECTION_HEALTHY_PCT ? 'positive' : 'neutral';
    const trendText = prior == null ? 'with no comparable prior window'
      : `versus ${prior}% in the prior 30 days (${ct.delta > 0 ? '+' : ''}${ct.delta} points)`;
    push({
      id: 'finance_collection_trend',
      domain: 'finance',
      perm: 'revenue:view',
      tone,
      title: 'Collection-rate trend',
      observation: `Repayments cover ${cur}% of purchases over the last 30 days, ${trendText}.`,
      interpretation: cur < THRESHOLDS.COLLECTION_WARN_PCT
        ? 'Collection is running below a healthy rate — udhaar is outpacing repayment.'
        : dropped ? 'Collection is still reasonable but has slipped versus the prior window.'
          : cur >= THRESHOLDS.COLLECTION_HEALTHY_PCT ? 'Collection is strong — repayments are keeping pace with purchases.'
            : 'Collection is holding in a middling band.',
      recommendation: (cur < THRESHOLDS.COLLECTION_WARN_PCT || dropped)
        ? 'Push reminder tooling and follow-ups to lift the collection rate before dues age.'
        : 'Keep the reminder cadence steady to hold the collection rate.',
      metrics: [
        { label: 'This 30d', value: `${cur}%` },
        { label: 'Prior 30d', value: prior == null ? '—' : `${prior}%` },
        { label: 'Change', value: ct.delta == null ? '—' : `${ct.delta > 0 ? '+' : ''}${ct.delta} pts` },
      ],
    });
  }

  if (finance && finance.mrr_paise != null && finance.plan_counts) {
    const pc = finance.plan_counts;
    const tone = finance.paying_shops > 0 ? 'positive' : 'watch';
    push({
      id: 'finance_mrr_mix',
      domain: 'finance',
      perm: 'revenue:view',
      tone,
      title: 'Recurring revenue and plan mix',
      observation: `MRR is ${rupees(finance.mrr_paise)} from ${num(finance.paying_shops)} paying shops (${num(pc.pro)} Pro, ${num(pc.family)} Family, ${num(pc.free)} Free); ARPU ${rupees(finance.arpu_paise)}, annual run-rate ${rupees(finance.run_rate_paise)}.`,
      interpretation: finance.paying_shops > 0
        ? 'A paying base is established; the Free tier is the pool upgrades convert from.'
        : 'No shops are on a paid plan yet, so there is no recurring revenue to build on.',
      recommendation: finance.paying_shops > 0
        ? 'Segment high-usage Free shops for upgrade offers to grow ARPU.'
        : 'Stand up a first upgrade motion to convert active Free shops into paying plans.',
      metrics: [
        { label: 'MRR', value: rupees(finance.mrr_paise) },
        { label: 'ARPU', value: rupees(finance.arpu_paise) },
        { label: 'Run-rate', value: rupees(finance.run_rate_paise) },
        { label: 'Paying shops', value: num(finance.paying_shops) },
      ],
    });
  }

  if (network && network.outstanding_total_paise > 0 && network.aging) {
    const oldPaise = network.aging.b61_plus_paise || 0;
    const oldShare = share(oldPaise, network.outstanding_total_paise);
    const tone = oldShare >= THRESHOLDS.AGING_RISK_SHARE_PCT ? 'watch'
      : oldShare > 0 ? 'neutral' : 'positive';
    push({
      id: 'finance_aging_skew',
      domain: 'finance',
      perm: 'shops:view',
      tone,
      title: 'Outstanding aging skew',
      observation: `${rupees(network.outstanding_total_paise)} is outstanding across the network; ${rupees(oldPaise)} of it (${oldShare}%) sits in the 61+ day bucket.`,
      interpretation: oldShare >= THRESHOLDS.AGING_RISK_SHARE_PCT
        ? 'A large share of dues has aged past two months, where recovery gets materially harder.'
        : 'Most outstanding balances are still relatively fresh and collectible.',
      recommendation: oldShare >= THRESHOLDS.AGING_RISK_SHARE_PCT
        ? 'Prioritise follow-ups on the oldest bucket before it becomes bad debt.'
        : 'Keep working newer dues promptly so little ages into the 61+ bucket.',
      metrics: [
        { label: 'Outstanding', value: rupees(network.outstanding_total_paise) },
        { label: '61+ days', value: rupees(oldPaise) },
        { label: '61+ share', value: `${oldShare}%` },
      ],
    });
  }

  // ---- Research (perm shops:view) — catalogue adoption + selling model ----
  if (research && research.catalogue && research.catalogue.shops_with_products > 0) {
    const c = research.catalogue;
    const totalProducts = (c.base_linked_products || 0) + (c.custom_products || 0);
    const basePct = share(c.base_linked_products, totalProducts);
    const tone = basePct >= THRESHOLDS.BASE_ADOPTION_HEALTHY_PCT ? 'positive' : 'neutral';
    push({
      id: 'research_catalogue',
      domain: 'research',
      perm: 'shops:view',
      tone,
      title: 'Catalogue adoption',
      observation: `${num(c.shops_with_products)} shops have products; ${num(c.shops_using_base)} draw from the base catalogue. ${num(c.base_linked_products)} items are base-linked versus ${num(c.custom_products)} custom (${basePct}% base-linked).`,
      interpretation: basePct >= THRESHOLDS.BASE_ADOPTION_HEALTHY_PCT
        ? 'Shops lean on the shared base catalogue, which keeps product data consistent and searchable.'
        : 'Shops mostly enter custom products, so catalogue data is fragmented and harder to analyse.',
      recommendation: basePct >= THRESHOLDS.BASE_ADOPTION_HEALTHY_PCT
        ? 'Keep expanding the base catalogue so more custom entries can be absorbed.'
        : 'Improve base-catalogue coverage and search so shops reach for it before adding custom items.',
      metrics: [
        { label: 'Shops with products', value: num(c.shops_with_products) },
        { label: 'Base-linked items', value: num(c.base_linked_products) },
        { label: 'Custom items', value: num(c.custom_products) },
        { label: 'Base-linked share', value: `${basePct}%` },
      ],
    });
  }

  if (research && research.catalogue && ((research.catalogue.loose_products || 0) + (research.catalogue.unit_products || 0)) > 0) {
    const c = research.catalogue;
    const totalSell = (c.loose_products || 0) + (c.unit_products || 0);
    const loosePct = share(c.loose_products, totalSell);
    push({
      id: 'research_selling_model',
      domain: 'research',
      perm: 'shops:view',
      tone: 'neutral',
      title: 'Selling-model split',
      observation: `${num(c.loose_products)} products are sold by weight and ${num(c.unit_products)} by unit (${loosePct}% loose).`,
      interpretation: 'The loose-versus-unit split shows how much of the catalogue depends on weight-based pricing and scales.',
      recommendation: 'Match feature investment (scale integration vs unit pricing) to whichever model dominates the catalogue.',
      metrics: [
        { label: 'By weight', value: num(c.loose_products) },
        { label: 'By unit', value: num(c.unit_products) },
        { label: 'Loose share', value: `${loosePct}%` },
      ],
    });
  }

  // ---- Investor (perm revenue:view) — north-star + unit economics ---------
  if (investor) {
    const iv = investor;
    const gp = iv.growth_rate_pct;
    const tone = gp == null ? 'neutral'
      : gp <= -THRESHOLDS.GROWTH_STALL_DROP_PCT ? 'risk'
        : gp < 0 ? 'watch' : gp > 0 ? 'positive' : 'neutral';
    const growthText = gp == null ? 'no comparable prior period'
      : `${movePhrase(gp)} versus the prior 30 days`;
    push({
      id: 'investor_northstar',
      domain: 'investor',
      perm: 'revenue:view',
      tone,
      title: 'North-star growth',
      observation: `GMV was ${rupees(iv.gmv_30d_paise)} in the last 30 days (${rupees(iv.gmv_all_time_paise)} all-time). Signups were ${num(iv.signups_30d)} versus ${num(iv.signups_prior_30d)} prior — ${growthText}.`,
      interpretation: gp == null ? 'There is not yet a prior period to judge the growth trajectory against.'
        : gp > 0 ? 'Signup growth is positive period-over-period, supporting the GMV run-rate.'
          : gp <= -THRESHOLDS.GROWTH_STALL_DROP_PCT ? 'Signup growth has turned sharply negative — the top of the funnel is contracting.'
            : 'Signup growth softened versus the prior period.',
      recommendation: gp != null && gp < 0
        ? 'Diagnose the acquisition slowdown before the next fundraising or board update.'
        : 'Keep GMV and signup growth trending together and track them as the headline KPIs.',
      metrics: [
        { label: 'GMV (30d)', value: rupees(iv.gmv_30d_paise) },
        { label: 'GMV (all-time)', value: rupees(iv.gmv_all_time_paise) },
        { label: 'Signups (30d)', value: num(iv.signups_30d) },
        { label: 'Growth', value: gp == null ? '—' : (gp > 0 ? `+${gp}%` : `${gp}%`) },
      ],
    });

    const cr = iv.collection_rate_pct;
    const tone2 = cr == null ? 'neutral'
      : cr < THRESHOLDS.COLLECTION_URGENT_PCT ? 'risk'
        : cr < THRESHOLDS.COLLECTION_WARN_PCT ? 'watch'
          : cr >= THRESHOLDS.COLLECTION_HEALTHY_PCT ? 'positive' : 'neutral';
    push({
      id: 'investor_unit_economics',
      domain: 'investor',
      perm: 'revenue:view',
      tone: tone2,
      title: 'Unit economics and cash health',
      observation: `MRR is ${rupees(iv.mrr_paise)} (annual run-rate ${rupees(iv.run_rate_paise)}). Collection rate is ${cr == null ? 'not yet measurable' : `${cr}%`} against ${rupees(iv.outstanding_total_paise)} outstanding.`,
      interpretation: cr != null && cr < THRESHOLDS.COLLECTION_WARN_PCT
        ? 'Recurring revenue is building, but a low collection rate ties up cash in unpaid dues.'
        : 'Recurring revenue and collection are aligned, keeping working capital healthy.',
      recommendation: cr != null && cr < THRESHOLDS.COLLECTION_WARN_PCT
        ? 'Pair the revenue story with a plan to convert outstanding dues to cash.'
        : 'Hold collection discipline so run-rate growth converts cleanly to cash.',
      metrics: [
        { label: 'MRR', value: rupees(iv.mrr_paise) },
        { label: 'Run-rate', value: rupees(iv.run_rate_paise) },
        { label: 'Collection', value: cr == null ? '—' : `${cr}%` },
        { label: 'Outstanding', value: rupees(iv.outstanding_total_paise) },
      ],
    });

    if (iv.total_shops > 0) {
      const activePct = share(iv.active_shops_30d, iv.total_shops);
      const refPct = iv.referral_driven_pct;
      const tone3 = activePct >= THRESHOLDS.ACTIVE_RATIO_HEALTHY_PCT ? 'positive'
        : activePct >= THRESHOLDS.ACTIVE_RATIO_WATCH_PCT ? 'neutral' : 'watch';
      push({
        id: 'investor_engagement',
        domain: 'investor',
        perm: 'revenue:view',
        tone: tone3,
        title: 'Engagement and organic reach',
        observation: `${num(iv.active_shops_30d)} of ${num(iv.total_shops)} shops were active in the last 30 days (${activePct}%); ${refPct}% of all signups were referral-driven.`,
        interpretation: activePct >= THRESHOLDS.ACTIVE_RATIO_HEALTHY_PCT
          ? 'A strong active-shop ratio plus referral contribution points to durable, partly organic growth.'
          : 'A thin active-shop ratio means much of the installed base is dormant.',
        recommendation: refPct >= THRESHOLDS.REFERRAL_SHARE_HEALTHY_PCT
          ? 'Lean into the referral channel that is already contributing meaningful organic signups.'
          : 'Strengthen retention and the referral loop to lift the active ratio and organic share.',
        metrics: [
          { label: 'Active (30d)', value: num(iv.active_shops_30d) },
          { label: 'Active share', value: `${activePct}%` },
          { label: 'Referral-driven', value: `${refPct}%` },
        ],
      });
    }
  }

  // Deterministic order: by domain (fixed tab order), then most-concerning tone
  // first, then id — a fully stable result for identical inputs.
  out.sort((x, y) => {
    const d = DOMAIN_RANK[x.domain] - DOMAIN_RANK[y.domain];
    if (d !== 0) return d;
    const tr = TONE_RANK[x.tone] - TONE_RANK[y.tone];
    if (tr !== 0) return tr;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });

  return out;
}

module.exports = { buildCommentary, THRESHOLDS };
