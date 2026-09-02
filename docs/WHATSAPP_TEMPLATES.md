# WhatsApp Template Messages

WhatsApp only delivers **free-form text** inside a 24-hour "customer service
window" that opens when the customer last messaged you. Dues reminders usually
fall **outside** that window, so they require a **Meta-approved template**.
Receipts and purchase confirmations right after an interaction are typically
in-window and keep working as plain text.

## 1. Create the template in Meta

Meta Business Suite → WhatsApp Manager → **Message templates** → Create:

| Field | Value |
|---|---|
| Name | `dues_reminder` (any name; must match `.env`) |
| Category | **Utility** (transaction-related; approval is easier than Marketing) |
| Language | English (add Hindi as a second language later) |

**Body:**

```
Hi {{1}}, this is a payment reminder from {{2}}.
Your outstanding balance is {{3}}.
You can pay in person or ask the shop for a payment link. Thank you!
```

Variable order matters — the app fills them as:
`{{1}}` customer name · `{{2}}` shop name · `{{3}}` amount (e.g. ₹1,250.00).

Submit and wait for approval (minutes to ~24h for Utility templates).

## 2. Configure the app

In `.env`:

```
WHATSAPP_TEMPLATE_REMINDER=dues_reminder
WHATSAPP_TEMPLATE_LANG=en
```

Redeploy (`./scripts/deploy.sh`). From then on all reminder sends
(daily active-mode reminders, manual "remind" actions, broadcasts) use the
template; if the variable is blank the app falls back to plain session text.

## 3. Hindi variant (optional)

Add a translation to the same template in WhatsApp Manager, then set
`WHATSAPP_TEMPLATE_LANG=hi`. Per-shop language selection is on the roadmap.

## Notes & policy

- Utility templates are billed per conversation by Meta — see their pricing.
- Do not put promotional content in a Utility template; Meta rejects or
  re-categorizes it, and reminder deliverability suffers.
- Keep an eye on quality rating (WhatsApp Manager) — customer blocks lower
  it; the per-customer mute toggle in the dashboard exists to prevent that.
