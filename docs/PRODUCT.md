# Smart Digital Khata — Product Document

**Version 1.0 · September 2026 · Status: Phase 1 MVP built, audited, and integration-tested**

---

## 1. Executive Summary

Smart Digital Khata is a SaaS platform that digitizes the credit ledger ("khata") of Indian kirana stores and gets their dues paid faster — **without the shopkeeper ever calling a customer**. It replaces the paper notebook with a WhatsApp-native ledger, respectful automated reminders, and one-tap Razorpay payment links, and it is architected to grow into a local-commerce rail between customers and kiranas.

| | |
|---|---|
| **Phase 1 promise** | "Get your kirana dues paid faster — without calling customers" |
| **Phase 2 promise** | "Enable local commerce between customers and kiranas" |
| **Primary user** | Kirana / small retail shop owner (India-first) |
| **Delivery** | Mobile app (Expo), web dashboard, and WhatsApp itself |
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

**Phase 1 (this MVP): the collection machine.** Every transaction is captured in seconds (app, dashboard, or a WhatsApp message like `add 250 9876543210`). The system — not the shopkeeper — keeps the customer informed and nudged, with a tone the shopkeeper controls. When it's time to collect, a Razorpay link lands in the customer's WhatsApp and reconciles the ledger automatically the moment it's paid.

**Phase 2 (roadmap): the commerce rail.** Once shops and their customers transact on the platform, extend it: family members sharing one credit line with per-member limits, customers discovering and ordering from nearby kiranas, and the khata becoming the settlement layer for local commerce.

**Design principle:** the customer never needs an app, an account, or a password. Everything customer-facing happens in WhatsApp and on Razorpay-hosted pages.

---

## 4. Users & Personas

### P1 — Shop Owner ("Sharma ji", primary payer persona)
Runs a kirana with 50–300 credit customers. Smartphone-comfortable, WhatsApp-fluent, spreadsheet-averse. Wants dues collected without damaging relationships, and a truthful answer to "what's outstanding?" Pays for the product.

### P2 — Store Customer ("Ramesh", never installs anything)
Buys on credit weekly, pays monthly-ish. Responds well to polite, itemized WhatsApp messages; resents generic spam. Would pay immediately if a trustworthy link showed the exact amount.

### P3 — Platform Admin (operator/founder)
Runs the SaaS itself: onboards shops, watches platform stats, manages billing, keeps the system healthy. Explicitly non-technical operations: one-command deploy, guided runbooks.

---

## 5. Feature Specification — Phase 1 (Built)

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

---

## 6. User Journeys

**J1 — Daily sale on credit (10 seconds):** customer takes goods → shopkeeper texts `add 250 9876543210` → WhatsApp confirms to both sides (per mode) → balance updated everywhere.

**J2 — Collection without a call:** dashboard shows Ramesh at ₹1,250 → "Request payment" → amount + note → Ramesh gets a WhatsApp with a Razorpay link → pays UPI in bed → webhook reconciles, receipt sent, dashboard drops to ₹0 — no call was made.

**J3 — Month-end truth:** open dashboard → Today + Outstanding cards answer "how did we do, who owes what" in one glance → optional broadcast reminder to all debtors.

**J4 — Onboarding (under 10 minutes):** register with shop name → add 3–5 known debtors with balances → set notification mode → first `add` command from the registered phone just works.

---

## 7. Business Model

| | Free | Pro ₹299/mo | Family ₹599/mo |
|---|---|---|---|
| Customers | 50 | 1,000 | 5,000 |
| Notification modes | Silent + Smart | + Active (daily auto-reminders) | + Active |
| Payment links | ✅ | ✅ | ✅ |
| Family credit sharing | — | — | ✅ (Phase 2) |

Rationale: Free tier is a genuinely useful ledger (adoption wedge). The paid trigger is **Active mode** — automated collection is the moment the product provably pays for itself (one recovered ₹300 due covers the month). Family tier pre-sells the Phase 2 differentiator. Payment-link MDR pass-through and commerce take-rate are Phase 2 revenue options.

---

## 8. Technical Summary

**Stack:** Node.js 20 / Express · PostgreSQL 16 · Redis 7 + BullMQ · Next.js 14 · Expo RN · nginx · Docker Compose. Everything env-var configured; project-name-pinned Docker resources (`smart-digital-khata*`) give hard isolation from other workloads; dev and prod stacks run side-by-side isolated.

**Data model (8 tables):** users, shops, customers, transactions, payment_orders, subscriptions, notification_logs, processed_events (webhook dedupe) + `_migrations`. Money = paise integers everywhere.

**Integrations:** Razorpay (orders, hosted payment links, webhooks) and Meta WhatsApp Cloud API (send + inbound command parsing). Both degrade gracefully when unconfigured — the ledger works fully offline.

**Security posture (audited):** JWT auth with role gates and per-shop tenant scoping on every query; bcrypt-hashed passwords; parameterized SQL throughout; HMAC-verified webhooks; app + nginx rate limiting (5/min on auth); localhost-bound DB/Redis (Docker/UFW bypass closed); zero known dependency CVEs; secrets only via `.env`. Details: `docs/SECURITY.md` and `docs/GAP_FIXES.md`.

**Verification status:** full E2E integration test against live Postgres + Redis passed — registration→ledger→credit-limit enforcement→payment math→summaries→role gates→webhook rejection paths. CI runs tests + builds on every push; auto-deploy to VPS on merge to main.

**Operations:** one-command bootstrap and deploy; scripted health checks, migrations, backup, restore; runbooks for admin/store/customer in `docs/OPERATIONS.md`; troubleshooting per component in `docs/TROUBLESHOOTING.md`. Runs on any 2 GB KVM VPS (~₹350–700/mo all-in at MVP scale).

---

## 9. Roadmap

**Now → next 4 weeks (hardening the wedge)**
1. Razorpay **recurring subscriptions** (real billing for Pro/Family).
2. Transaction idempotency keys (double-tap safety on flaky networks).
3. Per-customer notification opt-out; Hindi + Hinglish message templates.
4. Owner-facing daily summary WhatsApp ("Aaj ka hisaab").
5. WhatsApp template-message approval for reminder delivery beyond the 24-hour session window (compliance with Meta messaging policy).

**Phase 2 — Family payments (Family plan activation)**
- Family group: one credit line, per-member sub-limits, one payer.
- Payment links addressed to the payer with the family's consolidated statement.

**Phase 2 — Local commerce readiness**
- Customer-side lightweight web app (still no install): view own khata across shops, pay any shop, order for pickup/delivery.
- Shop catalog (top 50 SKUs), order → khata entry pipeline.
- Settlement and take-rate layer on top of existing payment rails.

**Deliberately out of scope for MVP:** inventory management, GST invoicing, multi-branch chains, iOS-first polish, lending/credit-scoring products.

---

## 10. Success Metrics

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

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WhatsApp policy/template rejection | Reminders blocked | Template pre-approval in roadmap; transactional receipts remain in-session; SMS fallback possible |
| Reminder fatigue → customer backlash | Shop churn | Notification modes default to Smart; per-customer opt-out shipping next |
| Razorpay dependency | Payment outage | Provider-agnostic payment_orders schema; second PSP (Cashfree/PhonePe) can slot behind the same interface |
| Incumbents (Khatabook/OkCredit) add collection UX | Differentiation erosion | Ship Phase 2 family + commerce moat; WhatsApp-command capture is a distinct habit loop |
| Single-VPS operational fragility | Downtime | Health-check script + nightly backups + documented restore; migration path to managed DB when scale demands |

---

*Companion docs: `README.md` (index) · `docs/LOCAL_TESTING.md` · `docs/PRE_DEPLOYMENT_CHECKLIST.md` · `docs/DEPLOYMENT.md` · `docs/OPERATIONS.md` · `docs/SECURITY.md` · `docs/TROUBLESHOOTING.md` · `docs/GAP_FIXES.md`*
