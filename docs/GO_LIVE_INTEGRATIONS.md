# Go Live: Payments & WhatsApp

Tailored to the live deployment at **https://khata.dadashaik.com**. The code
for all of this is already built and tested — this is credentials + webhook
registration only. Everything is edited in `/opt/Smart-Digital-Khata/.env`
on the VPS, then `./scripts/deploy.sh` (which reads shared-VPS mode from
`.env` automatically).

While keys are blank the app runs fine — payments return "Razorpay keys are
not configured" and WhatsApp sends are skipped. Fill each section when ready;
they're independent.

---

## A. Razorpay — one-time payment links (collect dues)

This powers "Request payment via WhatsApp" and the customer pay flow.

1. **Get API keys**: Razorpay Dashboard → Account & Settings → API Keys →
   **Generate Live Key**. Copy Key ID (`rzp_live_…`) and Key Secret.
2. **Create a webhook**: Dashboard → Account & Settings → Webhooks → Add:
   - URL: `https://khata.dadashaik.com/api/webhooks/razorpay`
   - Secret: generate one — `openssl rand -hex 24` — and paste the same value
     into both Razorpay and `.env`.
   - Active events: `payment.captured`, `order.paid`, `payment_link.paid`
3. **`.env`**:
   ```
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=<the openssl value>
   ```
4. `./scripts/deploy.sh` → test: in a shop, Transactions → Request payment →
   the customer gets a real Razorpay link; paying it auto-records the payment
   and reduces their balance (via the webhook).

> Test mode first: use `rzp_test_…` keys and Razorpay test cards to rehearse
> the full loop before switching to live keys.

## B. Razorpay — recurring subscriptions (Pro / Family billing)

Turns the Settings → Billing plan chooser into real recurring charges.

1. Dashboard → Subscriptions → **Plans** → create two plans:
   - Pro — ₹299 / month → note the plan id (`plan_…`)
   - Family — ₹599 / month → note its plan id
2. Add these subscription events to the **same webhook** from A2:
   `subscription.activated`, `subscription.charged`, `subscription.pending`,
   `subscription.halted`, `subscription.cancelled`
3. **`.env`**:
   ```
   RAZORPAY_PLAN_PRO=plan_xxxxxxxx
   RAZORPAY_PLAN_FAMILY=plan_xxxxxxxx
   ```
4. `./scripts/deploy.sh`. Now "Choose" on a paid plan creates a real Razorpay
   subscription and returns an authorization link; the shop's plan flips to
   paid only when Razorpay confirms via `subscription.activated`. Renewals,
   failures, and cancellations are handled automatically. Until these plan IDs
   are set, plan switching stays in instant "manual" mode (fine for testing).

## C. WhatsApp Cloud API (Meta) — notifications & inbound commands

Powers transaction/payment messages, reminders, the daily digest, share-khata
links, and inbound `add/paid/upi/balance` commands.

1. **Meta setup**: developers.facebook.com → your app → WhatsApp → API Setup.
   Get a **permanent access token** (Business Settings → System Users →
   generate token with `whatsapp_business_messaging` + `_management`), the
   **Phone Number ID**, and the **WhatsApp Business Account ID**.
2. **Configure the webhook**: WhatsApp → Configuration → Webhook:
   - Callback URL: `https://khata.dadashaik.com/api/webhooks/whatsapp`
   - Verify token: any string — put the **same** value in `.env`
     `WHATSAPP_VERIFY_TOKEN` (one was already generated during setup)
   - Subscribe to the **messages** field
3. **`.env`**:
   ```
   WHATSAPP_API_TOKEN=EAAxxxxxxxx
   WHATSAPP_PHONE_NUMBER_ID=xxxxxxxx
   WHATSAPP_BUSINESS_ACCOUNT_ID=xxxxxxxx
   WHATSAPP_VERIFY_TOKEN=<same string as in Meta>
   ```
4. `./scripts/deploy.sh`. The verify handshake should go green in Meta
   immediately. Test: record a transaction for a customer whose phone is on
   your Meta test-recipient list → they get the WhatsApp message.

> **Test vs production numbers:** a fresh Meta number only messages numbers
> you add as test recipients. To message any customer, move the number to
> Production (App Review) — usually quick for utility messaging.

## D. Reminder template (deliver outside the 24h window)

Daily/active-mode reminders to customers who haven't messaged recently need a
Meta-approved template. Full steps: [`WHATSAPP_TEMPLATES.md`](./WHATSAPP_TEMPLATES.md).
Short version: create a Utility template named `dues_reminder` with body
`Hi {{1}}, this is a payment reminder from {{2}}. Your outstanding balance is
{{3}}...`, then set `.env`:
```
WHATSAPP_TEMPLATE_REMINDER=dues_reminder
WHATSAPP_TEMPLATE_LANG=en
```
Receipts and confirmations sent right after an interaction already work as
plain text without a template.

---

## E. Phase 2 — keys via the UI (no `.env` edit)

Phase 2 added in-app settings screens, so most keys can now be entered in the
browser instead of `.env`. `.env` still works and remains the fallback.

**Platform keys (WhatsApp + subscription-billing Razorpay)** — Admin →
`/admin/settings`:
- Razorpay (subscription billing) Key ID / Key Secret / Webhook Secret + the
  two plan IDs, with a **Test connection** button. This is the same platform
  account as §A/§B; the DB value overrides `.env` once set.
- WhatsApp phone-number-id / business-account-id / verify token / reminder
  template, with a **Send test message** button.

**Per-shop Razorpay (each shop collects to their OWN account)** — Shop owner →
`/settings` → *Payments (your Razorpay)*:
- Each shop pastes their own Key ID / Key Secret / Webhook Secret. Customer
  order/payment money then settles directly to that shop.
- The page shows that shop's **own webhook URL**
  (`…/api/webhooks/razorpay/shop/<token>`) — the owner adds *that* URL, with
  events `payment.captured`, `order.paid`, `payment_link.paid`, in **their**
  Razorpay dashboard. The platform webhook (§A) stays for subscription events
  only.

**Discovery** — same `/settings` page → *Discovery*: set city/area/lat/lng and
tick "list my shop" to appear in the customer PWA's shop finder.

> Monetization note: per-shop Razorpay means customer payments never touch the
> platform account, so the platform is **not** taking a commission on orders —
> revenue is the Pro/Family subscription only. See `docs/PRODUCT.md` §12.

## F. Seed demo commerce (optional, for a populated demo)

To make the new owner Catalog/Orders pages and the customer PWA non-empty for a
**demo**, seed products + sample orders onto the canonical demo shop
(`store01@demo.local`). Safe: it only touches that demo shop, is idempotent, and
refuses to run against production data unless you explicitly force it.

```bash
# on the VPS, inside the backend container
docker compose exec backend npm run seed:demo      # creates store01..store10 demo shops (skips existing)
docker compose exec backend npm run seed:commerce  # products + orders for store01's shop
```

Do **not** seed demo data into a database that holds real shops unless you mean
to — the guard requires `FORCE_DEMO=true` in production for exactly this reason.
Real shops start with an empty catalog by design and add their own products.

---

## Go-live checklist

- ☐ A — one-time payments: keys + webhook + test a real paid link
- ☐ B — subscriptions: two plan IDs + subscription events + test an upgrade
- ☐ C — WhatsApp: token/phone-id/verify + webhook green + test a message
- ☐ C — move the WhatsApp number to Production (App Review) to reach any customer
- ☐ D — submit the `dues_reminder` template; set env after approval
- ☐ E — each live shop connects their **own** Razorpay in `/settings` + adds their per-shop webhook URL
- ☐ Razorpay live keys (not test) once the loop is rehearsed
- ☐ Re-run `./scripts/backup.sh` and confirm the nightly cron after go-live
