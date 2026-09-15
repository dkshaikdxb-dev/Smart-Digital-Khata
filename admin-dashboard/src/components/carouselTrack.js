// Shared scroll arithmetic for the two consumer carousels — the discovery promo
// band (CpwaPromoSlider) and the storefront slider (ShopCarousel).
//
// THE BUG THIS EXISTS TO KILL. Both used to advance with
//
//     target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
//
// and scrollIntoView scrolls EVERY scrollable ancestor of the element, the
// document included. `block: 'nearest'` only minimises the vertical correction;
// it does not forbid one. So the moment a carousel had scrolled part-way out of
// view, its five-second auto-advance hauled the whole page back toward itself —
// a shopper reading down the shop list got yanked upward every five seconds.
//
// The replacement never asks an element to bring itself into view. It measures
// how far the wanted slide sits from the start of the track and writes the
// TRACK'S OWN scroll offset by that much, so nothing outside the track can move.
//
// RTL (Urdu): the measurement is taken from the INLINE-START edge — the left
// edge in LTR, the right edge in RTL — which is how the carousels' own onScroll
// handlers already decide which dot is active. It never assumes scrollLeft is
// positive or which end of its range it counts from; it only relies on the one
// thing every browser and every RTL convention agrees on, which is that adding
// to scrollLeft moves the viewport the same visual direction.

// Which way does this track run? Defensive about a missing getComputedStyle so
// the helper is safe in a non-browser render.
export function isRtlTrack(el) {
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) return false;
  try {
    return window.getComputedStyle(el).direction === 'rtl';
  } catch (e) {
    return false;
  }
}

// The index of the slide currently sitting at the track's inline start — the
// active dot. Direction-agnostic, same measurement as scrollTrackToSlide.
export function activeSlideIndex(el) {
  if (!el || !el.children || !el.children.length) return 0;
  const rtl = isRtlTrack(el);
  const trackRect = el.getBoundingClientRect();
  const edge = rtl ? trackRect.right : trackRect.left;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < el.children.length; i += 1) {
    const r = el.children[i].getBoundingClientRect();
    const dist = Math.abs((rtl ? r.right : r.left) - edge);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// Bring slide `i` to the track's inline start by moving ONLY the track.
export function scrollTrackToSlide(el, i) {
  if (!el || !el.children) return;
  const target = el.children[i];
  if (!target || typeof target.getBoundingClientRect !== 'function') return;
  const rtl = isRtlTrack(el);
  const trackRect = el.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const delta = rtl ? targetRect.right - trackRect.right : targetRect.left - trackRect.left;
  if (!delta) return;
  const left = el.scrollLeft + delta;
  if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: 'smooth' });
  else el.scrollLeft = left; // very old browsers: jump instead of glide
}
