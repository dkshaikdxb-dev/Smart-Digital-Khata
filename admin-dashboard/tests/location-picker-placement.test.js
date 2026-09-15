/**
 * The location picker's sheet must stay inside the viewport, and the chip that
 * opens it must be able to say what it is for.
 *
 * WHAT WENT WRONG. The sheet was placed entirely in CSS —
 * `position: absolute; inset-inline-end: 0; width: 240px` — which pins its end
 * edge to the trigger's end edge and grows it 240px the other way. The picker is
 * the first of three controls in a right-aligned topbar group, so on a 320px
 * phone the trigger's right edge lands near 170px and the sheet spanned about
 * -112px to 128px. "CHOOSE YOUR LOCATION" was photographed as "HOOSE YOUR
 * LOCATION" and Town / Village / Pincode as "own" / "illage" / "incode", with
 * everything left of zero unreachable. Separately the chip was capped at
 * `max-width: 116px`, one pixel under what "Set location" needs, and it sat in
 * the only shrinkable box in the topbar row, so it overflowed that box and the
 * theme toggle was painted over the end of the word.
 *
 * WHAT THESE TESTS CAN AND CANNOT PROVE. jsdom implements no layout: every
 * getBoundingClientRect() is a 0x0 rect at the origin, no stylesheet in
 * src/styles/globals.css is loaded, and scrollWidth and clientWidth are both
 * always 0. So NO test in this file can observe a real browser clipping a label
 * or hanging a sheet off the edge of a screen, and none of them claims to.
 *
 * What they do instead is split the fix in two and pin each half where it can
 * honestly be pinned:
 *
 *   1. The arithmetic (components/anchoredSheet.js) is pure — a rect and a
 *      viewport in, coordinates out — so it is tested exhaustively for real, at
 *      every width from 320px up and with the trigger swept across the whole
 *      viewport. "left >= margin and right <= viewportWidth - margin" is a true
 *      statement about the returned numbers, not a guess about pixels.
 *
 *   2. The component is tested for WIRING: that it measures its trigger, feeds
 *      the real viewport to that arithmetic, and writes the result to the
 *      sheet's inline style — where an inline style beats the stylesheet rule
 *      that caused the bug. jsdom does record inline styles faithfully, so this
 *      part is observable here.
 *
 * Geometry in a real browser is proved separately, by rendering the consumer
 * pages in Chromium at 320 / 360 / 400px, opening the picker and asserting the
 * sheet's bounding box against window.innerWidth. That is the evidence for the
 * pixels; this file is the regression net that runs in CI.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';

import CpwaLocationPicker from '../src/components/CpwaLocationPicker';
import {
  placeAnchoredSheet,
  PHONE_MAX_WIDTH,
  VIEWPORT_MARGIN,
  PREFERRED_WIDTH,
  MIN_VISIBLE_HEIGHT,
} from '../src/components/anchoredSheet';

const rect = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
});

describe('anchoredSheet placement arithmetic', () => {
  const WIDTHS = [320, 360, 400, 480, 560, 768, 1024, 1280];

  test('the sheet is inside the viewport wherever the trigger sits', () => {
    for (const vw of WIDTHS) {
      // Sweep the trigger across the whole viewport, including both extremes,
      // because the bug was a trigger position the CSS never considered.
      for (let triggerRight = 0; triggerRight <= vw; triggerRight += 4) {
        const placed = placeAnchoredSheet({
          anchorRect: rect(triggerRight - 34, 40, 34, 34),
          viewportWidth: vw,
          viewportHeight: 720,
        });
        const left = placed.left;
        const right = placed.left + placed.width;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(vw);
        // And inside the margins, which is the actual contract.
        expect(left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
        expect(right).toBeLessThanOrEqual(vw - VIEWPORT_MARGIN);
      }
    }
  });

  test('at phone widths it stops being a popover and spans the screen', () => {
    const placed = placeAnchoredSheet({
      anchorRect: rect(136, 40, 34, 34),
      viewportWidth: 320,
      viewportHeight: 720,
    });
    expect(placed.left).toBe(VIEWPORT_MARGIN);
    expect(placed.width).toBe(320 - VIEWPORT_MARGIN * 2);
    expect(placed.position).toBe('fixed');
  });

  test('above the phone breakpoint it is a popover, end-aligned to the trigger', () => {
    const vw = PHONE_MAX_WIDTH + 200;
    const placed = placeAnchoredSheet({
      anchorRect: rect(600, 40, 120, 34),
      viewportWidth: vw,
      viewportHeight: 900,
    });
    expect(placed.width).toBe(PREFERRED_WIDTH);
    // 720 (the trigger's right edge) - 240, and comfortably inside the viewport.
    expect(placed.left).toBe(720 - PREFERRED_WIDTH);
  });

  test('a trigger hard against the start edge pushes the sheet back in, not out', () => {
    const placed = placeAnchoredSheet({
      anchorRect: rect(0, 40, 34, 34),
      viewportWidth: 1024,
      viewportHeight: 720,
    });
    // End-aligning to a trigger at x=34 would put the sheet at -206.
    expect(placed.left).toBe(VIEWPORT_MARGIN);
  });

  test('it neutralises the logical end-anchor that caused the bug', () => {
    const placed = placeAnchoredSheet({
      anchorRect: rect(100, 40, 34, 34), viewportWidth: 400, viewportHeight: 720,
    });
    expect(placed.insetInlineEnd).toBe('auto');
    expect(placed.insetInlineStart).toBe('auto');
    expect(placed.right).toBe('auto');
    expect(placed.maxWidth).toBe('none');
    // The physical properties must be written AFTER the logical ones, or the
    // stylesheet's inset-inline-end would win in one of the two directions.
    const keys = Object.keys(placed);
    expect(keys.indexOf('left')).toBeGreaterThan(keys.indexOf('insetInlineEnd'));
  });

  test('nothing measurable still yields an on-screen placement', () => {
    const placed = placeAnchoredSheet({ anchorRect: null, viewportWidth: 320, viewportHeight: 720 });
    expect(placed.left).toBe(VIEWPORT_MARGIN);
    expect(placed.left + placed.width).toBeLessThanOrEqual(320);
  });

  test('the sheet is also bounded vertically', () => {
    const placed = placeAnchoredSheet({
      anchorRect: rect(100, 200, 34, 34), viewportWidth: 320, viewportHeight: 640,
    });
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(640);
    expect(placed.overflowY).toBe('auto');
  });

  test('a trigger low in a short window does not push the sheet off the bottom', () => {
    const placed = placeAnchoredSheet({
      anchorRect: rect(100, 600, 34, 34), viewportWidth: 320, viewportHeight: 640,
    });
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(640);
    expect(placed.maxHeight).toBeGreaterThanOrEqual(MIN_VISIBLE_HEIGHT);
  });
});

describe('CpwaLocationPicker — the sheet is placed from a measurement, not from CSS', () => {
  const realInnerWidth = window.innerWidth;
  const realInnerHeight = window.innerHeight;

  function setViewport(width, height) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
  }

  afterEach(() => {
    setViewport(realInnerWidth, realInnerHeight);
    window.localStorage.clear();
  });

  // jsdom hands out 0x0 rects, so the trigger is given the rect a real topbar
  // would give it: a right-aligned chip whose right edge is ~150px in. That is
  // exactly the position the old CSS turned into a sheet at left: -112px.
  function openWith({ width, triggerRight }) {
    setViewport(width, 720);
    const view = render(<CpwaLocationPicker />);
    const trigger = screen.getByRole('button', { name: /location/i });
    trigger.getBoundingClientRect = () => rect(triggerRight - 116, 40, 116, 34);
    act(() => { trigger.click(); });
    return { view, trigger, sheet: screen.getByRole('dialog') };
  }

  test.each([[320, 150], [360, 190], [400, 230]])(
    'at %ipx the sheet is positioned inside the viewport, not off its start edge',
    (width, triggerRight) => {
      const { sheet } = openWith({ width, triggerRight });
      expect(sheet.style.position).toBe('fixed');
      const left = parseFloat(sheet.style.left);
      const sheetWidth = parseFloat(sheet.style.width);
      expect(Number.isNaN(left)).toBe(false);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + sheetWidth).toBeLessThanOrEqual(width);
      // The stylesheet's logical end-anchor — the declaration that put the sheet
      // off the left edge — must be overridden. (`right: auto` is written too,
      // but jsdom's CSS parser drops `auto` on `right`, so only the arithmetic
      // test above can check that one.)
      expect(sheet.style.getPropertyValue('inset-inline-end')).toBe('auto');
    }
  );

  test('the placement follows the trigger and the viewport, not a constant', () => {
    const narrow = openWith({ width: 320, triggerRight: 150 });
    const narrowLeft = parseFloat(narrow.sheet.style.left);
    const narrowWidth = parseFloat(narrow.sheet.style.width);
    narrow.view.unmount();

    const wide = openWith({ width: 1280, triggerRight: 1200 });
    const wideLeft = parseFloat(wide.sheet.style.left);
    const wideWidth = parseFloat(wide.sheet.style.width);

    // Phone: full-bleed. Desktop: a 240px popover pulled back from the trigger.
    expect(narrowWidth).toBe(320 - VIEWPORT_MARGIN * 2);
    expect(narrowLeft).toBe(VIEWPORT_MARGIN);
    expect(wideWidth).toBe(PREFERRED_WIDTH);
    expect(wideLeft).toBe(1200 - PREFERRED_WIDTH);
  });

  test('a resize re-places the open sheet', () => {
    const { sheet } = openWith({ width: 1280, triggerRight: 1200 });
    expect(parseFloat(sheet.style.width)).toBe(PREFERRED_WIDTH);
    setViewport(320, 720);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(parseFloat(sheet.style.width)).toBe(320 - VIEWPORT_MARGIN * 2);
    expect(parseFloat(sheet.style.left)).toBe(VIEWPORT_MARGIN);
  });
});

describe('CpwaLocationPicker — the trigger is not capped below its own label', () => {
  test('the chip carries no fixed pixel cap; it is bounded by its container', () => {
    render(<CpwaLocationPicker />);
    const trigger = screen.getByRole('button', { name: /location/i });
    // The stylesheet's `max-width: 116px` is one pixel under what the English
    // label needs and narrower still than every translation of it. What replaces
    // it must be relative to the space available, never a pixel count: this
    // assertion fails both for the old cap and for any new magic number.
    expect(trigger.style.maxWidth).toBe('100%');
    expect(trigger.style.maxWidth).not.toMatch(/px$/);
  });

  test('the label is rendered whole into the DOM', () => {
    render(<CpwaLocationPicker />);
    const label = document.querySelector('.cpwa-loc-chip-label');
    // jsdom cannot tell us whether it FITS — that is what the Chromium run is
    // for — but it can tell us the component never shortens the string itself.
    expect(label.textContent).toBe('Set location');
  });
});
