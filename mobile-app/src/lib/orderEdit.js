// EDIT THE ORDER WHILE ACCEPTING (batch C) — the RENDERING side of the one
// truth, for BOTH native flavors (owner and consumer). The web mirror is
// admin-dashboard/src/lib/orderEdit.js, with the same function names, so the
// four surfaces never word the same reduction differently.
//
// The backend's src/utils/orderEdit.js owns the RULE (what may change, what the
// fee becomes, what the money does). Nothing here re-decides any of that: this
// file only (a) keeps a local draft of the owner's taps so the running total is
// live before anything is sent, and (b) turns the server's `order.edits` audit
// rows into the words a person reads.
//
// REDUCTIONS ONLY is visible in the shape of this module: `decrement` and
// `removeLine` exist; there is no increment, and no caller can build a line
// above the quantity the order already has.
//
// PURE JAVASCRIPT ONLY — no import, no dependency, nothing native. This file
// ships in an over-the-air update, so it must not need a rebuild of the app.

/** Integer paise as rupees. Matches the backend's order-customer-copy.rupees(). */
export function money(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  return `₹${(n / 100).toFixed(2)}`;
}

/** The statuses at which an order may still be reduced — mirrors the API's 409. */
const EDITABLE = ['pending', 'accepted'];
export function isEditable(order) {
  return Boolean(order && EDITABLE.indexOf(order.status) !== -1);
}

/** A fresh draft: every line at the quantity it currently has. */
export function draftFrom(items) {
  const d = {};
  for (const it of items || []) d[it.id] = Number(it.quantity);
  return d;
}

/** One step down, never below zero. There is deliberately no counterpart up. */
export function decrement(draft, id) {
  const cur = Number(draft[id] || 0);
  return { ...draft, [id]: Math.max(0, cur - 1) };
}

/** Take the whole line off. */
export function removeLine(draft, id) {
  return { ...draft, [id]: 0 };
}

/** Undo the owner's taps on ONE line — back to what the order actually has. */
export function restoreLine(draft, items, id) {
  const it = (items || []).find((x) => String(x.id) === String(id));
  return { ...draft, [id]: it ? Number(it.quantity) : Number(draft[id] || 0) };
}

/**
 * The line total a draft quantity implies. A WEIGHED line (weight_grams set,
 * quantity fixed at 1) keeps its server-computed total while it survives — its
 * price came from the weight, not the quantity, so recomputing it from
 * unit_price (paise per KG) would be wrong by three orders of magnitude.
 */
export function lineTotalFor(item, qty) {
  const q = Number(qty);
  if (!q) return 0;
  if (item.weight_grams != null) return Number(item.line_total);
  return Number(item.unit_price) * q;
}

/**
 * Everything the edit UI needs from the current draft, in one pass:
 *   subtotal / wasSubtotal / reduction / changed / empty.
 * `empty` is the client-side twin of the API's 422 `cancel_instead`, so the
 * owner is told before the round trip, not after it.
 */
export function summarize(items, draft) {
  let subtotal = 0;
  let wasSubtotal = 0;
  const changed = [];
  let survivors = 0;
  for (const it of items || []) {
    const before = Number(it.quantity);
    const after = draft && draft[it.id] != null ? Number(draft[it.id]) : before;
    wasSubtotal += Number(it.line_total);
    subtotal += lineTotalFor(it, after);
    if (after > 0) survivors += 1;
    if (after !== before) changed.push({ id: it.id, name: it.name, before, after });
  }
  return {
    subtotal,
    wasSubtotal,
    reduction: Math.max(0, wasSubtotal - subtotal),
    changed,
    empty: Boolean(items && items.length && survivors === 0),
  };
}

/** The request body lines for PATCH /api/orders/:id/items — only what moved. */
export function linesPayload(changed) {
  return (changed || []).map((c) => ({ order_item_id: c.id, qty: c.after }));
}

/**
 * A v4-shaped idempotency key. MONEY-CRITICAL and offline-first: the owner app
 * is used on 2G, and the SAME key must survive a retry, so callers generate one
 * when edit mode OPENS and reuse it for every attempt at that one confirm.
 *
 * Built from Math.random on purpose. React Native has no global
 * crypto.getRandomValues without a native module, and adding one would mean a
 * new dependency and a rebuilt binary — which would break this batch's
 * over-the-air guarantee. The key only has to be unique among one owner's
 * in-flight edits of one order, and 122 random bits is far more than that needs.
 */
export function newRequestId() {
  const hex = [];
  for (let i = 0; i < 16; i += 1) {
    let b = Math.floor(Math.random() * 256);
    if (i === 6) b = (b & 0x0f) | 0x40; // version 4
    if (i === 8) b = (b & 0x3f) | 0x80; // variant 10
    hex.push(b.toString(16).padStart(2, '0'));
  }
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * One audit row as a sentence: "Dal 1kg — removed" / "Atta 1kg — 2 → 1".
 * `t` is the caller's translator, so the owner app and the consumer app use
 * their own (differently worded) key sets against the same data.
 */
export function editLineText(t, edit, keys) {
  const k = keys || { removed: 'oedit.historyRemoved', reduced: 'oedit.historyReduced' };
  return Number(edit.qty_after) === 0
    ? t(k.removed, { item: edit.name })
    : t(k.reduced, { item: edit.name, before: edit.qty_before, after: edit.qty_after });
}
