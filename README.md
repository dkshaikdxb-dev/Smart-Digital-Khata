# Smart Digital Khata

**Smart Digital Khata with Family Payment & Local Commerce Readiness**

A production-ready SaaS platform that helps kirana (local) store owners manage credit ledgers, collect payments faster via WhatsApp + Razorpay, and prepares them for local commerce.

> **Phase 1 goal:** Get your kirana dues paid faster — without calling customers.
> **Phase 2 goal:** Enable local commerce between customers and kiranas.

---

## Table of Contents

1. [Features](#features)
2. [Project Structure](#project-structure)
3. [Quick Start (Non-Coder)](#quick-start-non-coder)
4. [Local Development](#local-development)
5. [Deployment to Hostinger VPS](#deployment-to-hostinger-vps)
6. [Domain + SSL](#domain--ssl)
7. [GitHub Auto-Deploy](#github-auto-deploy)
8. [Mobile App](#mobile-app)
9. [Environment Variables](#environment-variables)
10. [Troubleshooting](#troubleshooting)

---

## Features

### Phase 1 — Khata & collections (shipped)

- **WhatsApp transaction system** — record purchases & payments via WhatsApp inbound webhook; auto-send ledger updates and reminders.
- **Ledger** — purchase / cash / UPI tracking per customer per shop; money stored as integer paise everywhere.
- **Notification modes** — `silent` (no reminders) / `smart` (weekly, respectful) / `active` (daily), plus the owner's daily "Aaj ka hisaab" digest.
- **Payment integration** — Razorpay payment links + HMAC-verified webhooks; recurring Pro/Family subscriptions.
- **Credit limit system** — per-customer credit limit with soft & hard blocks.
- **Families** — shared family credit line with per-member sub-limits.
- **Summary engine** — end-of-day, weekly & monthly summaries per shop.
- **Subscription system** — Free / Pro ₹299 / Family ₹599 per month with Razorpay subscriptions.
- **Admin dashboard** — Next.js dashboard for shop owners; platform Admin console.
- **Mobile app** — Expo React Native app for shopkeepers on Android/iOS.

### Phase 2 — Local commerce (shipped)

- **Shop discovery** — public directory of opted-in shops with city/search filters and nearest-first ranking (lat/lng). Consumers need no app — they browse at `/c/shop/<id>`, build a cart, order, and view their own khata.
- **Orders & fulfillment** — item-snapshot orders with pickup-only / free-delivery / charged-delivery rules (min-order, distance radius, delivery hours); order total = subtotal + delivery fee. The owner gets an alert on every new order.
- **Payment modes per order** — **on khata** (credit) / **pay online** (Razorpay link) / **pay cash** (settled on hand-over; marked paid when the owner completes the order).
- **Master catalogue** — 1,615 shared base SKUs (category / subcategory / product / brand / pack / unit / indicative price). Owners "Add from catalogue" at their own price; custom items join the base.
- **Variants** — base SKUs group by product into brand × pack variants; variant cards for consumers, and a bulk "Add selected" with per-size price inputs for owners.
- **Local-language catalogue** — the grocery vocabulary is translated into Hindi, Tamil, Telugu, Kannada, Malayalam & Urdu; catalogue browse and multilingual search match the local name, English, or a romanized alias (English keys stay the filter values).
- **Loose / weighed selling** — per-KG pricing with a 250 g / 500 g / 1 kg + custom weight picker; weighed lines are recomputed server-side (client price never trusted).
- **Product images** — upload with an emoji-tile fallback.
- **Shop-QR sharing** — a "Share your shop" card with a QR to the consumer link plus Copy / Print.

### Staff & access

- **Staff accounts** — owner-managed additional logins scoped to the shop, with an active/inactive gate. Login is phone-or-email + password for owner / staff / admin.

### Offline, 2G & accessibility

- **Offline / 2G resilience** — khata writes carry a client request id and replay idempotently (no double-debit); an IndexedDB outbox queues entries while offline and syncs on reconnect, with an app-wide offline banner and pending count.
- **PWA** — service-worker app-shell cache + API read-cache, offline page, and separate customer / owner manifests.
- **Voice** — Web Speech voice search on catalogues, read-aloud customer balance, and voice-to-amount on khata entry (hidden where unsupported).
- **Data-saver mode** — a per-device toggle that suppresses product image fetches to save 2G bytes.
- **UI languages** — en, hi, ta, te, kn, ml, ur (Urdu is RTL), with a first-visit language gate on the consumer app and admin-editable translation overrides.

---

## Project Structure

```
Smart-Digital-Khata/
├── backend/              # Node.js + Express + PostgreSQL API
├── mobile-app/           # Expo React Native app
├── admin-dashboard/      # Next.js admin dashboard
├── docker/               # Nginx config, init SQL, utilities
├── scripts/              # deploy.sh, backup.sh, bootstrap-vps.sh
├── .github/workflows/    # CI/CD (auto-deploy to VPS)
├── docker-compose.yml    # Spins up backend + postgres + redis + nginx
├── .env.example          # Copy to .env and fill in
└── docs/                 # Additional deployment docs
```

---

## Quick Start (Non-Coder)

> You need: a Hostinger VPS (KVM), a domain name, and a GitHub account.

### 1. Get a VPS

Buy any Hostinger **KVM VPS** plan (KVM 1 is enough to start). Choose **Ubuntu 22.04**.

### 2. One-Command VPS Bootstrap

SSH into your VPS (Hostinger gives you the IP and root password):

```bash
ssh root@YOUR_VPS_IP
```

Run the bootstrap script — this installs Docker, Docker Compose, git, ufw, and clones this repo:

```bash
curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/Smart-Digital-Khata/main/scripts/bootstrap-vps.sh | bash
```

### 3. Configure `.env`

```bash
cd /opt/Smart-Digital-Khata
cp .env.example .env
nano .env   # fill in the values (see Environment Variables section)
```

### 4. Start Everything

```bash
./scripts/deploy.sh
```

That's it. Visit `http://YOUR_VPS_IP` — nginx serves the admin dashboard at `/` and the API at `/api/`. (Direct ports 3000/4000 are bound to localhost only for security; everything public goes through nginx.)

### 5. Point Your Domain

See [Domain + SSL](#domain--ssl).

---

## Local Development

> Canonical dev environment: **WSL2 Ubuntu (on Windows) or any Linux/macOS shell + Docker Compose**.
> Full guide incl. Windows/WSL2 setup: [`docs/LOCAL_TESTING.md`](docs/LOCAL_TESTING.md).

```bash
# 1. Clone (inside WSL2's ~/ on Windows, not /mnt/c)
git clone https://github.com/dkshaikdxb-dev/Smart-Digital-Khata.git
cd Smart-Digital-Khata

# 2. Environment
cp .env.example .env

# 3a. Development mode — hot reload, isolated dev stack (ports 8080/14000/...)
./scripts/dev.sh
./scripts/dev.sh exec backend npm run migrate

# 3b. OR production-like mode — exactly what the VPS runs
docker compose up -d --build
./scripts/migrate.sh
docker compose exec backend npm run seed

# 4. Verify
./scripts/health-check.sh
```

**Database migrations** live in `backend/migrations/` (`0001` … `0020`) and are applied by
`npm run migrate` (or `./scripts/migrate.sh`); each is additive and idempotent, so re-running
is safe.

**Seeding & catalogue import** (run inside the backend container / directory):

| Script | What it loads |
| ------ | ------------- |
| `npm run seed` / `npm run seed:demo` | Base demo shop, customers and transactions |
| `npm run import:catalog` | 1,615 shared master-catalogue base SKUs |
| `npm run import:catalog-i18n` | ~1,042 local-language catalogue translations (hi/ta/te/kn/ml/ur) |
| `npm run seed:commerce` | ~50 bilingual demo products + variants, lists a demo shop, prints a consumer link |

Dev and prod-like stacks use separate Docker project names
(`smart-digital-khata-dev` / `smart-digital-khata`), so they never share
containers, volumes, networks, or ports — with each other or with any other
project on your machine. All host ports are overridable in `.env`.

Services:

| Service          | URL                      |
| ---------------- | ------------------------ |
| Backend API      | http://localhost:4000    |
| Admin Dashboard  | http://localhost:3000    |
| Postgres         | localhost:5432           |
| Redis            | localhost:6379           |

---

## Deployment to Hostinger VPS

Full step-by-step guide: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

TL;DR:

```bash
ssh root@YOUR_VPS_IP
cd /opt/Smart-Digital-Khata
git pull
./scripts/deploy.sh
```

---

## Domain + SSL

Two options — pick one. Full guide: [`docs/SSL.md`](docs/SSL.md).

### Option A: Certbot (simplest)

```bash
./scripts/setup-ssl.sh yourdomain.com your@email.com
```

### Option B: Nginx Proxy Manager (UI-based, no command line)

```bash
docker compose -f docker-compose.npm.yml up -d
```

Then open `http://YOUR_VPS_IP:81` and add your domain + SSL via the UI.

---

## GitHub Auto-Deploy

Every `git push` to `main` auto-deploys to your VPS.

1. In GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `VPS_HOST` — your VPS IP
   - `VPS_USER` — usually `root`
   - `VPS_SSH_KEY` — private SSH key (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md))
   - `VPS_PATH` — usually `/opt/Smart-Digital-Khata`

2. Push to `main`. Done.

Workflow file: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

---

## Mobile App

```bash
cd mobile-app
npm install
npx expo start            # dev
npx eas build -p android  # production Android build (APK/AAB)
npx eas build -p ios      # production iOS build (needs Apple Developer)
```

Full guide: [`mobile-app/README.md`](mobile-app/README.md).

---

## Environment Variables

Copy `.env.example` → `.env` and fill in:

| Variable                   | What it is                                            |
| -------------------------- | ----------------------------------------------------- |
| `POSTGRES_PASSWORD`        | Choose any strong password                            |
| `JWT_SECRET`               | Random string, 32+ chars                              |
| `RAZORPAY_KEY_ID`          | From Razorpay dashboard → API Keys                    |
| `RAZORPAY_KEY_SECRET`      | From Razorpay dashboard → API Keys                    |
| `RAZORPAY_WEBHOOK_SECRET`  | From Razorpay dashboard → Webhooks                    |
| `WHATSAPP_API_TOKEN`       | Meta Cloud API permanent token                        |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API phone number ID                        |
| `WHATSAPP_VERIFY_TOKEN`    | Any string you make up; paste same into Meta webhook  |

---

## Troubleshooting

```bash
# Check container status
docker compose ps

# See backend logs
docker compose logs -f backend

# Restart everything
./scripts/deploy.sh

# Database backup
./scripts/backup.sh
```

More: [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

---

## Documentation Index

| Doc | What it covers |
|-----|----------------|
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | **Product document** — vision, personas, feature spec, journeys, pricing, roadmap, metrics |
| [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) | **How to use the product** — day-to-day guide for owners, staff, and consumers |
| [`docs/FAQ.md`](docs/FAQ.md) | Frequently asked questions across setup, khata, commerce, payments, and offline use |
| [`docs/SAMPLE_DATA_AND_TESTING.md`](docs/SAMPLE_DATA_AND_TESTING.md) | Seed the demo data (catalogue, translations, commerce) and walk through end-to-end test flows |
| [`docs/LOCAL_TESTING.md`](docs/LOCAL_TESTING.md) | Test everything on your own computer first — **Windows (WSL2)**, macOS, Linux |
| [`docs/PRE_DEPLOYMENT_CHECKLIST.md`](docs/PRE_DEPLOYMENT_CHECKLIST.md) | Everything to prepare **before** deploying — accounts, DNS, env values, webhooks, smoke tests |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Step-by-step Hostinger VPS deployment |
| [`docs/GO_LIVE_INTEGRATIONS.md`](docs/GO_LIVE_INTEGRATIONS.md) | Turn on payments (Razorpay) + WhatsApp with real keys — deployment-specific steps |
| [`docs/SHARED_VPS.md`](docs/SHARED_VPS.md) | Deploying alongside other apps on one VPS (subdomain + existing reverse proxy) |
| [`docs/SSL.md`](docs/SSL.md) | HTTPS via Certbot or Nginx Proxy Manager |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Day-to-day manual for **platform admin**, **store owners**, and **customers** |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Diagnosis + fixes for every component |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security posture and operator responsibilities |
| [`docs/GAP_FIXES.md`](docs/GAP_FIXES.md) | Full audit history — what was found and how it was fixed |

---

## License

MIT.
