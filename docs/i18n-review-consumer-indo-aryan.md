# Native-speaker review — Hindi, Bengali, Marathi, Gujarati and Urdu (consumer app)

**Every string in this file was written by the build, not by a native speaker.** They are
live in the shopper app now (`mobile-app/src/consumer/i18n.js`), because a Bengali or Gujarati
shopper who picks their own language was reading half the screens in English, and plain but
unreviewed text beats that. Nobody who speaks these languages natively has read a line of it.

**What to do:** find your language below, work down its table, and put a `✓` in the last
column when a line is fine or write what it should say instead. Do not soften anything. The
tables are ordered **worst-first**: money, credit and order strings sit at the top, then the
places the build had to make a choice, then prose, then routine chrome. The first twenty rows
of each table are where the real risk is — that is ten minutes, and it covers the money.

**This file is the source of truth for the review.** Corrections written here get applied back
into the dictionary, and `LANG_CAPS` keeps showing "(beta)" beside Bengali, Marathi and
Gujarati until that happens.

## House rules these translations follow

- Plain spoken register, the way a shopper and a shopkeeper actually talk — not formal or literary.
- Shop loanwords are kept where they are what people say aloud (UPI, order, delivery, balance, online).
- Numerals stay Latin (`30`, `₹1,250.00`), matching every other language in the app.
- `{amount}`, `{shop}`, `{when}`, `{n}`, `{language}` and friends are **placeholders** — real values
  drop in there. They must survive any correction, spelled exactly the same. A dropped one renders
  a broken sentence to a real shopper.
- Where the same English already had a translation elsewhere in this repo — the owner app dictionary
  or the shipped catalogue — that wording was reused **verbatim**, so the shopper and the shopkeeper
  read the same words about the same order. Changing one of those means changing it in both places.

## Coverage

| language | keys before | keys added | keys now | of English |
|---|---|---|---|---|
| Hindi (`hi`) | 310 | 31 | 341 | 343 |
| Bengali (`bn`) | 167 | 174 | 341 | 343 |
| Marathi (`mr`) | 167 | 174 | 341 | 343 |
| Gujarati (`gu`) | 167 | 174 | 341 | 343 |
| Urdu (`ur`) | 229 | 112 | 341 | 343 |

Two English keys are missing from all five on purpose: `upd.runtime` and `upd.channel`. They
label the two build tokens on the app-version card, whose values are English identifiers, so a
transliterated label beside one of them would read as noise. They fall back to English.

One value is byte-identical to its English: `coedit.reduced`, which is `{item} — {before} → {after}`.
It is placeholders and an arrow; there is nothing in it to translate.

## The decisions the build made

These are the places where the English was genuinely ambiguous and a word had to be picked. If
a shopkeeper would say something else, these are the rows worth changing first.

**Credit, two ways.** `coedit.prepaid` says money is being HELD for the shopper; `txn.credit` says money is OWED by them. They deliberately use different words in every language — deposit versus udhaar. If they ever collapse into one word, a shopper reads a refund as a debt.

**Adjusted by shop.** `txn.adjustment` and `stmt.totalAdjusted` share one English string and one translation. The word chosen is a bookkeeping one in all five languages and may be more formal than what a shopkeeper says aloud.

**Pay in advance.** `account.prepay` follows whatever each block already used for `khata.advance`, rather than introducing a new word for the same idea.

**Balance.** `common.balance` reuses each block's existing `khata.balance` wording, since the English is the same word. Urdu is the exception and already shipped two different words for the two keys; that split predates this batch and was left alone rather than silently "fixed".

**Products versus items.** Bengali, Marathi and Gujarati use the formal "products" word on the tab and the in-shop filter, and the everyday goods word inside sentences — copying the split the Hindi and Urdu blocks already shipped. It is consistent with the app, but it is still two words for one thing.

**Manage.** `account.manage` is a card heading over change-number, statement, invite and help. Every language got the formal "management" word, which is stiffer than the rest of the block.

**Shelf chips.** `cat.snacks` and `cat.attaRice` are this app's own phrasing, not catalogue terms, so there was nothing in the repo to copy. Each language got a different guess at the word people use at the counter.

**Gender.** Gujarati uses the word for sex/gender and avoids the one that also reads as caste.

**Version and updates.** The whole `upd.*` card uses the loanword for "version" in every language. `upd.builtOn` ("Age") became "how old", because a bare noun read oddly as a row label.

**Errors.** The `err.*` strings all use plain spoken wording for something going wrong, rather than a formal "an error occurred".

## Hindi (`hi`) — 31 strings

| # | key | English | Hindi | confidence note | ✓ / correction |
|---|---|---|---|---|---|
| | **money and credit** | | | | |
| 1 | `account.prepay` | Pay in advance | अग्रिम जमा करें | Matched to this block's existing khata.advance wording. | |
| 2 | `account.prepaySub` | Pre-load credit & clear dues on the web | वेब पर पैसे पहले से जमा करें और बकाया चुकाएँ | Two money ideas in one line: load money up front, and clear what is owed. Check both survive. | |
| 3 | `stmt.badDate` | Enter both dates as YYYY-MM-DD. | दोनों तारीख़ें YYYY-MM-DD में लिखें। |  | |
| 4 | `stmt.exportOnWeb` | Download CSV or print | CSV डाउनलोड करें या प्रिंट करें |  | |
| 5 | `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | फ़ाइल सेव करने और प्रिंट के लिए वेब ऐप चाहिए। यह उसे साइन इन किए हुए खोल देगा। |  | |
| 6 | `stmt.last30` | Last 30 days | पिछले 30 दिन |  | |
| 7 | `stmt.last90` | Last 90 days | पिछले 90 दिन |  | |
| | **a judgement call** | | | | |
| 8 | `account.manage` | Manage | प्रबंधन | A card heading over: change number, statement, invite, help. The management word chosen is more formal than the rest of this block; a plainer heading may be better. | |
| 9 | `psearch.browse` | Shop by category | श्रेणी से खरीदें | The category word here should match shopdetail.category in the same block. | |
| 10 | `psearch.recent` | Recent searches | हाल की खोज | Searches the shopper typed before, on this phone only. | |
| 11 | `psearch.voiceIn` | Listens in {language} | {language} में सुनता है | {language} drops in a language name written in its own script. Read it with one dropped in. | |
| 12 | `upd.builtOn` | Age | कितना पुराना | A row label for how old the running version is. Rendered as "how old" rather than a bare noun, which read oddly. | |
| 13 | `upd.bundle` | Version | वर्शन | Loanword for "version", used consistently across upd.*. | |
| 14 | `upd.disabled` | Updates are switched off in this build. | इस ऐप में अपडेट बंद हैं। | "Build" has no everyday word, so this says "in this app". | |
| | **sentences, not labels** | | | | |
| 15 | `upd.downloaded` | Running a downloaded update | डाउनलोड किया गया अपडेट चल रहा है |  | |
| 16 | `upd.embedded` | Built-in version — never updated | ऐप के साथ आया वर्शन — कभी अपडेट नहीं हुआ |  | |
| 17 | `upd.failed` | Could not check for updates. Check your internet and try again. | अपडेट नहीं देख पाए। इंटरनेट जाँचकर फिर कोशिश करें। |  | |
| 18 | `upd.reloading` | New version downloaded. Restarting the app… | नया वर्शन डाउनलोड हो गया। ऐप फिर से चालू हो रहा है… |  | |
| 19 | `upd.sub` | Which version of the app is running on this phone. | इस फ़ोन पर ऐप का कौन-सा वर्शन चल रहा है। |  | |
| 20 | `upd.upToDate` | You already have the latest version. | आपके पास पहले से नया वर्शन है। |  | |
| | **routine chrome** | | | | |
| 21 | `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | जन्म तारीख़ YYYY-MM-DD में लिखें। |  | |
| 22 | `psearch.buyAgain` | Buy it again | फिर से खरीदें |  | |
| 23 | `psearch.clearRecent` | Clear | साफ़ करें |  | |
| 24 | `upd.ageDays` | {n} days old | {n} दिन पुराना |  | |
| 25 | `upd.ageHours` | {n} hours old | {n} घंटे पुराना |  | |
| 26 | `upd.ageMinutes` | {n} minutes old | {n} मिनट पुराना |  | |
| 27 | `upd.ageNow` | just now | अभी-अभी |  | |
| 28 | `upd.check` | Check for updates now | अभी अपडेट देखें |  | |
| 29 | `upd.checking` | Checking… | देख रहे हैं… |  | |
| 30 | `upd.title` | App version & updates | ऐप का वर्शन और अपडेट |  | |
| 31 | `upd.unknown` | unknown | पता नहीं |  | |

## Bengali (`bn`) — 174 strings

| # | key | English | Bengali | confidence note | ✓ / correction |
|---|---|---|---|---|---|
| | **money and credit** | | | | |
| 1 | `account.prepay` | Pay in advance | অগ্রিম জমা করুন | Matched to this block's existing khata.advance wording. | |
| 2 | `account.prepaySub` | Pre-load credit & clear dues on the web | ওয়েবে আগে থেকে টাকা জমা করুন আর বাকি মেটান | Two money ideas in one line: load money up front, and clear what is owed. Check both survive. | |
| 3 | `chelp.e5.a` | You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later. | আপনি খাতায় (ধার), অনলাইনে, বা নগদে দিতে পারেন। খাতায় নিলে সেই টাকা ওই দোকানে আপনার চলতি ব্যালেন্সে জমা হয়, পরে মেটাতে পারেন। | The three ways to pay, and what "on khata" costs you later. The highest-traffic explanation in the app. | |
| 4 | `chelp.e6.a` | Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement. | আপনার খাতা প্রতিটি দোকানে আপনার বাকি এক জায়গায় দেখায়। প্রতিটি কেনা আর পরিশোধ লেখা থাকে, তাই আপনার ব্যালেন্স সবসময় জানা থাকে আর বিবরণ দেখতে বা ডাউনলোড করতে পারেন। | What a khata is. If one sentence here is wrong the whole feature is misunderstood. | |
| 5 | `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | জিনিস নেওয়ার সময় {now} দিন — {amount}-এর জিনিস বাদ দেওয়া হয়েছে। | Says pay LESS than before. Check nothing in the sentence can be read as an extra charge. | |
| 6 | `coedit.credit` | {amount} has been taken off your khata at this shop. | এই দোকানে আপনার খাতা থেকে {amount} কমিয়ে দেওয়া হয়েছে। | Money coming OFF what the shopper owes. If this reads as money being added, it is wrong and it is expensive. | |
| 7 | `coedit.nowTotal` | Your order now comes to {now}. | আপনার অর্ডারের মোট এখন {now}। | The new, reduced total. Must not read as an additional amount. | |
| 8 | `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | আপনি আগেই পরিশোধ করেছিলেন। {amount} এই দোকানে আপনার জমা হিসেবে রাখা আছে — এখানে পরের অর্ডারে কমে যাবে। | The word for "credit" here means money the shop is HOLDING for the shopper, not money owed. It is deliberately NOT the txn.credit word (udhaar). Read the two side by side. | |
| 9 | `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only — nothing to translate, so it is kept byte-identical to English on purpose. | |
| 10 | `coedit.title` | The shop adjusted your order | দোকান আপনার অর্ডার কমিয়েছে | The shop cut the order down. Softened to "reduced", which may be too mild or not mild enough. | |
| 11 | `coedit.wasSubtotal` | Original items total {was} | আগের জিনিসের মোট {was} | The ORIGINAL total, shown struck-through beside the new one. Past tense matters. | |
| 12 | `common.balance` | Balance | ব্যালেন্স | Reuses this block's existing khata.balance wording, since the English is the same word. | |
| 13 | `num.changed` | Number changed. Your khata across all shops now uses the new number. | নম্বর বদলে গেছে। সব দোকানে আপনার খাতা এখন নতুন নম্বরে। | Tells the shopper their khata at EVERY shop followed the new number. If that reassurance is not clear, people will think their dues were lost. | |
| 14 | `num.newHint` | We'll send a code to the new number to confirm it's yours. Your khata at every shop moves to it. | নতুন নম্বরটি আপনার কি না নিশ্চিত করতে সেখানে একটি কোড পাঠাব। প্রতিটি দোকানে আপনার খাতা সেই নম্বরে চলে যাবে। | Same promise, before the change. Long; shorten if it does not fit. | |
| 15 | `ref.creditBalance` | Your referral credit | আপনার রেফারেল ক্রেডিট | Referral credit — money off, not udhaar. Loanword kept. | |
| 16 | `stmt.closing` | Closing balance | শেষের ব্যালেন্স | See stmt.opening. | |
| 17 | `stmt.combined` | Combined total | সব মিলিয়ে মোট | The total across all shops, not one shop. | |
| 18 | `stmt.opening` | Opening balance | শুরুর ব্যালেন্স | Opening / closing balance are a matched pair with stmt.closing. Read them together. | |
| 19 | `stmt.rangeError` | The From date must be on or before the To date. | "থেকে" তারিখ "পর্যন্ত" তারিখের আগে বা একই হতে হবে। | Quotes the From and To labels. Those two quoted words must match stmt.from and stmt.to exactly, or the sentence stops making sense. | |
| 20 | `stmt.title` | Account statement | খাতার বিবরণ | Heading of the statement screen. | |
| 21 | `stmt.totalAdjusted` | Adjusted by shop | দোকানের সমন্বয় | Same English, same word as txn.adjustment. Change both together or the ledger and the statement disagree. | |
| 22 | `txn.adjustment` | Adjusted by shop | দোকানের সমন্বয় | Bookkeeping word. Ask a shopkeeper what he SAYS when he knocks an item off a bill — this may be too written. | |
| 23 | `chelp.e5.q` | How do I pay for an order? | অর্ডারের টাকা কীভাবে দেব? |  | |
| 24 | `chelp.e6.q` | How does my khata (udhaar) work? | আমার খাতা (ধার) কীভাবে চলে? |  | |
| 25 | `coedit.intro` | {shop} could not supply everything you ordered. | {shop}-এ আপনার অর্ডারের সব জিনিস ছিল না। |  | |
| 26 | `coedit.removed` | {item} — removed | {item} — সরানো হয়েছে |  | |
| 27 | `stmt.allShops` | All shops (combined) | সব দোকান (একসঙ্গে) |  | |
| 28 | `stmt.badDate` | Enter both dates as YYYY-MM-DD. | দুটো তারিখই YYYY-MM-DD এভাবে লিখুন। |  | |
| 29 | `stmt.exportOnWeb` | Download CSV or print | CSV ডাউনলোড করুন বা প্রিন্ট করুন |  | |
| 30 | `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | ফাইল সেভ করা আর প্রিন্টের জন্য ওয়েব অ্যাপ লাগে। এটি সাইন ইন করা অবস্থাতেই সেটি খুলে দেবে। |  | |
| 31 | `stmt.from` | From | থেকে |  | |
| 32 | `stmt.last30` | Last 30 days | গত 30 দিন |  | |
| 33 | `stmt.last90` | Last 90 days | গত 90 দিন |  | |
| 34 | `stmt.loadError` | Could not load the statement. | বিবরণ লোড করা গেল না। |  | |
| 35 | `stmt.noData` | No entries in this date range. | এই সময়ে কোনো এন্ট্রি নেই। |  | |
| 36 | `stmt.pickShop` | Choose a shop | দোকান বাছুন |  | |
| 37 | `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | শুরুর ব্যালেন্স, সময়ের তারিখ অনুযায়ী এন্ট্রি, আর শেষের ব্যালেন্স। |  | |
| 38 | `stmt.to` | To | পর্যন্ত |  | |
| 39 | `stmt.totalPaid` | Total paid | মোট পরিশোধ |  | |
| 40 | `stmt.totalPurchases` | Total purchases | মোট কেনা |  | |
| 41 | `stmt.view` | View | দেখুন |  | |
| 42 | `txn.upi` | UPI paid | UPI পরিশোধ |  | |
| | **orders and shop hours** | | | | |
| 43 | `eta.noPromise` | No ready time promised | তৈরির সময় বলা হয়নি | Means the shop never gave a time, not that it missed one. | |
| 44 | `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}-এর মধ্যে হওয়ার কথা ছিল। আর বেশি দেরি হবে না। | Apology, not an alarm. | |
| 45 | `open.browseOnly` | You can look around — ordering opens again when the shop does. | আপনি দেখে নিতে পারেন — দোকান খুললেই আবার অর্ডার করা যাবে। | Reassurance, not a refusal. Check the tone. | |
| 46 | `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | এই দোকান এখন বন্ধ, তাই অর্ডার করা যাবে না। আপনার কার্ট রাখা আছে। | Two things at once: the order cannot go through, and the cart is not lost. Both must land. | |
| 47 | `open.open` | Open | খোলা | The shop IS open — an adjective, not the button "open it". The owner app has an unrelated button with the same English; its wording was deliberately not reused here. | |
| 48 | `ostatus.hint.pending` | Waiting for the shop to accept | দোকানের অনুমোদনের অপেক্ষায় | Sits under the status badge. Where the badge word already existed in this block, the hint reuses it. | |
| 49 | `ostatus.hint.ready_delivery` | Ready — awaiting dispatch | তৈরি — পাঠানোর অপেক্ষায় | "Awaiting dispatch" has no everyday equivalent; rendered as waiting to be sent. | |
| 50 | `cart.restoring` | Getting your cart… | আপনার কার্ট আনা হচ্ছে… |  | |
| 51 | `cart.switchShopClear` | Clear and start here | মুছে এখানে শুরু করুন |  | |
| 52 | `cart.switchShopTitle` | Cart at another shop | অন্য দোকানের কার্ট |  | |
| 53 | `chelp.e3.a` | Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it. | দোকান খুলুন, দরকারি জিনিস কার্টে দিন, নিজে নিয়ে যাওয়া না ডেলিভারি বেছে নিন, আর অর্ডার করুন চাপুন। দোকান আপনার অর্ডার পায় আর নিশ্চিত করে। |  | |
| 54 | `chelp.e3.q` | How do I place an order? | অর্ডার কীভাবে করব? |  | |
| 55 | `chelp.e4.a` | Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount. | নিজে নিয়ে যাওয়া মানে আপনি অর্ডার নিজে দোকান থেকে নিয়ে আসেন, ফ্রি। ডেলিভারি মানে দোকান আপনার কাছে পৌঁছে দেয়, কখনো সামান্য চার্জে — অনেক দোকান ঠিক করা টাকার উপরে ফ্রি ডেলিভারি দেয়। |  | |
| 56 | `chelp.e4.q` | What is the difference between pickup and delivery? | নিজে নিয়ে যাওয়া আর ডেলিভারির মধ্যে ফারাক কী? |  | |
| 57 | `chelp.e7.a` | Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step. | অর্ডার ট্যাব খুলুন আর দেখুন প্রতিটি অর্ডার অপেক্ষমাণ থেকে গৃহীত, তারপর তৈরি বা সম্পূর্ণ হচ্ছে। প্রতি ধাপে আপনি আপডেট পান। |  | |
| 58 | `chelp.e7.q` | How do I track my order? | আমার অর্ডার কীভাবে ট্র্যাক করব? |  | |
| 59 | `eta.readyBy` | Ready by {time} | {time}-এর মধ্যে তৈরি |  | |
| 60 | `eta.takingLonger` | Taking a little longer | একটু বেশি সময় লাগছে |  | |
| 61 | `open.bannerTitle` | This shop is closed right now | এই দোকান এখন বন্ধ |  | |
| 62 | `open.cannotOrder` | Closed — cannot order | বন্ধ — অর্ডার করা যাবে না |  | |
| 63 | `open.closed` | Closed | বন্ধ |  | |
| 64 | `open.closedPill` | Closed | বন্ধ |  | |
| 65 | `open.stateClosed` | Closed — the shop is switched off right now | বন্ধ — দোকান এখন বন্ধ করে রাখা আছে |  | |
| 66 | `open.stateHoliday` | Closed today — reopens {when} | আজ বন্ধ — {when} আবার খুলবে |  | |
| 67 | `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | আজ বন্ধ ({reason}) — {when} আবার খুলবে |  | |
| 68 | `open.stateHours` | Closed — opens {when} | বন্ধ — {when} খুলবে |  | |
| 69 | `open.statePaused` | Paused — back {when} | কিছুক্ষণ বন্ধ — {when} খুলবে |  | |
| 70 | `open.todayAt` | at {time} | {time}-এ |  | |
| 71 | `open.tomorrowAt` | tomorrow at {time} | কাল {time}-এ |  | |
| 72 | `ostatus.hint.accepted` | Accepted — preparing soon | গৃহীত — শিগগিরই তৈরি হবে |  | |
| 73 | `ostatus.hint.cancelled` | Order cancelled | অর্ডার বাতিল |  | |
| 74 | `ostatus.hint.out_for_delivery` | Out for delivery | ডেলিভারিতে রওনা |  | |
| 75 | `ostatus.hint.preparing` | Being prepared | তৈরি হচ্ছে |  | |
| 76 | `ostatus.hint.ready_pickup` | Ready for pickup | নিয়ে যাওয়ার জন্য তৈরি |  | |
| | **a judgement call** | | | | |
| 77 | `account.dataSaverSub` | Skip extra photos on slow networks | ধীর নেটওয়ার্কে বাড়তি ছবি লোড করবে না | Rendered as "will not load extra photos" rather than the imperative "skip". | |
| 78 | `account.gender` | Gender | লিঙ্গ | Gujarati uses the word for sex/gender, deliberately avoiding the one that also reads as caste. | |
| 79 | `account.genderPreferNot` | Prefer not to say | বলতে চাই না | Should read as a choice, not a refusal. | |
| 80 | `account.manage` | Manage | পরিচালনা | A card heading over: change number, statement, invite, help. The management word chosen is more formal than the rest of this block; a plainer heading may be better. | |
| 81 | `cat.attaRice` | Atta & Rice | আটা ও চাল | Shelf chip. Not a catalogue term, so there was nothing in the repo to copy. The flour word may be too general. | |
| 82 | `cat.dairy` | Dairy | দুধ-দই | Shelf chip, rendered as milk-and-curd rather than the English category word. | |
| 83 | `cat.snacks` | Snacks | স্ন্যাকস | Uses the English loan, as the Urdu block already does. A native word may be better. | |
| 84 | `err.generic` | Something went wrong. Please try again. | কিছু গোলমাল হয়েছে। আবার চেষ্টা করুন। | Plain spoken wording chosen over a formal "an error occurred" across all the err.* strings. | |
| 85 | `psearch.browse` | Shop by category | বিভাগ অনুযায়ী কিনুন | The category word here should match shopdetail.category in the same block. | |
| 86 | `psearch.placeholder` | Search products across shops | সব দোকানে জিনিস খুঁজুন | Uses the everyday goods word, not the "products" word. See tab.products. | |
| 87 | `psearch.recent` | Recent searches | সাম্প্রতিক খোঁজ | Searches the shopper typed before, on this phone only. | |
| 88 | `psearch.voiceIn` | Listens in {language} | {language} ভাষায় শোনে | {language} drops in a language name written in its own script. Read it with one dropped in. | |
| 89 | `ref.title` | Invite & earn | আমন্ত্রণ করুন, আয় করুন | Check this does not read as a lottery or a scheme. | |
| 90 | `shopdetail.searchProducts` | Search products | পণ্য খুঁজুন | Same split as tab.products. | |
| 91 | `tab.products` | Products | পণ্য | Tab label. Uses the "products" word rather than the everyday goods word, following what the Hindi and Urdu blocks already ship — but inside sentences the everyday word is used. Tell us if that split reads oddly. | |
| 92 | `upd.builtOn` | Age | কত পুরোনো | A row label for how old the running version is. Rendered as "how old" rather than a bare noun, which read oddly. | |
| 93 | `upd.bundle` | Version | ভার্সন | Loanword for "version", used consistently across upd.*. | |
| 94 | `upd.disabled` | Updates are switched off in this build. | এই অ্যাপে আপডেট বন্ধ আছে। | "Build" has no everyday word, so this says "in this app". | |
| 95 | `voice.search` | Search by voice | বলে খুঁজুন | All the voice.* strings use one phrase for "by voice"; keep them consistent if you change one. | |
| | **sentences, not labels** | | | | |
| 96 | `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ফোনই আপনার লগইন আইডি, এখানে বদলানো যায় না। |  | |
| 97 | `chelp.e2.a` | Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name. | উপরের সার্চ বার ব্যবহার করুন, বা বিভাগগুলো দেখুন। বলে খুঁজতে 🎤 মাইক চাপুন আর জিনিসের নাম বলুন। |  | |
| 98 | `chelp.e2.q` | How do I search for a product? | জিনিস কীভাবে খুঁজব? |  | |
| 99 | `chelp.subtitle` | Short answers for shopping, orders and your khata. | কেনাকাটা, অর্ডার আর আপনার খাতার ছোট উত্তর। |  | |
| 100 | `chelp.title` | Help & FAQ | সাহায্য ও সাধারণ প্রশ্ন |  | |
| 101 | `err.badRequest` | Something in that was not right. Please check and try again. | কিছু একটা ঠিক ছিল না। দেখে নিয়ে আবার চেষ্টা করুন। |  | |
| 102 | `err.conflict` | That could not be done just now. Please try again. | এটি এখন করা গেল না। আবার চেষ্টা করুন। |  | |
| 103 | `err.notAllowed` | You cannot open this. | আপনি এটি খুলতে পারবেন না। |  | |
| 104 | `err.notFound` | That is not available any more. | এটি আর নেই। |  | |
| 105 | `err.offline` | No internet right now. Check your connection and try again. | এখন ইন্টারনেট নেই। কানেকশন দেখে আবার চেষ্টা করুন। |  | |
| 106 | `err.server` | Something went wrong at our end. Please try again in a moment. | আমাদের দিকে কিছু গোলমাল হয়েছে। একটু পরে আবার চেষ্টা করুন। |  | |
| 107 | `err.signedOut` | You have been signed out. Please sign in again. | আপনি লগ আউট হয়ে গেছেন। আবার সাইন ইন করুন। |  | |
| 108 | `err.slow` | The network is too slow to finish that. Please try again. | নেটওয়ার্ক খুব ধীর, কাজ শেষ হয়নি। আবার চেষ্টা করুন। |  | |
| 109 | `err.tooMany` | Too many tries. Please wait a minute and try again. | অনেক বার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন। |  | |
| 110 | `psearch.none` | No products found. Try another word. | কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে দেখুন। |  | |
| 111 | `psearch.start` | Search for a product to see which shops nearby have it. | কোনো জিনিস খুঁজুন আর দেখুন কাছের কোন দোকানে সেটি আছে। |  | |
| 112 | `upd.downloaded` | Running a downloaded update | ডাউনলোড করা আপডেট চলছে |  | |
| 113 | `upd.embedded` | Built-in version — never updated | অ্যাপের সঙ্গে আসা ভার্সন — কখনো আপডেট হয়নি |  | |
| 114 | `upd.failed` | Could not check for updates. Check your internet and try again. | আপডেট দেখা গেল না। ইন্টারনেট দেখে আবার চেষ্টা করুন। |  | |
| 115 | `upd.reloading` | New version downloaded. Restarting the app… | নতুন ভার্সন ডাউনলোড হয়েছে। অ্যাপ আবার চালু হচ্ছে… |  | |
| 116 | `upd.sub` | Which version of the app is running on this phone. | এই ফোনে অ্যাপের কোন ভার্সন চলছে। |  | |
| 117 | `upd.upToDate` | You already have the latest version. | আপনার কাছে আগে থেকেই নতুন ভার্সন আছে। |  | |
| 118 | `voice.hint.network` | Voice search needs the internet. Check your connection. | বলে খুঁজতে ইন্টারনেট লাগে। কানেকশন দেখুন। |  | |
| 119 | `voice.hint.no-match` | Did not catch that. Please try again. | বুঝতে পারিনি। আবার বলুন। |  | |
| 120 | `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | মাইক বন্ধ আছে। বলে খুঁজতে সেটিংসে চালু করুন। |  | |
| 121 | `voice.hint.unavailable` | Voice search is not available right now. | বলে খোঁজা এখন পাওয়া যাচ্ছে না। |  | |
| 122 | `voice.notInLanguage` | Voice search is not available in this language yet. | এই ভাষায় বলে খোঁজা এখনো পাওয়া যায় না। |  | |
| | **routine chrome** | | | | |
| 123 | `account.dob` | Date of birth | জন্ম তারিখ |  | |
| 124 | `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | জন্ম তারিখ YYYY-MM-DD এভাবে লিখুন। |  | |
| 125 | `account.genderFemale` | Female | মহিলা |  | |
| 126 | `account.genderMale` | Male | পুরুষ |  | |
| 127 | `account.genderOther` | Other | অন্য |  | |
| 128 | `account.genderUnset` | Not set | দেওয়া হয়নি |  | |
| 129 | `num.cancel` | Cancel | বাতিল করুন |  | |
| 130 | `num.change` | Change number | নম্বর বদলান |  | |
| 131 | `num.changing` | Changing… | বদলানো হচ্ছে… |  | |
| 132 | `num.confirm` | Confirm change | পরিবর্তন নিশ্চিত করুন |  | |
| 133 | `num.current` | Current number | এখনকার নম্বর |  | |
| 134 | `num.devCode` | Dev code: | ডেভ কোড: |  | |
| 135 | `num.enterCode` | Enter the code sent to {phone} | {phone} এ পাঠানো কোড লিখুন |  | |
| 136 | `num.new` | New mobile number | নতুন মোবাইল নম্বর |  | |
| 137 | `num.sendCode` | Send code | কোড পাঠান |  | |
| 138 | `num.sending` | Sending… | পাঠানো হচ্ছে… |  | |
| 139 | `num.title` | Mobile number | মোবাইল নম্বর |  | |
| 140 | `orders.failedTitle` | Could not load your orders | আপনার অর্ডার লোড হয়নি |  | |
| 141 | `psearch.atShop` | at {shop} | {shop}-এ |  | |
| 142 | `psearch.buyAgain` | Buy it again | আবার কিনুন |  | |
| 143 | `psearch.clearRecent` | Clear | মুছুন |  | |
| 144 | `psearch.failedTitle` | Search did not finish | খোঁজা শেষ হয়নি |  | |
| 145 | `psearch.searching` | Searching… | খোঁজা হচ্ছে… |  | |
| 146 | `psearch.title` | Find an item | জিনিস খুঁজুন |  | |
| 147 | `ref.activatedOf` | {a} of {n} activated | {n} জনের মধ্যে {a} সক্রিয় |  | |
| 148 | `ref.loadError` | Could not load referrals. | রেফারেল লোড করা গেল না। |  | |
| 149 | `ref.noneYet` | No referrals yet — share your code to get started. | এখনো কোনো রেফারেল নেই — শুরু করতে আপনার কোড শেয়ার করুন। |  | |
| 150 | `ref.referredByLabel` | You were invited by | আপনাকে আমন্ত্রণ করেছেন |  | |
| 151 | `ref.referredCount` | You have referred {n} so far. | এখন পর্যন্ত আপনি {n} জনকে রেফার করেছেন। |  | |
| 152 | `ref.shareLink` | Share link | শেয়ার লিংক |  | |
| 153 | `ref.subtitle` | Share your code. When someone joins with it, they appear here. | আপনার কোড শেয়ার করুন। কেউ সেটি দিয়ে যোগ দিলে এখানে দেখা যাবে। |  | |
| 154 | `ref.type.customer` | Customer | গ্রাহক |  | |
| 155 | `ref.type.owner` | Shop owner | দোকান মালিক |  | |
| 156 | `ref.type.shop` | Shop | দোকান |  | |
| 157 | `ref.yourCode` | Your referral code | আপনার রেফারেল কোড |  | |
| 158 | `shopdetail.allCategories` | All categories | সব বিভাগ |  | |
| 159 | `shopdetail.brand` | Brand | ব্র্যান্ড |  | |
| 160 | `shopdetail.category` | Category | বিভাগ |  | |
| 161 | `shopdetail.failedTitle` | Could not load this shop | এই দোকান লোড হয়নি |  | |
| 162 | `shopdetail.noResults` | No matching items. | মিলে যাওয়া কোনো জিনিস নেই। |  | |
| 163 | `shopdetail.size` | Size | সাইজ |  | |
| 164 | `shops.failedTitle` | Could not load shops | দোকান লোড হয়নি |  | |
| 165 | `shops.heroTitle` | What do you need today? | আজ আপনার কী দরকার? |  | |
| 166 | `shops.searching` | Searching… | খোঁজা হচ্ছে… |  | |
| 167 | `upd.ageDays` | {n} days old | {n} দিন পুরোনো |  | |
| 168 | `upd.ageHours` | {n} hours old | {n} ঘণ্টা পুরোনো |  | |
| 169 | `upd.ageMinutes` | {n} minutes old | {n} মিনিট পুরোনো |  | |
| 170 | `upd.ageNow` | just now | এইমাত্র |  | |
| 171 | `upd.check` | Check for updates now | এখনই আপডেট দেখুন |  | |
| 172 | `upd.checking` | Checking… | দেখা হচ্ছে… |  | |
| 173 | `upd.title` | App version & updates | অ্যাপের ভার্সন ও আপডেট |  | |
| 174 | `upd.unknown` | unknown | জানা নেই |  | |

## Marathi (`mr`) — 174 strings

| # | key | English | Marathi | confidence note | ✓ / correction |
|---|---|---|---|---|---|
| | **money and credit** | | | | |
| 1 | `account.prepay` | Pay in advance | आगाऊ भरा | Matched to this block's existing khata.advance wording. | |
| 2 | `account.prepaySub` | Pre-load credit & clear dues on the web | वेबवर आधीच पैसे भरा आणि उधारी मिटवा | Two money ideas in one line: load money up front, and clear what is owed. Check both survive. | |
| 3 | `chelp.e5.a` | You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later. | तुम्ही खात्यावर (उधार), ऑनलाइन, किंवा रोख भरू शकता. खात्यावर घेतले तर ती रक्कम त्या दुकानातल्या तुमच्या चालू शिल्लकीत जमा होते, नंतर फेडता येते. | The three ways to pay, and what "on khata" costs you later. The highest-traffic explanation in the app. | |
| 4 | `chelp.e6.a` | Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement. | तुमचे खाते प्रत्येक दुकानातली तुमची उधारी एका ठिकाणी दाखवते. प्रत्येक खरेदी आणि भरणा नोंदला जातो, त्यामुळे तुमची शिल्लक नेहमी माहीत असते आणि तपशील पाहता किंवा डाउनलोड करता येतो. | What a khata is. If one sentence here is wrong the whole feature is misunderstood. | |
| 5 | `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | वस्तू घेताना {now} द्या — {amount} च्या वस्तू काढल्या आहेत. | Says pay LESS than before. Check nothing in the sentence can be read as an extra charge. | |
| 6 | `coedit.credit` | {amount} has been taken off your khata at this shop. | या दुकानात तुमच्या खात्यातून {amount} कमी केले आहेत. | Money coming OFF what the shopper owes. If this reads as money being added, it is wrong and it is expensive. | |
| 7 | `coedit.nowTotal` | Your order now comes to {now}. | तुमच्या ऑर्डरची एकूण रक्कम आता {now} आहे. | The new, reduced total. Must not read as an additional amount. | |
| 8 | `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | तुम्ही आधीच भरले होते. {amount} या दुकानात तुमच्या जमा म्हणून ठेवले आहेत — इथल्या पुढच्या ऑर्डरमध्ये कमी होतील. | The word for "credit" here means money the shop is HOLDING for the shopper, not money owed. It is deliberately NOT the txn.credit word (udhaar). Read the two side by side. | |
| 9 | `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only — nothing to translate, so it is kept byte-identical to English on purpose. | |
| 10 | `coedit.title` | The shop adjusted your order | दुकानाने तुमचा ऑर्डर कमी केला आहे | The shop cut the order down. Softened to "reduced", which may be too mild or not mild enough. | |
| 11 | `coedit.wasSubtotal` | Original items total {was} | आधीच्या वस्तूंची एकूण {was} | The ORIGINAL total, shown struck-through beside the new one. Past tense matters. | |
| 12 | `common.balance` | Balance | शिल्लक | Reuses this block's existing khata.balance wording, since the English is the same word. | |
| 13 | `num.changed` | Number changed. Your khata across all shops now uses the new number. | नंबर बदलला. सर्व दुकानांतले तुमचे खाते आता नवीन नंबरवर आहे. | Tells the shopper their khata at EVERY shop followed the new number. If that reassurance is not clear, people will think their dues were lost. | |
| 14 | `num.newHint` | We'll send a code to the new number to confirm it's yours. Your khata at every shop moves to it. | नवीन नंबर तुमचाच आहे हे निश्चित करण्यासाठी त्यावर एक कोड पाठवू. प्रत्येक दुकानातले तुमचे खाते त्यावर जाईल. | Same promise, before the change. Long; shorten if it does not fit. | |
| 15 | `ref.creditBalance` | Your referral credit | तुमचे रेफरल क्रेडिट | Referral credit — money off, not udhaar. Loanword kept. | |
| 16 | `stmt.closing` | Closing balance | शेवटची शिल्लक | See stmt.opening. | |
| 17 | `stmt.combined` | Combined total | एकत्रित एकूण | The total across all shops, not one shop. | |
| 18 | `stmt.opening` | Opening balance | सुरुवातीची शिल्लक | Opening / closing balance are a matched pair with stmt.closing. Read them together. | |
| 19 | `stmt.rangeError` | The From date must be on or before the To date. | "पासून" तारीख "पर्यंत" तारखेच्या आधी किंवा तीच असावी. | Quotes the From and To labels. Those two quoted words must match stmt.from and stmt.to exactly, or the sentence stops making sense. | |
| 20 | `stmt.title` | Account statement | खात्याचा तपशील | Heading of the statement screen. | |
| 21 | `stmt.totalAdjusted` | Adjusted by shop | दुकानाकडून समायोजन | Same English, same word as txn.adjustment. Change both together or the ledger and the statement disagree. | |
| 22 | `txn.adjustment` | Adjusted by shop | दुकानाकडून समायोजन | Bookkeeping word. Ask a shopkeeper what he SAYS when he knocks an item off a bill — this may be too written. | |
| 23 | `chelp.e5.q` | How do I pay for an order? | ऑर्डरचे पैसे कसे भरायचे? |  | |
| 24 | `chelp.e6.q` | How does my khata (udhaar) work? | माझे खाते (उधार) कसे चालते? |  | |
| 25 | `coedit.intro` | {shop} could not supply everything you ordered. | {shop} कडे तुमच्या ऑर्डरच्या सगळ्या वस्तू नव्हत्या. |  | |
| 26 | `coedit.removed` | {item} — removed | {item} — काढले |  | |
| 27 | `stmt.allShops` | All shops (combined) | सर्व दुकाने (एकत्र) |  | |
| 28 | `stmt.badDate` | Enter both dates as YYYY-MM-DD. | दोन्ही तारखा YYYY-MM-DD अशा टाका. |  | |
| 29 | `stmt.exportOnWeb` | Download CSV or print | CSV डाउनलोड करा किंवा प्रिंट करा |  | |
| 30 | `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | फाइल सेव्ह करायला आणि प्रिंटसाठी वेब अॅप लागते. हे ते साइन इन केलेले उघडून देईल. |  | |
| 31 | `stmt.from` | From | पासून |  | |
| 32 | `stmt.last30` | Last 30 days | मागील 30 दिवस |  | |
| 33 | `stmt.last90` | Last 90 days | मागील 90 दिवस |  | |
| 34 | `stmt.loadError` | Could not load the statement. | तपशील लोड होऊ शकला नाही. |  | |
| 35 | `stmt.noData` | No entries in this date range. | या कालावधीत कोणतीही नोंद नाही. |  | |
| 36 | `stmt.pickShop` | Choose a shop | दुकान निवडा |  | |
| 37 | `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | सुरुवातीची शिल्लक, कालावधीतील तारखेनुसार नोंदी, आणि शेवटची शिल्लक. |  | |
| 38 | `stmt.to` | To | पर्यंत |  | |
| 39 | `stmt.totalPaid` | Total paid | एकूण भरणा |  | |
| 40 | `stmt.totalPurchases` | Total purchases | एकूण खरेदी |  | |
| 41 | `stmt.view` | View | पाहा |  | |
| 42 | `txn.upi` | UPI paid | UPI भरणा |  | |
| | **orders and shop hours** | | | | |
| 43 | `eta.noPromise` | No ready time promised | तयार होण्याची वेळ सांगितलेली नाही | Means the shop never gave a time, not that it missed one. | |
| 44 | `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} पर्यंत होणार होते. आता फार वेळ लागणार नाही. | Apology, not an alarm. | |
| 45 | `open.browseOnly` | You can look around — ordering opens again when the shop does. | तुम्ही पाहू शकता — दुकान उघडताच पुन्हा ऑर्डर करता येईल. | Reassurance, not a refusal. Check the tone. | |
| 46 | `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | हे दुकान सध्या बंद आहे, त्यामुळे ऑर्डर होणार नाही. तुमची कार्ट जपून ठेवली आहे. | Two things at once: the order cannot go through, and the cart is not lost. Both must land. | |
| 47 | `open.open` | Open | उघडी | The shop IS open — an adjective, not the button "open it". The owner app has an unrelated button with the same English; its wording was deliberately not reused here. | |
| 48 | `ostatus.hint.pending` | Waiting for the shop to accept | दुकानाच्या मंजुरीची वाट पाहत आहे | Sits under the status badge. Where the badge word already existed in this block, the hint reuses it. | |
| 49 | `ostatus.hint.ready_delivery` | Ready — awaiting dispatch | तयार — पाठवण्याच्या प्रतीक्षेत | "Awaiting dispatch" has no everyday equivalent; rendered as waiting to be sent. | |
| 50 | `cart.restoring` | Getting your cart… | तुमची कार्ट आणत आहे… |  | |
| 51 | `cart.switchShopClear` | Clear and start here | साफ करून इथे सुरू करा |  | |
| 52 | `cart.switchShopTitle` | Cart at another shop | दुसऱ्या दुकानाची कार्ट |  | |
| 53 | `chelp.e3.a` | Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it. | दुकान उघडा, हव्या त्या वस्तू कार्टमध्ये टाका, स्वतः घेऊन जाणे की डिलिव्हरी निवडा, आणि ऑर्डर करा दाबा. दुकानाला तुमची ऑर्डर मिळते आणि ते ती निश्चित करतात. |  | |
| 54 | `chelp.e3.q` | How do I place an order? | ऑर्डर कशी करायची? |  | |
| 55 | `chelp.e4.a` | Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount. | स्वतः घेऊन जाणे म्हणजे तुम्ही ऑर्डर स्वतः दुकानातून आणता, मोफत. डिलिव्हरी म्हणजे दुकान तुमच्यापर्यंत पोहोचवते, कधी थोड्या शुल्कासह — बरीच दुकाने ठरलेल्या रकमेच्या वर मोफत डिलिव्हरी देतात. |  | |
| 56 | `chelp.e4.q` | What is the difference between pickup and delivery? | स्वतः घेऊन जाणे आणि डिलिव्हरीत काय फरक आहे? |  | |
| 57 | `chelp.e7.a` | Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step. | ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबित पासून स्वीकारले, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते. |  | |
| 58 | `chelp.e7.q` | How do I track my order? | माझी ऑर्डर कशी ट्रॅक करायची? |  | |
| 59 | `eta.readyBy` | Ready by {time} | {time} पर्यंत तयार |  | |
| 60 | `eta.takingLonger` | Taking a little longer | थोडा जास्त वेळ लागत आहे |  | |
| 61 | `open.bannerTitle` | This shop is closed right now | हे दुकान सध्या बंद आहे |  | |
| 62 | `open.cannotOrder` | Closed — cannot order | बंद — ऑर्डर करता येणार नाही |  | |
| 63 | `open.closed` | Closed | बंद |  | |
| 64 | `open.closedPill` | Closed | बंद |  | |
| 65 | `open.stateClosed` | Closed — the shop is switched off right now | बंद — दुकान सध्या बंद करून ठेवले आहे |  | |
| 66 | `open.stateHoliday` | Closed today — reopens {when} | आज बंद — {when} पुन्हा उघडेल |  | |
| 67 | `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | आज बंद ({reason}) — {when} पुन्हा उघडेल |  | |
| 68 | `open.stateHours` | Closed — opens {when} | बंद — {when} उघडेल |  | |
| 69 | `open.statePaused` | Paused — back {when} | थोडा वेळ बंद — {when} उघडेल |  | |
| 70 | `open.todayAt` | at {time} | {time} वाजता |  | |
| 71 | `open.tomorrowAt` | tomorrow at {time} | उद्या {time} वाजता |  | |
| 72 | `ostatus.hint.accepted` | Accepted — preparing soon | स्वीकारले — लवकरच तयार होईल |  | |
| 73 | `ostatus.hint.cancelled` | Order cancelled | ऑर्डर रद्द |  | |
| 74 | `ostatus.hint.out_for_delivery` | Out for delivery | डिलिव्हरीसाठी निघाले |  | |
| 75 | `ostatus.hint.preparing` | Being prepared | तयार होत आहे |  | |
| 76 | `ostatus.hint.ready_pickup` | Ready for pickup | घेऊन जाण्यासाठी तयार |  | |
| | **a judgement call** | | | | |
| 77 | `account.dataSaverSub` | Skip extra photos on slow networks | हळू नेटवर्कवर जास्तीचे फोटो लोड करणार नाही | Rendered as "will not load extra photos" rather than the imperative "skip". | |
| 78 | `account.gender` | Gender | लिंग | Gujarati uses the word for sex/gender, deliberately avoiding the one that also reads as caste. | |
| 79 | `account.genderPreferNot` | Prefer not to say | सांगायचे नाही | Should read as a choice, not a refusal. | |
| 80 | `account.manage` | Manage | व्यवस्थापन | A card heading over: change number, statement, invite, help. The management word chosen is more formal than the rest of this block; a plainer heading may be better. | |
| 81 | `cat.attaRice` | Atta & Rice | पीठ आणि तांदूळ | Uses the general flour word, not "atta". Say if "atta" is what people ask for. | |
| 82 | `cat.dairy` | Dairy | दूध-दही | Shelf chip, rendered as milk-and-curd rather than the English category word. | |
| 83 | `cat.snacks` | Snacks | स्नॅक्स | Shelf chip. Each language got a different strategy here and all three are guesses — tell us the word people use at the counter. | |
| 84 | `err.generic` | Something went wrong. Please try again. | काहीतरी बिघडले. पुन्हा प्रयत्न करा. | Plain spoken wording chosen over a formal "an error occurred" across all the err.* strings. | |
| 85 | `psearch.browse` | Shop by category | श्रेणीनुसार खरेदी करा | The category word here should match shopdetail.category in the same block. | |
| 86 | `psearch.placeholder` | Search products across shops | सर्व दुकानांत वस्तू शोधा | Uses the everyday goods word, not the "products" word. See tab.products. | |
| 87 | `psearch.recent` | Recent searches | अलीकडचे शोध | Searches the shopper typed before, on this phone only. | |
| 88 | `psearch.voiceIn` | Listens in {language} | {language} मध्ये ऐकते | {language} drops in a language name written in its own script. Read it with one dropped in. | |
| 89 | `ref.title` | Invite & earn | निमंत्रण द्या आणि कमवा | Check this does not read as a lottery or a scheme. | |
| 90 | `shopdetail.searchProducts` | Search products | उत्पादने शोधा | Same split as tab.products. | |
| 91 | `tab.products` | Products | उत्पादने | Tab label. Uses the "products" word rather than the everyday goods word, following what the Hindi and Urdu blocks already ship — but inside sentences the everyday word is used. Tell us if that split reads oddly. | |
| 92 | `upd.builtOn` | Age | किती जुने | A row label for how old the running version is. Rendered as "how old" rather than a bare noun, which read oddly. | |
| 93 | `upd.bundle` | Version | व्हर्जन | Loanword for "version", used consistently across upd.*. | |
| 94 | `upd.disabled` | Updates are switched off in this build. | या अॅपमध्ये अपडेट बंद आहेत. | "Build" has no everyday word, so this says "in this app". | |
| 95 | `voice.search` | Search by voice | बोलून शोधा | All the voice.* strings use one phrase for "by voice"; keep them consistent if you change one. | |
| | **sentences, not labels** | | | | |
| 96 | `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | फोन हीच तुमची लॉगिन आयडी आहे, इथे बदलता येत नाही. |  | |
| 97 | `chelp.e2.a` | Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name. | वरचा सर्च बार वापरा, किंवा श्रेणींमध्ये पाहा. बोलून शोधण्यासाठी 🎤 माइक दाबा आणि वस्तूचे नाव बोला. |  | |
| 98 | `chelp.e2.q` | How do I search for a product? | वस्तू कशी शोधायची? |  | |
| 99 | `chelp.subtitle` | Short answers for shopping, orders and your khata. | खरेदी, ऑर्डर आणि तुमच्या खात्यासाठी छोटी उत्तरे. |  | |
| 100 | `chelp.title` | Help & FAQ | मदत आणि नेहमीचे प्रश्न |  | |
| 101 | `err.badRequest` | Something in that was not right. Please check and try again. | काहीतरी बरोबर नव्हते. तपासून पुन्हा प्रयत्न करा. |  | |
| 102 | `err.conflict` | That could not be done just now. Please try again. | हे आत्ता होऊ शकले नाही. पुन्हा प्रयत्न करा. |  | |
| 103 | `err.notAllowed` | You cannot open this. | तुम्ही हे उघडू शकत नाही. |  | |
| 104 | `err.notFound` | That is not available any more. | हे आता उपलब्ध नाही. |  | |
| 105 | `err.offline` | No internet right now. Check your connection and try again. | सध्या इंटरनेट नाही. कनेक्शन पाहून पुन्हा प्रयत्न करा. |  | |
| 106 | `err.server` | Something went wrong at our end. Please try again in a moment. | आमच्या बाजूने काहीतरी बिघडले. थोड्या वेळाने पुन्हा प्रयत्न करा. |  | |
| 107 | `err.signedOut` | You have been signed out. Please sign in again. | तुम्ही लॉग आउट झाला आहात. पुन्हा साइन इन करा. |  | |
| 108 | `err.slow` | The network is too slow to finish that. Please try again. | नेटवर्क खूप हळू आहे, काम पूर्ण झाले नाही. पुन्हा प्रयत्न करा. |  | |
| 109 | `err.tooMany` | Too many tries. Please wait a minute and try again. | खूप वेळा प्रयत्न झाला. एक मिनिट थांबून पुन्हा प्रयत्न करा. |  | |
| 110 | `psearch.none` | No products found. Try another word. | काहीही मिळाले नाही. दुसरा शब्द वापरून पाहा. |  | |
| 111 | `psearch.start` | Search for a product to see which shops nearby have it. | एखादी वस्तू शोधा आणि पाहा ती जवळच्या कोणत्या दुकानात मिळते. |  | |
| 112 | `upd.downloaded` | Running a downloaded update | डाउनलोड केलेले अपडेट चालू आहे |  | |
| 113 | `upd.embedded` | Built-in version — never updated | अॅपसोबत आलेले व्हर्जन — कधीच अपडेट झाले नाही |  | |
| 114 | `upd.failed` | Could not check for updates. Check your internet and try again. | अपडेट तपासता आले नाही. इंटरनेट पाहून पुन्हा प्रयत्न करा. |  | |
| 115 | `upd.reloading` | New version downloaded. Restarting the app… | नवीन व्हर्जन डाउनलोड झाले. अॅप पुन्हा सुरू होत आहे… |  | |
| 116 | `upd.sub` | Which version of the app is running on this phone. | या फोनवर अॅपचे कोणते व्हर्जन चालू आहे. |  | |
| 117 | `upd.upToDate` | You already have the latest version. | तुमच्याकडे आधीच नवीन व्हर्जन आहे. |  | |
| 118 | `voice.hint.network` | Voice search needs the internet. Check your connection. | बोलून शोधण्यासाठी इंटरनेट लागते. कनेक्शन तपासा. |  | |
| 119 | `voice.hint.no-match` | Did not catch that. Please try again. | समजले नाही. पुन्हा बोला. |  | |
| 120 | `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | माइक बंद आहे. बोलून शोधण्यासाठी सेटिंग्जमध्ये चालू करा. |  | |
| 121 | `voice.hint.unavailable` | Voice search is not available right now. | बोलून शोध सध्या उपलब्ध नाही. |  | |
| 122 | `voice.notInLanguage` | Voice search is not available in this language yet. | या भाषेत बोलून शोध अजून उपलब्ध नाही. |  | |
| | **routine chrome** | | | | |
| 123 | `account.dob` | Date of birth | जन्मतारीख |  | |
| 124 | `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | जन्मतारीख YYYY-MM-DD अशी टाका. |  | |
| 125 | `account.genderFemale` | Female | महिला |  | |
| 126 | `account.genderMale` | Male | पुरुष |  | |
| 127 | `account.genderOther` | Other | इतर |  | |
| 128 | `account.genderUnset` | Not set | दिलेले नाही |  | |
| 129 | `num.cancel` | Cancel | रद्द करा |  | |
| 130 | `num.change` | Change number | नंबर बदला |  | |
| 131 | `num.changing` | Changing… | बदलत आहे… |  | |
| 132 | `num.confirm` | Confirm change | बदल निश्चित करा |  | |
| 133 | `num.current` | Current number | सध्याचा नंबर |  | |
| 134 | `num.devCode` | Dev code: | डेव्ह कोड: |  | |
| 135 | `num.enterCode` | Enter the code sent to {phone} | {phone} वर पाठवलेला कोड टाका |  | |
| 136 | `num.new` | New mobile number | नवीन मोबाइल नंबर |  | |
| 137 | `num.sendCode` | Send code | कोड पाठवा |  | |
| 138 | `num.sending` | Sending… | पाठवत आहे… |  | |
| 139 | `num.title` | Mobile number | मोबाइल नंबर |  | |
| 140 | `orders.failedTitle` | Could not load your orders | तुमचे ऑर्डर लोड होऊ शकले नाहीत |  | |
| 141 | `psearch.atShop` | at {shop} | {shop} मध्ये |  | |
| 142 | `psearch.buyAgain` | Buy it again | पुन्हा खरेदी करा |  | |
| 143 | `psearch.clearRecent` | Clear | साफ करा |  | |
| 144 | `psearch.failedTitle` | Search did not finish | शोध पूर्ण झाला नाही |  | |
| 145 | `psearch.searching` | Searching… | शोधत आहे… |  | |
| 146 | `psearch.title` | Find an item | वस्तू शोधा |  | |
| 147 | `ref.activatedOf` | {a} of {n} activated | {n} पैकी {a} सक्रिय |  | |
| 148 | `ref.loadError` | Could not load referrals. | रेफरल लोड होऊ शकले नाहीत. |  | |
| 149 | `ref.noneYet` | No referrals yet — share your code to get started. | अजून कोणताही रेफरल नाही — सुरू करण्यासाठी तुमचा कोड शेअर करा. |  | |
| 150 | `ref.referredByLabel` | You were invited by | तुम्हाला निमंत्रण दिले |  | |
| 151 | `ref.referredCount` | You have referred {n} so far. | आतापर्यंत तुम्ही {n} जणांना रेफर केले आहे. |  | |
| 152 | `ref.shareLink` | Share link | शेअर लिंक |  | |
| 153 | `ref.subtitle` | Share your code. When someone joins with it, they appear here. | तुमचा कोड शेअर करा. कोणी त्याने जोडले गेले की इथे दिसेल. |  | |
| 154 | `ref.type.customer` | Customer | ग्राहक |  | |
| 155 | `ref.type.owner` | Shop owner | दुकान मालक |  | |
| 156 | `ref.type.shop` | Shop | दुकान |  | |
| 157 | `ref.yourCode` | Your referral code | तुमचा रेफरल कोड |  | |
| 158 | `shopdetail.allCategories` | All categories | सर्व श्रेणी |  | |
| 159 | `shopdetail.brand` | Brand | ब्रँड |  | |
| 160 | `shopdetail.category` | Category | श्रेणी |  | |
| 161 | `shopdetail.failedTitle` | Could not load this shop | हे दुकान लोड होऊ शकले नाही |  | |
| 162 | `shopdetail.noResults` | No matching items. | जुळणारी कोणतीही वस्तू नाही. |  | |
| 163 | `shopdetail.size` | Size | साइज |  | |
| 164 | `shops.failedTitle` | Could not load shops | दुकाने लोड होऊ शकली नाहीत |  | |
| 165 | `shops.heroTitle` | What do you need today? | आज तुम्हाला काय हवे? |  | |
| 166 | `shops.searching` | Searching… | शोधत आहे… |  | |
| 167 | `upd.ageDays` | {n} days old | {n} दिवस जुने |  | |
| 168 | `upd.ageHours` | {n} hours old | {n} तास जुने |  | |
| 169 | `upd.ageMinutes` | {n} minutes old | {n} मिनिटे जुने |  | |
| 170 | `upd.ageNow` | just now | आत्ताच |  | |
| 171 | `upd.check` | Check for updates now | आता अपडेट तपासा |  | |
| 172 | `upd.checking` | Checking… | तपासत आहे… |  | |
| 173 | `upd.title` | App version & updates | अॅपचे व्हर्जन आणि अपडेट |  | |
| 174 | `upd.unknown` | unknown | माहीत नाही |  | |

## Gujarati (`gu`) — 174 strings

| # | key | English | Gujarati | confidence note | ✓ / correction |
|---|---|---|---|---|---|
| | **money and credit** | | | | |
| 1 | `account.prepay` | Pay in advance | એડવાન્સ ચૂકવો | Matched to this block's existing khata.advance wording. | |
| 2 | `account.prepaySub` | Pre-load credit & clear dues on the web | વેબ પર પહેલેથી પૈસા જમા કરો અને બાકી ચૂકવો | Two money ideas in one line: load money up front, and clear what is owed. Check both survive. | |
| 3 | `chelp.e5.a` | You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later. | તમે ખાતામાં (ઉધાર), ઓનલાઇન, કે રોકડ ચૂકવી શકો છો. ખાતામાં લો તો એ રકમ એ દુકાનમાં તમારા ચાલુ બેલેન્સમાં ઉમેરાય છે, પછી ચૂકવી શકાય. | The three ways to pay, and what "on khata" costs you later. The highest-traffic explanation in the app. | |
| 4 | `chelp.e6.a` | Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement. | તમારું ખાતું દરેક દુકાનમાં તમારી બાકી એક જગ્યાએ બતાવે છે. દરેક ખરીદી અને ચૂકવણી નોંધાય છે, એટલે તમારું બેલેન્સ હંમેશાં ખબર રહે છે અને વિવરણ જોઈ કે ડાઉનલોડ કરી શકો છો. | What a khata is. If one sentence here is wrong the whole feature is misunderstood. | |
| 5 | `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | સામાન લેતી વખતે {now} આપો — {amount} નો સામાન કાઢી નાખ્યો છે. | Says pay LESS than before. Check nothing in the sentence can be read as an extra charge. | |
| 6 | `coedit.credit` | {amount} has been taken off your khata at this shop. | આ દુકાનમાં તમારા ખાતામાંથી {amount} ઓછા કરી દીધા છે. | Money coming OFF what the shopper owes. If this reads as money being added, it is wrong and it is expensive. | |
| 7 | `coedit.nowTotal` | Your order now comes to {now}. | તમારા ઓર્ડરનું કુલ હવે {now} છે. | The new, reduced total. Must not read as an additional amount. | |
| 8 | `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | તમે પહેલેથી ચૂકવી દીધું હતું. {amount} આ દુકાનમાં તમારા જમા તરીકે રાખ્યા છે — અહીંના આગળના ઓર્ડરમાં ઓછા થશે. | The word for "credit" here means money the shop is HOLDING for the shopper, not money owed. It is deliberately NOT the txn.credit word (udhaar). Read the two side by side. | |
| 9 | `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only — nothing to translate, so it is kept byte-identical to English on purpose. | |
| 10 | `coedit.title` | The shop adjusted your order | દુકાને તમારો ઓર્ડર ઘટાડ્યો છે | The shop cut the order down. Softened to "reduced", which may be too mild or not mild enough. | |
| 11 | `coedit.wasSubtotal` | Original items total {was} | પહેલાંના સામાનનું કુલ {was} | The ORIGINAL total, shown struck-through beside the new one. Past tense matters. | |
| 12 | `common.balance` | Balance | બેલેન્સ | Reuses this block's existing khata.balance wording, since the English is the same word. | |
| 13 | `num.changed` | Number changed. Your khata across all shops now uses the new number. | નંબર બદલાઈ ગયો. બધી દુકાનોમાં તમારું ખાતું હવે નવા નંબર પર છે. | Tells the shopper their khata at EVERY shop followed the new number. If that reassurance is not clear, people will think their dues were lost. | |
| 14 | `num.newHint` | We'll send a code to the new number to confirm it's yours. Your khata at every shop moves to it. | નવો નંબર તમારો જ છે તે પાકું કરવા તેના પર એક કોડ મોકલીશું. દરેક દુકાનમાં તમારું ખાતું તેના પર જશે. | Same promise, before the change. Long; shorten if it does not fit. | |
| 15 | `ref.creditBalance` | Your referral credit | તમારું રેફરલ ક્રેડિટ | Referral credit — money off, not udhaar. Loanword kept. | |
| 16 | `stmt.closing` | Closing balance | છેલ્લું બેલેન્સ | See stmt.opening. | |
| 17 | `stmt.combined` | Combined total | બધું મળીને કુલ | The total across all shops, not one shop. | |
| 18 | `stmt.opening` | Opening balance | શરૂઆતનું બેલેન્સ | Opening / closing balance are a matched pair with stmt.closing. Read them together. | |
| 19 | `stmt.rangeError` | The From date must be on or before the To date. | "થી" તારીખ "સુધી" તારીખ પહેલાંની કે એ જ હોવી જોઈએ. | Quotes the From and To labels. Those two quoted words must match stmt.from and stmt.to exactly, or the sentence stops making sense. | |
| 20 | `stmt.title` | Account statement | ખાતાનું વિવરણ | Heading of the statement screen. | |
| 21 | `stmt.totalAdjusted` | Adjusted by shop | દુકાન તરફથી સમાયોજન | Same English, same word as txn.adjustment. Change both together or the ledger and the statement disagree. | |
| 22 | `txn.adjustment` | Adjusted by shop | દુકાન તરફથી સમાયોજન | Bookkeeping word. Ask a shopkeeper what he SAYS when he knocks an item off a bill — this may be too written. | |
| 23 | `chelp.e5.q` | How do I pay for an order? | ઓર્ડરના પૈસા કેવી રીતે ચૂકવવા? |  | |
| 24 | `chelp.e6.q` | How does my khata (udhaar) work? | મારું ખાતું (ઉધાર) કેવી રીતે ચાલે છે? |  | |
| 25 | `coedit.intro` | {shop} could not supply everything you ordered. | {shop} પાસે તમારા ઓર્ડરનો બધો સામાન નહોતો. |  | |
| 26 | `coedit.removed` | {item} — removed | {item} — દૂર કર્યું |  | |
| 27 | `stmt.allShops` | All shops (combined) | બધી દુકાનો (સાથે) |  | |
| 28 | `stmt.badDate` | Enter both dates as YYYY-MM-DD. | બંને તારીખ YYYY-MM-DD રીતે લખો. |  | |
| 29 | `stmt.exportOnWeb` | Download CSV or print | CSV ડાઉનલોડ કરો કે પ્રિન્ટ કરો |  | |
| 30 | `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | ફાઇલ સેવ કરવા અને પ્રિન્ટ માટે વેબ એપ જોઈએ. આ તેને સાઇન ઇન કરેલું ખોલી આપશે. |  | |
| 31 | `stmt.from` | From | થી |  | |
| 32 | `stmt.last30` | Last 30 days | છેલ્લા 30 દિવસ |  | |
| 33 | `stmt.last90` | Last 90 days | છેલ્લા 90 દિવસ |  | |
| 34 | `stmt.loadError` | Could not load the statement. | વિવરણ લોડ થઈ શક્યું નથી. |  | |
| 35 | `stmt.noData` | No entries in this date range. | આ સમયગાળામાં કોઈ એન્ટ્રી નથી. |  | |
| 36 | `stmt.pickShop` | Choose a shop | દુકાન પસંદ કરો |  | |
| 37 | `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | શરૂઆતનું બેલેન્સ, સમયગાળાની તારીખવાર એન્ટ્રી, અને છેલ્લું બેલેન્સ. |  | |
| 38 | `stmt.to` | To | સુધી |  | |
| 39 | `stmt.totalPaid` | Total paid | કુલ ચૂકવણી |  | |
| 40 | `stmt.totalPurchases` | Total purchases | કુલ ખરીદી |  | |
| 41 | `stmt.view` | View | જુઓ |  | |
| 42 | `txn.upi` | UPI paid | UPI ચૂકવણી |  | |
| | **orders and shop hours** | | | | |
| 43 | `eta.noPromise` | No ready time promised | તૈયાર થવાનો સમય કહ્યો નથી | Means the shop never gave a time, not that it missed one. | |
| 44 | `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} સુધીમાં થવાનું હતું. હવે વધુ વાર નહીં લાગે. | Apology, not an alarm. | |
| 45 | `open.browseOnly` | You can look around — ordering opens again when the shop does. | તમે જોઈ શકો છો — દુકાન ખૂલતાં જ ફરી ઓર્ડર થઈ શકશે. | Reassurance, not a refusal. Check the tone. | |
| 46 | `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | આ દુકાન અત્યારે બંધ છે, એટલે ઓર્ડર થઈ શકશે નહીં. તમારી કાર્ટ સાચવી રાખી છે. | Two things at once: the order cannot go through, and the cart is not lost. Both must land. | |
| 47 | `open.open` | Open | ખુલ્લી | The shop IS open — an adjective, not the button "open it". The owner app has an unrelated button with the same English; its wording was deliberately not reused here. | |
| 48 | `ostatus.hint.pending` | Waiting for the shop to accept | દુકાનની મંજૂરીની રાહ જોવાય છે | Sits under the status badge. Where the badge word already existed in this block, the hint reuses it. | |
| 49 | `ostatus.hint.ready_delivery` | Ready — awaiting dispatch | તૈયાર — મોકલવાની રાહમાં | "Awaiting dispatch" has no everyday equivalent; rendered as waiting to be sent. | |
| 50 | `cart.restoring` | Getting your cart… | તમારી કાર્ટ લાવી રહ્યા છીએ… |  | |
| 51 | `cart.switchShopClear` | Clear and start here | સાફ કરીને અહીં શરૂ કરો |  | |
| 52 | `cart.switchShopTitle` | Cart at another shop | બીજી દુકાનની કાર્ટ |  | |
| 53 | `chelp.e3.a` | Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it. | દુકાન ખોલો, જોઈતો સામાન કાર્ટમાં નાખો, જાતે લઈ જવું કે ડિલિવરી પસંદ કરો, અને ઓર્ડર કરો દબાવો. દુકાનને તમારો ઓર્ડર મળે છે અને તે પાકો કરે છે. |  | |
| 54 | `chelp.e3.q` | How do I place an order? | ઓર્ડર કેવી રીતે કરવો? |  | |
| 55 | `chelp.e4.a` | Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount. | જાતે લઈ જવું એટલે તમે ઓર્ડર જાતે દુકાનેથી લઈ આવો, મફત. ડિલિવરી એટલે દુકાન તમારા સુધી પહોંચાડે, ક્યારેક નાના ચાર્જ સાથે — ઘણી દુકાનો નક્કી રકમથી ઉપર મફત ડિલિવરી આપે છે. |  | |
| 56 | `chelp.e4.q` | What is the difference between pickup and delivery? | જાતે લઈ જવું અને ડિલિવરીમાં શું ફરક છે? |  | |
| 57 | `chelp.e7.a` | Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step. | ઓર્ડર ટેબ ખોલો અને દરેક ઓર્ડર બાકીથી સ્વીકાર્યો, પછી તૈયાર કે પૂરો થતો જુઓ. દરેક તબક્કે તમને અપડેટ મળે છે. |  | |
| 58 | `chelp.e7.q` | How do I track my order? | મારો ઓર્ડર કેવી રીતે ટ્રેક કરવો? |  | |
| 59 | `eta.readyBy` | Ready by {time} | {time} સુધીમાં તૈયાર |  | |
| 60 | `eta.takingLonger` | Taking a little longer | થોડો વધુ સમય લાગે છે |  | |
| 61 | `open.bannerTitle` | This shop is closed right now | આ દુકાન અત્યારે બંધ છે |  | |
| 62 | `open.cannotOrder` | Closed — cannot order | બંધ — ઓર્ડર થઈ શકશે નહીં |  | |
| 63 | `open.closed` | Closed | બંધ |  | |
| 64 | `open.closedPill` | Closed | બંધ |  | |
| 65 | `open.stateClosed` | Closed — the shop is switched off right now | બંધ — દુકાન અત્યારે બંધ કરી રાખી છે |  | |
| 66 | `open.stateHoliday` | Closed today — reopens {when} | આજે બંધ — {when} ફરી ખૂલશે |  | |
| 67 | `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | આજે બંધ ({reason}) — {when} ફરી ખૂલશે |  | |
| 68 | `open.stateHours` | Closed — opens {when} | બંધ — {when} ખૂલશે |  | |
| 69 | `open.statePaused` | Paused — back {when} | થોડીવાર બંધ — {when} ખૂલશે |  | |
| 70 | `open.todayAt` | at {time} | {time} વાગ્યે |  | |
| 71 | `open.tomorrowAt` | tomorrow at {time} | આવતીકાલે {time} વાગ્યે |  | |
| 72 | `ostatus.hint.accepted` | Accepted — preparing soon | સ્વીકાર્યો — જલદી તૈયાર થશે |  | |
| 73 | `ostatus.hint.cancelled` | Order cancelled | ઓર્ડર રદ |  | |
| 74 | `ostatus.hint.out_for_delivery` | Out for delivery | ડિલિવરી માટે નીકળ્યો |  | |
| 75 | `ostatus.hint.preparing` | Being prepared | તૈયાર થઈ રહ્યો છે |  | |
| 76 | `ostatus.hint.ready_pickup` | Ready for pickup | લઈ જવા માટે તૈયાર |  | |
| | **a judgement call** | | | | |
| 77 | `account.dataSaverSub` | Skip extra photos on slow networks | ધીમા નેટવર્ક પર વધારાના ફોટા લોડ નહીં કરે | Rendered as "will not load extra photos" rather than the imperative "skip". | |
| 78 | `account.gender` | Gender | લિંગ | Gujarati uses the word for sex/gender, deliberately avoiding the one that also reads as caste. | |
| 79 | `account.genderPreferNot` | Prefer not to say | કહેવું નથી | Should read as a choice, not a refusal. | |
| 80 | `account.manage` | Manage | વ્યવસ્થાપન | A card heading over: change number, statement, invite, help. The management word chosen is more formal than the rest of this block; a plainer heading may be better. | |
| 81 | `cat.attaRice` | Atta & Rice | લોટ અને ચોખા | Shelf chip. Not a catalogue term, so there was nothing in the repo to copy. The flour word may be too general. | |
| 82 | `cat.dairy` | Dairy | દૂધ-દહીં | Shelf chip, rendered as milk-and-curd rather than the English category word. | |
| 83 | `cat.snacks` | Snacks | નાસ્તો | Uses the everyday snacks/nashto word rather than the English loan. | |
| 84 | `err.generic` | Something went wrong. Please try again. | કંઈક ગડબડ થઈ. ફરી પ્રયાસ કરો. | Plain spoken wording chosen over a formal "an error occurred" across all the err.* strings. | |
| 85 | `psearch.browse` | Shop by category | શ્રેણી પ્રમાણે ખરીદો | The category word here should match shopdetail.category in the same block. | |
| 86 | `psearch.placeholder` | Search products across shops | બધી દુકાનોમાં સામાન શોધો | Uses the everyday goods word, not the "products" word. See tab.products. | |
| 87 | `psearch.recent` | Recent searches | તાજેતરની શોધ | Searches the shopper typed before, on this phone only. | |
| 88 | `psearch.voiceIn` | Listens in {language} | {language} માં સાંભળે છે | {language} drops in a language name written in its own script. Read it with one dropped in. | |
| 89 | `ref.title` | Invite & earn | આમંત્રણ આપો ને કમાઓ | Check this does not read as a lottery or a scheme. | |
| 90 | `shopdetail.searchProducts` | Search products | ઉત્પાદનો શોધો | Same split as tab.products. | |
| 91 | `tab.products` | Products | ઉત્પાદનો | Tab label. Uses the "products" word rather than the everyday goods word, following what the Hindi and Urdu blocks already ship — but inside sentences the everyday word is used. Tell us if that split reads oddly. | |
| 92 | `upd.builtOn` | Age | કેટલું જૂનું | A row label for how old the running version is. Rendered as "how old" rather than a bare noun, which read oddly. | |
| 93 | `upd.bundle` | Version | વર્ઝન | Loanword for "version", used consistently across upd.*. | |
| 94 | `upd.disabled` | Updates are switched off in this build. | આ એપમાં અપડેટ બંધ છે. | "Build" has no everyday word, so this says "in this app". | |
| 95 | `voice.search` | Search by voice | બોલીને શોધો | All the voice.* strings use one phrase for "by voice"; keep them consistent if you change one. | |
| | **sentences, not labels** | | | | |
| 96 | `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ફોન એ જ તમારું લોગિન આઈડી છે, અહીં બદલી શકાતું નથી. |  | |
| 97 | `chelp.e2.a` | Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name. | ઉપરનો સર્ચ બાર વાપરો, કે શ્રેણીઓમાં જુઓ. બોલીને શોધવા 🎤 માઇક દબાવો અને સામાનનું નામ બોલો. |  | |
| 98 | `chelp.e2.q` | How do I search for a product? | સામાન કેવી રીતે શોધવો? |  | |
| 99 | `chelp.subtitle` | Short answers for shopping, orders and your khata. | ખરીદી, ઓર્ડર અને તમારા ખાતા માટે ટૂંકા જવાબ. |  | |
| 100 | `chelp.title` | Help & FAQ | મદદ અને સામાન્ય પ્રશ્નો |  | |
| 101 | `err.badRequest` | Something in that was not right. Please check and try again. | કંઈક બરાબર નહોતું. તપાસીને ફરી પ્રયાસ કરો. |  | |
| 102 | `err.conflict` | That could not be done just now. Please try again. | આ અત્યારે થઈ શક્યું નહીં. ફરી પ્રયાસ કરો. |  | |
| 103 | `err.notAllowed` | You cannot open this. | તમે આ ખોલી શકતા નથી. |  | |
| 104 | `err.notFound` | That is not available any more. | આ હવે ઉપલબ્ધ નથી. |  | |
| 105 | `err.offline` | No internet right now. Check your connection and try again. | અત્યારે ઇન્ટરનેટ નથી. કનેક્શન જોઈને ફરી પ્રયાસ કરો. |  | |
| 106 | `err.server` | Something went wrong at our end. Please try again in a moment. | અમારી બાજુ કંઈક ગડબડ થઈ. થોડી વારે ફરી પ્રયાસ કરો. |  | |
| 107 | `err.signedOut` | You have been signed out. Please sign in again. | તમે લોગ આઉટ થઈ ગયા છો. ફરી સાઇન ઇન કરો. |  | |
| 108 | `err.slow` | The network is too slow to finish that. Please try again. | નેટવર્ક બહુ ધીમું છે, કામ પૂરું ન થયું. ફરી પ્રયાસ કરો. |  | |
| 109 | `err.tooMany` | Too many tries. Please wait a minute and try again. | ઘણી વાર પ્રયાસ થયો. એક મિનિટ થોભીને ફરી પ્રયાસ કરો. |  | |
| 110 | `psearch.none` | No products found. Try another word. | કંઈ મળ્યું નહીં. બીજો શબ્દ અજમાવો. |  | |
| 111 | `psearch.start` | Search for a product to see which shops nearby have it. | કોઈ સામાન શોધો અને જુઓ કે નજીકની કઈ દુકાનમાં તે મળે છે. |  | |
| 112 | `upd.downloaded` | Running a downloaded update | ડાઉનલોડ કરેલું અપડેટ ચાલે છે |  | |
| 113 | `upd.embedded` | Built-in version — never updated | એપ સાથે આવેલું વર્ઝન — ક્યારેય અપડેટ થયું નથી |  | |
| 114 | `upd.failed` | Could not check for updates. Check your internet and try again. | અપડેટ તપાસી શકાયું નહીં. ઇન્ટરનેટ જોઈને ફરી પ્રયાસ કરો. |  | |
| 115 | `upd.reloading` | New version downloaded. Restarting the app… | નવું વર્ઝન ડાઉનલોડ થયું. એપ ફરી ચાલુ થાય છે… |  | |
| 116 | `upd.sub` | Which version of the app is running on this phone. | આ ફોનમાં એપનું કયું વર્ઝન ચાલે છે. |  | |
| 117 | `upd.upToDate` | You already have the latest version. | તમારી પાસે પહેલેથી જ નવું વર્ઝન છે. |  | |
| 118 | `voice.hint.network` | Voice search needs the internet. Check your connection. | બોલીને શોધવા ઇન્ટરનેટ જોઈએ. કનેક્શન તપાસો. |  | |
| 119 | `voice.hint.no-match` | Did not catch that. Please try again. | સમજાયું નહીં. ફરી બોલો. |  | |
| 120 | `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | માઇક બંધ છે. બોલીને શોધવા સેટિંગ્સમાં ચાલુ કરો. |  | |
| 121 | `voice.hint.unavailable` | Voice search is not available right now. | બોલીને શોધ અત્યારે ઉપલબ્ધ નથી. |  | |
| 122 | `voice.notInLanguage` | Voice search is not available in this language yet. | આ ભાષામાં બોલીને શોધ હજી ઉપલબ્ધ નથી. |  | |
| | **routine chrome** | | | | |
| 123 | `account.dob` | Date of birth | જન્મ તારીખ |  | |
| 124 | `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | જન્મ તારીખ YYYY-MM-DD રીતે લખો. |  | |
| 125 | `account.genderFemale` | Female | સ્ત્રી |  | |
| 126 | `account.genderMale` | Male | પુરુષ |  | |
| 127 | `account.genderOther` | Other | અન્ય |  | |
| 128 | `account.genderUnset` | Not set | આપ્યું નથી |  | |
| 129 | `num.cancel` | Cancel | રદ કરો |  | |
| 130 | `num.change` | Change number | નંબર બદલો |  | |
| 131 | `num.changing` | Changing… | બદલાઈ રહ્યું છે… |  | |
| 132 | `num.confirm` | Confirm change | ફેરફારની ખાતરી કરો |  | |
| 133 | `num.current` | Current number | હાલનો નંબર |  | |
| 134 | `num.devCode` | Dev code: | ડેવ કોડ: |  | |
| 135 | `num.enterCode` | Enter the code sent to {phone} | {phone} પર મોકલેલો કોડ દાખલ કરો |  | |
| 136 | `num.new` | New mobile number | નવો મોબાઇલ નંબર |  | |
| 137 | `num.sendCode` | Send code | કોડ મોકલો |  | |
| 138 | `num.sending` | Sending… | મોકલાઈ રહ્યું છે… |  | |
| 139 | `num.title` | Mobile number | મોબાઇલ નંબર |  | |
| 140 | `orders.failedTitle` | Could not load your orders | તમારા ઓર્ડર લોડ થઈ શક્યા નથી |  | |
| 141 | `psearch.atShop` | at {shop} | {shop} માં |  | |
| 142 | `psearch.buyAgain` | Buy it again | ફરી ખરીદો |  | |
| 143 | `psearch.clearRecent` | Clear | સાફ કરો |  | |
| 144 | `psearch.failedTitle` | Search did not finish | શોધ પૂરી થઈ નહીં |  | |
| 145 | `psearch.searching` | Searching… | શોધી રહ્યા છીએ… |  | |
| 146 | `psearch.title` | Find an item | સામાન શોધો |  | |
| 147 | `ref.activatedOf` | {a} of {n} activated | {n} માંથી {a} સક્રિય |  | |
| 148 | `ref.loadError` | Could not load referrals. | રેફરલ લોડ થઈ શક્યા નથી. |  | |
| 149 | `ref.noneYet` | No referrals yet — share your code to get started. | હજી કોઈ રેફરલ નથી — શરૂ કરવા તમારો કોડ શેર કરો. |  | |
| 150 | `ref.referredByLabel` | You were invited by | તમને આમંત્રણ આપ્યું |  | |
| 151 | `ref.referredCount` | You have referred {n} so far. | અત્યાર સુધી તમે {n} ને રેફર કર્યા છે. |  | |
| 152 | `ref.shareLink` | Share link | શેર લિંક |  | |
| 153 | `ref.subtitle` | Share your code. When someone joins with it, they appear here. | તમારો કોડ શેર કરો. કોઈ તેનાથી જોડાય તો અહીં દેખાશે. |  | |
| 154 | `ref.type.customer` | Customer | ગ્રાહક |  | |
| 155 | `ref.type.owner` | Shop owner | દુકાન માલિક |  | |
| 156 | `ref.type.shop` | Shop | દુકાન |  | |
| 157 | `ref.yourCode` | Your referral code | તમારો રેફરલ કોડ |  | |
| 158 | `shopdetail.allCategories` | All categories | બધી શ્રેણીઓ |  | |
| 159 | `shopdetail.brand` | Brand | બ્રાન્ડ |  | |
| 160 | `shopdetail.category` | Category | શ્રેણી |  | |
| 161 | `shopdetail.failedTitle` | Could not load this shop | આ દુકાન લોડ થઈ શકી નથી |  | |
| 162 | `shopdetail.noResults` | No matching items. | મળતો કોઈ સામાન નથી. |  | |
| 163 | `shopdetail.size` | Size | સાઇઝ |  | |
| 164 | `shops.failedTitle` | Could not load shops | દુકાનો લોડ થઈ શકી નથી |  | |
| 165 | `shops.heroTitle` | What do you need today? | આજે તમને શું જોઈએ? |  | |
| 166 | `shops.searching` | Searching… | શોધી રહ્યા છીએ… |  | |
| 167 | `upd.ageDays` | {n} days old | {n} દિવસ જૂનું |  | |
| 168 | `upd.ageHours` | {n} hours old | {n} કલાક જૂનું |  | |
| 169 | `upd.ageMinutes` | {n} minutes old | {n} મિનિટ જૂનું |  | |
| 170 | `upd.ageNow` | just now | હમણાં જ |  | |
| 171 | `upd.check` | Check for updates now | હમણાં અપડેટ તપાસો |  | |
| 172 | `upd.checking` | Checking… | તપાસી રહ્યા છીએ… |  | |
| 173 | `upd.title` | App version & updates | એપનું વર્ઝન અને અપડેટ |  | |
| 174 | `upd.unknown` | unknown | ખબર નથી |  | |

## Urdu (`ur`) — 112 strings

| # | key | English | Urdu | confidence note | ✓ / correction |
|---|---|---|---|---|---|
| | **money and credit** | | | | |
| 1 | `account.prepay` | Pay in advance | پیشگی ادائیگی | Matched to this block's existing khata.advance wording. | |
| 2 | `account.prepaySub` | Pre-load credit & clear dues on the web | ویب پر پہلے سے رقم جمع کریں اور بقایا ادا کریں | Two money ideas in one line: load money up front, and clear what is owed. Check both survive. | |
| 3 | `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | سامان لیتے وقت {now} دیں — {amount} کا سامان ہٹا دیا گیا ہے۔ | Says pay LESS than before. Check nothing in the sentence can be read as an extra charge. | |
| 4 | `coedit.credit` | {amount} has been taken off your khata at this shop. | اس دکان پر آپ کے کھاتے سے {amount} کم کر دیے گئے ہیں۔ | Money coming OFF what the shopper owes. If this reads as money being added, it is wrong and it is expensive. | |
| 5 | `coedit.nowTotal` | Your order now comes to {now}. | آپ کے آرڈر کا کل اب {now} ہے۔ | The new, reduced total. Must not read as an additional amount. | |
| 6 | `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | آپ پہلے ہی ادا کر چکے تھے۔ {amount} اس دکان پر آپ کے جمع کے طور پر رکھے ہیں — یہاں اگلے آرڈر میں کم ہو جائیں گے۔ | The word for "credit" here means money the shop is HOLDING for the shopper, not money owed. It is deliberately NOT the txn.credit word (udhaar). Read the two side by side. | |
| 7 | `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only — nothing to translate, so it is kept byte-identical to English on purpose. | |
| 8 | `coedit.title` | The shop adjusted your order | دکان نے آپ کا آرڈر کم کیا ہے | The shop cut the order down. Softened to "reduced", which may be too mild or not mild enough. | |
| 9 | `coedit.wasSubtotal` | Original items total {was} | پہلے کے سامان کا کل {was} | The ORIGINAL total, shown struck-through beside the new one. Past tense matters. | |
| 10 | `ref.creditBalance` | Your referral credit | آپ کا ریفرل کریڈٹ | Referral credit — money off, not udhaar. Loanword kept. | |
| 11 | `stmt.closing` | Closing balance | آخری بیلنس | See stmt.opening. | |
| 12 | `stmt.combined` | Combined total | ملا کر کل | The total across all shops, not one shop. | |
| 13 | `stmt.opening` | Opening balance | شروع کا بیلنس | Opening / closing balance are a matched pair with stmt.closing. Read them together. | |
| 14 | `stmt.rangeError` | The From date must be on or before the To date. | "سے" تاریخ "تک" تاریخ سے پہلے یا وہی ہونی چاہیے۔ | Quotes the From and To labels. Those two quoted words must match stmt.from and stmt.to exactly, or the sentence stops making sense. | |
| 15 | `stmt.title` | Account statement | کھاتے کی تفصیل | Heading of the statement screen. | |
| 16 | `stmt.totalAdjusted` | Adjusted by shop | دکان کی طرف سے ایڈجسٹمنٹ | Same English, same word as txn.adjustment. Change both together or the ledger and the statement disagree. | |
| 17 | `txn.adjustment` | Adjusted by shop | دکان کی طرف سے ایڈجسٹمنٹ | Uses the English loanword for "adjustment", which is what Urdu business speech tends to use. Replace it if a shopkeeper would not. | |
| 18 | `coedit.intro` | {shop} could not supply everything you ordered. | {shop} کے پاس آپ کے آرڈر کا سارا سامان نہیں تھا۔ |  | |
| 19 | `coedit.removed` | {item} — removed | {item} — ہٹایا گیا |  | |
| 20 | `stmt.allShops` | All shops (combined) | ساری دکانیں (ملا کر) |  | |
| 21 | `stmt.badDate` | Enter both dates as YYYY-MM-DD. | دونوں تاریخیں YYYY-MM-DD کی طرح درج کریں۔ |  | |
| 22 | `stmt.exportOnWeb` | Download CSV or print | CSV ڈاؤن لوڈ کریں یا پرنٹ کریں |  | |
| 23 | `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | فائل محفوظ کرنے اور پرنٹ کے لیے ویب ایپ چاہیے۔ یہ اسے سائن ان شدہ کھول دے گا۔ |  | |
| 24 | `stmt.from` | From | سے |  | |
| 25 | `stmt.last30` | Last 30 days | پچھلے 30 دن |  | |
| 26 | `stmt.last90` | Last 90 days | پچھلے 90 دن |  | |
| 27 | `stmt.loadError` | Could not load the statement. | تفصیل لوڈ نہیں ہو سکی۔ |  | |
| 28 | `stmt.noData` | No entries in this date range. | اس مدت میں کوئی اندراج نہیں۔ |  | |
| 29 | `stmt.pickShop` | Choose a shop | دکان چنیں |  | |
| 30 | `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | شروع کا بیلنس، مدت کے تاریخ وار اندراج، اور آخری بیلنس۔ |  | |
| 31 | `stmt.to` | To | تک |  | |
| 32 | `stmt.totalPaid` | Total paid | کل ادائیگی |  | |
| 33 | `stmt.totalPurchases` | Total purchases | کل خریداری |  | |
| 34 | `stmt.view` | View | دیکھیں |  | |
| 35 | `txn.upi` | UPI paid | UPI ادائیگی |  | |
| | **orders and shop hours** | | | | |
| 36 | `eta.noPromise` | No ready time promised | تیار ہونے کا وقت نہیں بتایا | Means the shop never gave a time, not that it missed one. | |
| 37 | `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} تک ہونا تھا۔ اب زیادہ دیر نہیں لگے گی۔ | Apology, not an alarm. | |
| 38 | `open.browseOnly` | You can look around — ordering opens again when the shop does. | آپ دیکھ سکتے ہیں — دکان کھلتے ہی دوبارہ آرڈر ہو سکے گا۔ | Reassurance, not a refusal. Check the tone. | |
| 39 | `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | یہ دکان ابھی بند ہے، اس لیے آرڈر نہیں ہو سکتا۔ آپ کا کارٹ محفوظ ہے۔ | Two things at once: the order cannot go through, and the cart is not lost. Both must land. | |
| 40 | `open.open` | Open | کھلی | The shop IS open — an adjective, not the button "open it". The owner app has an unrelated button with the same English; its wording was deliberately not reused here. | |
| 41 | `cart.restoring` | Getting your cart… | آپ کا کارٹ لایا جا رہا ہے… |  | |
| 42 | `cart.switchShopClear` | Clear and start here | ہٹا کر یہاں شروع کریں |  | |
| 43 | `cart.switchShopTitle` | Cart at another shop | دوسری دکان کا کارٹ |  | |
| 44 | `eta.readyBy` | Ready by {time} | {time} تک تیار |  | |
| 45 | `eta.takingLonger` | Taking a little longer | تھوڑا زیادہ وقت لگ رہا ہے |  | |
| 46 | `open.bannerTitle` | This shop is closed right now | یہ دکان ابھی بند ہے |  | |
| 47 | `open.cannotOrder` | Closed — cannot order | بند — آرڈر نہیں ہو سکتا |  | |
| 48 | `open.closed` | Closed | بند |  | |
| 49 | `open.closedPill` | Closed | بند |  | |
| 50 | `open.stateClosed` | Closed — the shop is switched off right now | بند — دکان ابھی بند کر رکھی ہے |  | |
| 51 | `open.stateHoliday` | Closed today — reopens {when} | آج بند — {when} دوبارہ کھلے گی |  | |
| 52 | `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | آج بند ({reason}) — {when} دوبارہ کھلے گی |  | |
| 53 | `open.stateHours` | Closed — opens {when} | بند — {when} کھلے گی |  | |
| 54 | `open.statePaused` | Paused — back {when} | تھوڑی دیر بند — {when} کھلے گی |  | |
| 55 | `open.todayAt` | at {time} | {time} بجے |  | |
| 56 | `open.tomorrowAt` | tomorrow at {time} | کل {time} بجے |  | |
| | **a judgement call** | | | | |
| 57 | `account.dataSaverSub` | Skip extra photos on slow networks | سست نیٹ ورک پر اضافی تصویریں لوڈ نہیں کرے گا | Rendered as "will not load extra photos" rather than the imperative "skip". | |
| 58 | `account.gender` | Gender | جنس | Gujarati uses the word for sex/gender, deliberately avoiding the one that also reads as caste. | |
| 59 | `account.genderPreferNot` | Prefer not to say | بتانا نہیں چاہتے | Should read as a choice, not a refusal. | |
| 60 | `account.manage` | Manage | انتظام | A card heading over: change number, statement, invite, help. The management word chosen is more formal than the rest of this block; a plainer heading may be better. | |
| 61 | `err.generic` | Something went wrong. Please try again. | کچھ گڑبڑ ہو گئی۔ دوبارہ کوشش کریں۔ | Plain spoken wording chosen over a formal "an error occurred" across all the err.* strings. | |
| 62 | `psearch.browse` | Shop by category | زمرے کے مطابق خریداری | The category word here should match shopdetail.category in the same block. | |
| 63 | `psearch.recent` | Recent searches | حالیہ تلاش | Searches the shopper typed before, on this phone only. | |
| 64 | `psearch.voiceIn` | Listens in {language} | {language} میں سنتا ہے | {language} drops in a language name written in its own script. Read it with one dropped in. | |
| 65 | `upd.builtOn` | Age | کتنا پرانا | A row label for how old the running version is. Rendered as "how old" rather than a bare noun, which read oddly. | |
| 66 | `upd.bundle` | Version | ورژن | Loanword for "version", used consistently across upd.*. | |
| 67 | `upd.disabled` | Updates are switched off in this build. | اس ایپ میں اپ ڈیٹ بند ہیں۔ | "Build" has no everyday word, so this says "in this app". | |
| 68 | `voice.search` | Search by voice | بول کر تلاش کریں | All the voice.* strings use one phrase for "by voice"; keep them consistent if you change one. | |
| | **sentences, not labels** | | | | |
| 69 | `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | فون ہی آپ کی لاگ ان آئی ڈی ہے، یہاں بدلی نہیں جا سکتی۔ |  | |
| 70 | `err.badRequest` | Something in that was not right. Please check and try again. | کچھ ٹھیک نہیں تھا۔ دیکھ کر دوبارہ کوشش کریں۔ |  | |
| 71 | `err.conflict` | That could not be done just now. Please try again. | یہ ابھی نہیں ہو سکا۔ دوبارہ کوشش کریں۔ |  | |
| 72 | `err.notAllowed` | You cannot open this. | آپ اسے نہیں کھول سکتے۔ |  | |
| 73 | `err.notFound` | That is not available any more. | یہ اب دستیاب نہیں ہے۔ |  | |
| 74 | `err.offline` | No internet right now. Check your connection and try again. | ابھی انٹرنیٹ نہیں ہے۔ کنکشن دیکھ کر دوبارہ کوشش کریں۔ |  | |
| 75 | `err.server` | Something went wrong at our end. Please try again in a moment. | ہماری طرف کچھ گڑبڑ ہوئی۔ تھوڑی دیر میں دوبارہ کوشش کریں۔ |  | |
| 76 | `err.signedOut` | You have been signed out. Please sign in again. | آپ لاگ آؤٹ ہو گئے ہیں۔ دوبارہ سائن ان کریں۔ |  | |
| 77 | `err.slow` | The network is too slow to finish that. Please try again. | نیٹ ورک بہت سست ہے، کام پورا نہیں ہوا۔ دوبارہ کوشش کریں۔ |  | |
| 78 | `err.tooMany` | Too many tries. Please wait a minute and try again. | بہت بار کوشش ہو چکی۔ ایک منٹ رک کر دوبارہ کوشش کریں۔ |  | |
| 79 | `upd.downloaded` | Running a downloaded update | ڈاؤن لوڈ کیا گیا اپ ڈیٹ چل رہا ہے |  | |
| 80 | `upd.embedded` | Built-in version — never updated | ایپ کے ساتھ آیا ورژن — کبھی اپ ڈیٹ نہیں ہوا |  | |
| 81 | `upd.failed` | Could not check for updates. Check your internet and try again. | اپ ڈیٹ نہیں دیکھا جا سکا۔ انٹرنیٹ دیکھ کر دوبارہ کوشش کریں۔ |  | |
| 82 | `upd.reloading` | New version downloaded. Restarting the app… | نیا ورژن ڈاؤن لوڈ ہو گیا۔ ایپ دوبارہ چالو ہو رہی ہے… |  | |
| 83 | `upd.sub` | Which version of the app is running on this phone. | اس فون پر ایپ کا کون سا ورژن چل رہا ہے۔ |  | |
| 84 | `upd.upToDate` | You already have the latest version. | آپ کے پاس پہلے سے ہی نیا ورژن ہے۔ |  | |
| 85 | `voice.hint.network` | Voice search needs the internet. Check your connection. | بول کر تلاش کے لیے انٹرنیٹ چاہیے۔ کنکشن دیکھیں۔ |  | |
| 86 | `voice.hint.no-match` | Did not catch that. Please try again. | سمجھ نہیں آیا۔ دوبارہ بولیں۔ |  | |
| 87 | `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | مائیک بند ہے۔ بول کر تلاش کرنے کے لیے سیٹنگز میں چالو کریں۔ |  | |
| 88 | `voice.hint.unavailable` | Voice search is not available right now. | بول کر تلاش ابھی دستیاب نہیں ہے۔ |  | |
| 89 | `voice.notInLanguage` | Voice search is not available in this language yet. | اس زبان میں بول کر تلاش ابھی دستیاب نہیں ہے۔ |  | |
| | **routine chrome** | | | | |
| 90 | `account.dob` | Date of birth | تاریخ پیدائش |  | |
| 91 | `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | تاریخ پیدائش YYYY-MM-DD کی طرح درج کریں۔ |  | |
| 92 | `account.genderFemale` | Female | عورت |  | |
| 93 | `account.genderMale` | Male | مرد |  | |
| 94 | `account.genderOther` | Other | دیگر |  | |
| 95 | `account.genderUnset` | Not set | درج نہیں |  | |
| 96 | `orders.failedTitle` | Could not load your orders | آپ کے آرڈر لوڈ نہیں ہو سکے |  | |
| 97 | `psearch.buyAgain` | Buy it again | دوبارہ خریدیں |  | |
| 98 | `psearch.clearRecent` | Clear | صاف کریں |  | |
| 99 | `psearch.failedTitle` | Search did not finish | تلاش پوری نہیں ہو سکی |  | |
| 100 | `psearch.title` | Find an item | سامان تلاش کریں |  | |
| 101 | `ref.activatedOf` | {a} of {n} activated | {n} میں سے {a} فعال |  | |
| 102 | `shopdetail.failedTitle` | Could not load this shop | یہ دکان لوڈ نہیں ہو سکی |  | |
| 103 | `shops.failedTitle` | Could not load shops | دکانیں لوڈ نہیں ہو سکیں |  | |
| 104 | `shops.heroTitle` | What do you need today? | آج آپ کو کیا چاہیے؟ |  | |
| 105 | `upd.ageDays` | {n} days old | {n} دن پرانا |  | |
| 106 | `upd.ageHours` | {n} hours old | {n} گھنٹے پرانا |  | |
| 107 | `upd.ageMinutes` | {n} minutes old | {n} منٹ پرانا |  | |
| 108 | `upd.ageNow` | just now | ابھی ابھی |  | |
| 109 | `upd.check` | Check for updates now | ابھی اپ ڈیٹ دیکھیں |  | |
| 110 | `upd.checking` | Checking… | دیکھ رہے ہیں… |  | |
| 111 | `upd.title` | App version & updates | ایپ کا ورژن اور اپ ڈیٹ |  | |
| 112 | `upd.unknown` | unknown | معلوم نہیں |  | |

---

Generated from `mobile-app/src/consumer/i18n.js` as shipped, by batch INDOARYAN. Regenerate it
rather than hand-editing the tables, so the sheet and the dictionary cannot drift apart.
