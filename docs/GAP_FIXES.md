# Gap Fixes — Full Audit Summary

Three audit passes were run against this repository:

1. **Structural audit** — features vs. spec, deployment path for a non-coder.
2. **Wiring audit** — every `require`/`import` resolves, every route maps to a real controller/service, live boot test, Jest suite, Next.js production build, compose file validation.
3. **Security hardening audit** — dependency CVEs, network exposure, input validation, webhook abuse, secrets handling.

Verification evidence (all re-run after the final fix):

| Check | Result |
|---|---|
| `node -c` on every backend/admin/mobile JS file | ✅ 0 syntax errors |
| Route → controller → service wiring (grep cross-reference) | ✅ all resolve |
| Live boot + `GET /api/health` | ✅ 200 |
| Malformed webhook body | ✅ 400 (was 500) |
| Jest suite | ✅ pass |
| `next build` (9 routes incl. `/pay/[orderId]`) | ✅ pass |
| `docker compose config` | ✅ valid |
| `npm audit --omit=dev` (backend) | ✅ **0 vulnerabilities** |
| Mobile/admin import vs. dependency cross-check | ✅ no missing deps |

---

## Round 1 — Critical deployment blockers (commit `da26d1f`)

| ID | Gap | Fix |
|----|-----|-----|
| C1 | Bootstrap one-liner 404'd — `raw.githubusercontent.com` is case-sensitive and docs used `smart-digital-khata` instead of `Smart-Digital-Khata` | Corrected casing in README, docs, bootstrap script; made branch configurable |
| C2 | No `package-lock.json` anywhere — irreproducible builds, broken CI cache | Lockfiles committed for backend, admin, mobile; Dockerfiles switched to `npm ci` |
| C3 | CI failed: compose build needs `.env`; npm cache pointed at nonexistent lockfile | CI stubs `.env` from `.env.example`; uses `npm ci` |
| C4 | Payment link pointed at a page that didn't exist — headline feature dead | Switched to **Razorpay-hosted Payment Links API**; added `/pay/[orderId]` landing page; "Request payment via WhatsApp" form in dashboard |
| H1 | Mobile assets missing → `eas build` fails | Placeholder icon/splash/adaptive-icon/favicon committed |
| H2 | `expo-constants` imported but not declared | Added to mobile `package.json` |
| H4 | Daily reminder cron fired into a no-op | Worker now enumerates `active`-mode shops → enqueues per-customer reminder jobs with retry/backoff |
| H5 | CORS open to all origins with credentials | `ALLOWED_ORIGINS` env allowlist (blank = allow all, dev-friendly) |
| M1 | Missing env vars failed late at runtime | `validateEnv()` Joi schema fails fast at boot with a readable list |
| M2 | Duplicate customer phone → raw 500 | Caught unique violation → friendly 409 |
| M4 | Webhooks not deduplicated | `processed_events` table; both Razorpay + WhatsApp dedupe by event/message id |
| M5 | Webhook lookup column unindexed | Indexes on `provider_order_id`, `provider_link_id` |
| M7 | Admin Docker image shipped full `node_modules` | Next.js standalone output (~10× smaller) |
| M8 | No brute-force protection on login | 5/min/IP rate limit on `/api/auth/*` |
| L1/L4 | Empty `models/` dir; deploy.sh gave no success signal | Removed; deploy.sh tails last 20 backend log lines |

## Round 2 — Security hardening (this commit)

| ID | Gap | Fix |
|----|-----|-----|
| S1 | **Postgres (5432), Redis (6379), backend (4000), admin (3000) were publicly reachable** — Docker published ports bypass UFW by writing iptables rules directly, so the firewall did not protect them. Public Redis with no auth = remote code execution risk; public Postgres = brute-force target. | All four ports now bind to `127.0.0.1` only. Public traffic enters exclusively through nginx (80/443). Localhost binding keeps on-VPS debugging and local dev working. |
| S2 | Backend dependencies had 5 CVEs (high: `tar` via bcrypt's build chain; moderate: `joi` ReDoS-style RangeError, `uuid` buffer bounds) | Upgraded `bcrypt` → 6.x, `joi` → 18.x; removed unused `uuid` dependency entirely. `npm audit --omit=dev`: **0 vulnerabilities**. Hash/validate behaviour verified by test. |
| S3 | Malformed JSON to webhook endpoints crashed to a 500 (error-log noise, potential abuse signal) | `try/catch` → clean 400 on both Razorpay and WhatsApp webhooks |
| S4 | `POST /api/subscriptions/upgrade` accepted an unvalidated body | Joi schema: `plan ∈ {free, pro, family}` |
| S5 | `npm run seed` would happily create the admin with a placeholder/weak password | Seed refuses unless `ADMIN_PASSWORD` is set, ≥10 chars, and not a `CHANGE_ME` template value |
| S6 | nginx served with default config — version banner, no security headers, no edge rate limit | `server_tokens off`; `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` headers; `limit_req` zones — 10 req/min on `/api/auth/`, 300 req/min on `/api/` (defense-in-depth in front of the app-level limiter); HSTS in the SSL block template |
| S7 | Phone numbers passed to Razorpay/WhatsApp unnormalized — bare 10-digit numbers failed at the provider | `toE164()` / `toWaFormat()` helpers; Indian default country code; applied in WhatsApp sender and payment-link creation |
| S8 | Obsolete `version:` key in compose files (warning noise) | Removed; `docker compose config` is clean |

### Already in place from the original build (for completeness)

- All SQL uses parameterized queries (`$1, $2 …`) — no string concatenation anywhere; the dynamic `UPDATE` builders take **keys** only from Joi-validated, `stripUnknown: true` bodies.
- Razorpay webhook signature verified with `crypto.timingSafeEqual` (constant-time HMAC compare).
- JWT auth with role-based access (`admin` routes gated); every shop-scoped query filters by `shop_id` from the token, so one shop cannot read another's data (IDOR-safe).
- Passwords hashed with bcrypt; hash never leaves the DB layer.
- Helmet security headers at the app level; request body capped at 1 MB; `FOR UPDATE` row locks on balance updates prevent race-condition double-spends.
- Containers run as non-root users; multi-stage builds; `tini` as PID 1.
- `.env` git-ignored; `.env.example` contains only placeholders.

### Known, accepted MVP trade-offs (documented, not hidden)

| Item | Risk | Why accepted / mitigation |
|---|---|---|
| JWT stored in `localStorage` (admin) | XSS could steal a token | React escapes all output and no user HTML is rendered; revisit with httpOnly cookies post-MVP |
| Public `GET /api/payments/orders/:id/public` | Order status readable if the ID is known | IDs embed a UUID fragment + millisecond timestamp (not enumerable); response is minimal; nginx rate limit applies |
| Razorpay subscription billing is a manual flag | Owner could self-mark "pro" via API | Revenue feature, not security; real Razorpay subscriptions are the next milestone |
| No per-customer notification opt-out | Annoyed customers must ask the shop | Phase 2 feature |
