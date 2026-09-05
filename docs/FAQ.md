# Smart Digital Khata — Frequently Asked Questions

Short, honest answers to the questions shop owners, staff, and customers ask most. For
step-by-step instructions, see the [`USER_MANUAL.md`](./USER_MANUAL.md). For turning on
payments and WhatsApp, see [`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).

**Jump to:** [Account & login](#account--login) · [Khata & credit](#khata--credit) ·
[Payments](#payments) · [Catalogue & selling](#catalogue--selling) ·
[Orders & delivery](#orders--delivery) · [Language & accessibility](#language--accessibility) ·
[Offline & data](#offline--data) · [Staff](#staff) · [Billing & plans](#billing--plans) ·
[Privacy & security](#privacy--security)

---

## Account & login

**Q: How do I create a shop?**
Choose **Register**, enter your name, email, phone, a password, and your shop name. Your shop
is created and you become its owner, on the Free plan with Smart reminders.

**Q: Can I log in with my phone number instead of email?**
Yes. Owners and admins can sign in with **either** email **or** phone plus password. Staff
sign in with their **phone number**. If two active accounts somehow share one phone, the app
asks you to sign in with email instead.

**Q: I forgot my password — what now?**
There is no self-service password reset in the app today. Ask whoever runs your Smart Digital
Khata service (the platform admin) to help. Staff passwords can be reset by the shop **owner**
from the Staff screen.

**Q: Do customers need an account or app to buy from me?**
No. Customers can browse your shop with no login at all. They only log in — with a one-time
code on WhatsApp — when they want to place an order or view their own khata.

---

## Khata & credit

**Q: What are the three entry types?**
**Purchase** (sold on credit — balance goes up), **Cash** (payment received — balance down),
and **UPI** (payment received — balance down).

**Q: How do credit limits work?**
Set a limit per customer (0 means no limit). If a purchase would push them over the limit, the
app blocks it and shows the limit, current balance, and the amount attempted. Take a payment
and the headroom returns.

**Q: What is a family and how is its credit shared?**
A family groups several customers under one shared credit line. A credit purchase is checked
against three things: the member's own limit, their per-member **sub-limit**, and the
**shared family limit** measured against everyone's combined balance. Exceeding any one blocks
the purchase. You can send one reminder to the family's chosen **payer** for the whole family's
balance.

**Q: Can I stop reminders for just one customer?**
Yes. Switch off that customer's notifications and they receive no automatic messages, whatever
the shop-wide mode is.

**Q: What is "Aaj ka hisaab"?**
An optional end-of-day WhatsApp summary sent to **you, the owner**: credit sales today, amount
collected, number of entries, and total outstanding. Turn on **Daily digest** in Settings. It
is separate from customer reminders.

**Q: What do the notification modes mean?**
**Silent** — nothing automatic. **Smart** (default) — payment receipts always, purchase
confirmations only above ₹200. **Active** — every purchase and payment confirmed, plus a daily
reminder to everyone who owes.

**Q: Can I record entries over WhatsApp?**
If WhatsApp is connected for your shop, yes — text from your registered phone: `add 250 <phone>
<note>`, `paid 500 Ramesh`, `upi 120 <phone>`, or `balance <phone>`. This is simple command
parsing, not an AI assistant.

---

## Payments

**Q: Where does the money go when a customer pays online?**
Into **your own Razorpay account**. You connect your Razorpay keys in **Settings → Payments**,
and customer payments settle directly to you. The platform never sits in the middle of your
customers' money.

**Q: How do I connect Razorpay?**
In **Settings → Payments**, paste your Razorpay Key ID, Key Secret, and Webhook Secret, use
**Test connection** to confirm they work, then add the shown webhook URL in your Razorpay
dashboard. Full guide: [`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).

**Q: A customer wants to clear their balance remotely. How?**
Send a payment link for their outstanding amount. When they pay by UPI/card/netbanking on
Razorpay's page, the payment is recorded and their balance drops automatically — no phone call
needed. (If a link cannot be sent, that shop has not connected Razorpay yet.)

**Q: What happens if I cancel an order that was already paid online?**
The order is cancelled and a note is added that the refund must be handled manually — there is
no automatic online refund. A cancelled **credit** order, by contrast, automatically reverses
the khata entry.

---

## Catalogue & selling

**Q: Do I have to type in every product?**
No. Start from the built-in master catalogue of **1,615 common items** — search, pick what you
carry, and set **your own price**. Add anything unusual as a **custom item**.

**Q: A product comes in several sizes and brands. Do I add them one by one?**
No. Products with variants let you set a price for each brand/pack size and add them all at
once with **Add selected**.

**Q: Can I sell things loose, by weight?**
Yes. Mark a product **sold by weight**; its unit becomes **kg** and the price you set is the
**price per kilogram**. Customers then pick 250 g / 500 g / 1 kg or a custom weight, and the
line price is calculated from your per-kg price. You turn this on per product.

**Q: Can I add photos?**
Yes. Upload a product photo — it is automatically shrunk to save data. Items with no photo show
an emoji tile.

**Q: Can my catalogue show in the local language?**
Yes — Hindi, Tamil, Telugu, Kannada, Malayalam, and Urdu for the common grocery vocabulary,
with English shown wherever a translation is not yet available. Search matches the local name,
the English name, or a romanised spelling (e.g. "chawal" for rice).

---

## Orders & delivery

**Q: How do customers find my shop?**
Share your shop's **QR code** or **link** (from Settings → Share your shop), or list your shop
in the public **directory** by adding your city/area and ticking **List my shop**. Listed shops
show nearest-first to customers who share their location.

**Q: How do I offer pickup and delivery?**
In **Settings → Delivery & pickup**: turn on pickup (always free) and/or delivery, then set a
delivery fee, an optional free-delivery threshold, a minimum order, an optional radius, and
delivery hours. The customer pays items subtotal plus the delivery fee.

**Q: What are the order stages?**
pending → accepted → preparing → ready → out for delivery → completed. You can cancel any order
that is not yet completed. Customers are notified on WhatsApp at each change (unless their
reminders are off).

**Q: How does a cash order get marked paid?**
A cash order adds nothing to the khata and creates no online charge. When you mark the order
**completed** (i.e. you handed it over and took the cash), it is marked paid. You are alerted on
WhatsApp for every new order with the customer, item count, total, pickup/delivery, payment
mode, and the delivery address if any.

---

## Language & accessibility

**Q: Which languages are supported?**
English, Hindi, Tamil, Telugu, Kannada, Malayalam, and Urdu. Urdu reads right-to-left and the
whole screen flips automatically.

**Q: Are the regional translations complete?**
English and Hindi are complete. Tamil, Telugu, Kannada, Malayalam, and Urdu are a solid
**translation seed currently under native-speaker QA**, so a few labels may still appear in
English. Amounts and behaviour are never affected.

**Q: How does voice input work?**
Where your browser supports it, you can **speak an amount (🎤)** into the khata field, **hear a
customer's balance (🔊)**, and **search the catalogue by voice**. Voice follows your chosen
language. If you do not see the mic or speaker buttons, your browser does not support voice
(recent Chrome-based browsers work best) — everything still works by typing.

---

## Offline & data

**Q: Does the app work without internet?**
Yes for the daily khata. When you go offline, a banner appears; entries you make are queued on
your device with a pending count, and they sync automatically when you reconnect.

**Q: If the network flickers while syncing, could an entry be recorded twice?**
No. Each queued entry carries a unique tag, and the app safely ignores a repeat of one it has
already recorded — so no double-debits.

**Q: How do I reduce data use on 2G?**
Turn on **Data-saver** (Settings, and on the customer app). It stops product photos from
downloading and shows light emoji tiles instead. It is set **per device**.

---

## Staff

**Q: How do I add a helper?**
In **Staff**, add their name, phone, and a password. They sign in with that phone number and
can run the khata and orders for your shop.

**Q: Can staff see other shops?**
No. Staff are scoped to your shop only and can never see another shop's data.

**Q: How do I stop a staff member's access?**
Deactivate them (blocks sign-in immediately) or remove them entirely, from the Staff screen.
You can also reset a staff member's password there.

---

## Billing & plans

**Q: What do the plans cost and include?**
**Free** — 50 customers, Silent + Smart reminders. **Pro ₹299/month** — 1,000 customers, adds
Active mode (daily auto-reminders). **Family ₹599/month** — 5,000 customers, adds family credit
sharing.

**Q: How do I upgrade or downgrade?**
In **Settings → Billing**, choose a plan. On a live setup, a paid plan opens a one-time
Razorpay authorisation; your plan activates once that completes. Downgrading to Free cancels any
active subscription.

**Q: Are commerce features (catalogue, online orders, discovery) an extra charge?**
No. They are included for all shops at no extra cost; the subscription is the only paid part.

---

## Privacy & security

**Q: Is customer money data safe?**
Every amount is stored exactly (in paise), every screen and query is scoped so a shop only ever
sees its own data, passwords are securely hashed, and online payment notifications from Razorpay
are cryptographically verified before anything is recorded. See [`SECURITY.md`](./SECURITY.md).

**Q: Can a customer see another customer's khata?**
No. A customer only ever sees shops and balances tied to **their own phone number**, and can
never pay more than they owe at a shop.

**Q: What does the customer's one-time login code do?**
It proves the phone belongs to them. The 6-digit code is sent on WhatsApp, expires in 5 minutes,
and is locked after 5 wrong attempts. There is no password for customers to remember or lose.

**Q: Is there an AI assistant reading my data?**
No. The app has no in-app chatbot or AI assistant. WhatsApp command handling is simple text
parsing, nothing more.
