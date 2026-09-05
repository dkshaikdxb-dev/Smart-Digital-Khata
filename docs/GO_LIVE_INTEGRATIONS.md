# Go Live: External Integrations (Razorpay + WhatsApp)

Smart Digital Khata has exactly **two** external dependencies: **Razorpay**
(payments & subscriptions) and the **WhatsApp Cloud API** (messaging). Everything
else — auth, ledger, credit limits, orders, catalogue, summaries, admin — runs
with no third-party service.

The code for both integrations is already built and tested. Going live is a
matter of **credentials + webhook registration**, not new development. While the
keys are blank the app runs fine: payment calls return *"Razorpay keys are not
configured"* and WhatsApp sends are skipped silently — so you can launch the
khata/orders features first and switch payments/messaging on later. The two
integrations are independent of each other.

On the live deployment (**https://khata.dadashaik.com**) config lives in
`/opt/Smart-Digital-Khata/.env` on the VPS; edit it and run `./scripts/deploy.sh`.
Most keys can **also** be entered through the in-app admin/owner settings screens
(see §E) — the DB value then overrides `.env`.

---

## External dependencies at a glance

| Dependency | What it powers in the app | Required env vars | Official link |
|---|---|---|---|
| **Razorpay — platform account** | Subscription billing only (Pro ₹299 / Family ₹599 per month) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_PRO`, `RAZORPAY_PLAN_FAMILY` | https://razorpay.com/ |
| **Razorpay — per-shop account** | Each shop collects its own customer money: dues payment links + prepaid orders | Stored **per shop** in the DB via *Settings → Payments* (Key ID / Key Secret / Webhook Secret), not in `.env` | https://dashboard.razorpay.com/app/keys |
| **WhatsApp Cloud API (Meta)** | Transaction/payment/order messages, reminders, daily digest, share-khata links, inbound `add/paid/upi/balance` commands, customer login OTP | `WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_TEMPLATE_REMINDER`, `WHATSAPP_TEMPLATE_LANG` | https://business.whatsapp.com/ |

**Webhook paths the app exposes** (all under the same-origin `/api` mount):

| Method + path | Verified with | Handles |
|---|---|---|
| `POST /api/webhooks/razorpay` | platform `RAZORPAY_WEBHOOK_SECRET` | `subscription.*` events **only** |
| `POST /api/webhooks/razorpay/shop/<token>` | that shop's own webhook secret | payment events for that shop |
| `GET /api/webhooks/whatsapp` | `WHATSAPP_VERIFY_TOKEN` | Meta verification handshake |
| `POST /api/webhooks/whatsapp` | Meta delivery | inbound messages / status |

> **Important routing detail (matches the code):** customer money — dues payment
> links *and* prepaid order links — always uses the **shop's own** Razorpay
> account and settles on the **per-shop** webhook. The **platform** Razorpay
> account and its webhook are used **only** for Pro/Family subscription billing.

---

## A. Razorpay — per-shop payments (dues links + prepaid orders)

Each shop connects **its own** Razorpay account so customer payments settle
directly to the shop (the platform takes no cut — revenue is the subscription in
§B). This powers "Request payment" dues links and the customer *Pay online*
order option.

Because keys are per-shop, this is configured through the **owner UI**, not
`.env` (see §E for the exact screen). For each shop:

1. **Get API keys**: Razorpay Dashboard → **Account & Settings → API Keys**
   (https://dashboard.razorpay.com/app/keys) → generate a key. Start with
   test-mode `rzp_test_…`, switch to `rzp_live_…` once rehearsed. Copy the Key ID
   and Key Secret.
2. In the app, shop owner → **`/settings` → *Payments (your Razorpay)*** → paste
   Key ID / Key Secret / Webhook Secret and use **Test connection** to confirm.
3. **Register the per-shop webhook** in that shop's Razorpay dashboard
   (**Account & Settings → Webhooks**, https://razorpay.com/docs/webhooks/):
   - URL: the shop-specific URL the settings page shows —
     `https://khata.dadashaik.com/api/webhooks/razorpay/shop/<token>`
   - Secret: the same value entered as the shop's Webhook Secret in step 2
     (generate one with `openssl rand -hex 24`)
   - Active events: `payment.captured`, `order.paid`, `payment_link.paid`
4. **Test**: in that shop, create a dues payment link or place a customer *Pay
   online* order → pay it with a Razorpay **test card** → the webhook marks the
   payment/order paid and (for a dues settlement) reduces the customer's balance.

## B. Razorpay — platform subscriptions (Pro / Family billing)

Turns the Settings → Billing plan chooser into real recurring charges on the
**platform** Razorpay account. Docs:
https://razorpay.com/docs/payments/subscriptions/

1. Platform Razorpay Dashboard → **Subscriptions → Plans**
   (https://razorpay.com/docs/payments/subscriptions/) → create two plans:
   - Pro — ₹299 / month → note the plan id (`plan_…`)
   - Family — ₹599 / month → note its plan id
2. Create the **platform** webhook (Account & Settings → Webhooks):
   - URL: `https://khata.dadashaik.com/api/webhooks/razorpay`
   - Secret: `openssl rand -hex 24` — paste the same value into
     `RAZORPAY_WEBHOOK_SECRET` (or the Admin settings screen)
   - Active events: `subscription.activated`, `subscription.charged`,
     `subscription.pending`, `subscription.halted`, `subscription.cancelled`
     (the handler also tolerates `subscription.completed` / `subscription.expired`)
3. **`.env`** (platform account keys + plan ids):
   ```
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=<the openssl value>
   RAZORPAY_PLAN_PRO=plan_xxxxxxxx
   RAZORPAY_PLAN_FAMILY=plan_xxxxxxxx
   ```
4. `./scripts/deploy.sh`. Now "Choose" on a paid plan creates a real Razorpay
   subscription and returns an authorization link; the shop's plan flips to paid
   only when Razorpay confirms via `subscription.activated`. Renewals, failures,
   and cancellations are handled automatically. **Until the plan IDs are set,
   plan switching stays in instant "manual" mode** (fine for dev/demo).

> **Test mode first:** rehearse both §A and §B end to end with `rzp_test_…` keys
> and Razorpay test cards before switching to live keys.

---

## C. WhatsApp Cloud API (Meta) — messaging & inbound commands

Powers transaction/payment/order messages, dues reminders, the daily "Aaj ka
hisaab" digest, share-khata links, customer-login OTP codes, and inbound
`add/paid/upi/balance` commands. Cloud API docs:
https://developers.facebook.com/docs/whatsapp/cloud-api

1. **Meta setup**: https://developers.facebook.com/ → your app → **WhatsApp →
   API Setup**. Obtain:
   - a **permanent access token** (Business Settings → System Users → generate a
     token with `whatsapp_business_messaging` + `whatsapp_business_management`)
   - the **Phone Number ID**
   - the **WhatsApp Business Account ID**
2. **Configure the webhook**: WhatsApp → **Configuration → Webhook**:
   - Callback URL: `https://khata.dadashaik.com/api/webhooks/whatsapp`
   - Verify token: any string — put the **same** value in `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field
   The `GET` verification handshake compares `hub.verify_token` against
   `WHATSAPP_VERIFY_TOKEN`; it should go green in Meta immediately after deploy.
3. **`.env`**:
   ```
   WHATSAPP_API_URL=https://graph.facebook.com/v18.0
   WHATSAPP_API_TOKEN=EAAxxxxxxxx
   WHATSAPP_PHONE_NUMBER_ID=xxxxxxxx
   WHATSAPP_BUSINESS_ACCOUNT_ID=xxxxxxxx
   WHATSAPP_VERIFY_TOKEN=<same string as in Meta>
   ```
   `WHATSAPP_API_URL` defaults to `https://graph.facebook.com/v18.0` and rarely
   needs changing.
4. `./scripts/deploy.sh`. **Test**: record a transaction for a customer whose
   phone is on your Meta test-recipient list → they receive the WhatsApp message.

> **Test vs production numbers:** a fresh Meta number only messages numbers you
> add as test recipients. To message any customer, move the number to Production
> (App Review) — usually quick for utility messaging.

## D. Reminder template (deliver outside the 24h window)

WhatsApp only delivers free-form text inside the 24-hour customer-service window.
Dues reminders usually fall **outside** it and need a **Meta-approved template**.
Full steps: [`WHATSAPP_TEMPLATES.md`](./WHATSAPP_TEMPLATES.md). Short version:
create a **Utility** template named `dues_reminder` with body

```
Hi {{1}}, this is a payment reminder from {{2}}.
Your outstanding balance is {{3}}...
```

(`{{1}}` customer name · `{{2}}` shop name · `{{3}}` amount), then set:

```
WHATSAPP_TEMPLATE_REMINDER=dues_reminder
WHATSAPP_TEMPLATE_LANG=en
```

Receipts/confirmations sent right after an interaction already work as plain text
without a template. If `WHATSAPP_TEMPLATE_REMINDER` is blank, reminders fall back
to plain session text.

---

## E. Keys via the UI (no `.env` edit)

Phase 2 added in-app settings screens, so most keys can be entered in the browser.
`.env` still works and remains the fallback — the DB value overrides `.env` once
set (`backend/src/config/settings.js`).

**Platform keys (subscription-billing Razorpay + WhatsApp)** — Admin →
`/admin/settings`:
- Razorpay (subscription billing) Key ID / Key Secret / Webhook Secret + the two
  plan IDs, with a **Test connection** button (this is the §B platform account).
- WhatsApp phone-number-id / business-account-id / verify token / reminder
  template, with a **Send test message** button.

**Per-shop Razorpay (each shop collects to their OWN account)** — Shop owner →
`/settings` → *Payments (your Razorpay)*:
- Each shop pastes their own Key ID / Key Secret / Webhook Secret. Customer
  order/payment money then settles directly to that shop.
- The page shows that shop's **own** webhook URL
  (`…/api/webhooks/razorpay/shop/<token>`) — the owner registers *that* URL, with
  events `payment.captured`, `order.paid`, `payment_link.paid`, in **their**
  Razorpay dashboard. The platform webhook (§B) stays for subscription events only.

**Discovery** — same `/settings` page → *Discovery*: set city/area/lat/lng and
tick "list my shop" to appear in the customer PWA's shop finder.

> Monetization note: per-shop Razorpay means customer payments never touch the
> platform account, so the platform takes **no** commission on orders — revenue
> is the Pro/Family subscription only.

## F. Seed demo commerce (optional)

To make the owner Catalog/Orders pages and the customer PWA non-empty for a
**demo**, seed products + sample orders onto the canonical demo shop
(`store01@demo.local`). Safe: it only touches that demo shop, is idempotent, and
refuses to run against production data unless you explicitly force it. Full
details in [`SAMPLE_DATA_AND_TESTING.md`](./SAMPLE_DATA_AND_TESTING.md).

```bash
# on the VPS, inside the backend container
docker compose exec -e FORCE_DEMO=true backend npm run seed:demo      # creates store01..store10 demo shops (skips existing)
docker compose exec -e FORCE_DEMO=true backend npm run seed:commerce  # products + orders for store01's shop
```

Real shops start with an empty catalog by design and add their own products —
the `FORCE_DEMO=true` guard exists precisely so demo data never lands in a
database that holds real shops by accident.

---

## Go-live checklist

- ☐ **A** — per-shop payments: each live shop connects their **own** Razorpay in
  `/settings`, registers their per-shop webhook URL with the three payment
  events, and tests a real (test-card first) paid link
- ☐ **B** — subscriptions: platform keys + two plan IDs + `RAZORPAY_WEBHOOK_SECRET`,
  platform webhook with the subscription events, and test an upgrade
- ☐ **C** — WhatsApp: token / phone-id / business-account-id / verify token,
  webhook verification green, and a test message delivered
- ☐ **C** — move the WhatsApp number to Production (App Review) to reach any customer
- ☐ **D** — submit the `dues_reminder` Utility template; set
  `WHATSAPP_TEMPLATE_REMINDER` / `WHATSAPP_TEMPLATE_LANG` after approval
- ☐ Switch Razorpay from `rzp_test_…` to `rzp_live_…` once the loop is rehearsed
- ☐ Run `./scripts/smoke-test.sh` against the deployment to confirm the core
  server flows still pass (see [`SAMPLE_DATA_AND_TESTING.md`](./SAMPLE_DATA_AND_TESTING.md))
- ☐ Re-run `./scripts/backup.sh` and confirm the nightly cron after go-live
