// The dashboard's contrast maths must agree with the backend's.
//
// src/lib/contrast.js exists because the Appearance panel has to say what a
// colour will read like while the operator types it, with no round trip. That
// makes two copies of one formula, and two copies drift — usually silently,
// usually in the direction where the panel says a colour is fine and the app
// disagrees.
//
// So this loads BOTH and compares them. Not "both look plausible": the same
// number, for the fixed points WCAG defines and for every colour this product
// actually ships or that an operator is likely to try.
const path = require('path');

const web = require('../src/lib/contrast.js');
const api = require(path.join(__dirname, '../../backend/src/utils/contrast.js'));

// What the apps actually paint, plus the shapes an operator types, plus the
// edges of the formula.
const COLOURS = [
  '#22c55e',   // the accent shipping today
  '#1C7A45', '#052e16', '#0f172a', '#1e293b', '#f1f5f9',  // the rest of the app palette
  '#000000', '#ffffff', '#777777', '#ff8800', '#0055ff',
  '#fefefe', '#010101', '#03a9f4', '#ffeb3b',
];

describe('the two copies of the contrast maths agree', () => {
  it('normalises the same inputs the same way', () => {
    for (const v of ['#22c55e', '22C55E', '#2c5', '  #ABC  ', '', 'green', '#12345', null, 42]) {
      expect(web.normalizeHex(v)).toBe(api.normalizeHex(v));
    }
  });

  it('computes the same luminance, to full double precision', () => {
    for (const c of COLOURS) {
      expect(web.luminance(c)).toBeCloseTo(api.luminance(c), 12);
    }
  });

  it('computes the same ratio for every pair of them', () => {
    for (const a of COLOURS) {
      for (const b of COLOURS) {
        expect(web.contrastRatio(a, b)).toBeCloseTo(api.contrastRatio(a, b), 12);
      }
    }
  });

  it('produces an identical report — the numbers AND the warnings', () => {
    for (const c of COLOURS) {
      expect(web.contrastReport(c)).toEqual(api.contrastReport(c));
    }
  });

  it('checks the accent against the same two colours', () => {
    expect(web.ON_ACCENT).toBe(api.ON_ACCENT);
    expect(web.APP_BG).toBe(api.APP_BG);
  });
});

describe('the maths itself, against values WCAG fixes', () => {
  it('black on white is 21:1, the defined maximum', () => {
    expect(web.contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('a colour against itself is 1:1', () => {
    expect(web.contrastRatio('#22c55e', '#22c55e')).toBeCloseTo(1, 5);
  });

  it('the order of the pair cannot matter', () => {
    expect(web.contrastRatio('#22c55e', '#0f172a'))
      .toBeCloseTo(web.contrastRatio('#0f172a', '#22c55e'), 12);
  });

  it('the accent shipping today clears AA in both places it lands', () => {
    const r = web.contrastReport('#22c55e');
    expect(r.on_accent.passes_aa).toBe(true);
    expect(r.on_app_bg.passes_aa).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('a value that is not a colour reports nothing rather than guessing', () => {
    expect(web.contrastReport('chartreuse')).toBeNull();
    expect(web.contrastRatio('#22c55e', 'nope')).toBeNull();
  });
});
