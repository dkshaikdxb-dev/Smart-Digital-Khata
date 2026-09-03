# Deploying on a Shared VPS (alongside other apps)

Runbook for deploying Smart Digital Khata on a VPS that **already hosts other
sites** — written for `srv1567165.hstgr.cloud` (Hostinger KVM 8,
`187.127.148.111`), which already serves Algomind and ZipCare
(`zipcare.dadashaik.com`), targeting the subdomain **`khata.dadashaik.com`**.

## Why this works

- **Capacity:** KVM 8 = 8 vCPU / 32 GB RAM / 400 GB NVMe. This stack needs
  ~1 GB RAM at MVP load — a rounding error next to what's free.
- **Isolation:** every container, network, and volume is prefixed
  `smart-digital-khata`; Postgres/Redis/backend/admin bind to localhost with
  env-overridable ports. Nothing can touch Algomind or ZipCare.
- **The only shared resource is ports 80/443** — owned by whatever already
  serves ZipCare. This overlay hands that responsibility to the existing
  proxy and keeps our stack entirely on localhost.

Architecture on the shared VPS:

```
internet ──► existing proxy (owns 80/443, TLS for *.dadashaik.com)
                 │  khata.dadashaik.com → 127.0.0.1:8090
                 ▼
        skhata internal nginx (localhost:8090)
                 │  /api/* → backend:4000        /* → admin:3000
                 ▼
        backend ── postgres / redis   (all project-scoped, localhost-only)
```

One subdomain is enough — the internal nginx splits `/api` from the
dashboard, so no separate `api.` record is needed.

---

## Step 0 — Discover what owns 80/443 (30 seconds)

SSH in (`ssh root@187.127.148.111`) and run:

```bash
ss -tlnp | grep -E ':80 |:443 '
docker ps --format 'table {{.Names}}\t{{.Ports}}' | head -20
```

Interpret:

| You see | It is | Follow |
|---|---|---|
| `nginx` process (not in docker), `/etc/nginx` exists | Host nginx | Path A |
| A container publishing 80/443 named like `nginx-proxy-manager` / `npm` (port 81 also open) | Nginx Proxy Manager | Path B |
| A container named `traefik` or `caddy` | Traefik / Caddy | Path C |
| A single app container (e.g. ZipCare itself) publishing 80/443 | No shared proxy yet | Path D — introduce one first |

## Step 1 — DNS

In the `dadashaik.com` DNS panel add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `khata` | `187.127.148.111` | 300 |

Verify from anywhere: `dig +short khata.dadashaik.com` → `187.127.148.111`.

## Step 2 — Install the stack (identical for all paths)

```bash
ssh root@187.127.148.111
cd /opt
git clone https://github.com/dkshaikdxb-dev/Smart-Digital-Khata.git
cd Smart-Digital-Khata
cp .env.example .env
nano .env
```

Set in `.env` (besides the usual secrets/keys):

```bash
# shared-VPS mode: internal nginx on localhost:8090; existing proxy owns 80/443
COMPOSE_FILE=docker-compose.yml:docker-compose.sharedvps.yml
SHARED_HTTP_PORT=8090

APP_URL=https://khata.dadashaik.com
ADMIN_URL=https://khata.dadashaik.com
NEXT_PUBLIC_API_URL=https://khata.dadashaik.com
ALLOWED_ORIGINS=https://khata.dadashaik.com
```

> **Port collisions with the other apps:** if Algomind/ZipCare already use
> host ports 5432/6379/4000/3000 (check with `ss -tlnp`), pick free ones via
> `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` / `BACKEND_HOST_PORT` /
> `ADMIN_HOST_PORT` in `.env`. These are localhost conveniences only — the
> containers talk over the private network regardless.

Then:

```bash
chmod +x scripts/*.sh
SEED_ADMIN=true ./scripts/deploy.sh
curl -s http://127.0.0.1:8090/api/health    # → {"status":"ok",...}
```

## Step 3 — Wire the existing proxy

### Path A — host nginx

```bash
cat > /etc/nginx/sites-available/khata.dadashaik.com <<'EOF'
server {
    listen 80;
    server_name khata.dadashaik.com;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 5m;
    }
}
EOF
ln -s /etc/nginx/sites-available/khata.dadashaik.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# TLS with the same certbot that serves zipcare:
certbot --nginx -d khata.dadashaik.com
```

Certbot rewrites the site file for 443 + redirect and renews automatically
alongside the existing certs.

### Path B — Nginx Proxy Manager (UI)

NPM runs in Docker, so `127.0.0.1` inside its container is not the host.
Two options; the first is cleaner:

1. Join NPM to our network, then proxy by container DNS name:

   ```bash
   docker network connect smart-digital-khata_skhata <npm-container-name>
   ```

   NPM UI (`http://187.127.148.111:81`) → Proxy Hosts → Add:
   - Domain: `khata.dadashaik.com`
   - Forward Hostname: `smart-digital-khata-nginx-1` · Port: `80`
   - Websockets ✓, Block common exploits ✓
   - SSL tab → Request new certificate → Force SSL ✓

2. Or forward to the host gateway instead: hostname `172.17.0.1`, port `8090`
   (works when NPM is on the default bridge; no network join needed).

### Path C — Traefik / Caddy

- **Caddy:** add to Caddyfile → `khata.dadashaik.com { reverse_proxy 127.0.0.1:8090 }` and reload — TLS is automatic.
- **Traefik:** attach labels are file-provider config pointing the router
  `Host(`khata.dadashaik.com`)` at `http://127.0.0.1:8090` (host mode) or add
  our nginx container to Traefik's network with router+service labels.

### Path D — no shared proxy yet (an app container owns 80/443)

Introduce one before adding a second site. Recommended: move the existing
app behind host nginx or NPM first (one-time change to that app's port
mapping), then follow Path A/B. Do this in a maintenance window — it briefly
interrupts the existing site.

## Step 4 — Webhooks (production keys)

- Razorpay → Webhooks → URL `https://khata.dadashaik.com/api/webhooks/razorpay`,
  events: `payment.captured`, `order.paid`, `payment_link.paid`,
  `subscription.activated`, `subscription.charged`, `subscription.pending`,
  `subscription.halted`, `subscription.cancelled`.
- Meta WhatsApp → Callback `https://khata.dadashaik.com/api/webhooks/whatsapp`,
  verify token = `WHATSAPP_VERIFY_TOKEN` from `.env`, subscribe to `messages`.

## Step 5 — GitHub auto-deploy on the shared VPS

Same as `docs/DEPLOYMENT.md` §8; set the Actions secrets to:

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.127.148.111` |
| `VPS_USER` | `root` |
| `VPS_PATH` | `/opt/Smart-Digital-Khata` |
| `VPS_SSH_KEY` | deploy key (generate on the VPS) |

`deploy.sh` picks up `COMPOSE_FILE` from `.env` automatically, so auto-deploys
stay in shared-VPS mode.

## Coexistence checklist

- ☐ `ss -tlnp` shows no conflicts on 8090/5432/6379/4000/3000 (or you overrode them)
- ☐ `docker ps` — all `smart-digital-khata-*` containers Up; Algomind/ZipCare containers untouched
- ☐ `https://zipcare.dadashaik.com` still loads (proxy change didn't break it)
- ☐ `https://khata.dadashaik.com/api/health` → ok
- ☐ UFW: no new open ports needed (8090 is localhost-only)
- ☐ Backups: add our cron **with its own path** so it doesn't clash with other apps' backup jobs:
  `0 2 * * * cd /opt/Smart-Digital-Khata && ./scripts/backup.sh /var/backups/skhata >> /var/log/skhata-backup.log 2>&1`
