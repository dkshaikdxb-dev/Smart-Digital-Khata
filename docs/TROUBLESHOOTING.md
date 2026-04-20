# Troubleshooting

## `docker compose ps` shows a service `Restarting` or `unhealthy`

Check the logs:

```bash
docker compose logs -f backend
docker compose logs -f postgres
```

Common causes:

- **`.env` missing a value** — most frequent. Double-check `DATABASE_URL`, `JWT_SECRET`, `POSTGRES_PASSWORD`.
- **Port already in use** — something else on the host uses 80/443/4000. Stop it or change the port in `docker-compose.yml`.

## "password authentication failed for user skhata"

`DATABASE_URL` and `POSTGRES_PASSWORD` do not match. Fix `.env` and run:

```bash
docker compose down -v   # WARNING: wipes the DB volume
./scripts/deploy.sh
```

## Migrations failed

Usually the DB didn't start in time. Retry:

```bash
docker compose exec backend npm run migrate
```

If it keeps failing, inspect schema:

```bash
docker compose exec postgres psql -U skhata -d skhata -c '\dt'
```

## Razorpay webhook returns 400

Check the signature secret:

- `RAZORPAY_WEBHOOK_SECRET` in `.env` must match what you set in the Razorpay dashboard → Webhooks.
- Ensure the webhook URL is `https://api.yourdomain.com/api/webhooks/razorpay`.

## WhatsApp webhook verification fails

- In Meta's webhook setup, **Verify token** must match `WHATSAPP_VERIFY_TOKEN` in `.env` exactly.
- Callback URL: `https://api.yourdomain.com/api/webhooks/whatsapp`.

## SSL renewal failed

Let's Encrypt rate-limits to 5 tries/week per domain. If you hit that, wait a week or use a different domain/subdomain. Use `certbot certificates` to see status.

## Mobile app can't reach the API

- On Android emulator, the computer's `localhost` is `10.0.2.2`.
- On iOS simulator, `localhost` works but not when hitting Docker on another machine.
- On a physical phone, use the LAN IP of your computer or your production domain over HTTPS.

## Resetting everything (destroys data!)

```bash
docker compose down -v
rm -rf docker/data postgres-data redis-data
./scripts/deploy.sh
```
