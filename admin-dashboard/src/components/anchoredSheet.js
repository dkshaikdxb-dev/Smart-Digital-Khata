// Placement arithmetic for a sheet that hangs off a trigger in the consumer
// topbar — today the location picker's Town/Village/Pincode sheet.
//
// THE BUG THIS EXISTS TO KILL. The sheet used to be placed entirely in CSS:
//
//     position: absolute; top: calc(100% + 8px); inset-inline-end: 0;
//     width: 240px; max-width: calc(100vw - 32px);
//
// which pins the sheet's END edge to the trigger's END edge and then grows it
// 240px back the other way. That is only safe when the trigger sits at least
// 240px in from the viewport's start edge. In the consumer topbar it does not:
// the picker is the FIRST of three controls in a right-aligned tools group, so
// on a 320px phone its right edge lands around 150px and the sheet spans roughly
// -90px to 150px. Everything left of zero is unreachable — which is why the
// heading photographed as "HOOSE YOUR LOCATION" and the field labels as "own",
// "illage", "incode". `max-width: calc(100vw - 32px)` cannot save it: it caps the
// WIDTH, and the sheet was never too wide, it was in the wrong place. A right-
// anchored popover is exactly how you end up off the LEFT edge.
//
// The replacement measures the trigger against the real viewport and returns
// coordinates that are inside it by construction, at any trigger position and
// any width from 320px up.
//
// Two shapes, because a popover is a desktop idea. Above the phone breakpoint it
// stays a popover: preferred width, end-aligned to the trigger, then CLAMPED so
// neither edge can cross the viewport's margins. At or below it the sheet stops
// pretending — there is no room to hang 240px off anything on a 320px screen, so
// it spans the full width between the margins and simply sits under the trigger.
//
// Everything is returned as physical `left` + `width`, with the logical
// `inset-inline-*` pair explicitly neutralised, so the result means the same
// thing in Urdu (RTL) as in Hindi. The logical keys come FIRST in the object:
// React writes inline styles in key order, and with both an `inset-inline-end`
// and a `left` in play the later declaration is the one that wins.

// Below this viewport width the sheet is not a popover any more (px).
export const PHONE_MAX_WIDTH = 560;
// Breathing room kept between the sheet and every viewport edge (px).
export const VIEWPORT_MARGIN = 8;
// The gap between the trigger and the sheet hanging under it (px).
export const ANCHOR_GAP = 8;
// What the popover would like to be when there is room for it (px).
export const PREFERRED_WIDTH = 240;
// However short the viewport, this much of the sheet stays on it (px). A trigger
// low in a short landscape window would otherwise put the sheet's top below the
// fold, with Save and Cancel somewhere nobody can reach.
export const MIN_VISIBLE_HEIGHT = 120;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Where to put a sheet hanging off `anchorRect`, in viewport coordinates.
 *
 * `anchorRect` is a DOMRect (or any {bottom,right} pair) from the trigger;
 * pass null when there is nothing to measure and the sheet is placed at the
 * start margin, which is still on-screen.
 *
 * The returned object is a React style object for a `position: fixed` element.
 * Fixed rather than absolute on purpose: absolute coordinates are relative to
 * the trigger's offset parent, so clamping against the viewport would mean
 * re-deriving the parent's own offset, and any future ancestor with `overflow:
 * hidden` would clip the sheet regardless. Fixed makes the viewport the frame of
 * reference, which is the frame the clamping is expressed in.
 */
export function placeAnchoredSheet({
  anchorRect,
  viewportWidth,
  viewportHeight,
  preferredWidth = PREFERRED_WIDTH,
  margin = VIEWPORT_MARGIN,
  gap = ANCHOR_GAP,
  phoneMaxWidth = PHONE_MAX_WIDTH,
} = {}) {
  const vw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 0;

  // The widest a sheet may ever be: the viewport less a margin at each end. On a
  // 320px phone that is 304px, which is why the 240px popover never needed to be
  // narrowed — only moved.
  const roomForWidth = Math.max(vw - margin * 2, 0);

  const phone = vw > 0 && vw <= phoneMaxWidth;
  const width = phone ? roomForWidth : Math.min(preferredWidth, roomForWidth);

  // End-aligned to the trigger, then clamped into [margin, vw - margin - width].
  // When the trigger sits near the start edge the clamp pushes the sheet back to
  // the start margin instead of letting it run off; near the end edge it pulls it
  // in. On a phone there is only one legal position anyway.
  const anchoredLeft = anchorRect ? anchorRect.right - width : margin;
  const left = phone || !anchorRect
    ? margin
    : clamp(anchoredLeft, margin, vw - margin - width);

  // Vertically the sheet hangs under the trigger, but never so far under it that
  // it falls off the bottom: on a short landscape window the top is pulled up
  // until at least MIN_VISIBLE_HEIGHT of sheet is on screen, and what is left is
  // handed to max-height so a tall sheet scrolls inside itself rather than
  // spilling past the edge.
  const wantedTop = anchorRect ? anchorRect.bottom + gap : margin;
  const top = vh > 0
    ? clamp(wantedTop, margin, Math.max(margin, vh - margin - MIN_VISIBLE_HEIGHT))
    : wantedTop;
  const maxHeight = vh > 0 ? Math.max(vh - top - margin, 0) : undefined;

  return {
    position: 'fixed',
    // Neutralise the stylesheet's logical end-anchor BEFORE the physical
    // properties below, so `left`/`right` are the last word in both directions.
    insetInlineStart: 'auto',
    insetInlineEnd: 'auto',
    left,
    right: 'auto',
    top,
    width,
    // The stylesheet's `max-width: calc(100vw - 32px)` would silently re-narrow
    // the sheet we just sized; the width above is already viewport-aware.
    maxWidth: 'none',
    maxHeight,
    overflowY: 'auto',
  };
}

/**
 * The placement used for the frame before anything has been measured (and on a
 * server render, where there is no viewport at all). It is deliberately not a
 * popover: pinned to the start margin, never wider than the viewport. Being
 * plainly on-screen matters more than being pretty for one frame.
 */
export const UNMEASURED_PLACEMENT = {
  position: 'fixed',
  insetInlineStart: 'auto',
  insetInlineEnd: 'auto',
  left: VIEWPORT_MARGIN,
  right: 'auto',
  top: VIEWPORT_MARGIN,
  width: 'auto',
  maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
};
