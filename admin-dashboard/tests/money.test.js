/**
 * R4 — one money helper, Indian digit grouping, integer paise in, no floats.
 *
 * ₹1,23,456 is how this audience reads a lakh. ₹123,456 is not, and five
 * different formatters meant most screens showed the wrong one.
 */
const fs = require('node:fs');
const path = require('node:path');

const {
  formatPaise, money, moneyAbs, moneyAuto, moneyRounded, rupeesNumber, spokenRupees,
} = require('../src/lib/money');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  }).filter((p) => p.endsWith('.js'));
}

describe('Indian digit grouping', () => {
  test('a lakh groups 1,23,456 — not 123,456', () => {
    expect(money(12345600)).toBe('₹1,23,456.00');
  });

  test('a crore groups 1,23,45,678', () => {
    expect(money(1234567800)).toBe('₹1,23,45,678.00');
  });

  test('below a thousand is ungrouped', () => {
    expect(money(45000)).toBe('₹450.00');
  });
});

describe('integer paise in, no floating point on the money path', () => {
  // 14,49,999.99 divided as a float and re-rendered is where .99 turns into
  // .98999999 — split the integer instead and the last paisa is always exact.
  test('the last paisa survives a large balance', () => {
    expect(money(144999999)).toBe('₹14,49,999.99');
  });

  test('every paise value from 0..99 renders itself back', () => {
    for (let p = 0; p < 100; p += 1) {
      expect(money(100000 + p)).toBe(`₹1,000.${String(p).padStart(2, '0')}`);
    }
  });

  test('a value beyond 2^31 paise still groups exactly', () => {
    expect(money(9876543210)).toBe('₹9,87,65,432.10');
  });
});

describe('sign', () => {
  test('a credit reads -₹50.00, never ₹-50.00', () => {
    expect(money(-5000)).toBe('-₹50.00');
  });

  test('moneyAbs drops the sign for callers that render the meaning in words', () => {
    expect(moneyAbs(-5000)).toBe('₹50.00');
    expect(moneyAbs(5000)).toBe('₹50.00');
  });

  test('zero has no sign', () => {
    expect(money(0)).toBe('₹0.00');
    expect(money(-0)).toBe('₹0.00');
  });
});

describe('presets', () => {
  test('moneyAuto drops .00 on a whole rupee and keeps real paise', () => {
    expect(moneyAuto(12345600)).toBe('₹1,23,456');
    expect(moneyAuto(12345650)).toBe('₹1,23,456.50');
  });

  test('moneyRounded is whole rupees for the KPI tiles', () => {
    expect(moneyRounded(12345649)).toBe('₹1,23,456');
    expect(moneyRounded(12345650)).toBe('₹1,23,457');
  });

  test('rupeesNumber is the grouped number with no symbol, for sentence templates', () => {
    expect(rupeesNumber(12345600)).toBe('1,23,456');
  });

  test('spokenRupees is ungrouped, because a screen reader reads commas aloud', () => {
    expect(spokenRupees(12345600)).toBe('123456');
    expect(spokenRupees(12345650)).toBe('123456.50');
  });
});

describe('junk in', () => {
  test.each([null, undefined, '', NaN, 'abc'])('%p renders as zero rather than ₹NaN', (v) => {
    expect(money(v)).toBe('₹0.00');
  });

  test('a numeric string is accepted (the API sends BIGINT columns as strings)', () => {
    expect(money('12345600')).toBe('₹1,23,456.00');
  });
});

describe('one helper, used everywhere', () => {
  const files = walk(SRC).filter((p) => !p.endsWith(path.join('lib', 'money.js')));

  test('no file outside lib/money.js builds a rupee string of its own', () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      // Strip comments: the prose in this repo quotes ₹ figures on purpose.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const lines = code.split('\n');
      lines.forEach((line, i) => {
        if (/₹\$\{/.test(line) || /`₹/.test(line)) {
          offenders.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test('no file divides paise by 100 to render it', () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      code.split('\n').forEach((line, i) => {
        if (/\/\s*100\s*\)\s*\.to(Fixed|LocaleString)/.test(line) || /format\(\s*[^)]*\/\s*100\s*\)/.test(line)) {
          offenders.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('formatPaise is the single implementation the presets build on', () => {
  test('options compose', () => {
    expect(formatPaise(-12345650, { absolute: true, decimals: 'auto', symbol: false })).toBe('1,23,456.50');
  });
});
