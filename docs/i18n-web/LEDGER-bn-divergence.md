# Bengali web/app divergence — decision ledger

Generated from the same data the change is applied from, so it cannot
describe something other than what happened. Rebuild with
`node scripts/bn-divergence-apply.mjs --ledger`.

| group | rows | outcome |
|---|---|---|
| A — wording variants | 135 | aligned to the app |
| B — word choices and money | 78 | 63 aligned, 5 keep the web, 10 for review |
| C — `c.catDalPulses` | 1 | correctness bug — excluded from A/B, fixed at source |
| skipped | 0 | placeholders differ, not interchangeable |

## Kept the web string — 5

The web wording is closer to what the English actually says.

### `common.amountRs`  _(group B)_
- en:  Amount (₹)
- app: টাকা (₹)
- web: পরিমাণ (₹)
- **web string kept** — the field is labelled Amount (Rs). App's টাকা is 'money'; web's পরিমাণ is 'amount'. The label names a quantity, not a substance.

### `oalert.spoken`  _(group B)_
- en:  New order. {name}. {n} items. {amount} rupees.
- app: নতুন অর্ডার। {name}। {n} জিনিস। {amount} টাকা।
- web: নতুন অর্ডার। {name}। {n}টি জিনিস। {amount} টাকা।
- **web string kept** — Bengali counts with a classifier. App's '{n} জিনিস' is missing it; web's '{n}টি জিনিস' is what a speech engine should say.

### `open.closeTime`  _(group B)_
- en:  Closes at
- app: কখন বন্ধ হয়
- web: বন্ধ হওয়ার সময়
- **web string kept** — same as open.openTime.

### `open.openTime`  _(group B)_
- en:  Opens at
- app: কখন খোলে
- web: খোলার সময়
- **web string kept** — 'Opens at' labels a time field. App's কখন খোলে asks a question ('when does it open?'); web's খোলার সময় names the field.

### `sfaq.order`  _(group B)_
- en:  Order
- app: অর্ডার
- web: ক্রম বা অর্ডার
- **web string kept** — 'Order' here is SEQUENCE — the position of an FAQ in a list. App reads অর্ডার, a purchase order, which is the wrong sense entirely.


## Left for human review — 10

Neither string ships a change until somebody who speaks Bengali answers. The web string stays live meanwhile.

### `c.deliverTo`  _(group B)_
- en:  Deliver to:
- app: এখানে পৌঁছে দিন:
- web: যেখানে ডেলিভারি:
- **NOT CHANGED — needs a Bengali reader** — app এখানে পৌঁছে দিন: is imperative; web যেখানে ডেলিভারি: is a label. It precedes an address, which argues for a label.

### `c.pay`  _(group B)_
- en:  Pay
- app: পরিশোধ
- web: পরিশোধ করুন
- **NOT CHANGED — needs a Bengali reader** — app পরিশোধ (noun) vs web পরিশোধ করুন (imperative). It is a BUTTON, which argues for the imperative, but the glossary pins pay = পরিশোধ.

### `c.unit`  _(group B)_
- en:  unit
- app: টি
- web: একক
- **NOT CHANGED — needs a Bengali reader** — app টি is the natural counter in 'Rs50/টি'; web একক is the literal word for 'unit' and reads technical.

### `fam.sendReminder`  _(group B)_
- en:  Send WhatsApp reminder
- app: হোয়াটসঅ্যাপে মনে করিয়ে দিন
- web: WhatsApp রিমাইন্ডার পাঠান
- **NOT CHANGED — needs a Bengali reader** — app transliterates WhatsApp as হোয়াটসঅ্যাপ; web keeps it Latin, which is what the translation brief asks for. The app is inconsistent with its own rule here.

### `nav.catalog`  _(group B)_
- en:  Catalog
- app: তালিকা
- web: ক্যাটালগ
- **NOT CHANGED — needs a Bengali reader** — app তালিকা means 'list'; web ক্যাটালগ is the loanword. তালিকা is less precise, ক্যাটালগ less Bengali.

### `oedit.originalSubtotal`  _(group B)_
- en:  Original subtotal
- app: আসল উপ-মোট
- web: আগের মোট দাম
- **NOT CHANGED — needs a Bengali reader** — app আসল উপ-মোট keeps 'sub'; web আগের মোট দাম loses it but reads naturally. Which matters more is a call for a reader.

### `open.todayAt`  _(group B)_
- en:  at {time}
- app: {time}-এ
- web: {time} টায়
- **NOT CHANGED — needs a Bengali reader** — app '{time}-এ' vs web '{time} টায়'. টায় is the idiomatic way to say a clock time.

### `open.tomorrowAt`  _(group B)_
- en:  tomorrow at {time}
- app: কাল {time}-এ
- web: আগামীকাল {time} টায়
- **NOT CHANGED — needs a Bengali reader** — same as open.todayAt.

### `set.noKeySecret`  _(group B)_
- en:  No key secret
- app: Key secret নেই
- web: কোনো কী সিক্রেট নেই
- **NOT CHANGED — needs a Bengali reader** — app keeps 'Key secret' in Latin, matching Razorpay's own dashboard and the BRAND_KEYS rule; web translates it. The three Razorpay labels should agree, and which way is the open question in REVIEW-bn-notes.md.

### `set.noWebhookSecret`  _(group B)_
- en:  No webhook secret
- app: Webhook secret নেই
- web: কোনো ওয়েবহুক সিক্রেট নেই
- **NOT CHANGED — needs a Bengali reader** — same as set.noKeySecret.


## Aligned to the app, for a stated reason — 9

These are not style calls — the web string lost content, confused two actions, or doubled a currency word.

### `coedit.cash`  _(group B)_
- en:  Pay {now} when you collect — {amount} of items were taken off.
- app: জিনিস নেওয়ার সময় {now} দিন — {amount}-এর জিনিস বাদ দেওয়া হয়েছে।
- web: নেওয়ার সময় নগদ {now} দিন — {amount} টাকার জিনিস বাদ দেওয়া হয়েছে।
- **web changes to the app string** — same redundant currency word.

### `coedit.credit`  _(group B)_
- en:  {amount} has been taken off your khata at this shop.
- app: এই দোকানে আপনার খাতা থেকে {amount} কমিয়ে দেওয়া হয়েছে।
- web: এই দোকান থেকে আপনার খাতায় {amount} টাকা কমিয়ে দেওয়া হয়েছে।
- **web changes to the app string** — same redundant currency word, and দোকান থেকে...খাতায় muddles which way the money moved.

### `coedit.prepaid`  _(group B)_
- en:  You had already paid. {amount} is kept as credit at this shop — it comes off your next order here.
- app: আপনি আগেই পরিশোধ করেছিলেন। {amount} এই দোকানে আপনার জমা হিসেবে রাখা আছে — এখানে পরের অর্ডারে কমে যাবে।
- web: আপনি আগেই টাকা দিয়েছিলেন। বাকি {amount} টাকা এই দোকানে জমা রইল — পরের অর্ডারে কেটে নেওয়া হবে।
- **web changes to the app string** — same redundant currency word, plus a বাকি ('remaining') the English does not have.

### `oalert.decide`  _(group B)_
- en:  This keeps alerting until you accept or reject it.
- app: আপনি না নেওয়া বা ফিরিয়ে না দেওয়া পর্যন্ত এটা বেজেই যাবে।
- web: মেনে না নেওয়া বা বাতিল না করা পর্যন্ত এই অ্যালার্ট বাজতেই থাকবে।
- **web changes to the app string** — same reject/cancel conflation inside the sentence.

### `oedit.help`  _(group B)_
- en:  Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price.
- app: যা নেই তা বাদ দিন। এখান থেকে শুধু জিনিস সরানো বা পরিমাণ কমানো যায় — নতুন জিনিস যোগ করা, পরিমাণ বাড়ানো বা দাম বদলানো এখান থেকে হয় না।
- web: যে জিনিস নেই তা বাদ দিন। কেবল জিনিস সরাতে বা পরিমাণ কমাতে পারবেন — এখান থেকে নতুন জিনিস বা দাম বাড়ানো যাবে না।
- **web changes to the app string** — CONTENT LOSS: the English forbids adding an item, RAISING A QUANTITY, or changing a price. The web string dropped the quantity clause.

### `oedit.reducedBy`  _(group B)_
- en:  You are taking off {amount}.
- app: আপনি {amount} বাদ দিচ্ছেন।
- web: আপনি {amount} টাকা কমাচ্ছেন।
- **web changes to the app string** — web writes {amount} টাকা beside an amount already carrying Rs, rendering 'Rs500.00 rupees'.

### `open.hoursHelp`  _(group B)_
- en:  Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight.
- app: রোজ কখন খুলবে আর কখন বন্ধ হবে ঠিক করুন, বা দুটোই খালি রাখলে সারা দিন খোলা থাকবে। বন্ধের সময় খোলার সময়ের আগে দিলে বোঝা যাবে যে রাত বারোটার পরেও দোকান খোলা থাকে।
- web: দোকানের খোলা ও বন্ধের সময় সেট করুন, বা সারাদিন খোলা রাখতে ফাঁকা রাখুন।
- **web changes to the app string** — CONTENT LOSS: the web string dropped a whole sentence — that a closing time earlier than the opening time means the shop stays open past midnight.

### `orej.confirm`  _(group B)_
- en:  Reject order
- app: অর্ডার ফিরিয়ে দিন
- web: অর্ডার বাতিল করুন
- **web changes to the app string** — REJECT is not CANCEL. This app treats them as different actions and a shopkeeper must not confuse them; web reads বাতিল (cancel).

### `orej.reject`  _(group B)_
- en:  Reject
- app: ফিরিয়ে দিন
- web: বাতিল করুন
- **web changes to the app string** — same as orej.confirm.


## Aligned to the app (group B, no strong preference) — 54

Word choices where neither is more accurate, so the app wins as the default.

### `acc.genderUnset`  _(group B)_
- en:  Not set
- app: দেওয়া হয়নি
- web: নির্ধারিত নয়
- **web changes to the app string**

### `c.atShop`  _(group B)_
- en:  at {shop}
- app: {shop}-এ
- web: {shop} দোকানে
- **web changes to the app string**

### `c.clearRecent`  _(group B)_
- en:  Clear
- app: মুছুন
- web: মুছে ফেলুন
- **web changes to the app string**

### `c.enterAmount`  _(group B)_
- en:  Enter an amount to pay.
- app: পরিশোধের টাকা লিখুন।
- web: পরিশোধ করার পরিমাণ লিখুন।
- **web changes to the app string**

### `c.locationNotSet`  _(group B)_
- en:  Location not set
- app: লোকেশন নেই
- web: অবস্থান দেওয়া নেই
- **web changes to the app string**

### `c.opening`  _(group B)_
- en:  Opening…
- app: খুলছে…
- web: খোলা হচ্ছে…
- **web changes to the app string**

### `c.payment`  _(group B)_
- en:  Payment
- app: পরিশোধ
- web: পেমেন্ট
- **web changes to the app string**

### `c.paymentColon`  _(group B)_
- en:  Payment:
- app: পরিশোধ:
- web: পেমেন্ট:
- **web changes to the app string**

### `c.prepaid`  _(group B)_
- en:  Prepaid
- app: অনলাইন
- web: আগাম পরিশোধিত
- **web changes to the app string**

### `c.shopByCategory`  _(group B)_
- en:  Shop by category
- app: বিভাগ অনুযায়ী কিনুন
- web: ক্যাটাগরি অনুযায়ী কেনাকাটা
- **web changes to the app string**

### `c.youOwe`  _(group B)_
- en:  You owe {amt}
- app: আপনার {amt} দিতে হবে
- web: আপনার দিতে হবে {amt}
- **web changes to the app string**

### `chelp.e4.a`  _(group B)_
- en:  Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount.
- app: নিজে নিয়ে যাওয়া মানে আপনি অর্ডার নিজে দোকান থেকে নিয়ে আসেন, ফ্রি। ডেলিভারি মানে দোকান আপনার কাছে পৌঁছে দেয়, কখনো সামান্য চার্জে — অনেক দোকান ঠিক করা টাকার উপরে ফ্রি ডেলিভারি দেয়।
- web: পিকআপ মানে আপনি নিজে দোকান থেকে অর্ডার নিয়ে আসেন, ফ্রি। ডেলিভারি মানে দোকান আপনার কাছে পৌঁছে দেয়, কখনো একটু চার্জসহ — অনেক দোকান নির্দিষ্ট টাকার উপরে ফ্রি ডেলিভারি দেয়।
- **web changes to the app string**

### `chelp.e4.q`  _(group B)_
- en:  What is the difference between pickup and delivery?
- app: নিজে নিয়ে যাওয়া আর ডেলিভারির মধ্যে ফারাক কী?
- web: পিকআপ আর ডেলিভারিতে কী তফাত?
- **web changes to the app string**

### `chelp.e5.a`  _(group B)_
- en:  You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later.
- app: আপনি খাতায় (ধার), অনলাইনে, বা নগদে দিতে পারেন। খাতায় নিলে সেই টাকা ওই দোকানে আপনার চলতি ব্যালেন্সে যোগ হয়, পরে মেটাতে পারেন।
- web: আপনি খাতায় (উধার), অনলাইনে, বা নগদে দিতে পারেন। খাতায় নিলে সেই টাকা ওই দোকানে আপনার চলতি বাকিতে যোগ হয়, পরে মিটিয়ে দেবেন।
- **web changes to the app string**

### `chelp.e6.a`  _(group B)_
- en:  Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement.
- app: আপনার খাতা প্রতিটি দোকানে আপনার বাকি এক জায়গায় দেখায়। প্রতিটি কেনাকাটা আর পরিশোধ লেখা থাকে, তাই আপনার ব্যালেন্স সবসময় জানা থাকে আর বিবরণ দেখতে বা ডাউনলোড করতে পারেন।
- web: আপনার খাতা প্রতিটি দোকানে আপনার বাকি টাকা এক জায়গায় দেখায়। প্রতিটি কেনা আর দেওয়া লেখা থাকে, তাই আপনার বাকি সবসময় জানা থাকে, আর বিবরণ দেখতে বা ডাউনলোড করতে পারেন।
- **web changes to the app string**

### `coedit.intro`  _(group B)_
- en:  {shop} could not supply everything you ordered.
- app: {shop}-এ আপনার অর্ডারের সব জিনিস ছিল না।
- web: {shop} সব জিনিস দিতে পারেনি।
- **web changes to the app string**

### `coedit.wasSubtotal`  _(group B)_
- en:  Original items total {was}
- app: আগের জিনিসের মোট {was}
- web: আগের জিনিসের মোট দাম ছিল {was}
- **web changes to the app string**

### `credits.kind.other`  _(group B)_
- en:  Adjustment
- app: সমন্বয়
- web: অ্যাডজাস্টমেন্ট
- **web changes to the app string**

### `dash.customersWithDues`  _(group B)_
- en:  Customers with dues
- app: বাকি আছে এমন গ্রাহক
- web: বাকিওয়ালা গ্রাহক
- **web changes to the app string**

### `dash.revenue.family`  _(group B)_
- en:  Family
- app: পরিবার
- web: ফ্যামিলি
- **web changes to the app string**

### `err.badRequest`  _(group B)_
- en:  Something in that was not right. Please check and try again.
- app: কিছু একটা ঠিক ছিল না। দেখে নিয়ে আবার চেষ্টা করুন।
- web: তথ্যে ভুল আছে। অনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `eta.late`  _(group B)_
- en:  Past the time you promised
- app: আপনার বলা সময় পেরিয়ে গেছে
- web: কথা দেওয়া সময় পার হয়ে গেছে
- **web changes to the app string**

### `eta.noPromise`  _(group B)_
- en:  No ready time promised
- app: তৈরির সময় বলা হয়নি
- web: তৈরি হওয়ার কোনো নির্ধারিত সময় দেওয়া হয়নি
- **web changes to the app string**

### `eta.noTime`  _(group B)_
- en:  Accept without a time
- app: সময় না বলে নিন
- web: সময় দেওয়া ছাড়াই অর্ডার গ্রহণ করুন
- **web changes to the app string**

### `fam.combinedStatement`  _(group B)_
- en:  Combined statement
- app: মিলিত হিসেব
- web: একত্রে বিবরণী
- **web changes to the app string**

### `ins.customersWithDues`  _(group B)_
- en:  Customers with dues
- app: বাকি আছে এমন গ্রাহক
- web: বাকিওয়ালা গ্রাহক
- **web changes to the app string**

### `ins.outstandingByAge`  _(group B)_
- en:  Outstanding by age
- app: কত দিনের বাকি
- web: সময় অনুযায়ী বাকি
- **web changes to the app string**

### `oalert.setEnabled`  _(group B)_
- en:  Alert me about new orders
- app: নতুন অর্ডারের জন্য আমাকে জানান
- web: নতুন অর্ডার এলে আমাকে অ্যালার্ট পাঠাবে
- **web changes to the app string**

### `oalert.setMaxRepeats`  _(group B)_
- en:  Stop after (repeats)
- app: কতবারের পর থামবে
- web: কতবার বাজার পর বন্ধ হবে (পুনরাবৃত্তি)
- **web changes to the app string**

### `oalert.setRepeat`  _(group B)_
- en:  Repeat every (minutes)
- app: প্রতি কত মিনিটে
- web: কত মিনিট পর পর অ্যালার্ট বাজবে
- **web changes to the app string**

### `oedit.feeMayChange`  _(group B)_
- en:  If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm.
- app: এতে যদি অর্ডার আপনার ফ্রি-ডেলিভারির টাকার নিচে নেমে যায়, তাহলে নিশ্চিত করার সময় ডেলিভারি চার্জ আবার হিসেব হবে।
- web: ফ্রি-ডেলিভারির সীমার নিচে নেমে গেলে, কনফার্ম করার সময় ডেলিভারি চার্জ আবার হিসেব হবে।
- **web changes to the app string**

### `oedit.moneyCash`  _(group B)_
- en:  Collect {amount} less when you hand the order over.
- app: অর্ডার দেওয়ার সময় {amount} কম নিন।
- web: মাল দেওয়ার সময় {amount} কম নগদ নেবেন।
- **web changes to the app string**

### `oedit.moneyPrepaid`  _(group B)_
- en:  Already paid online — {amount} will be kept as credit at your shop for this customer.
- app: অনলাইনে পরিশোধ হয়ে গেছে — {amount} এই গ্রাহকের জন্য আপনার দোকানে জমা থাকবে।
- web: অনলাইনে আগেই পরিশোধিত — {amount} এই দোকানে উনার জমা হিসেবে থাকবে।
- **web changes to the app string**

### `oedit.noChange`  _(group B)_
- en:  Nothing has been changed yet.
- app: এখনো কিছু বদলানো হয়নি।
- web: এখনও কোনো পরিবর্তন করা হয়নি।
- **web changes to the app string**

### `oedit.removedTag`  _(group B)_
- en:  Removed
- app: সরানো হয়েছে
- web: বাদ দেওয়া হয়েছে
- **web changes to the app string**

### `oedit.saved`  _(group B)_
- en:  The order has been reduced. The customer has been told what changed.
- app: অর্ডার কমানো হয়েছে। কী বদলেছে গ্রাহককে জানানো হয়েছে।
- web: অর্ডার ছোট করা হয়েছে। গ্রাহককে পরিবর্তন জানিয়ে দেওয়া হয়েছে।
- **web changes to the app string**

### `oedit.thenAccept`  _(group B)_
- en:  Now accept it and tell the customer when it will be ready.
- app: এবার অর্ডারটা নিন আর গ্রাহককে বলুন কখন তৈরি হবে।
- web: এখন গ্রহণ করুন এবং কখন তৈরি হবে গ্রাহককে জানান।
- **web changes to the app string**

### `open.clearHours`  _(group B)_
- en:  Clear hours
- app: সময় মুছুন
- web: সময় মুছে ফেলুন
- **web changes to the app string**

### `open.closureReasonPlaceholder`  _(group B)_
- en:  Diwali
- app: দীপাবলি
- web: দিওয়ালি
- **web changes to the app string**

### `open.closuresTitle`  _(group B)_
- en:  Holiday closures
- app: ছুটির দিন
- web: ছুটি ও বন্ধের দিন
- **web changes to the app string**

### `open.hoursIncomplete`  _(group B)_
- en:  Set both the opening and the closing time, or clear both.
- app: খোলার আর বন্ধের দুটো সময়ই দিন, নয়তো দুটোই মুছে দিন।
- web: খোলা ও বন্ধ দুটি সময়ই সেট করুন, অথবা দুটিই ফাঁকা রাখুন।
- **web changes to the app string**

### `open.resume`  _(group B)_
- en:  Resume now
- app: এখনই খুলুন
- web: এখনই চালু করুন
- **web changes to the app string**

### `ord.payment`  _(group B)_
- en:  Payment
- app: পরিশোধ
- web: পেমেন্ট
- **web changes to the app string**

### `orej.back`  _(group B)_
- en:  Back
- app: পিছনে
- web: পেছনে যান
- **web changes to the app string**

### `orej.prepaidCredit`  _(group B)_
- en:  Paid online — the amount becomes credit for this customer at your shop. There is no refund.
- app: অনলাইনে পরিশোধ হয়েছে — এই টাকা এই গ্রাহকের জন্য আপনার দোকানে জমা হয়ে যাবে। টাকা ফেরত যায় না।
- web: অনলাইনে পরিশোধিত — টাকাটি এই দোকানে গ্রাহকের জমা ব্যালেন্স হিসেবে থাকবে। কোনো রিফান্ড হবে না।
- **web changes to the app string**

### `ref.shareLink`  _(group B)_
- en:  Share link
- app: শেয়ার লিংক
- web: লিঙ্ক শেয়ার করুন
- **web changes to the app string**

### `set.paymentSaved`  _(group B)_
- en:  Payment settings saved.
- app: পেমেন্ট সেটিং সেভ হয়েছে।
- web: পেমেন্ট সেটিংস সেভ হয়েছে।
- **web changes to the app string**

### `sfaq.delete`  _(group B)_
- en:  Delete
- app: মুছুন
- web: মুছে ফেলুন
- **web changes to the app string**

### `stmt.combined`  _(group B)_
- en:  Combined total
- app: সব মিলিয়ে মোট
- web: মোট একত্রে
- **web changes to the app string**

### `stmt.subtitle`  _(group B)_
- en:  Opening balance, dated entries for a range, and closing balance.
- app: শুরুর ব্যালেন্স, সময়ের তারিখ অনুযায়ী এন্ট্রি, আর শেষের ব্যালেন্স।
- web: শুরুর ব্যালেন্স, একটি সময়ের তারিখভিত্তিক এন্ট্রি, এবং শেষের ব্যালেন্স।
- **web changes to the app string**

### `stmt.totalAdjusted`  _(group B)_
- en:  Adjusted by shop
- app: দোকানের সমন্বয়
- web: দোকান থেকে অ্যাডজাস্ট করা হয়েছে
- **web changes to the app string**

### `stmt.totalPurchases`  _(group B)_
- en:  Total purchases
- app: মোট কেনা
- web: মোট কেনাকাটা
- **web changes to the app string**

### `sup.filterCategory`  _(group B)_
- en:  Category
- app: বিভাগ
- web: ক্যাটাগরি
- **web changes to the app string**

### `type.adjustment`  _(group B)_
- en:  Adjustment
- app: সমন্বয়
- web: অ্যাডজাস্টমেন্ট
- **web changes to the app string**


## Aligned to the app (group A, wording variants) — 135

Inflection, politeness and word order.

### `acc.dob`  _(group A)_
- en:  Date of birth
- app: জন্ম তারিখ
- web: জন্মতারিখ
- **web changes to the app string**

### `acc.phoneReadonly`  _(group A)_
- en:  Phone is your login ID and cannot be changed here.
- app: ফোনই আপনার লগইন আইডি, এখানে বদলানো যায় না।
- web: ফোন নম্বরই আপনার লগইন আইডি, এখানে বদলানো যাবে না।
- **web changes to the app string**

### `c.cartEmpty`  _(group A)_
- en:  Your cart is empty.
- app: আপনার ঝুড়ি খালি।
- web: আপনার কার্ট খালি।
- **web changes to the app string**

### `c.codePlaceholder`  _(group A)_
- en:  6-digit code
- app: 6 সংখ্যার কোড
- web: ৬-সংখ্যার কোড
- **web changes to the app string**

### `c.deliveryAddress`  _(group A)_
- en:  Delivery address
- app: ডেলিভারি ঠিকানা
- web: ডেলিভারির ঠিকানা
- **web changes to the app string**

### `c.enterCodeSentTo`  _(group A)_
- en:  Enter the code sent to {phone}
- app: {phone} এ পাঠানো কোড লিখুন
- web: {phone}-এ পাঠানো কোড লিখুন
- **web changes to the app string**

### `c.loadingCatalog`  _(group A)_
- en:  Loading catalog…
- app: তালিকা লোড হচ্ছে…
- web: ক্যাটালগ লোড হচ্ছে…
- **web changes to the app string**

### `c.noProductsFound`  _(group A)_
- en:  No products found. Try another word.
- app: কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে দেখুন।
- web: কোনো জিনিস পাওয়া যায়নি। অন্য নামে খুঁজুন।
- **web changes to the app string**

### `c.noShops`  _(group A)_
- en:  No shops found. Try a different search.
- app: কোনো দোকান পাওয়া যায়নি। অন্য খোঁজ করুন।
- web: কোনো দোকান পাওয়া যায়নি। অন্যভাবে খুঁজুন।
- **web changes to the app string**

### `c.notePlaceholderArrival`  _(group A)_
- en:  e.g. call on arrival
- app: যেমন পৌঁছে কল করুন
- web: যেমন পৌঁছে ফোন করবেন
- **web changes to the app string**

### `c.placeOrder`  _(group A)_
- en:  Place order
- app: অর্ডার করুন
- web: অর্ডার দিন
- **web changes to the app string**

### `c.resendCode`  _(group A)_
- en:  Resend code
- app: কোড আবার পাঠান
- web: আবার কোড পাঠান
- **web changes to the app string**

### `c.searchProductsAll`  _(group A)_
- en:  Search products across shops
- app: সব দোকানে জিনিস খুঁজুন
- web: সব দোকানের জিনিস খুঁজুন
- **web changes to the app string**

### `c.voiceIn`  _(group A)_
- en:  Listens in {language}
- app: {language} ভাষায় শোনে
- web: {language} ভাষায় শুনছে
- **web changes to the app string**

### `c.yourCart`  _(group A)_
- en:  Your cart
- app: আপনার ঝুড়ি
- web: আপনার কার্ট
- **web changes to the app string**

### `cat.addFromCatalogue`  _(group A)_
- en:  Add from catalogue
- app: তালিকা থেকে যোগ করুন
- web: ক্যাটালগ থেকে যোগ করুন
- **web changes to the app string**

### `cat.addProduct`  _(group A)_
- en:  Add product
- app: জিনিস যোগ করুন
- web: পণ্য যোগ করুন
- **web changes to the app string**

### `cat.empty`  _(group A)_
- en:  No products yet. Add your first above.
- app: এখনো কোনো জিনিস নেই। উপরে প্রথমটা যোগ করুন।
- web: এখনো কোনো পণ্য নেই। উপরে প্রথমটি যোগ করুন।
- **web changes to the app string**

### `champ.items`  _(group A)_
- en:  Items
- app: জিনিস
- web: জিনিসপত্র
- **web changes to the app string**

### `chelp.e2.a`  _(group A)_
- en:  Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name.
- app: উপরের সার্চ বার ব্যবহার করুন, বা বিভাগগুলো দেখুন। বলে খুঁজতে 🎤 মাইক চাপুন আর জিনিসের নাম বলুন।
- web: উপরের সার্চ বার ব্যবহার করুন, বা ক্যাটাগরিতে দেখুন। বলে খুঁজতে 🎤 মাইক চাপুন আর জিনিসের নাম বলুন।
- **web changes to the app string**

### `chelp.e3.a`  _(group A)_
- en:  Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it.
- app: দোকান খুলুন, দরকারি জিনিস কার্টে দিন, নিজে নিয়ে যাওয়া না ডেলিভারি বেছে নিন, আর অর্ডার করুন চাপুন। দোকান আপনার অর্ডার পায় আর নিশ্চিত করে।
- web: একটা দোকান খুলুন, যা যা চান কার্টে দিন, পিকআপ বা ডেলিভারি বেছে নিন, আর অর্ডার করুন চাপুন। দোকান আপনার অর্ডার পেয়ে সেটা নিশ্চিত করে দেয়।
- **web changes to the app string**

### `chelp.e6.q`  _(group A)_
- en:  How does my khata (udhaar) work?
- app: আমার খাতা (ধার) কীভাবে চলে?
- web: আমার খাতা (উধার) কীভাবে কাজ করে?
- **web changes to the app string**

### `chelp.e7.a`  _(group A)_
- en:  Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step.
- app: অর্ডার ট্যাব খুলুন আর দেখুন প্রতিটি অর্ডার অপেক্ষমাণ থেকে গৃহীত, তারপর তৈরি বা সম্পূর্ণ হচ্ছে। প্রতি ধাপে আপনি আপডেট পান।
- web: অর্ডার ট্যাব খুলুন, প্রতিটি অর্ডার পেন্ডিং থেকে অনুমোদিত, তারপর তৈরি বা সম্পন্ন হতে দেখুন। প্রতিটি ধাপে আপনি আপডেট পান।
- **web changes to the app string**

### `coedit.nowTotal`  _(group A)_
- en:  Your order now comes to {now}.
- app: আপনার অর্ডারের মোট এখন {now}।
- web: আপনার অর্ডারের নতুন মোট দাম {now}।
- **web changes to the app string**

### `coedit.removed`  _(group A)_
- en:  {item} — removed
- app: {item} — সরানো হয়েছে
- web: {item} — বাদ দেওয়া হয়েছে
- **web changes to the app string**

### `coedit.title`  _(group A)_
- en:  The shop adjusted your order
- app: দোকান আপনার অর্ডার কমিয়েছে
- web: দোকানদার অর্ডারে পরিবর্তন করেছেন
- **web changes to the app string**

### `common.cancel`  _(group A)_
- en:  Cancel
- app: বাতিল করুন
- web: বাতিল
- **web changes to the app string**

### `dash.network.age0`  _(group A)_
- en:  0–30 days
- app: 0–30 দিন
- web: ০–৩০ দিন
- **web changes to the app string**

### `dash.network.age30`  _(group A)_
- en:  31–60 days
- app: 31–60 দিন
- web: ৩১–৬০ দিন
- **web changes to the app string**

### `dash.orderStatus.out_for_delivery`  _(group A)_
- en:  Out for delivery
- app: ডেলিভারিতে রওনা
- web: ডেলিভারিতে বেরিয়েছে
- **web changes to the app string**

### `dist.activeOff`  _(group A)_
- en:  Hidden
- app: লুকানো
- web: লুকানো আছে
- **web changes to the app string**

### `dist.cancelConfirm`  _(group A)_
- en:  Cancel this order?
- app: এই অর্ডার বাতিল করবেন?
- web: এই অর্ডারটি কি বাতিল করতে চান?
- **web changes to the app string**

### `dist.navHome`  _(group A)_
- en:  Orders
- app: অর্ডার
- web: অর্ডারসমূহ
- **web changes to the app string**

### `dist.navShops`  _(group A)_
- en:  Shops
- app: দোকান
- web: দোকানসমূহ
- **web changes to the app string**

### `dist.orderBack`  _(group A)_
- en:  Orders
- app: অর্ডার
- web: অর্ডারসমূহ
- **web changes to the app string**

### `dist.phone`  _(group A)_
- en:  Phone
- app: ফোন
- web: ফোন নম্বর
- **web changes to the app string**

### `dist.shopsTitle`  _(group A)_
- en:  Shops
- app: দোকান
- web: দোকানসমূহ
- **web changes to the app string**

### `dist.terminal`  _(group A)_
- en:  This order is {s} — no further changes.
- app: এই অর্ডার {s} — আর কোনো বদল হবে না।
- web: এই অর্ডারটি {s} — এতে আর পরিবর্তন করা যাবে না।
- **web changes to the app string**

### `dlv.adding`  _(group A)_
- en:  Adding…
- app: যোগ হচ্ছে…
- web: যোগ করা হচ্ছে…
- **web changes to the app string**

### `dlv.title`  _(group A)_
- en:  Delivery Champions
- app: ডেলিভারি চ্যাম্পিয়ন
- web: ডেলিভারি বয়
- **web changes to the app string**

### `err.conflict`  _(group A)_
- en:  That could not be done just now. Please try again.
- app: এটি এখন করা গেল না। আবার চেষ্টা করুন।
- web: কাজটি এখন করা সম্ভব হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `err.generic`  _(group A)_
- en:  Something went wrong. Please try again.
- app: কিছু গোলমাল হয়েছে। আবার চেষ্টা করুন।
- web: কিছু একটা ভুল হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `err.notFound`  _(group A)_
- en:  That is not available any more.
- app: এটি আর নেই।
- web: এটি আর পাওয়া যাচ্ছে না।
- **web changes to the app string**

### `err.offline`  _(group A)_
- en:  No internet right now. Check your connection and try again.
- app: এখন ইন্টারনেট নেই। কানেকশন দেখে আবার চেষ্টা করুন।
- web: ইন্টারনেট নেই। আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `err.server`  _(group A)_
- en:  Something went wrong at our end. Please try again in a moment.
- app: আমাদের দিকে কিছু গোলমাল হয়েছে। একটু পরে আবার চেষ্টা করুন।
- web: আমাদের সার্ভারে সমস্যা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।
- **web changes to the app string**

### `err.signedOut`  _(group A)_
- en:  You have been signed out. Please sign in again.
- app: আপনি লগ আউট হয়ে গেছেন। আবার সাইন ইন করুন।
- web: আপনি সাইন আউট হয়ে গেছেন। অনুগ্রহ করে আবার সাইন ইন করুন।
- **web changes to the app string**

### `err.slow`  _(group A)_
- en:  The network is too slow to finish that. Please try again.
- app: নেটওয়ার্ক খুব ধীর, কাজ শেষ হয়নি। আবার চেষ্টা করুন।
- web: নেটওয়ার্ক খুব ধীরগতির। অনুগ্রহ করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `err.tooMany`  _(group A)_
- en:  Too many tries. Please wait a minute and try again.
- app: অনেক বার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।
- web: অনেকবার চেষ্টা করা হয়েছে। এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।
- **web changes to the app string**

### `eta.accept`  _(group A)_
- en:  Accept
- app: নিন
- web: মেনে নিন
- **web changes to the app string**

### `eta.chipHourMin`  _(group A)_
- en:  ~{h} hr {m} min
- app: ~{h} ঘণ্টা {m} মিনিট
- web: ~{h} ঘণ্টা {m} মি.
- **web changes to the app string**

### `eta.chipMin`  _(group A)_
- en:  ~{n} min
- app: ~{n} মিনিট
- web: ~{n} মি.
- **web changes to the app string**

### `eta.needMoreHelp`  _(group A)_
- en:  Pick a new time — the customer is told straight away.
- app: নতুন সময় বেছে নিন — গ্রাহককে সঙ্গে সঙ্গে জানানো হবে।
- web: নতুন সময় বেছে নিন — গ্রাহককে সাথে সাথেই জানিয়ে দেওয়া হবে।
- **web changes to the app string**

### `eta.notNow`  _(group A)_
- en:  Not now
- app: এখন নয়
- web: এখন না
- **web changes to the app string**

### `eta.pickTime`  _(group A)_
- en:  Ready in about…
- app: কতক্ষণে তৈরি হবে…
- web: আনুমানিক তৈরি হবে…
- **web changes to the app string**

### `eta.promisedBy`  _(group A)_
- en:  You promised ready by {time}
- app: আপনি {time}-এর মধ্যে তৈরি বলেছেন
- web: {time}-এর মধ্যে তৈরি রাখার কথা দিয়েছেন
- **web changes to the app string**

### `eta.readyBy`  _(group A)_
- en:  Ready by {time}
- app: {time}-এর মধ্যে তৈরি
- web: {time}-এর মধ্যে তৈরি হবে
- **web changes to the app string**

### `eta.sent`  _(group A)_
- en:  The customer has been told the new time.
- app: গ্রাহককে নতুন সময় জানানো হয়েছে।
- web: গ্রাহককে নতুন সময় জানিয়ে দেওয়া হয়েছে।
- **web changes to the app string**

### `eta.takingLongerHelp`  _(group A)_
- en:  It was expected by {time}. It should not be much longer.
- app: {time}-এর মধ্যে হওয়ার কথা ছিল। আর বেশি দেরি হবে না।
- web: {time}-এর মধ্যে হওয়ার কথা ছিল। আশা করি আর বেশি দেরি হবে না।
- **web changes to the app string**

### `fam.combinedOutstanding`  _(group A)_
- en:  Combined outstanding
- app: মিলিত বাকি
- web: মোট বাকি
- **web changes to the app string**

### `fam.removeConfirm`  _(group A)_
- en:  Remove {name} from this family?
- app: {name} কে এই পরিবার থেকে সরাবেন?
- web: {name}-কে এই পরিবার থেকে সরাবেন?
- **web changes to the app string**

### `ins.age_0_30`  _(group A)_
- en:  0–30 days
- app: 0–30 দিন
- web: ০–৩০ দিন
- **web changes to the app string**

### `ins.age_31_60`  _(group A)_
- en:  31–60 days
- app: 31–60 দিন
- web: ৩১–৬০ দিন
- **web changes to the app string**

### `ins.age_61_90`  _(group A)_
- en:  61–90 days
- app: 61–90 দিন
- web: ৬১–৯০ দিন
- **web changes to the app string**

### `ins.age_90_plus`  _(group A)_
- en:  90+ days
- app: 90+ দিন
- web: ৯০+ দিন
- **web changes to the app string**

### `log.signIn`  _(group A)_
- en:  Sign in
- app: সাইন ইন করুন
- web: সাইন ইন
- **web changes to the app string**

### `nav.settings`  _(group A)_
- en:  Settings
- app: সেটিং
- web: সেটিংস
- **web changes to the app string**

### `num.cancel`  _(group A)_
- en:  Cancel
- app: বাতিল করুন
- web: বাতিল
- **web changes to the app string**

### `num.changed`  _(group A)_
- en:  Number changed. Your khata across all shops now uses the new number.
- app: নম্বর বদলে গেছে। সব দোকানে আপনার খাতা এখন নতুন নম্বরে।
- web: নম্বর বদলেছে। সব দোকানে আপনার খাতা এখন নতুন নম্বর ব্যবহার করছে।
- **web changes to the app string**

### `num.changing`  _(group A)_
- en:  Changing…
- app: বদলানো হচ্ছে…
- web: বদল হচ্ছে…
- **web changes to the app string**

### `num.confirm`  _(group A)_
- en:  Confirm change
- app: পরিবর্তন নিশ্চিত করুন
- web: বদল নিশ্চিত করুন
- **web changes to the app string**

### `num.current`  _(group A)_
- en:  Current number
- app: এখনকার নম্বর
- web: বর্তমান নম্বর
- **web changes to the app string**

### `num.enterCode`  _(group A)_
- en:  Enter the code sent to {phone}
- app: {phone} এ পাঠানো কোড লিখুন
- web: {phone}-এ পাঠানো কোড লিখুন
- **web changes to the app string**

### `oalert.accept`  _(group A)_
- en:  Accept
- app: নিন
- web: মেনে নিন
- **web changes to the app string**

### `oalert.items`  _(group A)_
- en:  {n} items
- app: {n} জিনিস
- web: {n}টি জিনিস
- **web changes to the app string**

### `oalert.more`  _(group A)_
- en:  +{n} more
- app: আরও {n}টি
- web: +{n}টি আরও
- **web changes to the app string**

### `oalert.setHelp`  _(group A)_
- en:  A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert.
- app: নতুন অর্ডার আপনাকে বারবার জানাতে থাকবে — এখানে আর হোয়াটসঅ্যাপে — যতক্ষণ না আপনি সেটা নেন বা ফিরিয়ে দেন। “এখন নয়” শুধু একটা অর্ডারকে কয়েক মিনিটের জন্য চুপ করায়; অ্যালার্ট বন্ধ হয় না।
- web: যতক্ষণ না আপনি এটি মেনে নিচ্ছেন বা বাতিল করছেন, ততক্ষণ নতুন অর্ডারের অ্যালার্ট (এখানে এবং WhatsApp-এ) বাজতে থাকবে। "এখন না" চাপলে কেবল কয়েক মিনিটের জন্য অ্যালার্ট থামে; স্থায়ীভাবে বন্ধ হয় না।
- **web changes to the app string**

### `oalert.setMuteNow`  _(group A)_
- en:  Mute for 30 minutes
- app: 30 মিনিট চুপ করুন
- web: 30 মিনিটের জন্য মিউট করুন
- **web changes to the app string**

### `oalert.setTitle`  _(group A)_
- en:  Order alerts
- app: অর্ডার অ্যালার্ট
- web: অর্ডারের অ্যালার্ট
- **web changes to the app string**

### `oalert.snooze`  _(group A)_
- en:  Not now — {mins} min
- app: এখন নয় — {mins} মিনিট
- web: এখন না — {mins} মিনিট
- **web changes to the app string**

### `oalert.snoozedFor`  _(group A)_
- en:  Quiet for {mins} more min
- app: আরও {mins} মিনিট চুপ
- web: আরও {mins} মিনিট শান্ত থাকবে
- **web changes to the app string**

### `oalert.stillWaiting`  _(group A)_
- en:  Still waiting — you have not answered this one yet.
- app: এখনো অপেক্ষা করছে — আপনি এটার উত্তর দেননি।
- web: অপেক্ষায় আছে — আপনি এখনও এই অর্ডারের উত্তর দেননি।
- **web changes to the app string**

### `oalert.title`  _(group A)_
- en:  New order waiting
- app: নতুন অর্ডার অপেক্ষা করছে
- web: নতুন অর্ডার এসেছে
- **web changes to the app string**

### `oalert.waiting`  _(group A)_
- en:  waiting {mins} min
- app: {mins} মিনিট ধরে অপেক্ষা
- web: {mins} মিনিট ধরে অপেক্ষা করছে
- **web changes to the app string**

### `oedit.cancelInstead`  _(group A)_
- en:  You have taken off everything. Cancel the order instead.
- app: আপনি সব বাদ দিয়ে দিয়েছেন। তার বদলে অর্ডারটাই বাতিল করুন।
- web: সব জিনিসই বাদ দিয়ে দিয়েছেন। বরং অর্ডারটি বাতিল করে দিন।
- **web changes to the app string**

### `oedit.confirm`  _(group A)_
- en:  Confirm the new order
- app: নতুন অর্ডার নিশ্চিত করুন
- web: নতুন অর্ডারটি কনফার্ম করুন
- **web changes to the app string**

### `oedit.historyRemoved`  _(group A)_
- en:  {item} — removed
- app: {item} — সরানো হয়েছে
- web: {item} — বাদ দেওয়া হয়েছে
- **web changes to the app string**

### `oedit.historyTitle`  _(group A)_
- en:  What was taken off
- app: কী কী বাদ গেছে
- web: কী কী বাদ দেওয়া হয়েছিল
- **web changes to the app string**

### `oedit.keep`  _(group A)_
- en:  Leave it as it was
- app: যেমন ছিল তেমনই থাক
- web: যেমন ছিল তেমনই রাখুন
- **web changes to the app string**

### `oedit.restore`  _(group A)_
- en:  Put back
- app: ফিরিয়ে আনুন
- web: আবার ফিরিয়ে আনুন
- **web changes to the app string**

### `oedit.start`  _(group A)_
- en:  Not everything in stock?
- app: সব জিনিস নেই?
- web: সব স্টক নেই?
- **web changes to the app string**

### `oedit.startBtn`  _(group A)_
- en:  Reduce this order
- app: অর্ডার কমান
- web: এই অর্ডার থেকে জিনিস কমান
- **web changes to the app string**

### `oedit.title`  _(group A)_
- en:  Reduce this order
- app: অর্ডার কমান
- web: অর্ডার থেকে জিনিস কমান
- **web changes to the app string**

### `oedit.was`  _(group A)_
- en:  Was {was}
- app: আগে {was}
- web: আগে ছিল {was}
- **web changes to the app string**

### `oedit.wasNow`  _(group A)_
- en:  Was {was} — now {now}
- app: আগে {was} — এখন {now}
- web: আগে ছিল {was} — এখন {now}
- **web changes to the app string**

### `open.alwaysOpen`  _(group A)_
- en:  No daily hours set — open all day.
- app: রোজকার সময় দেওয়া নেই — সারা দিন খোলা।
- web: দৈনিক সময়সীমা দেওয়া নেই — সারাদিন খোলা।
- **web changes to the app string**

### `open.bannerTitle`  _(group A)_
- en:  This shop is closed right now
- app: এই দোকান এখন বন্ধ
- web: এই দোকানটি এখন বন্ধ আছে
- **web changes to the app string**

### `open.browseOnly`  _(group A)_
- en:  You can look around — ordering opens again when the shop does.
- app: আপনি দেখে নিতে পারেন — দোকান খুললেই আবার অর্ডার করা যাবে।
- web: পছন্দমতো ঘুরে দেখতে পারেন — দোকান খুললে অর্ডার দিতে পারবেন।
- **web changes to the app string**

### `open.cartBlocked`  _(group A)_
- en:  This shop is closed right now, so the order cannot be placed. Your cart is saved.
- app: এই দোকান এখন বন্ধ, তাই অর্ডার করা যাবে না। আপনার কার্ট রাখা আছে।
- web: দোকান বন্ধ থাকায় এখন অর্ডার করা যাবে না। কার্ট সেভ রাখা আছে।
- **web changes to the app string**

### `open.closuresHelp`  _(group A)_
- en:  Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order.
- app: যেদিন দোকান বন্ধ থাকবে সেই তারিখগুলো দিন — পুজো, বিয়ে, যা কিছু। গ্রাহকরা অর্ডার করার আগেই দেখতে পাবেন।
- web: উৎসব বা ছুটির দিন যোগ করুন। গ্রাহকরা অর্ডার করার আগেই তা দেখতে পাবেন।
- **web changes to the app string**

### `open.hoursTitle`  _(group A)_
- en:  Shop hours
- app: দোকানের সময়
- web: দোকানের সময়সূচী
- **web changes to the app string**

### `open.notTakingOrders`  _(group A)_
- en:  Customers cannot order right now.
- app: গ্রাহকরা এখন অর্ডার করতে পারবেন না।
- web: গ্রাহকরা এখন অর্ডার দিতে পারবেন না।
- **web changes to the app string**

### `open.pauseHelp`  _(group A)_
- en:  Shutting for a bit? One tap, no time picker.
- app: কিছুক্ষণের জন্য বন্ধ করবেন? এক টিপেই হবে, সময় বাছতে হবে না।
- web: কিছুক্ষণের জন্য বন্ধ রাখছেন? এক ট্যাঁপেই কাজ হয়ে যাবে।
- **web changes to the app string**

### `open.pauseToday`  _(group A)_
- en:  Rest of today
- app: আজ বাকি সময়
- web: আজকের বাকি সময়
- **web changes to the app string**

### `open.stateClosed`  _(group A)_
- en:  Closed — you switched the shop off
- app: বন্ধ — আপনি দোকান বন্ধ করে রেখেছেন
- web: বন্ধ — আপনি দোকান অফ রেখেছেন
- **web changes to the app string**

### `open.statePaused`  _(group A)_
- en:  Paused — back {when}
- app: কিছুক্ষণ বন্ধ — {when} খুলবে
- web: সাময়িক বন্ধ — {when} আবার খুলবে
- **web changes to the app string**

### `open.takingOrders`  _(group A)_
- en:  You are taking orders right now.
- app: আপনি এখন অর্ডার নিচ্ছেন।
- web: এখন অর্ডার নেওয়া হচ্ছে।
- **web changes to the app string**

### `open.title`  _(group A)_
- en:  Shop availability
- app: দোকান খোলা আছে কি না
- web: দোকান খোলা/বন্ধের অবস্থা
- **web changes to the app string**

### `ord.empty`  _(group A)_
- en:  No orders in this view yet.
- app: এখানে এখনো কোনো অর্ডার নেই।
- web: এই ভিউতে এখনো কোনো অর্ডার নেই।
- **web changes to the app string**

### `orej.done`  _(group A)_
- en:  Order rejected.
- app: অর্ডার ফিরিয়ে দেওয়া হয়েছে।
- web: অর্ডার বাতিল করা হয়েছে।
- **web changes to the app string**

### `orej.help`  _(group A)_
- en:  Tell the customer why — it is sent to them with the cancellation.
- app: গ্রাহককে কারণ জানান — বাতিলের সাথে এটা তাঁর কাছে যাবে।
- web: গ্রাহককে কারণ জানিয়ে দিন — এটি বাতিল বিজ্ঞপ্তির সাথে পাঠানো হবে।
- **web changes to the app string**

### `orej.placeholder`  _(group A)_
- en:  Another reason (optional)
- app: অন্য কারণ (ঐচ্ছিক)
- web: অন্য কোনো কারণ (ঐচ্ছিক)
- **web changes to the app string**

### `orej.r1`  _(group A)_
- en:  Out of stock
- app: জিনিস শেষ
- web: স্টক শেষ
- **web changes to the app string**

### `orej.r2`  _(group A)_
- en:  Too busy right now
- app: এখন খুব চাপ
- web: এখন খুব ব্যস্ত
- **web changes to the app string**

### `orej.title`  _(group A)_
- en:  Reject this order?
- app: এই অর্ডার ফিরিয়ে দেবেন?
- web: এই অর্ডারটি বাতিল করবেন?
- **web changes to the app string**

### `ostatus.hint.ready_pickup`  _(group A)_
- en:  Ready for pickup
- app: নিয়ে যাওয়ার জন্য তৈরি
- web: নিজে নিয়ে যাওয়ার জন্য তৈরি
- **web changes to the app string**

### `ostatus.out_for_delivery`  _(group A)_
- en:  Out for delivery
- app: ডেলিভারিতে রওনা
- web: ডেলিভারিতে বেরিয়েছে
- **web changes to the app string**

### `ref.activatedOf`  _(group A)_
- en:  {a} of {n} activated
- app: {n} জনের মধ্যে {a} সক্রিয়
- web: {n}টির মধ্যে {a}টি চালু হয়েছে
- **web changes to the app string**

### `ref.referredCount`  _(group A)_
- en:  You have referred {n} so far.
- app: এখন পর্যন্ত আপনি {n} জনকে রেফার করেছেন।
- web: আপনি এ পর্যন্ত {n} জনকে রেফার করেছেন।
- **web changes to the app string**

### `ref.subtitle`  _(group A)_
- en:  Share your code. When someone joins with it, they appear here.
- app: আপনার কোড শেয়ার করুন। কেউ সেটি দিয়ে যোগ দিলে এখানে দেখা যাবে।
- web: আপনার কোড শেয়ার করুন। কেউ তা দিয়ে যোগ দিলে এখানে দেখা যাবে।
- **web changes to the app string**

### `ref.title`  _(group A)_
- en:  Invite & earn
- app: আমন্ত্রণ করুন, আয় করুন
- web: আমন্ত্রণ করে আয় করুন
- **web changes to the app string**

### `ref.type.owner`  _(group A)_
- en:  Shop owner
- app: দোকান মালিক
- web: দোকানের মালিক
- **web changes to the app string**

### `set.areaLocality`  _(group A)_
- en:  Area / locality
- app: এলাকা / পাড়া
- web: এলাকা / মহল্লা
- **web changes to the app string**

### `set.customerNotifications`  _(group A)_
- en:  Customer notifications
- app: গ্রাহকের নোটিফিকেশন
- web: গ্রাহক নোটিফিকেশন
- **web changes to the app string**

### `set.discovery`  _(group A)_
- en:  Discovery (list your shop)
- app: খোঁজ (আপনার দোকান তালিকায় দিন)
- web: ডিসকভারি (আপনার দোকান তালিকাভুক্ত করুন)
- **web changes to the app string**

### `set.keySecretSet`  _(group A)_
- en:  Key secret set
- app: Key secret দেওয়া আছে
- web: কী সিক্রেট দেওয়া আছে
- **web changes to the app string**

### `set.leaveBlank`  _(group A)_
- en:  Leave blank to keep current
- app: আগেরটা রাখতে খালি রাখুন
- web: বর্তমানটি রাখতে খালি রাখুন
- **web changes to the app string**

### `set.webhookSecretSet`  _(group A)_
- en:  Webhook secret set
- app: Webhook secret দেওয়া আছে
- web: ওয়েবহুক সিক্রেট দেওয়া আছে
- **web changes to the app string**

### `stmt.allShops`  _(group A)_
- en:  All shops (combined)
- app: সব দোকান (একসঙ্গে)
- web: সব দোকান (একসাথে)
- **web changes to the app string**

### `stmt.loadError`  _(group A)_
- en:  Could not load the statement.
- app: বিবরণ লোড করা গেল না।
- web: বিবরণী লোড করা গেল না।
- **web changes to the app string**

### `stmt.noData`  _(group A)_
- en:  No entries in this date range.
- app: এই সময়ে কোনো এন্ট্রি নেই।
- web: এই তারিখের মধ্যে কোনো এন্ট্রি নেই।
- **web changes to the app string**

### `stmt.pickShop`  _(group A)_
- en:  Choose a shop
- app: দোকান বাছুন
- web: একটি দোকান বাছুন
- **web changes to the app string**

### `stmt.rangeError`  _(group A)_
- en:  The From date must be on or before the To date.
- app: "থেকে" তারিখ "পর্যন্ত" তারিখের আগে বা একই হতে হবে।
- web: শুরুর তারিখ শেষের তারিখের সমান বা আগে হতে হবে।
- **web changes to the app string**

### `stmt.title`  _(group A)_
- en:  Account statement
- app: খাতার বিবরণ
- web: অ্যাকাউন্ট বিবরণী
- **web changes to the app string**

### `sup.noEntries`  _(group A)_
- en:  No entries yet.
- app: এখনো কোনো এন্ট্রি নেই।
- web: এখনও কোনো লেনদেন নেই।
- **web changes to the app string**

### `type.purchase`  _(group A)_
- en:  Purchase
- app: কেনা
- web: কেনাকাটা
- **web changes to the app string**

