# Pre-Deployment Checklist

> Tick every box before running `./scripts/deploy.sh` for the first time.
> Targeted at a non-coder following along on a fresh Hostinger VPS.

---

## 1. Accounts you must have ready

| Account | Why | Where |
|---------|-----|-------|
| ☐ Hostinger VPS (KVM) | Server to run the app on | https://www.hostinger.com/vps-hosting |
| ☐ Domain name | Customer-facing URL + SSL | Any registrar (GoDaddy / Namecheap / Cloudflare) |
| ☐ GitHub | Source of code (already public — you're reading it) | https://github.com/dkshaikdxb-dev/Smart-Digital-Khata |
| ☐ Razorpay (KYC done) | To collect payments | https://dashboard.razorpay.com |
| ☐ Meta WhatsApp Business (Cloud API) | To send/receive WhatsApp messages | https://developers.facebook.com/docs/whatsapp/cloud-api |

## 2. Information you must collect (before SSH)

Copy these into a notepad — you'll paste them into `.env`:

| Item | Where to find |
|------|---------------|
| ☐ VPS IP address | Hostinger hPanel → VPS overview |
| ☐ VPS root password (or SSH key) | Same place |
| ☐ Your domain name (e.g. `khata.example.com`) | Your registrar |
| ☐ Razorpay **Key ID** + **Key Secret** | Razorpay → Account & Settings → API Keys → **Generate Live Key** |
| ☐ Razorpay **Webhook Secret** | Razorpay → Account & Settings → Webhooks (set later, see §6) |
| ☐ WhatsApp **Permanent Access Token** | Meta → Business Settings → System Users → Generate Token |
| ☐ WhatsApp **Phone Number ID** | Meta → WhatsApp → API Setup |
| ☐ WhatsApp **Business Account ID** | Same screen |
| ☐ Verify Token (any string you invent) | You make this up — paste the same string into Meta's webhook config |

## 3. DNS — set this up first

In your registrar's DNS panel:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` (root) | YOUR_VPS_IP | 300 |
| A | `api` | YOUR_VPS_IP | 300 |
| A | `www` | YOUR_VPS_IP | 300 |

Verify (from your laptop):

```bash
dig +short khata.example.com
dig +short api.khata.example.com
```

Both should return your VPS IP. Wait 5–30 minutes if not.

## 4. VPS bootstrap (run on the VPS)

```bash
ssh root@YOUR_VPS_IP
curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/Smart-Digital-Khata/main/scripts/bootstrap-vps.sh | bash
cd /opt/Smart-Digital-Khata
```

What the bootstrap installs:

- Docker Engine + Compose
- git, curl, ufw firewall
- Clones this repo to `/opt/Smart-Digital-Khata`
- Opens ports 22, 80, 443

## 5. Configure `.env`

```bash
cd /opt/Smart-Digital-Khata
nano .env
```

Minimum required edits:

```bash
JWT_SECRET=$(openssl rand -hex 32)       # generate this and paste in
POSTGRES_PASSWORD=<your strong password>
DATABASE_URL=postgres://skhata:<same password>@postgres:5432/skhata

APP_URL=https://khata.example.com
ADMIN_URL=https://khata.example.com
ALLOWED_ORIGINS=https://khata.example.com

RAZORPAY_KEY_ID=rzp_live_XXX
RAZORPAY_KEY_SECRET=XXX
RAZORPAY_WEBHOOK_SECRET=XXX                  # set later in §6

WHATSAPP_API_TOKEN=EAAxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=1234567890
WHATSAPP_VERIFY_TOKEN=my_invented_string_2026
```

Save: `Ctrl+X`, then `Y`, then `Enter`.

## 6. Webhooks — point Razorpay + Meta at the VPS

> Do this **after** SSL is set up so the URLs are `https://`.

### Razorpay webhook

1. Razorpay → Account & Settings → Webhooks → **Add New Webhook**
2. URL: `https://api.khata.example.com/api/webhooks/razorpay`
3. Secret: copy/paste from `.env` → `RAZORPAY_WEBHOOK_SECRET` (generate fresh with `openssl rand -hex 24` if blank)
4. Active events: `payment.captured`, `order.paid`, `payment_link.paid`
5. Save → test webhook.

### WhatsApp webhook

1. Meta App Dashboard → WhatsApp → Configuration → Webhook
2. Callback URL: `https://api.khata.example.com/api/webhooks/whatsapp`
3. Verify token: must match `.env` → `WHATSAPP_VERIFY_TOKEN`
4. Subscribe to fields: `messages`
5. Save.

## 7. First deploy

```bash
cd /opt/Smart-Digital-Khata
SEED_ADMIN=true ./scripts/deploy.sh
```

`SEED_ADMIN=true` creates the platform-level admin user using `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## 8. SSL

Pick ONE:

```bash
# A) Certbot (simplest)
./scripts/setup-ssl.sh khata.example.com you@example.com

# B) Nginx Proxy Manager (UI-based)
docker compose stop nginx
docker compose -f docker-compose.npm.yml up -d
# then visit http://YOUR_VPS_IP:81
```

## 9. Smoke test (you, on your laptop)

```bash
# Backend health
curl -s https://api.khata.example.com/api/health
# → {"status":"ok",...}

# Admin loads in browser
open https://khata.example.com
```

Then in the browser:

1. ☐ **Register** a shop account (`/register`).
2. ☐ Add 1 customer.
3. ☐ Add 1 purchase transaction.
4. ☐ "Request payment via WhatsApp" → confirm the WhatsApp link arrived.
5. ☐ Pay the link with a UPI test account → confirm balance decreased.

## 10. Auto-deploy (optional but recommended)

```bash
# On the VPS, generate a deploy key
ssh-keygen -t ed25519 -f ~/.ssh/gh_deploy -N ""
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy             # copy this output
```

In GitHub → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `YOUR_VPS_IP` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | (paste the private key from above) |
| `VPS_PATH` | `/opt/Smart-Digital-Khata` |
| `VPS_PORT` | `22` |

Push to `main` → GitHub Actions deploys automatically.

## 11. Backups

```bash
crontab -e
# add (nightly 2am):
0 2 * * * cd /opt/Smart-Digital-Khata && ./scripts/backup.sh /var/backups/skhata >> /var/log/skhata-backup.log 2>&1
```

## 12. Final checks

- ☐ `docker compose ps` — every service `Up (healthy)`
- ☐ `https://khata.example.com` loads
- ☐ `https://api.khata.example.com/api/health` returns 200
- ☐ Razorpay → Webhooks → last delivery green
- ☐ Meta → WhatsApp webhook → verified ✅
- ☐ At least one end-to-end test transaction
- ☐ Backup cron added
- ☐ GitHub auto-deploy works (push a dummy commit and check Actions)
