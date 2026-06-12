# Troubleshooting

Quick diagnostic flow: **check status → check logs → check config → check external service**.

```bash
docker compose ps                    # are all 5 services Up + healthy?
docker compose logs --tail=200 backend
docker compose logs --tail=100 postgres
docker compose logs --tail=100 nginx
```

---

## Boot / install issues

### "Permission denied" running `bootstrap-vps.sh`

The bootstrap must run as root. Re-run with `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/Smart-Digital-Khata/main/scripts/bootstrap-vps.sh | sudo bash
```

### `bootstrap-vps.sh` 404s

You likely got the URL casing wrong — it must be `Smart-Digital-Khata` (capital `S`/`D`/`K`).

### `./scripts/deploy.sh` says `.env missing`

```bash
cd /opt/Smart-Digital-Khata
cp .env.example .env
nano .env       # fill in values, then run deploy again
```

### `Invalid environment configuration` on startup

The new env validator printed the missing/wrong fields. Read the list it gave you, fix `.env`, redeploy. Most common:

- `JWT_SECRET` too short — must be 16+ chars.
- `DATABASE_URL` missing.
- A URL field that doesn't start with `http://` or `https://`.

---

## Containers not healthy

### Backend `unhealthy` or `Restarting`

```bash
docker compose logs -f backend
```

Most common causes:

| Symptom in logs | Cause | Fix |
|---|---|---|
| `password authentication failed for user "skhata"` | `DATABASE_URL` doesn't match `POSTGRES_PASSWORD` | Edit `.env`, then `docker compose down -v && ./scripts/deploy.sh` (destroys DB) |
| `getaddrinfo ENOTFOUND postgres` | Backend started before postgres | Healthcheck handles this — usually self-resolves in ~30s. If not, restart: `docker compose restart backend`. |
| `ECONNREFUSED redis:6379` | Redis not up | `docker compose restart redis`. |
| `JWT_SECRET ... is required` | Env validation failed | Fix `.env`. |

### Postgres won't start

```bash
docker compose logs postgres | tail -50
```

- If you see `database files are incompatible with server` — you mixed Postgres versions. Wipe & retry: `docker compose down -v && ./scripts/deploy.sh`.
- If port 5432 is "already in use" — another Postgres is running on the host. Stop it or comment the `5432:5432` port mapping in `docker-compose.yml`.

### Migrations failed

```bash
docker compose exec backend npm run migrate
```

If it keeps failing with "relation already exists":

```bash
docker compose exec postgres psql -U skhata -d skhata -c '\dt'
# inspect _migrations table
docker compose exec postgres psql -U skhata -d skhata -c 'SELECT * FROM _migrations'
```

You can manually mark a migration as run:

```bash
docker compose exec postgres psql -U skhata -d skhata \
  -c "INSERT INTO _migrations(name) VALUES ('0002_payment_links_and_dedupe.sql') ON CONFLICT DO NOTHING;"
```

---

## Razorpay issues

### Webhook returns 400 — "Invalid signature"

The `RAZORPAY_WEBHOOK_SECRET` in `.env` doesn't match what you set in the Razorpay dashboard. Fix one of them so they match. Then:

```bash
./scripts/deploy.sh
```

### Payment link creation fails

```bash
docker compose logs backend | grep -i razorpay
```

- `BAD_REQUEST_ERROR ... customer contact ...` — phone number was malformed. The app normalizes to `+91...` but check the customer's stored phone is a valid 10-digit Indian number.
- `Authentication failed` — `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` wrong, or you're using test keys with a live webhook (or vice versa).

### Customer paid but balance not updated

1. Razorpay dashboard → Webhooks → see the latest event for that payment.
2. If status is "Failed" or "Pending" — Razorpay couldn't reach our URL. Check:
   - Is `api.yourdomain.com` resolving to the VPS?
   - Is SSL valid? (`curl -v https://api.yourdomain.com/api/health`)
   - Is the firewall open on 443? (`ufw status`)
3. If the webhook was delivered but balance didn't change — check backend logs at that timestamp. Most likely the event was deduped because it had already been processed.
4. **Manual fix** while you debug:

   ```bash
   docker compose exec postgres psql -U skhata -d skhata
   UPDATE customers SET balance = balance - 50000 WHERE id = '<uuid>';  -- 500 rupees
   ```

---

## WhatsApp issues

### Webhook verification fails in Meta dashboard

The `WHATSAPP_VERIFY_TOKEN` in `.env` must match exactly what you type into the Meta dashboard. No spaces, no quotes.

### Outbound messages not arriving

```bash
docker compose logs backend | grep -i whatsapp
```

- `WhatsApp not configured — skipping send` — your `WHATSAPP_API_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` is blank in `.env`.
- `(#131030) Recipient phone number not in allowed list` — you're still in **test mode**. Add the recipient to test recipients in Meta dashboard, or move your phone number to **Production** in App Review.
- `(#100) The parameter messages...` — phone number formatting issue. The app expects 10-digit Indian or full E.164; fix the customer's phone in the dashboard.

### Inbound messages not creating transactions

Inbound commands only work from a phone number that's registered as a **shop owner** (it's looked up in `users.phone`). If the shopkeeper texts from a different number, nothing happens.

Fix: ensure the shopkeeper's account phone matches the WhatsApp number they're texting from.

---

## SSL / domain issues

### Browser shows "Your connection is not private"

Either:
- SSL hasn't been set up — run `./scripts/setup-ssl.sh yourdomain.com you@example.com`.
- Or you're hitting the IP instead of the domain — go to `https://yourdomain.com`.

### Let's Encrypt rate-limited

You've hit Let's Encrypt's 5-certs-per-week-per-domain limit. Wait 7 days OR use a different subdomain (e.g. `app2.yourdomain.com`).

### Nginx 502 Bad Gateway

Backend or admin container is down.

```bash
docker compose ps
docker compose logs --tail=50 backend admin
docker compose restart backend admin
```

---

## Mobile app issues

### "Network request failed"

The app can't reach the API. Open `mobile-app/app.json` → `expo.extra.apiUrl` and check:

- Android emulator: `http://10.0.2.2:4000` (not `localhost`).
- Physical phone: your computer's LAN IP, e.g. `http://192.168.1.20:4000`. Phone & computer must be on same Wi-Fi.
- Production build: `https://api.yourdomain.com`.

After changing `app.json`, restart `expo start`.

### EAS build fails

```bash
cd mobile-app
eas build:list                  # see failed build details
eas build -p android --profile preview --clear-cache
```

Usual culprits:
- Missing `assets/icon.png` etc. — the placeholders are already in the repo; if you deleted them, restore.
- `expo-secure-store` requires the dev client or EAS build; it won't work in Expo Go in some scenarios.

---

## GitHub Actions auto-deploy issues

### "Permission denied (publickey)"

The deploy key isn't in `~/.ssh/authorized_keys` on the VPS, or the `VPS_SSH_KEY` secret in GitHub is the **public** key (it must be the **private** key — the whole file starting `-----BEGIN OPENSSH PRIVATE KEY-----`).

### Workflow runs but VPS doesn't change

Check the workflow log → "Deploy over SSH" step → look for errors after `git reset --hard origin/main`. Usually `.env` is missing on the VPS, or the deploy script fails inside.

SSH in manually and run `./scripts/deploy.sh` to see the real error.

---

## Performance / scale

### Slow API responses

```bash
docker compose exec postgres psql -U skhata -d skhata
SELECT * FROM pg_stat_activity WHERE datname='skhata';
```

If you see lots of `active` queries on the same row — you have lock contention. Look for long-running transactions in the backend logs.

### Disk filling up

```bash
df -h
docker system df
docker system prune -af --volumes      # ⚠️ removes unused containers/images/volumes
```

Database growth — check `pg_dump` size in `/var/backups/skhata` and adjust retention if needed.

---

## Last resort

> ⚠️ **Destroys all data.**

```bash
cd /opt/Smart-Digital-Khata
docker compose down -v
rm -rf postgres-data redis-data docker/data
./scripts/deploy.sh
```

Then restore from a backup if you have one (see `OPERATIONS.md` § A4).
