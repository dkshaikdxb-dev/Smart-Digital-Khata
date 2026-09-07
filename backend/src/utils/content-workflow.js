// Content editorial state machine + the autonomy-tier human-approval gate — the
// SAFETY CORE of the content engine. This module is PURE and deterministic: no
// clock, no randomness, no DB. It answers two questions — "is this status move
// structurally legal?" (canTransition) and "does the tier gate permit entering
// this status?" (gateAllows) — and the API transition handler AND the publisher
// BOTH enforce it, so a Tier 1/2 item can NEVER be scheduled or published
// without a recorded human approval.

// The forward pipeline, in order. RANK[status] is its position on the chain.
const FORWARD = Object.freeze([
  'idea',       // 0 — a strategist brief or a fresh human idea
  'drafting',   // 1 — being written (by a human, or later an LLM draft agent)
  'draft',      // 2 — a draft exists
  'localized',  // 3 — translated into the target language(s)
  'in_review',  // 4 — sitting on the editor-in-chief's desk
  'approved',   // 5 — a human with content:manage signed off (the GATE)
  'scheduled',  // 6 — queued for the publisher at scheduled_at
  'published',  // 7 — sent through the channel adapter
]);

const RANK = Object.freeze(
  FORWARD.reduce((acc, s, i) => { acc[s] = i; return acc; }, {})
);

// Off-chain terminal-ish states reachable from most pre-publish states.
const REJECTED = 'rejected';
const ARCHIVED = 'archived';

const STATUSES = Object.freeze([...FORWARD, REJECTED, ARCHIVED]);

function isStatus(s) {
  return STATUSES.includes(s);
}

// Structural legality of a status move (independent of the tier gate):
//   - Forward along the chain, advancing by ONE or at most TWO ranks (skipping a
//     single logical step is allowed; skipping more than one is not).
//   - No regressions (a lower or equal rank on the chain is refused).
//   - `rejected` is reachable from any non-published pre-state.
//   - `archived` is reachable from any non-published state.
// The tier gate (gateAllows) is a SEPARATE, additional check the caller must
// also pass for 'approved'/'scheduled'/'published'.
function canTransition(from, to) {
  if (!isStatus(from) || !isStatus(to)) return false;
  if (from === to) return false;

  if (to === REJECTED) {
    // Any non-published pre-state can be rejected (not an already-terminal one).
    return from !== 'published' && from !== ARCHIVED && from !== REJECTED;
  }
  if (to === ARCHIVED) {
    // Any non-published state can be archived (including a rejected one).
    return from !== 'published' && from !== ARCHIVED;
  }
  // Moving BACK onto the chain from an off-chain state is not allowed.
  if (from === REJECTED || from === ARCHIVED) return false;

  const step = RANK[to] - RANK[from];
  return step >= 1 && step <= 2;
}

// requiresApproval(tier) — Tier 0 is evergreen/auto-safe; Tiers 1 and 2 need a
// human approval before they can be scheduled or published.
function requiresApproval(tier) {
  return Number(tier) !== 0;
}

// The TIER GATE. Given the target status, the item's tier, its recorded
// approved_at, and who is acting, decide whether the move may proceed. Returns
// { ok, reason }.
//   - Entering 'approved' is a HUMAN-ONLY act: the system/publisher can never
//     approve. (The route additionally requires content:manage and stamps
//     approved_by/approved_at — this function guards the actor kind.)
//   - Entering 'scheduled' or 'published' requires tier === 0 OR approved_at set.
// Every other transition passes the gate untouched.
function gateAllows({ to, tier, approvedAt, actorKind }) {
  if (to === 'approved') {
    if (actorKind !== 'human') {
      return { ok: false, reason: 'Approval requires a human editor' };
    }
    return { ok: true };
  }
  if (to === 'scheduled' || to === 'published') {
    const gated = requiresApproval(tier);
    if (gated && !approvedAt) {
      return { ok: false, reason: 'This tier requires human approval before it can be scheduled or published' };
    }
    return { ok: true };
  }
  return { ok: true };
}

module.exports = {
  FORWARD,
  RANK,
  STATUSES,
  REJECTED,
  ARCHIVED,
  isStatus,
  canTransition,
  requiresApproval,
  gateAllows,
};
