# Changelog

All notable changes to Smart Digital Khata.

## Wave 2 — September 2026

Lite/offline & regional-language fit for B/C-town and village shops. Migrations `0018`–`0020`.

### Offline / 2G khata sync (⑤)
- Idempotent khata writes: each entry carries a `client_request_id`; the create
  endpoint replays it safely so a retried or double-tapped write never
  double-debits (migration `0018`).
- IndexedDB **outbox** queues entries made while offline and syncs them on
  reconnect, with an app-wide offline banner and a pending-entry count.
- Service worker caches API reads (`skhata-api-v2`) alongside the app shell, so
  the ledger keeps working on a dropped connection.

### Local-language catalogue & search (⑥)
- `catalog_i18n` side-table translates the grocery vocabulary into
  hi / ta / te / kn / ml / ur (migration `0019`); `/api/catalog` and
  `/categories` return localized product and category names with an `?lang=`
  parameter (English fallback).
- Multilingual search matches the local name, English, or a romanized alias;
  English keys stay the stored filter values.

### Voice, loose selling & data-saver (⑦)
- Voice (Web Speech): mic voice-search on owner and consumer catalogues,
  read-aloud customer balance, and voice-to-amount on the khata entry field.
- **Loose / weighed selling**: `products.sold_by_weight` prices per KG; weighed
  order lines are recomputed server-side and the weight is validated — the
  client price is never trusted (migration `0020`). Consumer weight picker
  (250 g / 500 g / 1 kg + custom).
- **Data-saver** per-device toggle suppresses product-image fetches to save 2G
  bytes.

## Wave 1 — September 2026

Commerce completeness for real kirana workflows. Migrations `0015`–`0017`.

### Orders & payments
- **Cash payment mode** on orders — no khata debit and no online link; the order
  stays `pending` and is marked `paid` when the owner completes it (migration
  `0017`).
- Owner **order alerts** on every new order.
- **Fulfillment** rules per shop: pickup-only / free / charged delivery keyed on
  minimum order value, distance radius and delivery hours; total = subtotal +
  delivery fee (migration `0015`).

### Catalogue
- **Variant grouping**: base SKUs group by product into brand × pack variants;
  consumer variant cards and an owner bulk "Add selected" with per-size price
  inputs.

### Staff & growth
- **Staff accounts**: owner-managed additional shop logins with an active/inactive
  gate; phone-or-email login for owner / staff / admin (migration `0016`).
- **Share your shop**: Settings card with a QR to the consumer link plus
  Copy / Print.

## [Unreleased]

### Platform & deployment
- Live in production at https://khata.dadashaik.com (shared Hostinger KVM,
  behind the existing nginx proxy, coexisting with other apps).
- Shared-VPS deploy mode; network join made permanent so neighbour redeploys
  can't sever routing.
- Installable PWA (add to home screen, offline shell, app icon).
- GitHub Actions auto-deploy to the VPS on push to `main`.

### Shop dashboard
- Customer detail page: full ledger, edit/archive, one-tap reminder,
  share-khata link, inline transaction entry.
- "Remind all dues" broadcast; transaction history filters.
- Responsive tables (stacked cards on phones).

### Platform admin
- Shop management: detail view, plan changes, suspend/reactivate
  (enforced at login), MRR + plan breakdown.

### Growth features
- Razorpay recurring subscriptions (Pro/Family) with lifecycle webhooks.
- Template-based WhatsApp reminders; per-customer notification opt-out.
- Owner daily digest ("Aaj ka hisaab").
- Customer self-view khata link (no install for customers).

### Core (Phase 1 MVP)
- WhatsApp transaction commands, ledger (purchase/cash/UPI), credit limits,
  notification modes, Razorpay payment links, summaries, subscriptions,
  admin dashboard, Expo mobile app.
