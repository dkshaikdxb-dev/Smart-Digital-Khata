const rateLimit = require('express-rate-limit');

// Consumer (customer-auth) per-IP rate limiter — shared across request-otp,
// verify-otp, pin/login and change-number. The window and max are env-tunable
// with generous defaults because rural / NAT'd "village" connections put MANY
// legitimate users behind ONE public IP, so a tight per-IP cap throttles the
// whole group at once. Defaults: 60s window, 20 requests (raised from the old 5).
//
// SECURITY — why a higher per-IP cap is safe here: the REAL brute-force defenses
// are per-ACCOUNT, not per-IP, and are unchanged by this limiter:
//   * OTP is a single-use 6-digit random, bcrypt-hashed, replaced on each new
//     request, with a hard MAX_ATTEMPTS cap per issued code and consumed on
//     success (see customer-auth.controller: issueOtp / assertOtpValid).
//   * PIN login has a per-account lock — MAX_PIN_ATTEMPTS wrong tries trip a
//     PIN_LOCK_MS cool-off (Phase G), keyed to the account, not the IP.
// This limiter is only a coarse anti-flood guard; those account-level caps are
// the actual guarantee and MUST stay intact. Owner/admin login uses its own
// limiter (auth.routes) and is deliberately left untouched.
function authRateConfig() {
  return {
    windowMs: Number(process.env.AUTH_RATE_WINDOW_MS || 60_000),
    max: Number(process.env.AUTH_RATE_MAX || 20),
  };
}

// Build the customer-auth limiter. Reads AUTH_RATE_WINDOW_MS / AUTH_RATE_MAX at
// call time (env is fixed at boot in production). Disabled under the test runner
// (NODE_ENV=test) so the suite's many rapid same-IP calls aren't throttled — a
// focused test that must exercise the live limiter passes { enforceInTest: true }
// so it can assert the 429 without re-enabling the limiter for the whole suite.
function makeCustomerAuthLimiter(opts = {}) {
  const { windowMs, max } = authRateConfig();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again in a minute' },
    skip: () => process.env.NODE_ENV === 'test' && !opts.enforceInTest,
  });
}

module.exports = { makeCustomerAuthLimiter, authRateConfig };
