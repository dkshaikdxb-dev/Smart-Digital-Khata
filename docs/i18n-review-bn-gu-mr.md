# Native-speaker review — Bengali, Gujarati and Marathi (owner app)

**These strings were authored by the build, not by a native speaker.** They are live in the
owner app now (`mobile-app/src/i18n.js`), because a Bengali-speaking shopkeeper who picks
Bengali was getting an entirely English app and a plain-but-imperfect Bengali beats that. They
have not been read by anyone who speaks these languages natively.

**What to do:** go down the table for your language and put a `✓` in the last column when the
line is fine, or write what it should say instead. Do not soften anything — if a line reads
oddly, formally, or just wrong, say so. **This file is the source of truth for the review:**
corrections written here get applied back into `mobile-app/src/i18n.js`, and the picker keeps
showing "(beta)" next to these three languages until that happens.

**House rules the translations follow** (so you can tell a bug from a choice):

- Plain spoken register, the way a shopkeeper talks — not formal or Sanskritised.
- Shop loanwords are kept where they are what people actually say (UPI, order, delivery,
  balance, online), rather than forced into a pure register nobody uses.
- Numerals stay Latin (`30`, `₹1,250.00`), matching every other language in the app.
- `{name}`, `{amount}`, `{mins}` and friends are **placeholders** — real values drop in there.
  They must survive any correction, spelled exactly the same. A dropped one renders a broken
  sentence to a real shopkeeper.
- Where a concept already existed in the customer-facing app, the customer-facing wording was
  reused **verbatim**, so the shopkeeper and the customer read the same words about the same
  order. Changing one of those means changing it in the consumer app too.

## Coverage

| language | keys before | keys now | of those, reused verbatim from the consumer app | newly written |
|---|---|---|---|---|
| Bengali (`bn`) | 0 | 313 | 46 | 267 |
| Gujarati (`gu`) | 0 | 313 | 47 | 266 |
| Marathi (`mr`) | 0 | 313 | 45 | 268 |

The English source has 324 keys. The other regional languages in this app
(`ta`/`te`/`kn`/`ml`/`ur`) carry 118 each, so 313 is well past parity.

**Rows marked `reused` in the tables below need less scrutiny** — that exact string is already
shipping in the customer app and has been read there. Rows marked `new` were written for this
batch and have been read by nobody: those are where to spend your attention.

## Start here — the lines I am least sure of

This batch was written without a native speaker. These are the specific places where I would
not trust the wording, listed so a reviewer can spend twenty minutes and cover the real risk
before working through the full tables below.

**Worth checking in all three languages:**

- The **{s} substitution** in `ord.mark` / `ord.marked` / `ord.terminal`: an English sentence takes a status word cleanly, an Indic one may not. Read those three with each status dropped in.
- The **accept / reject verb pair** (`oalert.accept`, `oalert.decide`, `orej.*`, `eta.accept`). The app treats REJECT and CANCEL as different actions and a shopkeeper must not confuse them.
- The **word for money collected** (`dash.todayCollections`, `ins.collections`, `ins.collectionRate`) and the **word for money owed** (`dash.totalOutstanding`, `ins.outstanding`). These are the two numbers an owner looks at every day.

**Bengali:**

| key(s) | what I am unsure about |
|---|---|
| `dash.todayCollections, ins.collections, ins.collectionRate` | I used **আদায়** for money collected. Is that what a shopkeeper says, or would it be বসূলি / আদায়ের হিসেব? |
| `dash.todayPurchases vs txn.purchase` | The ledger row says **কেনা**, the dashboard tile says **কেনাকাটা**. Deliberate (the tile reads better) but it is two words for one idea — tell me which one to use everywhere. |
| `oalert.accept, eta.accept, eta.acceptTitle` | **নিন** for "Accept". Short and spoken, but it may read as "take it" rather than "accept the order". |
| `orej.reject, orej.confirm, orej.title, orej.done, oalert.decide` | **ফিরিয়ে দিন / ফিরিয়ে দেওয়া** for "Reject". The app distinguishes rejecting from cancelling (বাতিল), so it could not reuse বাতিল. Is ফিরিয়ে দেওয়া right, or is নাকচ করা / না করা better? |
| `txn.adjustment` | **সমন্বয়** for "Adjustment" — an accounting word. Would a shopkeeper understand it on a ledger row? |
| `famd.payerLabel, famd.payerTag` | **যিনি টাকা দেন** is a clause, not a noun. Is there a one-word Bengali for "payer" that fits a label? |
| `ful.pickup` | Left as the loanword **পিকআপ**. The customer app says নিজে নিয়ে যান, but that is an instruction to the customer, not a label the shop reads. |
| `cat.unitPlaceholder` | **একক** for "Unit" (kg / piece / litre). Correct but possibly too formal — would ইউনিট be more natural in a shop? |
| `title.insights` | **বিশ্লেষণ** for "Insights". Formal. Better word? |
| `common.missing, common.failed, common.keep` | One-word pop-up titles: **অসম্পূর্ণ**, **হয়নি**, **থাক**. Terse on purpose; check they do not read as rude. |

**Gujarati:**

| key(s) | what I am unsure about |
|---|---|
| `txn.adjustment` | **સમાયોજન** for "Adjustment". This is the one I am least sure of in Gujarati — is it the word a shop would use on a ledger row, or is સરભર / ઘટાડો better? |
| `set.areaLocality` | **વિસ્તાર / લત્તો**. લત્તો is colloquial and regional — replace it if it does not travel. |
| `orej.r1` | **માલ ખતમ છે** for "Out of stock". Spoken register on purpose; confirm it is not too blunt to send to a customer. |
| `ostatus.pending vs pstatus.pending` | Both are **બાકી**, reused from the customer app. One is an order status and one is a payment status — is one word for both confusing on the order screen? |
| `dash.todayCollections, ins.collections` | **વસૂલી** for money collected. Right word, or too much like debt-recovery? |
| `famd.payerLabel, famd.payerTag` | **ચૂકવનાર** for "payer". |
| `set.latitude, set.longitude` | **અક્ષાંશ / રેખાંશ** — textbook words. Fine on a settings form? |
| `oalert.accept / orej.reject` | **સ્વીકારો / નકારો**. Correct but slightly formal — is there a plainer shop pair? |
| `cat.unitPlaceholder` | **એકમ** for "Unit". |
| `more.promote, more.promoteSub` | Marketing phrases transliterated (બૂસ્ટ, બ્રાન્ડેડ સ્ટોર, પ્રીમિયમ). Check they are what an owner would recognise. |

**Marathi:**

| key(s) | what I am unsure about |
|---|---|
| `open.open, open.title, open.switchLabel, open.alwaysOpen` | I used **चालू** for an open shop ("दुकान चालू आहे") rather than उघडे, because it is what I believe is said. If उघडे is right, these four change together. |
| `gender of ऑर्डर` | Treated as MASCULINE throughout ("हा ऑर्डर", "ऑर्डर नाकारला"), matching the customer app. If that is wrong, it is wrong in roughly a dozen lines at once — say so and they all get fixed. |
| `txn.adjustment` | **समायोजन** for "Adjustment" on a ledger row. Understandable, or too formal? |
| `dash.todayCollections, ins.collections, ins.collectionRate` | **वसुली**. Right word for a shop’s daily takings? |
| `ins.outstanding, famd.combinedOutstanding, dash.totalOutstanding` | **उधारी**, reused from the customer app. Consistent, but confirm it reads right from the SHOP’S side (money owed TO them, not BY them). |
| `famd.payerLabel, famd.payerTag` | **भरणारा** for "payer". |
| `ord.mark, ord.marked, ord.terminal` | A status word is substituted into {s} ("ऑर्डर तयार म्हणून नोंदवला"). Check the sentence still parses for every status: प्रलंबित, स्वीकारले, तयार होत आहे, तयार, डिलिव्हरीसाठी निघाले, पूर्ण झाले, रद्द केले. |
| `common.missing, common.failed, common.error` | One-word pop-up titles: **अपूर्ण**, **झाले नाही**, **अडचण**. |
| `cat.unitPlaceholder` | **एकक** for "Unit". |
| `oedit.help, open.hoursHelp, oalert.setHelp` | The three longest sentences in the file. Long Marathi sentences are where a machine-written register shows most — read these aloud. |

## Deliberately left in English

11 keys carry no bn/gu/mr value, so the app falls back to English for them. That is
on purpose, not a gap — for each of these English is either already the right string or no
idiomatic rendering exists:

| key | English | why |
|---|---|---|
| `app.name` | Smart Digital Khata | brand name |
| `app.shortName` | Smart Khata | brand name |
| `title.dashboard` | Smart Khata | brand name (the dashboard is titled with the app’s short name) |
| `txn.upi` | UPI | said as "UPI" in all three languages |
| `oedit.historyReduced` | {item} — {before} → {after} | placeholders and an arrow only — no words to translate |
| `oedit.historyBy` | {who}, {when} | placeholders and a comma only — no words to translate |
| `fam.membersN` | {n} member{s} | `{s}` interpolates an English plural "s". Any translation renders "3 সদস্যs". Needs a real plural rule in the code before it can be translated — flagged, not guessed. |
| `set.razorpayKeyId` | Razorpay Key ID | literal field name the owner copies out of Razorpay’s own English dashboard |
| `set.keySecret` | Key Secret | literal field name in Razorpay’s dashboard |
| `set.webhookSecret` | Webhook Secret | literal field name in Razorpay’s dashboard |
| `open.timePlaceholder` | HH:MM | a time format, not words |

## Bengali — বাংলা

### Bengali · Tier 1 — MONEY

Balances, amounts, the ledger and the insight numbers. A wrong word here is a wrong number in someone’s head. **Read this tier first.**

| key | English | Bengali | source | ✓ / suggest |
|---|---|---|---|---|
| `dash.todayPurchases` | Today purchases | আজকের কেনাকাটা | new | |
| `dash.todayCollections` | Today collections | আজকের আদায় | new | |
| `dash.totalOutstanding` | Total outstanding | মোট বাকি | reused | |
| `dash.customersWithDues` | Customers with dues | বাকি আছে এমন গ্রাহক | new | |
| `dash.newTransaction` | New transaction | নতুন লেনদেন | new | |
| `dash.viewCustomers` | View customers | গ্রাহক দেখুন | new | |
| `custd.balance` | Balance | ব্যালেন্স | reused | |
| `custd.creditLimit` | Credit limit | ধারের সীমা | new | |
| `custd.recordAction` | Record payment / purchase | পরিশোধ / কেনা লিখুন | new | |
| `custd.transactions` | Transactions | লেনদেন | new | |
| `custd.noTransactions` | No transactions yet. | এখনো কোনো লেনদেন নেই। | new | |
| `addtx.type` | Type | ধরন | new | |
| `addtx.customer` | Customer | গ্রাহক | new | |
| `addtx.selectedCustomer` | Selected customer | নির্বাচিত গ্রাহক | new | |
| `addtx.amount` | Amount (₹) | টাকা (₹) | reused | |
| `addtx.note` | Note (optional) | নোট (ঐচ্ছিক) | new | |
| `addtx.notePlaceholder` | note | নোট | new | |
| `addtx.missingBody` | Pick a customer and amount | গ্রাহক আর টাকা বেছে নিন | new | |
| `add.invalidAmount` | Enter a valid amount | সঠিক টাকা লিখুন | new | |
| `txn.purchase` | Purchase | কেনা | reused | |
| `txn.cash` | Cash | নগদ | reused | |
| `txn.adjustment` | Adjustment | সমন্বয় | new | |
| `pmode.credit` | Credit | খাতায় | reused | |
| `pmode.prepaid` | Prepaid | অনলাইন | reused | |
| `pmode.cash` | Cash | নগদ | reused | |
| `pstatus.paid` | Paid | পরিশোধ হয়েছে | reused | |
| `pstatus.pending` | Pending | বাকি | new | |
| `pstatus.failed` | Failed | হয়নি | new | |
| `pstatus.not_required` | Not required | দরকার নেই | new | |
| `ord.subtotal` | Subtotal | উপ-মোট | reused | |
| `ord.delivery` | Delivery | ডেলিভারি | reused | |
| `oedit.reducedBy` | You are taking off {amount}. | আপনি {amount} বাদ দিচ্ছেন। | new | |
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | এই গ্রাহকের খাতা থেকে {amount} কমে যাবে। | new | |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | অনলাইনে পরিশোধ হয়ে গেছে — {amount} এই গ্রাহকের জন্য আপনার দোকানে জমা থাকবে। | new | |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | অর্ডার দেওয়ার সময় {amount} কম নিন। | new | |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | এতে যদি অর্ডার আপনার ফ্রি-ডেলিভারির টাকার নিচে নেমে যায়, তাহলে নিশ্চিত করার সময় ডেলিভারি চার্জ আবার হিসেব হবে। | new | |
| `oedit.originalSubtotal` | Original subtotal | আসল উপ-মোট | new | |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | অনলাইনে পরিশোধ হয়েছে — এই টাকা এই গ্রাহকের জন্য আপনার দোকানে জমা হয়ে যাবে। টাকা ফেরত যায় না। | new | |
| `ins.daysN` | {d} days | {d} দিন | new | |
| `ins.purchases` | Purchases | কেনাকাটা | new | |
| `ins.collections` | Collections | আদায় | new | |
| `ins.collectionRate` | Collection rate | আদায়ের হার | new | |
| `ins.outstanding` | Outstanding | বাকি | new | |
| `ins.activeCustomers` | Active customers | সক্রিয় গ্রাহক | new | |
| `ins.withDues` | With dues | যাদের বাকি আছে | new | |
| `ins.newCustomers` | New customers | নতুন গ্রাহক | new | |
| `ins.outstandingByAge` | Outstanding by age | কত দিনের বাকি | new | |
| `ins.age_0_30` | 0–30 days | 0–30 দিন | new | |
| `ins.age_31_60` | 31–60 days | 31–60 দিন | new | |
| `ins.age_61_90` | 61–90 days | 61–90 দিন | new | |
| `ins.age_90_plus` | 90+ days | 90+ দিন | new | |
| `ins.total` | Total | মোট | reused | |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV রিপোর্ট ডাউনলোড ওয়েব ড্যাশবোর্ডে পাওয়া যায়। | new | |
| `famd.combinedOutstanding` | Combined outstanding | মিলিত বাকি | new | |
| `famd.combinedLimit` | Combined limit | মিলিত সীমা | new | |
| `famd.subLimit` | sub-limit {amt} | আলাদা সীমা {amt} | new | |
| `famd.combinedStatement` | Combined statement | মিলিত হিসেব | new | |
| `famd.noTransactions` | No transactions yet. | এখনো কোনো লেনদেন নেই। | new | |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | হোয়াটসঅ্যাপে মনে করিয়ে দেওয়া হয়েছে। মিলিত বাকি: {amt}। | new | |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | পাঠানো যায়নি (যিনি টাকা দেন তাঁর নোটিফিকেশন বন্ধ থাকতে পারে)। মিলিত বাকি: {amt}। | new | |
| `fam.limitPlaceholder` | Combined credit limit (₹, optional) | মিলিত ধারের সীমা (₹, ঐচ্ছিক) | new | |

### Bengali · Tier 2 — ORDERS

The repeating new-order alert, accept / reject, the ready-time promise, reducing an order, and whether the shop is open. A misread alert costs a sale.

| key | English | Bengali | source | ✓ / suggest |
|---|---|---|---|---|
| `oalert.title` | New order waiting | নতুন অর্ডার অপেক্ষা করছে | new | |
| `oalert.more` | +{n} more | আরও {n}টি | new | |
| `oalert.items` | {n} items | {n} জিনিস | reused | |
| `oalert.waiting` | waiting {mins} min | {mins} মিনিট ধরে অপেক্ষা | new | |
| `oalert.snooze` | Not now — {mins} min | এখন নয় — {mins} মিনিট | new | |
| `oalert.snoozedFor` | Quiet for {mins} more min | আরও {mins} মিনিট চুপ | new | |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | এখনো অপেক্ষা করছে — আপনি এটার উত্তর দেননি। | new | |
| `oalert.decide` | This keeps alerting until you accept or reject it. | আপনি না নেওয়া বা ফিরিয়ে না দেওয়া পর্যন্ত এটা বেজেই যাবে। | new | |
| `oalert.accept` | Accept | নিন | new | |
| `oalert.open` | Open | খুলুন | new | |
| `oalert.mute30` | Mute for 30 minutes | 30 মিনিট চুপ করুন | new | |
| `oalert.unmute` | Turn alerts back on | অ্যালার্ট আবার চালু করুন | new | |
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | নতুন অর্ডার। {name}। {n} জিনিস। {amount} টাকা। | new | |
| `oalert.setTitle` | Order alerts | অর্ডার অ্যালার্ট | new | |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | নতুন অর্ডার আপনাকে বারবার জানাতে থাকবে — এখানে আর হোয়াটসঅ্যাপে — যতক্ষণ না আপনি সেটা নেন বা ফিরিয়ে দেন। “এখন নয়” শুধু একটা অর্ডারকে কয়েক মিনিটের জন্য চুপ করায়; অ্যালার্ট বন্ধ হয় না। | new | |
| `oalert.setEnabled` | Alert me about new orders | নতুন অর্ডারের জন্য আমাকে জানান | new | |
| `oalert.setRepeat` | Repeat every (minutes) | প্রতি কত মিনিটে | new | |
| `oalert.setMaxRepeats` | Stop after (repeats) | কতবারের পর থামবে | new | |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 মিনিট চুপ করুন | new | |
| `oalert.setMuted` | Alerts are muted right now. | এখন অ্যালার্ট চুপ করা আছে। | new | |
| `oalert.setSaved` | Order alert settings saved. | অর্ডার অ্যালার্টের সেটিং সেভ হয়েছে। | new | |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | আপনার দেওয়া সংখ্যা সবচেয়ে কাছের অনুমোদিত সংখ্যায় বদলে দেওয়া হয়েছে। | new | |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | এই ফোন এখনো আপনার ভাষায় বলতে পারে না — তবে ব্যানার আপনি দেখতে পাবেন। | new | |
| `orej.reject` | Reject | ফিরিয়ে দিন | new | |
| `orej.title` | Reject this order? | এই অর্ডার ফিরিয়ে দেবেন? | new | |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | গ্রাহককে কারণ জানান — বাতিলের সাথে এটা তাঁর কাছে যাবে। | new | |
| `orej.r1` | Out of stock | জিনিস শেষ | new | |
| `orej.r2` | Too busy right now | এখন খুব চাপ | new | |
| `orej.r3` | Shop is closing | দোকান বন্ধ হচ্ছে | new | |
| `orej.placeholder` | Another reason (optional) | অন্য কারণ (ঐচ্ছিক) | new | |
| `orej.confirm` | Reject order | অর্ডার ফিরিয়ে দিন | new | |
| `orej.back` | Back | পিছনে | reused | |
| `orej.done` | Order rejected. | অর্ডার ফিরিয়ে দেওয়া হয়েছে। | new | |
| `eta.accept` | Accept | নিন | new | |
| `eta.acceptTitle` | Accept this order | এই অর্ডার নিন | new | |
| `eta.pickTime` | Ready in about… | কতক্ষণে তৈরি হবে… | new | |
| `eta.noTime` | Accept without a time | সময় না বলে নিন | new | |
| `eta.notNow` | Not now | এখন নয় | new | |
| `eta.accepting` | Accepting… | নেওয়া হচ্ছে… | new | |
| `eta.chipMin` | ~{n} min | ~{n} মিনিট | new | |
| `eta.chipHour` | ~{n} hour | ~{n} ঘণ্টা | new | |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} ঘণ্টা {m} মিনিট | new | |
| `eta.promisedBy` | You promised ready by {time} | আপনি {time}-এর মধ্যে তৈরি বলেছেন | new | |
| `eta.noPromise` | No ready time promised | তৈরির সময় বলা হয়নি | new | |
| `eta.needMore` | Need more time | আরও সময় লাগবে | new | |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | নতুন সময় বেছে নিন — গ্রাহককে সঙ্গে সঙ্গে জানানো হবে। | new | |
| `eta.sent` | The customer has been told the new time. | গ্রাহককে নতুন সময় জানানো হয়েছে। | new | |
| `eta.late` | Past the time you promised | আপনার বলা সময় পেরিয়ে গেছে | new | |
| `eta.readyBy` | Ready by {time} | {time}-এর মধ্যে তৈরি | new | |
| `eta.takingLonger` | Taking a little longer | একটু বেশি সময় লাগছে | new | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}-এর মধ্যে হওয়ার কথা ছিল। আর বেশি দেরি হবে না। | new | |
| `oedit.start` | Not everything in stock? | সব জিনিস নেই? | new | |
| `oedit.startBtn` | Reduce this order | অর্ডার কমান | new | |
| `oedit.title` | Reduce this order | অর্ডার কমান | new | |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | যা নেই তা বাদ দিন। এখান থেকে শুধু জিনিস সরানো বা পরিমাণ কমানো যায় — নতুন জিনিস যোগ করা, পরিমাণ বাড়ানো বা দাম বদলানো এখান থেকে হয় না। | new | |
| `oedit.remove` | Remove | সরান | reused | |
| `oedit.restore` | Put back | ফিরিয়ে আনুন | new | |
| `oedit.removedTag` | Removed | সরানো হয়েছে | new | |
| `oedit.was` | Was {was} | আগে {was} | new | |
| `oedit.wasNow` | Was {was} — now {now} | আগে {was} — এখন {now} | new | |
| `oedit.confirm` | Confirm the new order | নতুন অর্ডার নিশ্চিত করুন | new | |
| `oedit.saving` | Saving… | সেভ হচ্ছে… | reused | |
| `oedit.keep` | Leave it as it was | যেমন ছিল তেমনই থাক | new | |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | অর্ডার কমানো হয়েছে। কী বদলেছে গ্রাহককে জানানো হয়েছে। | new | |
| `oedit.noChange` | Nothing has been changed yet. | এখনো কিছু বদলানো হয়নি। | new | |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | আপনি সব বাদ দিয়ে দিয়েছেন। তার বদলে অর্ডারটাই বাতিল করুন। | new | |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | এবার অর্ডারটা নিন আর গ্রাহককে বলুন কখন তৈরি হবে। | new | |
| `oedit.historyTitle` | What was taken off | কী কী বাদ গেছে | new | |
| `oedit.historyRemoved` | {item} — removed | {item} — সরানো হয়েছে | new | |
| `oedit.historyUnknownWho` | the shop | দোকান | reused | |
| `ostatus.pending` | Pending | অপেক্ষমাণ | reused | |
| `ostatus.accepted` | Accepted | গৃহীত | reused | |
| `ostatus.preparing` | Preparing | তৈরি হচ্ছে | reused | |
| `ostatus.ready` | Ready | তৈরি | reused | |
| `ostatus.out_for_delivery` | Out for delivery | ডেলিভারিতে রওনা | reused | |
| `ostatus.completed` | Completed | সম্পূর্ণ | reused | |
| `ostatus.cancelled` | Cancelled | বাতিল | reused | |
| `ofilter.all` | All | সব | new | |
| `ful.delivery` | Delivery | ডেলিভারি | reused | |
| `ful.pickup` | Pickup | পিকআপ | new | |
| `ord.empty` | No orders in this view yet. | এখানে এখনো কোনো অর্ডার নেই। | new | |
| `ord.notFound` | Order not found. | অর্ডার পাওয়া যায়নি। | new | |
| `ord.mark` | Mark {s} | {s} চিহ্নিত করুন | new | |
| `ord.cancelOrder` | Cancel order | অর্ডার বাতিল করুন | reused | |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | এই অর্ডার বাতিল করবেন? এটা আর ফেরানো যাবে না। | new | |
| `ord.marked` | Order marked {s}. | অর্ডার {s} চিহ্নিত হয়েছে। | new | |
| `ord.terminal` | This order is {s} — no further changes. | এই অর্ডার {s} — আর কোনো বদল হবে না। | new | |
| `ord.items` | Items | জিনিস | reused | |
| `ord.noItems` | No items on this order. | এই অর্ডারে কোনো জিনিস নেই। | new | |
| `ord.address` | Address | ঠিকানা | new | |
| `ord.note` | Note | নোট | new | |
| `open.open` | Open | খোলা | new | |
| `open.closed` | Closed | বন্ধ | new | |
| `open.todayAt` | at {time} | {time}-এ | new | |
| `open.tomorrowAt` | tomorrow at {time} | কাল {time}-এ | new | |
| `open.title` | Shop availability | দোকান খোলা আছে কি না | new | |
| `open.switchLabel` | Shop is open | দোকান খোলা আছে | new | |
| `open.takingOrders` | You are taking orders right now. | আপনি এখন অর্ডার নিচ্ছেন। | new | |
| `open.notTakingOrders` | Customers cannot order right now. | গ্রাহকরা এখন অর্ডার করতে পারবেন না। | new | |
| `open.stateClosed` | Closed — you switched the shop off | বন্ধ — আপনি দোকান বন্ধ করে রেখেছেন | new | |
| `open.statePaused` | Paused — back {when} | কিছুক্ষণ বন্ধ — {when} খুলবে | new | |
| `open.stateHoliday` | Closed today — reopens {when} | আজ বন্ধ — {when} আবার খুলবে | new | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | আজ বন্ধ ({reason}) — {when} আবার খুলবে | new | |
| `open.stateHours` | Closed — opens {when} | বন্ধ — {when} খুলবে | new | |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | কিছুক্ষণের জন্য বন্ধ করবেন? এক টিপেই হবে, সময় বাছতে হবে না। | new | |
| `open.pause30` | 30 min | 30 মিনিট | new | |
| `open.pause60` | 1 hour | 1 ঘণ্টা | new | |
| `open.pauseToday` | Rest of today | আজ বাকি সময় | new | |
| `open.resume` | Resume now | এখনই খুলুন | new | |
| `open.hoursTitle` | Shop hours | দোকানের সময় | new | |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | রোজ কখন খুলবে আর কখন বন্ধ হবে ঠিক করুন, বা দুটোই খালি রাখলে সারা দিন খোলা থাকবে। বন্ধের সময় খোলার সময়ের আগে দিলে বোঝা যাবে যে রাত বারোটার পরেও দোকান খোলা থাকে। | new | |
| `open.openTime` | Opens at | কখন খোলে | new | |
| `open.closeTime` | Closes at | কখন বন্ধ হয় | new | |
| `open.alwaysOpen` | No daily hours set — open all day. | রোজকার সময় দেওয়া নেই — সারা দিন খোলা। | new | |
| `open.saveHours` | Save hours | সময় সেভ করুন | new | |
| `open.clearHours` | Clear hours | সময় মুছুন | new | |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | খোলার আর বন্ধের দুটো সময়ই দিন, নয়তো দুটোই মুছে দিন। | new | |
| `open.closuresTitle` | Holiday closures | ছুটির দিন | new | |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | যেদিন দোকান বন্ধ থাকবে সেই তারিখগুলো দিন — পুজো, বিয়ে, যা কিছু। গ্রাহকরা অর্ডার করার আগেই দেখতে পাবেন। | new | |
| `open.closureDate` | Date (YYYY-MM-DD) | তারিখ (YYYY-MM-DD) | new | |
| `open.closureReason` | Reason (optional) | কারণ (ঐচ্ছিক) | new | |
| `open.closureReasonPlaceholder` | Diwali | দীপাবলি | new | |
| `open.addClosure` | Add date | তারিখ যোগ করুন | new | |
| `open.noClosures` | No closures in the next 90 days. | আগামী 90 দিনে কোনো ছুটি নেই। | new | |
| `open.removeClosure` | Remove | সরান | reused | |

### Bengali · Tier 3 — NAVIGATION, LOGIN AND SETTINGS

The words the owner sees on every screen. Wrong here reads as a badly made app rather than a wrong number.

| key | English | Bengali | source | ✓ / suggest |
|---|---|---|---|---|
| `common.save` | Save | সেভ করুন | reused | |
| `common.cancel` | Cancel | বাতিল করুন | reused | |
| `common.close` | Close | বন্ধ করুন | reused | |
| `common.add` | Add | যোগ করুন | reused | |
| `common.remove` | Remove | সরান | reused | |
| `common.delete` | Delete | মুছুন | new | |
| `common.search` | Search | খুঁজুন | reused | |
| `common.error` | Error | সমস্যা | new | |
| `common.failed` | Failed | হয়নি | new | |
| `common.missing` | Missing | অসম্পূর্ণ | new | |
| `common.go` | Go | যান | new | |
| `common.keep` | Keep | থাক | new | |
| `common.retry` | Retry | আবার চেষ্টা করুন | reused | |
| `common.loadFailed` | Could not load. Check your connection and try again. | লোড করা গেল না। কানেকশন দেখে আবার চেষ্টা করুন। | new | |
| `tab.home` | Home | হোম | new | |
| `tab.orders` | Orders | অর্ডার | reused | |
| `tab.catalog` | Catalog | তালিকা | new | |
| `tab.customers` | Customers | গ্রাহক | new | |
| `tab.more` | More | আরও | new | |
| `title.addTransaction` | Add transaction | লেনদেন যোগ করুন | new | |
| `title.order` | Order | অর্ডার | reused | |
| `title.customer` | Customer | গ্রাহক | new | |
| `title.family` | Family | পরিবার | new | |
| `title.families` | Families | পরিবার | new | |
| `title.insights` | Insights | বিশ্লেষণ | new | |
| `title.settings` | Settings | সেটিং | new | |
| `login.subtitle` | Sign in to manage your shop | আপনার দোকান চালাতে সাইন ইন করুন | new | |
| `login.email` | Email | ইমেল | reused | |
| `login.password` | Password | পাসওয়ার্ড | new | |
| `login.signIn` | Sign in | সাইন ইন করুন | reused | |
| `login.signingIn` | Signing in… | সাইন ইন হচ্ছে… | new | |
| `login.failed` | Login failed | সাইন ইন হয়নি | new | |
| `admin.title` | Admin account | অ্যাডমিন অ্যাকাউন্ট | new | |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | এই অ্যাপ দোকান মালিকদের জন্য। প্ল্যাটফর্ম চালাতে ওয়েব অ্যাডমিন কনসোল ব্যবহার করুন। | new | |
| `admin.signOut` | Sign out | সাইন আউট | new | |
| `set.shop` | Shop | দোকান | reused | |
| `set.shopName` | Shop name | দোকানের নাম | new | |
| `set.customerNotifications` | Customer notifications | গ্রাহকের নোটিফিকেশন | new | |
| `setn.silent` | Silent | নীরব | new | |
| `setn.smart` | Smart | স্মার্ট | new | |
| `setn.active` | Active | সক্রিয় | new | |
| `set.savedTitle` | Saved | সেভ হয়েছে | new | |
| `set.shopSaved` | Shop settings updated. | দোকানের সেটিং আপডেট হয়েছে। | new | |
| `set.payments` | Payments (your Razorpay) | পেমেন্ট (আপনার Razorpay) | new | |
| `set.modeLabel` | Mode: | মোড: | new | |
| `set.keySecretSet` | Key secret set | Key secret দেওয়া আছে | new | |
| `set.noKeySecret` | No key secret | Key secret নেই | new | |
| `set.webhookSecretSet` | Webhook secret set | Webhook secret দেওয়া আছে | new | |
| `set.noWebhookSecret` | No webhook secret | Webhook secret নেই | new | |
| `set.leaveBlank` | Leave blank to keep current | আগেরটা রাখতে খালি রাখুন | new | |
| `set.testConnection` | Test connection | কানেকশন পরীক্ষা করুন | new | |
| `set.paymentSaved` | Payment settings saved. | পেমেন্ট সেটিং সেভ হয়েছে। | new | |
| `set.connOkTitle` | Connection OK | কানেকশন ঠিক আছে | new | |
| `set.connFailedTitle` | Connection failed | কানেকশন হয়নি | new | |
| `set.connOkMsg` | Your Razorpay keys work. | আপনার Razorpay key কাজ করছে। | new | |
| `set.connFailedMsg` | Check your keys. | আপনার key আবার দেখুন। | new | |
| `set.webhookHint` | Add this webhook in YOUR Razorpay dashboard: | আপনার Razorpay ড্যাশবোর্ডে এই webhook যোগ করুন: | new | |
| `set.discovery` | Discovery (list your shop) | খোঁজ (আপনার দোকান তালিকায় দিন) | new | |
| `set.city` | City | শহর | new | |
| `set.areaLocality` | Area / locality | এলাকা / পাড়া | new | |
| `set.areaPlaceholder` | Area | এলাকা | new | |
| `set.latitude` | Latitude | অক্ষাংশ | new | |
| `set.longitude` | Longitude | দ্রাঘিমাংশ | new | |
| `set.listShop` | List my shop for nearby customers | কাছের গ্রাহকদের জন্য আমার দোকান তালিকায় দিন | new | |
| `set.discoverySaved` | Discovery settings updated. | খোঁজের সেটিং আপডেট হয়েছে। | new | |
| `set.signOut` | Sign out | সাইন আউট | new | |
| `set.signOutConfirm` | Sign out of this account? | এই অ্যাকাউন্ট থেকে সাইন আউট করবেন? | new | |
| `set.logout` | Log out | লগ আউট | reused | |
| `settings.language` | Language | ভাষা | reused | |
| `settings.betaSuffix` |  (beta) |  (বিটা) | reused | |
| `more.familiesSub` | Group customers, shared credit & reminders | গ্রাহকদের একসাথে রাখুন, মিলিত ধার আর মনে করিয়ে দেওয়া | new | |
| `more.insightsSub` | Analytics overview & aging | হিসেবের সারাংশ আর কত দিনের বাকি | new | |
| `more.settingsSub` | Shop, payments & discovery | দোকান, পেমেন্ট আর খোঁজ | new | |
| `more.moreFeatures` | More features | আরও সুবিধা | new | |
| `more.credits` | Khata Credits & Referral | খাতা ক্রেডিট আর রেফারেল | new | |
| `more.creditsSub` | Earn & spend credits, invite shops | ক্রেডিট জমান আর খরচ করুন, দোকান আনুন | new | |
| `more.promote` | Boost & Branded Store | বুস্ট আর ব্র্যান্ডেড স্টোর | new | |
| `more.promoteSub` | Promote your shop, premium storefront | দোকানের প্রচার করুন, প্রিমিয়াম স্টোর | new | |
| `more.delivery` | Delivery Champions | ডেলিভারি চ্যাম্পিয়ন | new | |
| `more.deliverySub` | Assign deliveries & share status links | ডেলিভারি ভাগ করে দিন আর স্ট্যাটাস লিঙ্ক পাঠান | new | |
| `more.poster` | Share Poster | পোস্টার পাঠান | new | |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | হোয়াটসঅ্যাপ/IG/FB-এর জন্য দোকানের পোস্টার | new | |

### Bengali · Tier 4 — EVERYTHING ELSE

Catalogue, families and empty states. Lowest risk; skim it.

| key | English | Bengali | source | ✓ / suggest |
|---|---|---|---|---|
| `cust.empty` | No customers yet. | এখনো কোনো গ্রাহক নেই। | new | |
| `custd.notFound` | Customer not found. | গ্রাহক পাওয়া যায়নি। | new | |
| `cat.addProduct` | Add product | জিনিস যোগ করুন | new | |
| `cat.namePlaceholder` | Name | নাম | reused | |
| `cat.pricePlaceholder` | Price (₹) | দাম (₹) | new | |
| `cat.unitPlaceholder` | Unit (e.g. kg) | একক (যেমন kg) | new | |
| `cat.descPlaceholder` | Description (optional) | বিবরণ (ঐচ্ছিক) | new | |
| `cat.adding` | Adding… | যোগ হচ্ছে… | new | |
| `cat.products` | Products | জিনিস | reused | |
| `cat.empty` | No products yet. Add your first above. | এখনো কোনো জিনিস নেই। উপরে প্রথমটা যোগ করুন। | new | |
| `cat.active` | Active | চালু | new | |
| `cat.hidden` | Hidden | লুকানো | new | |
| `cat.editPrice` | Edit ₹ | দাম বদলান | new | |
| `cat.deleteTitle` | Delete product | জিনিস মুছুন | new | |
| `cat.deleteConfirm` | Delete "{name}"? This cannot be undone. | “{name}” মুছবেন? এটা আর ফেরানো যাবে না। | new | |
| `cat.editPriceTitle` | Edit price (₹) | দাম বদলান (₹) | new | |
| `cat.missingName` | Enter a product name | জিনিসের নাম লিখুন | new | |
| `cat.myProducts` | My products | আমার জিনিস | new | |
| `cat.addFromCatalogue` | Add from catalogue | তালিকা থেকে যোগ করুন | new | |
| `cat.searchCatalogue` | Search catalogue | তালিকায় খুঁজুন | new | |
| `cat.indicative` | Indicative | আনুমানিক | new | |
| `cat.add` | Add | যোগ করুন | reused | |
| `cat.added` | Added | যোগ হয়েছে | new | |
| `cat.setPrice` | Set price (₹) | দাম দিন (₹) | new | |
| `cat.loadMore` | Load more | আরও দেখুন | new | |
| `cat.noCatalogue` | No catalogue items found. | তালিকায় কিছু পাওয়া যায়নি। | new | |
| `fam.new` | New family | নতুন পরিবার | new | |
| `fam.namePlaceholder` | Family name | পরিবারের নাম | new | |
| `fam.creating` | Creating… | তৈরি হচ্ছে… | new | |
| `fam.create` | Create family | পরিবার তৈরি করুন | new | |
| `fam.hint` | Add members and set a payer from the family's detail screen. | পরিবারের বিস্তারিত পাতা থেকে সদস্য যোগ করুন আর কে টাকা দেবে ঠিক করুন। | new | |
| `fam.families` | Families | পরিবার | new | |
| `fam.empty` | No families yet. | এখনো কোনো পরিবার নেই। | new | |
| `fam.missingName` | Enter a family name | পরিবারের নাম লিখুন | new | |
| `famd.notFound` | Family not found. | পরিবার পাওয়া যায়নি। | new | |
| `famd.payerLabel` | Payer | যিনি টাকা দেন | new | |
| `famd.notSet` | not set | ঠিক করা নেই | new | |
| `famd.sendReminder` | Send WhatsApp reminder | হোয়াটসঅ্যাপে মনে করিয়ে দিন | new | |
| `famd.members` | Members | সদস্য | new | |
| `famd.noCandidates` | No other customers available to add. | যোগ করার মতো আর কোনো গ্রাহক নেই। | new | |
| `famd.noMembers` | No members yet. | এখনো কোনো সদস্য নেই। | new | |
| `famd.payerTag` | (payer) | (যিনি টাকা দেন) | new | |
| `famd.removeTitle` | Remove member | সদস্য সরান | new | |
| `famd.removeConfirm` | Remove {name} from this family? | {name} কে এই পরিবার থেকে সরাবেন? | new | |
| `famd.reminderTitle` | Reminder | রিমাইন্ডার | new | |

## Gujarati — ગુજરાતી

### Gujarati · Tier 1 — MONEY

Balances, amounts, the ledger and the insight numbers. A wrong word here is a wrong number in someone’s head. **Read this tier first.**

| key | English | Gujarati | source | ✓ / suggest |
|---|---|---|---|---|
| `dash.todayPurchases` | Today purchases | આજની ખરીદી | new | |
| `dash.todayCollections` | Today collections | આજની વસૂલી | new | |
| `dash.totalOutstanding` | Total outstanding | કુલ બાકી | reused | |
| `dash.customersWithDues` | Customers with dues | બાકી હોય તેવા ગ્રાહક | new | |
| `dash.newTransaction` | New transaction | નવી લેવડદેવડ | new | |
| `dash.viewCustomers` | View customers | ગ્રાહક જુઓ | new | |
| `custd.balance` | Balance | બેલેન્સ | reused | |
| `custd.creditLimit` | Credit limit | ઉધારની મર્યાદા | new | |
| `custd.recordAction` | Record payment / purchase | ચૂકવણી / ખરીદી નોંધો | new | |
| `custd.transactions` | Transactions | લેવડદેવડ | new | |
| `custd.noTransactions` | No transactions yet. | હજી કોઈ લેવડદેવડ નથી. | new | |
| `addtx.type` | Type | પ્રકાર | new | |
| `addtx.customer` | Customer | ગ્રાહક | new | |
| `addtx.selectedCustomer` | Selected customer | પસંદ કરેલ ગ્રાહક | new | |
| `addtx.amount` | Amount (₹) | રકમ (₹) | reused | |
| `addtx.note` | Note (optional) | નોંધ (વૈકલ્પિક) | new | |
| `addtx.notePlaceholder` | note | નોંધ | new | |
| `addtx.missingBody` | Pick a customer and amount | ગ્રાહક અને રકમ પસંદ કરો | new | |
| `add.invalidAmount` | Enter a valid amount | સાચી રકમ દાખલ કરો | new | |
| `txn.purchase` | Purchase | ખરીદી | reused | |
| `txn.cash` | Cash | રોકડ | reused | |
| `txn.adjustment` | Adjustment | સમાયોજન | new | |
| `pmode.credit` | Credit | ખાતામાં | reused | |
| `pmode.prepaid` | Prepaid | ઓનલાઇન | reused | |
| `pmode.cash` | Cash | રોકડ | reused | |
| `pstatus.paid` | Paid | ચૂકવાયું | reused | |
| `pstatus.pending` | Pending | બાકી | reused | |
| `pstatus.failed` | Failed | થયું નહીં | new | |
| `pstatus.not_required` | Not required | જરૂર નથી | new | |
| `ord.subtotal` | Subtotal | ઉપ-કુલ | reused | |
| `ord.delivery` | Delivery | ડિલિવરી | reused | |
| `oedit.reducedBy` | You are taking off {amount}. | તમે {amount} કાઢી રહ્યા છો. | new | |
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | આ ગ્રાહકના ખાતામાંથી {amount} ઓછા થશે. | new | |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ઓનલાઇન ચૂકવાઈ ગયું છે — {amount} આ ગ્રાહક માટે તમારી દુકાનમાં જમા રહેશે. | new | |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ઓર્ડર આપતી વખતે {amount} ઓછા લો. | new | |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | જો આનાથી ઓર્ડર તમારી ફ્રી-ડિલિવરી રકમથી નીચે જાય, તો નક્કી કરતી વખતે ડિલિવરી ચાર્જ ફરી ગણાશે. | new | |
| `oedit.originalSubtotal` | Original subtotal | મૂળ ઉપ-કુલ | new | |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ઓનલાઇન ચૂકવાયું છે — આ રકમ આ ગ્રાહક માટે તમારી દુકાનમાં જમા થઈ જશે. પૈસા પાછા જતા નથી. | new | |
| `ins.daysN` | {d} days | {d} દિવસ | new | |
| `ins.purchases` | Purchases | ખરીદી | reused | |
| `ins.collections` | Collections | વસૂલી | new | |
| `ins.collectionRate` | Collection rate | વસૂલીનો દર | new | |
| `ins.outstanding` | Outstanding | બાકી | reused | |
| `ins.activeCustomers` | Active customers | સક્રિય ગ્રાહક | new | |
| `ins.withDues` | With dues | જેમની બાકી છે | new | |
| `ins.newCustomers` | New customers | નવા ગ્રાહક | new | |
| `ins.outstandingByAge` | Outstanding by age | કેટલા દિવસની બાકી | new | |
| `ins.age_0_30` | 0–30 days | 0–30 દિવસ | new | |
| `ins.age_31_60` | 31–60 days | 31–60 દિવસ | new | |
| `ins.age_61_90` | 61–90 days | 61–90 દિવસ | new | |
| `ins.age_90_plus` | 90+ days | 90+ દિવસ | new | |
| `ins.total` | Total | કુલ | reused | |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV રિપોર્ટ ડાઉનલોડ વેબ ડેશબોર્ડ પર મળે છે. | new | |
| `famd.combinedOutstanding` | Combined outstanding | સંયુક્ત બાકી | new | |
| `famd.combinedLimit` | Combined limit | સંયુક્ત મર્યાદા | new | |
| `famd.subLimit` | sub-limit {amt} | અલગ મર્યાદા {amt} | new | |
| `famd.combinedStatement` | Combined statement | સંયુક્ત હિસાબ | new | |
| `famd.noTransactions` | No transactions yet. | હજી કોઈ લેવડદેવડ નથી. | new | |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | વોટ્સએપ પર યાદ કરાવ્યું. સંયુક્ત બાકી: {amt}. | new | |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | મોકલાયું નથી (ચૂકવનારનાં નોટિફિકેશન બંધ હોઈ શકે). સંયુક્ત બાકી: {amt}. | new | |
| `fam.limitPlaceholder` | Combined credit limit (₹, optional) | સંયુક્ત ઉધાર મર્યાદા (₹, વૈકલ્પિક) | new | |

### Gujarati · Tier 2 — ORDERS

The repeating new-order alert, accept / reject, the ready-time promise, reducing an order, and whether the shop is open. A misread alert costs a sale.

| key | English | Gujarati | source | ✓ / suggest |
|---|---|---|---|---|
| `oalert.title` | New order waiting | નવો ઓર્ડર રાહ જુએ છે | new | |
| `oalert.more` | +{n} more | બીજા {n} | new | |
| `oalert.items` | {n} items | {n} સામાન | reused | |
| `oalert.waiting` | waiting {mins} min | {mins} મિનિટથી રાહ | new | |
| `oalert.snooze` | Not now — {mins} min | હમણાં નહીં — {mins} મિનિટ | new | |
| `oalert.snoozedFor` | Quiet for {mins} more min | બીજી {mins} મિનિટ શાંત | new | |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | હજી રાહ જુએ છે — તમે આનો જવાબ આપ્યો નથી. | new | |
| `oalert.decide` | This keeps alerting until you accept or reject it. | તમે સ્વીકારો કે નકારો ત્યાં સુધી આ વાગતું જ રહેશે. | new | |
| `oalert.accept` | Accept | સ્વીકારો | new | |
| `oalert.open` | Open | ખોલો | new | |
| `oalert.mute30` | Mute for 30 minutes | 30 મિનિટ શાંત કરો | new | |
| `oalert.unmute` | Turn alerts back on | અલર્ટ ફરી ચાલુ કરો | new | |
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | નવો ઓર્ડર. {name}. {n} સામાન. {amount} રૂપિયા. | new | |
| `oalert.setTitle` | Order alerts | ઓર્ડર અલર્ટ | new | |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | નવો ઓર્ડર તમને વારંવાર જણાવતો રહેશે — અહીં અને વોટ્સએપ પર — જ્યાં સુધી તમે તેને સ્વીકારો કે નકારો નહીં. “હમણાં નહીં” ફક્ત એક ઓર્ડરને થોડી મિનિટ શાંત કરે છે; અલર્ટ બંધ થતું નથી. | new | |
| `oalert.setEnabled` | Alert me about new orders | નવા ઓર્ડર માટે મને જણાવો | new | |
| `oalert.setRepeat` | Repeat every (minutes) | દર કેટલી મિનિટે | new | |
| `oalert.setMaxRepeats` | Stop after (repeats) | કેટલી વાર પછી બંધ | new | |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 મિનિટ શાંત કરો | new | |
| `oalert.setMuted` | Alerts are muted right now. | અત્યારે અલર્ટ શાંત છે. | new | |
| `oalert.setSaved` | Order alert settings saved. | ઓર્ડર અલર્ટ સેટિંગ સેવ થયું. | new | |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | તમે આપેલો આંકડો સૌથી નજીકના માન્ય આંકડામાં બદલ્યો છે. | new | |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | આ ફોન હજી તમારી ભાષામાં બોલી શકતો નથી — પણ બેનર તમને દેખાશે. | new | |
| `orej.reject` | Reject | નકારો | new | |
| `orej.title` | Reject this order? | આ ઓર્ડર નકારવો? | new | |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | ગ્રાહકને કારણ જણાવો — રદ થવાની સાથે તે તેમને મોકલાશે. | new | |
| `orej.r1` | Out of stock | માલ ખતમ છે | new | |
| `orej.r2` | Too busy right now | અત્યારે બહુ કામ છે | new | |
| `orej.r3` | Shop is closing | દુકાન બંધ થઈ રહી છે | new | |
| `orej.placeholder` | Another reason (optional) | બીજું કારણ (વૈકલ્પિક) | new | |
| `orej.confirm` | Reject order | ઓર્ડર નકારો | new | |
| `orej.back` | Back | પાછળ | reused | |
| `orej.done` | Order rejected. | ઓર્ડર નકાર્યો. | new | |
| `eta.accept` | Accept | સ્વીકારો | new | |
| `eta.acceptTitle` | Accept this order | આ ઓર્ડર સ્વીકારો | new | |
| `eta.pickTime` | Ready in about… | લગભગ કેટલી વારમાં તૈયાર… | new | |
| `eta.noTime` | Accept without a time | સમય કહ્યા વગર સ્વીકારો | new | |
| `eta.notNow` | Not now | હમણાં નહીં | new | |
| `eta.accepting` | Accepting… | સ્વીકારાઈ રહ્યું છે… | new | |
| `eta.chipMin` | ~{n} min | ~{n} મિનિટ | new | |
| `eta.chipHour` | ~{n} hour | ~{n} કલાક | new | |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} કલાક {m} મિનિટ | new | |
| `eta.promisedBy` | You promised ready by {time} | તમે {time} સુધીમાં તૈયાર કહ્યું છે | new | |
| `eta.noPromise` | No ready time promised | તૈયાર થવાનો સમય કહ્યો નથી | new | |
| `eta.needMore` | Need more time | વધુ સમય જોઈએ | new | |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | નવો સમય પસંદ કરો — ગ્રાહકને તરત જ જણાવાશે. | new | |
| `eta.sent` | The customer has been told the new time. | ગ્રાહકને નવો સમય જણાવી દીધો છે. | new | |
| `eta.late` | Past the time you promised | તમે કહેલો સમય વીતી ગયો છે | new | |
| `eta.readyBy` | Ready by {time} | {time} સુધીમાં તૈયાર | new | |
| `eta.takingLonger` | Taking a little longer | થોડો વધુ સમય લાગે છે | new | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} સુધીમાં થવાનું હતું. હવે વધુ વાર નહીં લાગે. | new | |
| `oedit.start` | Not everything in stock? | બધો સામાન નથી? | new | |
| `oedit.startBtn` | Reduce this order | ઓર્ડર ઘટાડો | new | |
| `oedit.title` | Reduce this order | ઓર્ડર ઘટાડો | new | |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | જે નથી તે કાઢી નાખો. અહીંથી ફક્ત સામાન દૂર કરી શકાય કે જથ્થો ઘટાડી શકાય — નવો સામાન ઉમેરવો, જથ્થો વધારવો કે ભાવ બદલવો અહીંથી થઈ શકતું નથી. | new | |
| `oedit.remove` | Remove | દૂર કરો | reused | |
| `oedit.restore` | Put back | પાછો મૂકો | new | |
| `oedit.removedTag` | Removed | દૂર કર્યું | new | |
| `oedit.was` | Was {was} | પહેલાં {was} | new | |
| `oedit.wasNow` | Was {was} — now {now} | પહેલાં {was} — હવે {now} | new | |
| `oedit.confirm` | Confirm the new order | નવો ઓર્ડર નક્કી કરો | new | |
| `oedit.saving` | Saving… | સેવ થઈ રહ્યું છે… | reused | |
| `oedit.keep` | Leave it as it was | જેમ હતું તેમ રહેવા દો | new | |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ઓર્ડર ઘટાડ્યો છે. શું બદલાયું તે ગ્રાહકને જણાવી દીધું છે. | new | |
| `oedit.noChange` | Nothing has been changed yet. | હજી કંઈ બદલ્યું નથી. | new | |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | તમે બધું કાઢી નાખ્યું છે. તેના બદલે ઓર્ડર જ રદ કરો. | new | |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | હવે ઓર્ડર સ્વીકારો અને ગ્રાહકને કહો કે ક્યારે તૈયાર થશે. | new | |
| `oedit.historyTitle` | What was taken off | શું કાઢ્યું | new | |
| `oedit.historyRemoved` | {item} — removed | {item} — દૂર કર્યું | new | |
| `oedit.historyUnknownWho` | the shop | દુકાન | new | |
| `ostatus.pending` | Pending | બાકી | reused | |
| `ostatus.accepted` | Accepted | સ્વીકાર્યો | reused | |
| `ostatus.preparing` | Preparing | તૈયાર થઈ રહ્યો છે | reused | |
| `ostatus.ready` | Ready | તૈયાર | reused | |
| `ostatus.out_for_delivery` | Out for delivery | ડિલિવરી માટે નીકળ્યો | reused | |
| `ostatus.completed` | Completed | પૂરો થયો | reused | |
| `ostatus.cancelled` | Cancelled | રદ થયો | reused | |
| `ofilter.all` | All | બધા | new | |
| `ful.delivery` | Delivery | ડિલિવરી | reused | |
| `ful.pickup` | Pickup | પિકઅપ | new | |
| `ord.empty` | No orders in this view yet. | અહીં હજી કોઈ ઓર્ડર નથી. | new | |
| `ord.notFound` | Order not found. | ઓર્ડર મળ્યો નહીં. | new | |
| `ord.mark` | Mark {s} | {s} તરીકે નોંધો | new | |
| `ord.cancelOrder` | Cancel order | ઓર્ડર રદ કરો | reused | |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | આ ઓર્ડર રદ કરવો? આ પાછું નહીં આવે. | new | |
| `ord.marked` | Order marked {s}. | ઓર્ડર {s} નોંધાયો. | new | |
| `ord.terminal` | This order is {s} — no further changes. | આ ઓર્ડર {s} — હવે કોઈ ફેરફાર નહીં. | new | |
| `ord.items` | Items | સામાન | reused | |
| `ord.noItems` | No items on this order. | આ ઓર્ડરમાં કોઈ સામાન નથી. | new | |
| `ord.address` | Address | સરનામું | new | |
| `ord.note` | Note | નોંધ | new | |
| `open.open` | Open | ખુલ્લી | new | |
| `open.closed` | Closed | બંધ | new | |
| `open.todayAt` | at {time} | {time} વાગ્યે | new | |
| `open.tomorrowAt` | tomorrow at {time} | આવતીકાલે {time} વાગ્યે | new | |
| `open.title` | Shop availability | દુકાન ખુલ્લી છે કે નહીં | new | |
| `open.switchLabel` | Shop is open | દુકાન ખુલ્લી છે | new | |
| `open.takingOrders` | You are taking orders right now. | તમે અત્યારે ઓર્ડર લઈ રહ્યા છો. | new | |
| `open.notTakingOrders` | Customers cannot order right now. | ગ્રાહકો અત્યારે ઓર્ડર કરી શકતા નથી. | new | |
| `open.stateClosed` | Closed — you switched the shop off | બંધ — તમે દુકાન બંધ કરી છે | new | |
| `open.statePaused` | Paused — back {when} | થોડીવાર બંધ — {when} ખૂલશે | new | |
| `open.stateHoliday` | Closed today — reopens {when} | આજે બંધ — {when} ફરી ખૂલશે | new | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | આજે બંધ ({reason}) — {when} ફરી ખૂલશે | new | |
| `open.stateHours` | Closed — opens {when} | બંધ — {when} ખૂલશે | new | |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | થોડીવાર બંધ કરવું છે? એક ટચમાં, સમય પસંદ કરવાની જરૂર નથી. | new | |
| `open.pause30` | 30 min | 30 મિનિટ | new | |
| `open.pause60` | 1 hour | 1 કલાક | new | |
| `open.pauseToday` | Rest of today | આજનો બાકીનો સમય | new | |
| `open.resume` | Resume now | હમણાં જ ખોલો | new | |
| `open.hoursTitle` | Shop hours | દુકાનનો સમય | new | |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | રોજ ક્યારે ખૂલશે અને ક્યારે બંધ થશે તે નક્કી કરો, અથવા બંને ખાલી રાખો તો આખો દિવસ ખુલ્લી રહેશે. બંધ થવાનો સમય ખૂલવાના સમય કરતાં વહેલો હોય તો દુકાન મધરાત પછી પણ ખુલ્લી રહે છે એમ સમજાશે. | new | |
| `open.openTime` | Opens at | ક્યારે ખૂલે | new | |
| `open.closeTime` | Closes at | ક્યારે બંધ થાય | new | |
| `open.alwaysOpen` | No daily hours set — open all day. | રોજનો સમય આપેલો નથી — આખો દિવસ ખુલ્લી. | new | |
| `open.saveHours` | Save hours | સમય સેવ કરો | new | |
| `open.clearHours` | Clear hours | સમય કાઢી નાખો | new | |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | ખૂલવાનો અને બંધ થવાનો બંને સમય આપો, નહીં તો બંને કાઢી નાખો. | new | |
| `open.closuresTitle` | Holiday closures | રજાના દિવસો | new | |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | જે દિવસે દુકાન બંધ રહેશે તે તારીખો ઉમેરો — તહેવાર, લગ્ન, ગમે તે. ગ્રાહકો ઓર્ડર કરતાં પહેલાં જ જોઈ શકશે. | new | |
| `open.closureDate` | Date (YYYY-MM-DD) | તારીખ (YYYY-MM-DD) | new | |
| `open.closureReason` | Reason (optional) | કારણ (વૈકલ્પિક) | new | |
| `open.closureReasonPlaceholder` | Diwali | દિવાળી | new | |
| `open.addClosure` | Add date | તારીખ ઉમેરો | new | |
| `open.noClosures` | No closures in the next 90 days. | આવતા 90 દિવસમાં કોઈ રજા નથી. | new | |
| `open.removeClosure` | Remove | દૂર કરો | reused | |

### Gujarati · Tier 3 — NAVIGATION, LOGIN AND SETTINGS

The words the owner sees on every screen. Wrong here reads as a badly made app rather than a wrong number.

| key | English | Gujarati | source | ✓ / suggest |
|---|---|---|---|---|
| `common.save` | Save | સેવ કરો | reused | |
| `common.cancel` | Cancel | રદ કરો | reused | |
| `common.close` | Close | બંધ કરો | reused | |
| `common.add` | Add | ઉમેરો | reused | |
| `common.remove` | Remove | દૂર કરો | reused | |
| `common.delete` | Delete | કાઢી નાખો | new | |
| `common.search` | Search | શોધો | reused | |
| `common.error` | Error | સમસ્યા | new | |
| `common.failed` | Failed | થયું નહીં | new | |
| `common.missing` | Missing | અધૂરું | new | |
| `common.go` | Go | જાઓ | new | |
| `common.keep` | Keep | રહેવા દો | new | |
| `common.retry` | Retry | ફરી પ્રયાસ કરો | reused | |
| `common.loadFailed` | Could not load. Check your connection and try again. | લોડ થઈ શક્યું નહીં. કનેક્શન તપાસીને ફરી પ્રયાસ કરો. | new | |
| `tab.home` | Home | હોમ | new | |
| `tab.orders` | Orders | ઓર્ડર | reused | |
| `tab.catalog` | Catalog | યાદી | new | |
| `tab.customers` | Customers | ગ્રાહક | new | |
| `tab.more` | More | વધુ | new | |
| `title.addTransaction` | Add transaction | લેવડદેવડ ઉમેરો | new | |
| `title.order` | Order | ઓર્ડર | reused | |
| `title.customer` | Customer | ગ્રાહક | new | |
| `title.family` | Family | પરિવાર | new | |
| `title.families` | Families | પરિવારો | new | |
| `title.insights` | Insights | વિશ્લેષણ | new | |
| `title.settings` | Settings | સેટિંગ | new | |
| `login.subtitle` | Sign in to manage your shop | તમારી દુકાન ચલાવવા સાઇન ઇન કરો | new | |
| `login.email` | Email | ઈમેલ | reused | |
| `login.password` | Password | પાસવર્ડ | new | |
| `login.signIn` | Sign in | સાઇન ઇન કરો | reused | |
| `login.signingIn` | Signing in… | સાઇન ઇન થઈ રહ્યું છે… | new | |
| `login.failed` | Login failed | સાઇન ઇન થયું નહીં | new | |
| `admin.title` | Admin account | એડમિન એકાઉન્ટ | new | |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | આ એપ દુકાન માલિકો માટે છે. પ્લેટફોર્મ ચલાવવા માટે વેબ એડમિન કન્સોલ વાપરો. | new | |
| `admin.signOut` | Sign out | સાઇન આઉટ | new | |
| `set.shop` | Shop | દુકાન | new | |
| `set.shopName` | Shop name | દુકાનનું નામ | new | |
| `set.customerNotifications` | Customer notifications | ગ્રાહકનાં નોટિફિકેશન | new | |
| `setn.silent` | Silent | શાંત | new | |
| `setn.smart` | Smart | સ્માર્ટ | new | |
| `setn.active` | Active | સક્રિય | new | |
| `set.savedTitle` | Saved | સેવ થયું | new | |
| `set.shopSaved` | Shop settings updated. | દુકાનનું સેટિંગ અપડેટ થયું. | new | |
| `set.payments` | Payments (your Razorpay) | ચૂકવણી (તમારું Razorpay) | new | |
| `set.modeLabel` | Mode: | મોડ: | new | |
| `set.keySecretSet` | Key secret set | Key secret આપેલું છે | new | |
| `set.noKeySecret` | No key secret | Key secret નથી | new | |
| `set.webhookSecretSet` | Webhook secret set | Webhook secret આપેલું છે | new | |
| `set.noWebhookSecret` | No webhook secret | Webhook secret નથી | new | |
| `set.leaveBlank` | Leave blank to keep current | હાલનું રાખવા ખાલી રાખો | new | |
| `set.testConnection` | Test connection | કનેક્શન ચકાસો | new | |
| `set.paymentSaved` | Payment settings saved. | ચૂકવણી સેટિંગ સેવ થયું. | new | |
| `set.connOkTitle` | Connection OK | કનેક્શન બરાબર | new | |
| `set.connFailedTitle` | Connection failed | કનેક્શન થયું નહીં | new | |
| `set.connOkMsg` | Your Razorpay keys work. | તમારી Razorpay key કામ કરે છે. | new | |
| `set.connFailedMsg` | Check your keys. | તમારી key તપાસો. | new | |
| `set.webhookHint` | Add this webhook in YOUR Razorpay dashboard: | તમારા Razorpay ડેશબોર્ડમાં આ webhook ઉમેરો: | new | |
| `set.discovery` | Discovery (list your shop) | શોધ (તમારી દુકાન યાદીમાં મૂકો) | new | |
| `set.city` | City | શહેર | new | |
| `set.areaLocality` | Area / locality | વિસ્તાર / લત્તો | new | |
| `set.areaPlaceholder` | Area | વિસ્તાર | new | |
| `set.latitude` | Latitude | અક્ષાંશ | new | |
| `set.longitude` | Longitude | રેખાંશ | new | |
| `set.listShop` | List my shop for nearby customers | નજીકના ગ્રાહકો માટે મારી દુકાન યાદીમાં મૂકો | new | |
| `set.discoverySaved` | Discovery settings updated. | શોધ સેટિંગ અપડેટ થયું. | new | |
| `set.signOut` | Sign out | સાઇન આઉટ | new | |
| `set.signOutConfirm` | Sign out of this account? | આ એકાઉન્ટમાંથી સાઇન આઉટ કરવું? | new | |
| `set.logout` | Log out | લોગ આઉટ | reused | |
| `settings.language` | Language | ભાષા | reused | |
| `settings.betaSuffix` |  (beta) |  (બીટા) | reused | |
| `more.familiesSub` | Group customers, shared credit & reminders | ગ્રાહકોને સાથે રાખો, સંયુક્ત ઉધાર અને યાદ કરાવવું | new | |
| `more.insightsSub` | Analytics overview & aging | હિસાબનો સાર અને કેટલા દિવસની બાકી | new | |
| `more.settingsSub` | Shop, payments & discovery | દુકાન, ચૂકવણી અને શોધ | new | |
| `more.moreFeatures` | More features | વધુ સુવિધાઓ | new | |
| `more.credits` | Khata Credits & Referral | ખાતા ક્રેડિટ અને રેફરલ | new | |
| `more.creditsSub` | Earn & spend credits, invite shops | ક્રેડિટ કમાઓ અને વાપરો, દુકાનોને બોલાવો | new | |
| `more.promote` | Boost & Branded Store | બૂસ્ટ અને બ્રાન્ડેડ સ્ટોર | new | |
| `more.promoteSub` | Promote your shop, premium storefront | દુકાનનો પ્રચાર કરો, પ્રીમિયમ સ્ટોર | new | |
| `more.delivery` | Delivery Champions | ડિલિવરી ચેમ્પિયન | new | |
| `more.deliverySub` | Assign deliveries & share status links | ડિલિવરી સોંપો અને સ્ટેટસ લિંક મોકલો | new | |
| `more.poster` | Share Poster | પોસ્ટર મોકલો | new | |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | વોટ્સએપ/IG/FB માટે દુકાનનું પોસ્ટર | new | |

### Gujarati · Tier 4 — EVERYTHING ELSE

Catalogue, families and empty states. Lowest risk; skim it.

| key | English | Gujarati | source | ✓ / suggest |
|---|---|---|---|---|
| `cust.empty` | No customers yet. | હજી કોઈ ગ્રાહક નથી. | new | |
| `custd.notFound` | Customer not found. | ગ્રાહક મળ્યો નહીં. | new | |
| `cat.addProduct` | Add product | સામાન ઉમેરો | new | |
| `cat.namePlaceholder` | Name | નામ | reused | |
| `cat.pricePlaceholder` | Price (₹) | ભાવ (₹) | new | |
| `cat.unitPlaceholder` | Unit (e.g. kg) | એકમ (દા.ત. kg) | new | |
| `cat.descPlaceholder` | Description (optional) | વર્ણન (વૈકલ્પિક) | new | |
| `cat.adding` | Adding… | ઉમેરાઈ રહ્યું છે… | new | |
| `cat.products` | Products | સામાન | reused | |
| `cat.empty` | No products yet. Add your first above. | હજી કોઈ સામાન નથી. ઉપર પહેલો ઉમેરો. | new | |
| `cat.active` | Active | ચાલુ | new | |
| `cat.hidden` | Hidden | છુપાવેલ | new | |
| `cat.editPrice` | Edit ₹ | ભાવ બદલો | new | |
| `cat.deleteTitle` | Delete product | સામાન કાઢી નાખો | new | |
| `cat.deleteConfirm` | Delete "{name}"? This cannot be undone. | “{name}” કાઢી નાખવું? આ પાછું નહીં આવે. | new | |
| `cat.editPriceTitle` | Edit price (₹) | ભાવ બદલો (₹) | new | |
| `cat.missingName` | Enter a product name | સામાનનું નામ દાખલ કરો | new | |
| `cat.myProducts` | My products | મારો સામાન | new | |
| `cat.addFromCatalogue` | Add from catalogue | યાદીમાંથી ઉમેરો | new | |
| `cat.searchCatalogue` | Search catalogue | યાદીમાં શોધો | new | |
| `cat.indicative` | Indicative | અંદાજિત | new | |
| `cat.add` | Add | ઉમેરો | reused | |
| `cat.added` | Added | ઉમેરાયું | new | |
| `cat.setPrice` | Set price (₹) | ભાવ નક્કી કરો (₹) | new | |
| `cat.loadMore` | Load more | વધુ જુઓ | new | |
| `cat.noCatalogue` | No catalogue items found. | યાદીમાં કંઈ મળ્યું નથી. | new | |
| `fam.new` | New family | નવો પરિવાર | new | |
| `fam.namePlaceholder` | Family name | પરિવારનું નામ | new | |
| `fam.creating` | Creating… | બની રહ્યું છે… | new | |
| `fam.create` | Create family | પરિવાર બનાવો | new | |
| `fam.hint` | Add members and set a payer from the family's detail screen. | પરિવારના વિગત પેજ પરથી સભ્યો ઉમેરો અને કોણ ચૂકવશે તે નક્કી કરો. | new | |
| `fam.families` | Families | પરિવારો | new | |
| `fam.empty` | No families yet. | હજી કોઈ પરિવાર નથી. | new | |
| `fam.missingName` | Enter a family name | પરિવારનું નામ દાખલ કરો | new | |
| `famd.notFound` | Family not found. | પરિવાર મળ્યો નહીં. | new | |
| `famd.payerLabel` | Payer | ચૂકવનાર | new | |
| `famd.notSet` | not set | નક્કી નથી | new | |
| `famd.sendReminder` | Send WhatsApp reminder | વોટ્સએપ પર યાદ કરાવો | new | |
| `famd.members` | Members | સભ્યો | new | |
| `famd.noCandidates` | No other customers available to add. | ઉમેરવા માટે બીજો કોઈ ગ્રાહક નથી. | new | |
| `famd.noMembers` | No members yet. | હજી કોઈ સભ્ય નથી. | new | |
| `famd.payerTag` | (payer) | (ચૂકવનાર) | new | |
| `famd.removeTitle` | Remove member | સભ્ય દૂર કરો | new | |
| `famd.removeConfirm` | Remove {name} from this family? | {name} ને આ પરિવારમાંથી દૂર કરવા? | new | |
| `famd.reminderTitle` | Reminder | રિમાઇન્ડર | new | |

## Marathi — मराठी

### Marathi · Tier 1 — MONEY

Balances, amounts, the ledger and the insight numbers. A wrong word here is a wrong number in someone’s head. **Read this tier first.**

| key | English | Marathi | source | ✓ / suggest |
|---|---|---|---|---|
| `dash.todayPurchases` | Today purchases | आजची खरेदी | new | |
| `dash.todayCollections` | Today collections | आजची वसुली | new | |
| `dash.totalOutstanding` | Total outstanding | एकूण उधारी | reused | |
| `dash.customersWithDues` | Customers with dues | उधारी असलेले ग्राहक | new | |
| `dash.newTransaction` | New transaction | नवा व्यवहार | new | |
| `dash.viewCustomers` | View customers | ग्राहक पाहा | new | |
| `custd.balance` | Balance | शिल्लक | reused | |
| `custd.creditLimit` | Credit limit | उधारीची मर्यादा | new | |
| `custd.recordAction` | Record payment / purchase | भरणा / खरेदी नोंदवा | new | |
| `custd.transactions` | Transactions | व्यवहार | new | |
| `custd.noTransactions` | No transactions yet. | अजून कोणताही व्यवहार नाही. | new | |
| `addtx.type` | Type | प्रकार | new | |
| `addtx.customer` | Customer | ग्राहक | new | |
| `addtx.selectedCustomer` | Selected customer | निवडलेला ग्राहक | new | |
| `addtx.amount` | Amount (₹) | रक्कम (₹) | reused | |
| `addtx.note` | Note (optional) | सूचना (ऐच्छिक) | new | |
| `addtx.notePlaceholder` | note | सूचना | new | |
| `addtx.missingBody` | Pick a customer and amount | ग्राहक आणि रक्कम निवडा | new | |
| `add.invalidAmount` | Enter a valid amount | योग्य रक्कम टाका | new | |
| `txn.purchase` | Purchase | खरेदी | reused | |
| `txn.cash` | Cash | रोख | reused | |
| `txn.adjustment` | Adjustment | समायोजन | new | |
| `pmode.credit` | Credit | खात्यावर | reused | |
| `pmode.prepaid` | Prepaid | ऑनलाइन | reused | |
| `pmode.cash` | Cash | रोख | reused | |
| `pstatus.paid` | Paid | भरले | reused | |
| `pstatus.pending` | Pending | बाकी | new | |
| `pstatus.failed` | Failed | झाले नाही | new | |
| `pstatus.not_required` | Not required | गरज नाही | new | |
| `ord.subtotal` | Subtotal | उप-बेरीज | reused | |
| `ord.delivery` | Delivery | डिलिव्हरी | reused | |
| `oedit.reducedBy` | You are taking off {amount}. | तुम्ही {amount} कमी करत आहात. | new | |
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | या ग्राहकाच्या खात्यातून {amount} कमी होतील. | new | |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ऑनलाइन भरणा झाला आहे — {amount} या ग्राहकासाठी तुमच्या दुकानात जमा राहतील. | new | |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ऑर्डर देताना {amount} कमी घ्या. | new | |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | यामुळे ऑर्डर तुमच्या मोफत-डिलिव्हरी रकमेच्या खाली गेली, तर निश्चित करताना डिलिव्हरी शुल्क पुन्हा मोजले जाईल. | new | |
| `oedit.originalSubtotal` | Original subtotal | मूळ उप-बेरीज | new | |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ऑनलाइन भरणा झाला आहे — ही रक्कम या ग्राहकासाठी तुमच्या दुकानात जमा होईल. पैसे परत जात नाहीत. | new | |
| `ins.daysN` | {d} days | {d} दिवस | new | |
| `ins.purchases` | Purchases | खरेदी | reused | |
| `ins.collections` | Collections | वसुली | new | |
| `ins.collectionRate` | Collection rate | वसुलीचा दर | new | |
| `ins.outstanding` | Outstanding | उधारी | new | |
| `ins.activeCustomers` | Active customers | सक्रिय ग्राहक | new | |
| `ins.withDues` | With dues | ज्यांची उधारी आहे | new | |
| `ins.newCustomers` | New customers | नवीन ग्राहक | new | |
| `ins.outstandingByAge` | Outstanding by age | किती दिवसांची उधारी | new | |
| `ins.age_0_30` | 0–30 days | 0–30 दिवस | new | |
| `ins.age_31_60` | 31–60 days | 31–60 दिवस | new | |
| `ins.age_61_90` | 61–90 days | 61–90 दिवस | new | |
| `ins.age_90_plus` | 90+ days | 90+ दिवस | new | |
| `ins.total` | Total | एकूण | reused | |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV रिपोर्ट डाउनलोड वेब डॅशबोर्डवर मिळतो. | new | |
| `famd.combinedOutstanding` | Combined outstanding | एकत्रित उधारी | new | |
| `famd.combinedLimit` | Combined limit | एकत्रित मर्यादा | new | |
| `famd.subLimit` | sub-limit {amt} | स्वतंत्र मर्यादा {amt} | new | |
| `famd.combinedStatement` | Combined statement | एकत्रित हिशेब | new | |
| `famd.noTransactions` | No transactions yet. | अजून कोणताही व्यवहार नाही. | new | |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | व्हॉट्सअॅपवर आठवण पाठवली. एकत्रित उधारी: {amt}. | new | |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | पाठवले नाही (भरणाऱ्याचे नोटिफिकेशन बंद असू शकते). एकत्रित उधारी: {amt}. | new | |
| `fam.limitPlaceholder` | Combined credit limit (₹, optional) | एकत्रित उधारी मर्यादा (₹, ऐच्छिक) | new | |

### Marathi · Tier 2 — ORDERS

The repeating new-order alert, accept / reject, the ready-time promise, reducing an order, and whether the shop is open. A misread alert costs a sale.

| key | English | Marathi | source | ✓ / suggest |
|---|---|---|---|---|
| `oalert.title` | New order waiting | नवीन ऑर्डर वाट पाहत आहे | new | |
| `oalert.more` | +{n} more | आणखी {n} | new | |
| `oalert.items` | {n} items | {n} वस्तू | reused | |
| `oalert.waiting` | waiting {mins} min | {mins} मिनिटांपासून वाट | new | |
| `oalert.snooze` | Not now — {mins} min | आता नको — {mins} मिनिटे | new | |
| `oalert.snoozedFor` | Quiet for {mins} more min | आणखी {mins} मिनिटे शांत | new | |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | अजून वाट पाहत आहे — तुम्ही याचे उत्तर दिलेले नाही. | new | |
| `oalert.decide` | This keeps alerting until you accept or reject it. | तुम्ही स्वीकारेपर्यंत किंवा नाकारेपर्यंत हे वाजतच राहील. | new | |
| `oalert.accept` | Accept | स्वीकारा | new | |
| `oalert.open` | Open | उघडा | new | |
| `oalert.mute30` | Mute for 30 minutes | 30 मिनिटे शांत करा | new | |
| `oalert.unmute` | Turn alerts back on | अलर्ट पुन्हा चालू करा | new | |
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | नवीन ऑर्डर. {name}. {n} वस्तू. {amount} रुपये. | new | |
| `oalert.setTitle` | Order alerts | ऑर्डर अलर्ट | new | |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | नवीन ऑर्डर तुम्हाला पुन्हा पुन्हा सांगत राहील — इथे आणि व्हॉट्सअॅपवर — जोपर्यंत तुम्ही ती स्वीकारत नाही किंवा नाकारत नाही. “आता नको” फक्त एका ऑर्डरला काही मिनिटे शांत करते; अलर्ट बंद होत नाही. | new | |
| `oalert.setEnabled` | Alert me about new orders | नवीन ऑर्डरसाठी मला सांगा | new | |
| `oalert.setRepeat` | Repeat every (minutes) | दर किती मिनिटांनी | new | |
| `oalert.setMaxRepeats` | Stop after (repeats) | किती वेळा नंतर थांबवा | new | |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 मिनिटे शांत करा | new | |
| `oalert.setMuted` | Alerts are muted right now. | सध्या अलर्ट शांत आहेत. | new | |
| `oalert.setSaved` | Order alert settings saved. | ऑर्डर अलर्ट सेटिंग सेव्ह झाले. | new | |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | तुम्ही दिलेला आकडा सर्वात जवळच्या मान्य आकड्यात बदलला आहे. | new | |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | हा फोन अजून तुमच्या भाषेत बोलू शकत नाही — पण बॅनर तुम्हाला दिसेल. | new | |
| `orej.reject` | Reject | नाकारा | new | |
| `orej.title` | Reject this order? | हा ऑर्डर नाकारायचा? | new | |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | ग्राहकाला कारण सांगा — रद्द होण्यासोबत ते त्यांना पाठवले जाईल. | new | |
| `orej.r1` | Out of stock | माल संपला | new | |
| `orej.r2` | Too busy right now | सध्या खूप गर्दी आहे | new | |
| `orej.r3` | Shop is closing | दुकान बंद होत आहे | new | |
| `orej.placeholder` | Another reason (optional) | दुसरे कारण (ऐच्छिक) | new | |
| `orej.confirm` | Reject order | ऑर्डर नाकारा | new | |
| `orej.back` | Back | मागे | reused | |
| `orej.done` | Order rejected. | ऑर्डर नाकारला. | new | |
| `eta.accept` | Accept | स्वीकारा | new | |
| `eta.acceptTitle` | Accept this order | हा ऑर्डर स्वीकारा | new | |
| `eta.pickTime` | Ready in about… | साधारण किती वेळात तयार… | new | |
| `eta.noTime` | Accept without a time | वेळ न सांगता स्वीकारा | new | |
| `eta.notNow` | Not now | आता नको | new | |
| `eta.accepting` | Accepting… | स्वीकारत आहे… | new | |
| `eta.chipMin` | ~{n} min | ~{n} मिनिटे | new | |
| `eta.chipHour` | ~{n} hour | ~{n} तास | new | |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} तास {m} मिनिटे | new | |
| `eta.promisedBy` | You promised ready by {time} | तुम्ही {time} पर्यंत तयार म्हणाला आहात | new | |
| `eta.noPromise` | No ready time promised | तयार होण्याची वेळ सांगितलेली नाही | new | |
| `eta.needMore` | Need more time | आणखी वेळ हवा | new | |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | नवीन वेळ निवडा — ग्राहकाला लगेच कळवले जाईल. | new | |
| `eta.sent` | The customer has been told the new time. | ग्राहकाला नवीन वेळ कळवली आहे. | new | |
| `eta.late` | Past the time you promised | तुम्ही सांगितलेली वेळ उलटून गेली आहे | new | |
| `eta.readyBy` | Ready by {time} | {time} पर्यंत तयार | new | |
| `eta.takingLonger` | Taking a little longer | थोडा जास्त वेळ लागत आहे | new | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} पर्यंत होणार होते. आता फार वेळ लागणार नाही. | new | |
| `oedit.start` | Not everything in stock? | सर्व वस्तू नाहीत? | new | |
| `oedit.startBtn` | Reduce this order | ऑर्डर कमी करा | new | |
| `oedit.title` | Reduce this order | ऑर्डर कमी करा | new | |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | जे नाही ते काढून टाका. इथून फक्त वस्तू काढता येतात किंवा प्रमाण कमी करता येते — नवीन वस्तू जोडणे, प्रमाण वाढवणे किंवा किंमत बदलणे इथून होत नाही. | new | |
| `oedit.remove` | Remove | काढा | reused | |
| `oedit.restore` | Put back | परत ठेवा | new | |
| `oedit.removedTag` | Removed | काढले | new | |
| `oedit.was` | Was {was} | आधी {was} | new | |
| `oedit.wasNow` | Was {was} — now {now} | आधी {was} — आता {now} | new | |
| `oedit.confirm` | Confirm the new order | नवीन ऑर्डर निश्चित करा | new | |
| `oedit.saving` | Saving… | सेव्ह होत आहे… | reused | |
| `oedit.keep` | Leave it as it was | जसे होते तसेच राहू द्या | new | |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ऑर्डर कमी केला आहे. काय बदलले ते ग्राहकाला कळवले आहे. | new | |
| `oedit.noChange` | Nothing has been changed yet. | अजून काहीही बदललेले नाही. | new | |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | तुम्ही सगळेच काढून टाकले आहे. त्याऐवजी ऑर्डरच रद्द करा. | new | |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | आता ऑर्डर स्वीकारा आणि ग्राहकाला सांगा की कधी तयार होईल. | new | |
| `oedit.historyTitle` | What was taken off | काय काढले | new | |
| `oedit.historyRemoved` | {item} — removed | {item} — काढले | new | |
| `oedit.historyUnknownWho` | the shop | दुकान | new | |
| `ostatus.pending` | Pending | प्रलंबित | reused | |
| `ostatus.accepted` | Accepted | स्वीकारले | reused | |
| `ostatus.preparing` | Preparing | तयार होत आहे | reused | |
| `ostatus.ready` | Ready | तयार | reused | |
| `ostatus.out_for_delivery` | Out for delivery | डिलिव्हरीसाठी निघाले | reused | |
| `ostatus.completed` | Completed | पूर्ण झाले | reused | |
| `ostatus.cancelled` | Cancelled | रद्द केले | reused | |
| `ofilter.all` | All | सर्व | new | |
| `ful.delivery` | Delivery | डिलिव्हरी | reused | |
| `ful.pickup` | Pickup | पिकअप | new | |
| `ord.empty` | No orders in this view yet. | इथे अजून कोणताही ऑर्डर नाही. | new | |
| `ord.notFound` | Order not found. | ऑर्डर सापडला नाही. | new | |
| `ord.mark` | Mark {s} | {s} म्हणून नोंदवा | new | |
| `ord.cancelOrder` | Cancel order | ऑर्डर रद्द करा | reused | |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | हा ऑर्डर रद्द करायचा? हे परत मिळणार नाही. | new | |
| `ord.marked` | Order marked {s}. | ऑर्डर {s} म्हणून नोंदवला. | new | |
| `ord.terminal` | This order is {s} — no further changes. | हा ऑर्डर {s} — आता बदल नाही. | new | |
| `ord.items` | Items | वस्तू | reused | |
| `ord.noItems` | No items on this order. | या ऑर्डरमध्ये कोणतीही वस्तू नाही. | new | |
| `ord.address` | Address | पत्ता | new | |
| `ord.note` | Note | सूचना | new | |
| `open.open` | Open | चालू | new | |
| `open.closed` | Closed | बंद | new | |
| `open.todayAt` | at {time} | {time} वाजता | new | |
| `open.tomorrowAt` | tomorrow at {time} | उद्या {time} वाजता | new | |
| `open.title` | Shop availability | दुकान चालू आहे की नाही | new | |
| `open.switchLabel` | Shop is open | दुकान चालू आहे | new | |
| `open.takingOrders` | You are taking orders right now. | तुम्ही सध्या ऑर्डर घेत आहात. | new | |
| `open.notTakingOrders` | Customers cannot order right now. | ग्राहक सध्या ऑर्डर करू शकत नाहीत. | new | |
| `open.stateClosed` | Closed — you switched the shop off | बंद — तुम्ही दुकान बंद केले आहे | new | |
| `open.statePaused` | Paused — back {when} | थोडा वेळ बंद — {when} उघडेल | new | |
| `open.stateHoliday` | Closed today — reopens {when} | आज बंद — {when} पुन्हा उघडेल | new | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | आज बंद ({reason}) — {when} पुन्हा उघडेल | new | |
| `open.stateHours` | Closed — opens {when} | बंद — {when} उघडेल | new | |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | थोडा वेळ बंद करायचे? एका टचमध्ये, वेळ निवडायची गरज नाही. | new | |
| `open.pause30` | 30 min | 30 मिनिटे | new | |
| `open.pause60` | 1 hour | 1 तास | new | |
| `open.pauseToday` | Rest of today | आजचा उरलेला वेळ | new | |
| `open.resume` | Resume now | आताच उघडा | new | |
| `open.hoursTitle` | Shop hours | दुकानाची वेळ | new | |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | रोज कधी उघडेल आणि कधी बंद होईल ते ठरवा, किंवा दोन्ही रिकामे ठेवा म्हणजे दिवसभर चालू राहील. बंद होण्याची वेळ उघडण्याच्या वेळेआधी असेल तर दुकान मध्यरात्रीनंतरही चालू राहते असे समजले जाईल. | new | |
| `open.openTime` | Opens at | कधी उघडते | new | |
| `open.closeTime` | Closes at | कधी बंद होते | new | |
| `open.alwaysOpen` | No daily hours set — open all day. | रोजची वेळ दिलेली नाही — दिवसभर चालू. | new | |
| `open.saveHours` | Save hours | वेळ सेव्ह करा | new | |
| `open.clearHours` | Clear hours | वेळ काढून टाका | new | |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | उघडण्याची आणि बंद होण्याची दोन्ही वेळ द्या, नाहीतर दोन्ही काढून टाका. | new | |
| `open.closuresTitle` | Holiday closures | सुट्टीचे दिवस | new | |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | ज्या दिवशी दुकान बंद राहील त्या तारखा जोडा — सण, लग्न, काहीही. ग्राहकांना ऑर्डर करण्याआधीच दिसेल. | new | |
| `open.closureDate` | Date (YYYY-MM-DD) | तारीख (YYYY-MM-DD) | new | |
| `open.closureReason` | Reason (optional) | कारण (ऐच्छिक) | new | |
| `open.closureReasonPlaceholder` | Diwali | दिवाळी | new | |
| `open.addClosure` | Add date | तारीख जोडा | new | |
| `open.noClosures` | No closures in the next 90 days. | पुढील 90 दिवसांत कोणतीही सुट्टी नाही. | new | |
| `open.removeClosure` | Remove | काढा | reused | |

### Marathi · Tier 3 — NAVIGATION, LOGIN AND SETTINGS

The words the owner sees on every screen. Wrong here reads as a badly made app rather than a wrong number.

| key | English | Marathi | source | ✓ / suggest |
|---|---|---|---|---|
| `common.save` | Save | सेव्ह करा | reused | |
| `common.cancel` | Cancel | रद्द करा | reused | |
| `common.close` | Close | बंद करा | reused | |
| `common.add` | Add | जोडा | reused | |
| `common.remove` | Remove | काढा | reused | |
| `common.delete` | Delete | हटवा | new | |
| `common.search` | Search | शोधा | reused | |
| `common.error` | Error | अडचण | new | |
| `common.failed` | Failed | झाले नाही | new | |
| `common.missing` | Missing | अपूर्ण | new | |
| `common.go` | Go | जा | new | |
| `common.keep` | Keep | राहू द्या | new | |
| `common.retry` | Retry | पुन्हा प्रयत्न करा | reused | |
| `common.loadFailed` | Could not load. Check your connection and try again. | लोड होऊ शकले नाही. कनेक्शन तपासून पुन्हा प्रयत्न करा. | new | |
| `tab.home` | Home | होम | new | |
| `tab.orders` | Orders | ऑर्डर | reused | |
| `tab.catalog` | Catalog | यादी | new | |
| `tab.customers` | Customers | ग्राहक | new | |
| `tab.more` | More | अधिक | new | |
| `title.addTransaction` | Add transaction | व्यवहार जोडा | new | |
| `title.order` | Order | ऑर्डर | reused | |
| `title.customer` | Customer | ग्राहक | new | |
| `title.family` | Family | कुटुंब | new | |
| `title.families` | Families | कुटुंबे | new | |
| `title.insights` | Insights | विश्लेषण | new | |
| `title.settings` | Settings | सेटिंग | new | |
| `login.subtitle` | Sign in to manage your shop | तुमचे दुकान चालवण्यासाठी साइन इन करा | new | |
| `login.email` | Email | ईमेल | reused | |
| `login.password` | Password | पासवर्ड | new | |
| `login.signIn` | Sign in | साइन इन करा | reused | |
| `login.signingIn` | Signing in… | साइन इन होत आहे… | new | |
| `login.failed` | Login failed | साइन इन झाले नाही | new | |
| `admin.title` | Admin account | अॅडमिन अकाउंट | new | |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | हे अॅप दुकान मालकांसाठी आहे. प्लॅटफॉर्म चालवण्यासाठी वेब अॅडमिन कन्सोल वापरा. | new | |
| `admin.signOut` | Sign out | साइन आउट | new | |
| `set.shop` | Shop | दुकान | new | |
| `set.shopName` | Shop name | दुकानाचे नाव | new | |
| `set.customerNotifications` | Customer notifications | ग्राहकांचे नोटिफिकेशन | new | |
| `setn.silent` | Silent | शांत | new | |
| `setn.smart` | Smart | स्मार्ट | new | |
| `setn.active` | Active | सक्रिय | new | |
| `set.savedTitle` | Saved | सेव्ह झाले | new | |
| `set.shopSaved` | Shop settings updated. | दुकानाचे सेटिंग अपडेट झाले. | new | |
| `set.payments` | Payments (your Razorpay) | भरणा (तुमचे Razorpay) | new | |
| `set.modeLabel` | Mode: | मोड: | new | |
| `set.keySecretSet` | Key secret set | Key secret दिलेले आहे | new | |
| `set.noKeySecret` | No key secret | Key secret नाही | new | |
| `set.webhookSecretSet` | Webhook secret set | Webhook secret दिलेले आहे | new | |
| `set.noWebhookSecret` | No webhook secret | Webhook secret नाही | new | |
| `set.leaveBlank` | Leave blank to keep current | सध्याचे ठेवण्यासाठी रिकामे ठेवा | new | |
| `set.testConnection` | Test connection | कनेक्शन तपासा | new | |
| `set.paymentSaved` | Payment settings saved. | भरणा सेटिंग सेव्ह झाले. | new | |
| `set.connOkTitle` | Connection OK | कनेक्शन बरोबर | new | |
| `set.connFailedTitle` | Connection failed | कनेक्शन झाले नाही | new | |
| `set.connOkMsg` | Your Razorpay keys work. | तुमची Razorpay key काम करत आहे. | new | |
| `set.connFailedMsg` | Check your keys. | तुमची key तपासा. | new | |
| `set.webhookHint` | Add this webhook in YOUR Razorpay dashboard: | तुमच्या Razorpay डॅशबोर्डमध्ये हे webhook जोडा: | new | |
| `set.discovery` | Discovery (list your shop) | शोध (तुमचे दुकान यादीत द्या) | new | |
| `set.city` | City | शहर | new | |
| `set.areaLocality` | Area / locality | भाग / परिसर | new | |
| `set.areaPlaceholder` | Area | भाग | new | |
| `set.latitude` | Latitude | अक्षांश | new | |
| `set.longitude` | Longitude | रेखांश | new | |
| `set.listShop` | List my shop for nearby customers | जवळच्या ग्राहकांसाठी माझे दुकान यादीत द्या | new | |
| `set.discoverySaved` | Discovery settings updated. | शोध सेटिंग अपडेट झाले. | new | |
| `set.signOut` | Sign out | साइन आउट | new | |
| `set.signOutConfirm` | Sign out of this account? | या अकाउंटमधून साइन आउट करायचे? | new | |
| `set.logout` | Log out | लॉग आउट | reused | |
| `settings.language` | Language | भाषा | reused | |
| `settings.betaSuffix` |  (beta) |  (बीटा) | reused | |
| `more.familiesSub` | Group customers, shared credit & reminders | ग्राहक एकत्र ठेवा, एकत्रित उधारी आणि आठवण | new | |
| `more.insightsSub` | Analytics overview & aging | हिशेबाचा सारांश आणि किती दिवसांची उधारी | new | |
| `more.settingsSub` | Shop, payments & discovery | दुकान, भरणा आणि शोध | new | |
| `more.moreFeatures` | More features | अधिक सुविधा | new | |
| `more.credits` | Khata Credits & Referral | खाते क्रेडिट आणि रेफरल | new | |
| `more.creditsSub` | Earn & spend credits, invite shops | क्रेडिट मिळवा आणि वापरा, दुकानांना बोलवा | new | |
| `more.promote` | Boost & Branded Store | बूस्ट आणि ब्रँडेड स्टोअर | new | |
| `more.promoteSub` | Promote your shop, premium storefront | दुकानाची जाहिरात करा, प्रीमियम स्टोअर | new | |
| `more.delivery` | Delivery Champions | डिलिव्हरी चॅम्पियन | new | |
| `more.deliverySub` | Assign deliveries & share status links | डिलिव्हरी सोपवा आणि स्टेटस लिंक पाठवा | new | |
| `more.poster` | Share Poster | पोस्टर पाठवा | new | |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | व्हॉट्सअॅप/IG/FB साठी दुकानाचे पोस्टर | new | |

### Marathi · Tier 4 — EVERYTHING ELSE

Catalogue, families and empty states. Lowest risk; skim it.

| key | English | Marathi | source | ✓ / suggest |
|---|---|---|---|---|
| `cust.empty` | No customers yet. | अजून कोणताही ग्राहक नाही. | new | |
| `custd.notFound` | Customer not found. | ग्राहक सापडला नाही. | new | |
| `cat.addProduct` | Add product | वस्तू जोडा | new | |
| `cat.namePlaceholder` | Name | नाव | reused | |
| `cat.pricePlaceholder` | Price (₹) | किंमत (₹) | new | |
| `cat.unitPlaceholder` | Unit (e.g. kg) | एकक (उदा. kg) | new | |
| `cat.descPlaceholder` | Description (optional) | तपशील (ऐच्छिक) | new | |
| `cat.adding` | Adding… | जोडत आहे… | new | |
| `cat.products` | Products | वस्तू | reused | |
| `cat.empty` | No products yet. Add your first above. | अजून कोणतीही वस्तू नाही. वर पहिली जोडा. | new | |
| `cat.active` | Active | चालू | new | |
| `cat.hidden` | Hidden | लपवलेले | new | |
| `cat.editPrice` | Edit ₹ | किंमत बदला | new | |
| `cat.deleteTitle` | Delete product | वस्तू हटवा | new | |
| `cat.deleteConfirm` | Delete "{name}"? This cannot be undone. | “{name}” हटवायचे? हे परत मिळणार नाही. | new | |
| `cat.editPriceTitle` | Edit price (₹) | किंमत बदला (₹) | new | |
| `cat.missingName` | Enter a product name | वस्तूचे नाव टाका | new | |
| `cat.myProducts` | My products | माझ्या वस्तू | new | |
| `cat.addFromCatalogue` | Add from catalogue | यादीतून जोडा | new | |
| `cat.searchCatalogue` | Search catalogue | यादीत शोधा | new | |
| `cat.indicative` | Indicative | अंदाजे | new | |
| `cat.add` | Add | जोडा | reused | |
| `cat.added` | Added | जोडले | new | |
| `cat.setPrice` | Set price (₹) | किंमत ठरवा (₹) | new | |
| `cat.loadMore` | Load more | अधिक पाहा | new | |
| `cat.noCatalogue` | No catalogue items found. | यादीत काही सापडले नाही. | new | |
| `fam.new` | New family | नवीन कुटुंब | new | |
| `fam.namePlaceholder` | Family name | कुटुंबाचे नाव | new | |
| `fam.creating` | Creating… | तयार होत आहे… | new | |
| `fam.create` | Create family | कुटुंब तयार करा | new | |
| `fam.hint` | Add members and set a payer from the family's detail screen. | कुटुंबाच्या तपशील पानावरून सदस्य जोडा आणि कोण पैसे भरणार ते ठरवा. | new | |
| `fam.families` | Families | कुटुंबे | new | |
| `fam.empty` | No families yet. | अजून कोणतेही कुटुंब नाही. | new | |
| `fam.missingName` | Enter a family name | कुटुंबाचे नाव टाका | new | |
| `famd.notFound` | Family not found. | कुटुंब सापडले नाही. | new | |
| `famd.payerLabel` | Payer | भरणारा | new | |
| `famd.notSet` | not set | ठरवलेले नाही | new | |
| `famd.sendReminder` | Send WhatsApp reminder | व्हॉट्सअॅपवर आठवण पाठवा | new | |
| `famd.members` | Members | सदस्य | new | |
| `famd.noCandidates` | No other customers available to add. | जोडण्यासाठी दुसरा कोणताही ग्राहक नाही. | new | |
| `famd.noMembers` | No members yet. | अजून कोणताही सदस्य नाही. | new | |
| `famd.payerTag` | (payer) | (भरणारा) | new | |
| `famd.removeTitle` | Remove member | सदस्य काढा | new | |
| `famd.removeConfirm` | Remove {name} from this family? | {name} ला या कुटुंबातून काढायचे? | new | |
| `famd.reminderTitle` | Reminder | आठवण | new | |

## Where these strings live

- Owner app dictionaries: `mobile-app/src/i18n.js` (the `bn`, `gu` and `mr` blocks).
- Customer app dictionaries, where the reused strings come from: `mobile-app/src/consumer/i18n.js`.
- Voice: `mobile-app/src/lib/useNativeVoice.js` maps `bn-IN`, `gu-IN` and `mr-IN`. A handset
  without that language pack installed reports `unavailable` and the screen says so — it does
  not hang and it does not listen in the wrong language.

