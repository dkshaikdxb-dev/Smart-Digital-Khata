/**
 * R2 — a shopkeeper must never read a machine string.
 *
 * "timeout of 15000ms exceeded", "HTTP 500", "Failed to fetch" and the
 * backend's own error codes ("shop_suspended") were the user-facing copy. Each
 * of the cases below is one a shopkeeper can act on differently, so a single
 * "something went wrong" for all of them is not a fix.
 */
const fs = require('node:fs');
const path = require('node:path');

const { friendlyError, canRetry, supportDetail, uiError } = require('../src/lib/errorText');
const { translate } = require('../src/lib/i18n');

const SRC = path.join(__dirname, '..', 'src');

const t = (key, vars) => translate('en', key, vars);

// A key that resolved to itself means it was never added to the en block.
const authored = (s) => typeof s === 'string' && s.length > 0 && !/^[a-z]+\.[A-Za-z.]+$/.test(s);

function netErr() {
  // What fetch() throws with no signal: a TypeError, no status at all.
  return new TypeError('Failed to fetch');
}
function httpErr(status, message, body) {
  const e = new Error(message || `HTTP ${status}`);
  e.status = status;
  e.body = body || {};
  return e;
}

describe('the five cases a shopkeeper can act on are distinct', () => {
  const cases = {
    offline: (() => { const e = netErr(); e.offline = true; return e; })(),
    timeout: (() => { const e = new Error('timeout of 15000ms exceeded'); e.timeout = true; return e; })(),
    signedOut: httpErr(401, 'jwt expired'),
    suspended: httpErr(403, 'shop_suspended', { error: 'shop_suspended', details: { code: 'shop_suspended' } }),
    server: httpErr(500, 'Internal server error'),
  };

  test('each maps to authored copy', () => {
    for (const [name, err] of Object.entries(cases)) {
      const s = friendlyError(t, err);
      expect([name, authored(s)]).toEqual([name, true]);
    }
  });

  test('no two of them read the same', () => {
    const seen = Object.values(cases).map((e) => friendlyError(t, e));
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('none of them leaks the raw message', () => {
    expect(friendlyError(t, cases.timeout)).not.toMatch(/15000ms/);
    expect(friendlyError(t, cases.signedOut)).not.toMatch(/jwt/i);
    expect(friendlyError(t, cases.suspended)).not.toMatch(/shop_suspended/);
    expect(friendlyError(t, cases.server)).not.toMatch(/Internal server error/);
    expect(friendlyError(t, netErr())).not.toMatch(/Failed to fetch/);
  });

  test('a suspended shop is not lumped in with a plain "not allowed"', () => {
    expect(friendlyError(t, cases.suspended)).not.toBe(friendlyError(t, httpErr(403, 'Forbidden')));
  });
});

describe('a rejected fetch with no status is a network problem, not a server bug', () => {
  test('bare TypeError reads as no-network', () => {
    expect(friendlyError(t, netErr())).toBe(t('err.offline'));
  });

  test('an axios-shaped timeout string is recognised even without a flag', () => {
    expect(friendlyError(t, new Error('timeout of 15000ms exceeded'))).toBe(t('err.slow'));
  });
});

describe('retry is only offered where retrying could work', () => {
  test.each([
    ['network', netErr(), true],
    ['timeout', (() => { const e = new Error('x'); e.timeout = true; return e; })(), true],
    ['500', httpErr(500), true],
    ['429', httpErr(429), true],
    ['401 signed out', httpErr(401), false],
    ['403 suspended', httpErr(403, 'shop_suspended', { details: { code: 'shop_suspended' } }), false],
    ['404', httpErr(404), false],
  ])('%s', (_name, err, expected) => {
    expect(canRetry(err)).toBe(expected);
  });
});

describe('the technical detail stays reachable for support', () => {
  test('it is available separately, and is not the headline', () => {
    const err = httpErr(500, 'Internal server error');
    err.requestPath = '/api/customers';
    const detail = supportDetail(err);
    expect(detail).toMatch(/500/);
    expect(friendlyError(t, err)).not.toContain(detail);
  });

  test('a network failure still yields something a support agent can read', () => {
    expect(supportDetail(netErr())).toBeTruthy();
  });
});

describe('the sign-in screen is its own case', () => {
  const { signInError } = require('../src/lib/errorText');

  test('a rejected password does NOT read "you have been signed out"', () => {
    const s = signInError(t, httpErr(401, 'Invalid credentials'));
    expect(s).not.toBe(t('err.signedOut'));
    expect(authored(s)).toBe(true);
    expect(s).not.toMatch(/Invalid credentials/);
  });

  test('a stopped account is told it is stopped, not "you cannot open this"', () => {
    const s = signInError(t, httpErr(403, 'This account is suspended. Please contact support.'));
    expect(s).not.toBe(t('err.notAllowed'));
    expect(authored(s)).toBe(true);
  });

  test('everything else on the sign-in screen maps as usual', () => {
    expect(signInError(t, httpErr(500))).toBe(t('err.server'));
    expect(signInError(t, netErr())).toBe(t('err.offline'));
  });
});

describe('uiError is the one call a screen makes', () => {
  test('it returns the sentence AND puts the real thing in the console', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = httpErr(500, 'Internal server error');
    err.requestPath = '/api/customers';
    expect(uiError(t, err, 'customers')).toBe(t('err.server'));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0].join(' ')).toContain('/api/customers');
    spy.mockRestore();
  });

  test('a sentence a human wrote for that exact case is handed through', () => {
    const dead = new Error('This khata link is invalid or has been replaced by the shop.');
    dead.userMessage = dead.message;
    expect(friendlyError(t, dead)).toBe(dead.message);
  });
});

describe('no shopkeeper- or shopper-facing screen still prints err.message', () => {
  // The platform-admin console under src/pages/admin/** is deliberately exempt:
  // its reader is the operator who IS support, and the raw server string is the
  // useful signal there. Everything a shop or a shopper can open is not.
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    }).filter((p) => p.endsWith('.js'));
  }

  const files = walk(SRC).filter((p) => {
    const r = path.relative(SRC, p);
    if (r.startsWith(path.join('pages', 'admin'))) return false;
    if (r === path.join('lib', 'errorText.js')) return false;
    return true;
  });

  test('nothing renders a raw transport or server message', () => {
    const offenders = [];
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      code.split('\n').forEach((line, i) => {
        // set*(x.message) / {err.message} / `${e.message}` — anything putting a
        // caught error's own text into state or into the tree.
        if (/set[A-Za-z]*\(\s*[A-Za-z_$][\w$]*\.message\b/.test(line)
            || /\{\s*[A-Za-z_$][\w$]*Err(or)?\.message\s*\}/.test(line)) {
          offenders.push(`${path.relative(SRC, f)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('every key this module asks for exists in the English dictionary', () => {
  const keys = [
    'err.offline', 'err.slow', 'err.server', 'err.signedOut', 'err.suspended',
    'err.notAllowed', 'err.notFound', 'err.tooMany', 'err.badRequest',
    'err.conflict', 'err.generic',
  ];
  test.each(keys)('%s', (k) => {
    expect(translate('en', k)).not.toBe(k);
  });
});
