# Smart Digital Khata — User Manual

**A plain-language guide for shop owners, their staff, and their customers.**

This manual explains, step by step, how to run your shop's khata (credit ledger),
sell online, and get paid — in your own language, even on a slow 2G connection. No
technical knowledge is needed.

If you are setting the app up on a server, or turning on payments and WhatsApp with
real keys, see the operator guides instead: [`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md),
[`OPERATIONS.md`](./OPERATIONS.md), and the product overview in [`PRODUCT.md`](./PRODUCT.md).

---

## Contents

1. [What Smart Digital Khata is](#1-what-smart-digital-khata-is)
2. [Who uses it — the four roles](#2-who-uses-it--the-four-roles)
3. [Getting started](#3-getting-started)
4. [Your daily khata](#4-your-daily-khata)
5. [Your catalogue (the things you sell)](#5-your-catalogue-the-things-you-sell)
6. [Selling online & orders](#6-selling-online--orders)
7. [For customers (the consumer section)](#7-for-customers-the-consumer-section)
8. [Glossary](#8-glossary)
9. [Where to get help](#9-where-to-get-help)

---

## 1. What Smart Digital Khata is

Smart Digital Khata replaces the paper notebook ("khata") that a kirana shop uses to
track credit ("udhaar"). It does four things:

- **Keeps the ledger.** Record every sale on credit, every cash payment, every UPI
  payment. The app always knows exactly how much each customer owes.
- **Reminds customers for you.** Polite, automatic WhatsApp messages — on a "respect
  dial" you control — so you never have to make an awkward phone call.
- **Collects money.** Send a customer a payment link; when they pay, their balance
  updates by itself.
- **Lets you sell online.** Customers can browse your shop, order, and choose pickup
  or delivery — no app to install for them.

The app works on a phone or computer web browser, and keeps working when your
internet drops. Money is always shown in rupees (₹).

---

## 2. Who uses it — the four roles

**Owner.** You, the shopkeeper. You own the shop, add customers and products, set
prices, choose how customers are reminded, connect payments, and manage staff. One
person registers the shop and becomes its owner.

**Staff.** Helpers you add to your shop. They sign in with their **phone number** and
a password you give them, and can run the daily khata and orders for your shop. You
can switch a staff member off at any time. Staff belong to your shop only — they
never see another shop's data.

**Customer (consumer).** The person who buys from you. They do **not** need to install
anything. They can shop with no login at all, and log in with their **WhatsApp number**
(a one-time code) only when they want to place an order or see their own khata.

**Admin (platform).** The person who runs the whole Smart Digital Khata service (not a
shop). Admins look after the platform itself — translations, shops, and health. If you
are a shop owner, this is not you.

---

## 3. Getting started

### 3.1 Register your shop

1. Open the app and choose **Register**.
2. Enter your **name**, **email**, **phone number**, a **password**, and your
   **shop name**.
3. Submit. Your shop is created and you are signed in as the **owner**.

Your shop starts on the **Free** plan with **Smart** reminders (a sensible default you
can change later).

### 3.2 Log in

You can sign in with **either** your **phone number** or your **email**, plus your
password.

- Owners and admins usually sign in with email.
- Staff sign in with their **phone number**.

If an account has been switched off, or a shop has been suspended by the platform,
sign-in is blocked with a clear message.

### 3.3 Choose your language

The app speaks seven languages:

| Code | Language |
|------|----------|
| en | English |
| hi | हिन्दी (Hindi) |
| ta | தமிழ் (Tamil) |
| te | తెలుగు (Telugu) |
| kn | ಕನ್ನಡ (Kannada) |
| ml | മലയാളം (Malayalam) |
| ur | اردو (Urdu) |

- Use the **language switch** at any time to change languages.
- **Urdu reads right-to-left** — the whole screen flips direction automatically when
  you pick it.
- The first time a customer opens your shop link, a **full-screen language chooser**
  appears, with each language written in its own script. They tap their language once
  and it is remembered.

> Note on regional languages: English and Hindi are complete. Tamil, Telugu, Kannada,
> Malayalam, and Urdu are provided as a solid starting translation seed that is being
> reviewed by native speakers, so a few labels may still read in English. This does not
> affect any amounts or how the app works.

---

## 4. Your daily khata

This is the heart of the app: recording what people buy on credit and what they pay
back.

### 4.1 Add a customer

1. Go to **Customers**.
2. Add the customer's **name** and **phone number**.
3. (Optional) Set a **credit limit** — the most this customer may owe at once. Leave it
   at 0 for no limit.

### 4.2 Record a purchase, cash, or UPI entry

Every entry is one of three types:

| Type | Meaning | Effect on balance |
|------|---------|-------------------|
| **Purchase** | Sold on credit (udhaar) | Balance goes **up** |
| **Cash** | Customer paid you cash | Balance goes **down** |
| **UPI** | Customer paid you by UPI | Balance goes **down** |

To record one:

1. Open the customer (or the transactions screen).
2. Pick the **type**, type the **amount** in rupees, add an optional **note**.
3. Save. The balance updates immediately.

**Credit limits.** If a purchase would push a customer past their credit limit, the app
blocks it and tells you the limit, the current balance, and the amount attempted. Take a
payment first, and the headroom returns.

### 4.3 Families (shared credit)

A family lets several customers (for example, members of one household) share one credit
line.

1. Go to **Families** and create a family with a **name**.
2. Add members (existing customers of your shop). One member can be marked the **payer**.
3. Give the family a **shared credit limit**, and optionally a **per-member sub-limit**.

How the limits work when someone buys on credit:

- The member's own **credit limit** is checked.
- Their **family sub-limit** (their slice of the family line) is checked.
- The **shared family limit** is checked against the total owed by everyone in the family.

Any one of these being exceeded blocks the purchase. You can send a single reminder to the
family's **payer** for the whole family's combined balance.

### 4.4 Reminders and notification modes

You control how much the app messages your customers. This is the "respect dial", set per
shop in **Settings → Customer notifications**:

| Mode | What customers receive |
|------|------------------------|
| **Silent** | Nothing automatic. You share manually when you choose. |
| **Smart** *(default)* | Payment receipts always; purchase confirmations only for larger purchases (above ₹200). |
| **Active** | Every purchase and payment confirmed, plus a daily reminder to everyone who owes money. |

You can also switch reminders **off for one customer** (their notification toggle), and
they will get no automatic messages no matter the shop mode.

### 4.5 "Aaj ka hisaab" — your daily digest

Turn on **Daily digest** in **Settings** to get an end-of-day WhatsApp summary of your own
shop, sent to you (the owner). It shows:

- Sales on credit today
- Amount collected today
- Number of entries
- Total outstanding and how many customers owe

This is separate from customer reminders — it is just for you.

### 4.6 WhatsApp entry (text a command)

If WhatsApp is connected for your shop, you can record entries by texting the business
number from your registered phone. Commands (not case-sensitive):

| Command | Effect |
|---------|--------|
| `add 250 9876543210 tea & sugar` | Record a ₹250 purchase, with an optional note |
| `paid 500 Ramesh` | Record a ₹500 cash payment (by name or phone) |
| `upi 120 9876543210` | Record a ₹120 UPI payment |
| `balance 9876543210` | Ask for a customer's outstanding balance |

### 4.7 Working offline (2G / no signal)

The app is built for weak rural networks.

- When you lose connection, an **offline banner** appears at the top of the screen.
- Entries you make while offline are **queued** on your device and the banner shows the
  **pending count**.
- When your connection returns, queued entries **sync automatically**. A safeguard makes
  sure the same entry is never recorded twice, even if the network flickers during sync.

You can keep taking khata entries during a power cut or dead zone and trust that nothing is
lost or doubled.

### 4.8 Voice: speak entries and hear balances

Where your browser supports it, the app adds hands-free helpers (they are simply hidden if
your browser does not support voice):

- **Speak an amount (🎤).** Tap the mic on the khata amount field and say the number
  instead of typing it.
- **Hear a balance (🔊).** Tap "read aloud" on a customer to have their outstanding balance
  spoken.
- Voice follows your chosen app language (for example, Hindi voice for Hindi).

> Voice needs a supported browser (recent Chrome-based browsers work best). If you do not
> see the mic or speaker buttons, your browser does not support it — everything still works
> by typing.

---

## 5. Your catalogue (the things you sell)

Your catalogue is the list of products a customer can order. You build it once and reuse it.

### 5.1 Add from the master catalogue at your own price

The app ships with a shared master catalogue of **1,615 common grocery items** (category,
product, brand, pack, unit).

1. Go to **Catalogue → Add from catalogue**.
2. Browse or search, and pick the items you carry.
3. Set **your own selling price** for each — the indicative price is only a hint.
4. Add them to your shop.

If you later re-add an item you already carry, the app just updates its price instead of
creating a duplicate.

### 5.2 Variants and bulk add

Many products come in several **brands and pack sizes** (variants). When you add a product
that has variants, you can set a price for each size and add them all at once with a single
**Add selected** action.

### 5.3 Custom items

Selling something not in the master list? Use **Add custom item**: give it a product name,
optional brand/pack/category, and a price. It joins the shared catalogue so it behaves like
any other item.

### 5.4 Product photos

You can upload a photo for a product. Photos are automatically shrunk and re-saved in a
light format to save data on slow networks. Items with no photo show a friendly emoji tile
instead.

### 5.5 Your catalogue in the local language

The catalogue can be browsed and searched in Hindi, Tamil, Telugu, Kannada, Malayalam, and
Urdu, not just English. The common grocery vocabulary (around 285 terms) is translated, and
category labels are localised too, with English shown wherever a translation is not yet
available.

**Search understands three ways of typing** — the local-language name, the English name, or
a romanised spelling (for example typing "chawal" to find rice). You can also use **voice
search (🎤)** on the catalogue where your browser supports it.

### 5.6 Loose / weighed selling (per kilo)

Some goods are sold loose by weight (dal, rice, sugar, vegetables). To sell an item this
way:

1. Open the product (or add it) and mark it **sold by weight**.
2. Its unit becomes **kg**, and the price you enter is the **price per kilogram**.

When a customer orders a weighed item, they pick a weight — **250 g, 500 g, 1 kg**, or a
custom amount — and the app calculates the line price from your per-kg price. The price is
always worked out by the server from the weight, so it is exact and cannot be tampered with.

> Loose selling is per product — you turn it on for each item you want to sell by weight.

---

## 6. Selling online & orders

Beyond the khata, your shop can take orders online.

### 6.1 Share your shop

In **Settings → Share your shop** you get:

- A **QR code** you can print and stick on the counter.
- A **shop link** (looks like `.../c/shop/your-shop-id`) you can **Copy** or **Print**.

Customers scan the QR or open the link to browse your shop — no app, no login needed to look
around.

### 6.2 List your shop in the directory (optional)

In **Settings → Discovery**, add your **city**, **area**, and optionally your shop's
**location (latitude/longitude)**, then tick **List my shop**. Listed shops appear in the
public directory where nearby customers can find them, sorted **nearest first** when the
customer shares their location. Unlisted shops stay private and are only reachable by your
direct link.

### 6.3 Set pickup and delivery

In **Settings → Delivery & pickup**, choose how customers receive orders:

- **Offer pickup** — customers collect from the shop (always free).
- **Offer delivery** — and then set:
  - **Delivery fee** (a flat charge),
  - **Free delivery above** a certain order value (optional),
  - **Minimum order** for delivery,
  - **Delivery radius** in km (optional),
  - **Delivery hours** (optional, e.g. "9am–8pm").

The order total the customer pays is the **items subtotal plus the delivery fee** (and the
fee becomes free once the free-delivery threshold is met).

### 6.4 The three ways a customer can pay

Each order carries one payment mode:

| Mode | What happens |
|------|--------------|
| **On khata (credit)** | The order total is added to the customer's running balance at your shop. Normal credit limits apply. |
| **Pay online (prepaid)** | The customer gets a secure Razorpay link and pays before pickup/delivery. Money goes to **your** Razorpay. |
| **Pay cash** | Nothing is charged upfront and nothing is added to the khata. The customer pays cash on hand-over; the order is marked **paid** when you complete it. |

You get a **WhatsApp alert for every new order** with the customer, item count, total,
pickup/delivery, payment mode, and (for delivery) the address.

### 6.5 Order statuses

Move an order forward through these stages: **pending → accepted → preparing → ready →
out for delivery → completed**. You can **cancel** any order that is not already completed.
The customer is notified on WhatsApp each time the status changes (unless their reminders are
switched off). Completing a **cash** order marks it paid; cancelling a **credit** order
automatically reverses the khata entry so your ledger stays honest.

### 6.6 Connect payments (your own Razorpay)

To take online payments and send payment links, connect **your own Razorpay account** in
**Settings → Payments**:

1. Paste your **Razorpay Key ID**, **Key Secret**, and **Webhook Secret**.
2. Use **Test connection** to confirm the keys work.
3. Copy the **webhook URL** shown and add it in your Razorpay dashboard.

Money from customers then settles directly into your Razorpay account. (Detailed setup:
[`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).)

### 6.7 Staff accounts

In **Staff**, add helpers who can run the shop with you:

1. Enter the staff member's **name**, **phone number**, and a **password**.
2. They sign in with that **phone number**.
3. **Switch a staff member off** (deactivate) at any time to block their sign-in, or remove
   them entirely.

### 6.8 Data-saver mode

Turn on **Data-saver** in **Settings** to stop the app downloading product photos, showing
light emoji tiles instead. This saves a lot of data on 2G.

> Data-saver is **per device** — each phone or computer has its own setting, so turning it on
> in the shop does not change it on your home phone.

### 6.9 Plans

| | Free | Pro — ₹299/mo | Family — ₹599/mo |
|---|---|---|---|
| Customers | 50 | 1,000 | 5,000 |
| Reminders | Silent + Smart | + Active (daily auto-reminders) | + Active |
| Family credit sharing | — | — | Included |

Change your plan in **Settings → Billing**. When platform billing is switched on, choosing a
paid plan opens a Razorpay authorisation you complete once; your plan then activates.

---

## 7. For customers (the consumer section)

This section is for the shop's customers. **You do not need to install anything.**

### 7.1 Open a shop

- **Scan the shop's QR code** or open the **link** the shop shared, or
- Open the **shop directory**, filter by **city** or **search** by name, and pick a shop
  (shops show **nearest first** if you allow location).

The first time you open a shop, choose your **language** from the full-screen chooser — each
option is written in its own script, so you can find yours easily.

### 7.2 Browse and search

- Browse products by category.
- **Search** in your own language, in English, or by typing the name in Roman letters (for
  example "chawal" for rice).
- Where your browser supports it, tap the **mic (🎤)** to **search by voice**.

### 7.3 Build your cart and pick weight

- Add items to your cart.
- For **loose (by weight)** items, choose **250 g / 500 g / 1 kg** or enter a **custom
  weight**. The price is calculated from the shop's per-kg price.

### 7.4 Log in with your WhatsApp number

To place an order or view your khata, log in:

1. Enter your **WhatsApp phone number**.
2. You receive a **6-digit code** on WhatsApp (valid for 5 minutes).
3. Enter the code to sign in. No password to remember.

### 7.5 Choose pickup/delivery and pay

1. Choose **pickup** or **delivery** (delivery may have a minimum order and a fee, both shown
   before you confirm; for delivery, enter your address).
2. Choose how to pay:
   - **On khata** — added to what you owe this shop,
   - **Pay online** — a secure payment link, or
   - **Pay cash** — pay when you collect or receive the order.
3. Place the order. You can follow its status and cancel it while it is still pending.

### 7.6 View your khata

Open **My khata** to see, across **every** shop where you have an account (matched by your
phone number), how much you owe and your recent entries. You can pay any shop you owe
directly (if that shop has connected online payments).

---

## 8. Glossary

- **Khata** — the shop's credit ledger; the record of who owes what.
- **Udhaar** — buying on credit; goods taken now and paid for later.
- **Paise** — the small unit of the rupee (100 paise = ₹1). The app stores every amount in
  paise for exactness and always shows you rupees.
- **Kirana** — a neighbourhood grocery / general store.

---

## 9. Where to get help

- **Owners & staff:** start with this manual and the day-to-day runbook in
  [`OPERATIONS.md`](./OPERATIONS.md). Common questions are answered in [`FAQ.md`](./FAQ.md).
- **Turning on payments or WhatsApp:** see [`GO_LIVE_INTEGRATIONS.md`](./GO_LIVE_INTEGRATIONS.md).
- **What the product does and why:** see [`PRODUCT.md`](./PRODUCT.md).
- **Something not working:** the operator troubleshooting guide is
  [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

The app has no in-app chatbot — help comes from these guides and from the person who set up
Smart Digital Khata for you.
