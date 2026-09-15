# Shopper app: Tamil, Telugu, Kannada and Malayalam — review sheet

Batch DRAVIDIAN-CONSUMER. Every string listed here was written by a model and **no native
speaker has read any of it**. It ships because the alternative was an English screen in
front of a shopper who does not read English, and plain unreviewed text beats that — but
nothing here is confirmed until somebody who speaks the language signs it off.

This file is GENERATED from the values as they are shipped in
`mobile-app/src/consumer/i18n.js`, so it cannot drift from what a shopper actually sees.
If you change a string in that file, regenerate or amend the row here to match.

## How to use it

Rows are ordered **worst-first**. The money and khata band is at the top of every
language because a wrong word there costs a shopper money; then orders and shop hours,
where a wrong word costs a wasted trip; then the judgement calls; then routine chrome.
Reading only the first band in your language is twenty rows and about ten minutes, and
it covers everything that can actually hurt someone.

In the last column put a tick if the line is fine, or write the line you would use.
Keep every `{placeholder}` exactly as it is — the app substitutes real values into them,
and a renamed or dropped one renders as literal `{amount}` to a customer. Leave `UPI`,
`CSV`, `YYYY-MM-DD` and brand names in Latin.

## The one rule that must not break

Money the shop **HOLDS** for a shopper and money the shopper **OWES** the shop must never
share a word. A previous batch shipped Bengali where they did, and a shopper reading how
khata works was told their debt was a credit. In this batch `coedit.prepaid` and
`ref.creditBalance` carry the in-your-favour word; `coedit.credit`, `account.prepaySub`
and the khata strings carry the dues word; the two vocabularies were checked against each
other before this landed. If a correction below moves a word from one side to the other,
say so explicitly.

## What was not authored here

Fourteen rows per language are the owner app word for word — the shop-hours lines, the
ready-time lines and `{item} — removed` — so a shopper and a shopkeeper discussing the
same order read the same words. They are marked in the notes; correcting one means
correcting `mobile-app/src/i18n.js` in the same breath.

`upd.runtime` and `upd.channel` were left untranslated on purpose. They label two Expo
build tokens whose values are English identifiers, so they fall back to English and each
language stops at 341 of English's 343 keys.

## Tamil (தமிழ்) — 112 strings

### Money, khata and credit

Wrong here costs a shopper money or tells them a debt is a credit. Read every row.

| Key | English | Tamil as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `coedit.credit` | {amount} has been taken off your khata at this shop. | இந்தக் கடையில் உங்கள் கணக்கில் இருந்து {amount} குறைக்கப்பட்டுள்ளது. | Uses கணக்கில் இருந்து குறைக்கப்பட்டுள்ளது — taken off the khata. No வரவு/முன்பணம் anywhere in it. | |
| `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | நீங்கள் ஏற்கனவே பணம் கட்டிவிட்டீர்கள். {amount} இந்தக் கடையில் உங்களுக்கு வரவாக இருக்கும் — இங்கே அடுத்த ஆர்டரில் குறையும். | Uses வரவு, the owner app's word for money standing in the customer's favour. Debt is கடன்/பாக்கி and never appears here. | |
| `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | எடுக்கும்போது {now} கொடுங்கள் — {amount} மதிப்புள்ள பொருட்கள் நீக்கப்பட்டன. | Two amounts in one line: {now} is what to hand over, {amount} is what came off. Check they cannot be swapped. | |
| `txn.adjustment` | Adjusted by shop | கடை சரிசெய்தது | சரிசெய்தது follows the owner app's சரிசெய்தல். Would a counter say this, or something plainer? | |
| `stmt.totalAdjusted` | Adjusted by shop | கடை சரிசெய்தது | Same string as txn.adjustment. Keep them identical. | |
| `account.prepaySub` | Pre-load credit & clear dues on the web | வெப் ஆப்பில் முன்பணம் போடுங்கள், பாக்கியைத் தீருங்கள் | முன்பணம் (advance, in your favour) against பாக்கி (dues). Two different words on purpose. | |
| `ref.creditBalance` | Your referral credit | உங்கள் பரிந்துரை வரவு | வரவு again, matching coedit.prepaid. | |
| `account.prepay` | Pay in advance | முன்பணம் செலுத்து | The advance word from this block's khata.advance. | |
| `txn.upi` | UPI paid | UPI செலுத்தியது | Ledger row, matched to this block's txn.cash phrasing. UPI stays UPI. | |
| `coedit.title` | The shop adjusted your order | கடை உங்கள் ஆர்டரைக் குறைத்துள்ளது | The shop cut the order down. "Adjusted" is rendered as reduced, which is what happened. | |
| `coedit.intro` | {shop} could not supply everything you ordered. | {shop} இல் நீங்கள் கேட்ட எல்லாப் பொருளும் இல்லை. | {shop} is the shop name. | |
| `coedit.nowTotal` | Your order now comes to {now}. | உங்கள் ஆர்டர் இப்போது {now} ஆகிறது. | The new total to be paid. | |
| `coedit.wasSubtotal` | Original items total {was} | முதலில் இருந்த பொருட்களின் மொத்தம் {was} | The total BEFORE the cut. Must not be mistaken for the new one. | |
| `coedit.removed` | {item} — removed | {item} — அகற்றப்பட்டது | Verbatim from the owner app (oedit.historyRemoved) so both sides read alike. | |
| `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only. Left byte-identical to English on purpose — there is nothing to translate. | |
| `stmt.opening` | Opening balance | தொடக்க இருப்பு | Balance at the start of the range. | |
| `stmt.closing` | Closing balance | முடிவு இருப்பு | Balance at the end of the range. | |
| `stmt.totalPurchases` | Total purchases | மொத்த வாங்குதல் | Sum of buying, from this block's txn.purchase word. | |
| `stmt.totalPaid` | Total paid | மொத்தம் செலுத்தியது | Sum of payments, from this block's txn.payment word. | |
| `stmt.combined` | Combined total | எல்லாம் சேர்த்து மொத்தம் | Total across all shops. | |

### Orders, shop hours and ready times

Wrong here costs a wasted trip or a lost sale. Ten of these are the owner app word for word.

| Key | English | Tamil as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `open.bannerTitle` | This shop is closed right now | இந்தக் கடை இப்போது மூடியிருக்கிறது | Banner over a closed shop. | |
| `open.cannotOrder` | Closed — cannot order | மூடியிருக்கிறது — ஆர்டர் செய்ய முடியாது | Button-side label. Short. | |
| `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | இந்தக் கடை இப்போது மூடியிருக்கிறது, அதனால் ஆர்டர் செய்ய முடியாது. உங்கள் கூடை சேமிக்கப்பட்டுள்ளது. | Says the cart is kept. A shopper must not fear losing it. | |
| `open.browseOnly` | You can look around — ordering opens again when the shop does. | நீங்கள் பார்க்கலாம் — கடை திறந்ததும் மீண்டும் ஆர்டர் செய்யலாம். | Reassurance: looking is fine, ordering is not. | |
| `open.stateClosed` | Closed — the shop is switched off right now | மூடியிருக்கிறது — கடை இப்போது அணைத்து வைக்கப்பட்டுள்ளது | Shopper-facing rewrite of the owner app's "you switched the shop off". | |
| `open.open` | Open | திறந்திருக்கிறது | Verbatim from the owner app. | |
| `open.closed` | Closed | மூடியிருக்கிறது | Verbatim from the owner app. | |
| `open.closedPill` | Closed | மூடியிருக்கிறது | Same word as open.closed; it is a pill on the shop card. | |
| `open.statePaused` | Paused — back {when} | சிறிது நேரம் நிறுத்தம் — {when} திரும்பும் | Verbatim from the owner app. {when} is a time phrase. | |
| `open.stateHoliday` | Closed today — reopens {when} | இன்று மூடியிருக்கிறது — {when} திறக்கும் | Verbatim from the owner app. | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | இன்று மூடியிருக்கிறது ({reason}) — {when} திறக்கும் | Verbatim from the owner app. {reason} is free text the shopkeeper typed. | |
| `open.stateHours` | Closed — opens {when} | மூடியிருக்கிறது — {when} திறக்கும் | Verbatim from the owner app. | |
| `open.todayAt` | at {time} | {time} மணிக்கு | Verbatim from the owner app. Substituted INTO the state lines, so it must read on from them. | |
| `open.tomorrowAt` | tomorrow at {time} | நாளை {time} மணிக்கு | Verbatim from the owner app. Same: it is substituted into {when}. | |
| `eta.readyBy` | Ready by {time} | {time} மணிக்குள் தயார் | Verbatim from the owner app. | |
| `eta.takingLonger` | Taking a little longer | கொஞ்சம் அதிக நேரம் ஆகிறது | Verbatim from the owner app. | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} மணிக்குள் தயாராக வேண்டியது. இன்னும் அதிக நேரம் ஆகாது. | Verbatim from the owner app. | |
| `eta.noPromise` | No ready time promised | தயாராகும் நேரம் சொல்லப்படவில்லை | Verbatim from the owner app. | |
| `cart.restoring` | Getting your cart… | உங்கள் கூடை வருகிறது… | Shown while the saved cart loads. Must NOT read as "your cart is empty". | |
| `cart.switchShopTitle` | Cart at another shop | வேறு கடையில் கூடை | Uses the cart word this block's cart.switchShopConfirm already uses. | |
| `cart.switchShopClear` | Clear and start here | நீக்கிவிட்டு இங்கே தொடங்கு | Destructive button: it throws the other cart away. | |
| `orders.failedTitle` | Could not load your orders | உங்கள் ஆர்டர்களை ஏற்ற முடியவில்லை | A load FAILED — not "you have no orders". | |
| `shopdetail.failedTitle` | Could not load this shop | இந்தக் கடையை ஏற்ற முடியவில்லை | A load FAILED — not "this shop has nothing". | |
| `shops.failedTitle` | Could not load shops | கடைகளை ஏற்ற முடியவில்லை | A load FAILED — not "there are no shops". | |
| `psearch.failedTitle` | Search did not finish | தேடல் முடியவில்லை | The search FAILED — not "nothing found". | |

### Judgement calls

A word had to be chosen and a counter might use a different one. Cheap to fix, worth reading.

| Key | English | Tamil as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `account.manage` | Manage | நிர்வகி | நிர்வகி may be stiffer than a shopper would say. A plainer verb is welcome. | |
| `stmt.title` | Account statement | கணக்கு அறிக்கை | அறிக்கை, the word this block's chelp.e6.a already uses. | |
| `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | தொடக்க இருப்பு, தேர்ந்த காலத்தின் தேதிவாரியான பதிவுகள், முடிவு இருப்பு. | Three ideas in one line; check it is not too long for a small screen. | |
| `stmt.from` | From | முதல் | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.to` | To | வரை | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.view` | View | பார் | பார் is the block's plain-imperative register (சேர், மூடு, தேடு). Check it does not read as an order. | |
| `stmt.pickShop` | Choose a shop | கடையைத் தேர்ந்தெடுங்கள் | Picker label. | |
| `stmt.allShops` | All shops (combined) | எல்லாக் கடைகளும் (சேர்த்து) | Picker option meaning every shop added up. | |
| `stmt.rangeError` | The From date must be on or before the To date. | "முதல்" தேதி "வரை" தேதிக்கு முன்பாகவோ அதே நாளாகவோ இருக்க வேண்டும். | Quotes stmt.from and stmt.to. If either label changes, change this too. | |
| `stmt.noData` | No entries in this date range. | இந்த தேதி வரம்பில் பதிவுகள் இல்லை. | Empty range, not an error. | |
| `stmt.loadError` | Could not load the statement. | அறிக்கையை ஏற்ற முடியவில்லை. | Uses the same statement word as stmt.title. | |
| `ref.activatedOf` | {a} of {n} activated | {n} இல் {a} செயல்படுத்தப்பட்டது | Two numbers: {a} activated out of {n}. Check the order reads right in this language. | |
| `account.gender` | Gender | பாலினம் | Profile field label. | |
| `account.genderUnset` | Not set | குறிப்பிடவில்லை | Shown when nothing was chosen. | |
| `account.genderMale` | Male | ஆண் | Option. | |
| `account.genderFemale` | Female | பெண் | Option. | |
| `account.genderOther` | Other | மற்றவை | Option. | |
| `account.genderPreferNot` | Prefer not to say | சொல்ல விரும்பவில்லை | Option. Should sound like a choice, not a refusal. | |
| `account.dob` | Date of birth | பிறந்த தேதி | Profile field label. | |
| `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | பிறந்த தேதியை YYYY-MM-DD வடிவத்தில் எழுதுங்கள். | YYYY-MM-DD is deliberately left in Latin — it is the format the field accepts. | |
| `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ஃபோன் எண்தான் உங்கள் லாகின், இங்கே மாற்ற முடியாது. | Explains why the phone field is locked. | |
| `account.dataSaverSub` | Skip extra photos on slow networks | நெட் மெதுவாக இருந்தால் கூடுதல் படங்களைத் தவிர்க்கும் | What data saver does. Plain words for a slow connection. | |
| `voice.search` | Search by voice | குரலில் தேடு | Mic button label. Follows the phrasing this block's chelp.e2.a already uses for speaking to the app. | |
| `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | மைக் அனுமதி இல்லை. குரலில் தேட அமைப்புகளில் அதை இயக்குங்கள். | Points at the phone Settings app. | |
| `voice.hint.no-match` | Did not catch that. Please try again. | புரியவில்லை. மீண்டும் சொல்லுங்கள். | The app did not understand. Must not sound like it is blaming the shopper. | |
| `voice.hint.network` | Voice search needs the internet. Check your connection. | குரல் தேடலுக்கு இணையம் தேவை. உங்கள் இணைப்பைப் பாருங்கள். | Voice needs the internet. | |
| `voice.hint.unavailable` | Voice search is not available right now. | குரல் தேடல் இப்போது கிடைக்கவில்லை. | Temporary. | |
| `voice.notInLanguage` | Voice search is not available in this language yet. | இந்த மொழியில் குரல் தேடல் இன்னும் கிடைக்கவில்லை. | This language has no recognizer yet. | |
| `psearch.title` | Find an item | பொருளைத் தேடு | Screen title. | |
| `psearch.voiceIn` | Listens in {language} | {language} இல் கேட்கும் | {language} is the language name in its OWN script, dropped in as-is. | |
| `psearch.buyAgain` | Buy it again | மீண்டும் வாங்கு | Section over things bought before. | |
| `psearch.recent` | Recent searches | சமீபத்தில் தேடியவை | Section over recent searches. | |
| `psearch.clearRecent` | Clear | அழி | One word, clears the recent list. | |
| `psearch.browse` | Shop by category | வகை வாரியாக வாங்கு | Section over the category shelves. | |
| `shops.heroTitle` | What do you need today? | இன்று உங்களுக்கு என்ன வேண்டும்? | The greeting at the top of the shops screen. Should sound friendly, not formal. | |

### Routine chrome

Errors and the update card. A clumsy line here annoys; it does not cost anything.

| Key | English | Tamil as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `err.offline` | No internet right now. Check your connection and try again. | இப்போது இணையம் இல்லை. இணைப்பைப் பார்த்து மீண்டும் முயற்சிக்கவும். | No connection. | |
| `err.slow` | The network is too slow to finish that. Please try again. | நெட் மிக மெதுவாக இருப்பதால் அது முடியவில்லை. மீண்டும் முயற்சிக்கவும். | The connection was too slow to finish. | |
| `err.server` | Something went wrong at our end. Please try again in a moment. | எங்கள் பக்கம் ஏதோ தவறு. கொஞ்ச நேரம் கழித்து மீண்டும் முயற்சிக்கவும். | Our fault, not theirs. Must say so. | |
| `err.notFound` | That is not available any more. | அது இனி இல்லை. | The thing is gone. | |
| `err.notAllowed` | You cannot open this. | இதை நீங்கள் திறக்க முடியாது. | Not permitted. | |
| `err.signedOut` | You have been signed out. Please sign in again. | நீங்கள் வெளியேற்றப்பட்டீர்கள். மீண்டும் உள்நுழையவும். | Session expired. | |
| `err.tooMany` | Too many tries. Please wait a minute and try again. | அதிக முறை முயற்சித்தாகிவிட்டது. ஒரு நிமிடம் கழித்து மீண்டும் முயற்சிக்கவும். | Rate limited. | |
| `err.badRequest` | Something in that was not right. Please check and try again. | அதில் ஏதோ சரியில்லை. பார்த்துவிட்டு மீண்டும் முயற்சிக்கவும். | Something they typed was wrong. | |
| `err.conflict` | That could not be done just now. Please try again. | அதை இப்போது செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும். | Could not be done right now. | |
| `err.generic` | Something went wrong. Please try again. | ஏதோ தவறாகிவிட்டது. மீண்டும் முயற்சிக்கவும். | Catch-all. | |
| `upd.title` | App version & updates | ஆப் பதிப்பு & புதுப்பிப்புகள் | Card title on the account screen. | |
| `upd.sub` | Which version of the app is running on this phone. | இந்த ஃபோனில் ஆப்பின் எந்தப் பதிப்பு இயங்குகிறது. | Card subtitle. | |
| `upd.embedded` | Built-in version — never updated | ஆப்புடன் வந்த பதிப்பு — புதுப்பிக்கப்படவில்லை | The build that shipped with the app. | |
| `upd.downloaded` | Running a downloaded update | பதிவிறக்கிய புதுப்பிப்பு இயங்குகிறது | An over-the-air update is running. | |
| `upd.bundle` | Version | பதிப்பு | Row label. | |
| `upd.builtOn` | Age | எவ்வளவு பழையது | Row label: how old the running build is. | |
| `upd.unknown` | unknown | தெரியவில்லை | Lower case in English; it sits inside a row value. | |
| `upd.ageNow` | just now | இப்போதுதான் | Just built. | |
| `upd.ageMinutes` | {n} minutes old | {n} நிமிடம் பழையது | {n} is a number. | |
| `upd.ageHours` | {n} hours old | {n} மணி நேரம் பழையது | {n} is a number. | |
| `upd.ageDays` | {n} days old | {n} நாள் பழையது | {n} is a number. | |
| `upd.check` | Check for updates now | இப்போதே புதுப்பிப்பைப் பார் | Button. | |
| `upd.checking` | Checking… | பார்க்கிறது… | Button, busy. | |
| `upd.upToDate` | You already have the latest version. | உங்களிடம் ஏற்கனவே புதிய பதிப்பு உள்ளது. | Nothing to do. | |
| `upd.reloading` | New version downloaded. Restarting the app… | புதிய பதிப்பு பதிவிறக்கப்பட்டது. ஆப் மீண்டும் தொடங்குகிறது… | The app is about to restart itself. | |
| `upd.failed` | Could not check for updates. Check your internet and try again. | புதுப்பிப்பைப் பார்க்க முடியவில்லை. இணையத்தைப் பார்த்து மீண்டும் முயற்சிக்கவும். | Could not reach the update server. | |
| `upd.disabled` | Updates are switched off in this build. | இந்த ஆப்பில் புதுப்பிப்புகள் அணைக்கப்பட்டுள்ளன. | Updates off in this build. | |
| `stmt.last30` | Last 30 days | கடந்த 30 நாட்கள் | Range shortcut. | |
| `stmt.last90` | Last 90 days | கடந்த 90 நாட்கள் | Range shortcut. | |
| `stmt.badDate` | Enter both dates as YYYY-MM-DD. | இரண்டு தேதிகளையும் YYYY-MM-DD வடிவத்தில் எழுதுங்கள். | YYYY-MM-DD stays in Latin — it is the format the field accepts. | |
| `stmt.exportOnWeb` | Download CSV or print | CSV பதிவிறக்கு அல்லது அச்சிடு | CSV stays CSV. | |
| `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | கோப்பைச் சேமிக்கவும் அச்சிடவும் வெப் ஆப் தேவை. இது அதை நீங்கள் உள்நுழைந்த நிலையிலேயே திறக்கும். | Explains why this hands off to the web app. | |

## Telugu (తెలుగు) — 112 strings

### Money, khata and credit

Wrong here costs a shopper money or tells them a debt is a credit. Read every row.

| Key | English | Telugu as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `coedit.credit` | {amount} has been taken off your khata at this shop. | ఈ దుకాణంలో మీ ఖాతా నుండి {amount} తగ్గించారు. | Uses ఖాతా నుండి తగ్గించారు — taken off the khata. No జమ/ముందస్తు in it. | |
| `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | మీరు ఇప్పటికే చెల్లించారు. {amount} ఈ దుకాణంలో మీకు జమగా ఉంటుంది — ఇక్కడ మీ తర్వాతి ఆర్డర్‌లో తగ్గుతుంది. | Uses జమ, the owner app's word for money held in the customer's favour. Debt is అప్పు/బాకీ and never appears here. | |
| `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | తీసుకునేటప్పుడు {now} ఇవ్వండి — {amount} విలువైన సరుకులు తీసేశారు. | Two amounts in one line: {now} is what to hand over, {amount} is what came off. Check they cannot be swapped. | |
| `txn.adjustment` | Adjusted by shop | దుకాణం చేసిన సర్దుబాటు | సర్దుబాటు follows the owner app. It is the spoken word, not a Sanskritised one — confirm. | |
| `stmt.totalAdjusted` | Adjusted by shop | దుకాణం చేసిన సర్దుబాటు | Same string as txn.adjustment. Keep them identical. | |
| `account.prepaySub` | Pre-load credit & clear dues on the web | వెబ్ యాప్‌లో ముందుగా డబ్బు వేయండి, బాకీ తీర్చండి | ముందుగా డబ్బు వేయండి (pay in first) against బాకీ (dues). | |
| `ref.creditBalance` | Your referral credit | మీ రిఫరల్ జమ | జమ again, matching coedit.prepaid. | |
| `account.prepay` | Pay in advance | ముందస్తుగా చెల్లించు | The advance word from this block's khata.advance. | |
| `txn.upi` | UPI paid | UPI చెల్లింపు | Ledger row, matched to this block's txn.cash phrasing. UPI stays UPI. | |
| `coedit.title` | The shop adjusted your order | దుకాణం మీ ఆర్డర్‌ను తగ్గించింది | The shop cut the order down. "Adjusted" is rendered as reduced, which is what happened. | |
| `coedit.intro` | {shop} could not supply everything you ordered. | {shop} వద్ద మీరు అడిగిన సరుకులు అన్నీ లేవు. | {shop} is the shop name. | |
| `coedit.nowTotal` | Your order now comes to {now}. | మీ ఆర్డర్ ఇప్పుడు {now} అవుతుంది. | The new total to be paid. | |
| `coedit.wasSubtotal` | Original items total {was} | మొదట ఉన్న సరుకుల మొత్తం {was} | The total BEFORE the cut. Must not be mistaken for the new one. | |
| `coedit.removed` | {item} — removed | {item} — తీసివేయబడింది | Verbatim from the owner app (oedit.historyRemoved) so both sides read alike. | |
| `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only. Left byte-identical to English on purpose — there is nothing to translate. | |
| `stmt.opening` | Opening balance | ప్రారంభ నిల్వ | Balance at the start of the range. | |
| `stmt.closing` | Closing balance | చివరి నిల్వ | Balance at the end of the range. | |
| `stmt.totalPurchases` | Total purchases | మొత్తం కొనుగోలు | Sum of buying, from this block's txn.purchase word. | |
| `stmt.totalPaid` | Total paid | మొత్తం చెల్లింపు | Sum of payments, from this block's txn.payment word. | |
| `stmt.combined` | Combined total | అన్నీ కలిపి మొత్తం | Total across all shops. | |

### Orders, shop hours and ready times

Wrong here costs a wasted trip or a lost sale. Ten of these are the owner app word for word.

| Key | English | Telugu as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `open.bannerTitle` | This shop is closed right now | ఈ దుకాణం ఇప్పుడు మూసి ఉంది | Banner over a closed shop. | |
| `open.cannotOrder` | Closed — cannot order | మూసి ఉంది — ఆర్డర్ చేయలేరు | Button-side label. Short. | |
| `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | ఈ దుకాణం ఇప్పుడు మూసి ఉంది, అందుకే ఆర్డర్ చేయలేరు. మీ బుట్ట భద్రంగా ఉంది. | Says the cart is kept. A shopper must not fear losing it. | |
| `open.browseOnly` | You can look around — ordering opens again when the shop does. | మీరు చూడవచ్చు — దుకాణం తెరిచాక మళ్లీ ఆర్డర్ చేయవచ్చు. | Reassurance: looking is fine, ordering is not. | |
| `open.stateClosed` | Closed — the shop is switched off right now | మూసి ఉంది — దుకాణం ఇప్పుడు ఆపి ఉంచారు | Shopper-facing rewrite of the owner app's "you switched the shop off". | |
| `open.open` | Open | తెరిచి ఉంది | Verbatim from the owner app. | |
| `open.closed` | Closed | మూసి ఉంది | Verbatim from the owner app. | |
| `open.closedPill` | Closed | మూసి ఉంది | Same word as open.closed; it is a pill on the shop card. | |
| `open.statePaused` | Paused — back {when} | కాసేపు ఆపారు — {when} తిరిగి | Verbatim from the owner app. {when} is a time phrase. | |
| `open.stateHoliday` | Closed today — reopens {when} | ఈరోజు మూసి ఉంది — {when} మళ్లీ తెరుస్తారు | Verbatim from the owner app. | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ఈరోజు మూసి ఉంది ({reason}) — {when} మళ్లీ తెరుస్తారు | Verbatim from the owner app. {reason} is free text the shopkeeper typed. | |
| `open.stateHours` | Closed — opens {when} | మూసి ఉంది — {when} తెరుస్తారు | Verbatim from the owner app. | |
| `open.todayAt` | at {time} | {time}కి | Verbatim from the owner app. Substituted INTO the state lines, so it must read on from them. | |
| `open.tomorrowAt` | tomorrow at {time} | రేపు {time}కి | Verbatim from the owner app. Same: it is substituted into {when}. | |
| `eta.readyBy` | Ready by {time} | {time}కల్లా సిద్ధం | Verbatim from the owner app. | |
| `eta.takingLonger` | Taking a little longer | కొంచెం ఎక్కువ సమయం పడుతోంది | Verbatim from the owner app. | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}కల్లా అవ్వాల్సింది. ఇంక ఎక్కువ ఆలస్యం కాదు. | Verbatim from the owner app. | |
| `eta.noPromise` | No ready time promised | సిద్ధమయ్యే సమయం చెప్పలేదు | Verbatim from the owner app. | |
| `cart.restoring` | Getting your cart… | మీ బుట్ట వస్తోంది… | Shown while the saved cart loads. Must NOT read as "your cart is empty". | |
| `cart.switchShopTitle` | Cart at another shop | వేరే దుకాణంలో కార్ట్ | Uses the cart word this block's cart.switchShopConfirm already uses. | |
| `cart.switchShopClear` | Clear and start here | తీసేసి ఇక్కడ మొదలుపెట్టు | Destructive button: it throws the other cart away. | |
| `orders.failedTitle` | Could not load your orders | మీ ఆర్డర్లు లోడ్ కాలేదు | A load FAILED — not "you have no orders". | |
| `shopdetail.failedTitle` | Could not load this shop | ఈ దుకాణం లోడ్ కాలేదు | A load FAILED — not "this shop has nothing". | |
| `shops.failedTitle` | Could not load shops | దుకాణాలు లోడ్ కాలేదు | A load FAILED — not "there are no shops". | |
| `psearch.failedTitle` | Search did not finish | వెతకడం పూర్తి కాలేదు | The search FAILED — not "nothing found". | |

### Judgement calls

A word had to be chosen and a counter might use a different one. Cheap to fix, worth reading.

| Key | English | Telugu as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `account.manage` | Manage | నిర్వహించు | నిర్వహించు may be stiffer than a shopper would say. | |
| `stmt.title` | Account statement | ఖాతా స్టేట్‌మెంట్ | స్టేట్‌మెంట్, the loan word this block's chelp.e6.a already uses. | |
| `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | ప్రారంభ నిల్వ, ఎంచుకున్న కాలంలోని తేదీల వారీ ఎంట్రీలు, చివరి నిల్వ. | Three ideas in one line; check it is not too long for a small screen. | |
| `stmt.from` | From | నుండి | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.to` | To | వరకు | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.view` | View | చూడు | Button. Check it is not curt. | |
| `stmt.pickShop` | Choose a shop | దుకాణం ఎంచుకోండి | Picker label. | |
| `stmt.allShops` | All shops (combined) | అన్ని దుకాణాలు (కలిపి) | Picker option meaning every shop added up. | |
| `stmt.rangeError` | The From date must be on or before the To date. | "నుండి" తేదీ "వరకు" తేదీ కంటే ముందు లేదా అదే రోజు కావాలి. | Quotes stmt.from and stmt.to. If either label changes, change this too. | |
| `stmt.noData` | No entries in this date range. | ఈ తేదీల మధ్య ఎంట్రీలు లేవు. | Empty range, not an error. | |
| `stmt.loadError` | Could not load the statement. | స్టేట్‌మెంట్ లోడ్ కాలేదు. | Uses the same statement word as stmt.title. | |
| `ref.activatedOf` | {a} of {n} activated | {n} లో {a} యాక్టివ్ అయ్యారు | Two numbers: {a} activated out of {n}. Check the order reads right in this language. | |
| `account.gender` | Gender | లింగం | Profile field label. | |
| `account.genderUnset` | Not set | ఇవ్వలేదు | Shown when nothing was chosen. | |
| `account.genderMale` | Male | పురుషుడు | Option. | |
| `account.genderFemale` | Female | స్త్రీ | Option. | |
| `account.genderOther` | Other | ఇతర | Option. | |
| `account.genderPreferNot` | Prefer not to say | చెప్పదలచుకోలేదు | Option. Should sound like a choice, not a refusal. | |
| `account.dob` | Date of birth | పుట్టిన తేదీ | Profile field label. | |
| `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | పుట్టిన తేదీని YYYY-MM-DD రూపంలో రాయండి. | YYYY-MM-DD is deliberately left in Latin — it is the format the field accepts. | |
| `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ఫోన్ నంబరే మీ లాగిన్, ఇక్కడ మార్చలేరు. | Explains why the phone field is locked. | |
| `account.dataSaverSub` | Skip extra photos on slow networks | నెట్ నెమ్మదిగా ఉంటే అదనపు ఫోటోలు తీసుకురాదు | What data saver does. Plain words for a slow connection. | |
| `voice.search` | Search by voice | మాట్లాడి వెతుకు | Mic button label. Follows the phrasing this block's chelp.e2.a already uses for speaking to the app. | |
| `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | మైక్ అనుమతి లేదు. మాట్లాడి వెతకడానికి సెట్టింగ్స్‌లో దాన్ని ఆన్ చేయండి. | Points at the phone Settings app. | |
| `voice.hint.no-match` | Did not catch that. Please try again. | అర్థం కాలేదు. మళ్లీ చెప్పండి. | The app did not understand. Must not sound like it is blaming the shopper. | |
| `voice.hint.network` | Voice search needs the internet. Check your connection. | మాట్లాడి వెతకడానికి ఇంటర్నెట్ కావాలి. మీ కనెక్షన్ చూడండి. | Voice needs the internet. | |
| `voice.hint.unavailable` | Voice search is not available right now. | మాట్లాడి వెతకడం ఇప్పుడు అందుబాటులో లేదు. | Temporary. | |
| `voice.notInLanguage` | Voice search is not available in this language yet. | ఈ భాషలో మాట్లాడి వెతకడం ఇంకా అందుబాటులో లేదు. | This language has no recognizer yet. | |
| `psearch.title` | Find an item | వస్తువు వెతుకు | Screen title. | |
| `psearch.voiceIn` | Listens in {language} | {language} లో వింటుంది | {language} is the language name in its OWN script, dropped in as-is. | |
| `psearch.buyAgain` | Buy it again | మళ్లీ కొను | Section over things bought before. | |
| `psearch.recent` | Recent searches | ఇటీవల వెతికినవి | Section over recent searches. | |
| `psearch.clearRecent` | Clear | తొలగించు | One word, clears the recent list. | |
| `psearch.browse` | Shop by category | వర్గం వారీగా కొను | Section over the category shelves. | |
| `shops.heroTitle` | What do you need today? | ఈరోజు మీకు ఏం కావాలి? | The greeting at the top of the shops screen. Should sound friendly, not formal. | |

### Routine chrome

Errors and the update card. A clumsy line here annoys; it does not cost anything.

| Key | English | Telugu as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `err.offline` | No internet right now. Check your connection and try again. | ఇప్పుడు ఇంటర్నెట్ లేదు. కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి. | No connection. | |
| `err.slow` | The network is too slow to finish that. Please try again. | నెట్ చాలా నెమ్మదిగా ఉండటంతో అది పూర్తి కాలేదు. మళ్లీ ప్రయత్నించండి. | The connection was too slow to finish. | |
| `err.server` | Something went wrong at our end. Please try again in a moment. | మా వైపు ఏదో పొరపాటు. కాసేపటి తర్వాత మళ్లీ ప్రయత్నించండి. | Our fault, not theirs. Must say so. | |
| `err.notFound` | That is not available any more. | అది ఇక లేదు. | The thing is gone. | |
| `err.notAllowed` | You cannot open this. | దీన్ని మీరు తెరవలేరు. | Not permitted. | |
| `err.signedOut` | You have been signed out. Please sign in again. | మీరు సైన్ అవుట్ అయ్యారు. మళ్లీ సైన్ ఇన్ చేయండి. | Session expired. | |
| `err.tooMany` | Too many tries. Please wait a minute and try again. | చాలాసార్లు ప్రయత్నించారు. ఒక నిమిషం ఆగి మళ్లీ ప్రయత్నించండి. | Rate limited. | |
| `err.badRequest` | Something in that was not right. Please check and try again. | అందులో ఏదో సరిగా లేదు. చూసి మళ్లీ ప్రయత్నించండి. | Something they typed was wrong. | |
| `err.conflict` | That could not be done just now. Please try again. | అది ఇప్పుడు చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి. | Could not be done right now. | |
| `err.generic` | Something went wrong. Please try again. | ఏదో పొరపాటు జరిగింది. మళ్లీ ప్రయత్నించండి. | Catch-all. | |
| `upd.title` | App version & updates | యాప్ వెర్షన్ & అప్‌డేట్లు | Card title on the account screen. | |
| `upd.sub` | Which version of the app is running on this phone. | ఈ ఫోన్‌లో యాప్ ఏ వెర్షన్ నడుస్తోంది. | Card subtitle. | |
| `upd.embedded` | Built-in version — never updated | యాప్‌తో వచ్చిన వెర్షన్ — ఎప్పుడూ అప్‌డేట్ కాలేదు | The build that shipped with the app. | |
| `upd.downloaded` | Running a downloaded update | డౌన్‌లోడ్ చేసిన అప్‌డేట్ నడుస్తోంది | An over-the-air update is running. | |
| `upd.bundle` | Version | వెర్షన్ | Row label. | |
| `upd.builtOn` | Age | ఎంత పాతది | Row label: how old the running build is. | |
| `upd.unknown` | unknown | తెలియదు | Lower case in English; it sits inside a row value. | |
| `upd.ageNow` | just now | ఇప్పుడే | Just built. | |
| `upd.ageMinutes` | {n} minutes old | {n} నిమిషాల పాతది | {n} is a number. | |
| `upd.ageHours` | {n} hours old | {n} గంటల పాతది | {n} is a number. | |
| `upd.ageDays` | {n} days old | {n} రోజుల పాతది | {n} is a number. | |
| `upd.check` | Check for updates now | ఇప్పుడే అప్‌డేట్ చూడు | Button. | |
| `upd.checking` | Checking… | చూస్తోంది… | Button, busy. | |
| `upd.upToDate` | You already have the latest version. | మీ దగ్గర ఇప్పటికే కొత్త వెర్షన్ ఉంది. | Nothing to do. | |
| `upd.reloading` | New version downloaded. Restarting the app… | కొత్త వెర్షన్ డౌన్‌లోడ్ అయింది. యాప్ మళ్లీ మొదలవుతోంది… | The app is about to restart itself. | |
| `upd.failed` | Could not check for updates. Check your internet and try again. | అప్‌డేట్ చూడలేకపోయాం. ఇంటర్నెట్ చూసి మళ్లీ ప్రయత్నించండి. | Could not reach the update server. | |
| `upd.disabled` | Updates are switched off in this build. | ఈ యాప్‌లో అప్‌డేట్లు ఆపి ఉన్నాయి. | Updates off in this build. | |
| `stmt.last30` | Last 30 days | గత 30 రోజులు | Range shortcut. | |
| `stmt.last90` | Last 90 days | గత 90 రోజులు | Range shortcut. | |
| `stmt.badDate` | Enter both dates as YYYY-MM-DD. | రెండు తేదీలనూ YYYY-MM-DD రూపంలో రాయండి. | YYYY-MM-DD stays in Latin — it is the format the field accepts. | |
| `stmt.exportOnWeb` | Download CSV or print | CSV డౌన్‌లోడ్ చేయి లేదా ప్రింట్ చేయి | CSV stays CSV. | |
| `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | ఫైల్ సేవ్ చేయడానికి, ప్రింట్ చేయడానికి వెబ్ యాప్ కావాలి. ఇది దాన్ని మీరు సైన్ ఇన్ అయిన స్థితిలోనే తెరుస్తుంది. | Explains why this hands off to the web app. | |

## Kannada (ಕನ್ನಡ) — 112 strings

### Money, khata and credit

Wrong here costs a shopper money or tells them a debt is a credit. Read every row.

| Key | English | Kannada as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `coedit.credit` | {amount} has been taken off your khata at this shop. | ಈ ಅಂಗಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಖಾತೆಯಿಂದ {amount} ಕಡಿಮೆ ಮಾಡಲಾಗಿದೆ. | Uses ಖಾತೆಯಿಂದ ಕಡಿಮೆ ಮಾಡಲಾಗಿದೆ — taken off the khata. No ಜಮೆ/ಮುಂಗಡ in it. | |
| `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | ನೀವು ಈಗಾಗಲೇ ಪಾವತಿಸಿದ್ದೀರಿ. {amount} ಈ ಅಂಗಡಿಯಲ್ಲಿ ನಿಮಗೆ ಜಮೆ ಇರುತ್ತದೆ — ಇಲ್ಲಿ ನಿಮ್ಮ ಮುಂದಿನ ಆರ್ಡರ್‌ನಲ್ಲಿ ಕಡಿಮೆಯಾಗುತ್ತದೆ. | Uses ಜಮೆ, the owner app's word for money held in the customer's favour. Debt is ಸಾಲ/ಬಾಕಿ and never appears here. | |
| `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | ತೆಗೆದುಕೊಳ್ಳುವಾಗ {now} ಕೊಡಿ — {amount} ಬೆಲೆಯ ಸಾಮಾನು ತೆಗೆಯಲಾಗಿದೆ. | Two amounts in one line: {now} is what to hand over, {amount} is what came off. Check they cannot be swapped. | |
| `txn.adjustment` | Adjusted by shop | ಅಂಗಡಿಯ ಹೊಂದಾಣಿಕೆ | ಹೊಂದಾಣಿಕೆ follows the owner app. Check a counter would recognise it. | |
| `stmt.totalAdjusted` | Adjusted by shop | ಅಂಗಡಿಯ ಹೊಂದಾಣಿಕೆ | Same string as txn.adjustment. Keep them identical. | |
| `account.prepaySub` | Pre-load credit & clear dues on the web | ವೆಬ್ ಆ್ಯಪ್‌ನಲ್ಲಿ ಮುಂಗಡ ಹಾಕಿ, ಬಾಕಿ ತೀರಿಸಿ | ಮುಂಗಡ (advance) against ಬಾಕಿ (dues). | |
| `ref.creditBalance` | Your referral credit | ನಿಮ್ಮ ರೆಫರಲ್ ಜಮೆ | ಜಮೆ again, matching coedit.prepaid. | |
| `account.prepay` | Pay in advance | ಮುಂಗಡ ಪಾವತಿಸಿ | The advance word from this block's khata.advance. | |
| `txn.upi` | UPI paid | UPI ಪಾವತಿ | Ledger row, matched to this block's txn.cash phrasing. UPI stays UPI. | |
| `coedit.title` | The shop adjusted your order | ಅಂಗಡಿ ನಿಮ್ಮ ಆರ್ಡರ್ ಕಡಿಮೆ ಮಾಡಿದೆ | The shop cut the order down. "Adjusted" is rendered as reduced, which is what happened. | |
| `coedit.intro` | {shop} could not supply everything you ordered. | {shop} ನಲ್ಲಿ ನೀವು ಕೇಳಿದ ಎಲ್ಲಾ ಸಾಮಾನು ಇರಲಿಲ್ಲ. | {shop} is the shop name. | |
| `coedit.nowTotal` | Your order now comes to {now}. | ನಿಮ್ಮ ಆರ್ಡರ್ ಈಗ {now} ಆಗುತ್ತದೆ. | The new total to be paid. | |
| `coedit.wasSubtotal` | Original items total {was} | ಮೊದಲಿದ್ದ ಸಾಮಾನುಗಳ ಒಟ್ಟು {was} | The total BEFORE the cut. Must not be mistaken for the new one. | |
| `coedit.removed` | {item} — removed | {item} — ತೆಗೆಯಲಾಗಿದೆ | Verbatim from the owner app (oedit.historyRemoved) so both sides read alike. | |
| `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only. Left byte-identical to English on purpose — there is nothing to translate. | |
| `stmt.opening` | Opening balance | ಆರಂಭದ ಬ್ಯಾಲೆನ್ಸ್ | Balance at the start of the range. | |
| `stmt.closing` | Closing balance | ಕೊನೆಯ ಬ್ಯಾಲೆನ್ಸ್ | Balance at the end of the range. | |
| `stmt.totalPurchases` | Total purchases | ಒಟ್ಟು ಖರೀದಿ | Sum of buying, from this block's txn.purchase word. | |
| `stmt.totalPaid` | Total paid | ಒಟ್ಟು ಪಾವತಿ | Sum of payments, from this block's txn.payment word. | |
| `stmt.combined` | Combined total | ಎಲ್ಲಾ ಸೇರಿ ಒಟ್ಟು | Total across all shops. | |

### Orders, shop hours and ready times

Wrong here costs a wasted trip or a lost sale. Ten of these are the owner app word for word.

| Key | English | Kannada as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `open.bannerTitle` | This shop is closed right now | ಈ ಅಂಗಡಿ ಈಗ ಮುಚ್ಚಿದೆ | Banner over a closed shop. | |
| `open.cannotOrder` | Closed — cannot order | ಮುಚ್ಚಿದೆ — ಆರ್ಡರ್ ಮಾಡಲಾಗದು | Button-side label. Short. | |
| `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | ಈ ಅಂಗಡಿ ಈಗ ಮುಚ್ಚಿದೆ, ಹಾಗಾಗಿ ಆರ್ಡರ್ ಮಾಡಲಾಗದು. ನಿಮ್ಮ ಬುಟ್ಟಿ ಉಳಿಸಿಟ್ಟಿದೆ. | Says the cart is kept. A shopper must not fear losing it. | |
| `open.browseOnly` | You can look around — ordering opens again when the shop does. | ನೀವು ನೋಡಬಹುದು — ಅಂಗಡಿ ತೆರೆದ ಮೇಲೆ ಮತ್ತೆ ಆರ್ಡರ್ ಮಾಡಬಹುದು. | Reassurance: looking is fine, ordering is not. | |
| `open.stateClosed` | Closed — the shop is switched off right now | ಮುಚ್ಚಿದೆ — ಅಂಗಡಿ ಈಗ ಆಫ್ ಮಾಡಲಾಗಿದೆ | Shopper-facing rewrite of the owner app's "you switched the shop off". | |
| `open.open` | Open | ತೆರೆದಿದೆ | Verbatim from the owner app. | |
| `open.closed` | Closed | ಮುಚ್ಚಿದೆ | Verbatim from the owner app. | |
| `open.closedPill` | Closed | ಮುಚ್ಚಿದೆ | Same word as open.closed; it is a pill on the shop card. | |
| `open.statePaused` | Paused — back {when} | ಸ್ವಲ್ಪ ಹೊತ್ತು ನಿಲ್ಲಿಸಲಾಗಿದೆ — {when} ವಾಪಸ್ | Verbatim from the owner app. {when} is a time phrase. | |
| `open.stateHoliday` | Closed today — reopens {when} | ಇಂದು ಮುಚ್ಚಿದೆ — {when} ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ | Verbatim from the owner app. | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ಇಂದು ಮುಚ್ಚಿದೆ ({reason}) — {when} ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ | Verbatim from the owner app. {reason} is free text the shopkeeper typed. | |
| `open.stateHours` | Closed — opens {when} | ಮುಚ್ಚಿದೆ — {when} ತೆರೆಯುತ್ತದೆ | Verbatim from the owner app. | |
| `open.todayAt` | at {time} | {time} ಕ್ಕೆ | Verbatim from the owner app. Substituted INTO the state lines, so it must read on from them. | |
| `open.tomorrowAt` | tomorrow at {time} | ನಾಳೆ {time} ಕ್ಕೆ | Verbatim from the owner app. Same: it is substituted into {when}. | |
| `eta.readyBy` | Ready by {time} | {time} ಒಳಗೆ ಸಿದ್ಧ | Verbatim from the owner app. | |
| `eta.takingLonger` | Taking a little longer | ಸ್ವಲ್ಪ ಹೆಚ್ಚು ಸಮಯ ಆಗುತ್ತಿದೆ | Verbatim from the owner app. | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time} ಒಳಗೆ ಆಗಬೇಕಿತ್ತು. ಇನ್ನು ಹೆಚ್ಚು ತಡವಾಗುವುದಿಲ್ಲ. | Verbatim from the owner app. | |
| `eta.noPromise` | No ready time promised | ಸಿದ್ಧವಾಗುವ ಸಮಯ ಹೇಳಿಲ್ಲ | Verbatim from the owner app. | |
| `cart.restoring` | Getting your cart… | ನಿಮ್ಮ ಬುಟ್ಟಿ ಬರುತ್ತಿದೆ… | Shown while the saved cart loads. Must NOT read as "your cart is empty". | |
| `cart.switchShopTitle` | Cart at another shop | ಬೇರೆ ಅಂಗಡಿಯಲ್ಲಿ ಕಾರ್ಟ್ | Uses the cart word this block's cart.switchShopConfirm already uses. | |
| `cart.switchShopClear` | Clear and start here | ತೆಗೆದು ಇಲ್ಲಿ ಶುರು ಮಾಡಿ | Destructive button: it throws the other cart away. | |
| `orders.failedTitle` | Could not load your orders | ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ | A load FAILED — not "you have no orders". | |
| `shopdetail.failedTitle` | Could not load this shop | ಈ ಅಂಗಡಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ | A load FAILED — not "this shop has nothing". | |
| `shops.failedTitle` | Could not load shops | ಅಂಗಡಿಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ | A load FAILED — not "there are no shops". | |
| `psearch.failedTitle` | Search did not finish | ಹುಡುಕಾಟ ಪೂರ್ಣವಾಗಲಿಲ್ಲ | The search FAILED — not "nothing found". | |

### Judgement calls

A word had to be chosen and a counter might use a different one. Cheap to fix, worth reading.

| Key | English | Kannada as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `account.manage` | Manage | ನಿರ್ವಹಿಸಿ | ನಿರ್ವಹಿಸಿ may be stiffer than a shopper would say. | |
| `stmt.title` | Account statement | ಖಾತೆ ವಿವರಣೆ | ವಿವರಣೆ, the word this block's chelp.e6.a already uses. | |
| `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | ಆರಂಭದ ಬ್ಯಾಲೆನ್ಸ್, ಆರಿಸಿದ ಅವಧಿಯ ದಿನಾಂಕವಾರು ನಮೂದುಗಳು, ಕೊನೆಯ ಬ್ಯಾಲೆನ್ಸ್. | Three ideas in one line; check it is not too long for a small screen. | |
| `stmt.from` | From | ಇಂದ | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.to` | To | ವರೆಗೆ | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.view` | View | ನೋಡಿ | Kept in the polite -ಇರಿ/-ಇ imperative this whole block uses, not the bare stem. | |
| `stmt.pickShop` | Choose a shop | ಅಂಗಡಿ ಆರಿಸಿ | Picker label. | |
| `stmt.allShops` | All shops (combined) | ಎಲ್ಲಾ ಅಂಗಡಿಗಳು (ಒಟ್ಟಿಗೆ) | Picker option meaning every shop added up. | |
| `stmt.rangeError` | The From date must be on or before the To date. | "ಇಂದ" ದಿನಾಂಕ "ವರೆಗೆ" ದಿನಾಂಕಕ್ಕಿಂತ ಮೊದಲು ಅಥವಾ ಅದೇ ದಿನ ಇರಬೇಕು. | Quotes stmt.from and stmt.to. If either label changes, change this too. | |
| `stmt.noData` | No entries in this date range. | ಈ ದಿನಾಂಕಗಳ ನಡುವೆ ನಮೂದುಗಳಿಲ್ಲ. | Empty range, not an error. | |
| `stmt.loadError` | Could not load the statement. | ವಿವರಣೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ. | Uses the same statement word as stmt.title. | |
| `ref.activatedOf` | {a} of {n} activated | {n} ರಲ್ಲಿ {a} ಸಕ್ರಿಯವಾಗಿದೆ | Two numbers: {a} activated out of {n}. Check the order reads right in this language. | |
| `account.gender` | Gender | ಲಿಂಗ | Profile field label. | |
| `account.genderUnset` | Not set | ಕೊಟ್ಟಿಲ್ಲ | Shown when nothing was chosen. | |
| `account.genderMale` | Male | ಪುರುಷ | Option. | |
| `account.genderFemale` | Female | ಮಹಿಳೆ | Option. | |
| `account.genderOther` | Other | ಇತರೆ | Option. | |
| `account.genderPreferNot` | Prefer not to say | ಹೇಳಲು ಇಷ್ಟವಿಲ್ಲ | Option. Should sound like a choice, not a refusal. | |
| `account.dob` | Date of birth | ಹುಟ್ಟಿದ ದಿನಾಂಕ | Profile field label. | |
| `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | ಹುಟ್ಟಿದ ದಿನಾಂಕವನ್ನು YYYY-MM-DD ರೂಪದಲ್ಲಿ ಬರೆಯಿರಿ. | YYYY-MM-DD is deliberately left in Latin — it is the format the field accepts. | |
| `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ಫೋನ್ ಸಂಖ್ಯೆಯೇ ನಿಮ್ಮ ಲಾಗಿನ್, ಇಲ್ಲಿ ಬದಲಾಯಿಸಲಾಗದು. | Explains why the phone field is locked. | |
| `account.dataSaverSub` | Skip extra photos on slow networks | ನೆಟ್ ನಿಧಾನವಿದ್ದರೆ ಹೆಚ್ಚುವರಿ ಫೋಟೋ ತರುವುದಿಲ್ಲ | What data saver does. Plain words for a slow connection. | |
| `voice.search` | Search by voice | ಧ್ವನಿಯಿಂದ ಹುಡುಕಿ | Mic button label. Follows the phrasing this block's chelp.e2.a already uses for speaking to the app. | |
| `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | ಮೈಕ್ ಅನುಮತಿ ಇಲ್ಲ. ಧ್ವನಿಯಿಂದ ಹುಡುಕಲು ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಅದನ್ನು ಆನ್ ಮಾಡಿ. | Points at the phone Settings app. | |
| `voice.hint.no-match` | Did not catch that. Please try again. | ಅರ್ಥವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಹೇಳಿ. | The app did not understand. Must not sound like it is blaming the shopper. | |
| `voice.hint.network` | Voice search needs the internet. Check your connection. | ಧ್ವನಿ ಹುಡುಕಾಟಕ್ಕೆ ಇಂಟರ್ನೆಟ್ ಬೇಕು. ನಿಮ್ಮ ಕನೆಕ್ಷನ್ ನೋಡಿ. | Voice needs the internet. | |
| `voice.hint.unavailable` | Voice search is not available right now. | ಧ್ವನಿ ಹುಡುಕಾಟ ಈಗ ಲಭ್ಯವಿಲ್ಲ. | Temporary. | |
| `voice.notInLanguage` | Voice search is not available in this language yet. | ಈ ಭಾಷೆಯಲ್ಲಿ ಧ್ವನಿ ಹುಡುಕಾಟ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ. | This language has no recognizer yet. | |
| `psearch.title` | Find an item | ವಸ್ತು ಹುಡುಕಿ | Screen title. | |
| `psearch.voiceIn` | Listens in {language} | {language} ನಲ್ಲಿ ಕೇಳುತ್ತದೆ | {language} is the language name in its OWN script, dropped in as-is. | |
| `psearch.buyAgain` | Buy it again | ಮತ್ತೆ ಖರೀದಿಸಿ | Section over things bought before. | |
| `psearch.recent` | Recent searches | ಇತ್ತೀಚಿನ ಹುಡುಕಾಟಗಳು | Section over recent searches. | |
| `psearch.clearRecent` | Clear | ಅಳಿಸಿ | One word, clears the recent list. | |
| `psearch.browse` | Shop by category | ವರ್ಗದ ಪ್ರಕಾರ ಖರೀದಿಸಿ | Section over the category shelves. | |
| `shops.heroTitle` | What do you need today? | ಇಂದು ನಿಮಗೆ ಏನು ಬೇಕು? | The greeting at the top of the shops screen. Should sound friendly, not formal. | |

### Routine chrome

Errors and the update card. A clumsy line here annoys; it does not cost anything.

| Key | English | Kannada as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `err.offline` | No internet right now. Check your connection and try again. | ಈಗ ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಕನೆಕ್ಷನ್ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | No connection. | |
| `err.slow` | The network is too slow to finish that. Please try again. | ನೆಟ್ ತುಂಬಾ ನಿಧಾನವಿರುವುದರಿಂದ ಅದು ಪೂರ್ಣವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | The connection was too slow to finish. | |
| `err.server` | Something went wrong at our end. Please try again in a moment. | ನಮ್ಮ ಕಡೆ ಏನೋ ತಪ್ಪಾಗಿದೆ. ಸ್ವಲ್ಪ ಹೊತ್ತಿನ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Our fault, not theirs. Must say so. | |
| `err.notFound` | That is not available any more. | ಅದು ಇನ್ನು ಇಲ್ಲ. | The thing is gone. | |
| `err.notAllowed` | You cannot open this. | ಇದನ್ನು ನೀವು ತೆರೆಯಲಾಗದು. | Not permitted. | |
| `err.signedOut` | You have been signed out. Please sign in again. | ನೀವು ಸೈನ್ ಔಟ್ ಆಗಿದ್ದೀರಿ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ. | Session expired. | |
| `err.tooMany` | Too many tries. Please wait a minute and try again. | ತುಂಬಾ ಸಲ ಪ್ರಯತ್ನಿಸಿದ್ದೀರಿ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Rate limited. | |
| `err.badRequest` | Something in that was not right. Please check and try again. | ಅದರಲ್ಲಿ ಏನೋ ಸರಿಯಿಲ್ಲ. ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Something they typed was wrong. | |
| `err.conflict` | That could not be done just now. Please try again. | ಅದನ್ನು ಈಗ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Could not be done right now. | |
| `err.generic` | Something went wrong. Please try again. | ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Catch-all. | |
| `upd.title` | App version & updates | ಆ್ಯಪ್ ವರ್ಶನ್ & ಅಪ್‌ಡೇಟ್‌ಗಳು | Card title on the account screen. | |
| `upd.sub` | Which version of the app is running on this phone. | ಈ ಫೋನ್‌ನಲ್ಲಿ ಆ್ಯಪ್‌ನ ಯಾವ ವರ್ಶನ್ ಓಡುತ್ತಿದೆ. | Card subtitle. | |
| `upd.embedded` | Built-in version — never updated | ಆ್ಯಪ್‌ನೊಂದಿಗೆ ಬಂದ ವರ್ಶನ್ — ಎಂದೂ ಅಪ್‌ಡೇಟ್ ಆಗಿಲ್ಲ | The build that shipped with the app. | |
| `upd.downloaded` | Running a downloaded update | ಡೌನ್‌ಲೋಡ್ ಆದ ಅಪ್‌ಡೇಟ್ ಓಡುತ್ತಿದೆ | An over-the-air update is running. | |
| `upd.bundle` | Version | ವರ್ಶನ್ | Row label. | |
| `upd.builtOn` | Age | ಎಷ್ಟು ಹಳೆಯದು | Row label: how old the running build is. | |
| `upd.unknown` | unknown | ಗೊತ್ತಿಲ್ಲ | Lower case in English; it sits inside a row value. | |
| `upd.ageNow` | just now | ಈಗಷ್ಟೇ | Just built. | |
| `upd.ageMinutes` | {n} minutes old | {n} ನಿಮಿಷ ಹಳೆಯದು | {n} is a number. | |
| `upd.ageHours` | {n} hours old | {n} ಗಂಟೆ ಹಳೆಯದು | {n} is a number. | |
| `upd.ageDays` | {n} days old | {n} ದಿನ ಹಳೆಯದು | {n} is a number. | |
| `upd.check` | Check for updates now | ಈಗಲೇ ಅಪ್‌ಡೇಟ್ ನೋಡಿ | Button. | |
| `upd.checking` | Checking… | ನೋಡುತ್ತಿದೆ… | Button, busy. | |
| `upd.upToDate` | You already have the latest version. | ನಿಮ್ಮ ಬಳಿ ಈಗಾಗಲೇ ಹೊಸ ವರ್ಶನ್ ಇದೆ. | Nothing to do. | |
| `upd.reloading` | New version downloaded. Restarting the app… | ಹೊಸ ವರ್ಶನ್ ಡೌನ್‌ಲೋಡ್ ಆಗಿದೆ. ಆ್ಯಪ್ ಮತ್ತೆ ಶುರುವಾಗುತ್ತಿದೆ… | The app is about to restart itself. | |
| `upd.failed` | Could not check for updates. Check your internet and try again. | ಅಪ್‌ಡೇಟ್ ನೋಡಲಾಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. | Could not reach the update server. | |
| `upd.disabled` | Updates are switched off in this build. | ಈ ಆ್ಯಪ್‌ನಲ್ಲಿ ಅಪ್‌ಡೇಟ್‌ಗಳು ಆಫ್ ಆಗಿವೆ. | Updates off in this build. | |
| `stmt.last30` | Last 30 days | ಕಳೆದ 30 ದಿನ | Range shortcut. | |
| `stmt.last90` | Last 90 days | ಕಳೆದ 90 ದಿನ | Range shortcut. | |
| `stmt.badDate` | Enter both dates as YYYY-MM-DD. | ಎರಡೂ ದಿನಾಂಕಗಳನ್ನು YYYY-MM-DD ರೂಪದಲ್ಲಿ ಬರೆಯಿರಿ. | YYYY-MM-DD stays in Latin — it is the format the field accepts. | |
| `stmt.exportOnWeb` | Download CSV or print | CSV ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ಪ್ರಿಂಟ್ ಮಾಡಿ | CSV stays CSV. | |
| `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | ಫೈಲ್ ಉಳಿಸಲು ಮತ್ತು ಪ್ರಿಂಟ್ ಮಾಡಲು ವೆಬ್ ಆ್ಯಪ್ ಬೇಕು. ಇದು ಅದನ್ನು ನೀವು ಸೈನ್ ಇನ್ ಆದ ಸ್ಥಿತಿಯಲ್ಲೇ ತೆರೆಯುತ್ತದೆ. | Explains why this hands off to the web app. | |

## Malayalam (മലയാളം) — 112 strings

### Money, khata and credit

Wrong here costs a shopper money or tells them a debt is a credit. Read every row.

| Key | English | Malayalam as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `coedit.credit` | {amount} has been taken off your khata at this shop. | ഈ കടയിൽ നിങ്ങളുടെ ഖാതയിൽ നിന്ന് {amount} കുറച്ചിട്ടുണ്ട്. | Uses ഖാതയിൽ നിന്ന് കുറച്ചിട്ടുണ്ട് — taken off the khata. No വരവ്/അഡ്വാൻസ് in it. | |
| `coedit.prepaid` | You had already paid. {amount} is kept as credit at this shop — it comes off your next order here. | നിങ്ങൾ നേരത്തേ പണം അടച്ചിരുന്നു. {amount} ഈ കടയിൽ നിങ്ങളുടെ വരവായി ഉണ്ടാകും — ഇവിടെ അടുത്ത ഓർഡറിൽ കുറയും. | Uses വരവ്, money standing in the shopper's favour. The owner app says ക്രെഡിറ്റ് here; വരവ് was chosen instead because ക്രെഡിറ്റ് at a Kerala counter can mean buying ON credit, which is the opposite. Debt is കടം/കുടിശ്ശിക and never appears here. Flagging the divergence from the owner app deliberately. | |
| `coedit.cash` | Pay {now} when you collect — {amount} of items were taken off. | എടുക്കുമ്പോൾ {now} കൊടുക്കുക — {amount} വിലയുള്ള സാധനങ്ങൾ ഒഴിവാക്കി. | Two amounts in one line: {now} is what to hand over, {amount} is what came off. Check they cannot be swapped. | |
| `txn.adjustment` | Adjusted by shop | കട തിരുത്തിയത് | തിരുത്തിയത് follows the owner app's തിരുത്തൽ. | |
| `stmt.totalAdjusted` | Adjusted by shop | കട തിരുത്തിയത് | Same string as txn.adjustment. Keep them identical. | |
| `account.prepaySub` | Pre-load credit & clear dues on the web | വെബ് ആപ്പിൽ അഡ്വാൻസ് ഇടുക, കുടിശ്ശിക തീർക്കുക | അഡ്വാൻസ് (advance) against കുടിശ്ശിക (dues). | |
| `ref.creditBalance` | Your referral credit | നിങ്ങളുടെ റഫറൽ വരവ് | വരവ് again, matching coedit.prepaid. | |
| `account.prepay` | Pay in advance | അഡ്വാൻസ് അടയ്ക്കുക | The advance word from this block's khata.advance. | |
| `txn.upi` | UPI paid | UPI അടച്ചു | Ledger row, matched to this block's txn.cash phrasing. UPI stays UPI. | |
| `coedit.title` | The shop adjusted your order | കട നിങ്ങളുടെ ഓർഡർ കുറച്ചു | The shop cut the order down. "Adjusted" is rendered as reduced, which is what happened. | |
| `coedit.intro` | {shop} could not supply everything you ordered. | {shop} ൽ നിങ്ങൾ പറഞ്ഞ എല്ലാ സാധനവും ഉണ്ടായിരുന്നില്ല. | {shop} is the shop name. | |
| `coedit.nowTotal` | Your order now comes to {now}. | നിങ്ങളുടെ ഓർഡർ ഇപ്പോൾ {now} ആണ്. | The new total to be paid. | |
| `coedit.wasSubtotal` | Original items total {was} | ആദ്യമുണ്ടായിരുന്ന സാധനങ്ങളുടെ ആകെ {was} | The total BEFORE the cut. Must not be mistaken for the new one. | |
| `coedit.removed` | {item} — removed | {item} — നീക്കി | Verbatim from the owner app (oedit.historyRemoved) so both sides read alike. | |
| `coedit.reduced` | {item} — {before} → {after} | {item} — {before} → {after} | Placeholders and an arrow only. Left byte-identical to English on purpose — there is nothing to translate. | |
| `stmt.opening` | Opening balance | തുടക്കത്തിലെ ബാക്കി | Balance at the start of the range. | |
| `stmt.closing` | Closing balance | അവസാനത്തെ ബാക്കി | Balance at the end of the range. | |
| `stmt.totalPurchases` | Total purchases | ആകെ വാങ്ങൽ | Sum of buying, from this block's txn.purchase word. | |
| `stmt.totalPaid` | Total paid | ആകെ അടച്ചത് | Sum of payments, from this block's txn.payment word. | |
| `stmt.combined` | Combined total | എല്ലാം കൂടി ആകെ | Total across all shops. | |

### Orders, shop hours and ready times

Wrong here costs a wasted trip or a lost sale. Ten of these are the owner app word for word.

| Key | English | Malayalam as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `open.bannerTitle` | This shop is closed right now | ഈ കട ഇപ്പോൾ അടച്ചിരിക്കുന്നു | Banner over a closed shop. | |
| `open.cannotOrder` | Closed — cannot order | അടച്ചിരിക്കുന്നു — ഓർഡർ ചെയ്യാനാവില്ല | Button-side label. Short. | |
| `open.cartBlocked` | This shop is closed right now, so the order cannot be placed. Your cart is saved. | ഈ കട ഇപ്പോൾ അടച്ചിരിക്കുന്നു, അതുകൊണ്ട് ഓർഡർ ചെയ്യാനാവില്ല. നിങ്ങളുടെ കൊട്ട സൂക്ഷിച്ചിട്ടുണ്ട്. | Says the cart is kept. A shopper must not fear losing it. | |
| `open.browseOnly` | You can look around — ordering opens again when the shop does. | നിങ്ങൾക്ക് നോക്കാം — കട തുറന്നാൽ വീണ്ടും ഓർഡർ ചെയ്യാം. | Reassurance: looking is fine, ordering is not. | |
| `open.stateClosed` | Closed — the shop is switched off right now | അടച്ചിരിക്കുന്നു — കട ഇപ്പോൾ ഓഫാക്കി വെച്ചിരിക്കുന്നു | Shopper-facing rewrite of the owner app's "you switched the shop off". | |
| `open.open` | Open | തുറന്നിരിക്കുന്നു | Verbatim from the owner app. | |
| `open.closed` | Closed | അടച്ചിരിക്കുന്നു | Verbatim from the owner app. | |
| `open.closedPill` | Closed | അടച്ചിരിക്കുന്നു | Same word as open.closed; it is a pill on the shop card. | |
| `open.statePaused` | Paused — back {when} | കുറച്ച് നേരത്തേക്ക് നിർത്തി — {when} തിരികെ | Verbatim from the owner app. {when} is a time phrase. | |
| `open.stateHoliday` | Closed today — reopens {when} | ഇന്ന് അടവാണ് — {when} വീണ്ടും തുറക്കും | Verbatim from the owner app. | |
| `open.stateHolidayReason` | Closed today ({reason}) — reopens {when} | ഇന്ന് അടവാണ് ({reason}) — {when} വീണ്ടും തുറക്കും | Verbatim from the owner app. {reason} is free text the shopkeeper typed. | |
| `open.stateHours` | Closed — opens {when} | അടച്ചിരിക്കുന്നു — {when} തുറക്കും | Verbatim from the owner app. | |
| `open.todayAt` | at {time} | {time}-ന് | Verbatim from the owner app. Substituted INTO the state lines, so it must read on from them. | |
| `open.tomorrowAt` | tomorrow at {time} | നാളെ {time}-ന് | Verbatim from the owner app. Same: it is substituted into {when}. | |
| `eta.readyBy` | Ready by {time} | {time}-ന് തയ്യാർ | Verbatim from the owner app. | |
| `eta.takingLonger` | Taking a little longer | കുറച്ച് കൂടി സമയമെടുക്കുന്നു | Verbatim from the owner app. | |
| `eta.takingLongerHelp` | It was expected by {time}. It should not be much longer. | {time}-ന് ആകേണ്ടതായിരുന്നു. ഇനി അധികം വൈകില്ല. | Verbatim from the owner app. | |
| `eta.noPromise` | No ready time promised | തയ്യാറാകുന്ന സമയം പറഞ്ഞിട്ടില്ല | Verbatim from the owner app. | |
| `cart.restoring` | Getting your cart… | നിങ്ങളുടെ കൊട്ട എടുക്കുന്നു… | Shown while the saved cart loads. Must NOT read as "your cart is empty". | |
| `cart.switchShopTitle` | Cart at another shop | മറ്റൊരു കടയിൽ കാർട്ട് | Uses the cart word this block's cart.switchShopConfirm already uses. | |
| `cart.switchShopClear` | Clear and start here | നീക്കി ഇവിടെ തുടങ്ങുക | Destructive button: it throws the other cart away. | |
| `orders.failedTitle` | Could not load your orders | നിങ്ങളുടെ ഓർഡറുകൾ ലോഡ് ചെയ്യാനായില്ല | A load FAILED — not "you have no orders". | |
| `shopdetail.failedTitle` | Could not load this shop | ഈ കട ലോഡ് ചെയ്യാനായില്ല | A load FAILED — not "this shop has nothing". | |
| `shops.failedTitle` | Could not load shops | കടകൾ ലോഡ് ചെയ്യാനായില്ല | A load FAILED — not "there are no shops". | |
| `psearch.failedTitle` | Search did not finish | തിരയൽ പൂർത്തിയായില്ല | The search FAILED — not "nothing found". | |

### Judgement calls

A word had to be chosen and a counter might use a different one. Cheap to fix, worth reading.

| Key | English | Malayalam as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `account.manage` | Manage | കൈകാര്യം ചെയ്യുക | കൈകാര്യം ചെയ്യുക is long for a row. A shorter word is welcome. | |
| `stmt.title` | Account statement | ഖാത സ്റ്റേറ്റ്‌മെന്റ് | ഖാത + സ്റ്റേറ്റ്‌മെന്റ്: this block uses ഖാത for khata and chelp.e6.a already says സ്റ്റേറ്റ്‌മെന്റ്. | |
| `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | തുടക്കത്തിലെ ബാക്കി, തിരഞ്ഞെടുത്ത കാലയളവിലെ തീയതി തിരിച്ചുള്ള എൻട്രികൾ, അവസാനത്തെ ബാക്കി. | Three ideas in one line; check it is not too long for a small screen. | |
| `stmt.from` | From | മുതൽ | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.to` | To | വരെ | Date-range label. Quoted inside stmt.rangeError, so change both together. | |
| `stmt.view` | View | കാണുക | Button. Check it is not curt. | |
| `stmt.pickShop` | Choose a shop | കട തിരഞ്ഞെടുക്കുക | Picker label. | |
| `stmt.allShops` | All shops (combined) | എല്ലാ കടകളും (ഒരുമിച്ച്) | Picker option meaning every shop added up. | |
| `stmt.rangeError` | The From date must be on or before the To date. | "മുതൽ" തീയതി "വരെ" തീയതിക്ക് മുമ്പോ അതേ ദിവസമോ ആയിരിക്കണം. | Quotes stmt.from and stmt.to. If either label changes, change this too. | |
| `stmt.noData` | No entries in this date range. | ഈ തീയതികൾക്കിടയിൽ എൻട്രികൾ ഇല്ല. | Empty range, not an error. | |
| `stmt.loadError` | Could not load the statement. | സ്റ്റേറ്റ്‌മെന്റ് ലോഡ് ചെയ്യാനായില്ല. | Uses the same statement word as stmt.title. | |
| `ref.activatedOf` | {a} of {n} activated | {n} ൽ {a} സജീവമായി | Two numbers: {a} activated out of {n}. Check the order reads right in this language. | |
| `account.gender` | Gender | ലിംഗം | Profile field label. | |
| `account.genderUnset` | Not set | നൽകിയിട്ടില്ല | Shown when nothing was chosen. | |
| `account.genderMale` | Male | പുരുഷൻ | Option. | |
| `account.genderFemale` | Female | സ്ത്രീ | Option. | |
| `account.genderOther` | Other | മറ്റുള്ളവ | Option. | |
| `account.genderPreferNot` | Prefer not to say | പറയാൻ ഇഷ്ടമില്ല | Option. Should sound like a choice, not a refusal. | |
| `account.dob` | Date of birth | ജനന തീയതി | Profile field label. | |
| `account.dobInvalid` | Enter the date of birth as YYYY-MM-DD. | ജനന തീയതി YYYY-MM-DD രൂപത്തിൽ എഴുതുക. | YYYY-MM-DD is deliberately left in Latin — it is the format the field accepts. | |
| `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | ഫോൺ നമ്പറാണ് നിങ്ങളുടെ ലോഗിൻ, ഇവിടെ മാറ്റാനാവില്ല. | Explains why the phone field is locked. | |
| `account.dataSaverSub` | Skip extra photos on slow networks | നെറ്റ് പതുക്കെയാണെങ്കിൽ അധിക ഫോട്ടോ എടുക്കില്ല | What data saver does. Plain words for a slow connection. | |
| `voice.search` | Search by voice | ശബ്ദത്തിലൂടെ തിരയുക | Mic button label. Follows the phrasing this block's chelp.e2.a already uses for speaking to the app. | |
| `voice.hint.permission` | Microphone access is off. Turn it on in Settings to search by voice. | മൈക്ക് അനുമതി ഇല്ല. ശബ്ദത്തിലൂടെ തിരയാൻ സെറ്റിംഗ്സിൽ അത് ഓണാക്കുക. | Points at the phone Settings app. | |
| `voice.hint.no-match` | Did not catch that. Please try again. | മനസ്സിലായില്ല. വീണ്ടും പറയുക. | The app did not understand. Must not sound like it is blaming the shopper. | |
| `voice.hint.network` | Voice search needs the internet. Check your connection. | ശബ്ദത്തിലൂടെ തിരയാൻ ഇന്റർനെറ്റ് വേണം. നിങ്ങളുടെ കണക്ഷൻ നോക്കുക. | Voice needs the internet. | |
| `voice.hint.unavailable` | Voice search is not available right now. | ശബ്ദത്തിലൂടെ തിരയൽ ഇപ്പോൾ ലഭ്യമല്ല. | Temporary. | |
| `voice.notInLanguage` | Voice search is not available in this language yet. | ഈ ഭാഷയിൽ ശബ്ദത്തിലൂടെ തിരയൽ ഇതുവരെ ലഭ്യമല്ല. | This language has no recognizer yet. | |
| `psearch.title` | Find an item | സാധനം തിരയുക | Screen title. | |
| `psearch.voiceIn` | Listens in {language} | {language} ൽ കേൾക്കും | {language} is the language name in its OWN script, dropped in as-is. | |
| `psearch.buyAgain` | Buy it again | വീണ്ടും വാങ്ങുക | Section over things bought before. | |
| `psearch.recent` | Recent searches | അടുത്തിടെ തിരഞ്ഞവ | Section over recent searches. | |
| `psearch.clearRecent` | Clear | മായ്ക്കുക | One word, clears the recent list. | |
| `psearch.browse` | Shop by category | വിഭാഗം അനുസരിച്ച് വാങ്ങുക | Section over the category shelves. | |
| `shops.heroTitle` | What do you need today? | ഇന്ന് നിങ്ങൾക്ക് എന്താണ് വേണ്ടത്? | The greeting at the top of the shops screen. Should sound friendly, not formal. | |

### Routine chrome

Errors and the update card. A clumsy line here annoys; it does not cost anything.

| Key | English | Malayalam as shipped | What to check | ✓ / correction |
| --- | --- | --- | --- | --- |
| `err.offline` | No internet right now. Check your connection and try again. | ഇപ്പോൾ ഇന്റർനെറ്റ് ഇല്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കുക. | No connection. | |
| `err.slow` | The network is too slow to finish that. Please try again. | നെറ്റ് വളരെ പതുക്കെയായതിനാൽ അത് പൂർത്തിയായില്ല. വീണ്ടും ശ്രമിക്കുക. | The connection was too slow to finish. | |
| `err.server` | Something went wrong at our end. Please try again in a moment. | ഞങ്ങളുടെ ഭാഗത്ത് എന്തോ കുഴപ്പം. കുറച്ച് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക. | Our fault, not theirs. Must say so. | |
| `err.notFound` | That is not available any more. | അത് ഇനി ഇല്ല. | The thing is gone. | |
| `err.notAllowed` | You cannot open this. | ഇത് നിങ്ങൾക്ക് തുറക്കാനാവില്ല. | Not permitted. | |
| `err.signedOut` | You have been signed out. Please sign in again. | നിങ്ങൾ സൈൻ ഔട്ട് ആയി. വീണ്ടും സൈൻ ഇൻ ചെയ്യുക. | Session expired. | |
| `err.tooMany` | Too many tries. Please wait a minute and try again. | ഒരുപാട് തവണ ശ്രമിച്ചു. ഒരു മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക. | Rate limited. | |
| `err.badRequest` | Something in that was not right. Please check and try again. | അതിൽ എന്തോ ശരിയല്ല. നോക്കി വീണ്ടും ശ്രമിക്കുക. | Something they typed was wrong. | |
| `err.conflict` | That could not be done just now. Please try again. | അത് ഇപ്പോൾ ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക. | Could not be done right now. | |
| `err.generic` | Something went wrong. Please try again. | എന്തോ കുഴപ്പം സംഭവിച്ചു. വീണ്ടും ശ്രമിക്കുക. | Catch-all. | |
| `upd.title` | App version & updates | ആപ്പ് വേർഷൻ & അപ്‌ഡേറ്റുകൾ | Card title on the account screen. | |
| `upd.sub` | Which version of the app is running on this phone. | ഈ ഫോണിൽ ആപ്പിന്റെ ഏത് വേർഷൻ ഓടുന്നു എന്ന്. | Card subtitle. | |
| `upd.embedded` | Built-in version — never updated | ആപ്പിനൊപ്പം വന്ന വേർഷൻ — ഒരിക്കലും അപ്‌ഡേറ്റ് ആയിട്ടില്ല | The build that shipped with the app. | |
| `upd.downloaded` | Running a downloaded update | ഡൗൺലോഡ് ചെയ്ത അപ്‌ഡേറ്റ് ഓടുന്നു | An over-the-air update is running. | |
| `upd.bundle` | Version | വേർഷൻ | Row label. | |
| `upd.builtOn` | Age | എത്ര പഴയത് | Row label: how old the running build is. | |
| `upd.unknown` | unknown | അറിയില്ല | Lower case in English; it sits inside a row value. | |
| `upd.ageNow` | just now | ഇപ്പോൾ തന്നെ | Just built. | |
| `upd.ageMinutes` | {n} minutes old | {n} മിനിറ്റ് പഴക്കം | {n} is a number. | |
| `upd.ageHours` | {n} hours old | {n} മണിക്കൂർ പഴക്കം | {n} is a number. | |
| `upd.ageDays` | {n} days old | {n} ദിവസം പഴക്കം | {n} is a number. | |
| `upd.check` | Check for updates now | ഇപ്പോൾ തന്നെ അപ്‌ഡേറ്റ് നോക്കുക | Button. | |
| `upd.checking` | Checking… | നോക്കുന്നു… | Button, busy. | |
| `upd.upToDate` | You already have the latest version. | നിങ്ങളുടെ കയ്യിൽ ഇപ്പോൾത്തന്നെ പുതിയ വേർഷൻ ഉണ്ട്. | Nothing to do. | |
| `upd.reloading` | New version downloaded. Restarting the app… | പുതിയ വേർഷൻ ഡൗൺലോഡ് ആയി. ആപ്പ് വീണ്ടും തുടങ്ങുന്നു… | The app is about to restart itself. | |
| `upd.failed` | Could not check for updates. Check your internet and try again. | അപ്‌ഡേറ്റ് നോക്കാനായില്ല. ഇന്റർനെറ്റ് നോക്കി വീണ്ടും ശ്രമിക്കുക. | Could not reach the update server. | |
| `upd.disabled` | Updates are switched off in this build. | ഈ ആപ്പിൽ അപ്‌ഡേറ്റുകൾ ഓഫാണ്. | Updates off in this build. | |
| `stmt.last30` | Last 30 days | കഴിഞ്ഞ 30 ദിവസം | Range shortcut. | |
| `stmt.last90` | Last 90 days | കഴിഞ്ഞ 90 ദിവസം | Range shortcut. | |
| `stmt.badDate` | Enter both dates as YYYY-MM-DD. | രണ്ട് തീയതിയും YYYY-MM-DD രൂപത്തിൽ എഴുതുക. | YYYY-MM-DD stays in Latin — it is the format the field accepts. | |
| `stmt.exportOnWeb` | Download CSV or print | CSV ഡൗൺലോഡ് ചെയ്യുക അല്ലെങ്കിൽ പ്രിന്റ് ചെയ്യുക | CSV stays CSV. | |
| `stmt.exportOnWebSub` | Saving a file and printing need the web app. This opens it, already signed in. | ഫയൽ സേവ് ചെയ്യാനും പ്രിന്റ് ചെയ്യാനും വെബ് ആപ്പ് വേണം. ഇത് അത് നിങ്ങൾ സൈൻ ഇൻ ചെയ്ത നിലയിൽത്തന്നെ തുറക്കും. | Explains why this hands off to the web app. | |

---

448 rows, 112 strings in each of four languages, generated from the shipped
dictionary. Machine-authored and awaiting native review.
