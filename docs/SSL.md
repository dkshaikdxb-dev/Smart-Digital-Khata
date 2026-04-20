# SSL / HTTPS Setup

Two options — pick the one that suits you.

## Option A — Certbot (simplest, command line)

Already included: `scripts/setup-ssl.sh`.

```bash
cd /opt/smart-digital-khata
./scripts/setup-ssl.sh yourdomain.com you@example.com
```

The script:

1. Installs `certbot` if missing.
2. Temporarily stops nginx so certbot can bind port 80.
3. Requests a Let's Encrypt cert for the domain.
4. Copies the cert + key into `docker/certs/yourdomain.com/`.

Then edit `docker/nginx.conf` — uncomment the `listen 443 ssl` server block and set `server_name` + cert paths to `yourdomain.com`.

Reload nginx:

```bash
docker compose up -d nginx
```

### Auto-renewal

Add a cron entry:

```bash
crontab -e
# renews cert + copies into docker/certs + reloads nginx
0 3 * * * certbot renew --quiet --deploy-hook "cp -L /etc/letsencrypt/live/*/fullchain.pem /opt/smart-digital-khata/docker/certs/$(ls /etc/letsencrypt/live | head -1)/fullchain.pem && cp -L /etc/letsencrypt/live/*/privkey.pem /opt/smart-digital-khata/docker/certs/$(ls /etc/letsencrypt/live | head -1)/privkey.pem && cd /opt/smart-digital-khata && docker compose exec -T nginx nginx -s reload"
```

---

## Option B — Nginx Proxy Manager (UI-based, no command line)

1. Stop the built-in nginx first:

   ```bash
   docker compose stop nginx
   ```

2. Start NPM alongside the app:

   ```bash
   docker compose -f docker-compose.npm.yml up -d
   ```

3. Open `http://YOUR_VPS_IP:81`.

4. Default login:

   ```
   Email:    admin@example.com
   Password: changeme
   ```

   Change both immediately.

5. Add a **Proxy Host**:
   - Domain Names: `yourdomain.com`
   - Scheme: `http`
   - Forward Hostname / IP: `skhata-admin`
   - Forward Port: `3000`
   - Enable "Websockets support", "Block common exploits", "Cache assets"

6. Go to the **SSL** tab → "Request a new SSL certificate" (Let's Encrypt) → enable "Force SSL" + HSTS → Save.

7. Repeat for `api.yourdomain.com` → forward to `skhata-backend:4000`.

Done — NPM renews certs automatically.
