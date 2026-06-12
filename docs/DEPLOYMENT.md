# Deployment Guide — Hostinger VPS

This guide takes a **non-coder** from zero to a live Smart Digital Khata deployment.

## What you need

1. A **Hostinger KVM VPS** (any plan; KVM 1 is enough to start).
2. A **domain name** pointed to the VPS (e.g. `khata.example.com`).
3. A **GitHub account** (you already have the repo, or your own fork of it).
4. **SSH access** to the VPS — Hostinger gives you IP + root password in hPanel.

---

## Step 1 — SSH into the VPS

```bash
ssh root@YOUR_VPS_IP
```

If prompted, say `yes`. Enter your root password.

---

## Step 2 — Bootstrap the server

Run the one-liner — it installs Docker, firewall, clones the repo:

```bash
curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/Smart-Digital-Khata/main/scripts/bootstrap-vps.sh | bash
```

When it finishes, you will be at `/opt/Smart-Digital-Khata`.

---

## Step 3 — Fill in `.env`

```bash
cd /opt/Smart-Digital-Khata
nano .env
```

Minimum you must change:

- `POSTGRES_PASSWORD` — any strong password
- `JWT_SECRET` — run `openssl rand -hex 32` and paste the output
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- WhatsApp: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`

Also update `DATABASE_URL` — the password portion should match `POSTGRES_PASSWORD`.

Save & exit: `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 4 — Deploy

```bash
./scripts/deploy.sh
```

First boot takes a few minutes (pulling images, running migrations).

Check everything is up:

```bash
docker compose ps
```

You should see `skhata-postgres`, `skhata-redis`, `skhata-backend`, `skhata-admin`, `skhata-nginx` all in `Up`.

Visit `http://YOUR_VPS_IP` — the admin dashboard should load.

---

## Step 5 — Seed the admin user (optional)

```bash
SEED_ADMIN=true ./scripts/deploy.sh
```

This creates a `admin@example.com` / password you set in `.env` as `ADMIN_PASSWORD`.

---

## Step 6 — Point your domain

In your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

| Type | Name | Value         |
| ---- | ---- | ------------- |
| A    | @    | YOUR_VPS_IP   |
| A    | api  | YOUR_VPS_IP   |

Wait 5–30 minutes for DNS to propagate. Check with:

```bash
dig +short yourdomain.com
```

---

## Step 7 — SSL certificate

See [`SSL.md`](./SSL.md).

---

## Step 8 — Set up GitHub auto-deploy (optional but recommended)

1. On the VPS, create an SSH key **for GitHub to log in with**:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/gh_deploy -N ""
   cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
   cat ~/.ssh/gh_deploy   # copy this whole thing
   ```

2. In GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:

   | Secret           | Value                               |
   | ---------------- | ----------------------------------- |
   | `VPS_HOST`       | your VPS IP                         |
   | `VPS_USER`       | `root` (or whatever user you use)   |
   | `VPS_SSH_KEY`    | contents of `~/.ssh/gh_deploy`      |
   | `VPS_PORT`       | `22` (default)                      |
   | `VPS_PATH`       | `/opt/Smart-Digital-Khata`          |

3. Push to `main`. Watch **Actions** tab — deployment happens automatically.

---

## Daily operations

```bash
# Logs
docker compose logs -f backend
docker compose logs -f admin

# Restart single service
docker compose restart backend

# Full redeploy
./scripts/deploy.sh

# DB backup (cron it nightly)
./scripts/backup.sh /var/backups/skhata

# Update to latest
git pull && ./scripts/deploy.sh
```

---

## Recommended: nightly backup cron

```bash
crontab -e
# add:
0 2 * * * cd /opt/Smart-Digital-Khata && ./scripts/backup.sh /var/backups/skhata >> /var/log/skhata-backup.log 2>&1
```
