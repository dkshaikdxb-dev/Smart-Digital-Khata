// Shared order-status helper for the owner dashboard + customer PWA. This
// mirrors the BACKEND pipeline (order.controller.STATUS_RANK) exactly — keep the
// two in sync. The frontend never changes transitions; it only renders the
// stepper and offers the single next forward move the backend already allows.
//
// Pipeline: pending → accepted → preparing → ready → out_for_delivery →
// completed. `cancelled` is terminal and shown as its own state (not a stage).
// A PICKUP order skips out_for_delivery; a DELIVERY order includes it.

export const STATUS_PIPELINE = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
];

export const STATUS_RANK = STATUS_PIPELINE.reduce((acc, s, i) => {
  acc[s] = i;
  return acc;
}, {});

export const TERMINAL = new Set(['completed', 'cancelled']);

export function isPickup(fulfillmentType) {
  return fulfillmentType === 'pickup';
}

/**
 * The ordered stages to render for a given order. Pickup orders omit the
 * out_for_delivery stage; delivery orders include it. Cancelled orders are not
 * rendered as a pipeline (callers show a dedicated cancelled state instead).
 */
export function stepsForOrder(fulfillmentType) {
  return isPickup(fulfillmentType)
    ? STATUS_PIPELINE.filter((s) => s !== 'out_for_delivery')
    : STATUS_PIPELINE.slice();
}

/**
 * Index of the current status within the given steps. For a cancelled order,
 * returns -1 (no stage reached). Used to fill reached stages and highlight the
 * current one by rank — no per-status timestamps needed.
 */
export function currentStepIndex(status, steps) {
  return steps.indexOf(status);
}

/**
 * The single next forward status for an owner to advance to, respecting the
 * fulfillment type (pickup jumps ready → completed). Returns null when the order
 * is terminal or already complete. This is exactly one of the transitions the
 * backend PATCH /orders/:id/status accepts.
 */
export function nextStatus(order) {
  if (!order || TERMINAL.has(order.status)) return null;
  const steps = stepsForOrder(order.fulfillment_type);
  const i = steps.indexOf(order.status);
  if (i < 0 || i >= steps.length - 1) return null;
  return steps[i + 1];
}

/**
 * The i18n key ('ostatus.hint.*') for the one thing a customer is waiting for at
 * the current status. `ready` differs by fulfillment (ready for pickup vs
 * awaiting dispatch for delivery).
 */
export function waitingHintKey(order) {
  const status = order && order.status;
  if (status === 'ready') {
    return isPickup(order.fulfillment_type)
      ? 'ostatus.hint.ready_pickup'
      : 'ostatus.hint.ready_delivery';
  }
  return `ostatus.hint.${status}`;
}

// ---------------------------------------------------------------------------
// Purchase-order (B2B supply) status pipeline — Batch O2. Distinct from the
// consumer order pipeline above, this mirrors the BACKEND
// distributor.controller PO_RANK exactly: placed → confirmed → dispatched →
// delivered. 'cancelled' is terminal and only reachable from placed/confirmed.
// The stepper reuses the same .ord-stepper rendering; these helpers give the
// PO-specific stages, next forward move, and the cancel/terminal rules.
// ---------------------------------------------------------------------------

export const PO_PIPELINE = ['placed', 'confirmed', 'dispatched', 'delivered'];

export const PO_TERMINAL = new Set(['delivered', 'cancelled']);

/** Index of a PO status within the linear pipeline (-1 for cancelled). */
export function poStepIndex(status) {
  return PO_PIPELINE.indexOf(status);
}

/**
 * The single next forward PO status a distributor can advance to, or null when
 * the order is terminal. Exactly one of the transitions the backend PATCH
 * /distributor/orders/:id accepts.
 */
export function poNextStatus(status) {
  if (PO_TERMINAL.has(status)) return null;
  const i = PO_PIPELINE.indexOf(status);
  if (i < 0 || i >= PO_PIPELINE.length - 1) return null;
  return PO_PIPELINE[i + 1];
}

/** Whether a PO may still be cancelled (placed or confirmed only). */
export function poCanCancel(status) {
  return status === 'placed' || status === 'confirmed';
}
