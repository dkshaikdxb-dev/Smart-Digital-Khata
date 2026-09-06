// Unit tests for the pure analyst-commentary engine (Batch P, utils/commentary).
// No database is needed: buildCommentary is a pure function over a sections
// fixture, exactly like the insights engine. These tests assert it is
// deterministic, permission-gated (blocks only ever come from sections the
// caller was given), well-formed (tone + O/I/R fields present) and that the
// interpretive thresholds fire on a known fixture for Finance + Growth +
// Investor.
const { buildCommentary, THRESHOLDS } = require('../src/utils/commentary');

// A rich, fully-permitted fixture mirroring the real section shapes the
// dashboard controller builds. Numbers are chosen so specific tones fire.
function fullSections() {
  return {
    overview: {
      total_shops: 100,
      active_shops_30d: 20, // 20% active → watch
      total_consumers: 200,
      consumers_never_ordered: 130, // 65% never ordered → watch
    },
    marketing: {
      source_channel_mix: [
        { channel: 'whatsapp', c: 80 }, // 80% of 100 → concentration watch
        { channel: 'field', c: 20 },
      ],
      top_referrers: [
        { code: 'ABC123', owner_type: 'influencer', label: 'Asha', referred_count: 9 },
      ],
      listed_shops: 30,
      total_shops: 100,
      listed_share_pct: 30, // < 50 → watch
    },
    growth: {
      wow: { prev: 40, last: 20, pct: -50 }, // sharp drop from a real base → risk
      activation: {
        total_shops: 100,
        shops_with_product: 70,
        shops_with_transaction: 55,
        shops_with_order: 30,
        never_activated: 25,
      },
    },
    network: {
      outstanding_total_paise: 1000000, // ₹10,000
      aging: {
        b0_30_paise: 300000,
        b31_60_paise: 200000,
        b61_plus_paise: 500000, // 50% of outstanding → aging watch
      },
    },
    finance: {
      plan_counts: { free: 90, pro: 8, family: 2 },
      mrr_paise: 8 * 29900 + 2 * 59900, // 359,000 paise
      paying_shops: 10,
      arpu_paise: Math.round((8 * 29900 + 2 * 59900) / 10),
      run_rate_paise: (8 * 29900 + 2 * 59900) * 12,
      collection_trend: { current_pct: 35, prior_pct: 70, delta: -35 }, // < urgent → risk
    },
    research: {
      catalogue: {
        shops_with_products: 60,
        shops_using_base: 45,
        base_linked_products: 300,
        custom_products: 100, // 75% base-linked → positive
        loose_products: 120,
        unit_products: 280,
      },
    },
    investor: {
      active_shops_30d: 20,
      total_shops: 100,
      total_consumers: 200,
      gmv_30d_paise: 5000000,
      gmv_all_time_paise: 40000000,
      mrr_paise: 359000,
      run_rate_paise: 359000 * 12,
      growth_rate_pct: -40, // sharp negative → risk
      signups_30d: 30,
      signups_prior_30d: 50,
      collection_rate_pct: 35, // < urgent → risk
      outstanding_total_paise: 1000000,
      referral_driven_signups: 60,
      referral_driven_pct: 20,
    },
  };
}

const byId = (blocks, id) => blocks.find((b) => b.id === id);

describe('buildCommentary — purity & determinism', () => {
  it('returns identical output for identical input (deep-equal, twice)', () => {
    const s = fullSections();
    const a = buildCommentary(s);
    const b = buildCommentary(s);
    expect(a).toEqual(b);
    // No randomness / no clock: JSON round-trips are byte-identical too.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('never throws on empty or partial sections and returns an array', () => {
    expect(buildCommentary({})).toEqual([]);
    expect(buildCommentary()).toEqual([]);
    expect(Array.isArray(buildCommentary({ overview: { total_shops: 0 } }))).toBe(true);
  });
});

describe('buildCommentary — well-formed blocks', () => {
  it('every block carries id/domain/perm/tone + O/I/R + metrics', () => {
    const blocks = buildCommentary(fullSections());
    expect(blocks.length).toBeGreaterThan(0);
    const DOMAINS = ['overview', 'marketing', 'growth', 'finance', 'research', 'investor'];
    const TONES = ['positive', 'neutral', 'watch', 'risk'];
    for (const b of blocks) {
      expect(typeof b.id).toBe('string');
      expect(DOMAINS).toContain(b.domain);
      expect(typeof b.perm).toBe('string');
      expect(TONES).toContain(b.tone);
      expect(typeof b.title).toBe('string');
      expect(b.title.length).toBeGreaterThan(0);
      expect(typeof b.observation).toBe('string');
      expect(typeof b.interpretation).toBe('string');
      expect(typeof b.recommendation).toBe('string');
      expect(Array.isArray(b.metrics)).toBe(true);
      for (const m of b.metrics) {
        expect(typeof m.label).toBe('string');
        expect(typeof m.value).toBe('string');
      }
    }
  });

  it('is grouped in the fixed domain order (overview→…→investor)', () => {
    const blocks = buildCommentary(fullSections());
    const rank = { overview: 0, marketing: 1, growth: 2, finance: 3, research: 4, investor: 5 };
    for (let i = 1; i < blocks.length; i++) {
      expect(rank[blocks[i - 1].domain]).toBeLessThanOrEqual(rank[blocks[i].domain]);
    }
  });
});

describe('buildCommentary — permission gating (no leak)', () => {
  it('builds no revenue:view block when the revenue-only sections are absent', () => {
    // Simulate a shops:view-only caller: the controller would omit finance +
    // investor + revenue sections entirely.
    const s = fullSections();
    delete s.finance;
    delete s.investor;
    const blocks = buildCommentary(s);
    // No block may carry a revenue:view perm.
    expect(blocks.some((b) => b.perm === 'revenue:view')).toBe(false);
    // The finance/investor money blocks specifically are gone.
    expect(byId(blocks, 'finance_collection_trend')).toBeUndefined();
    expect(byId(blocks, 'finance_mrr_mix')).toBeUndefined();
    expect(byId(blocks, 'investor_northstar')).toBeUndefined();
    // A revenue-only figure (MRR string ₹3,590) must not appear anywhere.
    const blob = JSON.stringify(blocks);
    expect(blob).not.toContain('3,590'); // rupees(359000)
    // The aging block (perm shops:view) is still present — its data came from a
    // permitted section, so it is not a leak.
    expect(byId(blocks, 'finance_aging_skew')).toBeDefined();
    expect(byId(blocks, 'finance_aging_skew').perm).toBe('shops:view');
  });

  it('builds nothing at all for a caller given no sections', () => {
    expect(buildCommentary({})).toEqual([]);
  });
});

describe('buildCommentary — interpretive thresholds fire (Finance + Growth + Investor)', () => {
  const blocks = buildCommentary(fullSections());

  it('Finance: a collection rate below the urgent floor is toned "risk"', () => {
    const b = byId(blocks, 'finance_collection_trend');
    expect(b).toBeDefined();
    expect(b.domain).toBe('finance');
    expect(b.perm).toBe('revenue:view');
    // 35% < COLLECTION_URGENT_PCT (40) → risk.
    expect(b.tone).toBe('risk');
    expect(b.observation).toContain('35%');
  });

  it('Finance: the aging block flags the 61+ share (50% ≥ AGING_RISK_SHARE_PCT)', () => {
    const b = byId(blocks, 'finance_aging_skew');
    expect(b).toBeDefined();
    expect(THRESHOLDS.AGING_RISK_SHARE_PCT).toBe(40);
    expect(b.tone).toBe('watch');
    expect(b.observation).toContain('50%');
    // Money is rendered as grouped rupees, not raw paise.
    expect(b.observation).toContain('₹10,000');
  });

  it('Growth: a sharp week-over-week drop from a real base is toned "risk"', () => {
    const b = byId(blocks, 'growth_signups');
    expect(b).toBeDefined();
    expect(b.domain).toBe('growth');
    // -50% ≤ -GROWTH_STALL_DROP_PCT (25) with prev 40 ≥ MIN_PREV → risk.
    expect(b.tone).toBe('risk');
    expect(b.metrics.find((m) => m.label === 'Week over week').value).toBe('-50%');
  });

  it('Investor: a sharply negative growth rate is toned "risk"', () => {
    const b = byId(blocks, 'investor_northstar');
    expect(b).toBeDefined();
    expect(b.perm).toBe('revenue:view');
    expect(b.tone).toBe('risk');
    // GMV shown as grouped rupees (₹50,000 = 5,000,000 paise).
    expect(b.observation).toContain('₹50,000');
  });

  it('Investor: unit-economics block reflects the low collection rate', () => {
    const b = byId(blocks, 'investor_unit_economics');
    expect(b).toBeDefined();
    expect(b.tone).toBe('risk'); // 35% < urgent
    expect(b.metrics.find((m) => m.label === 'MRR').value).toBe('₹3,590');
  });

  it('positive tones also fire (Research base adoption ≥ 50%)', () => {
    const b = byId(blocks, 'research_catalogue');
    expect(b).toBeDefined();
    expect(b.tone).toBe('positive'); // 75% base-linked
    expect(b.observation).toContain('75%');
  });
});
