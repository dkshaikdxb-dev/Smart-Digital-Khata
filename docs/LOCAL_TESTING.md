# Local Development & Testing Guide

**Canonical development environment: WSL2 Ubuntu + Docker / Docker Compose.**
The same compose files run unchanged on macOS, native Linux, Hostinger KVM,
any VPS, and container platforms — build once, reproduce anywhere.

---

## Windows — WSL2 Ubuntu (canonical)

### 1. One-time setup

1. **WSL2 + Ubuntu** (skip if already installed):

   ```powershell
   wsl --install -d Ubuntu
   ```

   Restart if prompted, then open the **Ubuntu** app and create your Linux user.

2. **Docker Desktop** — install from https://www.docker.com/products/docker-desktop/
   (x86_64 installer, keep "Use WSL 2" checked).

3. **Enable WSL integration**: Docker Desktop → Settings → **Resources →
   WSL Integration** → toggle **Ubuntu** on → Apply & Restart.

4. Verify from an **Ubuntu** terminal (not PowerShell):

   ```bash
   docker --version
   docker compose version
   ```

### 2. Clone inside the WSL filesystem

> Keep the repo under `~/` in WSL (e.g. `~/projects/`), **not** under
> `/mnt/c/...` — the Linux filesystem is dramatically faster for Docker
> bind mounts and avoids Windows file-permission quirks.

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/dkshaikdxb-dev/Smart-Digital-Khata.git
cd Smart-Digital-Khata
```

Testing a feature branch instead of main:

```bash
git checkout <branch-name>
```

### 3. Configure

```bash
cp .env.example .env
nano .env
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

### 4. Start — pick a mode

**Development mode** (hot reload, isolated dev containers/volumes/ports):

```bash
./scripts/dev.sh              # foreground with logs; Ctrl+C to stop
# or: ./scripts/dev.sh up -d  # detached
./scripts/dev.sh exec backend npm run migrate
./scripts/dev.sh exec backend npm run seed
```

Dev URLs: dashboard http://localhost:8080 · API http://localhost:14000/api/health

**Production-like mode** (exactly what the VPS runs):

```bash
docker compose up -d --build
./scripts/migrate.sh
docker compose exec backend npm run seed
```

Prod-like URLs: dashboard http://localhost:80 · API http://localhost:4000/api/health

The two modes are fully isolated (separate project names
`smart-digital-khata` / `smart-digital-khata-dev`, separate volumes,
networks, and ports) and can run at the same time.

### 5. Verify

```bash
./scripts/health-check.sh                                        # prod-like stack
PROJECT=smart-digital-khata-dev BACKEND_HOST_PORT=14000 ./scripts/health-check.sh   # dev stack
```

Manual browser flow:

1. **Register** a shop account.
2. **Customers** → add a customer with a credit limit (e.g. ₹500).
3. **Transactions** → record a Purchase of ₹300 → dashboard updates.
4. Record another ₹300 purchase → correctly **blocked** (credit limit).
5. Record a Cash payment ₹200 → balance drops to ₹100.

### 6. Stop / reset

```bash
./scripts/dev.sh down         # stop dev (keeps data)
./scripts/dev.sh down -v      # stop dev + wipe dev database
docker compose down           # stop prod-like (keeps data)
docker compose down -v        # stop prod-like + wipe its database
```

Because every resource is prefixed `smart-digital-khata[-dev]`, none of
these commands can touch any other project on your machine.

---

## macOS / native Linux

Identical to the WSL2 steps from "Clone" onward — install Docker Desktop
(macOS) or `curl -fsSL https://get.docker.com | sh` (Linux) first.

---

## Plain PowerShell (fallback, not canonical)

If you skip WSL2 and use PowerShell directly, everything works with two
substitutions: `Copy-Item .env.example .env` instead of `cp`, and run the
compose commands verbatim (`docker compose up -d --build`, etc.). The
`./scripts/*.sh` helpers require a bash shell — from PowerShell invoke them
as `wsl ./scripts/dev.sh` or use the underlying compose commands they wrap.

---

## Testing the mobile app locally

```bash
cd mobile-app
npm install
npx expo start
```

- **Android emulator**: `app.json` → `expo.extra.apiUrl` is already `http://10.0.2.2:4000` (the emulator's alias for your computer's localhost).
- **Physical phone (Expo Go)**: change `apiUrl` to your computer's LAN IP, e.g. `http://192.168.1.20:4000`, phone on the same Wi-Fi. On Windows find your IP with `ipconfig` (IPv4 Address); if the API runs inside WSL2, also run once in **admin PowerShell**: `netsh interface portproxy add v4tov4 listenport=4000 connectaddress=localhost` so the phone can reach it.
- Windows Firewall may prompt to allow Node — allow on Private networks.

## What you can't test locally

- **Razorpay payment links** — needs real (test-mode) keys; add
  `rzp_test_...` keys to `.env` if you want to try end-to-end payments.
- **WhatsApp messages** — needs Meta Cloud API credentials + a public
  HTTPS webhook URL, so this is realistically a VPS-only test.
- **SSL / nginx domain routing** — VPS-only.

Everything else — auth, ledger, credit limits, summaries, subscriptions,
admin, the dashboard, the mobile app — works fully offline.

---

## Isolation & portability guarantees

| Requirement | How it's met |
|---|---|
| Project-specific Docker resources | Compose project name pinned to `smart-digital-khata`; every container/network/volume carries the prefix regardless of folder name |
| No shared DBs/volumes/networks | All resources project-scoped; nothing references another project |
| No port conflicts | Every host port overridable in `.env` (`HTTP_PORT`, `BACKEND_HOST_PORT`, …); internal ports fixed; DB/Redis/app ports localhost-bound |
| Dev isolated from prod | `./scripts/dev.sh` runs project `smart-digital-khata-dev` — own containers, volumes, ports |
| Safe redeploy without data loss | `deploy.sh` never removes volumes; migrations are additive and recorded in `_migrations` |
| Reproducible from GitHub | Lockfiles committed, `npm ci` in images, pinned base images, `.env.example` documents all config |
| Provider-independent | No provider APIs anywhere; see docs/DEPLOYMENT.md § other providers |
| Scripts | `dev.sh`, `deploy.sh`, `health-check.sh`, `migrate.sh`, `backup.sh`, `restore.sh`, `bootstrap-vps.sh`, `setup-ssl.sh` |
