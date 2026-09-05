# Sample Data & Functional Testing

How to populate Smart Digital Khata with sample data (locally or on prod) and
how to verify every major feature — server-side flows via the runnable smoke
test, client-only features via a manual checklist.

For the local stack itself (Docker Compose, ports, migrations) see
[`LOCAL_TESTING.md`](./LOCAL_TESTING.md). For payments/WhatsApp credentials see
[`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).

Money is **integer paise** everywhere (display ₹ = paise / 100).

---

## 1. Sample / seed data

All seeders are `npm` scripts in `backend/` (`backend/package.json`). Run them
inside the backend container (`docker compose exec backend …`) or, in a local
non-Docker setup, from `backend/` with a valid `DATABASE_URL` in `.env`.

| Script | What it loads | Prod guard |
|---|---|---|
| `npm run migrate` | Applies SQL migrations `0001..0020` (schema). Additive, idempotent, recorded in `_migrations`. | none — always safe |
| `npm run seed` | Creates the platform **admin** user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Skips if it exists. | refuses a weak/CHANGE_ME `ADMIN_PASSWORD` |
| `npm run import:catalog` | **1,615** shared base SKUs (`src/data/catalog-seed.json`) into `catalog_items`. Real base data — UPSERT by `sku`, idempotent. Only touches global seed rows (never shop-owned custom items). | **none** — allowed in production |
| `npm run import:catalog-i18n` | **1,042** catalog translations (`src/data/catalog-i18n.json`) into `catalog_i18n` for hi/ta/te/kn/ml/ur. UPSERT by `(term_type, term_en, lang)`, idempotent. Never touches `catalog_items`. | **none** — allowed in production |
| `npm run seed:demo` | Demo shops `store01..store10` (owners `storeNN@demo.local`) + demo customers. Idempotent (skips existing). | **refuses in production** unless `FORCE_DEMO=true` |
| `npm run seed:commerce` | ~50 bilingual demo products + variants + sample orders on the canonical demo shop (`store01@demo.local`); marks it listed with a location and **prints the consumer link**. Reseeds that demo shop's catalog on each run. | **refuses in production** unless `FORCE_DEMO=true` |

### Local (Docker) — a populated demo from scratch

```bash
docker compose up -d --build
./scripts/migrate.sh                        # or: docker compose exec backend npm run migrate
docker compose exec backend npm run seed            # admin user
docker compose exec backend npm run import:catalog       # 1,615 base SKUs
docker compose exec backend npm run import:catalog-i18n  # 1,042 translations
docker compose exec backend npm run seed:demo            # demo shops
docker compose exec backend npm run seed:commerce        # demo products + orders (prints consumer link)
```

### Production (VPS)

The base catalog and translations are **real data** and carry no demo guard:

```bash
# inside the backend container on the VPS
docker compose exec backend npm run import:catalog
docker compose exec backend npm run import:catalog-i18n
```

Seeding **demo** shops/products into a production DB requires an explicit
override (they only ever touch the demo shop, never real shops):

```bash
docker compose exec -e FORCE_DEMO=true backend npm run seed:demo
docker compose exec -e FORCE_DEMO=true backend npm run seed:commerce
```

### GitHub Actions (manual, `workflow_dispatch`)

The same three loaders are wired as **manual** workflows that SSH into the VPS
and run the script inside the backend container (Actions tab → *Run workflow*):

| Workflow file | Runs on the VPS | Notes |
|---|---|---|
| `.github/workflows/import-catalog.yml` | `npm run import:catalog` | real base data, no `FORCE_DEMO` |
| `.github/workflows/import-catalog-i18n.yml` | `npm run import:catalog-i18n` | real i18n data, no `FORCE_DEMO` |
| `.github/workflows/seed-demo.yml` | `seed:demo` + `seed:commerce` with `FORCE_DEMO=true` | demo only; touches the demo shop, prints the consumer link in the run log |

---

## 2. Functional test walkthrough

### 2a. Server-side — the smoke test

`scripts/smoke-test.sh` exercises the core server functionality end to end and
prints PASS/FAIL per check with a final summary (non-zero exit on any failure).
It needs only **bash + curl + python3** and creates its own throwaway shop, so
it is idempotent and safe to run repeatedly against a dev box or a deployment.

```bash
./scripts/smoke-test.sh                                  # http://localhost:4000
BASE_URL=https://khata.dadashaik.com ./scripts/smoke-test.sh
```

What it covers: **health**; **register shop**; **login by phone and by email**;
**add customer**; **khata purchase with an idempotent replay** (same
`client_request_id` → one debit); **credit-limit block** (422); **a normal
product and a `sold_by_weight` product** (unit forced to `kg`); **localized
catalogue search** (`?lang=hi` returns `product_local`); consumer OTP login; a
**CASH order** (no khata debit, `payment_status=pending`), a **CREDIT order**
(khata debited by the total), and a **WEIGHED order** (250 g of a ₹60/kg item =
1500 paise, recomputed server-side, forged client price ignored); and the owner
**completing the cash order** so its `payment_status` flips to `paid`.

> The consumer OTP endpoints (`/api/customer-auth/*`) are rate-limited to 5
> requests/minute/IP. A single run uses two of them, so back-to-back re-runs
> within a minute can trip the guard on `verify-otp` — wait ~60 s between runs.
> The OTP `dev_code` is only returned when the server runs with
> `NODE_ENV != production`, so the consumer-order checks are for non-prod runs;
> against production the script still validates every non-consumer flow.

**Latest passing run** (local backend, Postgres 16, 20 migrations applied):

```
Smart Digital Khata smoke test
Target: http://localhost:4000

1. Health
  PASS  GET /api/health returns 200
  PASS  health status == ok

2. Auth — register shop, login by email and phone
  PASS  register shop returns 201
  PASS  register returned a JWT
  PASS  register returned a shop id
  PASS  login by email returns 200
  PASS  login by email returned a JWT
  PASS  login by phone returns 200
  PASS  login by phone returned a JWT

3. Customers, khata purchase, idempotent replay, credit-limit block
  PASS  add customer returns 201
  PASS  customer created with an id
  PASS  khata purchase returns 201
  PASS  balance after ₹100 purchase == 10000 paise
  PASS  idempotent replay keeps balance == 10000 (one debit)
  PASS  idempotent replay returns the same transaction id
  PASS  first ₹300 purchase under limit returns 201
  PASS  over-limit purchase blocked with 422

4. Products — a normal item and a sold_by_weight (loose) item
  PASS  add normal product returns 201
  PASS  normal product sold_by_weight == false
  PASS  add weighed product returns 201
  PASS  weighed product sold_by_weight == true
  PASS  weighed product unit forced to kg

5. Catalogue — localized search (?lang=hi returns product_local)
  PASS  add custom catalog item returns 201
  PASS  localized catalog search returns 200
  PASS  search found the catalog item
  PASS  ?lang=hi item carries a product_local field

6. Consumer orders — cash (no khata), credit (khata debit), weighed
  PASS  request-otp returns 200
  PASS  OTP dev_code returned for test login
  PASS  verify-otp returns 200
  PASS  place CASH order returns 201
  PASS  cash order total == 5000 paise
  PASS  cash order payment_status == pending
  PASS  khata balance after CASH order == 0 (no debit)
  PASS  place CREDIT order returns 201
  PASS  khata balance after CREDIT order == 2500 (debited)
  PASS  place WEIGHED order returns 201
  PASS  weighed line: 250g x ₹60/kg == 1500 paise (server-recomputed)
  PASS  weighed order total == 1500 paise (forged client price ignored)

7. Owner completes the CASH order → payment_status becomes paid
  PASS  mark cash order completed returns 200
  PASS  completed order status == completed
  PASS  completed cash order payment_status == paid

Summary
  41 checks · 41 passed · 0 failed

SMOKE TEST PASSED
```

### 2b. Client-only features — manual checklist

These live in the browser (PWA) or depend on device APIs and are **not** covered
by the smoke test. Verify them by hand. Seed a demo shop first (§1) so the
catalogue and consumer link are populated; the consumer PWA is served at
`/c/shop/<shopId>` (the `seed:commerce` run prints the link).

| # | Feature | How to test | Expected result |
|---|---|---|---|
| 1 | **Offline queue / sync** (khata) | Open the owner app, go offline (DevTools → Network → Offline, or airplane mode). Record a khata purchase. | An app-wide **offline banner** appears with a **pending count**; the entry is queued in the browser's IndexedDB outbox and the UI shows it optimistically. |
| 2 | **Offline sync on reconnect** | Go back online. | The queued entry(ies) sync automatically; each carries its `client_request_id`, so a retried write is **not double-debited** (idempotent replay). Pending count returns to 0. |
| 3 | **Voice — search** | On the owner catalogue or consumer shop, tap the 🎤 mic on the search field and speak a product name. | Speech is transcribed into the search box and results filter. The mic control is **hidden entirely** where the Web Speech API is unsupported. Recognition language follows the UI language (`xx-IN`). |
| 4 | **Voice — read-aloud balance** | On a customer's ledger, tap the 🔊 read-aloud control. | The customer's balance is spoken aloud in the UI language. |
| 5 | **Voice — amount entry** | On the khata entry amount field, tap the 🎤 and speak an amount. | The spoken number is filled into the amount field. |
| 6 | **Data-saver mode** | In owner or consumer **Settings**, toggle **Data-saver** on. Browse the catalogue/shop. | Product **image fetches are suppressed app-wide**; every product shows the emoji-tile placeholder instead. The toggle is per-device (localStorage) and persists across reloads. |
| 7 | **Share-shop QR** | Owner **Settings → Share your shop** card. | A **QR code** to the consumer link renders, with **Copy** and **Print** actions. Scanning the QR opens `/c/shop/<shopId>`. |
| 8 | **RTL (Urdu)** | Switch the UI language to **Urdu (ur)** (first-visit gate on `/c`, or the language switcher). | The document flips to **right-to-left** (`<html dir="rtl">`); layout mirrors correctly. Switching back to any LTR language restores `dir=ltr`. |
| 9 | **Localized catalogue (UI)** | Switch language to Hindi/Tamil/etc. and browse the owner catalogue or consumer shop. | Product names, category labels, and search show the **local-language** term (with English fallback for anything untranslated). English keys remain the filter values. Requires `import:catalog-i18n` to have been run. |
| 10 | **Weighed / loose selling (consumer)** | In the consumer shop, open a product the owner marked *sold loose*. | A **250 g / 500 g / 1 kg + custom weight** picker appears; the line price is computed from the per-kg price. Placing the order stores the server-recomputed line total (verified server-side in the smoke test). |
| 11 | **PWA install / offline shell** | Load the app, then reload while offline. | The service worker serves the cached app shell (`skhata-v2` / `skhata-api-v2`) and `offline.html` for uncached navigations; the owner and customer manifests allow install-to-home-screen. |

> Payments (Razorpay) and WhatsApp messaging are **not** in either lane above —
> they require live external credentials. Rehearse those against test-mode keys
> and Meta test recipients per [`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).
