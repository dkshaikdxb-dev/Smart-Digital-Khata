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

### Phase 1 (Included in this MVP)

- **WhatsApp transaction system** — record purchases & payments via WhatsApp inbound webhook; auto-send ledger updates.
- **Ledger** — purchase / cash / UPI tracking per customer per shop.
- **Notification modes** — `silent` (no reminders) / `smart` (weekly, respectful) / `active` (daily).
- **Payment integration** — Razorpay order + webhook verification.
- **Credit limit system** — per-customer credit limit with soft & hard blocks.
- **Summary engine** — end-of-day, weekly & monthly summaries per shop.
- **Subscription system** — Free / Pro / Family plans with Razorpay subscriptions.
- **Admin dashboard** — Next.js dashboard for shop owners.
- **Mobile app** — Expo React Native app for shopkeepers on Android/iOS.

### Phase 2 (Scaffolded, ready to extend)

- Family payment sharing
- Local commerce (customer ↔ kirana discovery, orders, delivery)

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
curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/smart-digital-khata/main/scripts/bootstrap-vps.sh | bash
```

### 3. Configure `.env`

```bash
cd /opt/smart-digital-khata
cp .env.example .env
nano .env   # fill in the values (see Environment Variables section)
```

### 4. Start Everything

```bash
./scripts/deploy.sh
```

That's it. The API is now live at `http://YOUR_VPS_IP:4000` and the admin dashboard at `http://YOUR_VPS_IP:3000`.

### 5. Point Your Domain

See [Domain + SSL](#domain--ssl).

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/dkshaikdxb-dev/smart-digital-khata.git
cd smart-digital-khata

# 2. Environment
cp .env.example .env

# 3. Start (hot reload via Docker bind mounts)
docker compose up -d

# 4. Run migrations
docker compose exec backend npm run migrate

# 5. Seed demo data (optional)
docker compose exec backend npm run seed
```

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
cd /opt/smart-digital-khata
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
   - `VPS_PATH` — usually `/opt/smart-digital-khata`

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

## License

MIT.
