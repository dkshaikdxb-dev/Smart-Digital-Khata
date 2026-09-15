/**
 * The promo band must move ITSELF, never the page.
 *
 * CpwaPromoSlider auto-advances every five seconds. It used to do that with
 * `target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })`,
 * and scrollIntoView scrolls EVERY scrollable ancestor up to and including the
 * document. `block: 'nearest'` only minimises the vertical correction; it does
 * not forbid one, so once the band had scrolled part-way out of view the browser
 * dragged the whole shop list back toward it — every five seconds, while the
 * shopper was reading something else.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. jsdom implements no layout and no
 * scrolling at all: `element.scrollTop = 10` is a silent no-op there, and
 * `scrollIntoView` does not exist. So no test in this file can observe a real
 * browser scrolling an ancestor. What it does instead is install a recording
 * stand-in for every scroll API a browser would expose — Element#scrollIntoView
 * (whose stub moves a real, writable `document.documentElement.scrollTop`, the
 * way a browser would), window.scrollTo/scrollBy, and scroll-offset writes on
 * <html> and <body> — and then assert that an auto-advance touched none of
 * them, while the band's OWN scroll offset moved by exactly one slide.
 *
 * That is a proof about which API the component reaches for, not about pixels.
 * It is the right proof all the same: "scrolls an ancestor" is a property of
 * scrollIntoView itself, guaranteed by the spec, so a component that never calls
 * it and only writes its own container's offset cannot move the page.
 */
import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(),
    pathname: '/c/shops', route: '/c/shops', asPath: '/c/shops', isReady: true,
    query: {}, events: { on: jest.fn(), off: jest.fn() },
  }),
}));

jest.mock('../src/lib/customerApi', () => ({
  publicFetch: jest.fn(() => Promise.resolve({ promos: [] })),
}));

jest.mock('../src/lib/promoLink', () => ({
  fireBeacon: jest.fn(),
  followPromoLink: jest.fn(),
}));

const capi = require('../src/lib/customerApi');
const promoLink = require('../src/lib/promoLink');

import CpwaPromoSlider from '../src/components/CpwaPromoSlider';
import ShopCarousel from '../src/components/ShopCarousel';

const PROMOS = [
  { id: 'p1', style: 'offer', title: 'Ten rupees off atta', offer_text: '₹10 off', advertiser: 'Ramesh Stores' },
  { id: 'p2', style: 'shop', title: 'New shop in Bazaar Road', subtitle: 'Now delivering', advertiser: 'Gupta Kirana' },
  { id: 'p3', style: 'festival', title: 'Diwali hampers', offer_text: '20% off', advertiser: 'Sweet House' },
];

const SLIDE_W = 300;
const TRACK_W = 300;

// ------------------------------------------------------------------ scroll spy
//
// Every way a browser could move something OTHER than the band's own track,
// recorded rather than performed. `document.documentElement.scrollTop` is
// redefined as a genuinely writable property (jsdom's own is a no-op stub) so
// the scrollIntoView stand-in can move "the page" the way a real browser would
// and a test can see that it did.
let ancestorMoves;
let intoViewCalls;
let pageScrollTop;

function installScrollSpy() {
  ancestorMoves = [];
  intoViewCalls = [];
  pageScrollTop = 0;

  Element.prototype.scrollIntoView = jest.fn(function scrollIntoViewStub(opts) {
    intoViewCalls.push(opts);
    // What the real thing does, and the whole defect: it brings the element into
    // view by scrolling its scrollable ancestors, the document included.
    document.documentElement.scrollTop = 420;
    ancestorMoves.push('scrollIntoView');
  });

  Object.defineProperty(document.documentElement, 'scrollTop', {
    configurable: true,
    get: () => pageScrollTop,
    set: (v) => { pageScrollTop = v; },
  });

  window.scrollTo = jest.fn(() => { ancestorMoves.push('window.scrollTo'); });
  window.scrollBy = jest.fn(() => { ancestorMoves.push('window.scrollBy'); });
}

// -------------------------------------------------------------- fake geometry
//
// jsdom lays nothing out, so every rect is 0×0 and the component's inline-start
// arithmetic would be a no-op. These stubs give the track a real 300px viewport
// and three 300px slides whose positions follow the track's own scroll offset,
// so the arithmetic under test is actually exercised.
function instrumentTrack(track, { rtl = false } = {}) {
  const state = { scrollLeft: 0, scrollToCalls: [] };
  // The component asks the computed style which way the band runs, exactly as
  // its existing onScroll handler does; an inline style is enough for jsdom.
  if (rtl) track.style.direction = 'rtl';

  Object.defineProperty(track, 'scrollLeft', {
    configurable: true,
    get: () => state.scrollLeft,
    set: (v) => { state.scrollLeft = v; },
  });
  track.scrollTo = jest.fn((opts) => {
    state.scrollToCalls.push(opts);
    state.scrollLeft = typeof opts === 'object' ? opts.left : opts;
  });

  track.getBoundingClientRect = () => ({
    left: 0, right: TRACK_W, width: TRACK_W, top: 0, bottom: 120, height: 120, x: 0, y: 0,
  });
  Array.from(track.children).forEach((child, i) => {
    child.getBoundingClientRect = () => {
      if (rtl) {
        // Inline start is the RIGHT edge; later slides sit further left.
        const right = TRACK_W - i * SLIDE_W - state.scrollLeft;
        return { left: right - SLIDE_W, right, width: SLIDE_W, top: 0, bottom: 120, height: 120, x: right - SLIDE_W, y: 0 };
      }
      const left = i * SLIDE_W - state.scrollLeft;
      return { left, right: left + SLIDE_W, width: SLIDE_W, top: 0, bottom: 120, height: 120, x: left, y: 0 };
    };
  });

  return state;
}

// Anything the component did that was meant to move a slide into place —
// however it asked for it. Counting BOTH means an "it did not advance" test
// still fails against the scrollIntoView implementation instead of passing
// vacuously because that implementation never wrote scrollLeft.
const scrollAttempts = (state) => state.scrollToCalls.length + intoViewCalls.length;

function mockMatchMedia(allowMotion) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: query.includes('no-preference') ? allowMotion : !allowMotion,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

// A controllable IntersectionObserver. jsdom ships none, so the component's
// no-observer path is the default in the other tests; the off-screen test
// installs this one and drives it by hand.
function installIntersectionObserver() {
  const instances = [];
  class IO {
    constructor(cb, opts) {
      this.cb = cb;
      this.opts = opts || {};
      this.targets = [];
      instances.push(this);
    }

    observe(el) { this.targets.push(el); }

    unobserve(el) { this.targets = this.targets.filter((t) => t !== el); }

    disconnect() { this.targets = []; }

    emit(isIntersecting) {
      this.cb(this.targets.map((target) => ({ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 })), this);
    }
  }
  global.IntersectionObserver = IO;
  window.IntersectionObserver = IO;
  return instances;
}

async function mountSlider(opts = {}) {
  capi.publicFetch.mockResolvedValue({ promos: PROMOS });
  const view = render(<CpwaPromoSlider />);
  await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(PROMOS.length));
  const track = view.container.querySelector('.cpwa-promo-track');
  const state = instrumentTrack(track, opts);
  return { view, track, state };
}

beforeEach(() => {
  jest.useFakeTimers();
  installScrollSpy();
  mockMatchMedia(true);
  capi.publicFetch.mockReset();
  promoLink.fireBeacon.mockReset();
  promoLink.followPromoLink.mockReset();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  delete global.IntersectionObserver;
  delete window.IntersectionObserver;
  delete Element.prototype.scrollIntoView;
  delete document.documentElement.scrollTop;
});

describe('CpwaPromoSlider auto-advance', () => {
  // FAILS FIRST against the scrollIntoView implementation: the stub records a
  // call and moves documentElement.scrollTop to 420.
  test('an auto-advance moves only the band, never the page', async () => {
    const { state } = await mountSlider();

    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(document.documentElement.scrollTop).toBe(0);
    expect(ancestorMoves).toEqual([]);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
    // ...and it DID advance: the track's own offset is now one slide along.
    expect(state.scrollLeft).toBe(SLIDE_W);
    expect(state.scrollToCalls[0]).toMatchObject({ left: SLIDE_W, behavior: 'smooth' });
  });

  // FAILS FIRST: the old implementation never writes the track's offset, so the
  // RTL sign is not expressible at all — scrollLeft stays 0 instead of -300.
  test('in RTL the band advances toward the inline start, not scrollLeft-positive', async () => {
    const { state } = await mountSlider({ rtl: true });

    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(state.scrollLeft).toBe(-SLIDE_W);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  // FAILS FIRST: the old implementation calls scrollIntoView on every tick
  // regardless of whether the band is anywhere near the viewport.
  test('does not auto-advance while the band is off-screen, and resumes when it returns', async () => {
    const observers = installIntersectionObserver();
    const { view, state } = await mountSlider();
    const section = view.container.querySelector('.cpwa-promo');
    const visibility = observers.find((io) => io.targets.includes(section));
    expect(visibility).toBeTruthy();

    act(() => { visibility.emit(false); });
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(scrollAttempts(state)).toBe(0);

    act(() => { visibility.emit(true); });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(scrollAttempts(state)).toBeGreaterThan(0);
  });

  // FAILS FIRST: the old implementation yanks the slide out from under a finger
  // that is mid-swipe, because nothing tells the timer the shopper is busy.
  test('pauses while the shopper is touching the band and resumes after', async () => {
    const { view, state } = await mountSlider();
    const section = view.container.querySelector('.cpwa-promo');

    fireEvent.pointerDown(section);
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(scrollAttempts(state)).toBe(0);

    fireEvent.pointerUp(section);
    // Still inside the settle window — a shopper who has just let go is still
    // looking at what they swiped to.
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(scrollAttempts(state)).toBe(0);

    await act(async () => { jest.advanceTimersByTime(12000); });
    expect(scrollAttempts(state)).toBeGreaterThan(0);
  });

  // REGRESSION CONTROL (passes before and after): reduce-motion means no timer.
  test('never auto-advances when the viewer asked to reduce motion', async () => {
    mockMatchMedia(false);
    const { state } = await mountSlider();

    await act(async () => { jest.advanceTimersByTime(30000); });

    expect(scrollAttempts(state)).toBe(0);
    expect(document.documentElement.scrollTop).toBe(0);
  });

  // FAILS FIRST for the scrollTo half (the old dot used scrollIntoView); the
  // active-dot half is a regression control.
  test('the dots still drive the band and still track the active slide', async () => {
    const { state } = await mountSlider();
    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(dots[2]);
    expect(state.scrollLeft).toBe(2 * SLIDE_W);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    const track = document.querySelector('.cpwa-promo-track');
    fireEvent.scroll(track);
    await waitFor(() => expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true'));
  });

  // REGRESSION CONTROL: impression beacons are the revenue side of this band and
  // must survive the rewrite. With no IntersectionObserver (jsdom's default) the
  // component counts everything rendered as seen, exactly once.
  test('still fires one impression beacon per promo', async () => {
    await mountSlider();

    const impressions = promoLink.fireBeacon.mock.calls.filter(([, kind]) => kind === 'impression');
    expect(impressions.map(([id]) => id).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

/**
 * The storefront slider had the IDENTICAL defect, on a page that is even more
 * obviously scrollable: a shop's catalogue. Same timer, same scrollIntoView,
 * same five-second yank. It now shares the fix (components/carouselTrack.js).
 */
describe('ShopCarousel auto-advance', () => {
  const SLIDES = [
    { type: 'photo', url: '/uploads/a.jpg' },
    { type: 'photo', url: '/uploads/b.jpg' },
    { type: 'photo', url: '/uploads/c.jpg' },
  ];

  async function mountCarousel(opts = {}) {
    const view = render(<ShopCarousel slides={SLIDES} alt="Ramesh Stores" />);
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(SLIDES.length));
    const track = view.container.querySelector('.cpwa-shopcar-track');
    const state = instrumentTrack(track, opts);
    return { view, track, state };
  }

  // FAILS FIRST against the scrollIntoView implementation.
  test('an auto-advance moves only the slider, never the storefront page', async () => {
    const { state } = await mountCarousel();

    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(document.documentElement.scrollTop).toBe(0);
    expect(ancestorMoves).toEqual([]);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(state.scrollLeft).toBe(SLIDE_W);
  });

  // FAILS FIRST: the old onScroll measured the LEFT edge unconditionally, so in
  // RTL it lit the wrong dot, and the old scrollToSlide never moved the track.
  test('is direction-aware in RTL, for both the advance and the active dot', async () => {
    const { track, state } = await mountCarousel({ rtl: true });

    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(state.scrollLeft).toBe(-SLIDE_W);

    fireEvent.scroll(track);
    await waitFor(() => expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true'));
  });

  // FAILS FIRST: the old timer ticked regardless of a finger on the slider.
  test('pauses while the shopper is swiping it', async () => {
    const { view, state } = await mountCarousel();
    const wrap = view.container.querySelector('.cpwa-shopcar');

    fireEvent.pointerDown(wrap);
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(scrollAttempts(state)).toBe(0);

    fireEvent.pointerUp(wrap);
    await act(async () => { jest.advanceTimersByTime(12000); });
    expect(scrollAttempts(state)).toBeGreaterThan(0);
  });

  // FAILS FIRST: ditto for a slider scrolled off the top of a long catalogue.
  test('does not auto-advance while scrolled off the storefront', async () => {
    const observers = installIntersectionObserver();
    const { view, state } = await mountCarousel();
    const wrap = view.container.querySelector('.cpwa-shopcar');
    const visibility = observers.find((io) => io.targets.includes(wrap));
    expect(visibility).toBeTruthy();

    act(() => { visibility.emit(false); });
    await act(async () => { jest.advanceTimersByTime(20000); });
    expect(scrollAttempts(state)).toBe(0);
  });

  // REGRESSION CONTROL: reduce-motion still means no timer here either.
  test('never auto-advances when the viewer asked to reduce motion', async () => {
    mockMatchMedia(false);
    const { state } = await mountCarousel();

    await act(async () => { jest.advanceTimersByTime(30000); });

    expect(scrollAttempts(state)).toBe(0);
  });
});
