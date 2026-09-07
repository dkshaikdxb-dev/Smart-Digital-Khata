# Demo accounts & test logins

Demo data for trying Smart Digital Khata on the live site. **Everything here is
fake demo data** — demo shops, demo customers, demo transactions. The passwords
are intentionally simple, demo-only credentials (not real users); treat them as
shareable for demos, not as secrets.

Seed / re-seed the data any time with the **Seed demo commerce** GitHub Action
(Actions → *Seed demo commerce* → Run workflow). It runs `seed:demo` (10 shops,
100 customers, transactions) + `seed:commerce` (a 50-product catalogue + orders)
on the server and is idempotent — existing demo rows are skipped, never
duplicated, and it never touches real shops.

Live site: <https://khata.dadashaik.com>

---

## 🏪 Shop-owner logins (email + password)

Sign in at **<https://khata.dadashaik.com/login>** with the email + password.
Pattern: `storeNN@demo.local` / `StoreNN@Demo2026` (NN = `01`–`10`). Each shop has
~10 customers with real balances and transactions; **store01** also has the
50-product catalogue and sample orders.

| Email                | Password           | Shop                   |
| -------------------- | ------------------ | ---------------------- |
| `store01@demo.local` | `Store01@Demo2026` | Sharma Kirana Store    |
| `store02@demo.local` | `Store02@Demo2026` | Gupta General Store    |
| `store03@demo.local` | `Store03@Demo2026` | Patel Provision Mart   |
| `store04@demo.local` | `Store04@Demo2026` | Reddy Super Bazaar     |
| `store05@demo.local` | `Store05@Demo2026` | Khan Daily Needs       |
| `store06@demo.local` | `Store06@Demo2026` | Iyer Grocery Corner    |
| `store07@demo.local` | `Store07@Demo2026` | Singh Mini Market      |
| `store08@demo.local` | `Store08@Demo2026` | Das Family Store       |
| `store09@demo.local` | `Store09@Demo2026` | Mehta Kirana Bhandar   |
| `store10@demo.local` | `Store10@Demo2026` | Nair Fresh Mart        |

Owner phone numbers are `+919876000001` … `+919876000010` (owners log in by
email + password, not phone).

---

## 📱 Customer / consumer accounts

**Customers have no password by design** — the consumer app signs in by **phone
OTP** (the demo customers are WhatsApp-side ledger entries). The demo customer
phone numbers are `+919876100001` … `+919876100100`.

### Browse without logging in
The consumer web PWA lets anyone browse shops with no account:

- All listed shops: <https://khata.dadashaik.com/c/shops>
- Sharma Kirana Store catalogue: <https://khata.dadashaik.com/c/shop/775c36cf-e150-4b4d-bc39-705aa31bec47>

### Log in as a customer (OTP) without SMS
To exercise khata + pay in the consumer app, enable a demo OTP number so the code
is returned in the API response instead of being sent over SMS/WhatsApp:

1. Set the backend environment variable **`DEMO_OTP_PHONES`** to one or more demo
   numbers, comma-separated, e.g.:

   ```
   DEMO_OTP_PHONES=+919876100001,+919876100002
   ```

   This lives in the **deployment environment** (the server's backend env / your
   Claude Code environment config), not in the repository. Restart the backend
   after setting it.
2. In the consumer app / PWA, request an OTP for that number
   (`POST /api/customer-auth/request-otp`). For an allow-listed demo number the
   plaintext OTP is **echoed back in the response** (it is still a real,
   single-use, time-limited code — only these exact demo numbers are affected;
   real users are untouched).
3. Enter the code to sign in. Because the phone matches a seeded ledger customer,
   you'll see that customer's khata.

> Security note: `DEMO_OTP_PHONES` is OFF by default and should only ever list
> demo numbers. Do not add real customer numbers to it.

---

## 🔁 Try the referral + Khata Mitra flow

The referral reward rule is **enabled** (pilot amounts: referrer ₹50, referee
₹50, Khata Mitra bounty ₹100). Rewards **accrue as credit** (no automated payout)
and accrue on **activation** — a referred shop's first collection. Adjust amounts
any time in **Admin → Referrals** (overrides the seeded defaults, no code change).

End-to-end with the demo data:

1. Log in as `store01@demo.local`, open **Referrals**, and copy the invite code.
2. Register a **new** shop with that code — visit
   `https://khata.dadashaik.com/register?ref=<CODE>` (or paste the code at
   sign-up). The referral is *captured* but nothing accrues yet.
3. As the new shop, record its **first payment** (a cash/UPI collection). The
   referral flips to **activated** and ₹50 (referrer) + ₹50 (referee) accrue.
4. See it in **Admin → Referrals**: the activation funnel advances, and each
   participant's **referral credit** balance goes up.

**Khata Mitra:** in **Admin → Referrals**, create a Khata Mitra to mint a flagged
agent code. Shops that sign up with a Mitra code and activate earn the Mitra a
₹100 bounty (instead of the peer referrer reward), shown in the Mitra
leaderboard. Single-level by design (no downline).
