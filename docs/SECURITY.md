# Security Posture

What protects this system, layer by layer, and what the operator must do to keep it that way.

> No system is "non-hackable". This document describes the defenses in place and the
> operational habits that keep the attack surface small.

## Network layer

| Control | Detail |
|---|---|
| Only 22, 80, 443 public | UFW configured by `bootstrap-vps.sh` |
| Docker ports bound to localhost | Postgres/Redis/backend/admin publish on `127.0.0.1` only — **Docker bypasses UFW**, so this binding is what actually keeps them private |
| Single public entry point | nginx reverse proxy; `server_tokens off` |
| Edge rate limiting | nginx `limit_req`: 10/min on `/api/auth/`, 300/min on `/api/` |
| TLS | Let's Encrypt via `setup-ssl.sh` or Nginx Proxy Manager; TLS 1.2/1.3 only; HSTS in SSL block |

## Application layer

| Control | Detail |
|---|---|
| Auth | JWT (HS256), 16+ char secret enforced at boot, 30-day expiry |
| Authorization | Role-gated admin routes; every shop query scoped by `shop_id` from the token (no cross-tenant reads) |
| Passwords | bcrypt 6.x, salt rounds 10; seed refuses weak/placeholder admin passwords |
| Brute-force | App-level 5/min/IP on login/register + nginx edge limit |
| Input validation | Joi schemas with `stripUnknown` on every mutating route |
| SQL injection | 100% parameterized queries; dynamic UPDATE keys come only from validated schemas |
| Race conditions | `SELECT … FOR UPDATE` row locks around balance changes |
| Webhooks | Razorpay HMAC verified with constant-time compare; Meta verify-token challenge; event-id dedupe table; malformed JSON → 400 |
| Headers | Helmet (app) + nosniff/frame-deny/referrer/permissions policies (nginx) |
| Body limits | 1 MB JSON cap |
| CORS | `ALLOWED_ORIGINS` allowlist in production |

## Supply chain

- Lockfiles committed; Docker builds use `npm ci` (exact versions only).
- `npm audit --omit=dev` is clean as of 2026-06-12. Re-check monthly:
  ```bash
  cd backend && npm audit --omit=dev
  ```
- Containers run as non-root (`nodejs` / `nextjs` users), multi-stage builds, `tini` PID 1.

## Operator responsibilities (the part no code can do for you)

1. **Secrets**: generate `JWT_SECRET` with `openssl rand -hex 32`; never reuse passwords; never commit `.env`.
2. **Updates**: `apt upgrade` monthly; redeploy after dependabot/audit fixes.
3. **SSH**: disable password login once your key works:
   ```bash
   sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
   systemctl restart sshd
   ```
4. **Backups**: nightly cron (see OPERATIONS.md A4) — an unrestorable system is the most common "hack".
5. **Razorpay**: keep test keys out of production `.env`; set the webhook secret to a fresh `openssl rand -hex 24`.
6. **Rotation**: if any secret leaks, rotate per OPERATIONS.md A5 — JWT rotation logs everyone out by design.

## Reporting a vulnerability

Open a private GitHub security advisory on this repository, or email the maintainer. Do not open public issues for exploitable bugs.
