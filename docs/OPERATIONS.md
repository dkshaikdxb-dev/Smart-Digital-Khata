# Operations Manual

This is the day-to-day "how to use it" guide for the three people who touch the system:

1. **Platform Admin** — you, running the SaaS.
2. **Store Owner** — the shopkeeper using Smart Digital Khata.
3. **Customer** — the kirana customer who owes (or pays) money.

---

# Part A — Platform Admin (you)

Your job: keep the system healthy, onboard shop owners, watch billing.

## A1. Daily checks (2 min)

```bash
ssh root@YOUR_VPS_IP
cd /opt/Smart-Digital-Khata
docker compose ps
docker compose logs --tail=50 backend
```

Look for any service in `Restarting` or `unhealthy`. Look for `ERROR` lines.

## A2. Platform stats

The admin user (created with `SEED_ADMIN=true`) can call:

```
GET  /api/admin/stats        # shops, users, transactions, total outstanding
GET  /api/admin/shops        # all shops with customer counts
GET  /api/admin/users        # all users
```

Get an admin token first:

```bash
curl -s -X POST https://api.khata.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_ADMIN_PWD"}' | jq .token
```

Then:

```bash
TOKEN=eyJhbGc...
curl -s https://api.khata.example.com/api/admin/stats -H "Authorization: Bearer $TOKEN" | jq
```

## A3. Updates / deploys

```bash
# Manual
cd /opt/Smart-Digital-Khata && git pull && ./scripts/deploy.sh

# Or: just push to GitHub `main` — Actions deploys for you
```

## A4. Backups & restore

Backups are written to `/var/backups/skhata/skhata-YYYYMMDD-HHMMSS.sql.gz` by the nightly cron. Last 14 are kept.

**Restore:**

```bash
cd /opt/Smart-Digital-Khata
gunzip -c /var/backups/skhata/skhata-20260612-020001.sql.gz \
  | docker compose exec -T postgres psql -U skhata -d skhata
```

## A5. Rotating a leaked secret

1. Generate new value, e.g. `openssl rand -hex 32`.
2. Update `.env` on the VPS.
3. `./scripts/deploy.sh` to restart with the new secret.
4. If it's `JWT_SECRET`: all existing user sessions become invalid (they have to log in again — that's the point).
5. If it's `RAZORPAY_WEBHOOK_SECRET`: also update it in Razorpay dashboard.

## A6. Suspending a misbehaving shop

```sql
docker compose exec postgres psql -U skhata -d skhata
UPDATE shops SET plan = 'suspended' WHERE id = '<shop_uuid>';
```

(Today: cosmetic only. Future: gate API on this.)

---

# Part B — Store Owner (the shopkeeper)

Where they spend their day: the **mobile app** (or the **admin dashboard** if at a laptop).

## B1. First-time setup (5 min)

1. Open `https://khata.example.com` → **Create account**.
2. Fill name, phone (with `+91`), email, password, **shop name**.
3. They land on the dashboard.
4. **Settings → Notification mode**:
   - **Silent** — never auto-message customers (good for shy/old customers).
   - **Smart** — only message on payments + on purchases above ₹200 (default).
   - **Active** — message on every transaction + send daily reminders at 9am to anyone with outstanding dues.

## B2. Adding a customer

Three places:

- **Dashboard → Customers → add row.**
- **Mobile app → Customers tab → "+".**
- **Implicit:** WhatsApp `add 250 9876543210` — the customer is created on first reference.

**Credit limit** is in rupees. Set to `0` for "no limit". Once balance exceeds limit, the next "purchase" call **fails** with 422 — the shopkeeper has to either get a payment first or raise the limit.

## B3. Recording a sale (purchase on credit)

| Channel | How |
|---------|-----|
| Mobile app | Tap **+ New transaction** → pick customer → **Purchase** → amount → Save. |
| Dashboard | Transactions tab → Record transaction form → Save. |
| WhatsApp | Send to your shop's WhatsApp Business number: `add 250 9876543210 tea & sugar` |

The customer's WhatsApp gets a message (depending on Notification mode):

> Hi Ramesh, this is Sharma Kirana.
> Purchase recorded: ₹250.00.
> Outstanding: ₹1,250.00.
> Note: tea & sugar

## B4. Recording a payment

The customer paid you in cash or UPI in person:

| Channel | How |
|---------|-----|
| Mobile app | + New transaction → **Cash** or **UPI** → amount → Save. |
| Dashboard | Same form, pick **Cash payment** or **UPI payment**. |
| WhatsApp | `paid 500 Ramesh` or `upi 500 9876543210` |

A receipt-style message goes to the customer:

> Hi Ramesh, Sharma Kirana received your payment of ₹500.00.
> Remaining: ₹750.00. Thank you!

## B5. Asking for payment (the headline feature)

Dashboard → Transactions tab → **Request payment via WhatsApp**:

1. Pick customer.
2. Amount (in ₹).
3. Optional note ("July dues").
4. Click **Send link**.

What happens:
- Server creates a Razorpay-hosted payment link.
- The link is DM'd to the customer over WhatsApp.
- Customer pays via UPI / card / netbanking.
- Razorpay sends a webhook → backend records the payment + updates the customer's balance automatically.
- The customer gets a "payment received" WhatsApp message.

## B6. Day-end summary

Dashboard home cards:

- **Today purchases** — total credit given out today.
- **Today collections** — total payments received today.
- **Total outstanding** — sum of all positive customer balances.
- **Top outstanding** — list of who owes the most.

For end-of-day reconciliation, just look at the four cards.

## B7. Plans & upgrade

- **Free** — 50 customers, smart notifications.
- **Pro** — 1000 customers, active notifications.
- **Family** — 5000 customers, family sharing (Phase 2).

`GET /api/subscriptions/me` and `POST /api/subscriptions/upgrade` `{plan:"pro"}`.
(Today the upgrade flag is manual — actual Razorpay subscription billing is the next milestone.)

## B8. WhatsApp command reference (cheat sheet)

Send to your shop's WhatsApp Business number:

| Command | Effect |
|---------|--------|
| `add 250 9876543210` | Record ₹250 purchase for that customer (creates if new). |
| `add 250 Ramesh tea & sugar` | Same, by name match, with a note. |
| `paid 500 9876543210` | Record ₹500 cash payment. |
| `upi 500 9876543210` | Record ₹500 UPI payment. |
| `balance 9876543210` | Reply with this customer's outstanding amount. |

Replies are auto-sent back to the shopkeeper.

---

# Part C — Customer (kirana shop's customer)

The customer doesn't have an account. They only see:

## C1. WhatsApp notifications

Depending on the shop's notification mode, they may receive:

- A purchase confirmation right after they bought something.
- A payment receipt right after they paid.
- A daily 9am reminder (only if the shop is on **Active** mode and they have outstanding dues).
- A payment request with a Razorpay link when the shopkeeper hits "Send link".

## C2. Paying via the link

1. Customer taps the WhatsApp link → Razorpay's hosted page opens.
2. They pick UPI / card / netbanking.
3. Pay.
4. They get redirected to a "Payment received ✅" page on the shop's domain (`/pay/:orderId`).
5. They get a "payment received" WhatsApp from the shop within seconds.

That's it — no app to install, no account to create.

## C3. Stopping notifications

The customer can tell the shopkeeper to switch them to silent mode (the shop owner does this — there's no per-customer toggle in the MVP). Phase 2 will add a per-customer pause.

---

# Part D — Common operational tasks

## D1. Move data between machines

```bash
# Source VPS
./scripts/backup.sh /tmp
scp /tmp/skhata-*.sql.gz you@new-vps:/tmp/

# Target VPS (after bootstrap + .env)
gunzip -c /tmp/skhata-*.sql.gz \
  | docker compose exec -T postgres psql -U skhata -d skhata
```

## D2. Force a redeploy (after `.env` change)

```bash
docker compose down
./scripts/deploy.sh
```

## D3. Wipe the demo data & start clean

> ⚠️ Destroys all data.

```bash
docker compose down -v
./scripts/deploy.sh
```

## D4. View a specific user's data

```bash
docker compose exec postgres psql -U skhata -d skhata
\dt
SELECT id, name, email FROM users WHERE email='owner@shop.com';
SELECT * FROM customers WHERE shop_id='<shop_uuid>';
\q
```

## D5. Resend a WhatsApp link manually

If a customer says "I never got the link":

```bash
TOKEN=$(curl -s -X POST https://api.khata.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"shop@kirana.com","password":"PWD"}' | jq -r .token)

# resend the share for an existing order
curl -X POST https://api.khata.example.com/api/payments/orders/<order_id>/share \
  -H "Authorization: Bearer $TOKEN"
```
