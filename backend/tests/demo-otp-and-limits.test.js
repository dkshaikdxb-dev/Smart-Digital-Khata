// Batch H1 — env-gated demo-OTP reveal + configurable consumer auth rate limits.
// Requires a real Postgres (DATABASE_URL) with migrations 0001..0025 applied for
// the OTP/PIN regression block; the limiter block is a pure unit test that needs
// no DB. See the task notes for the throwaway-cluster one-liner.
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { makeCustomerAuthLimiter, authRateConfig } = require('../src/config/authRateLimit');

const uniq = Date.now().toString().slice(-9);
let seq = 0;
const nextPhone = () => `+9195${uniq}${String(seq++).padStart(2, '0')}`;
const trackedPhones = new Set();

// Run `fn` with a set of process.env overrides applied, restoring the prior
// values (including NODE_ENV) afterward no matter what. Lets a single test
// simulate production + a specific allowlist without leaking into the rest of
// the suite.
async function withEnv(overrides, fn) {
  const prior = {};
  for (const k of Object.keys(overrides)) {
    prior[k] = process.env[k];
    // An explicit `undefined` override means "unset this var" (so the code's
    // env-default kicks in) — assigning it would stringify to "undefined".
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(overrides)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  }
}

afterAll(async () => {
  for (const p of trackedPhones) {
    await pool.query('DELETE FROM customer_users WHERE phone = $1', [p]);
    await pool.query('DELETE FROM customer_otps WHERE phone = $1', [p]);
  }
  await pool.end();
});

describe('demo-OTP reveal (env-gated, off by default)', () => {
  it('reveals dev_code for an allow-listed number even under a production flag', async () => {
    const listed = nextPhone();
    trackedPhones.add(listed);

    const res = await withEnv(
      { NODE_ENV: 'production', DEMO_OTP_PHONES: listed },
      () => request(app).post('/api/customer-auth/request-otp').send({ phone: listed })
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dev_code).toMatch(/^[0-9]{6}$/);

    // Verification is UNCHANGED: the code is still stored only as a bcrypt hash,
    // and the revealed code actually verifies (proving nothing about the OTP
    // pipeline changed — we only echoed the already-random code back).
    const row = await pool.query('SELECT code_hash FROM customer_otps WHERE phone = $1', [listed]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].code_hash).not.toBe(res.body.dev_code);
    expect(row.rows[0].code_hash.startsWith('$2')).toBe(true);

    const verify = await request(app)
      .post('/api/customer-auth/verify-otp')
      .send({ phone: listed, code: res.body.dev_code });
    expect(verify.status).toBe(200);
    expect(typeof verify.body.token).toBe('string');
  });

  it('does NOT reveal dev_code for a number that is not on the allowlist (same prod flag)', async () => {
    const listed = nextPhone();
    const notListed = nextPhone();
    trackedPhones.add(listed);
    trackedPhones.add(notListed);

    const res = await withEnv(
      { NODE_ENV: 'production', DEMO_OTP_PHONES: listed },
      () => request(app).post('/api/customer-auth/request-otp').send({ phone: notListed })
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dev_code).toBeUndefined();

    // A code was still issued for the real user — only the reveal is withheld.
    const row = await pool.query('SELECT 1 FROM customer_otps WHERE phone = $1', [notListed]);
    expect(row.rowCount).toBe(1);
  });

  it('is OFF by default: empty/unset allowlist reveals nothing in production', async () => {
    const phone = nextPhone();
    trackedPhones.add(phone);

    const res = await withEnv(
      { NODE_ENV: 'production', DEMO_OTP_PHONES: '' },
      () => request(app).post('/api/customer-auth/request-otp').send({ phone })
    );
    expect(res.status).toBe(200);
    expect(res.body.dev_code).toBeUndefined();
  });

  it('the allowlist is E164-normalized, so a local-format entry still matches', async () => {
    const local = `9${uniq}`; // 10 digits (9 + 9-digit uniq) → +91...
    const e164 = `+91${local}`;
    trackedPhones.add(e164);

    const res = await withEnv(
      { NODE_ENV: 'production', DEMO_OTP_PHONES: local },
      () => request(app).post('/api/customer-auth/request-otp').send({ phone: e164 })
    );
    expect(res.status).toBe(200);
    expect(res.body.dev_code).toMatch(/^[0-9]{6}$/);
  });
});

describe('customer-auth limiter (env-configurable)', () => {
  // Mount the limiter on a throwaway express app so we can exercise the LIVE
  // limiter without re-enabling it for the whole suite. enforceInTest bypasses
  // the NODE_ENV=test skip for just this instance.
  function limiterApp(limiter) {
    const a = express();
    a.get('/ping', limiter, (_req, res) => res.json({ ok: true }));
    return a;
  }

  it('defaults: window 60000ms, max 20 when env is unset', async () => {
    await withEnv({ AUTH_RATE_WINDOW_MS: undefined, AUTH_RATE_MAX: undefined }, async () => {
      const cfg = authRateConfig();
      expect(cfg.windowMs).toBe(60000);
      expect(cfg.max).toBe(20);
    });
  });

  it('honors a low AUTH_RATE_MAX: the (max+1)th request from one IP is 429', async () => {
    await withEnv({ AUTH_RATE_MAX: '2', AUTH_RATE_WINDOW_MS: '60000' }, async () => {
      const a = limiterApp(makeCustomerAuthLimiter({ enforceInTest: true }));
      expect((await request(a).get('/ping')).status).toBe(200);
      expect((await request(a).get('/ping')).status).toBe(200);
      const third = await request(a).get('/ping');
      expect(third.status).toBe(429);
    });
  });

  it('is more generous with the default max: 6 rapid requests all pass', async () => {
    await withEnv({ AUTH_RATE_MAX: undefined, AUTH_RATE_WINDOW_MS: '60000' }, async () => {
      const a = limiterApp(makeCustomerAuthLimiter({ enforceInTest: true }));
      for (let i = 0; i < 6; i++) {
        // eslint-disable-next-line no-await-in-loop
        expect((await request(a).get('/ping')).status).toBe(200);
      }
    });
  });

  it('stays disabled under NODE_ENV=test without the enforce flag (suite is unthrottled)', async () => {
    await withEnv({ AUTH_RATE_MAX: '1' }, async () => {
      const a = limiterApp(makeCustomerAuthLimiter());
      // Well beyond max=1, yet nothing is throttled because skip() is active.
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        expect((await request(a).get('/ping')).status).toBe(200);
      }
    });
  });
});

describe('regression: normal OTP flow and PIN account-lock still hold', () => {
  it('request-otp (test mode) → verify-otp issues a token', async () => {
    const phone = nextPhone();
    trackedPhones.add(phone);
    const req = await request(app).post('/api/customer-auth/request-otp').send({ phone });
    expect(req.status).toBe(200);
    expect(req.body.dev_code).toMatch(/^[0-9]{6}$/);

    const wrong = req.body.dev_code === '000000' ? '111111' : '000000';
    const bad = await request(app).post('/api/customer-auth/verify-otp').send({ phone, code: wrong });
    expect(bad.status).toBe(401);

    const ok = await request(app).post('/api/customer-auth/verify-otp').send({ phone, code: req.body.dev_code });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
  });

  it('PIN account-lock: 5 wrong PINs lock the account; OTP recovery still works', async () => {
    const phone = nextPhone();
    trackedPhones.add(phone);

    // Establish the account + a PIN.
    const req = await request(app).post('/api/customer-auth/request-otp').send({ phone });
    const login = await request(app).post('/api/customer-auth/verify-otp').send({ phone, code: req.body.dev_code });
    const token = login.body.token;
    const set = await request(app).post('/api/customer-auth/pin/set')
      .set('Authorization', `Bearer ${token}`).send({ pin: '2468' });
    expect(set.status).toBe(200);

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post('/api/customer-auth/pin/login').send({ phone, pin: '9999' });
      expect([401, 429]).toContain(r.status);
    }
    // Locked — even the correct PIN is now 429 (per-account lock intact).
    const locked = await request(app).post('/api/customer-auth/pin/login').send({ phone, pin: '2468' });
    expect(locked.status).toBe(429);

    // OTP login remains the recovery path even while the PIN is locked.
    const rec = await request(app).post('/api/customer-auth/request-otp').send({ phone });
    const recLogin = await request(app).post('/api/customer-auth/verify-otp').send({ phone, code: rec.body.dev_code });
    expect(recLogin.status).toBe(200);
    expect(typeof recLogin.body.token).toBe('string');
  });
});
