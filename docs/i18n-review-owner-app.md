# Native-speaker review — Tamil, Telugu, Kannada, Malayalam and Urdu (owner app)

**Every string in this file was authored by the build, not by a native speaker.** They are
live in the owner app now (`mobile-app/src/i18n.js`), because until this batch a shopkeeper
who picked Tamil got an app that was 38% translated — whole screens in English — and a
plain-but-imperfect Tamil beats that. Nobody who speaks these languages has read them.

This is **not** the earlier batches. Every non-English value this repo shipped for
`ta`/`te`/`kn`/`ml`/`ur` before now was COPIED from something a human had written: the
regional seed (`backend/src/data/regional-i18n.json`) or the web dashboard
(`admin-dashboard/src/lib/i18n.js`). Those sources have nothing for order editing, the
new-order alert, shop hours, ready-times, families or settings — they carry `en` and `hi`
only. So the 197 keys per language below were **written here, by a model**, and they are
the reason this sheet exists.

**What to do:** go down your language's table and put a `✓` in the last column when the line
is fine, or write what it should say instead. Do not soften anything — if a line reads oddly,
formally, or just wrong, say so. **This file is the source of truth for the review:**
corrections written here get applied back into `mobile-app/src/i18n.js`.

**The tables are ordered worst-first.** Money, credit and order strings are at the top,
then the alert that is read aloud, then the ready-time and shop-hours screens, then routine
chrome. The thirty rows that matter are the first thirty; fifteen minutes on those covers
most of the real risk.

**House rules the translations follow** (so you can tell a bug from a choice):

- Plain spoken register, the way a shopkeeper talks — not formal or literary.
- **Vocabulary was taken from that language's own existing block, not chosen afresh.** If
  the block already said something a particular way, the new strings say it the same way,
  even where a nicer alternative exists. Consistency inside the app beats an individually
  better word, so "this is not the best word" is a valid correction only if it applies
  everywhere the word appears.
- Shop loanwords are kept where they are what people actually say (UPI, order, delivery,
  online, WhatsApp), rather than forced into a pure register nobody uses.
- Numerals stay Latin (`30`, `90`, `₹1,250.00`), matching every other language in the app.
- `{name}`, `{amount}`, `{mins}`, `{when}` and friends are **placeholders** — real values
  drop in there. They must survive any correction, spelled exactly the same. A dropped one
  renders a broken sentence to a real shopkeeper.
- Urdu is written right-to-left as plain Urdu, with Urdu full stops (۔) and **no inserted
  direction marks**.

## Coverage

| language | keys before | keys added here | keys now | of `en`'s 325 |
|---|---|---|---|---|
| Tamil (`ta`) | 123 | 197 | 320 | 98.5% |
| Telugu (`te`) | 123 | 197 | 320 | 98.5% |
| Kannada (`kn`) | 123 | 197 | 320 | 98.5% |
| Malayalam (`ml`) | 123 | 197 | 320 | 98.5% |
| Urdu (`ur`) | 123 | 197 | 320 | 98.5% |

The five keys still falling back to English in each are deliberate and are listed at the
bottom of this file. Bengali, Marathi and Gujarati each gained exactly one key in this
batch and are covered in their own short section; their main review sheet is still
`docs/i18n-review-bn-gu-mr.md`.

## Start here — the calls I had to make

These are the places where a reviewer's judgement changes the app, not just the prose.

**Everywhere:**

- **REJECT is not CANCEL.** The app treats rejecting a new order and cancelling an accepted
  one as different actions with different consequences. In every language I deliberately
  picked a reject verb that is NOT the word the block already uses for `ostatus.cancelled`.
  If your language really does use one word for both, say so — the fix is a screen change,
  not a string change.
- **ACCEPT is derived from the status word.** `oalert.accept` and `eta.accept` use the verb
  form of whatever the block already had for `ostatus.accepted`. That is consistent but may
  be more formal than the word a shopkeeper would actually tap.
- **Prepaid money is never refunded.** `oedit.moneyPrepaid` and `orej.prepaidCredit` both
  say the amount becomes credit AT THE SHOP. If either can be read as "a refund is coming",
  it is a bug, not a style note.
- **`oalert.spoken` is spoken.** Read it out loud with a real customer name in `{name}`.

**Per language:**

| language | key | the call |
|---|---|---|
| Tamil | `orej.reject` | I chose **நிராகரி**, deliberately NOT ரத்து, because ரத்து is already ostatus.cancelled and the shopkeeper must not confuse rejecting a new order with cancelling an accepted one. நிராகரி is a shade formal — is there a counter word? |
| Tamil | `oalert.accept` | I chose **ஏற்று** to match ஏற்கப்பட்டது already in this block. A shopkeeper might just say "எடுத்துக்கோ" — tell me. |
| Tamil | `oedit.moneyCredit` | I used **கணக்கு** for the khata. Is that the word, or would a Tamil shopkeeper say வரவு-செலவு / பாக்கி கணக்கு? |
| Tamil | `oedit.moneyPrepaid` | I used **வரவு** for "kept as credit". Check that it reads as money standing to the customer, not money owed by them. |
| Tamil | `ins.collections` | வசூல் was already in this block for dash.todayCollections and I kept it everywhere. |
| Tamil | `txn.adjustment` | I used **சரிசெய்தல்**. It is a neutral word; if a shop would call this something plainer, say so. |
| Tamil | `cat.indicative` | தோராயமானது — long for a chip. A shorter word is welcome. |
| Tamil | `common.missing` | முழுமையில்லை — a coined-feeling compound. Suggest better if it reads oddly as a title. |
| Tamil | `orej.back` | பின்செல் as a Back button. பின் alone felt ambiguous. |
| Telugu | `orej.reject` | I chose **తిరస్కరించు**, deliberately NOT రద్దు, because రద్దు is already ostatus.cancelled. Is తిరస్కరించు too formal for a counter? |
| Telugu | `oalert.accept` | I chose **ఆమోదించు** to match ఆమోదించబడింది already in this block, over the more spoken "తీసుకో". Tell me which a shopkeeper would tap. |
| Telugu | `oedit.moneyCredit` | I used **ఖాతా** for the khata — the same word the block uses for an account. |
| Telugu | `oedit.moneyPrepaid` | I used **జమ** for credit standing at the shop. Check it is not read as a deposit in a bank. |
| Telugu | `ins.collections` | వసూళ్లు was already in this block for dash.todayCollections and I kept it everywhere. |
| Telugu | `famd.combinedLimit` | మొత్తం పరిమితి reuses మొత్తం, which this block also uses for "amount" and for famd.combinedOutstanding. Flag it if it is confusing. |
| Kannada | `orej.reject` | I chose **ತಿರಸ್ಕರಿಸಿ**, deliberately NOT ರದ್ದುಮಾಡಿ, because ರದ್ದು is already ostatus.cancelled. The app treats reject and cancel as different actions. |
| Kannada | `oalert.accept` | I chose **ಸ್ವೀಕರಿಸಿ** to match ಸ್ವೀಕರಿಸಲಾಗಿದೆ already in this block. |
| Kannada | `oedit.moneyCredit` | I used **ಖಾತೆ** for the khata. |
| Kannada | `oedit.moneyPrepaid` | I used **ಜಮೆ** for credit standing at the shop. |
| Kannada | `ord.cancelConfirm` | I did NOT reuse the block's existing "cannot be undone" wording (ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗದು) here, because in a sentence about cancelling it reads as "this cannot be cancelled". I wrote ಇದನ್ನು ಮತ್ತೆ ಹಿಂದಕ್ಕೆ ತರಲಾಗದು instead. Tell me if cat.deleteConfirm should be changed to match. |
| Kannada | `ins.collections` | ವಸೂಲಿ was already in this block for dash.todayCollections and I kept it everywhere. |
| Malayalam | `orej.reject` | I chose **നിരസിക്കുക**, deliberately NOT റദ്ദാക്കുക, because റദ്ദാക്കി is already ostatus.cancelled. |
| Malayalam | `oalert.accept` | I chose **സ്വീകരിക്കുക** to match സ്വീകരിച്ചു already in this block. |
| Malayalam | `oedit.moneyCredit` | I used **കണക്ക്** for the khata rather than transliterating "khata". Check it reads as the credit book. |
| Malayalam | `oedit.moneyPrepaid` | I used **ക്രെഡിറ്റ്** here because the existing block already borrows English freely. A pure-Malayalam word would be welcome if one is natural. |
| Malayalam | `txn.adjustment` | I used **തിരുത്തൽ** and NOT ക്രമീകരണം, because ക്രമീകരണങ്ങൾ is already title.settings and the two would collide. |
| Malayalam | `ins.collections` | പിരിവ് was already in this block for dash.todayCollections and I kept it everywhere. |
| Malayalam | `more.credits` | കണക്ക് ക്രെഡിറ്റ് — the feature name. Say if it should stay closer to the English. |
| Urdu | `orej.reject` | I chose **مسترد کریں**, deliberately NOT منسوخ, because منسوخ is already ostatus.cancelled. A shopkeeper may prefer "واپس کر دیں". |
| Urdu | `oalert.accept` | I chose **قبول کریں** to match قبول شدہ already in this block. |
| Urdu | `oedit.moneyCredit` | I used **کھاتہ**, which is the shopkeeper's own word — the one place in this batch where the trade term needed no substitute. |
| Urdu | `oedit.moneyPrepaid` | I used **جمع** for credit standing at the shop, the natural counterpart to کھاتہ. |
| Urdu | `txn.adjustment` | I used **ردوبدل**. I considered کمی بیشی, which is more of a shop phrase, and ایڈجسٹمنٹ, which is a bare transliteration. Tell me which belongs on a ledger row. |
| Urdu | `ins.collections` | وصولی was already in this block for dash.todayCollections and I kept it everywhere. |
| Urdu | `oedit.feeMayChange` | ترسیل is this block's word for delivery (ful.delivery), so I used it here rather than ڈیلیوری — but more.delivery keeps ڈیلیوری because it is a feature name. Flag the inconsistency if it jars. |
| Urdu | `famd.reminderSent` | Urdu full stops (۔) throughout, matching the existing block. No direction marks are inserted anywhere. |

## Tamil (`ta`) — 197 strings

### 1. Money, credit and the order

A wrong word here costs the shopkeeper money or a customer. Check every row.

| key | English | Tamil | what to check | ✓ / correction |
|---|---|---|---|---|
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | இந்த வாடிக்கையாளரின் கணக்கில் இருந்து {amount} குறையும். | I used **கணக்கு** for the khata. Is that the word, or would a Tamil shopkeeper say வரவு-செலவு / பாக்கி கணக்கு? |  |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ஏற்கனவே ஆன்லைனில் பணம் கட்டியாகிவிட்டது — {amount} இந்த வாடிக்கையாளருக்காக உங்கள் கடையில் வரவாக இருக்கும். | I used **வரவு** for "kept as credit". Check that it reads as money standing to the customer, not money owed by them. |  |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ஆர்டரைக் கொடுக்கும்போது {amount} குறைவாக வாங்கிக்கொள்ளுங்கள். | Means collect LESS at handover. If it can be read as "collect {amount}", it is wrong. |  |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ஆன்லைனில் பணம் கட்டியாகிவிட்டது — அந்தத் தொகை இந்த வாடிக்கையாளருக்காக உங்கள் கடையில் வரவாக மாறும். பணம் திரும்பக் கிடைக்காது. | Same trap: credit at the shop, never a refund. Highest-stakes string in the file. |  |
| `oedit.reducedBy` | You are taking off {amount}. | நீங்கள் {amount} குறைக்கிறீர்கள். | The amount being taken OFF, not the new total. |  |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | இதனால் ஆர்டர் உங்கள் இலவச டெலிவரி தொகைக்குக் கீழே போனால், உறுதி செய்யும்போது டெலிவரி கட்டணம் மீண்டும் கணக்கிடப்படும். | Conditional — the fee is recalculated only if the order drops below the free-delivery amount. Check the "if" survives. |  |
| `txn.adjustment` | Adjustment | சரிசெய்தல் | I used **சரிசெய்தல்**. It is a neutral word; if a shop would call this something plainer, say so. |  |
| `oedit.originalSubtotal` | Original subtotal | அசல் கூட்டுத்தொகை | The subtotal BEFORE the reduction. |  |
| `orej.reject` | Reject | நிராகரி | I chose **நிராகரி**, deliberately NOT ரத்து, because ரத்து is already ostatus.cancelled and the shopkeeper must not confuse rejecting a new order with cancelling an accepted one. நிராகரி is a shade formal — is there a counter word? |  |
| `orej.confirm` | Reject order | ஆர்டரை நிராகரி | The button that actually rejects. Same reject/cancel distinction. |  |
| `orej.title` | Reject this order? | இந்த ஆர்டரை நிராகரிக்கவா? | Same reject/cancel distinction. |  |
| `orej.done` | Order rejected. | ஆர்டர் நிராகரிக்கப்பட்டது. | Same reject/cancel distinction. |  |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | வாடிக்கையாளருக்குக் காரணத்தைச் சொல்லுங்கள் — ரத்து செய்தியுடன் அவருக்கு அனுப்பப்படும். | The reason is sent to the customer. Check it reads as "we will pass this on", not "write it down for yourself". |  |
| `oalert.accept` | Accept | ஏற்று | I chose **ஏற்று** to match ஏற்கப்பட்டது already in this block. A shopkeeper might just say "எடுத்துக்கோ" — tell me. |  |
| `eta.accept` | Accept | ஏற்று | Same word as oalert.accept on purpose. If you change one, change both. |  |
| `eta.acceptTitle` | Accept this order | இந்த ஆர்டரை ஏற்று | Same word as oalert.accept on purpose. |  |
| `eta.noTime` | Accept without a time | நேரம் சொல்லாமல் ஏற்று |  |  |
| `eta.notNow` | Not now | இப்போது வேண்டாம் |  |  |
| `eta.accepting` | Accepting… | ஏற்கிறது… |  |  |
| `oedit.start` | Not everything in stock? | எல்லாப் பொருளும் இல்லையா? | The prompt that opens order-reduction. Spoken, informal — "not everything in stock?" |  |
| `oedit.startBtn` | Reduce this order | இந்த ஆர்டரைக் குறை | REDUCE, not cancel and not edit. Nothing here can add or raise anything. |  |
| `oedit.title` | Reduce this order | இந்த ஆர்டரைக் குறை | Same word as oedit.startBtn on purpose. |  |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | உங்களிடம் இல்லாததை எடுத்துவிடுங்கள். இங்கே பொருளை அகற்றவோ அளவைக் குறைக்கவோ மட்டுமே முடியும் — புதிய பொருள் சேர்க்கவோ, அளவை அதிகரிக்கவோ, விலையை மாற்றவோ இங்கே முடியாது. | The safety rule: only remove or lower. If the sentence leaves any room for "you can also add", it is wrong. |  |
| `oedit.confirm` | Confirm the new order | புதிய ஆர்டரை உறுதி செய் | Commits the smaller order. |  |
| `oedit.keep` | Leave it as it was | இருந்தபடியே இருக்கட்டும் | Backs out without changing anything. |  |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ஆர்டர் குறைக்கப்பட்டது. என்ன மாறியது என்று வாடிக்கையாளருக்குத் தெரிவிக்கப்பட்டது. | Also states the customer has been told. Both halves matter. |  |
| `oedit.noChange` | Nothing has been changed yet. | இதுவரை எதுவும் மாற்றப்படவில்லை. |  |  |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | நீங்கள் எல்லாவற்றையும் எடுத்துவிட்டீர்கள். அதற்குப் பதிலாக ஆர்டரையே ரத்து செய்யுங்கள். | Only shown when everything has been taken off. Points at CANCEL, a different action from reduce. |  |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | இப்போது ஆர்டரை ஏற்று, எப்போது தயாராகும் என்று வாடிக்கையாளரிடம் சொல்லுங்கள். | Two instructions in one line: accept, then promise a time. |  |
| `oedit.remove` | Remove | அகற்று | Take an item off this order — not "delete the product from my catalogue". |  |
| `oedit.restore` | Put back | திரும்பச் சேர் | Put a removed item back. |  |
| `oedit.removedTag` | Removed | அகற்றப்பட்டது |  |  |
| `oedit.saving` | Saving… | சேமிக்கிறது… |  |  |
| `oedit.was` | Was {was} | முன்பு {was} | Renders next to the new quantity. {was} is the old one. |  |
| `oedit.wasNow` | Was {was} — now {now} | முன்பு {was} — இப்போது {now} | Old quantity then new. Check the order of the two placeholders reads right. |  |
| `oedit.historyTitle` | What was taken off | என்ன எடுக்கப்பட்டது |  |  |
| `oedit.historyRemoved` | {item} — removed | {item} — அகற்றப்பட்டது |  |  |
| `oedit.historyUnknownWho` | the shop | கடை | Stands in for a person's name in "{who}, {when}" — it must read like an actor ("the shop"), not like a place. |  |
| `ord.notFound` | Order not found. | ஆர்டர் கிடைக்கவில்லை. |  |  |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | இந்த ஆர்டரை ரத்து செய்யவா? இதை மீட்க முடியாது. | CANCEL, and it cannot be undone. Check the second sentence is not the same word as "cancel" doing double duty. |  |
| `orej.r1` | Out of stock | பொருள் இல்லை | One-tap reason. Short and spoken. |  |
| `orej.r2` | Too busy right now | இப்போது மிகவும் வேலை | One-tap reason. Short and spoken. |  |
| `orej.r3` | Shop is closing | கடை மூடப்படுகிறது | One-tap reason. Short and spoken. |  |
| `orej.placeholder` | Another reason (optional) | வேறு காரணம் (விருப்பம்) |  |  |
| `orej.back` | Back | பின்செல் | பின்செல் as a Back button. பின் alone felt ambiguous. |  |
| `custd.recordAction` | Record payment / purchase | பணம் / கொள்முதல் பதிவு செய் | Two things on one button: money coming IN and goods going OUT on credit. |  |
| `add.invalidAmount` | Enter a valid amount | சரியான தொகையை உள்ளிடவும் | Money validation. |  |
| `addtx.missingBody` | Pick a customer and amount | வாடிக்கையாளரையும் தொகையையும் தேர்ந்தெடுக்கவும் | Money validation. |  |
| `addtx.selectedCustomer` | Selected customer | தேர்ந்தெடுத்த வாடிக்கையாளர் |  |  |
| `addtx.notePlaceholder` | note | குறிப்பு |  |  |
| `famd.combinedLimit` | Combined limit | கூட்டு வரம்பு | The whole family's cap. |  |
| `famd.subLimit` | sub-limit {amt} | உப-வரம்பு {amt} | A per-member cap inside a family limit. |  |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | WhatsApp நினைவூட்டல் அனுப்பப்பட்டது. கூட்டு நிலுவை: {amt}. | Carries the combined outstanding. The number is real money. |  |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | அனுப்பப்படவில்லை (செலுத்துபவர் அறிவிப்புகளை நிறுத்தி இருக்கலாம்). கூட்டு நிலுவை: {amt}. | Says it did NOT go out. If that reads as "sent", a shopkeeper stops chasing a real debt. |  |
| `famd.payerLabel` | Payer | செலுத்துபவர் | The family member who settles the bill. |  |
| `famd.payerTag` | (payer) | (செலுத்துபவர்) |  |  |
| `famd.notSet` | not set | அமைக்கப்படவில்லை |  |  |
| `ins.purchases` | Purchases | கொள்முதல் | Goods sold on credit over the window — the same idea as txn.purchase, and I used the same word. |  |
| `ins.collections` | Collections | வசூல் | வசூல் was already in this block for dash.todayCollections and I kept it everywhere. |  |
| `ins.withDues` | With dues | நிலுவை உள்ளவர்கள் | Customers who owe. |  |
| `ins.newCustomers` | New customers | புதிய வாடிக்கையாளர்கள் |  |  |
| `ins.daysN` | {d} days | {d} நாட்கள் |  |  |
| `cat.editPrice` | Edit ₹ | ₹ மாற்று | A tight button; only the rupee sign and a verb fit. |  |
| `cat.editPriceTitle` | Edit price (₹) | விலையை மாற்று (₹) |  |  |
| `cat.setPrice` | Set price (₹) | விலையை அமை (₹) |  |  |
| `cat.indicative` | Indicative | தோராயமானது | தோராயமானது — long for a chip. A shorter word is welcome. |  |
### 2. The new-order alert (some of it is read aloud)

`oalert.spoken` and the lines around it are spoken by text-to-speech in a noisy shop. Read them out loud, not just with your eyes.

| key | English | Tamil | what to check | ✓ / correction |
|---|---|---|---|---|
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | புதிய ஆர்டர். {name}. {n} பொருட்கள். {amount} ரூபாய். | READ ALOUD by text-to-speech in a noisy shop. Say it out loud before approving: no abbreviations, no symbols, and it must survive a name dropping into {name}. |  |
| `oalert.title` | New order waiting | புதிய ஆர்டர் காத்திருக்கிறது | Heard as a notification title on many devices. |  |
| `oalert.items` | {n} items | {n} பொருட்கள் | Also read aloud as part of the alert. Plural form is fixed — {n} may be 1. |  |
| `oalert.more` | +{n} more | +{n} மேலும் |  |  |
| `oalert.waiting` | waiting {mins} min | {mins} நிமிடமாக காத்திருக்கிறது |  |  |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | இன்னும் காத்திருக்கிறது — நீங்கள் இதற்கு இன்னும் பதில் சொல்லவில்லை. | Nagging, not scolding. Check the tone. |  |
| `oalert.decide` | This keeps alerting until you accept or reject it. | நீங்கள் ஏற்கும் வரை அல்லது நிராகரிக்கும் வரை இது அலர்ட் செய்துகொண்டே இருக்கும். | States the alert will not stop until accepted or rejected. Both verbs must be the ones used on the buttons. |  |
| `oalert.snooze` | Not now — {mins} min | இப்போது வேண்டாம் — {mins} நிமிடம் | "Not now" — quiets ONE order briefly. Must not read as "reject". |  |
| `oalert.snoozedFor` | Quiet for {mins} more min | இன்னும் {mins} நிமிடம் அமைதி | Must not read as "alerts are off". |  |
| `oalert.open` | Open | திற |  |  |
| `oalert.mute30` | Mute for 30 minutes | 30 நிமிடம் அமைதி |  |  |
| `oalert.unmute` | Turn alerts back on | அலர்ட்டை மீண்டும் இயக்கு |  |  |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | இந்த ஃபோன் இன்னும் உங்கள் மொழியில் பேச முடியாது — பேனர் மட்டும் தெரியும். | Says the phone cannot speak this language; the banner still shows. |  |
| `oalert.setTitle` | Order alerts | ஆர்டர் அலர்ட் |  |  |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | புதிய ஆர்டர் வந்தால் நீங்கள் அதை ஏற்கும் வரை அல்லது நிராகரிக்கும் வரை இங்கேயும் WhatsApp-இலும் அலர்ட் வந்துகொண்டே இருக்கும். “இப்போது வேண்டாம்” ஒரு ஆர்டரை சில நிமிடங்களுக்கு மட்டுமே அமைதியாக்கும்; அலர்ட்டை நிறுத்தாது. | The longest string in the batch and the one that explains the whole alert contract. Read it slowly. |  |
| `oalert.setEnabled` | Alert me about new orders | புதிய ஆர்டர்களுக்கு எனக்கு அலர்ட் கொடு |  |  |
| `oalert.setRepeat` | Repeat every (minutes) | எத்தனை நிமிடத்துக்கு ஒருமுறை |  |  |
| `oalert.setMaxRepeats` | Stop after (repeats) | எத்தனை முறைக்குப் பிறகு நிறுத்து |  |  |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 நிமிடம் அமைதி |  |  |
| `oalert.setMuted` | Alerts are muted right now. | இப்போது அலர்ட் அமைதியாக உள்ளது. |  |  |
| `oalert.setSaved` | Order alert settings saved. | ஆர்டர் அலர்ட் அமைப்புகள் சேமிக்கப்பட்டன. |  |  |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | நீங்கள் கொடுத்த எண் அனுமதிக்கப்பட்ட அருகிலுள்ள எண்ணாக மாற்றப்பட்டது. | The value the shopkeeper typed was changed for them. |  |
### 3. Ready-time promises and shop availability

Promises made to a customer, and whether the shop is open. Wrong here and a customer turns up to a shut shop.

| key | English | Tamil | what to check | ✓ / correction |
|---|---|---|---|---|
| `eta.pickTime` | Ready in about… | சுமார் எவ்வளவு நேரத்தில் தயார்… | A question with a trailing ellipsis, answered by the chips below it. |  |
| `eta.chipMin` | ~{n} min | ~{n} நிமிடம் |  |  |
| `eta.chipHour` | ~{n} hour | ~{n} மணி நேரம் |  |  |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} மணி {m} நிமிடம் | Two placeholders in one chip, very little room. |  |
| `eta.promisedBy` | You promised ready by {time} | {time} மணிக்குள் தயார் என்று சொல்லியிருக்கிறீர்கள் | A promise already made to the customer. |  |
| `eta.noPromise` | No ready time promised | தயாராகும் நேரம் சொல்லப்படவில்லை |  |  |
| `eta.needMore` | Need more time | இன்னும் நேரம் வேண்டும் |  |  |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | புதிய நேரத்தைத் தேர்ந்தெடுங்கள் — வாடிக்கையாளருக்கு உடனே தெரிவிக்கப்படும். |  |  |
| `eta.sent` | The customer has been told the new time. | வாடிக்கையாளருக்குப் புதிய நேரம் தெரிவிக்கப்பட்டது. |  |  |
| `eta.late` | Past the time you promised | நீங்கள் சொன்ன நேரம் கடந்துவிட்டது | The promise has been missed. Factual, not accusing. |  |
| `eta.readyBy` | Ready by {time} | {time} மணிக்குள் தயார் |  |  |
| `eta.takingLonger` | Taking a little longer | கொஞ்சம் அதிக நேரம் ஆகிறது |  |  |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} மணிக்குள் தயாராக வேண்டியது. இன்னும் அதிக நேரம் ஆகாது. | Reassurance after a missed promise. |  |
| `open.open` | Open | திறந்திருக்கிறது |  |  |
| `open.closed` | Closed | மூடியிருக்கிறது |  |  |
| `open.todayAt` | at {time} | {time} மணிக்கு |  |  |
| `open.tomorrowAt` | tomorrow at {time} | நாளை {time} மணிக்கு |  |  |
| `open.title` | Shop availability | கடை திறந்திருக்கிறதா |  |  |
| `open.switchLabel` | Shop is open | கடை திறந்திருக்கிறது |  |  |
| `open.takingOrders` | You are taking orders right now. | நீங்கள் இப்போது ஆர்டர் எடுக்கிறீர்கள். |  |  |
| `open.notTakingOrders` | Customers cannot order right now. | வாடிக்கையாளர்கள் இப்போது ஆர்டர் செய்ய முடியாது. |  |  |
| `open.stateClosed` | Closed — you switched the shop off | மூடியிருக்கிறது — நீங்கள் கடையை அணைத்து வைத்திருக்கிறீர்கள் |  |  |
| `open.statePaused` | Paused — back {when} | சிறிது நேரம் நிறுத்தம் — {when} திரும்பும் | {when} is a time. Check the sentence still parses when a time drops in. |  |
| `open.stateHoliday` | Closed today — reopens {when} | இன்று மூடியிருக்கிறது — {when} திறக்கும் |  |  |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | இன்று மூடியிருக்கிறது ({reason}) — {when} திறக்கும் |  |  |
| `open.stateHours` | Closed — opens {when} | மூடியிருக்கிறது — {when} திறக்கும் |  |  |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | கொஞ்ச நேரம் மூட வேண்டுமா? ஒரே தட்டு, நேரம் தேர்ந்தெடுக்க வேண்டாம். |  |  |
| `open.pause30` | 30 min | 30 நிமிடம் |  |  |
| `open.pause60` | 1 hour | 1 மணி நேரம் |  |  |
| `open.pauseToday` | Rest of today | இன்று மீதி நேரம் | Rest of TODAY, not all day. |  |
| `open.resume` | Resume now | இப்போதே திற |  |  |
| `open.hoursTitle` | Shop hours | கடை நேரம் |  |  |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | தினமும் திறக்கும், மூடும் நேரத்தை அமைக்கவும்; இரண்டையும் காலியாக விட்டால் நாள் முழுவதும் திறந்திருக்கும். மூடும் நேரம் திறக்கும் நேரத்துக்கு முன்பாக இருந்தால் நள்ளிரவைத் தாண்டியும் கடை திறந்திருக்கும் என்று பொருள். | Contains the past-midnight rule, which is easy to lose in translation. |  |
| `open.openTime` | Opens at | திறக்கும் நேரம் |  |  |
| `open.closeTime` | Closes at | மூடும் நேரம் |  |  |
| `open.timePlaceholder` | HH:MM | மணி:நிமிடம் | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| `open.alwaysOpen` | No daily hours set — open all day. | தினசரி நேரம் அமைக்கப்படவில்லை — நாள் முழுவதும் திறந்திருக்கும். |  |  |
| `open.saveHours` | Save hours | நேரத்தைச் சேமி |  |  |
| `open.clearHours` | Clear hours | நேரத்தை அழி |  |  |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | திறக்கும், மூடும் இரண்டு நேரத்தையும் கொடுங்கள், அல்லது இரண்டையும் அழியுங்கள். |  |  |
| `open.closuresTitle` | Holiday closures | விடுமுறை நாட்கள் |  |  |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | கடை மூடியிருக்கும் தேதிகளைச் சேருங்கள் — பண்டிகை, கல்யாணம், எதுவானாலும். ஆர்டர் செய்யும் முன்பே வாடிக்கையாளர்களுக்குத் தெரியும். |  |  |
| `open.closureDate` | Date (YYYY-MM-DD) | தேதி (YYYY-MM-DD) | The YYYY-MM-DD is the literal format the field wants; leave it in Latin. |  |
| `open.closureReason` | Reason (optional) | காரணம் (விருப்பம்) |  |  |
| `open.closureReasonPlaceholder` | Diwali | தீபாவளி |  |  |
| `open.addClosure` | Add date | தேதி சேர் |  |  |
| `open.noClosures` | No closures in the next 90 days. | அடுத்த 90 நாட்களில் விடுமுறை இல்லை. |  |  |
| `open.removeClosure` | Remove | அகற்று |  |  |
### 4. Routine chrome

Labels, buttons and empty states. Skim these; the risk is low.

| key | English | Tamil | what to check | ✓ / correction |
|---|---|---|---|---|
| `common.close` | Close | மூடு |  |  |
| `common.error` | Error | பிழை |  |  |
| `common.failed` | Failed | தோல்வி |  |  |
| `common.missing` | Missing | முழுமையில்லை | முழுமையில்லை — a coined-feeling compound. Suggest better if it reads oddly as a title. |  |
| `common.go` | Go | செல் |  |  |
| `common.keep` | Keep | இருக்கட்டும் | The "do nothing" half of a destructive confirm. |  |
| `common.retry` | Retry | மீண்டும் முயற்சி |  |  |
| `common.loadFailed` | Could not load. Check your connection and try again. | ஏற்ற முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும். |  |  |
| `title.addTransaction` | Add transaction | பரிவர்த்தனை சேர் |  |  |
| `login.subtitle` | Sign in to manage your shop | உங்கள் கடையை நடத்த உள்நுழையவும் |  |  |
| `login.failed` | Login failed | உள்நுழைவு தோல்வி |  |  |
| `admin.title` | Admin account | நிர்வாகக் கணக்கு |  |  |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | இந்த ஆப் கடை உரிமையாளர்களுக்கானது. பிளாட்ஃபார்மை நிர்வகிக்க வெப் அட்மின் கன்சோலைப் பயன்படுத்தவும். |  |  |
| `admin.signOut` | Sign out | வெளியேறு |  |  |
| `dash.newTransaction` | New transaction | புதிய பரிவர்த்தனை |  |  |
| `dash.viewCustomers` | View customers | வாடிக்கையாளர்களைப் பார் |  |  |
| `cust.empty` | No customers yet. | இதுவரை வாடிக்கையாளர் இல்லை. |  |  |
| `custd.notFound` | Customer not found. | வாடிக்கையாளர் கிடைக்கவில்லை. |  |  |
| `cat.adding` | Adding… | சேர்க்கிறது… |  |  |
| `cat.active` | Active | செயலில் |  |  |
| `cat.hidden` | Hidden | மறைக்கப்பட்டது |  |  |
| `cat.deleteTitle` | Delete product | தயாரிப்பை நீக்கு |  |  |
| `cat.missingName` | Enter a product name | தயாரிப்பின் பெயரை உள்ளிடவும் |  |  |
| `cat.myProducts` | My products | என் பொருட்கள் |  |  |
| `cat.searchCatalogue` | Search catalogue | பட்டியலில் தேடு |  |  |
| `cat.added` | Added | சேர்க்கப்பட்டது |  |  |
| `cat.noCatalogue` | No catalogue items found. | பட்டியலில் எதுவும் கிடைக்கவில்லை. |  |  |
| `fam.new` | New family | புதிய குடும்பம் |  |  |
| `fam.creating` | Creating… | உருவாக்குகிறது… |  |  |
| `fam.empty` | No families yet. | இதுவரை குடும்பம் இல்லை. |  |  |
| `fam.missingName` | Enter a family name | குடும்பப் பெயரை உள்ளிடவும் |  |  |
| `famd.notFound` | Family not found. | குடும்பம் கிடைக்கவில்லை. |  |  |
| `famd.noCandidates` | No other customers available to add. | சேர்க்க வேறு வாடிக்கையாளர் இல்லை. |  |  |
| `famd.removeTitle` | Remove member | உறுப்பினரை அகற்று |  |  |
| `famd.reminderTitle` | Reminder | நினைவூட்டல் |  |  |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV அறிக்கை ஏற்றுமதி வெப் டாஷ்போர்டில் கிடைக்கும். |  |  |
| `setn.silent` | Silent | அமைதி | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.smart` | Smart | ஸ்மார்ட் | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.active` | Active | செயலில் | One of three customer-notification modes: Silent / Smart / Active. |  |
| `set.savedTitle` | Saved | சேமிக்கப்பட்டது |  |  |
| `set.shopSaved` | Shop settings updated. | கடை அமைப்புகள் புதுப்பிக்கப்பட்டன. |  |  |
| `set.connOkTitle` | Connection OK | இணைப்பு சரி |  |  |
| `set.connFailedTitle` | Connection failed | இணைப்பு தோல்வி |  |  |
| `set.connOkMsg` | Your Razorpay keys work. | உங்கள் Razorpay கீகள் வேலை செய்கின்றன. |  |  |
| `set.connFailedMsg` | Check your keys. | உங்கள் கீகளைச் சரிபார்க்கவும். |  |  |
| `set.listShop` | List my shop for nearby customers | அருகிலுள்ள வாடிக்கையாளர்களுக்கு என் கடையைப் பட்டியலிடு |  |  |
| `set.discoverySaved` | Discovery settings updated. | கண்டுபிடிப்பு அமைப்புகள் புதுப்பிக்கப்பட்டன. |  |  |
| `set.signOut` | Sign out | வெளியேறு |  |  |
| `set.signOutConfirm` | Sign out of this account? | இந்தக் கணக்கிலிருந்து வெளியேறவா? |  |  |
| `more.familiesSub` | Group customers, shared credit & reminders | வாடிக்கையாளர்களைக் குழுவாக்கு, கூட்டுக் கடன் & நினைவூட்டல் |  |  |
| `more.insightsSub` | Analytics overview & aging | பகுப்பாய்வு சுருக்கம் & நிலுவை வயது |  |  |
| `more.settingsSub` | Shop, payments & discovery | கடை, பணம் & கண்டுபிடிப்பு |  |  |
| `more.moreFeatures` | More features | மேலும் வசதிகள் |  |  |
| `more.credits` | Khata Credits & Referral | கணக்கு கிரெடிட் & ரெஃபரல் | A feature name. "Khata Credits" is shop currency, not a bank credit. |  |
| `more.creditsSub` | Earn & spend credits, invite shops | கிரெடிட் சம்பாதி & செலவழி, கடைகளை அழை |  |  |
| `more.promote` | Boost & Branded Store | பூஸ்ட் & பிராண்டட் ஸ்டோர் | A feature name; kept close to the English the way Hindi does. |  |
| `more.promoteSub` | Promote your shop, premium storefront | உங்கள் கடையை விளம்பரப்படுத்து, பிரீமியம் ஸ்டோர் |  |  |
| `more.delivery` | Delivery Champions | டெலிவரி சாம்பியன்ஸ் | A feature name; kept close to the English the way Hindi does. |  |
| `more.deliverySub` | Assign deliveries & share status links | டெலிவரிகளை ஒப்படை & நிலை இணைப்புகளைப் பகிர் |  |  |
| `more.poster` | Share Poster | போஸ்டர் பகிர் |  |  |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | WhatsApp/IG/FB-க்கான கடை போஸ்டர் |  |  |

## Telugu (`te`) — 197 strings

### 1. Money, credit and the order

A wrong word here costs the shopkeeper money or a customer. Check every row.

| key | English | Telugu | what to check | ✓ / correction |
|---|---|---|---|---|
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | ఈ వినియోగదారు ఖాతా నుండి {amount} తగ్గుతుంది. | I used **ఖాతా** for the khata — the same word the block uses for an account. |  |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ఆన్‌లైన్‌లో చెల్లింపు అయిపోయింది — {amount} ఈ వినియోగదారు కోసం మీ దుకాణంలో జమగా ఉంటుంది. | I used **జమ** for credit standing at the shop. Check it is not read as a deposit in a bank. |  |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ఆర్డర్ ఇచ్చేటప్పుడు {amount} తక్కువ తీసుకోండి. | Means collect LESS at handover. If it can be read as "collect {amount}", it is wrong. |  |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ఆన్‌లైన్‌లో చెల్లించారు — ఆ మొత్తం ఈ వినియోగదారు కోసం మీ దుకాణంలో జమ అవుతుంది. డబ్బు వాపసు ఉండదు. | Same trap: credit at the shop, never a refund. Highest-stakes string in the file. |  |
| `oedit.reducedBy` | You are taking off {amount}. | మీరు {amount} తగ్గిస్తున్నారు. | The amount being taken OFF, not the new total. |  |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | దీనివల్ల ఆర్డర్ మీ ఉచిత డెలివరీ మొత్తం కంటే తగ్గితే, ఖాయం చేసేటప్పుడు డెలివరీ ఛార్జీ మళ్లీ లెక్కిస్తారు. | Conditional — the fee is recalculated only if the order drops below the free-delivery amount. Check the "if" survives. |  |
| `txn.adjustment` | Adjustment | సర్దుబాటు | A ledger row type, alongside purchase / cash / UPI. Must not collide with the words already used for those or for "settings". |  |
| `oedit.originalSubtotal` | Original subtotal | అసలు ఉప మొత్తం | The subtotal BEFORE the reduction. |  |
| `orej.reject` | Reject | తిరస్కరించు | I chose **తిరస్కరించు**, deliberately NOT రద్దు, because రద్దు is already ostatus.cancelled. Is తిరస్కరించు too formal for a counter? |  |
| `orej.confirm` | Reject order | ఆర్డర్ తిరస్కరించు | The button that actually rejects. Same reject/cancel distinction. |  |
| `orej.title` | Reject this order? | ఈ ఆర్డర్ తిరస్కరించాలా? | Same reject/cancel distinction. |  |
| `orej.done` | Order rejected. | ఆర్డర్ తిరస్కరించబడింది. | Same reject/cancel distinction. |  |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | వినియోగదారుకు కారణం చెప్పండి — రద్దు సమాచారంతో పాటు వారికి వెళ్తుంది. | The reason is sent to the customer. Check it reads as "we will pass this on", not "write it down for yourself". |  |
| `oalert.accept` | Accept | ఆమోదించు | I chose **ఆమోదించు** to match ఆమోదించబడింది already in this block, over the more spoken "తీసుకో". Tell me which a shopkeeper would tap. |  |
| `eta.accept` | Accept | ఆమోదించు | Same word as oalert.accept on purpose. If you change one, change both. |  |
| `eta.acceptTitle` | Accept this order | ఈ ఆర్డర్ ఆమోదించు | Same word as oalert.accept on purpose. |  |
| `eta.noTime` | Accept without a time | సమయం చెప్పకుండా ఆమోదించు |  |  |
| `eta.notNow` | Not now | ఇప్పుడు కాదు |  |  |
| `eta.accepting` | Accepting… | ఆమోదిస్తోంది… |  |  |
| `oedit.start` | Not everything in stock? | అన్ని సరుకులు లేవా? | The prompt that opens order-reduction. Spoken, informal — "not everything in stock?" |  |
| `oedit.startBtn` | Reduce this order | ఈ ఆర్డర్ తగ్గించు | REDUCE, not cancel and not edit. Nothing here can add or raise anything. |  |
| `oedit.title` | Reduce this order | ఈ ఆర్డర్ తగ్గించు | Same word as oedit.startBtn on purpose. |  |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | మీ దగ్గర లేనిది తీసేయండి. ఇక్కడ వస్తువులను తీసేయడం లేదా పరిమాణం తగ్గించడం మాత్రమే చేయగలరు — కొత్త వస్తువు జోడించడం, పరిమాణం పెంచడం లేదా ధర మార్చడం ఇక్కడ కుదరదు. | The safety rule: only remove or lower. If the sentence leaves any room for "you can also add", it is wrong. |  |
| `oedit.confirm` | Confirm the new order | కొత్త ఆర్డర్ ఖాయం చేయి | Commits the smaller order. |  |
| `oedit.keep` | Leave it as it was | ఉన్నట్టే ఉండనివ్వు | Backs out without changing anything. |  |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ఆర్డర్ తగ్గించబడింది. ఏమి మారిందో వినియోగదారుకు చెప్పాం. | Also states the customer has been told. Both halves matter. |  |
| `oedit.noChange` | Nothing has been changed yet. | ఇంకా ఏమీ మార్చలేదు. |  |  |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | మీరు అన్నీ తీసేశారు. బదులుగా ఆర్డర్‌నే రద్దు చేయండి. | Only shown when everything has been taken off. Points at CANCEL, a different action from reduce. |  |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | ఇప్పుడు ఆర్డర్ ఆమోదించి, ఎప్పటికి సిద్ధమవుతుందో వినియోగదారుకు చెప్పండి. | Two instructions in one line: accept, then promise a time. |  |
| `oedit.remove` | Remove | తీసివేయి | Take an item off this order — not "delete the product from my catalogue". |  |
| `oedit.restore` | Put back | తిరిగి పెట్టు | Put a removed item back. |  |
| `oedit.removedTag` | Removed | తీసివేయబడింది |  |  |
| `oedit.saving` | Saving… | సేవ్ అవుతోంది… |  |  |
| `oedit.was` | Was {was} | ముందు {was} | Renders next to the new quantity. {was} is the old one. |  |
| `oedit.wasNow` | Was {was} — now {now} | ముందు {was} — ఇప్పుడు {now} | Old quantity then new. Check the order of the two placeholders reads right. |  |
| `oedit.historyTitle` | What was taken off | ఏమి తీసేశారు |  |  |
| `oedit.historyRemoved` | {item} — removed | {item} — తీసివేయబడింది |  |  |
| `oedit.historyUnknownWho` | the shop | దుకాణం | Stands in for a person's name in "{who}, {when}" — it must read like an actor ("the shop"), not like a place. |  |
| `ord.notFound` | Order not found. | ఆర్డర్ కనిపించలేదు. |  |  |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | ఈ ఆర్డర్ రద్దు చేయాలా? దీన్ని తిరిగి పొందలేరు. | CANCEL, and it cannot be undone. Check the second sentence is not the same word as "cancel" doing double duty. |  |
| `orej.r1` | Out of stock | సరుకు లేదు | One-tap reason. Short and spoken. |  |
| `orej.r2` | Too busy right now | ఇప్పుడు చాలా రద్దీ | One-tap reason. Short and spoken. |  |
| `orej.r3` | Shop is closing | దుకాణం మూసేస్తున్నాం | One-tap reason. Short and spoken. |  |
| `orej.placeholder` | Another reason (optional) | వేరే కారణం (ఐచ్ఛికం) |  |  |
| `orej.back` | Back | వెనక్కి |  |  |
| `custd.recordAction` | Record payment / purchase | చెల్లింపు / కొనుగోలు నమోదు చేయి | Two things on one button: money coming IN and goods going OUT on credit. |  |
| `add.invalidAmount` | Enter a valid amount | సరైన మొత్తం నమోదు చేయండి | Money validation. |  |
| `addtx.missingBody` | Pick a customer and amount | వినియోగదారుని, మొత్తాన్ని ఎంచుకోండి | Money validation. |  |
| `addtx.selectedCustomer` | Selected customer | ఎంచుకున్న వినియోగదారు |  |  |
| `addtx.notePlaceholder` | note | గమనిక |  |  |
| `famd.combinedLimit` | Combined limit | మొత్తం పరిమితి | మొత్తం పరిమితి reuses మొత్తం, which this block also uses for "amount" and for famd.combinedOutstanding. Flag it if it is confusing. |  |
| `famd.subLimit` | sub-limit {amt} | ఉప-పరిమితి {amt} | A per-member cap inside a family limit. |  |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | WhatsApp రిమైండర్ పంపబడింది. మొత్తం బకాయి: {amt}. | Carries the combined outstanding. The number is real money. |  |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | పంపలేదు (చెల్లింపుదారు నోటిఫికేషన్లు ఆపి ఉండవచ్చు). మొత్తం బకాయి: {amt}. | Says it did NOT go out. If that reads as "sent", a shopkeeper stops chasing a real debt. |  |
| `famd.payerLabel` | Payer | చెల్లింపుదారు | The family member who settles the bill. |  |
| `famd.payerTag` | (payer) | (చెల్లింపుదారు) |  |  |
| `famd.notSet` | not set | సెట్ చేయలేదు |  |  |
| `ins.purchases` | Purchases | కొనుగోళ్లు | Goods sold on credit over the window — the same idea as txn.purchase, and I used the same word. |  |
| `ins.collections` | Collections | వసూళ్లు | వసూళ్లు was already in this block for dash.todayCollections and I kept it everywhere. |  |
| `ins.withDues` | With dues | బకాయి ఉన్నవారు | Customers who owe. |  |
| `ins.newCustomers` | New customers | కొత్త వినియోగదారులు |  |  |
| `ins.daysN` | {d} days | {d} రోజులు |  |  |
| `cat.editPrice` | Edit ₹ | ₹ మార్చు | A tight button; only the rupee sign and a verb fit. |  |
| `cat.editPriceTitle` | Edit price (₹) | ధర మార్చు (₹) |  |  |
| `cat.setPrice` | Set price (₹) | ధర పెట్టు (₹) |  |  |
| `cat.indicative` | Indicative | సుమారు | A catalogue price that is a guide, not the shop's own price. |  |
### 2. The new-order alert (some of it is read aloud)

`oalert.spoken` and the lines around it are spoken by text-to-speech in a noisy shop. Read them out loud, not just with your eyes.

| key | English | Telugu | what to check | ✓ / correction |
|---|---|---|---|---|
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | కొత్త ఆర్డర్. {name}. {n} వస్తువులు. {amount} రూపాయలు. | READ ALOUD by text-to-speech in a noisy shop. Say it out loud before approving: no abbreviations, no symbols, and it must survive a name dropping into {name}. |  |
| `oalert.title` | New order waiting | కొత్త ఆర్డర్ ఎదురు చూస్తోంది | Heard as a notification title on many devices. |  |
| `oalert.items` | {n} items | {n} వస్తువులు | Also read aloud as part of the alert. Plural form is fixed — {n} may be 1. |  |
| `oalert.more` | +{n} more | +{n} ఇంకా |  |  |
| `oalert.waiting` | waiting {mins} min | {mins} నిమిషాల నుండి ఎదురు చూస్తోంది |  |  |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | ఇంకా ఎదురు చూస్తోంది — మీరు దీనికి ఇంకా జవాబు ఇవ్వలేదు. | Nagging, not scolding. Check the tone. |  |
| `oalert.decide` | This keeps alerting until you accept or reject it. | మీరు ఆమోదించే వరకు లేదా తిరస్కరించే వరకు ఇది హెచ్చరిస్తూనే ఉంటుంది. | States the alert will not stop until accepted or rejected. Both verbs must be the ones used on the buttons. |  |
| `oalert.snooze` | Not now — {mins} min | ఇప్పుడు కాదు — {mins} నిమిషాలు | "Not now" — quiets ONE order briefly. Must not read as "reject". |  |
| `oalert.snoozedFor` | Quiet for {mins} more min | ఇంకా {mins} నిమిషాలు నిశ్శబ్దం | Must not read as "alerts are off". |  |
| `oalert.open` | Open | తెరువు |  |  |
| `oalert.mute30` | Mute for 30 minutes | 30 నిమిషాలు నిశ్శబ్దం |  |  |
| `oalert.unmute` | Turn alerts back on | అలర్ట్‌లు మళ్లీ ఆన్ చేయి |  |  |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | ఈ ఫోన్ ఇంకా మీ భాషలో మాట్లాడలేదు — బ్యానర్ మాత్రం కనిపిస్తుంది. | Says the phone cannot speak this language; the banner still shows. |  |
| `oalert.setTitle` | Order alerts | ఆర్డర్ అలర్ట్‌లు |  |  |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | కొత్త ఆర్డర్ వస్తే మీరు దాన్ని ఆమోదించే వరకు లేదా తిరస్కరించే వరకు ఇక్కడా WhatsAppలోనూ అలర్ట్ వస్తూనే ఉంటుంది. “ఇప్పుడు కాదు” ఒక ఆర్డర్‌ను కొన్ని నిమిషాలు మాత్రమే నిశ్శబ్దం చేస్తుంది; అలర్ట్‌ను ఆపదు. | The longest string in the batch and the one that explains the whole alert contract. Read it slowly. |  |
| `oalert.setEnabled` | Alert me about new orders | కొత్త ఆర్డర్ల గురించి నాకు అలర్ట్ ఇవ్వు |  |  |
| `oalert.setRepeat` | Repeat every (minutes) | ఎన్ని నిమిషాలకోసారి |  |  |
| `oalert.setMaxRepeats` | Stop after (repeats) | ఎన్నిసార్ల తర్వాత ఆపాలి |  |  |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 నిమిషాలు నిశ్శబ్దం |  |  |
| `oalert.setMuted` | Alerts are muted right now. | ఇప్పుడు అలర్ట్‌లు నిశ్శబ్దంగా ఉన్నాయి. |  |  |
| `oalert.setSaved` | Order alert settings saved. | ఆర్డర్ అలర్ట్ సెట్టింగ్‌లు సేవ్ అయ్యాయి. |  |  |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | మీరు ఇచ్చిన సంఖ్య దగ్గరి అనుమతించిన సంఖ్యకు మార్చబడింది. | The value the shopkeeper typed was changed for them. |  |
### 3. Ready-time promises and shop availability

Promises made to a customer, and whether the shop is open. Wrong here and a customer turns up to a shut shop.

| key | English | Telugu | what to check | ✓ / correction |
|---|---|---|---|---|
| `eta.pickTime` | Ready in about… | సుమారు ఎంతసేపట్లో సిద్ధం… | A question with a trailing ellipsis, answered by the chips below it. |  |
| `eta.chipMin` | ~{n} min | ~{n} నిమిషాలు |  |  |
| `eta.chipHour` | ~{n} hour | ~{n} గంట |  |  |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} గంట {m} నిమిషాలు | Two placeholders in one chip, very little room. |  |
| `eta.promisedBy` | You promised ready by {time} | {time}కల్లా సిద్ధం అని మీరు చెప్పారు | A promise already made to the customer. |  |
| `eta.noPromise` | No ready time promised | సిద్ధమయ్యే సమయం చెప్పలేదు |  |  |
| `eta.needMore` | Need more time | ఇంకా సమయం కావాలి |  |  |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | కొత్త సమయం ఎంచుకోండి — వినియోగదారుకు వెంటనే చెప్తాం. |  |  |
| `eta.sent` | The customer has been told the new time. | వినియోగదారుకు కొత్త సమయం చెప్పాం. |  |  |
| `eta.late` | Past the time you promised | మీరు చెప్పిన సమయం దాటిపోయింది | The promise has been missed. Factual, not accusing. |  |
| `eta.readyBy` | Ready by {time} | {time}కల్లా సిద్ధం |  |  |
| `eta.takingLonger` | Taking a little longer | కొంచెం ఎక్కువ సమయం పడుతోంది |  |  |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}కల్లా అవ్వాల్సింది. ఇంక ఎక్కువ ఆలస్యం కాదు. | Reassurance after a missed promise. |  |
| `open.open` | Open | తెరిచి ఉంది |  |  |
| `open.closed` | Closed | మూసి ఉంది |  |  |
| `open.todayAt` | at {time} | {time}కి |  |  |
| `open.tomorrowAt` | tomorrow at {time} | రేపు {time}కి |  |  |
| `open.title` | Shop availability | దుకాణం తెరిచి ఉందా |  |  |
| `open.switchLabel` | Shop is open | దుకాణం తెరిచి ఉంది |  |  |
| `open.takingOrders` | You are taking orders right now. | మీరు ఇప్పుడు ఆర్డర్లు తీసుకుంటున్నారు. |  |  |
| `open.notTakingOrders` | Customers cannot order right now. | వినియోగదారులు ఇప్పుడు ఆర్డర్ చేయలేరు. |  |  |
| `open.stateClosed` | Closed — you switched the shop off | మూసి ఉంది — మీరు దుకాణాన్ని ఆపి ఉంచారు |  |  |
| `open.statePaused` | Paused — back {when} | కాసేపు ఆపారు — {when} తిరిగి | {when} is a time. Check the sentence still parses when a time drops in. |  |
| `open.stateHoliday` | Closed today — reopens {when} | ఈరోజు మూసి ఉంది — {when} మళ్లీ తెరుస్తారు |  |  |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ఈరోజు మూసి ఉంది ({reason}) — {when} మళ్లీ తెరుస్తారు |  |  |
| `open.stateHours` | Closed — opens {when} | మూసి ఉంది — {when} తెరుస్తారు |  |  |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | కాసేపు మూయాలా? ఒకే టాప్, సమయం ఎంచుకోవాల్సిన పని లేదు. |  |  |
| `open.pause30` | 30 min | 30 నిమిషాలు |  |  |
| `open.pause60` | 1 hour | 1 గంట |  |  |
| `open.pauseToday` | Rest of today | ఈరోజు మిగిలిన సమయం | Rest of TODAY, not all day. |  |
| `open.resume` | Resume now | ఇప్పుడే తెరువు |  |  |
| `open.hoursTitle` | Shop hours | దుకాణం సమయం |  |  |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | రోజూ తెరిచే, మూసే సమయం పెట్టండి; రెండూ ఖాళీగా వదిలితే రోజంతా తెరిచే ఉంటుంది. మూసే సమయం తెరిచే సమయం కంటే ముందు పెడితే అర్ధరాత్రి దాటాక కూడా దుకాణం తెరిచి ఉంటుందని అర్థం. | Contains the past-midnight rule, which is easy to lose in translation. |  |
| `open.openTime` | Opens at | తెరిచే సమయం |  |  |
| `open.closeTime` | Closes at | మూసే సమయం |  |  |
| `open.timePlaceholder` | HH:MM | గంట:నిమిషం | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| `open.alwaysOpen` | No daily hours set — open all day. | రోజువారీ సమయం పెట్టలేదు — రోజంతా తెరిచే ఉంటుంది. |  |  |
| `open.saveHours` | Save hours | సమయం సేవ్ చేయి |  |  |
| `open.clearHours` | Clear hours | సమయం తీసేయి |  |  |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | తెరిచే, మూసే రెండు సమయాలూ పెట్టండి, లేదా రెండూ తీసేయండి. |  |  |
| `open.closuresTitle` | Holiday closures | సెలవు రోజులు |  |  |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | దుకాణం మూసి ఉండే తేదీలు జోడించండి — పండగ, పెళ్లి, ఏదైనా. వినియోగదారులు ఆర్డర్ చేసే ముందే చూస్తారు. |  |  |
| `open.closureDate` | Date (YYYY-MM-DD) | తేదీ (YYYY-MM-DD) | The YYYY-MM-DD is the literal format the field wants; leave it in Latin. |  |
| `open.closureReason` | Reason (optional) | కారణం (ఐచ్ఛికం) |  |  |
| `open.closureReasonPlaceholder` | Diwali | దీపావళి |  |  |
| `open.addClosure` | Add date | తేదీ జోడించు |  |  |
| `open.noClosures` | No closures in the next 90 days. | రాబోయే 90 రోజుల్లో సెలవులు లేవు. |  |  |
| `open.removeClosure` | Remove | తీసివేయి |  |  |
### 4. Routine chrome

Labels, buttons and empty states. Skim these; the risk is low.

| key | English | Telugu | what to check | ✓ / correction |
|---|---|---|---|---|
| `common.close` | Close | మూసివేయి |  |  |
| `common.error` | Error | లోపం |  |  |
| `common.failed` | Failed | విఫలమైంది |  |  |
| `common.missing` | Missing | అసంపూర్ణం | Alert title shown when a required field is empty. |  |
| `common.go` | Go | వెళ్లు |  |  |
| `common.keep` | Keep | అలాగే ఉంచు | The "do nothing" half of a destructive confirm. |  |
| `common.retry` | Retry | మళ్లీ ప్రయత్నించు |  |  |
| `common.loadFailed` | Could not load. Check your connection and try again. | లోడ్ కాలేదు. మీ కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి. |  |  |
| `title.addTransaction` | Add transaction | లావాదేవీ జోడించు |  |  |
| `login.subtitle` | Sign in to manage your shop | మీ దుకాణం నడపడానికి సైన్ ఇన్ చేయండి |  |  |
| `login.failed` | Login failed | సైన్ ఇన్ విఫలమైంది |  |  |
| `admin.title` | Admin account | అడ్మిన్ ఖాతా |  |  |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | ఈ యాప్ దుకాణ యజమానుల కోసం. ప్లాట్‌ఫామ్‌ను నిర్వహించడానికి వెబ్ అడ్మిన్ కన్సోల్ వాడండి. |  |  |
| `admin.signOut` | Sign out | సైన్ అవుట్ |  |  |
| `dash.newTransaction` | New transaction | కొత్త లావాదేవీ |  |  |
| `dash.viewCustomers` | View customers | వినియోగదారులను చూడు |  |  |
| `cust.empty` | No customers yet. | ఇంకా వినియోగదారులు లేరు. |  |  |
| `custd.notFound` | Customer not found. | వినియోగదారు కనిపించలేదు. |  |  |
| `cat.adding` | Adding… | జోడిస్తోంది… |  |  |
| `cat.active` | Active | యాక్టివ్ |  |  |
| `cat.hidden` | Hidden | దాచినది |  |  |
| `cat.deleteTitle` | Delete product | ఉత్పత్తిని తొలగించు |  |  |
| `cat.missingName` | Enter a product name | ఉత్పత్తి పేరు నమోదు చేయండి |  |  |
| `cat.myProducts` | My products | నా ఉత్పత్తులు |  |  |
| `cat.searchCatalogue` | Search catalogue | కేటలాగ్‌లో వెతుకు |  |  |
| `cat.added` | Added | జోడించబడింది |  |  |
| `cat.noCatalogue` | No catalogue items found. | కేటలాగ్‌లో ఏమీ దొరకలేదు. |  |  |
| `fam.new` | New family | కొత్త కుటుంబం |  |  |
| `fam.creating` | Creating… | సృష్టిస్తోంది… |  |  |
| `fam.empty` | No families yet. | ఇంకా కుటుంబాలు లేవు. |  |  |
| `fam.missingName` | Enter a family name | కుటుంబ పేరు నమోదు చేయండి |  |  |
| `famd.notFound` | Family not found. | కుటుంబం కనిపించలేదు. |  |  |
| `famd.noCandidates` | No other customers available to add. | జోడించడానికి వేరే వినియోగదారులు లేరు. |  |  |
| `famd.removeTitle` | Remove member | సభ్యుడిని తీసివేయి |  |  |
| `famd.reminderTitle` | Reminder | రిమైండర్ |  |  |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV రిపోర్ట్ ఎక్స్‌పోర్ట్ వెబ్ డాష్‌బోర్డ్‌లో ఉంది. |  |  |
| `setn.silent` | Silent | సైలెంట్ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.smart` | Smart | స్మార్ట్ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.active` | Active | యాక్టివ్ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `set.savedTitle` | Saved | సేవ్ అయింది |  |  |
| `set.shopSaved` | Shop settings updated. | దుకాణం సెట్టింగ్‌లు అప్‌డేట్ అయ్యాయి. |  |  |
| `set.connOkTitle` | Connection OK | కనెక్షన్ సరిగ్గా ఉంది |  |  |
| `set.connFailedTitle` | Connection failed | కనెక్షన్ విఫలమైంది |  |  |
| `set.connOkMsg` | Your Razorpay keys work. | మీ Razorpay కీలు పని చేస్తున్నాయి. |  |  |
| `set.connFailedMsg` | Check your keys. | మీ కీలను చూడండి. |  |  |
| `set.listShop` | List my shop for nearby customers | దగ్గరి వినియోగదారుల కోసం నా దుకాణాన్ని జాబితా చేయి |  |  |
| `set.discoverySaved` | Discovery settings updated. | డిస్కవరీ సెట్టింగ్‌లు అప్‌డేట్ అయ్యాయి. |  |  |
| `set.signOut` | Sign out | సైన్ అవుట్ |  |  |
| `set.signOutConfirm` | Sign out of this account? | ఈ ఖాతా నుండి సైన్ అవుట్ చేయాలా? |  |  |
| `more.familiesSub` | Group customers, shared credit & reminders | వినియోగదారులను గుంపుగా చేయి, ఉమ్మడి అప్పు & రిమైండర్లు |  |  |
| `more.insightsSub` | Analytics overview & aging | విశ్లేషణ సారాంశం & బకాయి వయసు |  |  |
| `more.settingsSub` | Shop, payments & discovery | దుకాణం, చెల్లింపులు & డిస్కవరీ |  |  |
| `more.moreFeatures` | More features | మరిన్ని సౌకర్యాలు |  |  |
| `more.credits` | Khata Credits & Referral | ఖాతా క్రెడిట్స్ & రెఫరల్ | A feature name. "Khata Credits" is shop currency, not a bank credit. |  |
| `more.creditsSub` | Earn & spend credits, invite shops | క్రెడిట్స్ సంపాదించు & ఖర్చు చేయి, దుకాణాలను ఆహ్వానించు |  |  |
| `more.promote` | Boost & Branded Store | బూస్ట్ & బ్రాండెడ్ స్టోర్ | A feature name; kept close to the English the way Hindi does. |  |
| `more.promoteSub` | Promote your shop, premium storefront | మీ దుకాణాన్ని ప్రచారం చేయి, ప్రీమియం స్టోర్ |  |  |
| `more.delivery` | Delivery Champions | డెలివరీ ఛాంపియన్స్ | A feature name; kept close to the English the way Hindi does. |  |
| `more.deliverySub` | Assign deliveries & share status links | డెలివరీలు అప్పగించు & స్టేటస్ లింక్‌లు పంచు |  |  |
| `more.poster` | Share Poster | పోస్టర్ పంచు |  |  |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | WhatsApp/IG/FB కోసం దుకాణం పోస్టర్ |  |  |

## Kannada (`kn`) — 197 strings

### 1. Money, credit and the order

A wrong word here costs the shopkeeper money or a customer. Check every row.

| key | English | Kannada | what to check | ✓ / correction |
|---|---|---|---|---|
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | ಈ ಗ್ರಾಹಕರ ಖಾತೆಯಿಂದ {amount} ಕಡಿಮೆಯಾಗುತ್ತದೆ. | I used **ಖಾತೆ** for the khata. |  |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಯಾಗಿದೆ — {amount} ಈ ಗ್ರಾಹಕರಿಗಾಗಿ ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಜಮೆ ಇರುತ್ತದೆ. | I used **ಜಮೆ** for credit standing at the shop. |  |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ಆರ್ಡರ್ ಕೊಡುವಾಗ {amount} ಕಡಿಮೆ ತೆಗೆದುಕೊಳ್ಳಿ. | Means collect LESS at handover. If it can be read as "collect {amount}", it is wrong. |  |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಯಾಗಿದೆ — ಆ ಮೊತ್ತ ಈ ಗ್ರಾಹಕರಿಗಾಗಿ ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಜಮೆ ಆಗುತ್ತದೆ. ಹಣ ವಾಪಸ್ ಸಿಗುವುದಿಲ್ಲ. | Same trap: credit at the shop, never a refund. Highest-stakes string in the file. |  |
| `oedit.reducedBy` | You are taking off {amount}. | ನೀವು {amount} ಕಡಿಮೆ ಮಾಡುತ್ತಿದ್ದೀರಿ. | The amount being taken OFF, not the new total. |  |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | ಇದರಿಂದ ಆರ್ಡರ್ ನಿಮ್ಮ ಉಚಿತ ಡೆಲಿವರಿ ಮೊತ್ತಕ್ಕಿಂತ ಕಡಿಮೆಯಾದರೆ, ಖಚಿತಪಡಿಸುವಾಗ ಡೆಲಿವರಿ ಶುಲ್ಕ ಮತ್ತೆ ಲೆಕ್ಕ ಹಾಕಲಾಗುತ್ತದೆ. | Conditional — the fee is recalculated only if the order drops below the free-delivery amount. Check the "if" survives. |  |
| `txn.adjustment` | Adjustment | ಹೊಂದಾಣಿಕೆ | A ledger row type, alongside purchase / cash / UPI. Must not collide with the words already used for those or for "settings". |  |
| `oedit.originalSubtotal` | Original subtotal | ಮೂಲ ಉಪ ಮೊತ್ತ | The subtotal BEFORE the reduction. |  |
| `orej.reject` | Reject | ತಿರಸ್ಕರಿಸಿ | I chose **ತಿರಸ್ಕರಿಸಿ**, deliberately NOT ರದ್ದುಮಾಡಿ, because ರದ್ದು is already ostatus.cancelled. The app treats reject and cancel as different actions. |  |
| `orej.confirm` | Reject order | ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಿ | The button that actually rejects. Same reject/cancel distinction. |  |
| `orej.title` | Reject this order? | ಈ ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸುವುದೇ? | Same reject/cancel distinction. |  |
| `orej.done` | Order rejected. | ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. | Same reject/cancel distinction. |  |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | ಗ್ರಾಹಕರಿಗೆ ಕಾರಣ ಹೇಳಿ — ರದ್ದತಿಯ ಸಂದೇಶದ ಜೊತೆ ಅವರಿಗೆ ಹೋಗುತ್ತದೆ. | The reason is sent to the customer. Check it reads as "we will pass this on", not "write it down for yourself". |  |
| `oalert.accept` | Accept | ಸ್ವೀಕರಿಸಿ | I chose **ಸ್ವೀಕರಿಸಿ** to match ಸ್ವೀಕರಿಸಲಾಗಿದೆ already in this block. |  |
| `eta.accept` | Accept | ಸ್ವೀಕರಿಸಿ | Same word as oalert.accept on purpose. If you change one, change both. |  |
| `eta.acceptTitle` | Accept this order | ಈ ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಿ | Same word as oalert.accept on purpose. |  |
| `eta.noTime` | Accept without a time | ಸಮಯ ಹೇಳದೆ ಸ್ವೀಕರಿಸಿ |  |  |
| `eta.notNow` | Not now | ಈಗ ಬೇಡ |  |  |
| `eta.accepting` | Accepting… | ಸ್ವೀಕರಿಸಲಾಗುತ್ತಿದೆ… |  |  |
| `oedit.start` | Not everything in stock? | ಎಲ್ಲಾ ಸಾಮಾನು ಇಲ್ಲವೇ? | The prompt that opens order-reduction. Spoken, informal — "not everything in stock?" |  |
| `oedit.startBtn` | Reduce this order | ಈ ಆರ್ಡರ್ ಕಡಿಮೆ ಮಾಡಿ | REDUCE, not cancel and not edit. Nothing here can add or raise anything. |  |
| `oedit.title` | Reduce this order | ಈ ಆರ್ಡರ್ ಕಡಿಮೆ ಮಾಡಿ | Same word as oedit.startBtn on purpose. |  |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | ನಿಮ್ಮ ಬಳಿ ಇಲ್ಲದ್ದನ್ನು ತೆಗೆದುಬಿಡಿ. ಇಲ್ಲಿ ವಸ್ತುಗಳನ್ನು ತೆಗೆಯಲು ಅಥವಾ ಪ್ರಮಾಣ ಕಡಿಮೆ ಮಾಡಲು ಮಾತ್ರ ಸಾಧ್ಯ — ಹೊಸ ವಸ್ತು ಸೇರಿಸಲು, ಪ್ರಮಾಣ ಹೆಚ್ಚಿಸಲು ಅಥವಾ ಬೆಲೆ ಬದಲಿಸಲು ಇಲ್ಲಿ ಆಗುವುದಿಲ್ಲ. | The safety rule: only remove or lower. If the sentence leaves any room for "you can also add", it is wrong. |  |
| `oedit.confirm` | Confirm the new order | ಹೊಸ ಆರ್ಡರ್ ಖಚಿತಪಡಿಸಿ | Commits the smaller order. |  |
| `oedit.keep` | Leave it as it was | ಇದ್ದ ಹಾಗೇ ಇರಲಿ | Backs out without changing anything. |  |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ಆರ್ಡರ್ ಕಡಿಮೆ ಮಾಡಲಾಗಿದೆ. ಏನು ಬದಲಾಯಿತು ಎಂದು ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ. | Also states the customer has been told. Both halves matter. |  |
| `oedit.noChange` | Nothing has been changed yet. | ಇನ್ನೂ ಏನೂ ಬದಲಾಗಿಲ್ಲ. |  |  |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | ನೀವು ಎಲ್ಲವನ್ನೂ ತೆಗೆದುಬಿಟ್ಟಿದ್ದೀರಿ. ಬದಲಿಗೆ ಆರ್ಡರ್‌ನ್ನೇ ರದ್ದುಮಾಡಿ. | Only shown when everything has been taken off. Points at CANCEL, a different action from reduce. |  |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | ಈಗ ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಿ ಮತ್ತು ಯಾವಾಗ ಸಿದ್ಧವಾಗುತ್ತದೆ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ಹೇಳಿ. | Two instructions in one line: accept, then promise a time. |  |
| `oedit.remove` | Remove | ತೆಗೆ | Take an item off this order — not "delete the product from my catalogue". |  |
| `oedit.restore` | Put back | ವಾಪಸ್ ಹಾಕಿ | Put a removed item back. |  |
| `oedit.removedTag` | Removed | ತೆಗೆಯಲಾಗಿದೆ |  |  |
| `oedit.saving` | Saving… | ಉಳಿಸಲಾಗುತ್ತಿದೆ… |  |  |
| `oedit.was` | Was {was} | ಮೊದಲು {was} | Renders next to the new quantity. {was} is the old one. |  |
| `oedit.wasNow` | Was {was} — now {now} | ಮೊದಲು {was} — ಈಗ {now} | Old quantity then new. Check the order of the two placeholders reads right. |  |
| `oedit.historyTitle` | What was taken off | ಏನು ತೆಗೆಯಲಾಯಿತು |  |  |
| `oedit.historyRemoved` | {item} — removed | {item} — ತೆಗೆಯಲಾಗಿದೆ |  |  |
| `oedit.historyUnknownWho` | the shop | ಅಂಗಡಿ | Stands in for a person's name in "{who}, {when}" — it must read like an actor ("the shop"), not like a place. |  |
| `ord.notFound` | Order not found. | ಆರ್ಡರ್ ಸಿಗಲಿಲ್ಲ. |  |  |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | ಈ ಆರ್ಡರ್ ರದ್ದುಮಾಡುವುದೇ? ಇದನ್ನು ಮತ್ತೆ ಹಿಂದಕ್ಕೆ ತರಲಾಗದು. | I did NOT reuse the block's existing "cannot be undone" wording (ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗದು) here, because in a sentence about cancelling it reads as "this cannot be cancelled". I wrote ಇದನ್ನು ಮತ್ತೆ ಹಿಂದಕ್ಕೆ ತರಲಾಗದು instead. Tell me if cat.deleteConfirm should be changed to match. |  |
| `orej.r1` | Out of stock | ಸಾಮಾನು ಇಲ್ಲ | One-tap reason. Short and spoken. |  |
| `orej.r2` | Too busy right now | ಈಗ ತುಂಬಾ ಒತ್ತಡ | One-tap reason. Short and spoken. |  |
| `orej.r3` | Shop is closing | ಅಂಗಡಿ ಮುಚ್ಚುತ್ತಿದೆ | One-tap reason. Short and spoken. |  |
| `orej.placeholder` | Another reason (optional) | ಬೇರೆ ಕಾರಣ (ಐಚ್ಛಿಕ) |  |  |
| `orej.back` | Back | ಹಿಂದೆ |  |  |
| `custd.recordAction` | Record payment / purchase | ಪಾವತಿ / ಖರೀದಿ ದಾಖಲಿಸಿ | Two things on one button: money coming IN and goods going OUT on credit. |  |
| `add.invalidAmount` | Enter a valid amount | ಸರಿಯಾದ ಮೊತ್ತ ಹಾಕಿ | Money validation. |  |
| `addtx.missingBody` | Pick a customer and amount | ಗ್ರಾಹಕ ಮತ್ತು ಮೊತ್ತ ಆರಿಸಿ | Money validation. |  |
| `addtx.selectedCustomer` | Selected customer | ಆರಿಸಿದ ಗ್ರಾಹಕ |  |  |
| `addtx.notePlaceholder` | note | ಟಿಪ್ಪಣಿ |  |  |
| `famd.combinedLimit` | Combined limit | ಒಟ್ಟುಗೂಡಿದ ಮಿತಿ | The whole family's cap. |  |
| `famd.subLimit` | sub-limit {amt} | ಉಪ-ಮಿತಿ {amt} | A per-member cap inside a family limit. |  |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | WhatsApp ನೆನಪಿಸುವಿಕೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಒಟ್ಟುಗೂಡಿದ ಬಾಕಿ: {amt}. | Carries the combined outstanding. The number is real money. |  |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | ಕಳುಹಿಸಲಾಗಿಲ್ಲ (ಪಾವತಿದಾರ ಅಧಿಸೂಚನೆ ಆಫ್ ಮಾಡಿರಬಹುದು). ಒಟ್ಟುಗೂಡಿದ ಬಾಕಿ: {amt}. | Says it did NOT go out. If that reads as "sent", a shopkeeper stops chasing a real debt. |  |
| `famd.payerLabel` | Payer | ಪಾವತಿದಾರ | The family member who settles the bill. |  |
| `famd.payerTag` | (payer) | (ಪಾವತಿದಾರ) |  |  |
| `famd.notSet` | not set | ಹೊಂದಿಸಿಲ್ಲ |  |  |
| `ins.purchases` | Purchases | ಖರೀದಿಗಳು | Goods sold on credit over the window — the same idea as txn.purchase, and I used the same word. |  |
| `ins.collections` | Collections | ವಸೂಲಿ | ವಸೂಲಿ was already in this block for dash.todayCollections and I kept it everywhere. |  |
| `ins.withDues` | With dues | ಬಾಕಿ ಇರುವವರು | Customers who owe. |  |
| `ins.newCustomers` | New customers | ಹೊಸ ಗ್ರಾಹಕರು |  |  |
| `ins.daysN` | {d} days | {d} ದಿನಗಳು |  |  |
| `cat.editPrice` | Edit ₹ | ₹ ಬದಲಿಸಿ | A tight button; only the rupee sign and a verb fit. |  |
| `cat.editPriceTitle` | Edit price (₹) | ಬೆಲೆ ಬದಲಿಸಿ (₹) |  |  |
| `cat.setPrice` | Set price (₹) | ಬೆಲೆ ಹಾಕಿ (₹) |  |  |
| `cat.indicative` | Indicative | ಅಂದಾಜು | A catalogue price that is a guide, not the shop's own price. |  |
### 2. The new-order alert (some of it is read aloud)

`oalert.spoken` and the lines around it are spoken by text-to-speech in a noisy shop. Read them out loud, not just with your eyes.

| key | English | Kannada | what to check | ✓ / correction |
|---|---|---|---|---|
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | ಹೊಸ ಆರ್ಡರ್. {name}. {n} ವಸ್ತುಗಳು. {amount} ರೂಪಾಯಿ. | READ ALOUD by text-to-speech in a noisy shop. Say it out loud before approving: no abbreviations, no symbols, and it must survive a name dropping into {name}. |  |
| `oalert.title` | New order waiting | ಹೊಸ ಆರ್ಡರ್ ಕಾಯುತ್ತಿದೆ | Heard as a notification title on many devices. |  |
| `oalert.items` | {n} items | {n} ವಸ್ತುಗಳು | Also read aloud as part of the alert. Plural form is fixed — {n} may be 1. |  |
| `oalert.more` | +{n} more | +{n} ಇನ್ನಷ್ಟು |  |  |
| `oalert.waiting` | waiting {mins} min | {mins} ನಿಮಿಷದಿಂದ ಕಾಯುತ್ತಿದೆ |  |  |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | ಇನ್ನೂ ಕಾಯುತ್ತಿದೆ — ನೀವು ಇದಕ್ಕೆ ಇನ್ನೂ ಉತ್ತರಿಸಿಲ್ಲ. | Nagging, not scolding. Check the tone. |  |
| `oalert.decide` | This keeps alerting until you accept or reject it. | ನೀವು ಸ್ವೀಕರಿಸುವ ಅಥವಾ ತಿರಸ್ಕರಿಸುವ ತನಕ ಇದು ಎಚ್ಚರಿಸುತ್ತಲೇ ಇರುತ್ತದೆ. | States the alert will not stop until accepted or rejected. Both verbs must be the ones used on the buttons. |  |
| `oalert.snooze` | Not now — {mins} min | ಈಗ ಬೇಡ — {mins} ನಿಮಿಷ | "Not now" — quiets ONE order briefly. Must not read as "reject". |  |
| `oalert.snoozedFor` | Quiet for {mins} more min | ಇನ್ನೂ {mins} ನಿಮಿಷ ಸುಮ್ಮನೆ | Must not read as "alerts are off". |  |
| `oalert.open` | Open | ತೆರೆಯಿರಿ |  |  |
| `oalert.mute30` | Mute for 30 minutes | 30 ನಿಮಿಷ ಸುಮ್ಮನಿರಿಸಿ |  |  |
| `oalert.unmute` | Turn alerts back on | ಎಚ್ಚರಿಕೆ ಮತ್ತೆ ಚಾಲೂ ಮಾಡಿ |  |  |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | ಈ ಫೋನ್ ಇನ್ನೂ ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಮಾತನಾಡಲಾರದು — ಬ್ಯಾನರ್ ಮಾತ್ರ ಕಾಣುತ್ತದೆ. | Says the phone cannot speak this language; the banner still shows. |  |
| `oalert.setTitle` | Order alerts | ಆರ್ಡರ್ ಎಚ್ಚರಿಕೆ |  |  |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | ಹೊಸ ಆರ್ಡರ್ ಬಂದರೆ ನೀವು ಅದನ್ನು ಸ್ವೀಕರಿಸುವ ಅಥವಾ ತಿರಸ್ಕರಿಸುವ ತನಕ ಇಲ್ಲಿಯೂ WhatsApp ನಲ್ಲಿಯೂ ಎಚ್ಚರಿಕೆ ಬರುತ್ತಲೇ ಇರುತ್ತದೆ. “ಈಗ ಬೇಡ” ಒಂದು ಆರ್ಡರ್‌ನ್ನು ಕೆಲವು ನಿಮಿಷ ಮಾತ್ರ ಸುಮ್ಮನಿರಿಸುತ್ತದೆ; ಎಚ್ಚರಿಕೆಯನ್ನು ನಿಲ್ಲಿಸುವುದಿಲ್ಲ. | The longest string in the batch and the one that explains the whole alert contract. Read it slowly. |  |
| `oalert.setEnabled` | Alert me about new orders | ಹೊಸ ಆರ್ಡರ್ ಬಗ್ಗೆ ನನಗೆ ತಿಳಿಸಿ |  |  |
| `oalert.setRepeat` | Repeat every (minutes) | ಎಷ್ಟು ನಿಮಿಷಕ್ಕೊಮ್ಮೆ |  |  |
| `oalert.setMaxRepeats` | Stop after (repeats) | ಎಷ್ಟು ಸಲದ ನಂತರ ನಿಲ್ಲಿಸಬೇಕು |  |  |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 ನಿಮಿಷ ಸುಮ್ಮನಿರಿಸಿ |  |  |
| `oalert.setMuted` | Alerts are muted right now. | ಈಗ ಎಚ್ಚರಿಕೆ ಸುಮ್ಮನಿದೆ. |  |  |
| `oalert.setSaved` | Order alert settings saved. | ಆರ್ಡರ್ ಎಚ್ಚರಿಕೆ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಉಳಿಸಲಾಗಿವೆ. |  |  |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | ನೀವು ಕೊಟ್ಟ ಸಂಖ್ಯೆಯನ್ನು ಹತ್ತಿರದ ಅನುಮತಿಸಿದ ಸಂಖ್ಯೆಗೆ ಬದಲಾಯಿಸಲಾಗಿದೆ. | The value the shopkeeper typed was changed for them. |  |
### 3. Ready-time promises and shop availability

Promises made to a customer, and whether the shop is open. Wrong here and a customer turns up to a shut shop.

| key | English | Kannada | what to check | ✓ / correction |
|---|---|---|---|---|
| `eta.pickTime` | Ready in about… | ಸುಮಾರು ಎಷ್ಟು ಹೊತ್ತಿಗೆ ಸಿದ್ಧ… | A question with a trailing ellipsis, answered by the chips below it. |  |
| `eta.chipMin` | ~{n} min | ~{n} ನಿಮಿಷ |  |  |
| `eta.chipHour` | ~{n} hour | ~{n} ಗಂಟೆ |  |  |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} ಗಂಟೆ {m} ನಿಮಿಷ | Two placeholders in one chip, very little room. |  |
| `eta.promisedBy` | You promised ready by {time} | {time} ಒಳಗೆ ಸಿದ್ಧ ಎಂದು ನೀವು ಹೇಳಿದ್ದೀರಿ | A promise already made to the customer. |  |
| `eta.noPromise` | No ready time promised | ಸಿದ್ಧವಾಗುವ ಸಮಯ ಹೇಳಿಲ್ಲ |  |  |
| `eta.needMore` | Need more time | ಇನ್ನೂ ಸಮಯ ಬೇಕು |  |  |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | ಹೊಸ ಸಮಯ ಆರಿಸಿ — ಗ್ರಾಹಕರಿಗೆ ತಕ್ಷಣ ತಿಳಿಸಲಾಗುತ್ತದೆ. |  |  |
| `eta.sent` | The customer has been told the new time. | ಗ್ರಾಹಕರಿಗೆ ಹೊಸ ಸಮಯ ತಿಳಿಸಲಾಗಿದೆ. |  |  |
| `eta.late` | Past the time you promised | ನೀವು ಹೇಳಿದ ಸಮಯ ಮೀರಿದೆ | The promise has been missed. Factual, not accusing. |  |
| `eta.readyBy` | Ready by {time} | {time} ಒಳಗೆ ಸಿದ್ಧ |  |  |
| `eta.takingLonger` | Taking a little longer | ಸ್ವಲ್ಪ ಹೆಚ್ಚು ಸಮಯ ಆಗುತ್ತಿದೆ |  |  |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} ಒಳಗೆ ಆಗಬೇಕಿತ್ತು. ಇನ್ನು ಹೆಚ್ಚು ತಡವಾಗುವುದಿಲ್ಲ. | Reassurance after a missed promise. |  |
| `open.open` | Open | ತೆರೆದಿದೆ |  |  |
| `open.closed` | Closed | ಮುಚ್ಚಿದೆ |  |  |
| `open.todayAt` | at {time} | {time} ಕ್ಕೆ |  |  |
| `open.tomorrowAt` | tomorrow at {time} | ನಾಳೆ {time} ಕ್ಕೆ |  |  |
| `open.title` | Shop availability | ಅಂಗಡಿ ತೆರೆದಿದೆಯೇ |  |  |
| `open.switchLabel` | Shop is open | ಅಂಗಡಿ ತೆರೆದಿದೆ |  |  |
| `open.takingOrders` | You are taking orders right now. | ನೀವು ಈಗ ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೀರಿ. |  |  |
| `open.notTakingOrders` | Customers cannot order right now. | ಗ್ರಾಹಕರು ಈಗ ಆರ್ಡರ್ ಮಾಡಲಾಗದು. |  |  |
| `open.stateClosed` | Closed — you switched the shop off | ಮುಚ್ಚಿದೆ — ನೀವು ಅಂಗಡಿಯನ್ನು ಆಫ್ ಮಾಡಿದ್ದೀರಿ |  |  |
| `open.statePaused` | Paused — back {when} | ಸ್ವಲ್ಪ ಹೊತ್ತು ನಿಲ್ಲಿಸಲಾಗಿದೆ — {when} ವಾಪಸ್ | {when} is a time. Check the sentence still parses when a time drops in. |  |
| `open.stateHoliday` | Closed today — reopens {when} | ಇಂದು ಮುಚ್ಚಿದೆ — {when} ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ |  |  |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ಇಂದು ಮುಚ್ಚಿದೆ ({reason}) — {when} ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ |  |  |
| `open.stateHours` | Closed — opens {when} | ಮುಚ್ಚಿದೆ — {when} ತೆರೆಯುತ್ತದೆ |  |  |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | ಸ್ವಲ್ಪ ಹೊತ್ತು ಮುಚ್ಚಬೇಕೇ? ಒಂದೇ ಟ್ಯಾಪ್, ಸಮಯ ಆರಿಸುವ ಅಗತ್ಯವಿಲ್ಲ. |  |  |
| `open.pause30` | 30 min | 30 ನಿಮಿಷ |  |  |
| `open.pause60` | 1 hour | 1 ಗಂಟೆ |  |  |
| `open.pauseToday` | Rest of today | ಇಂದು ಉಳಿದ ಸಮಯ | Rest of TODAY, not all day. |  |
| `open.resume` | Resume now | ಈಗಲೇ ತೆರೆಯಿರಿ |  |  |
| `open.hoursTitle` | Shop hours | ಅಂಗಡಿಯ ಸಮಯ |  |  |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | ಪ್ರತಿದಿನ ತೆರೆಯುವ ಮತ್ತು ಮುಚ್ಚುವ ಸಮಯ ಹಾಕಿ, ಅಥವಾ ಎರಡನ್ನೂ ಖಾಲಿ ಬಿಟ್ಟರೆ ದಿನವಿಡೀ ತೆರೆದಿರುತ್ತದೆ. ಮುಚ್ಚುವ ಸಮಯ ತೆರೆಯುವ ಸಮಯಕ್ಕಿಂತ ಮೊದಲಿದ್ದರೆ ಮಧ್ಯರಾತ್ರಿ ದಾಟಿಯೂ ಅಂಗಡಿ ತೆರೆದಿರುತ್ತದೆ ಎಂದರ್ಥ. | Contains the past-midnight rule, which is easy to lose in translation. |  |
| `open.openTime` | Opens at | ತೆರೆಯುವ ಸಮಯ |  |  |
| `open.closeTime` | Closes at | ಮುಚ್ಚುವ ಸಮಯ |  |  |
| `open.timePlaceholder` | HH:MM | ಗಂಟೆ:ನಿಮಿಷ | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| `open.alwaysOpen` | No daily hours set — open all day. | ದಿನದ ಸಮಯ ಹಾಕಿಲ್ಲ — ದಿನವಿಡೀ ತೆರೆದಿದೆ. |  |  |
| `open.saveHours` | Save hours | ಸಮಯ ಉಳಿಸಿ |  |  |
| `open.clearHours` | Clear hours | ಸಮಯ ಅಳಿಸಿ |  |  |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | ತೆರೆಯುವ ಮತ್ತು ಮುಚ್ಚುವ ಎರಡೂ ಸಮಯ ಹಾಕಿ, ಇಲ್ಲವೇ ಎರಡನ್ನೂ ಅಳಿಸಿ. |  |  |
| `open.closuresTitle` | Holiday closures | ರಜೆಯ ದಿನಗಳು |  |  |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | ಅಂಗಡಿ ಮುಚ್ಚಿರುವ ದಿನಾಂಕಗಳನ್ನು ಸೇರಿಸಿ — ಹಬ್ಬ, ಮದುವೆ, ಏನಾದರೂ. ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡುವ ಮೊದಲೇ ನೋಡುತ್ತಾರೆ. |  |  |
| `open.closureDate` | Date (YYYY-MM-DD) | ದಿನಾಂಕ (YYYY-MM-DD) | The YYYY-MM-DD is the literal format the field wants; leave it in Latin. |  |
| `open.closureReason` | Reason (optional) | ಕಾರಣ (ಐಚ್ಛಿಕ) |  |  |
| `open.closureReasonPlaceholder` | Diwali | ದೀಪಾವಳಿ |  |  |
| `open.addClosure` | Add date | ದಿನಾಂಕ ಸೇರಿಸಿ |  |  |
| `open.noClosures` | No closures in the next 90 days. | ಮುಂದಿನ 90 ದಿನಗಳಲ್ಲಿ ರಜೆ ಇಲ್ಲ. |  |  |
| `open.removeClosure` | Remove | ತೆಗೆ |  |  |
### 4. Routine chrome

Labels, buttons and empty states. Skim these; the risk is low.

| key | English | Kannada | what to check | ✓ / correction |
|---|---|---|---|---|
| `common.close` | Close | ಮುಚ್ಚಿ |  |  |
| `common.error` | Error | ದೋಷ |  |  |
| `common.failed` | Failed | ವಿಫಲವಾಗಿದೆ |  |  |
| `common.missing` | Missing | ಅಪೂರ್ಣ | Alert title shown when a required field is empty. |  |
| `common.go` | Go | ಹೋಗಿ |  |  |
| `common.keep` | Keep | ಹಾಗೇ ಇರಲಿ | The "do nothing" half of a destructive confirm. |  |
| `common.retry` | Retry | ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ |  |  |
| `common.loadFailed` | Could not load. Check your connection and try again. | ಲೋಡ್ ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಕನೆಕ್ಷನ್ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. |  |  |
| `title.addTransaction` | Add transaction | ವ್ಯವಹಾರ ಸೇರಿಸಿ |  |  |
| `login.subtitle` | Sign in to manage your shop | ನಿಮ್ಮ ಅಂಗಡಿ ನಡೆಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ |  |  |
| `login.failed` | Login failed | ಸೈನ್ ಇನ್ ವಿಫಲವಾಗಿದೆ |  |  |
| `admin.title` | Admin account | ಅಡ್ಮಿನ್ ಖಾತೆ |  |  |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | ಈ ಆ್ಯಪ್ ಅಂಗಡಿ ಮಾಲೀಕರಿಗಾಗಿ. ಪ್ಲಾಟ್‌ಫಾರ್ಮ್ ನಿರ್ವಹಿಸಲು ವೆಬ್ ಅಡ್ಮಿನ್ ಕನ್ಸೋಲ್ ಬಳಸಿ. |  |  |
| `admin.signOut` | Sign out | ಸೈನ್ ಔಟ್ |  |  |
| `dash.newTransaction` | New transaction | ಹೊಸ ವ್ಯವಹಾರ |  |  |
| `dash.viewCustomers` | View customers | ಗ್ರಾಹಕರನ್ನು ನೋಡಿ |  |  |
| `cust.empty` | No customers yet. | ಇನ್ನೂ ಗ್ರಾಹಕರಿಲ್ಲ. |  |  |
| `custd.notFound` | Customer not found. | ಗ್ರಾಹಕ ಸಿಗಲಿಲ್ಲ. |  |  |
| `cat.adding` | Adding… | ಸೇರಿಸಲಾಗುತ್ತಿದೆ… |  |  |
| `cat.active` | Active | ಸಕ್ರಿಯ |  |  |
| `cat.hidden` | Hidden | ಮರೆಮಾಡಲಾಗಿದೆ |  |  |
| `cat.deleteTitle` | Delete product | ಉತ್ಪನ್ನ ಅಳಿಸಿ |  |  |
| `cat.missingName` | Enter a product name | ಉತ್ಪನ್ನದ ಹೆಸರು ಹಾಕಿ |  |  |
| `cat.myProducts` | My products | ನನ್ನ ಉತ್ಪನ್ನಗಳು |  |  |
| `cat.searchCatalogue` | Search catalogue | ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಹುಡುಕಿ |  |  |
| `cat.added` | Added | ಸೇರಿಸಲಾಗಿದೆ |  |  |
| `cat.noCatalogue` | No catalogue items found. | ಕ್ಯಾಟಲಾಗ್‌ನಲ್ಲಿ ಏನೂ ಸಿಗಲಿಲ್ಲ. |  |  |
| `fam.new` | New family | ಹೊಸ ಕುಟುಂಬ |  |  |
| `fam.creating` | Creating… | ರಚಿಸಲಾಗುತ್ತಿದೆ… |  |  |
| `fam.empty` | No families yet. | ಇನ್ನೂ ಕುಟುಂಬಗಳಿಲ್ಲ. |  |  |
| `fam.missingName` | Enter a family name | ಕುಟುಂಬದ ಹೆಸರು ಹಾಕಿ |  |  |
| `famd.notFound` | Family not found. | ಕುಟುಂಬ ಸಿಗಲಿಲ್ಲ. |  |  |
| `famd.noCandidates` | No other customers available to add. | ಸೇರಿಸಲು ಬೇರೆ ಗ್ರಾಹಕರಿಲ್ಲ. |  |  |
| `famd.removeTitle` | Remove member | ಸದಸ್ಯರನ್ನು ತೆಗೆದುಹಾಕಿ |  |  |
| `famd.reminderTitle` | Reminder | ನೆನಪಿಸುವಿಕೆ |  |  |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV ವರದಿ ಎಕ್ಸ್‌ಪೋರ್ಟ್ ವೆಬ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸಿಗುತ್ತದೆ. |  |  |
| `setn.silent` | Silent | ಸೈಲೆಂಟ್ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.smart` | Smart | ಸ್ಮಾರ್ಟ್ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.active` | Active | ಸಕ್ರಿಯ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `set.savedTitle` | Saved | ಉಳಿಸಲಾಗಿದೆ |  |  |
| `set.shopSaved` | Shop settings updated. | ಅಂಗಡಿ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಅಪ್‌ಡೇಟ್ ಆಗಿವೆ. |  |  |
| `set.connOkTitle` | Connection OK | ಕನೆಕ್ಷನ್ ಸರಿ ಇದೆ |  |  |
| `set.connFailedTitle` | Connection failed | ಕನೆಕ್ಷನ್ ವಿಫಲವಾಗಿದೆ |  |  |
| `set.connOkMsg` | Your Razorpay keys work. | ನಿಮ್ಮ Razorpay ಕೀಗಳು ಕೆಲಸ ಮಾಡುತ್ತಿವೆ. |  |  |
| `set.connFailedMsg` | Check your keys. | ನಿಮ್ಮ ಕೀಗಳನ್ನು ನೋಡಿ. |  |  |
| `set.listShop` | List my shop for nearby customers | ಹತ್ತಿರದ ಗ್ರಾಹಕರಿಗಾಗಿ ನನ್ನ ಅಂಗಡಿಯನ್ನು ಪಟ್ಟಿ ಮಾಡಿ |  |  |
| `set.discoverySaved` | Discovery settings updated. | ಅನ್ವೇಷಣೆ ಸೆಟ್ಟಿಂಗ್‌ಗಳು ಅಪ್‌ಡೇಟ್ ಆಗಿವೆ. |  |  |
| `set.signOut` | Sign out | ಸೈನ್ ಔಟ್ |  |  |
| `set.signOutConfirm` | Sign out of this account? | ಈ ಖಾತೆಯಿಂದ ಸೈನ್ ಔಟ್ ಮಾಡುವುದೇ? |  |  |
| `more.familiesSub` | Group customers, shared credit & reminders | ಗ್ರಾಹಕರನ್ನು ಗುಂಪು ಮಾಡಿ, ಹಂಚಿಕೆಯ ಸಾಲ ಮತ್ತು ನೆನಪಿಸುವಿಕೆ |  |  |
| `more.insightsSub` | Analytics overview & aging | ವಿಶ್ಲೇಷಣೆ ಸಾರಾಂಶ ಮತ್ತು ಬಾಕಿ ವಯಸ್ಸು |  |  |
| `more.settingsSub` | Shop, payments & discovery | ಅಂಗಡಿ, ಪಾವತಿ ಮತ್ತು ಅನ್ವೇಷಣೆ |  |  |
| `more.moreFeatures` | More features | ಇನ್ನಷ್ಟು ಸೌಲಭ್ಯಗಳು |  |  |
| `more.credits` | Khata Credits & Referral | ಖಾತೆ ಕ್ರೆಡಿಟ್ ಮತ್ತು ರೆಫರಲ್ | A feature name. "Khata Credits" is shop currency, not a bank credit. |  |
| `more.creditsSub` | Earn & spend credits, invite shops | ಕ್ರೆಡಿಟ್ ಗಳಿಸಿ ಮತ್ತು ಖರ್ಚು ಮಾಡಿ, ಅಂಗಡಿಗಳನ್ನು ಆಹ್ವಾನಿಸಿ |  |  |
| `more.promote` | Boost & Branded Store | ಬೂಸ್ಟ್ ಮತ್ತು ಬ್ರಾಂಡೆಡ್ ಸ್ಟೋರ್ | A feature name; kept close to the English the way Hindi does. |  |
| `more.promoteSub` | Promote your shop, premium storefront | ನಿಮ್ಮ ಅಂಗಡಿ ಪ್ರಚಾರ ಮಾಡಿ, ಪ್ರೀಮಿಯಂ ಸ್ಟೋರ್ |  |  |
| `more.delivery` | Delivery Champions | ಡೆಲಿವರಿ ಚಾಂಪಿಯನ್ಸ್ | A feature name; kept close to the English the way Hindi does. |  |
| `more.deliverySub` | Assign deliveries & share status links | ಡೆಲಿವರಿ ಹಂಚಿ ಮತ್ತು ಸ್ಟೇಟಸ್ ಲಿಂಕ್ ಕಳುಹಿಸಿ |  |  |
| `more.poster` | Share Poster | ಪೋಸ್ಟರ್ ಹಂಚಿ |  |  |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | WhatsApp/IG/FB ಗಾಗಿ ಅಂಗಡಿಯ ಪೋಸ್ಟರ್ |  |  |

## Malayalam (`ml`) — 197 strings

### 1. Money, credit and the order

A wrong word here costs the shopkeeper money or a customer. Check every row.

| key | English | Malayalam | what to check | ✓ / correction |
|---|---|---|---|---|
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | ഈ ഉപഭോക്താവിന്റെ കണക്കിൽ നിന്ന് {amount} കുറയും. | I used **കണക്ക്** for the khata rather than transliterating "khata". Check it reads as the credit book. |  |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | ഓൺലൈനിൽ പണം അടച്ചുകഴിഞ്ഞു — {amount} ഈ ഉപഭോക്താവിന് നിങ്ങളുടെ കടയിൽ ക്രെഡിറ്റായി ഉണ്ടാകും. | I used **ക്രെഡിറ്റ്** here because the existing block already borrows English freely. A pure-Malayalam word would be welcome if one is natural. |  |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | ഓർഡർ കൊടുക്കുമ്പോൾ {amount} കുറച്ച് വാങ്ങുക. | Means collect LESS at handover. If it can be read as "collect {amount}", it is wrong. |  |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | ഓൺലൈനിൽ പണം അടച്ചിട്ടുണ്ട് — ആ തുക ഈ ഉപഭോക്താവിന് നിങ്ങളുടെ കടയിൽ ക്രെഡിറ്റായി മാറും. പണം തിരികെ കിട്ടില്ല. | Same trap: credit at the shop, never a refund. Highest-stakes string in the file. |  |
| `oedit.reducedBy` | You are taking off {amount}. | നിങ്ങൾ {amount} കുറയ്ക്കുകയാണ്. | The amount being taken OFF, not the new total. |  |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | ഇതുകൊണ്ട് ഓർഡർ നിങ്ങളുടെ സൗജന്യ ഡെലിവറി തുകയ്ക്ക് താഴെ പോയാൽ, ഉറപ്പിക്കുമ്പോൾ ഡെലിവറി ചാർജ് വീണ്ടും കണക്കാക്കും. | Conditional — the fee is recalculated only if the order drops below the free-delivery amount. Check the "if" survives. |  |
| `txn.adjustment` | Adjustment | തിരുത്തൽ | I used **തിരുത്തൽ** and NOT ക്രമീകരണം, because ക്രമീകരണങ്ങൾ is already title.settings and the two would collide. |  |
| `oedit.originalSubtotal` | Original subtotal | യഥാർത്ഥ ഉപ ആകെ | The subtotal BEFORE the reduction. |  |
| `orej.reject` | Reject | നിരസിക്കുക | I chose **നിരസിക്കുക**, deliberately NOT റദ്ദാക്കുക, because റദ്ദാക്കി is already ostatus.cancelled. |  |
| `orej.confirm` | Reject order | ഓർഡർ നിരസിക്കുക | The button that actually rejects. Same reject/cancel distinction. |  |
| `orej.title` | Reject this order? | ഈ ഓർഡർ നിരസിക്കണോ? | Same reject/cancel distinction. |  |
| `orej.done` | Order rejected. | ഓർഡർ നിരസിച്ചു. | Same reject/cancel distinction. |  |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | ഉപഭോക്താവിനോട് കാരണം പറയുക — റദ്ദാക്കൽ അറിയിപ്പിനൊപ്പം അവർക്ക് പോകും. | The reason is sent to the customer. Check it reads as "we will pass this on", not "write it down for yourself". |  |
| `oalert.accept` | Accept | സ്വീകരിക്കുക | I chose **സ്വീകരിക്കുക** to match സ്വീകരിച്ചു already in this block. |  |
| `eta.accept` | Accept | സ്വീകരിക്കുക | Same word as oalert.accept on purpose. If you change one, change both. |  |
| `eta.acceptTitle` | Accept this order | ഈ ഓർഡർ സ്വീകരിക്കുക | Same word as oalert.accept on purpose. |  |
| `eta.noTime` | Accept without a time | സമയം പറയാതെ സ്വീകരിക്കുക |  |  |
| `eta.notNow` | Not now | ഇപ്പോൾ വേണ്ട |  |  |
| `eta.accepting` | Accepting… | സ്വീകരിക്കുന്നു… |  |  |
| `oedit.start` | Not everything in stock? | എല്ലാ സാധനവും ഇല്ലേ? | The prompt that opens order-reduction. Spoken, informal — "not everything in stock?" |  |
| `oedit.startBtn` | Reduce this order | ഈ ഓർഡർ കുറയ്ക്കുക | REDUCE, not cancel and not edit. Nothing here can add or raise anything. |  |
| `oedit.title` | Reduce this order | ഈ ഓർഡർ കുറയ്ക്കുക | Same word as oedit.startBtn on purpose. |  |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | നിങ്ങളുടെ കയ്യിൽ ഇല്ലാത്തത് ഒഴിവാക്കുക. ഇവിടെ സാധനം നീക്കാനോ അളവ് കുറയ്ക്കാനോ മാത്രമേ കഴിയൂ — പുതിയ സാധനം ചേർക്കാനോ അളവ് കൂട്ടാനോ വില മാറ്റാനോ ഇവിടെ കഴിയില്ല. | The safety rule: only remove or lower. If the sentence leaves any room for "you can also add", it is wrong. |  |
| `oedit.confirm` | Confirm the new order | പുതിയ ഓർഡർ ഉറപ്പിക്കുക | Commits the smaller order. |  |
| `oedit.keep` | Leave it as it was | ഉണ്ടായിരുന്നതുപോലെ ഇരിക്കട്ടെ | Backs out without changing anything. |  |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | ഓർഡർ കുറച്ചു. എന്താണ് മാറിയതെന്ന് ഉപഭോക്താവിനെ അറിയിച്ചു. | Also states the customer has been told. Both halves matter. |  |
| `oedit.noChange` | Nothing has been changed yet. | ഇതുവരെ ഒന്നും മാറ്റിയിട്ടില്ല. |  |  |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | നിങ്ങൾ എല്ലാം ഒഴിവാക്കി. പകരം ഓർഡർ തന്നെ റദ്ദാക്കുക. | Only shown when everything has been taken off. Points at CANCEL, a different action from reduce. |  |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | ഇനി ഓർഡർ സ്വീകരിച്ച് എപ്പോൾ തയ്യാറാകുമെന്ന് ഉപഭോക്താവിനോട് പറയുക. | Two instructions in one line: accept, then promise a time. |  |
| `oedit.remove` | Remove | നീക്കുക | Take an item off this order — not "delete the product from my catalogue". |  |
| `oedit.restore` | Put back | തിരികെ ചേർക്കുക | Put a removed item back. |  |
| `oedit.removedTag` | Removed | നീക്കി |  |  |
| `oedit.saving` | Saving… | സേവ് ചെയ്യുന്നു… |  |  |
| `oedit.was` | Was {was} | മുമ്പ് {was} | Renders next to the new quantity. {was} is the old one. |  |
| `oedit.wasNow` | Was {was} — now {now} | മുമ്പ് {was} — ഇപ്പോൾ {now} | Old quantity then new. Check the order of the two placeholders reads right. |  |
| `oedit.historyTitle` | What was taken off | എന്തൊക്കെ ഒഴിവാക്കി |  |  |
| `oedit.historyRemoved` | {item} — removed | {item} — നീക്കി |  |  |
| `oedit.historyUnknownWho` | the shop | കട | Stands in for a person's name in "{who}, {when}" — it must read like an actor ("the shop"), not like a place. |  |
| `ord.notFound` | Order not found. | ഓർഡർ കണ്ടെത്താനായില്ല. |  |  |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | ഈ ഓർഡർ റദ്ദാക്കണോ? ഇത് പഴയപടിയാക്കാനാവില്ല. | CANCEL, and it cannot be undone. Check the second sentence is not the same word as "cancel" doing double duty. |  |
| `orej.r1` | Out of stock | സാധനം ഇല്ല | One-tap reason. Short and spoken. |  |
| `orej.r2` | Too busy right now | ഇപ്പോൾ വലിയ തിരക്കാണ് | One-tap reason. Short and spoken. |  |
| `orej.r3` | Shop is closing | കട അടയ്ക്കുകയാണ് | One-tap reason. Short and spoken. |  |
| `orej.placeholder` | Another reason (optional) | മറ്റൊരു കാരണം (ഓപ്ഷണൽ) |  |  |
| `orej.back` | Back | പിന്നോട്ട് |  |  |
| `custd.recordAction` | Record payment / purchase | പണം അടച്ചത് / വാങ്ങൽ രേഖപ്പെടുത്തുക | Two things on one button: money coming IN and goods going OUT on credit. |  |
| `add.invalidAmount` | Enter a valid amount | ശരിയായ തുക നൽകുക | Money validation. |  |
| `addtx.missingBody` | Pick a customer and amount | ഉപഭോക്താവിനെയും തുകയും തിരഞ്ഞെടുക്കുക | Money validation. |  |
| `addtx.selectedCustomer` | Selected customer | തിരഞ്ഞെടുത്ത ഉപഭോക്താവ് |  |  |
| `addtx.notePlaceholder` | note | കുറിപ്പ് |  |  |
| `famd.combinedLimit` | Combined limit | സംയുക്ത പരിധി | The whole family's cap. |  |
| `famd.subLimit` | sub-limit {amt} | ഉപ-പരിധി {amt} | A per-member cap inside a family limit. |  |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | WhatsApp ഓർമ്മപ്പെടുത്തൽ അയച്ചു. സംയുക്ത കുടിശ്ശിക: {amt}. | Carries the combined outstanding. The number is real money. |  |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | അയച്ചില്ല (പണമടയ്ക്കുന്നയാൾ അറിയിപ്പുകൾ ഓഫാക്കിയിരിക്കാം). സംയുക്ത കുടിശ്ശിക: {amt}. | Says it did NOT go out. If that reads as "sent", a shopkeeper stops chasing a real debt. |  |
| `famd.payerLabel` | Payer | പണമടയ്ക്കുന്നയാൾ | The family member who settles the bill. |  |
| `famd.payerTag` | (payer) | (പണമടയ്ക്കുന്നയാൾ) |  |  |
| `famd.notSet` | not set | സജ്ജമാക്കിയിട്ടില്ല |  |  |
| `ins.purchases` | Purchases | വാങ്ങലുകൾ | Goods sold on credit over the window — the same idea as txn.purchase, and I used the same word. |  |
| `ins.collections` | Collections | പിരിവ് | പിരിവ് was already in this block for dash.todayCollections and I kept it everywhere. |  |
| `ins.withDues` | With dues | കുടിശ്ശികയുള്ളവർ | Customers who owe. |  |
| `ins.newCustomers` | New customers | പുതിയ ഉപഭോക്താക്കൾ |  |  |
| `ins.daysN` | {d} days | {d} ദിവസം |  |  |
| `cat.editPrice` | Edit ₹ | ₹ മാറ്റുക | A tight button; only the rupee sign and a verb fit. |  |
| `cat.editPriceTitle` | Edit price (₹) | വില മാറ്റുക (₹) |  |  |
| `cat.setPrice` | Set price (₹) | വില നിശ്ചയിക്കുക (₹) |  |  |
| `cat.indicative` | Indicative | ഏകദേശം | A catalogue price that is a guide, not the shop's own price. |  |
### 2. The new-order alert (some of it is read aloud)

`oalert.spoken` and the lines around it are spoken by text-to-speech in a noisy shop. Read them out loud, not just with your eyes.

| key | English | Malayalam | what to check | ✓ / correction |
|---|---|---|---|---|
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | പുതിയ ഓർഡർ. {name}. {n} ഇനങ്ങൾ. {amount} രൂപ. | READ ALOUD by text-to-speech in a noisy shop. Say it out loud before approving: no abbreviations, no symbols, and it must survive a name dropping into {name}. |  |
| `oalert.title` | New order waiting | പുതിയ ഓർഡർ കാത്തിരിക്കുന്നു | Heard as a notification title on many devices. |  |
| `oalert.items` | {n} items | {n} ഇനങ്ങൾ | Also read aloud as part of the alert. Plural form is fixed — {n} may be 1. |  |
| `oalert.more` | +{n} more | +{n} കൂടി |  |  |
| `oalert.waiting` | waiting {mins} min | {mins} മിനിറ്റായി കാത്തിരിക്കുന്നു |  |  |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | ഇപ്പോഴും കാത്തിരിക്കുന്നു — നിങ്ങൾ ഇതിന് ഇതുവരെ മറുപടി നൽകിയിട്ടില്ല. | Nagging, not scolding. Check the tone. |  |
| `oalert.decide` | This keeps alerting until you accept or reject it. | നിങ്ങൾ സ്വീകരിക്കുകയോ നിരസിക്കുകയോ ചെയ്യുന്നതുവരെ ഇത് അറിയിച്ചുകൊണ്ടിരിക്കും. | States the alert will not stop until accepted or rejected. Both verbs must be the ones used on the buttons. |  |
| `oalert.snooze` | Not now — {mins} min | ഇപ്പോൾ വേണ്ട — {mins} മിനിറ്റ് | "Not now" — quiets ONE order briefly. Must not read as "reject". |  |
| `oalert.snoozedFor` | Quiet for {mins} more min | ഇനിയും {mins} മിനിറ്റ് നിശ്ശബ്ദം | Must not read as "alerts are off". |  |
| `oalert.open` | Open | തുറക്കുക |  |  |
| `oalert.mute30` | Mute for 30 minutes | 30 മിനിറ്റ് നിശ്ശബ്ദം |  |  |
| `oalert.unmute` | Turn alerts back on | അറിയിപ്പ് വീണ്ടും ഓൺ ചെയ്യുക |  |  |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | ഈ ഫോണിന് ഇതുവരെ നിങ്ങളുടെ ഭാഷ സംസാരിക്കാനാവില്ല — ബാനർ കാണാം. | Says the phone cannot speak this language; the banner still shows. |  |
| `oalert.setTitle` | Order alerts | ഓർഡർ അറിയിപ്പുകൾ |  |  |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | പുതിയ ഓർഡർ വന്നാൽ നിങ്ങൾ അത് സ്വീകരിക്കുകയോ നിരസിക്കുകയോ ചെയ്യുന്നതുവരെ ഇവിടെയും WhatsApp-ലും അറിയിപ്പ് വന്നുകൊണ്ടിരിക്കും. “ഇപ്പോൾ വേണ്ട” ഒരു ഓർഡറിനെ കുറച്ച് മിനിറ്റ് മാത്രമേ നിശ്ശബ്ദമാക്കൂ; അറിയിപ്പ് നിർത്തില്ല. | The longest string in the batch and the one that explains the whole alert contract. Read it slowly. |  |
| `oalert.setEnabled` | Alert me about new orders | പുതിയ ഓർഡറുകൾ എന്നെ അറിയിക്കുക |  |  |
| `oalert.setRepeat` | Repeat every (minutes) | എത്ര മിനിറ്റ് കൂടുമ്പോൾ |  |  |
| `oalert.setMaxRepeats` | Stop after (repeats) | എത്ര തവണയ്ക്ക് ശേഷം നിർത്തണം |  |  |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 മിനിറ്റ് നിശ്ശബ്ദം |  |  |
| `oalert.setMuted` | Alerts are muted right now. | ഇപ്പോൾ അറിയിപ്പുകൾ നിശ്ശബ്ദമാണ്. |  |  |
| `oalert.setSaved` | Order alert settings saved. | ഓർഡർ അറിയിപ്പ് ക്രമീകരണങ്ങൾ സേവ് ചെയ്തു. |  |  |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | നിങ്ങൾ നൽകിയ സംഖ്യ അനുവദനീയമായ ഏറ്റവും അടുത്ത സംഖ്യയിലേക്ക് മാറ്റി. | The value the shopkeeper typed was changed for them. |  |
### 3. Ready-time promises and shop availability

Promises made to a customer, and whether the shop is open. Wrong here and a customer turns up to a shut shop.

| key | English | Malayalam | what to check | ✓ / correction |
|---|---|---|---|---|
| `eta.pickTime` | Ready in about… | ഏകദേശം എത്ര നേരത്തിനുള്ളിൽ തയ്യാർ… | A question with a trailing ellipsis, answered by the chips below it. |  |
| `eta.chipMin` | ~{n} min | ~{n} മിനിറ്റ് |  |  |
| `eta.chipHour` | ~{n} hour | ~{n} മണിക്കൂർ |  |  |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} മണിക്കൂർ {m} മിനിറ്റ് | Two placeholders in one chip, very little room. |  |
| `eta.promisedBy` | You promised ready by {time} | {time}-ന് തയ്യാറാകുമെന്ന് നിങ്ങൾ പറഞ്ഞിട്ടുണ്ട് | A promise already made to the customer. |  |
| `eta.noPromise` | No ready time promised | തയ്യാറാകുന്ന സമയം പറഞ്ഞിട്ടില്ല |  |  |
| `eta.needMore` | Need more time | കുറച്ച് സമയം കൂടി വേണം |  |  |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | പുതിയ സമയം തിരഞ്ഞെടുക്കുക — ഉപഭോക്താവിനെ ഉടനെ അറിയിക്കും. |  |  |
| `eta.sent` | The customer has been told the new time. | ഉപഭോക്താവിനെ പുതിയ സമയം അറിയിച്ചു. |  |  |
| `eta.late` | Past the time you promised | നിങ്ങൾ പറഞ്ഞ സമയം കഴിഞ്ഞു | The promise has been missed. Factual, not accusing. |  |
| `eta.readyBy` | Ready by {time} | {time}-ന് തയ്യാർ |  |  |
| `eta.takingLonger` | Taking a little longer | കുറച്ച് കൂടി സമയമെടുക്കുന്നു |  |  |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}-ന് ആകേണ്ടതായിരുന്നു. ഇനി അധികം വൈകില്ല. | Reassurance after a missed promise. |  |
| `open.open` | Open | തുറന്നിരിക്കുന്നു |  |  |
| `open.closed` | Closed | അടച്ചിരിക്കുന്നു |  |  |
| `open.todayAt` | at {time} | {time}-ന് |  |  |
| `open.tomorrowAt` | tomorrow at {time} | നാളെ {time}-ന് |  |  |
| `open.title` | Shop availability | കട തുറന്നിട്ടുണ്ടോ |  |  |
| `open.switchLabel` | Shop is open | കട തുറന്നിരിക്കുന്നു |  |  |
| `open.takingOrders` | You are taking orders right now. | നിങ്ങൾ ഇപ്പോൾ ഓർഡർ എടുക്കുന്നുണ്ട്. |  |  |
| `open.notTakingOrders` | Customers cannot order right now. | ഉപഭോക്താക്കൾക്ക് ഇപ്പോൾ ഓർഡർ ചെയ്യാനാവില്ല. |  |  |
| `open.stateClosed` | Closed — you switched the shop off | അടച്ചിരിക്കുന്നു — നിങ്ങൾ കട ഓഫാക്കി വെച്ചിരിക്കുന്നു |  |  |
| `open.statePaused` | Paused — back {when} | കുറച്ച് നേരത്തേക്ക് നിർത്തി — {when} തിരികെ | {when} is a time. Check the sentence still parses when a time drops in. |  |
| `open.stateHoliday` | Closed today — reopens {when} | ഇന്ന് അടവാണ് — {when} വീണ്ടും തുറക്കും |  |  |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ഇന്ന് അടവാണ് ({reason}) — {when} വീണ്ടും തുറക്കും |  |  |
| `open.stateHours` | Closed — opens {when} | അടച്ചിരിക്കുന്നു — {when} തുറക്കും |  |  |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | കുറച്ച് നേരത്തേക്ക് അടയ്ക്കണോ? ഒറ്റ ടാപ്പ്, സമയം തിരഞ്ഞെടുക്കേണ്ട. |  |  |
| `open.pause30` | 30 min | 30 മിനിറ്റ് |  |  |
| `open.pause60` | 1 hour | 1 മണിക്കൂർ |  |  |
| `open.pauseToday` | Rest of today | ഇന്ന് ബാക്കി സമയം | Rest of TODAY, not all day. |  |
| `open.resume` | Resume now | ഇപ്പോൾത്തന്നെ തുറക്കുക |  |  |
| `open.hoursTitle` | Shop hours | കടയുടെ സമയം |  |  |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | ദിവസവും തുറക്കുന്നതും അടയ്ക്കുന്നതുമായ സമയം നൽകുക, അല്ലെങ്കിൽ രണ്ടും ഒഴിച്ചിട്ടാൽ ദിവസം മുഴുവൻ തുറന്നിരിക്കും. അടയ്ക്കുന്ന സമയം തുറക്കുന്ന സമയത്തിന് മുമ്പാണെങ്കിൽ അർദ്ധരാത്രി കഴിഞ്ഞും കട തുറന്നിരിക്കും എന്നർത്ഥം. | Contains the past-midnight rule, which is easy to lose in translation. |  |
| `open.openTime` | Opens at | തുറക്കുന്ന സമയം |  |  |
| `open.closeTime` | Closes at | അടയ്ക്കുന്ന സമയം |  |  |
| `open.timePlaceholder` | HH:MM | മണി:മിനിറ്റ് | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| `open.alwaysOpen` | No daily hours set — open all day. | ദിവസത്തെ സമയം നൽകിയിട്ടില്ല — ദിവസം മുഴുവൻ തുറന്നിരിക്കും. |  |  |
| `open.saveHours` | Save hours | സമയം സേവ് ചെയ്യുക |  |  |
| `open.clearHours` | Clear hours | സമയം മായ്ക്കുക |  |  |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | തുറക്കുന്നതും അടയ്ക്കുന്നതുമായ രണ്ട് സമയവും നൽകുക, അല്ലെങ്കിൽ രണ്ടും മായ്ക്കുക. |  |  |
| `open.closuresTitle` | Holiday closures | അവധി ദിവസങ്ങൾ |  |  |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | കട അടച്ചിടുന്ന തീയതികൾ ചേർക്കുക — ഉത്സവം, കല്യാണം, എന്തുമാകട്ടെ. ഉപഭോക്താക്കൾ ഓർഡർ ചെയ്യുന്നതിന് മുമ്പേ കാണും. |  |  |
| `open.closureDate` | Date (YYYY-MM-DD) | തീയതി (YYYY-MM-DD) | The YYYY-MM-DD is the literal format the field wants; leave it in Latin. |  |
| `open.closureReason` | Reason (optional) | കാരണം (ഓപ്ഷണൽ) |  |  |
| `open.closureReasonPlaceholder` | Diwali | ദീപാവലി |  |  |
| `open.addClosure` | Add date | തീയതി ചേർക്കുക |  |  |
| `open.noClosures` | No closures in the next 90 days. | അടുത്ത 90 ദിവസത്തിൽ അവധിയില്ല. |  |  |
| `open.removeClosure` | Remove | നീക്കുക |  |  |
### 4. Routine chrome

Labels, buttons and empty states. Skim these; the risk is low.

| key | English | Malayalam | what to check | ✓ / correction |
|---|---|---|---|---|
| `common.close` | Close | അടയ്ക്കുക |  |  |
| `common.error` | Error | പിശക് |  |  |
| `common.failed` | Failed | പരാജയപ്പെട്ടു |  |  |
| `common.missing` | Missing | അപൂർണ്ണം | Alert title shown when a required field is empty. |  |
| `common.go` | Go | പോകുക |  |  |
| `common.keep` | Keep | അങ്ങനെ തന്നെ ഇരിക്കട്ടെ | The "do nothing" half of a destructive confirm. |  |
| `common.retry` | Retry | വീണ്ടും ശ്രമിക്കുക |  |  |
| `common.loadFailed` | Could not load. Check your connection and try again. | ലോഡ് ചെയ്യാനായില്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കുക. |  |  |
| `title.addTransaction` | Add transaction | ഇടപാട് ചേർക്കുക |  |  |
| `login.subtitle` | Sign in to manage your shop | നിങ്ങളുടെ കട നടത്താൻ സൈൻ ഇൻ ചെയ്യുക |  |  |
| `login.failed` | Login failed | സൈൻ ഇൻ പരാജയപ്പെട്ടു |  |  |
| `admin.title` | Admin account | അഡ്മിൻ അക്കൗണ്ട് |  |  |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | ഈ ആപ്പ് കടയുടമകൾക്കുള്ളതാണ്. പ്ലാറ്റ്‌ഫോം കൈകാര്യം ചെയ്യാൻ വെബ് അഡ്മിൻ കൺസോൾ ഉപയോഗിക്കുക. |  |  |
| `admin.signOut` | Sign out | സൈൻ ഔട്ട് |  |  |
| `dash.newTransaction` | New transaction | പുതിയ ഇടപാട് |  |  |
| `dash.viewCustomers` | View customers | ഉപഭോക്താക്കളെ കാണുക |  |  |
| `cust.empty` | No customers yet. | ഇതുവരെ ഉപഭോക്താക്കളില്ല. |  |  |
| `custd.notFound` | Customer not found. | ഉപഭോക്താവിനെ കണ്ടെത്താനായില്ല. |  |  |
| `cat.adding` | Adding… | ചേർക്കുന്നു… |  |  |
| `cat.active` | Active | സജീവം |  |  |
| `cat.hidden` | Hidden | മറച്ചത് |  |  |
| `cat.deleteTitle` | Delete product | ഉൽപ്പന്നം ഇല്ലാതാക്കുക |  |  |
| `cat.missingName` | Enter a product name | ഉൽപ്പന്നത്തിന്റെ പേര് നൽകുക |  |  |
| `cat.myProducts` | My products | എന്റെ ഉൽപ്പന്നങ്ങൾ |  |  |
| `cat.searchCatalogue` | Search catalogue | കാറ്റലോഗിൽ തിരയുക |  |  |
| `cat.added` | Added | ചേർത്തു |  |  |
| `cat.noCatalogue` | No catalogue items found. | കാറ്റലോഗിൽ ഒന്നും കിട്ടിയില്ല. |  |  |
| `fam.new` | New family | പുതിയ കുടുംബം |  |  |
| `fam.creating` | Creating… | സൃഷ്ടിക്കുന്നു… |  |  |
| `fam.empty` | No families yet. | ഇതുവരെ കുടുംബങ്ങളില്ല. |  |  |
| `fam.missingName` | Enter a family name | കുടുംബപ്പേര് നൽകുക |  |  |
| `famd.notFound` | Family not found. | കുടുംബം കണ്ടെത്താനായില്ല. |  |  |
| `famd.noCandidates` | No other customers available to add. | ചേർക്കാൻ മറ്റ് ഉപഭോക്താക്കളില്ല. |  |  |
| `famd.removeTitle` | Remove member | അംഗത്തെ നീക്കുക |  |  |
| `famd.reminderTitle` | Reminder | ഓർമ്മപ്പെടുത്തൽ |  |  |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV റിപ്പോർട്ട് എക്സ്പോർട്ട് വെബ് ഡാഷ്‌ബോർഡിൽ ലഭ്യമാണ്. |  |  |
| `setn.silent` | Silent | സൈലന്റ് | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.smart` | Smart | സ്മാർട്ട് | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.active` | Active | സജീവം | One of three customer-notification modes: Silent / Smart / Active. |  |
| `set.savedTitle` | Saved | സേവ് ചെയ്തു |  |  |
| `set.shopSaved` | Shop settings updated. | കട ക്രമീകരണങ്ങൾ അപ്ഡേറ്റ് ചെയ്തു. |  |  |
| `set.connOkTitle` | Connection OK | കണക്ഷൻ ശരിയാണ് |  |  |
| `set.connFailedTitle` | Connection failed | കണക്ഷൻ പരാജയപ്പെട്ടു |  |  |
| `set.connOkMsg` | Your Razorpay keys work. | നിങ്ങളുടെ Razorpay കീകൾ പ്രവർത്തിക്കുന്നു. |  |  |
| `set.connFailedMsg` | Check your keys. | നിങ്ങളുടെ കീകൾ പരിശോധിക്കുക. |  |  |
| `set.listShop` | List my shop for nearby customers | അടുത്തുള്ള ഉപഭോക്താക്കൾക്കായി എന്റെ കട ലിസ്റ്റ് ചെയ്യുക |  |  |
| `set.discoverySaved` | Discovery settings updated. | കണ്ടെത്തൽ ക്രമീകരണങ്ങൾ അപ്ഡേറ്റ് ചെയ്തു. |  |  |
| `set.signOut` | Sign out | സൈൻ ഔട്ട് |  |  |
| `set.signOutConfirm` | Sign out of this account? | ഈ അക്കൗണ്ടിൽ നിന്ന് സൈൻ ഔട്ട് ചെയ്യണോ? |  |  |
| `more.familiesSub` | Group customers, shared credit & reminders | ഉപഭോക്താക്കളെ ഒരുമിച്ചാക്കുക, പങ്കിട്ട വായ്പ, ഓർമ്മപ്പെടുത്തൽ |  |  |
| `more.insightsSub` | Analytics overview & aging | വിശകലന ചുരുക്കവും കുടിശ്ശികയുടെ പഴക്കവും |  |  |
| `more.settingsSub` | Shop, payments & discovery | കട, പേയ്‌മെന്റ്, കണ്ടെത്തൽ |  |  |
| `more.moreFeatures` | More features | കൂടുതൽ സൗകര്യങ്ങൾ |  |  |
| `more.credits` | Khata Credits & Referral | കണക്ക് ക്രെഡിറ്റും റഫറലും | കണക്ക് ക്രെഡിറ്റ് — the feature name. Say if it should stay closer to the English. |  |
| `more.creditsSub` | Earn & spend credits, invite shops | ക്രെഡിറ്റ് നേടുക, ചെലവാക്കുക, കടകളെ ക്ഷണിക്കുക |  |  |
| `more.promote` | Boost & Branded Store | ബൂസ്റ്റും ബ്രാൻഡഡ് സ്റ്റോറും | A feature name; kept close to the English the way Hindi does. |  |
| `more.promoteSub` | Promote your shop, premium storefront | നിങ്ങളുടെ കട പ്രചരിപ്പിക്കുക, പ്രീമിയം സ്റ്റോർ |  |  |
| `more.delivery` | Delivery Champions | ഡെലിവറി ചാമ്പ്യൻസ് | A feature name; kept close to the English the way Hindi does. |  |
| `more.deliverySub` | Assign deliveries & share status links | ഡെലിവറി ഏൽപ്പിക്കുക, സ്റ്റാറ്റസ് ലിങ്ക് പങ്കിടുക |  |  |
| `more.poster` | Share Poster | പോസ്റ്റർ പങ്കിടുക |  |  |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | WhatsApp/IG/FB-യ്ക്കുള്ള കടയുടെ പോസ്റ്റർ |  |  |

## Urdu (`ur`) — 197 strings

### 1. Money, credit and the order

A wrong word here costs the shopkeeper money or a customer. Check every row.

| key | English | Urdu | what to check | ✓ / correction |
|---|---|---|---|---|
| `oedit.moneyCredit` | {amount} will come off this customer's khata. | اس گاہک کے کھاتے سے {amount} کم ہو جائیں گے۔ | I used **کھاتہ**, which is the shopkeeper's own word — the one place in this batch where the trade term needed no substitute. |  |
| `oedit.moneyPrepaid` | Already paid online — {amount} will be kept as credit at your shop for this customer. | آن لائن ادائیگی ہو چکی ہے — {amount} اس گاہک کے لیے آپ کی دکان پر جمع رہیں گے۔ | I used **جمع** for credit standing at the shop, the natural counterpart to کھاتہ. |  |
| `oedit.moneyCash` | Collect {amount} less when you hand the order over. | آرڈر دیتے وقت {amount} کم لیں۔ | Means collect LESS at handover. If it can be read as "collect {amount}", it is wrong. |  |
| `orej.prepaidCredit` | Paid online — the amount becomes credit for this customer at your shop. There is no refund. | آن لائن ادائیگی ہو چکی ہے — یہ رقم اس گاہک کے لیے آپ کی دکان پر جمع ہو جائے گی۔ رقم واپس نہیں ہوتی۔ | Same trap: credit at the shop, never a refund. Highest-stakes string in the file. |  |
| `oedit.reducedBy` | You are taking off {amount}. | آپ {amount} کم کر رہے ہیں۔ | The amount being taken OFF, not the new total. |  |
| `oedit.feeMayChange` | If this takes the order under your free-delivery amount, the delivery fee is recalculated when you confirm. | اگر اس سے آرڈر آپ کی مفت ترسیل کی رقم سے کم ہو جائے، تو پکا کرتے وقت ترسیل کی فیس دوبارہ لگائی جائے گی۔ | ترسیل is this block's word for delivery (ful.delivery), so I used it here rather than ڈیلیوری — but more.delivery keeps ڈیلیوری because it is a feature name. Flag the inconsistency if it jars. |  |
| `txn.adjustment` | Adjustment | ردوبدل | I used **ردوبدل**. I considered کمی بیشی, which is more of a shop phrase, and ایڈجسٹمنٹ, which is a bare transliteration. Tell me which belongs on a ledger row. |  |
| `oedit.originalSubtotal` | Original subtotal | اصل ذیلی کل | The subtotal BEFORE the reduction. |  |
| `orej.reject` | Reject | مسترد کریں | I chose **مسترد کریں**, deliberately NOT منسوخ, because منسوخ is already ostatus.cancelled. A shopkeeper may prefer "واپس کر دیں". |  |
| `orej.confirm` | Reject order | آرڈر مسترد کریں | The button that actually rejects. Same reject/cancel distinction. |  |
| `orej.title` | Reject this order? | یہ آرڈر مسترد کریں؟ | Same reject/cancel distinction. |  |
| `orej.done` | Order rejected. | آرڈر مسترد کر دیا گیا۔ | Same reject/cancel distinction. |  |
| `orej.help` | Tell the customer why — it is sent to them with the cancellation. | گاہک کو وجہ بتائیں — منسوخی کے ساتھ اُسے بھیجی جائے گی۔ | The reason is sent to the customer. Check it reads as "we will pass this on", not "write it down for yourself". |  |
| `oalert.accept` | Accept | قبول کریں | I chose **قبول کریں** to match قبول شدہ already in this block. |  |
| `eta.accept` | Accept | قبول کریں | Same word as oalert.accept on purpose. If you change one, change both. |  |
| `eta.acceptTitle` | Accept this order | یہ آرڈر قبول کریں | Same word as oalert.accept on purpose. |  |
| `eta.noTime` | Accept without a time | وقت بتائے بغیر قبول کریں |  |  |
| `eta.notNow` | Not now | ابھی نہیں |  |  |
| `eta.accepting` | Accepting… | قبول ہو رہا ہے… |  |  |
| `oedit.start` | Not everything in stock? | سارا سامان موجود نہیں؟ | The prompt that opens order-reduction. Spoken, informal — "not everything in stock?" |  |
| `oedit.startBtn` | Reduce this order | یہ آرڈر کم کریں | REDUCE, not cancel and not edit. Nothing here can add or raise anything. |  |
| `oedit.title` | Reduce this order | یہ آرڈر کم کریں | Same word as oedit.startBtn on purpose. |  |
| `oedit.help` | Take off what you do not have. You can only REMOVE items or LOWER quantities — nothing here can add an item, raise a quantity or change a price. | جو آپ کے پاس نہیں ہے وہ نکال دیں۔ یہاں سے صرف چیزیں ہٹائی یا مقدار کم کی جا سکتی ہے — نئی چیز شامل کرنا، مقدار بڑھانا یا قیمت بدلنا یہاں سے ممکن نہیں۔ | The safety rule: only remove or lower. If the sentence leaves any room for "you can also add", it is wrong. |  |
| `oedit.confirm` | Confirm the new order | نیا آرڈر پکا کریں | Commits the smaller order. |  |
| `oedit.keep` | Leave it as it was | جیسا تھا ویسا ہی رہنے دیں | Backs out without changing anything. |  |
| `oedit.saved` | The order has been reduced. The customer has been told what changed. | آرڈر کم کر دیا گیا۔ گاہک کو بتا دیا گیا ہے کہ کیا بدلا۔ | Also states the customer has been told. Both halves matter. |  |
| `oedit.noChange` | Nothing has been changed yet. | ابھی کچھ نہیں بدلا گیا۔ |  |  |
| `oedit.cancelInstead` | You have taken off everything. Cancel the order instead. | آپ نے سب کچھ نکال دیا ہے۔ اس کے بجائے آرڈر ہی منسوخ کر دیں۔ | Only shown when everything has been taken off. Points at CANCEL, a different action from reduce. |  |
| `oedit.thenAccept` | Now accept it and tell the customer when it will be ready. | اب اسے قبول کریں اور گاہک کو بتائیں کہ کب تک تیار ہوگا۔ | Two instructions in one line: accept, then promise a time. |  |
| `oedit.remove` | Remove | ہٹائیں | Take an item off this order — not "delete the product from my catalogue". |  |
| `oedit.restore` | Put back | واپس ڈالیں | Put a removed item back. |  |
| `oedit.removedTag` | Removed | ہٹا دیا |  |  |
| `oedit.saving` | Saving… | محفوظ ہو رہا ہے… |  |  |
| `oedit.was` | Was {was} | پہلے {was} | Renders next to the new quantity. {was} is the old one. |  |
| `oedit.wasNow` | Was {was} — now {now} | پہلے {was} — اب {now} | Old quantity then new. Check the order of the two placeholders reads right. |  |
| `oedit.historyTitle` | What was taken off | کیا کیا نکالا گیا |  |  |
| `oedit.historyRemoved` | {item} — removed | {item} — ہٹا دیا |  |  |
| `oedit.historyUnknownWho` | the shop | دکان | Stands in for a person's name in "{who}, {when}" — it must read like an actor ("the shop"), not like a place. |  |
| `ord.notFound` | Order not found. | آرڈر نہیں ملا۔ |  |  |
| `ord.cancelConfirm` | Cancel this order? This cannot be undone. | یہ آرڈر منسوخ کریں؟ یہ واپس نہیں ہو سکتا۔ | CANCEL, and it cannot be undone. Check the second sentence is not the same word as "cancel" doing double duty. |  |
| `orej.r1` | Out of stock | سامان ختم ہے | One-tap reason. Short and spoken. |  |
| `orej.r2` | Too busy right now | ابھی بہت رش ہے | One-tap reason. Short and spoken. |  |
| `orej.r3` | Shop is closing | دکان بند ہو رہی ہے | One-tap reason. Short and spoken. |  |
| `orej.placeholder` | Another reason (optional) | کوئی اور وجہ (اختیاری) |  |  |
| `orej.back` | Back | واپس |  |  |
| `custd.recordAction` | Record payment / purchase | ادائیگی / خریداری درج کریں | Two things on one button: money coming IN and goods going OUT on credit. |  |
| `add.invalidAmount` | Enter a valid amount | درست رقم درج کریں | Money validation. |  |
| `addtx.missingBody` | Pick a customer and amount | گاہک اور رقم منتخب کریں | Money validation. |  |
| `addtx.selectedCustomer` | Selected customer | منتخب گاہک |  |  |
| `addtx.notePlaceholder` | note | نوٹ |  |  |
| `famd.combinedLimit` | Combined limit | مشترکہ حد | The whole family's cap. |  |
| `famd.subLimit` | sub-limit {amt} | ذیلی حد {amt} | A per-member cap inside a family limit. |  |
| `famd.reminderSent` | WhatsApp reminder sent. Combined outstanding: {amt}. | WhatsApp یاد دہانی بھیج دی گئی۔ مشترکہ بقایا: {amt}۔ | Urdu full stops (۔) throughout, matching the existing block. No direction marks are inserted anywhere. |  |
| `famd.reminderNotSent` | Not sent (payer may have notifications off). Combined outstanding: {amt}. | نہیں بھیجی گئی (ادا کنندہ نے اطلاعات بند کر رکھی ہوں گی)۔ مشترکہ بقایا: {amt}۔ | Says it did NOT go out. If that reads as "sent", a shopkeeper stops chasing a real debt. |  |
| `famd.payerLabel` | Payer | ادا کنندہ | The family member who settles the bill. |  |
| `famd.payerTag` | (payer) | (ادا کنندہ) |  |  |
| `famd.notSet` | not set | مقرر نہیں |  |  |
| `ins.purchases` | Purchases | خریداری | Goods sold on credit over the window — the same idea as txn.purchase, and I used the same word. |  |
| `ins.collections` | Collections | وصولی | وصولی was already in this block for dash.todayCollections and I kept it everywhere. |  |
| `ins.withDues` | With dues | بقایا والے | Customers who owe. |  |
| `ins.newCustomers` | New customers | نئے گاہک |  |  |
| `ins.daysN` | {d} days | {d} دن |  |  |
| `cat.editPrice` | Edit ₹ | ₹ بدلیں | A tight button; only the rupee sign and a verb fit. |  |
| `cat.editPriceTitle` | Edit price (₹) | قیمت بدلیں (₹) |  |  |
| `cat.setPrice` | Set price (₹) | قیمت مقرر کریں (₹) |  |  |
| `cat.indicative` | Indicative | تخمینی | A catalogue price that is a guide, not the shop's own price. |  |
### 2. The new-order alert (some of it is read aloud)

`oalert.spoken` and the lines around it are spoken by text-to-speech in a noisy shop. Read them out loud, not just with your eyes.

| key | English | Urdu | what to check | ✓ / correction |
|---|---|---|---|---|
| `oalert.spoken` | New order. {name}. {n} items. {amount} rupees. | نیا آرڈر۔ {name}۔ {n} اشیاء۔ {amount} روپے۔ | READ ALOUD by text-to-speech in a noisy shop. Say it out loud before approving: no abbreviations, no symbols, and it must survive a name dropping into {name}. |  |
| `oalert.title` | New order waiting | نیا آرڈر انتظار میں | Heard as a notification title on many devices. |  |
| `oalert.items` | {n} items | {n} اشیاء | Also read aloud as part of the alert. Plural form is fixed — {n} may be 1. |  |
| `oalert.more` | +{n} more | +{n} مزید |  |  |
| `oalert.waiting` | waiting {mins} min | {mins} منٹ سے انتظار |  |  |
| `oalert.stillWaiting` | Still waiting — you have not answered this one yet. | ابھی بھی انتظار میں — آپ نے اس کا جواب نہیں دیا۔ | Nagging, not scolding. Check the tone. |  |
| `oalert.decide` | This keeps alerting until you accept or reject it. | جب تک آپ قبول یا مسترد نہیں کرتے، اطلاع آتی رہے گی۔ | States the alert will not stop until accepted or rejected. Both verbs must be the ones used on the buttons. |  |
| `oalert.snooze` | Not now — {mins} min | ابھی نہیں — {mins} منٹ | "Not now" — quiets ONE order briefly. Must not read as "reject". |  |
| `oalert.snoozedFor` | Quiet for {mins} more min | مزید {mins} منٹ خاموش | Must not read as "alerts are off". |  |
| `oalert.open` | Open | کھولیں |  |  |
| `oalert.mute30` | Mute for 30 minutes | 30 منٹ خاموش |  |  |
| `oalert.unmute` | Turn alerts back on | اطلاعات دوبارہ چالو کریں |  |  |
| `oalert.noVoice` | This device cannot speak your language yet — you will still see the banner. | یہ فون ابھی آپ کی زبان نہیں بول سکتا — بینر پھر بھی نظر آئے گا۔ | Says the phone cannot speak this language; the banner still shows. |  |
| `oalert.setTitle` | Order alerts | آرڈر اطلاعات |  |  |
| `oalert.setHelp` | A new order keeps alerting you — here and on WhatsApp — until you ACCEPT it or REJECT it. Not now only quiets one order for a few minutes; it never stops the alert. | نیا آرڈر آنے پر یہاں اور WhatsApp پر اُس وقت تک اطلاع آتی رہے گی جب تک آپ اسے قبول یا مسترد نہ کر دیں۔ ”ابھی نہیں“ صرف ایک آرڈر کو چند منٹ کے لیے خاموش کرتا ہے؛ اطلاع بند نہیں کرتا۔ | The longest string in the batch and the one that explains the whole alert contract. Read it slowly. |  |
| `oalert.setEnabled` | Alert me about new orders | نئے آرڈر کی اطلاع دیں |  |  |
| `oalert.setRepeat` | Repeat every (minutes) | ہر کتنے منٹ بعد |  |  |
| `oalert.setMaxRepeats` | Stop after (repeats) | کتنی بار کے بعد رکیں |  |  |
| `oalert.setMuteNow` | Mute for 30 minutes | 30 منٹ خاموش |  |  |
| `oalert.setMuted` | Alerts are muted right now. | ابھی اطلاعات خاموش ہیں۔ |  |  |
| `oalert.setSaved` | Order alert settings saved. | آرڈر اطلاع کی ترتیبات محفوظ ہو گئیں۔ |  |  |
| `oalert.setClamped` | Your value was adjusted to the nearest allowed one. | آپ کا دیا ہوا نمبر قریب ترین جائز نمبر میں بدل دیا گیا۔ | The value the shopkeeper typed was changed for them. |  |
### 3. Ready-time promises and shop availability

Promises made to a customer, and whether the shop is open. Wrong here and a customer turns up to a shut shop.

| key | English | Urdu | what to check | ✓ / correction |
|---|---|---|---|---|
| `eta.pickTime` | Ready in about… | تقریباً کتنی دیر میں تیار… | A question with a trailing ellipsis, answered by the chips below it. |  |
| `eta.chipMin` | ~{n} min | ~{n} منٹ |  |  |
| `eta.chipHour` | ~{n} hour | ~{n} گھنٹہ |  |  |
| `eta.chipHourMin` | ~{h} hr {m} min | ~{h} گھنٹہ {m} منٹ | Two placeholders in one chip, very little room. |  |
| `eta.promisedBy` | You promised ready by {time} | آپ نے {time} بجے تک تیار ہونے کو کہا ہے | A promise already made to the customer. |  |
| `eta.noPromise` | No ready time promised | تیار ہونے کا وقت نہیں بتایا گیا |  |  |
| `eta.needMore` | Need more time | مزید وقت چاہیے |  |  |
| `eta.needMoreHelp` | Pick a new time — the customer is told straight away. | نیا وقت چنیں — گاہک کو فوراً بتا دیا جائے گا۔ |  |  |
| `eta.sent` | The customer has been told the new time. | گاہک کو نیا وقت بتا دیا گیا۔ |  |  |
| `eta.late` | Past the time you promised | آپ کے بتائے وقت سے دیر ہو چکی ہے | The promise has been missed. Factual, not accusing. |  |
| `eta.readyBy` | Ready by {time} | {time} بجے تک تیار |  |  |
| `eta.takingLonger` | Taking a little longer | تھوڑا زیادہ وقت لگ رہا ہے |  |  |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} بجے تک تیار ہونا تھا۔ بس تھوڑی ہی دیر اور۔ | Reassurance after a missed promise. |  |
| `open.open` | Open | کھلی |  |  |
| `open.closed` | Closed | بند |  |  |
| `open.todayAt` | at {time} | {time} بجے |  |  |
| `open.tomorrowAt` | tomorrow at {time} | کل {time} بجے |  |  |
| `open.title` | Shop availability | دکان کھلی ہے یا بند |  |  |
| `open.switchLabel` | Shop is open | دکان کھلی ہے |  |  |
| `open.takingOrders` | You are taking orders right now. | آپ ابھی آرڈر لے رہے ہیں۔ |  |  |
| `open.notTakingOrders` | Customers cannot order right now. | گاہک ابھی آرڈر نہیں کر سکتے۔ |  |  |
| `open.stateClosed` | Closed — you switched the shop off | بند — آپ نے دکان بند کر رکھی ہے |  |  |
| `open.statePaused` | Paused — back {when} | کچھ دیر بند — {when} کھلے گی | {when} is a time. Check the sentence still parses when a time drops in. |  |
| `open.stateHoliday` | Closed today — reopens {when} | آج بند — {when} پھر کھلے گی |  |  |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | آج بند ({reason}) — {when} پھر کھلے گی |  |  |
| `open.stateHours` | Closed — opens {when} | بند — {when} کھلے گی |  |  |
| `open.pauseHelp` | Shutting for a bit? One tap, no time picker. | تھوڑی دیر بند کرنی ہے؟ ایک ٹیپ، وقت چننے کی ضرورت نہیں۔ |  |  |
| `open.pause30` | 30 min | 30 منٹ |  |  |
| `open.pause60` | 1 hour | 1 گھنٹہ |  |  |
| `open.pauseToday` | Rest of today | آج باقی وقت | Rest of TODAY, not all day. |  |
| `open.resume` | Resume now | ابھی کھولیں |  |  |
| `open.hoursTitle` | Shop hours | دکان کا وقت |  |  |
| `open.hoursHelp` | Set the daily opening and closing time, or leave both empty to stay open all day. A closing time earlier than the opening time means you stay open past midnight. | روز کھلنے اور بند ہونے کا وقت بھریں، یا دونوں خالی چھوڑ دیں تو دکان سارا دن کھلی مانی جائے گی۔ بند ہونے کا وقت کھلنے کے وقت سے پہلے رکھیں تو دکان آدھی رات کے بعد تک کھلی رہتی ہے۔ | Contains the past-midnight rule, which is easy to lose in translation. |  |
| `open.openTime` | Opens at | کھلنے کا وقت |  |  |
| `open.closeTime` | Closes at | بند ہونے کا وقت |  |  |
| `open.timePlaceholder` | HH:MM | گھنٹہ:منٹ | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| `open.alwaysOpen` | No daily hours set — open all day. | کوئی وقت مقرر نہیں — دکان سارا دن کھلی ہے۔ |  |  |
| `open.saveHours` | Save hours | وقت محفوظ کریں |  |  |
| `open.clearHours` | Clear hours | وقت ہٹائیں |  |  |
| `open.hoursIncomplete` | Set both the opening and the closing time, or clear both. | کھلنے اور بند ہونے — دونوں کا وقت بھریں، یا دونوں ہٹا دیں۔ |  |  |
| `open.closuresTitle` | Holiday closures | چھٹی کے دن |  |  |
| `open.closuresHelp` | Add the dates your shop will be shut — a festival, a wedding, anything. Customers see it before they order. | جن دنوں دکان بند رہے گی وہ تاریخیں شامل کریں — تہوار، شادی، کچھ بھی۔ گاہکوں کو آرڈر کرنے سے پہلے ہی نظر آ جائے گا۔ |  |  |
| `open.closureDate` | Date (YYYY-MM-DD) | تاریخ (YYYY-MM-DD) | The YYYY-MM-DD is the literal format the field wants; leave it in Latin. |  |
| `open.closureReason` | Reason (optional) | وجہ (اختیاری) |  |  |
| `open.closureReasonPlaceholder` | Diwali | دیوالی |  |  |
| `open.addClosure` | Add date | تاریخ شامل کریں |  |  |
| `open.noClosures` | No closures in the next 90 days. | اگلے 90 دن میں کوئی چھٹی نہیں۔ |  |  |
| `open.removeClosure` | Remove | ہٹائیں |  |  |
### 4. Routine chrome

Labels, buttons and empty states. Skim these; the risk is low.

| key | English | Urdu | what to check | ✓ / correction |
|---|---|---|---|---|
| `common.close` | Close | بند کریں |  |  |
| `common.error` | Error | خرابی |  |  |
| `common.failed` | Failed | ناکام |  |  |
| `common.missing` | Missing | ادھورا | Alert title shown when a required field is empty. |  |
| `common.go` | Go | جائیں |  |  |
| `common.keep` | Keep | رہنے دیں | The "do nothing" half of a destructive confirm. |  |
| `common.retry` | Retry | دوبارہ کوشش کریں |  |  |
| `common.loadFailed` | Could not load. Check your connection and try again. | لوڈ نہیں ہو سکا۔ اپنا کنکشن دیکھ کر دوبارہ کوشش کریں۔ |  |  |
| `title.addTransaction` | Add transaction | لین دین شامل کریں |  |  |
| `login.subtitle` | Sign in to manage your shop | اپنی دکان چلانے کے لیے سائن ان کریں |  |  |
| `login.failed` | Login failed | سائن ان ناکام |  |  |
| `admin.title` | Admin account | ایڈمن اکاؤنٹ |  |  |
| `admin.body` | This app is for shop owners. Please use the web admin console to manage the platform. | یہ ایپ دکان مالکان کے لیے ہے۔ پلیٹ فارم چلانے کے لیے ویب ایڈمن کنسول استعمال کریں۔ |  |  |
| `admin.signOut` | Sign out | سائن آؤٹ |  |  |
| `dash.newTransaction` | New transaction | نیا لین دین |  |  |
| `dash.viewCustomers` | View customers | گاہک دیکھیں |  |  |
| `cust.empty` | No customers yet. | ابھی کوئی گاہک نہیں۔ |  |  |
| `custd.notFound` | Customer not found. | گاہک نہیں ملا۔ |  |  |
| `cat.adding` | Adding… | شامل ہو رہا ہے… |  |  |
| `cat.active` | Active | فعال |  |  |
| `cat.hidden` | Hidden | چھپا ہوا |  |  |
| `cat.deleteTitle` | Delete product | پروڈکٹ حذف کریں |  |  |
| `cat.missingName` | Enter a product name | پروڈکٹ کا نام درج کریں |  |  |
| `cat.myProducts` | My products | میری مصنوعات |  |  |
| `cat.searchCatalogue` | Search catalogue | کیٹلاگ میں تلاش کریں |  |  |
| `cat.added` | Added | شامل ہو گیا |  |  |
| `cat.noCatalogue` | No catalogue items found. | کیٹلاگ میں کچھ نہیں ملا۔ |  |  |
| `fam.new` | New family | نیا خاندان |  |  |
| `fam.creating` | Creating… | بن رہا ہے… |  |  |
| `fam.empty` | No families yet. | ابھی کوئی خاندان نہیں۔ |  |  |
| `fam.missingName` | Enter a family name | خاندان کا نام درج کریں |  |  |
| `famd.notFound` | Family not found. | خاندان نہیں ملا۔ |  |  |
| `famd.noCandidates` | No other customers available to add. | شامل کرنے کے لیے کوئی اور گاہک نہیں۔ |  |  |
| `famd.removeTitle` | Remove member | رکن ہٹائیں |  |  |
| `famd.reminderTitle` | Reminder | یاد دہانی |  |  |
| `ins.csvFootnote` | CSV report export is available on the web dashboard. | CSV رپورٹ ایکسپورٹ ویب ڈیش بورڈ پر دستیاب ہے۔ |  |  |
| `setn.silent` | Silent | خاموش | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.smart` | Smart | اسمارٹ | One of three customer-notification modes: Silent / Smart / Active. |  |
| `setn.active` | Active | فعال | One of three customer-notification modes: Silent / Smart / Active. |  |
| `set.savedTitle` | Saved | محفوظ ہو گیا |  |  |
| `set.shopSaved` | Shop settings updated. | دکان کی ترتیبات اپ ڈیٹ ہو گئیں۔ |  |  |
| `set.connOkTitle` | Connection OK | کنکشن ٹھیک ہے |  |  |
| `set.connFailedTitle` | Connection failed | کنکشن ناکام |  |  |
| `set.connOkMsg` | Your Razorpay keys work. | آپ کی Razorpay کیز کام کر رہی ہیں۔ |  |  |
| `set.connFailedMsg` | Check your keys. | اپنی کیز جانچیں۔ |  |  |
| `set.listShop` | List my shop for nearby customers | قریبی گاہکوں کے لیے میری دکان فہرست میں شامل کریں |  |  |
| `set.discoverySaved` | Discovery settings updated. | دریافت کی ترتیبات اپ ڈیٹ ہو گئیں۔ |  |  |
| `set.signOut` | Sign out | سائن آؤٹ |  |  |
| `set.signOutConfirm` | Sign out of this account? | اس اکاؤنٹ سے سائن آؤٹ کریں؟ |  |  |
| `more.familiesSub` | Group customers, shared credit & reminders | گاہکوں کو ایک ساتھ رکھیں، مشترکہ ادھار اور یاد دہانی |  |  |
| `more.insightsSub` | Analytics overview & aging | تجزیے کا خلاصہ اور بقایا کی عمر |  |  |
| `more.settingsSub` | Shop, payments & discovery | دکان، ادائیگیاں اور دریافت |  |  |
| `more.moreFeatures` | More features | مزید سہولتیں |  |  |
| `more.credits` | Khata Credits & Referral | کھاتہ کریڈٹ اور ریفرل | A feature name. "Khata Credits" is shop currency, not a bank credit. |  |
| `more.creditsSub` | Earn & spend credits, invite shops | کریڈٹ کمائیں اور خرچ کریں، دکانیں مدعو کریں |  |  |
| `more.promote` | Boost & Branded Store | بوسٹ اور برانڈڈ اسٹور | A feature name; kept close to the English the way Hindi does. |  |
| `more.promoteSub` | Promote your shop, premium storefront | اپنی دکان کی تشہیر کریں، پریمیم اسٹور |  |  |
| `more.delivery` | Delivery Champions | ڈیلیوری چیمپیئنز | A feature name; kept close to the English the way Hindi does. |  |
| `more.deliverySub` | Assign deliveries & share status links | ڈیلیوری سونپیں اور اسٹیٹس لنک بھیجیں |  |  |
| `more.poster` | Share Poster | پوسٹر بھیجیں |  |  |
| `more.posterSub` | Shareable shop poster for WhatsApp/IG/FB | WhatsApp/IG/FB کے لیے دکان کا پوسٹر |  |  |

## Bengali, Marathi and Gujarati — one key each

These three were already at 315 keys from batch LANG. This batch added a single string to
each: the shop-hours field hint, which Hindi spells out as `घंटा:मिनट` rather than leaving
the Latin `HH:MM` on screen.

| language | key | English | translation | what to check | ✓ / correction |
|---|---|---|---|---|---|
| Bengali | `open.timePlaceholder` | HH:MM | ঘণ্টা:মিনিট | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| Marathi | `open.timePlaceholder` | HH:MM | तास:मिनिट | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |
| Gujarati | `open.timePlaceholder` | HH:MM | કલાક:મિનિટ | Field hint for a HH:MM input. Hindi spells it out; so does this. Say if the Latin "HH:MM" would be clearer. |  |

## Deliberately still in English

These keys were left out of the language blocks rather than filled with a value identical
to the English one. The dictionary falls back to `en` for a missing key, so the screen is
unchanged either way — but an absent key is honest about the gap, while a duplicated row
would inflate `scripts/i18n-coverage.mjs` without changing a single pixel. This follows the
rule already written at the top of `mobile-app/src/i18n.js`.

| key | English | why |
|---|---|---|
| `app.name` | Smart Digital Khata | Brand name. Not translated in any language, including Hindi. Absent in: ta, te, kn, ml, ur, bn, mr, gu. |
| `app.shortName` | Smart Khata | Brand name. Not translated in any language, including Hindi. Absent in: ta, te, kn, ml, ur, bn, mr, gu. |
| `title.dashboard` | Smart Khata | Renders the brand name "Smart Khata". Absent in: ta, te, kn, ml, ur, bn, mr, gu. |
| `txn.upi` | UPI | Brand/scheme name. Written UPI in every Indian language. Absent in: bn, mr, gu. |
| `oedit.historyReduced` | {item} — {before} → {after} | Placeholders and punctuation only — no words to translate. Absent in: ta, te, kn, ml, ur, bn, mr, gu. |
| `oedit.historyBy` | {who}, {when} | Placeholders and punctuation only — no words to translate. Absent in: ta, te, kn, ml, ur, bn, mr, gu. |
| `set.razorpayKeyId` | Razorpay Key ID | The exact label on the Razorpay console the shopkeeper is copying from. Absent in: bn, mr, gu. |
| `set.keySecret` | Key Secret | The exact label on the Razorpay console the shopkeeper is copying from. Absent in: bn, mr, gu. |
| `set.webhookSecret` | Webhook Secret | The exact label on the Razorpay console the shopkeeper is copying from. Absent in: bn, mr, gu. |

`txn.upi`, `set.razorpayKeyId`, `set.keySecret` and `set.webhookSecret` are PRESENT in the
`ta`/`te`/`kn`/`ml`/`ur` blocks holding the English text, because an earlier batch copied
them across from the web dictionary that way. They are left alone; changing them now would
lower the coverage floor for no gain on screen.

## One thing this batch did not do

`BETA_LANGS` in `mobile-app/src/i18n.js` still marks only `bn`, `gu` and `mr` as beta. On
the reasoning written next to that set — the marker means "not yet read by a native
speaker" — `ta`, `te`, `kn`, `ml` and `ur` now qualify too, since 197 of their strings are
machine-authored. This batch deliberately did not touch that flag. Whoever owns it should
decide whether it should widen until this sheet comes back checked.
