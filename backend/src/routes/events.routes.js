const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/events.controller');

// PUBLIC, no auth. Anonymous product-event ingest.
//
// Rate limit: a LOOSER per-IP cap than the auth routes — a single page can emit
// several events (landing_view, get_app_click, register_start, ...) in one
// visit, and rural / NAT'd networks put many legitimate visitors behind one
// public IP. Defaults: 60s window, 60 requests/IP (env-tunable). Disabled under
// the test runner so the suite's many same-IP calls aren't throttled; production
// behaviour is unchanged.
const eventsLimiter = rateLimit({
  windowMs: Number(process.env.EVENTS_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.EVENTS_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/', eventsLimiter, asyncHandler(ctrl.ingest));

module.exports = router;
