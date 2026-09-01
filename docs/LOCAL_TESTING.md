# Local Testing Guide

Test the full stack on your own computer before deploying to a VPS.
Works on **Windows**, **macOS**, and **Linux** — Docker is the only requirement.

---

## Windows (PowerShell)

### 1. Install Docker Desktop

1. Download from https://www.docker.com/products/docker-desktop/
2. Run the installer — keep **"Use WSL 2 instead of Hyper-V"** checked.
3. Restart Windows when prompted.
4. **Launch Docker Desktop** and wait for the tray whale to say "running".
5. Verify in a fresh PowerShell window:

   ```powershell
   docker --version
   docker compose version
   ```

### 2. Get the code

Fresh clone:

```powershell
git clone https://github.com/dkshaikdxb-dev/Smart-Digital-Khata.git
cd Smart-Digital-Khata
```

Already have the folder? Update it instead:

```powershell
cd Smart-Digital-Khata
git fetch origin
git checkout main          # or the feature branch you're testing
git pull
```

> If `.env.example` is missing after checkout, you're on the wrong branch —
> `git branch -a` to list, then `git checkout` the branch that has it.

### 3. Configure

```powershell
Copy-Item .env.example .env
notepad .env
```

Minimum for local testing (Razorpay/WhatsApp placeholders can stay — those
integrations skip gracefully when unconfigured):

```
JWT_SECRET=local_test_secret_0123456789abcdef0123456789abcdef
POSTGRES_PASSWORD=localtestpass123
DATABASE_URL=postgres://skhata:localtestpass123@postgres:5432/skhata
ADMIN_PASSWORD=StrongAdminPass123
```

⚠️ The password inside `DATABASE_URL` must match `POSTGRES_PASSWORD`.

### 4. Start

```powershell
docker compose up -d --build
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
```

> No `SEED_ADMIN=true` prefix here — that's bash syntax for the VPS
> `deploy.sh`. `npm run seed` reads `ADMIN_PASSWORD` from `.env` directly.

First build takes 5–10 minutes; later runs are much faster.

### 5. Verify

```powershell
docker compose ps                          # all services Up / healthy
curl.exe http://localhost:4000/api/health  # {"status":"ok",...}
start http://localhost:3000                # opens the dashboard
```

Manual test flow in the browser:

1. **Register** a shop account.
2. **Customers** → add a customer with a credit limit (e.g. ₹500).
3. **Transactions** → record a Purchase of ₹300 → dashboard updates.
4. Record another ₹300 purchase → correctly **blocked** (credit limit).
5. Record a Cash payment ₹200 → balance drops to ₹100.

### 6. Stop / reset

```powershell
docker compose down          # stop (keeps data)
docker compose down -v       # stop + wipe database (fresh start)
```

---

## macOS / Linux (bash)

Same flow, bash syntax:

```bash
git clone https://github.com/dkshaikdxb-dev/Smart-Digital-Khata.git
cd Smart-Digital-Khata
cp .env.example .env && nano .env       # same minimum values as above
docker compose up -d --build
docker compose exec backend npm run migrate
docker compose exec backend npm run seed
curl http://localhost:4000/api/health
open http://localhost:3000              # xdg-open on Linux
```

macOS: install Docker Desktop from the same link (Apple Silicon and Intel builds).
Linux: `curl -fsSL https://get.docker.com | sh` is the quickest path.

---

## Testing the mobile app locally

```bash
cd mobile-app
npm install
npx expo start
```

- **Android emulator**: `app.json` → `expo.extra.apiUrl` is already `http://10.0.2.2:4000` (the emulator's alias for your computer's localhost).
- **Physical phone (Expo Go)**: change `apiUrl` to your computer's LAN IP, e.g. `http://192.168.1.20:4000`, phone on the same Wi-Fi. On Windows find your IP with `ipconfig` (IPv4 Address).
- Windows Firewall may prompt to allow Node — allow on Private networks.

## What you can't test locally

- **Razorpay payment links** — needs real (test-mode) keys; add
  `rzp_test_...` keys to `.env` if you want to try end-to-end payments.
- **WhatsApp messages** — needs Meta Cloud API credentials + a public
  HTTPS webhook URL, so this is realistically a VPS-only test.
- **SSL / nginx domain routing** — VPS-only.

Everything else — auth, ledger, credit limits, summaries, subscriptions,
admin, the dashboard, the mobile app — works fully offline.
