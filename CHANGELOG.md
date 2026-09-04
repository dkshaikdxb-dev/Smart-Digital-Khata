# Changelog

All notable changes to Smart Digital Khata.

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
