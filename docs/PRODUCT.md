# Smart Digital Khata — Product Document

**Version 2.0 · September 2026 · Status: Phase 1 + Phase 2 built, audited, and deployed in production (https://khata.dadashaik.com)**

---

## 1. Executive Summary

Smart Digital Khata is a SaaS platform that digitizes the credit ledger ("khata") of Indian kirana stores and gets their dues paid faster — **without the shopkeeper ever calling a customer**. It replaces the paper notebook with a WhatsApp-native ledger, respectful automated reminders, and one-tap Razorpay payment links. On that trust rail it now runs a full **local-commerce layer** — a shared 1,615-SKU catalogue, consumer shop discovery, cart, orders, and fulfillment — deployed and live.

Both phases are shipped. The Phase-2 commerce build was followed by two "gap-fix" waves that deliberately re-targeted the product at **B/C-town and village shops**: regional-language catalogue and search, voice input, cash payments, loose/weighed selling, staff logins, and offline/2G resilience — the realities of shops outside metros.

| | |
|---|---|
| **Phase 1 promise** | "Get your kirana dues paid faster — without calling customers" |
| **Phase 2 promise** | "Enable local commerce between customers and kiranas" — **shipped** |
| **Primary user** | Kirana / small retail shop owner (India-first, B/C towns & villages) |
| **Delivery** | Mobile app (Expo), web dashboard, install-free consumer web app, and WhatsApp itself |
| **Monetization** | Freemium subscriptions: Free / Pro ₹299 / Family ₹599 per month |
| **Deployment** | Docker-first, one-command deploy, runs on any ₹350+/mo VPS |

---

## 2. Problem

India has ~12–13 million kirana stores, and informal credit ("udhaar") is how most of them retain customers. The paper khata that powers it has four structural failures:

1. **Collection friction.** Asking for money is socially awkward. Shopkeepers delay asking, customers delay paying, and working capital sits in a notebook. Collection typically requires an in-person ask or a phone call that strains the relationship.
2. **No visibility.** The shopkeeper cannot answer "how much is owed to me right now, and by whom?" without flipping pages. End-of-day reconciliation is manual and error-prone.
3. **Disputes.** A single handwritten ledger with no customer-visible copy invites "I already paid that" conversations.
4. **No payment rails.** Even when a customer wants to settle remotely, there's no link to pay against a specific balance — just a UPI ID and trust.

Existing digital khata apps digitized the notebook but largely kept the collection problem: reminders feel like spam, payment collection is bolted on, and the shopkeeper still does the chasing.

## 3. Product Vision

**Phase 1: the collection machine.** Every transaction is captured in seconds (app, dashboard, or a WhatsApp message like `add 250 9876543210`). The system — not the shopkeeper — keeps the customer informed and nudged, with a tone the shopkeeper controls. When it's time to collect, a Razorpay link lands in the customer's WhatsApp and reconciles the ledger automatically the moment it's paid.

**Phase 2 (shipped): the commerce rail.** On top of the khata rail the platform now runs local commerce end to end: family members share one credit line with per-member limits; customers discover nearby kiranas, browse a real catalogue, and place orders for pickup or delivery; and the order flows into the khata (or is paid online or in cash). Two follow-on waves hardened this for shops beyond the metros — a regional-language catalogue with multilingual and voice search, loose/weighed selling, cash on hand-over, staff logins, and offline/2G-tolerant khata sync.

**Design principle:** the customer never needs an app, an account, or a password to be reminded or to pay — that stays in WhatsApp and on Razorpay-hosted pages. For commerce, the consumer web app (`/c`) is deliberately install-free, lite, and offline-tolerant, in the shopper's own language.

---

## 4. Users & Personas

### P1 — Shop Owner ("Sharma ji", primary payer persona)
Runs a kirana with 50–300 credit customers. Smartphone-comfortable, WhatsApp-fluent, spreadsheet-averse. Wants dues collected without damaging relationships, and a truthful answer to "what's outstanding?" Pays for the product.

### P2 — Store Customer ("Ramesh", never installs anything)
Buys on credit weekly, pays monthly-ish. Responds well to polite, itemized WhatsApp messages; resents generic spam. Would pay immediately if a trustworthy link showed the exact amount.

### P3 — Platform Admin (operator/founder)
Runs the SaaS itself: onboards shops, watches platform stats, manages billing, keeps the system healthy. Explicitly non-technical operations: one-command deploy, guided runbooks.

---

## 5. Feature Specification — Phase 1: Khata & Collections (Built)

### 5.1 Ledger engine
- Three transaction types: **purchase** (credit extended), **cash**, **upi** (payments received); amounts stored in paise (integer-exact).
- Per-customer running balance, maintained transactionally with row-level locks (`SELECT … FOR UPDATE`) — concurrent entries can't corrupt a balance.
- Full history per customer; searchable customer directory (name/phone).
- Every entry records its **source**: manual, whatsapp, razorpay, api — an audit trail by construction.

### 5.2 WhatsApp transaction system
Inbound (shopkeeper texts the business number; sender must match a registered owner's phone):

| Command | Effect |
|---|---|
| `add 250 9876543210 tea & sugar` | Record ₹250 purchase, optional note |
| `paid 500 Ramesh` | Record ₹500 cash payment (name matching) |
| `upi 120 9876543210` | Record ₹120 UPI payment |
| `balance 9876543210` | Get the customer's outstanding |

Outbound: purchase confirmations, payment receipts, reminders, payment requests — all templated, all respecting the shop's notification mode. Message-ID deduplication guarantees a retried webhook never double-posts a transaction.

### 5.3 Notification modes (the "respect dial")
Per-shop setting; the product's key differentiator against spammy reminder apps:

| Mode | Behavior |
|---|---|
| **Silent** | Never auto-message. Owner shares manually. |
| **Smart** *(default)* | Payment receipts always; purchase confirmations only above ₹200; weekly cadence otherwise. |
| **Active** | Every transaction confirmed + automated daily 9:00 AM reminders to every customer with dues (BullMQ repeatable job, IST-aware). |

### 5.4 Payments (Razorpay)
- Shop requests payment → backend creates a **Razorpay-hosted Payment Link** → link is WhatsApp'd to the customer with amount and shop name.
- Customer pays by UPI/card/netbanking on Razorpay's page — no app, no login.
- Webhook (HMAC-verified, constant-time compare, event-ID deduped) marks the order paid, posts the ledger credit, updates the balance, and triggers the receipt message — fully automatic reconciliation.
- Post-payment landing page (`/pay/:orderId`) shows a branded confirmation.

### 5.5 Credit limit system
- Per-customer limit in ₹ (0 = unlimited). A purchase that would breach the limit is rejected with a structured 422 carrying limit/balance/attempted figures — the app can show exactly why.
- Payment reduces balance → headroom returns automatically.

### 5.6 Summary engine
- **Today:** purchases, collections, transaction count.
- **Range:** daily series up to 90 days (dashboard-ready).
- **Outstanding:** total receivables + ranked debtor list — the "who do I nudge?" view.

### 5.7 Subscriptions
- Plans: **Free** (50 customers, smart notifications) / **Pro ₹299/mo** (1,000 customers, active mode) / **Family ₹599/mo** (5,000 customers + Phase 2 family sharing).
- MVP: instant plan switching with validated plan codes; recurring Razorpay billing is the next milestone (§9).

### 5.8 Admin dashboard (Next.js)
Login/registration, KPI dashboard (today's purchases/collections, total outstanding, top debtors), customer management with credit limits, transaction entry, one-click "Request payment via WhatsApp", notification-mode settings. Dark, mobile-friendly UI.

### 5.9 Mobile app (Expo React Native)
Shopkeeper-focused: login (SecureStore token), dashboard KPIs with pull-to-refresh, customer list with balances, fast transaction entry (type pills → customer → amount). EAS build profiles for Play Store/App Store distribution.

### 5.10 Platform admin API
`/api/admin/*` (role-gated): platform stats (shops, users, transactions, outstanding total), shop directory with customer counts, user listing.

### 5.11 Families (Family plan)
A family group shares one credit line with a per-member sub-limit under a shared family limit — so a household of buyers rolls up to one payer and one statement while each member's exposure stays capped.

### 5.12 Staff accounts
Owners create additional shop logins for their staff (owner-managed CRUD, `is_active` enable/disable gate) — every staff query is scoped to the owner's shop. Login for owner / staff / admin is **phone-or-email + password**, so a worker with only a phone number can sign in.

---

## 6. Feature Specification — Phase 2: Local Commerce (Built & Deployed)

Phase 2 turns the trust rail into a storefront. It is live in production, and shaped by two follow-on waves that re-targeted it at shops in B/C towns and villages — where the shopper's language is regional, the network is 2G, and cash is still king.

### 6.1 Shop discovery
A public directory of opted-in shops (`/api/public/shops`) with city and text-search filters and nearest-first ranking from the shop's saved lat/lng. The consumer needs no app or account: they browse a shop at `/c/shop/<id>`, build a cart, place an order, and view their own khata with that shop.

### 6.2 Orders & fulfillment
Orders capture an item snapshot (name, unit price, quantity, line total). Per-shop fulfillment rules cover pickup-only, free delivery, or charged delivery keyed on minimum order value, distance radius, and delivery hours; the order total is `subtotal + delivery_fee`. The owner receives an alert on every new order, and moving an order to *completed* is what settles cash and closes it out.

### 6.3 Payment modes per order
Every order picks one of three modes at checkout:
- **On khata (credit)** — the order posts to the customer's ledger balance.
- **Pay online (prepaid)** — a Razorpay payment link, reconciled by webhook.
- **Pay cash** — no khata debit and no link; the order sits `pending` and is marked `paid` when the owner completes it on hand-over. Most rural orders settle this way.

### 6.4 Master catalogue, variants & localized catalogue
- **Master catalogue** — 1,615 shared base SKUs (category, subcategory, product, brand, pack, unit, indicative price). An owner "adds from catalogue," choosing SKUs into their shop **at their own price**; custom items an owner adds join the shared base.
- **Variants** — base SKUs group by product into brand × pack variants. Consumers see variant cards; the owner's add-from-catalogue groups variants with per-size price inputs and a bulk "Add selected."
- **Local-language catalogue** — a translation side-table renders the ~285-term grocery vocabulary into Hindi, Tamil, Telugu, Kannada, Malayalam & Urdu (≈1,042 translation rows in production). Catalogue browse and category labels return localized names (English fallback), and search matches the local name, English, or a romanized alias — while the English keys stay the stored filter values.
- **Product images** — upload with an emoji-tile fallback.

### 6.5 Loose / weighed selling
A product can be marked *sold by weight*: its price is then paise **per KG** and its unit is `kg`. Consumers get a 250 g / 500 g / 1 kg + custom weight picker; the weighed line total is recomputed **server-side** as `round(price_per_kg × weight_grams / 1000)` — the client-sent price is never trusted, and the weight is validated (1–100,000 g). This makes the catalogue honest for rice, dal, and sugar sold loose.

### 6.6 Offline / 2G resilience
Khata writes carry a client-generated request id and the create endpoint **replays them idempotently** — a retried or double-tapped write never double-debits. The frontend keeps an IndexedDB **outbox** that queues entries while offline and syncs them on reconnect, with an app-wide offline banner and a pending-count. The PWA service worker caches the app shell and API reads, so the ledger keeps working on a dropped 2G connection.

### 6.7 Voice & data-saver accessibility
- **Voice** (Web Speech, zero dependencies, hidden where unsupported): mic voice-search on the owner catalogue and consumer shop, 🔊 read-aloud of a customer's balance, and 🎤 voice-to-amount on the khata entry field, all in the active UI language.
- **Data-saver mode** — a per-device toggle (owner and consumer) that suppresses product-image fetches app-wide, falling back to emoji tiles to save 2G bytes.

### 6.8 Localization & sharing
- **UI languages** — en, hi, ta, te, kn, ml, ur (Urdu is right-to-left), with a first-visit language gate on `/c` and admin-editable runtime translation overrides.
- **Share your shop** — a Settings card with a QR to the consumer link plus Copy / Print, so an owner can put their storefront on a poster or a WhatsApp status.

---

## 7. User Journeys

**J1 — Daily sale on credit (10 seconds):** customer takes goods → shopkeeper texts `add 250 9876543210` → WhatsApp confirms to both sides (per mode) → balance updated everywhere.

**J2 — Collection without a call:** dashboard shows Ramesh at ₹1,250 → "Request payment" → amount + note → Ramesh gets a WhatsApp with a Razorpay link → pays UPI in bed → webhook reconciles, receipt sent, dashboard drops to ₹0 — no call was made.

**J3 — Month-end truth:** open dashboard → Today + Outstanding cards answer "how did we do, who owes what" in one glance → optional broadcast reminder to all debtors.

**J4 — Onboarding (under 10 minutes):** register with shop name → add 3–5 known debtors with balances → set notification mode → first `add` command from the registered phone just works.

---

## 8. Business Model

| | Free | Pro ₹299/mo | Family ₹599/mo |
|---|---|---|---|
| Customers | 50 | 1,000 | 5,000 |
| Notification modes | Silent + Smart | + Active (daily auto-reminders) | + Active |
| Payment links | ✅ | ✅ | ✅ |
| Local commerce (catalogue, orders, fulfillment) | ✅ | ✅ | ✅ |
| Family credit sharing | — | — | ✅ |

Rationale: Free tier is a genuinely useful ledger (adoption wedge). The paid trigger is **Active mode** — automated collection is the moment the product provably pays for itself (one recovered ₹300 due covers the month). Family tier unlocks the shared-credit-line feature. Local commerce ships to every tier for now while real adoption is observed; a commerce take-rate remains a future revenue option (see §13).

---

## 9. Technical Summary

**Stack:** Node.js 20 / Express · PostgreSQL 16 · Redis 7 + BullMQ · Next.js 14 (pages router) · Expo RN · nginx · Docker Compose. Everything env-var configured; project-name-pinned Docker resources (`smart-digital-khata*`) give hard isolation from other workloads; dev and prod stacks run side-by-side isolated.

**Data model:** the schema grows through 20 additive, idempotent migrations (`backend/migrations/0001`…`0020`), from the Phase-1 core (users, shops, customers, transactions, payment_orders, subscriptions, notification_logs, processed_events) through families, customer accounts, per-shop payment settings, products, orders, shop location, product images, i18n overrides, the master catalogue, fulfillment, staff accounts, order cash mode, transaction idempotency, the catalogue i18n side-table, and loose-selling columns. Money = paise integers everywhere.

**Integrations:** Razorpay (orders, hosted payment links, webhooks, recurring subscriptions — platform account *and* each shop's own connected account) and Meta WhatsApp Cloud API (send + inbound command parsing). Both degrade gracefully when unconfigured — the ledger works fully offline.

**Security posture (audited):** JWT auth with role gates and per-shop tenant scoping on every query; bcrypt-hashed passwords; parameterized SQL throughout; HMAC-verified webhooks; app + nginx rate limiting (5/min on auth); localhost-bound DB/Redis (Docker/UFW bypass closed); zero known dependency CVEs; secrets only via `.env`. Details: `docs/SECURITY.md` and `docs/GAP_FIXES.md`.

**Verification status:** full E2E integration test against live Postgres + Redis passed — registration→ledger→credit-limit enforcement→payment math→summaries→role gates→webhook rejection paths. CI runs tests + builds on every push; auto-deploy to VPS on merge to main.

**Operations:** one-command bootstrap and deploy; scripted health checks, migrations, backup, restore; runbooks for admin/store/customer in `docs/OPERATIONS.md`; troubleshooting per component in `docs/TROUBLESHOOTING.md`. Runs on any 2 GB KVM VPS (~₹350–700/mo all-in at MVP scale).

---

## 10. Roadmap

**Shipped since v1.0 (the collection wedge, hardened)**
- Razorpay **recurring subscriptions** (real billing for Pro/Family).
- Transaction **idempotency** keys — double-tap and offline-replay safety on flaky networks.
- Per-customer notification opt-out; template-based WhatsApp reminders; owner daily digest ("Aaj ka hisaab").

**Shipped — Phase 2 family & commerce**
- Families: one credit line, per-member sub-limits, one payer.
- Install-free consumer web app: shop discovery, own-khata view, cart, and orders for pickup/delivery.
- Master catalogue (1,615 SKUs) + variants, owner add-from-catalogue at own price, product images.
- Order payment modes: on khata / pay online / pay cash; per-shop fulfillment rules.

**Shipped — Wave 1 & Wave 2 (B/C-town & village fit)**
- Cash payments, owner order alerts, shop-QR sharing, variant grouping + bulk catalogue add, fulfillment, staff accounts.
- Offline/2G idempotent khata sync (outbox + service-worker API cache); local-language catalogue + multilingual search; voice input, loose/weighed selling, and data-saver mode.

**Next**
- Settlement and take-rate metering on top of the existing payment rails, if commerce adoption warrants it (see §13).
- WhatsApp template-message approval for reminder delivery beyond the 24-hour session window (Meta messaging-policy compliance).

**Deliberately out of scope:** inventory management, GST invoicing, multi-branch chains, iOS-first polish, lending/credit-scoring products.

---

## 11. Success Metrics

| Metric | Definition | MVP target (90 days) |
|---|---|---|
| Activated shops | ≥10 customers AND ≥20 transactions | 100 |
| **Collection cycle time** | Payment-link send → paid | < 24 h median |
| Link conversion | Paid links / sent links | > 40% |
| WhatsApp share of entries | Entries via `add`/`paid` commands | > 30% (habit signal) |
| Free → Pro conversion | Upgrades / activated shops | 8–10% |
| Reminder complaint rate | Opt-out or complaint / reminders sent | < 1% (respect dial working) |
| Uptime | Health-check pass rate | 99.5% |

**North star: total ₹ collected through the platform per month** — it captures adoption, trust, and the core promise in one number.

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WhatsApp policy/template rejection | Reminders blocked | Template pre-approval in roadmap; transactional receipts remain in-session; SMS fallback possible |
| Reminder fatigue → customer backlash | Shop churn | Notification modes default to Smart; per-customer opt-out shipped |
| Razorpay dependency | Payment outage | Provider-agnostic payment_orders schema; second PSP (Cashfree/PhonePe) can slot behind the same interface |
| Incumbents (Khatabook/OkCredit) add collection UX | Differentiation erosion | Phase 2 family + commerce moat shipped; regional-language, voice, cash & offline fit for B/C-town shops; WhatsApp-command capture is a distinct habit loop |
| Single-VPS operational fragility | Downtime | Health-check script + nightly backups + documented restore; migration path to managed DB when scale demands |

---

## 13. Monetization decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09 | **Commerce (catalog / online orders / discovery) monetization: DEFER — subscription only.** Commerce ships free to all paid tiers; pricing is unchanged. | Payments settle to each shop's **own** Razorpay, so the platform can't take a payment-time cut without a metering + invoicing system. Rather than build that speculatively, ship the features, watch real adoption, and revisit with usage data. Options kept on the table for later: (a) gate commerce behind Pro/Family, (b) metered commission on prepaid GMV, (c) hybrid. |

Revenue today therefore remains the **Pro/Family subscription** (`₹299` / `₹599` per month), billed on the platform Razorpay account (see `docs/GO_LIVE_INTEGRATIONS.md` §B). Per-shop Razorpay is used **only** to route customers' payments to the shop, never to bill the platform.

---

*Companion docs: `README.md` (index) · `docs/USER_MANUAL.md` · `docs/FAQ.md` · `docs/SAMPLE_DATA_AND_TESTING.md` · `docs/LOCAL_TESTING.md` · `docs/PRE_DEPLOYMENT_CHECKLIST.md` · `docs/DEPLOYMENT.md` · `docs/GO_LIVE_INTEGRATIONS.md` · `docs/OPERATIONS.md` · `docs/SECURITY.md` · `docs/TROUBLESHOOTING.md` · `docs/GAP_FIXES.md`*
