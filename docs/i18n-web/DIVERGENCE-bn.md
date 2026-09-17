# bn — where the web and the apps disagree

214 strings have the SAME English and a DIFFERENT translation on the two
surfaces. A shopper moves between them, so this teaches two words for one
thing. None of these is a machine-check failure: every one is valid bn,
with its placeholders intact.

Default action: **align the web to the app**. The app is what most of these
people actually use, its strings are older and have had more eyes on them,
and the web is the surface that changed. But older is not automatically
better, so the three groups below are separated by how much the choice
matters rather than presented as one list.

Rebuild with: `node scripts/web-app-divergence.mjs bn`


## Money — 29

Read these first. A wrong word here is not a style question — it is somebody reading their own ledger backwards. Both readings are checked as correct today; they are listed because the two surfaces should still agree.

### `c.payment`
- en:  Payment
- app: পরিশোধ  _(i18n:txn.payment)_
- web: পেমেন্ট

### `c.paymentColon`
- en:  Payment:
- app: পরিশোধ:  _(i18n:orderdetail.payment)_
- web: পেমেন্ট:

### `c.prepaid`
- en:  Prepaid
- app: অনলাইন  _(i18n:pmode.prepaid)_
- web: আগাম পরিশোধিত

### `oedit.originalSubtotal`
- en:  Original subtotal
- app: আসল উপ-মোট  _(i18n:oedit.originalSubtotal)_
- web: আগের মোট দাম

### `ord.payment`
- en:  Payment
- app: পরিশোধ  _(i18n:txn.payment)_
- web: পেমেন্ট

### `c.enterAmount`
- en:  Enter an amount to pay.
- app: পরিশোধের টাকা লিখুন।  _(i18n:shopkhata.enterAmount)_
- web: পরিশোধ করার পরিমাণ লিখুন।

### `stmt.combined`
- en:  Combined total
- app: সব মিলিয়ে মোট  _(i18n:stmt.combined)_
- web: মোট একত্রে

### `c.pay`
- en:  Pay
- app: পরিশোধ  _(i18n:khata.pay)_
- web: পরিশোধ করুন

### `coedit.prepaid`
- en:  You had already paid. {amount} is kept as credit at this shop — it comes off your next order here.
- app: আপনি আগেই পরিশোধ করেছিলেন। {amount} এই দোকানে আপনার জমা হিসেবে রাখা আছে — এখানে পরের অর্ডারে কমে যাবে।  _(i18n:coedit.prepaid)_
- web: আপনি আগেই টাকা দিয়েছিলেন। বাকি {amount} টাকা এই দোকানে জমা রইল — পরের অর্ডারে কেটে নেওয়া হবে।

### `common.amountRs`
- en:  Amount (₹)
- app: টাকা (₹)  _(i18n:shopkhata.amountRupees)_
- web: পরিমাণ (₹)

### `dash.customersWithDues`
- en:  Customers with dues
- app: বাকি আছে এমন গ্রাহক  _(i18n:dash.customersWithDues)_
- web: বাকিওয়ালা গ্রাহক

### `ins.customersWithDues`
- en:  Customers with dues
- app: বাকি আছে এমন গ্রাহক  _(i18n:dash.customersWithDues)_
- web: বাকিওয়ালা গ্রাহক

### `oedit.reducedBy`
- en:  You are taking off {amount}.
- app: আপনি {amount} বাদ দিচ্ছেন।  _(i18n:oedit.reducedBy)_
- web: আপনি {amount} টাকা কমাচ্ছেন।

### `orej.prepaidCredit`
- en:  Paid online — the amount becomes credit for this customer at your shop. There is no refund.
- app: অনলাইনে পরিশোধ হয়েছে — এই টাকা এই গ্রাহকের জন্য আপনার দোকানে জমা হয়ে যাবে। টাকা ফেরত যায় না।  _(i18n:orej.prepaidCredit)_
- web: অনলাইনে পরিশোধিত — টাকাটি এই দোকানে গ্রাহকের জমা ব্যালেন্স হিসেবে থাকবে। কোনো রিফান্ড হবে না।

### `oedit.help`
- en:  Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price.
- app: যা নেই তা বাদ দিন। এখান থেকে শুধু জিনিস সরানো বা পরিমাণ কমানো যায় — নতুন জিনিস যোগ করা, পরিমাণ বাড়ানো বা দাম বদলানো এখান থেকে হয় না।  _(i18n:oedit.help)_
- web: যে জিনিস নেই তা বাদ দিন। কেবল জিনিস সরাতে বা পরিমাণ কমাতে পারবেন — এখান থেকে নতুন জিনিস বা দাম বাড়ানো যাবে না।

### `oedit.feeMayChange`
- en:  If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm.
- app: এতে যদি অর্ডার আপনার ফ্রি-ডেলিভারির টাকার নিচে নেমে যায়, তাহলে নিশ্চিত করার সময় ডেলিভারি চার্জ আবার হিসেব হবে।  _(i18n:oedit.feeMayChange)_
- web: ফ্রি-ডেলিভারির সীমার নিচে নেমে গেলে, কনফার্ম করার সময় ডেলিভারি চার্জ আবার হিসেব হবে।

### `oedit.moneyCash`
- en:  Collect {amount} less when you hand the order over.
- app: অর্ডার দেওয়ার সময় {amount} কম নিন।  _(i18n:oedit.moneyCash)_
- web: মাল দেওয়ার সময় {amount} কম নগদ নেবেন।

### `oedit.moneyPrepaid`
- en:  Already paid online — {amount} will be kept as credit at your shop for this customer.
- app: অনলাইনে পরিশোধ হয়ে গেছে — {amount} এই গ্রাহকের জন্য আপনার দোকানে জমা থাকবে।  _(i18n:oedit.moneyPrepaid)_
- web: অনলাইনে আগেই পরিশোধিত — {amount} এই দোকানে উনার জমা হিসেবে থাকবে।

### `chelp.e4.a`
- en:  Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount.
- app: নিজে নিয়ে যাওয়া মানে আপনি অর্ডার নিজে দোকান থেকে নিয়ে আসেন, ফ্রি। ডেলিভারি মানে দোকান আপনার কাছে পৌঁছে দেয়, কখনো সামান্য চার্জে — অনেক দোকান ঠিক করা টাকার উপরে ফ্রি ডেলিভারি দেয়।  _(i18n:chelp.e4.a)_
- web: পিকআপ মানে আপনি নিজে দোকান থেকে অর্ডার নিয়ে আসেন, ফ্রি। ডেলিভারি মানে দোকান আপনার কাছে পৌঁছে দেয়, কখনো একটু চার্জসহ — অনেক দোকান নির্দিষ্ট টাকার উপরে ফ্রি ডেলিভারি দেয়।

### `coedit.wasSubtotal`
- en:  Original items total {was}
- app: আগের জিনিসের মোট {was}  _(i18n:coedit.wasSubtotal)_
- web: আগের জিনিসের মোট দাম ছিল {was}

### `chelp.e6.a`
- en:  Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement.
- app: আপনার খাতা প্রতিটি দোকানে আপনার বাকি এক জায়গায় দেখায়। প্রতিটি কেনাকাটা আর পরিশোধ লেখা থাকে, তাই আপনার ব্যালেন্স সবসময় জানা থাকে আর বিবরণ দেখতে বা ডাউনলোড করতে পারেন।  _(i18n:chelp.e6.a)_
- web: আপনার খাতা প্রতিটি দোকানে আপনার বাকি টাকা এক জায়গায় দেখায়। প্রতিটি কেনা আর দেওয়া লেখা থাকে, তাই আপনার বাকি সবসময় জানা থাকে, আর বিবরণ দেখতে বা ডাউনলোড করতে পারেন।

### `coedit.cash`
- en:  Pay {now} when you collect — {amount} of items were taken off.
- app: জিনিস নেওয়ার সময় {now} দিন — {amount}-এর জিনিস বাদ দেওয়া হয়েছে।  _(i18n:coedit.cash)_
- web: নেওয়ার সময় নগদ {now} দিন — {amount} টাকার জিনিস বাদ দেওয়া হয়েছে।

### `chelp.e5.a`
- en:  You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later.
- app: আপনি খাতায় (ধার), অনলাইনে, বা নগদে দিতে পারেন। খাতায় নিলে সেই টাকা ওই দোকানে আপনার চলতি ব্যালেন্সে যোগ হয়, পরে মেটাতে পারেন।  _(i18n:chelp.e5.a)_
- web: আপনি খাতায় (উধার), অনলাইনে, বা নগদে দিতে পারেন। খাতায় নিলে সেই টাকা ওই দোকানে আপনার চলতি বাকিতে যোগ হয়, পরে মিটিয়ে দেবেন।

### `stmt.subtitle`
- en:  Opening balance, dated entries for a range, and closing balance.
- app: শুরুর ব্যালেন্স, সময়ের তারিখ অনুযায়ী এন্ট্রি, আর শেষের ব্যালেন্স।  _(i18n:stmt.subtitle)_
- web: শুরুর ব্যালেন্স, একটি সময়ের তারিখভিত্তিক এন্ট্রি, এবং শেষের ব্যালেন্স।

### `coedit.credit`
- en:  {amount} has been taken off your khata at this shop.
- app: এই দোকানে আপনার খাতা থেকে {amount} কমিয়ে দেওয়া হয়েছে।  _(i18n:coedit.credit)_
- web: এই দোকান থেকে আপনার খাতায় {amount} টাকা কমিয়ে দেওয়া হয়েছে।

### `c.youOwe`
- en:  You owe {amt}
- app: আপনার {amt} দিতে হবে  _(i18n:shopkhata.youOwe)_
- web: আপনার দিতে হবে {amt}

### `oalert.spoken`
- en:  New order. {name}. {n} items. {amount} rupees.
- app: নতুন অর্ডার। {name}। {n} জিনিস। {amount} টাকা।  _(i18n:oalert.spoken)_
- web: নতুন অর্ডার। {name}। {n}টি জিনিস। {amount} টাকা।

### `set.paymentSaved`
- en:  Payment settings saved.
- app: পেমেন্ট সেটিং সেভ হয়েছে।  _(i18n:set.paymentSaved)_
- web: পেমেন্ট সেটিংস সেভ হয়েছে।

### `stmt.totalPurchases`
- en:  Total purchases
- app: মোট কেনা  _(i18n:stmt.totalPurchases)_
- web: মোট কেনাকাটা


## Different word chosen — 49

Little shared vocabulary between the two — a real decision was made differently each time, not a spelling variant. These are where a shopper is most likely to notice.

### `acc.genderUnset`
- en:  Not set
- app: দেওয়া হয়নি  _(i18n:account.genderUnset)_
- web: নির্ধারিত নয়

### `c.atShop`
- en:  at {shop}
- app: {shop}-এ  _(i18n:psearch.atShop)_
- web: {shop} দোকানে

### `c.clearRecent`
- en:  Clear
- app: মুছুন  _(i18n:psearch.clearRecent)_
- web: মুছে ফেলুন

### `c.deliverTo`
- en:  Deliver to:
- app: এখানে পৌঁছে দিন:  _(i18n:orderdetail.deliverTo)_
- web: যেখানে ডেলিভারি:

### `c.opening`
- en:  Opening…
- app: খুলছে…  _(i18n:khata.opening)_
- web: খোলা হচ্ছে…

### `c.unit`
- en:  unit
- app: টি  _(i18n:shopdetail.unit)_
- web: একক

### `credits.kind.other`
- en:  Adjustment
- app: সমন্বয়  _(i18n:txn.adjustment)_
- web: অ্যাডজাস্টমেন্ট

### `dash.revenue.family`
- en:  Family
- app: পরিবার  _(i18n:title.family)_
- web: ফ্যামিলি

### `fam.combinedStatement`
- en:  Combined statement
- app: মিলিত হিসেব  _(i18n:famd.combinedStatement)_
- web: একত্রে বিবরণী

### `fam.sendReminder`
- en:  Send WhatsApp reminder
- app: হোয়াটসঅ্যাপে মনে করিয়ে দিন  _(i18n:famd.sendReminder)_
- web: WhatsApp রিমাইন্ডার পাঠান

### `nav.catalog`
- en:  Catalog
- app: তালিকা  _(i18n:tab.catalog)_
- web: ক্যাটালগ

### `open.closureReasonPlaceholder`
- en:  Diwali
- app: দীপাবলি  _(i18n:open.closureReasonPlaceholder)_
- web: দিওয়ালি

### `open.openTime`
- en:  Opens at
- app: কখন খোলে  _(i18n:open.openTime)_
- web: খোলার সময়

### `open.todayAt`
- en:  at {time}
- app: {time}-এ  _(i18n:open.todayAt)_
- web: {time} টায়

### `orej.back`
- en:  Back
- app: পিছনে  _(i18n:common.back)_
- web: পেছনে যান

### `orej.reject`
- en:  Reject
- app: ফিরিয়ে দিন  _(i18n:orej.reject)_
- web: বাতিল করুন

### `sfaq.delete`
- en:  Delete
- app: মুছুন  _(i18n:common.delete)_
- web: মুছে ফেলুন

### `stmt.totalAdjusted`
- en:  Adjusted by shop
- app: দোকানের সমন্বয়  _(i18n:txn.adjustment)_
- web: দোকান থেকে অ্যাডজাস্ট করা হয়েছে

### `sup.filterCategory`
- en:  Category
- app: বিভাগ  _(i18n:shopdetail.category)_
- web: ক্যাটাগরি

### `type.adjustment`
- en:  Adjustment
- app: সমন্বয়  _(i18n:txn.adjustment)_
- web: অ্যাডজাস্টমেন্ট

### `open.hoursIncomplete`
- en:  Set both the opening and the closing time, or clear both.
- app: খোলার আর বন্ধের দুটো সময়ই দিন, নয়তো দুটোই মুছে দিন।  _(i18n:open.hoursIncomplete)_
- web: খোলা ও বন্ধ দুটি সময়ই সেট করুন, অথবা দুটিই ফাঁকা রাখুন।

### `chelp.e4.q`
- en:  What is the difference between pickup and delivery?
- app: নিজে নিয়ে যাওয়া আর ডেলিভারির মধ্যে ফারাক কী?  _(i18n:chelp.e4.q)_
- web: পিকআপ আর ডেলিভারিতে কী তফাত?

### `eta.noTime`
- en:  Accept without a time
- app: সময় না বলে নিন  _(i18n:eta.noTime)_
- web: সময় দেওয়া ছাড়াই অর্ডার গ্রহণ করুন

### `oalert.setMaxRepeats`
- en:  Stop after (repeats)
- app: কতবারের পর থামবে  _(i18n:oalert.setMaxRepeats)_
- web: কতবার বাজার পর বন্ধ হবে (পুনরাবৃত্তি)

### `oalert.setRepeat`
- en:  Repeat every (minutes)
- app: প্রতি কত মিনিটে  _(i18n:oalert.setRepeat)_
- web: কত মিনিট পর পর অ্যালার্ট বাজবে

### `oedit.noChange`
- en:  Nothing has been changed yet.
- app: এখনো কিছু বদলানো হয়নি।  _(i18n:oedit.noChange)_
- web: এখনও কোনো পরিবর্তন করা হয়নি।

### `open.closuresTitle`
- en:  Holiday closures
- app: ছুটির দিন  _(i18n:open.closuresTitle)_
- web: ছুটি ও বন্ধের দিন

### `set.noKeySecret`
- en:  No key secret
- app: Key secret নেই  _(i18n:set.noKeySecret)_
- web: কোনো কী সিক্রেট নেই

### `set.noWebhookSecret`
- en:  No webhook secret
- app: Webhook secret নেই  _(i18n:set.noWebhookSecret)_
- web: কোনো ওয়েবহুক সিক্রেট নেই

### `open.hoursHelp`
- en:  Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight.
- app: রোজ কখন খুলবে আর কখন বন্ধ হবে ঠিক করুন, বা দুটোই খালি রাখলে সারা দিন খোলা থাকবে। বন্ধের সময় খোলার সময়ের আগে দিলে বোঝা যাবে যে রাত বারোটার পরেও দোকান খোলা থাকে।  _(i18n:open.hoursHelp)_
- web: দোকানের খোলা ও বন্ধের সময় সেট করুন, বা সারাদিন খোলা রাখতে ফাঁকা রাখুন।

### `coedit.intro`
- en:  {shop} could not supply everything you ordered.
- app: {shop}-এ আপনার অর্ডারের সব জিনিস ছিল না।  _(i18n:coedit.intro)_
- web: {shop} সব জিনিস দিতে পারেনি।

### `eta.noPromise`
- en:  No ready time promised
- app: তৈরির সময় বলা হয়নি  _(i18n:eta.noPromise)_
- web: তৈরি হওয়ার কোনো নির্ধারিত সময় দেওয়া হয়নি

### `err.badRequest`
- en:  Something in that was not right. Please check and try again.
- app: কিছু একটা ঠিক ছিল না। দেখে নিয়ে আবার চেষ্টা করুন।  _(i18n:err.badRequest)_
- web: তথ্যে ভুল আছে। অনুগ্রহ করে পরীক্ষা করে আবার চেষ্টা করুন।

### `c.locationNotSet`
- en:  Location not set
- app: লোকেশন নেই  _(i18n:shops.noLocation)_
- web: অবস্থান দেওয়া নেই

### `c.shopByCategory`
- en:  Shop by category
- app: বিভাগ অনুযায়ী কিনুন  _(i18n:psearch.browse)_
- web: ক্যাটাগরি অনুযায়ী কেনাকাটা

### `eta.late`
- en:  Past the time you promised
- app: আপনার বলা সময় পেরিয়ে গেছে  _(i18n:eta.late)_
- web: কথা দেওয়া সময় পার হয়ে গেছে

### `ins.outstandingByAge`
- en:  Outstanding by age
- app: কত দিনের বাকি  _(i18n:ins.outstandingByAge)_
- web: সময় অনুযায়ী বাকি

### `oalert.decide`
- en:  This keeps alerting until you accept or reject it.
- app: আপনি না নেওয়া বা ফিরিয়ে না দেওয়া পর্যন্ত এটা বেজেই যাবে।  _(i18n:oalert.decide)_
- web: মেনে না নেওয়া বা বাতিল না করা পর্যন্ত এই অ্যালার্ট বাজতেই থাকবে।

### `oalert.setEnabled`
- en:  Alert me about new orders
- app: নতুন অর্ডারের জন্য আমাকে জানান  _(i18n:oalert.setEnabled)_
- web: নতুন অর্ডার এলে আমাকে অ্যালার্ট পাঠাবে

### `oedit.removedTag`
- en:  Removed
- app: সরানো হয়েছে  _(i18n:oedit.removedTag)_
- web: বাদ দেওয়া হয়েছে

### `oedit.saved`
- en:  The order has been reduced. The customer has been told what changed.
- app: অর্ডার কমানো হয়েছে। কী বদলেছে গ্রাহককে জানানো হয়েছে।  _(i18n:oedit.saved)_
- web: অর্ডার ছোট করা হয়েছে। গ্রাহককে পরিবর্তন জানিয়ে দেওয়া হয়েছে।

### `oedit.thenAccept`
- en:  Now accept it and tell the customer when it will be ready.
- app: এবার অর্ডারটা নিন আর গ্রাহককে বলুন কখন তৈরি হবে।  _(i18n:oedit.thenAccept)_
- web: এখন গ্রহণ করুন এবং কখন তৈরি হবে গ্রাহককে জানান।

### `open.clearHours`
- en:  Clear hours
- app: সময় মুছুন  _(i18n:open.clearHours)_
- web: সময় মুছে ফেলুন

### `open.closeTime`
- en:  Closes at
- app: কখন বন্ধ হয়  _(i18n:open.closeTime)_
- web: বন্ধ হওয়ার সময়

### `open.resume`
- en:  Resume now
- app: এখনই খুলুন  _(i18n:open.resume)_
- web: এখনই চালু করুন

### `open.tomorrowAt`
- en:  tomorrow at {time}
- app: কাল {time}-এ  _(i18n:open.tomorrowAt)_
- web: আগামীকাল {time} টায়

### `orej.confirm`
- en:  Reject order
- app: অর্ডার ফিরিয়ে দিন  _(i18n:orej.confirm)_
- web: অর্ডার বাতিল করুন

### `ref.shareLink`
- en:  Share link
- app: শেয়ার লিংক  _(i18n:ref.shareLink)_
- web: লিঙ্ক শেয়ার করুন

### `sfaq.order`
- en:  Order
- app: অর্ডার  _(i18n:orderdetail.title)_
- web: ক্রম বা অর্ডার


## Same words, different wording — 136

Inflection, politeness or word order. Lowest stakes, and the largest group.

### `open.browseOnly`
- en:  You can look around — ordering opens again when the shop does.
- app: আপনি দেখে নিতে পারেন — দোকান খুললেই আবার অর্ডার করা যাবে।  _(i18n:open.browseOnly)_
- web: পছন্দমতো ঘুরে দেখতে পারেন — দোকান খুললে অর্ডার দিতে পারবেন।

### `open.pauseHelp`
- en:  Shutting for a bit? One tap, no time picker.
- app: কিছুক্ষণের জন্য বন্ধ করবেন? এক টিপেই হবে, সময় বাছতে হবে না।  _(i18n:open.pauseHelp)_
- web: কিছুক্ষণের জন্য বন্ধ রাখছেন? এক ট্যাঁপেই কাজ হয়ে যাবে।

### `orej.help`
- en:  Tell the customer why — it is sent to them with the cancellation.
- app: গ্রাহককে কারণ জানান — বাতিলের সাথে এটা তাঁর কাছে যাবে।  _(i18n:orej.help)_
- web: গ্রাহককে কারণ জানিয়ে দিন — এটি বাতিল বিজ্ঞপ্তির সাথে পাঠানো হবে।

### `open.closuresHelp`
- en:  Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order.
- app: যেদিন দোকান বন্ধ থাকবে সেই তারিখগুলো দিন — পুজো, বিয়ে, যা কিছু। গ্রাহকরা অর্ডার করার আগেই দেখতে পাবেন।  _(i18n:open.closuresHelp)_
- web: উৎসব বা ছুটির দিন যোগ করুন। গ্রাহকরা অর্ডার করার আগেই তা দেখতে পাবেন।

### `err.notFound`
- en:  That is not available any more.
- app: এটি আর নেই।  _(i18n:err.notFound)_
- web: এটি আর পাওয়া যাচ্ছে না।

### `oedit.historyTitle`
- en:  What was taken off
- app: কী কী বাদ গেছে  _(i18n:oedit.historyTitle)_
- web: কী কী বাদ দেওয়া হয়েছিল

### `oedit.startBtn`
- en:  Reduce this order
- app: অর্ডার কমান  _(i18n:oedit.startBtn)_
- web: এই অর্ডার থেকে জিনিস কমান

### `open.title`
- en:  Shop availability
- app: দোকান খোলা আছে কি না  _(i18n:open.title)_
- web: দোকান খোলা/বন্ধের অবস্থা

### `set.discovery`
- en:  Discovery (list your shop)
- app: খোঁজ (আপনার দোকান তালিকায় দিন)  _(i18n:set.discovery)_
- web: ডিসকভারি (আপনার দোকান তালিকাভুক্ত করুন)

### `c.noProductsFound`
- en:  No products found. Try another word.
- app: কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে দেখুন।  _(i18n:psearch.none)_
- web: কোনো জিনিস পাওয়া যায়নি। অন্য নামে খুঁজুন।

### `oalert.setHelp`
- en:  A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert.
- app: নতুন অর্ডার আপনাকে বারবার জানাতে থাকবে — এখানে আর হোয়াটসঅ্যাপে — যতক্ষণ না আপনি সেটা নেন বা ফিরিয়ে দেন। “এখন নয়” শুধু একটা অর্ডারকে কয়েক মিনিটের জন্য চুপ করায়; অ্যালার্ট বন্ধ হয় না।  _(i18n:oalert.setHelp)_
- web: যতক্ষণ না আপনি এটি মেনে নিচ্ছেন বা বাতিল করছেন, ততক্ষণ নতুন অর্ডারের অ্যালার্ট (এখানে এবং WhatsApp-এ) বাজতে থাকবে। "এখন না" চাপলে কেবল কয়েক মিনিটের জন্য অ্যালার্ট থামে; স্থায়ীভাবে বন্ধ হয় না।

### `c.notePlaceholderArrival`
- en:  e.g. call on arrival
- app: যেমন পৌঁছে কল করুন  _(i18n:cart.notePlaceholder)_
- web: যেমন পৌঁছে ফোন করবেন

### `c.placeOrder`
- en:  Place order
- app: অর্ডার করুন  _(i18n:cart.placeOrder)_
- web: অর্ডার দিন

### `c.yourCart`
- en:  Your cart
- app: আপনার ঝুড়ি  _(i18n:cart.title)_
- web: আপনার কার্ট

### `chelp.e6.q`
- en:  How does my khata (udhaar) work?
- app: আমার খাতা (ধার) কীভাবে চলে?  _(i18n:chelp.e6.q)_
- web: আমার খাতা (উধার) কীভাবে কাজ করে?

### `coedit.title`
- en:  The shop adjusted your order
- app: দোকান আপনার অর্ডার কমিয়েছে  _(i18n:coedit.title)_
- web: দোকানদার অর্ডারে পরিবর্তন করেছেন

### `common.cancel`
- en:  Cancel
- app: বাতিল করুন  _(i18n:common.cancel)_
- web: বাতিল

### `dash.network.age0`
- en:  0–30 days
- app: 0–30 দিন  _(i18n:ins.age_0_30)_
- web: ০–৩০ দিন

### `dash.network.age30`
- en:  31–60 days
- app: 31–60 দিন  _(i18n:ins.age_31_60)_
- web: ৩১–৬০ দিন

### `dash.orderStatus.out_for_delivery`
- en:  Out for delivery
- app: ডেলিভারিতে রওনা  _(i18n:ostatus.out_for_delivery)_
- web: ডেলিভারিতে বেরিয়েছে

### `dist.activeOff`
- en:  Hidden
- app: লুকানো  _(i18n:cat.hidden)_
- web: লুকানো আছে

### `dist.cancelConfirm`
- en:  Cancel this order?
- app: এই অর্ডার বাতিল করবেন?  _(i18n:orderdetail.cancelConfirm)_
- web: এই অর্ডারটি কি বাতিল করতে চান?

### `dist.phone`
- en:  Phone
- app: ফোন  _(i18n:account.phone)_
- web: ফোন নম্বর

### `dlv.title`
- en:  Delivery Champions
- app: ডেলিভারি চ্যাম্পিয়ন  _(i18n:more.delivery)_
- web: ডেলিভারি বয়

### `err.conflict`
- en:  That could not be done just now. Please try again.
- app: এটি এখন করা গেল না। আবার চেষ্টা করুন।  _(i18n:err.conflict)_
- web: কাজটি এখন করা সম্ভব হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।

### `eta.accept`
- en:  Accept
- app: নিন  _(i18n:oalert.accept)_
- web: মেনে নিন

### `eta.chipMin`
- en:  ~{n} min
- app: ~{n} মিনিট  _(i18n:eta.chipMin)_
- web: ~{n} মি.

### `eta.notNow`
- en:  Not now
- app: এখন নয়  _(i18n:eta.notNow)_
- web: এখন না

### `eta.promisedBy`
- en:  You promised ready by {time}
- app: আপনি {time}-এর মধ্যে তৈরি বলেছেন  _(i18n:eta.promisedBy)_
- web: {time}-এর মধ্যে তৈরি রাখার কথা দিয়েছেন

### `fam.combinedOutstanding`
- en:  Combined outstanding
- app: মিলিত বাকি  _(i18n:famd.combinedOutstanding)_
- web: মোট বাকি

### `ins.age_0_30`
- en:  0–30 days
- app: 0–30 দিন  _(i18n:ins.age_0_30)_
- web: ০–৩০ দিন

### `ins.age_31_60`
- en:  31–60 days
- app: 31–60 দিন  _(i18n:ins.age_31_60)_
- web: ৩১–৬০ দিন

### `ins.age_61_90`
- en:  61–90 days
- app: 61–90 দিন  _(i18n:ins.age_61_90)_
- web: ৬১–৯০ দিন

### `ins.age_90_plus`
- en:  90+ days
- app: 90+ দিন  _(i18n:ins.age_90_plus)_
- web: ৯০+ দিন

### `num.cancel`
- en:  Cancel
- app: বাতিল করুন  _(i18n:common.cancel)_
- web: বাতিল

### `num.changing`
- en:  Changing…
- app: বদলানো হচ্ছে…  _(i18n:num.changing)_
- web: বদল হচ্ছে…

### `num.current`
- en:  Current number
- app: এখনকার নম্বর  _(i18n:num.current)_
- web: বর্তমান নম্বর

### `oalert.accept`
- en:  Accept
- app: নিন  _(i18n:oalert.accept)_
- web: মেনে নিন

### `oalert.title`
- en:  New order waiting
- app: নতুন অর্ডার অপেক্ষা করছে  _(i18n:oalert.title)_
- web: নতুন অর্ডার এসেছে

### `oedit.cancelInstead`
- en:  You have taken off everything. Cancel the order instead.
- app: আপনি সব বাদ দিয়ে দিয়েছেন। তার বদলে অর্ডারটাই বাতিল করুন।  _(i18n:oedit.cancelInstead)_
- web: সব জিনিসই বাদ দিয়ে দিয়েছেন। বরং অর্ডারটি বাতিল করে দিন।

### `oedit.title`
- en:  Reduce this order
- app: অর্ডার কমান  _(i18n:oedit.startBtn)_
- web: অর্ডার থেকে জিনিস কমান

### `open.takingOrders`
- en:  You are taking orders right now.
- app: আপনি এখন অর্ডার নিচ্ছেন।  _(i18n:open.takingOrders)_
- web: এখন অর্ডার নেওয়া হচ্ছে।

### `orej.done`
- en:  Order rejected.
- app: অর্ডার ফিরিয়ে দেওয়া হয়েছে।  _(i18n:orej.done)_
- web: অর্ডার বাতিল করা হয়েছে।

### `orej.r1`
- en:  Out of stock
- app: জিনিস শেষ  _(i18n:orej.r1)_
- web: স্টক শেষ

### `orej.title`
- en:  Reject this order?
- app: এই অর্ডার ফিরিয়ে দেবেন?  _(i18n:orej.title)_
- web: এই অর্ডারটি বাতিল করবেন?

### `ostatus.out_for_delivery`
- en:  Out for delivery
- app: ডেলিভারিতে রওনা  _(i18n:ostatus.out_for_delivery)_
- web: ডেলিভারিতে বেরিয়েছে

### `set.customerNotifications`
- en:  Customer notifications
- app: গ্রাহকের নোটিফিকেশন  _(i18n:set.customerNotifications)_
- web: গ্রাহক নোটিফিকেশন

### `set.keySecretSet`
- en:  Key secret set
- app: Key secret দেওয়া আছে  _(i18n:set.keySecretSet)_
- web: কী সিক্রেট দেওয়া আছে

### `set.webhookSecretSet`
- en:  Webhook secret set
- app: Webhook secret দেওয়া আছে  _(i18n:set.webhookSecretSet)_
- web: ওয়েবহুক সিক্রেট দেওয়া আছে

### `stmt.title`
- en:  Account statement
- app: খাতার বিবরণ  _(i18n:stmt.title)_
- web: অ্যাকাউন্ট বিবরণী

### `sup.noEntries`
- en:  No entries yet.
- app: এখনো কোনো এন্ট্রি নেই।  _(i18n:shopkhata.noEntries)_
- web: এখনও কোনো লেনদেন নেই।

### `err.server`
- en:  Something went wrong at our end. Please try again in a moment.
- app: আমাদের দিকে কিছু গোলমাল হয়েছে। একটু পরে আবার চেষ্টা করুন।  _(i18n:err.server)_
- web: আমাদের সার্ভারে সমস্যা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।

### `err.generic`
- en:  Something went wrong. Please try again.
- app: কিছু গোলমাল হয়েছে। আবার চেষ্টা করুন।  _(i18n:err.generic)_
- web: কিছু একটা ভুল হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।

### `err.offline`
- en:  No internet right now. Check your connection and try again.
- app: এখন ইন্টারনেট নেই। কানেকশন দেখে আবার চেষ্টা করুন।  _(i18n:err.offline)_
- web: ইন্টারনেট নেই। আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।

### `err.slow`
- en:  The network is too slow to finish that. Please try again.
- app: নেটওয়ার্ক খুব ধীর, কাজ শেষ হয়নি। আবার চেষ্টা করুন।  _(i18n:err.slow)_
- web: নেটওয়ার্ক খুব ধীরগতির। অনুগ্রহ করে আবার চেষ্টা করুন।

### `oalert.stillWaiting`
- en:  Still waiting — you have not answered this one yet.
- app: এখনো অপেক্ষা করছে — আপনি এটার উত্তর দেননি।  _(i18n:oalert.stillWaiting)_
- web: অপেক্ষায় আছে — আপনি এখনও এই অর্ডারের উত্তর দেননি।

### `chelp.e3.a`
- en:  Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it.
- app: দোকান খুলুন, দরকারি জিনিস কার্টে দিন, নিজে নিয়ে যাওয়া না ডেলিভারি বেছে নিন, আর অর্ডার করুন চাপুন। দোকান আপনার অর্ডার পায় আর নিশ্চিত করে।  _(i18n:chelp.e3.a)_
- web: একটা দোকান খুলুন, যা যা চান কার্টে দিন, পিকআপ বা ডেলিভারি বেছে নিন, আর অর্ডার করুন চাপুন। দোকান আপনার অর্ডার পেয়ে সেটা নিশ্চিত করে দেয়।

### `coedit.removed`
- en:  {item} — removed
- app: {item} — সরানো হয়েছে  _(i18n:coedit.removed)_
- web: {item} — বাদ দেওয়া হয়েছে

### `dist.terminal`
- en:  This order is {s} — no further changes.
- app: এই অর্ডার {s} — আর কোনো বদল হবে না।  _(i18n:ord.terminal)_
- web: এই অর্ডারটি {s} — এতে আর পরিবর্তন করা যাবে না।

### `oalert.setMuteNow`
- en:  Mute for 30 minutes
- app: 30 মিনিট চুপ করুন  _(i18n:oalert.mute30)_
- web: 30 মিনিটের জন্য মিউট করুন

### `oalert.snoozedFor`
- en:  Quiet for {mins} more min
- app: আরও {mins} মিনিট চুপ  _(i18n:oalert.snoozedFor)_
- web: আরও {mins} মিনিট শান্ত থাকবে

### `oedit.historyRemoved`
- en:  {item} — removed
- app: {item} — সরানো হয়েছে  _(i18n:coedit.removed)_
- web: {item} — বাদ দেওয়া হয়েছে

### `ref.activatedOf`
- en:  {a} of {n} activated
- app: {n} জনের মধ্যে {a} সক্রিয়  _(i18n:ref.activatedOf)_
- web: {n}টির মধ্যে {a}টি চালু হয়েছে

### `eta.needMoreHelp`
- en:  Pick a new time — the customer is told straight away.
- app: নতুন সময় বেছে নিন — গ্রাহককে সঙ্গে সঙ্গে জানানো হবে।  _(i18n:eta.needMoreHelp)_
- web: নতুন সময় বেছে নিন — গ্রাহককে সাথে সাথেই জানিয়ে দেওয়া হবে।

### `acc.phoneReadonly`
- en:  Phone is your login ID and cannot be changed here.
- app: ফোনই আপনার লগইন আইডি, এখানে বদলানো যায় না।  _(i18n:account.phoneReadonly)_
- web: ফোন নম্বরই আপনার লগইন আইডি, এখানে বদলানো যাবে না।

### `c.cartEmpty`
- en:  Your cart is empty.
- app: আপনার ঝুড়ি খালি।  _(i18n:cart.empty)_
- web: আপনার কার্ট খালি।

### `c.catDalPulses`
- en:  Dal & Pulses
- app: ডাল ও কড়াই  _(i18n:cat.dalPulses)_
- web: ডাল ও কলাই

### `c.codePlaceholder`
- en:  6-digit code
- app: 6 সংখ্যার কোড  _(i18n:login.codePlaceholder)_
- web: ৬-সংখ্যার কোড

### `c.loadingCatalog`
- en:  Loading catalog…
- app: তালিকা লোড হচ্ছে…  _(i18n:shopdetail.loading)_
- web: ক্যাটালগ লোড হচ্ছে…

### `c.voiceIn`
- en:  Listens in {language}
- app: {language} ভাষায় শোনে  _(i18n:psearch.voiceIn)_
- web: {language} ভাষায় শুনছে

### `cat.addProduct`
- en:  Add product
- app: জিনিস যোগ করুন  _(i18n:cat.addProduct)_
- web: পণ্য যোগ করুন

### `coedit.nowTotal`
- en:  Your order now comes to {now}.
- app: আপনার অর্ডারের মোট এখন {now}।  _(i18n:coedit.nowTotal)_
- web: আপনার অর্ডারের নতুন মোট দাম {now}।

### `dlv.adding`
- en:  Adding…
- app: যোগ হচ্ছে…  _(i18n:cat.adding)_
- web: যোগ করা হচ্ছে…

### `eta.pickTime`
- en:  Ready in about…
- app: কতক্ষণে তৈরি হবে…  _(i18n:eta.pickTime)_
- web: আনুমানিক তৈরি হবে…

### `eta.sent`
- en:  The customer has been told the new time.
- app: গ্রাহককে নতুন সময় জানানো হয়েছে।  _(i18n:eta.sent)_
- web: গ্রাহককে নতুন সময় জানিয়ে দেওয়া হয়েছে।

### `log.signIn`
- en:  Sign in
- app: সাইন ইন করুন  _(i18n:login.title)_
- web: সাইন ইন

### `num.confirm`
- en:  Confirm change
- app: পরিবর্তন নিশ্চিত করুন  _(i18n:num.confirm)_
- web: বদল নিশ্চিত করুন

### `oedit.restore`
- en:  Put back
- app: ফিরিয়ে আনুন  _(i18n:oedit.restore)_
- web: আবার ফিরিয়ে আনুন

### `oedit.start`
- en:  Not everything in stock?
- app: সব জিনিস নেই?  _(i18n:oedit.start)_
- web: সব স্টক নেই?

### `oedit.was`
- en:  Was {was}
- app: আগে {was}  _(i18n:oedit.was)_
- web: আগে ছিল {was}

### `open.statePaused`
- en:  Paused — back {when}
- app: কিছুক্ষণ বন্ধ — {when} খুলবে  _(i18n:open.statePaused)_
- web: সাময়িক বন্ধ — {when} আবার খুলবে

### `ord.empty`
- en:  No orders in this view yet.
- app: এখানে এখনো কোনো অর্ডার নেই।  _(i18n:ord.empty)_
- web: এই ভিউতে এখনো কোনো অর্ডার নেই।

### `orej.r2`
- en:  Too busy right now
- app: এখন খুব চাপ  _(i18n:orej.r2)_
- web: এখন খুব ব্যস্ত

### `set.areaLocality`
- en:  Area / locality
- app: এলাকা / পাড়া  _(i18n:set.areaLocality)_
- web: এলাকা / মহল্লা

### `stmt.allShops`
- en:  All shops (combined)
- app: সব দোকান (একসঙ্গে)  _(i18n:stmt.allShops)_
- web: সব দোকান (একসাথে)

### `stmt.noData`
- en:  No entries in this date range.
- app: এই সময়ে কোনো এন্ট্রি নেই।  _(i18n:stmt.noData)_
- web: এই তারিখের মধ্যে কোনো এন্ট্রি নেই।

### `stmt.pickShop`
- en:  Choose a shop
- app: দোকান বাছুন  _(i18n:stmt.pickShop)_
- web: একটি দোকান বাছুন

### `stmt.rangeError`
- en:  The From date must be on or before the To date.
- app: "থেকে" তারিখ "পর্যন্ত" তারিখের আগে বা একই হতে হবে।  _(i18n:stmt.rangeError)_
- web: শুরুর তারিখ শেষের তারিখের সমান বা আগে হতে হবে।

### `open.cartBlocked`
- en:  This shop is closed right now, so the order cannot be placed. Your cart is saved.
- app: এই দোকান এখন বন্ধ, তাই অর্ডার করা যাবে না। আপনার কার্ট রাখা আছে।  _(i18n:open.cartBlocked)_
- web: দোকান বন্ধ থাকায় এখন অর্ডার করা যাবে না। কার্ট সেভ রাখা আছে।

### `chelp.e7.a`
- en:  Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step.
- app: অর্ডার ট্যাব খুলুন আর দেখুন প্রতিটি অর্ডার অপেক্ষমাণ থেকে গৃহীত, তারপর তৈরি বা সম্পূর্ণ হচ্ছে। প্রতি ধাপে আপনি আপডেট পান।  _(i18n:chelp.e7.a)_
- web: অর্ডার ট্যাব খুলুন, প্রতিটি অর্ডার পেন্ডিং থেকে অনুমোদিত, তারপর তৈরি বা সম্পন্ন হতে দেখুন। প্রতিটি ধাপে আপনি আপডেট পান।

### `c.noShops`
- en:  No shops found. Try a different search.
- app: কোনো দোকান পাওয়া যায়নি। অন্য খোঁজ করুন।  _(i18n:shops.none)_
- web: কোনো দোকান পাওয়া যায়নি। অন্যভাবে খুঁজুন।

### `open.stateClosed`
- en:  Closed — you switched the shop off
- app: বন্ধ — আপনি দোকান বন্ধ করে রেখেছেন  _(i18n:open.stateClosed)_
- web: বন্ধ — আপনি দোকান অফ রেখেছেন

### `err.signedOut`
- en:  You have been signed out. Please sign in again.
- app: আপনি লগ আউট হয়ে গেছেন। আবার সাইন ইন করুন।  _(i18n:err.signedOut)_
- web: আপনি সাইন আউট হয়ে গেছেন। অনুগ্রহ করে আবার সাইন ইন করুন।

### `err.tooMany`
- en:  Too many tries. Please wait a minute and try again.
- app: অনেক বার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।  _(i18n:err.tooMany)_
- web: অনেকবার চেষ্টা করা হয়েছে। এক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।

### `num.changed`
- en:  Number changed. Your khata across all shops now uses the new number.
- app: নম্বর বদলে গেছে। সব দোকানে আপনার খাতা এখন নতুন নম্বরে।  _(i18n:num.changed)_
- web: নম্বর বদলেছে। সব দোকানে আপনার খাতা এখন নতুন নম্বর ব্যবহার করছে।

### `cat.addFromCatalogue`
- en:  Add from catalogue
- app: তালিকা থেকে যোগ করুন  _(i18n:cat.addFromCatalogue)_
- web: ক্যাটালগ থেকে যোগ করুন

### `cat.empty`
- en:  No products yet. Add your first above.
- app: এখনো কোনো জিনিস নেই। উপরে প্রথমটা যোগ করুন।  _(i18n:cat.empty)_
- web: এখনো কোনো পণ্য নেই। উপরে প্রথমটি যোগ করুন।

### `eta.chipHourMin`
- en:  ~{h} hr {m} min
- app: ~{h} ঘণ্টা {m} মিনিট  _(i18n:eta.chipHourMin)_
- web: ~{h} ঘণ্টা {m} মি.

### `eta.readyBy`
- en:  Ready by {time}
- app: {time}-এর মধ্যে তৈরি  _(i18n:eta.readyBy)_
- web: {time}-এর মধ্যে তৈরি হবে

### `oedit.confirm`
- en:  Confirm the new order
- app: নতুন অর্ডার নিশ্চিত করুন  _(i18n:oedit.confirm)_
- web: নতুন অর্ডারটি কনফার্ম করুন

### `oedit.keep`
- en:  Leave it as it was
- app: যেমন ছিল তেমনই থাক  _(i18n:oedit.keep)_
- web: যেমন ছিল তেমনই রাখুন

### `orej.placeholder`
- en:  Another reason (optional)
- app: অন্য কারণ (ঐচ্ছিক)  _(i18n:orej.placeholder)_
- web: অন্য কোনো কারণ (ঐচ্ছিক)

### `ref.title`
- en:  Invite & earn
- app: আমন্ত্রণ করুন, আয় করুন  _(i18n:ref.title)_
- web: আমন্ত্রণ করে আয় করুন

### `set.leaveBlank`
- en:  Leave blank to keep current
- app: আগেরটা রাখতে খালি রাখুন  _(i18n:set.leaveBlank)_
- web: বর্তমানটি রাখতে খালি রাখুন

### `oalert.snooze`
- en:  Not now — {mins} min
- app: এখন নয় — {mins} মিনিট  _(i18n:oalert.snooze)_
- web: এখন না — {mins} মিনিট

### `oalert.waiting`
- en:  waiting {mins} min
- app: {mins} মিনিট ধরে অপেক্ষা  _(i18n:oalert.waiting)_
- web: {mins} মিনিট ধরে অপেক্ষা করছে

### `open.bannerTitle`
- en:  This shop is closed right now
- app: এই দোকান এখন বন্ধ  _(i18n:open.bannerTitle)_
- web: এই দোকানটি এখন বন্ধ আছে

### `ostatus.hint.ready_pickup`
- en:  Ready for pickup
- app: নিয়ে যাওয়ার জন্য তৈরি  _(i18n:ostatus.hint.ready_pickup)_
- web: নিজে নিয়ে যাওয়ার জন্য তৈরি

### `eta.takingLongerHelp`
- en:  It was expected by {time}. It should not be much longer.
- app: {time}-এর মধ্যে হওয়ার কথা ছিল। আর বেশি দেরি হবে না।  _(i18n:eta.takingLongerHelp)_
- web: {time}-এর মধ্যে হওয়ার কথা ছিল। আশা করি আর বেশি দেরি হবে না।

### `oedit.wasNow`
- en:  Was {was} — now {now}
- app: আগে {was} — এখন {now}  _(i18n:oedit.wasNow)_
- web: আগে ছিল {was} — এখন {now}

### `open.notTakingOrders`
- en:  Customers cannot order right now.
- app: গ্রাহকরা এখন অর্ডার করতে পারবেন না।  _(i18n:open.notTakingOrders)_
- web: গ্রাহকরা এখন অর্ডার দিতে পারবেন না।

### `ref.referredCount`
- en:  You have referred {n} so far.
- app: এখন পর্যন্ত আপনি {n} জনকে রেফার করেছেন।  _(i18n:ref.referredCount)_
- web: আপনি এ পর্যন্ত {n} জনকে রেফার করেছেন।

### `open.alwaysOpen`
- en:  No daily hours set — open all day.
- app: রোজকার সময় দেওয়া নেই — সারা দিন খোলা।  _(i18n:open.alwaysOpen)_
- web: দৈনিক সময়সীমা দেওয়া নেই — সারাদিন খোলা।

### `ref.subtitle`
- en:  Share your code. When someone joins with it, they appear here.
- app: আপনার কোড শেয়ার করুন। কেউ সেটি দিয়ে যোগ দিলে এখানে দেখা যাবে।  _(i18n:ref.subtitle)_
- web: আপনার কোড শেয়ার করুন। কেউ তা দিয়ে যোগ দিলে এখানে দেখা যাবে।

### `chelp.e2.a`
- en:  Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name.
- app: উপরের সার্চ বার ব্যবহার করুন, বা বিভাগগুলো দেখুন। বলে খুঁজতে 🎤 মাইক চাপুন আর জিনিসের নাম বলুন।  _(i18n:chelp.e2.a)_
- web: উপরের সার্চ বার ব্যবহার করুন, বা ক্যাটাগরিতে দেখুন। বলে খুঁজতে 🎤 মাইক চাপুন আর জিনিসের নাম বলুন।

### `acc.dob`
- en:  Date of birth
- app: জন্ম তারিখ  _(i18n:account.dob)_
- web: জন্মতারিখ

### `c.deliveryAddress`
- en:  Delivery address
- app: ডেলিভারি ঠিকানা  _(i18n:cart.address)_
- web: ডেলিভারির ঠিকানা

### `c.enterCodeSentTo`
- en:  Enter the code sent to {phone}
- app: {phone} এ পাঠানো কোড লিখুন  _(i18n:login.enterCode)_
- web: {phone}-এ পাঠানো কোড লিখুন

### `c.resendCode`
- en:  Resend code
- app: কোড আবার পাঠান  _(i18n:login.resend)_
- web: আবার কোড পাঠান

### `c.searchProductsAll`
- en:  Search products across shops
- app: সব দোকানে জিনিস খুঁজুন  _(i18n:psearch.placeholder)_
- web: সব দোকানের জিনিস খুঁজুন

### `champ.items`
- en:  Items
- app: জিনিস  _(i18n:common.items)_
- web: জিনিসপত্র

### `dist.navHome`
- en:  Orders
- app: অর্ডার  _(i18n:tab.orders)_
- web: অর্ডারসমূহ

### `dist.navShops`
- en:  Shops
- app: দোকান  _(i18n:tab.shops)_
- web: দোকানসমূহ

### `dist.orderBack`
- en:  Orders
- app: অর্ডার  _(i18n:tab.orders)_
- web: অর্ডারসমূহ

### `dist.shopsTitle`
- en:  Shops
- app: দোকান  _(i18n:tab.shops)_
- web: দোকানসমূহ

### `fam.removeConfirm`
- en:  Remove {name} from this family?
- app: {name} কে এই পরিবার থেকে সরাবেন?  _(i18n:famd.removeConfirm)_
- web: {name}-কে এই পরিবার থেকে সরাবেন?

### `nav.settings`
- en:  Settings
- app: সেটিং  _(i18n:title.settings)_
- web: সেটিংস

### `num.enterCode`
- en:  Enter the code sent to {phone}
- app: {phone} এ পাঠানো কোড লিখুন  _(i18n:login.enterCode)_
- web: {phone}-এ পাঠানো কোড লিখুন

### `oalert.items`
- en:  {n} items
- app: {n} জিনিস  _(i18n:shops.itemsCount)_
- web: {n}টি জিনিস

### `oalert.more`
- en:  +{n} more
- app: আরও {n}টি  _(i18n:oalert.more)_
- web: +{n}টি আরও

### `oalert.setTitle`
- en:  Order alerts
- app: অর্ডার অ্যালার্ট  _(i18n:oalert.setTitle)_
- web: অর্ডারের অ্যালার্ট

### `open.hoursTitle`
- en:  Shop hours
- app: দোকানের সময়  _(i18n:open.hoursTitle)_
- web: দোকানের সময়সূচী

### `open.pauseToday`
- en:  Rest of today
- app: আজ বাকি সময়  _(i18n:open.pauseToday)_
- web: আজকের বাকি সময়

### `ref.type.owner`
- en:  Shop owner
- app: দোকান মালিক  _(i18n:ref.type.owner)_
- web: দোকানের মালিক

### `stmt.loadError`
- en:  Could not load the statement.
- app: বিবরণ লোড করা গেল না।  _(i18n:stmt.loadError)_
- web: বিবরণী লোড করা গেল না।

### `type.purchase`
- en:  Purchase
- app: কেনা  _(i18n:txn.purchase)_
- web: কেনাকাটা

