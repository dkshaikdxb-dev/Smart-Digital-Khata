import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { NativeModules, Platform, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Lightweight i18n for the native consumer app. A flat key -> string map per
// language, a t() with {var} interpolation, and a language setter persisted in
// expo-secure-store. en is the source of truth; a key absent from the active
// language falls back to en, so nothing ever renders blank or as a key name.
//
// Coverage is PARTIAL and deliberately so: only en is complete. Every other
// language carries the keys some human has actually written, and falls back for
// the rest. The repo-root scripts/i18n-coverage.mjs measures the real numbers
// against en and fails CI if any language loses ground.

const LANG_KEY = 'skhata_consumer_lang';

// The supported languages, in the order shown in the picker. Every one of them
// is fully selectable; none but en is fully translated (see the note above).
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'mr', label: 'मराठी' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'ur', label: 'اردو' },
];

// ---------------------------------------------------------------------------
// Per-language capability map (STATIC, offline-first).
//
// This mirrors the server-side language registry BY HAND — there is deliberately
// NO network fetch here so the picker is honest even offline. When coverage
// changes on the server, update this map to match. Sources of truth to keep in
// sync with:
//   - admin-dashboard/src/lib/useSpeech.js  — BCP-47 ASR/TTS (voice) coverage
//   - the server `catalog_i18n` catalogue-translation coverage
//
// `catalogue` = a shop catalogue is served translated in this language.
// `voice`     = ASR/TTS (BCP-47) is available for this language.
//
// This map is about CATALOGUE and VOICE only — it says nothing about how much of
// the UI is translated, which is partial for every language but en. bn/gu/mr DO
// have a translated catalogue now, so they carry { catalogue: true } together
// with an explicit { beta: true }, and keep the picker's "(beta)" suffix (still
// fully selectable) — isBetaLang() reads that explicit flag first and only falls
// back to the catalogue flag for a language that has not set one. See the note
// below for why the two stopped being the same thing. Their `voice` flag flipped
// to true in batch LANG, when
// mobile-app/src/lib/useNativeVoice.js started mapping bn-IN / gu-IN / mr-IN;
// the LIVE gate on the shops screen is that hook's localeSupported(), and this
// map is the forward-looking mirror of it. A mapped language is still only
// spoken/heard if the handset has the language pack, which no static map can
// know — the hook reports that honestly at run time as `unavailable`.
// `catalogue` says the product CATALOGUE is localized; `beta` is the warning we
// show the user beside the language name, and the two stopped meaning the same
// thing once bn/gu/mr got their catalogue.
//
// They now have all 481 catalogue names, so `catalogue` is true and the app is
// right to expect localized product names. They are still the least complete
// three, and deriving the beta marker from `catalogue` alone would have dropped
// the warning silently the moment the catalogue landed. They keep it, for
// reasons that are specific and checkable: the shipped catalogue carries
// DESCRIPTIONS in six languages and these three are not among them, so a name
// reads in Bengali above an English sentence; their consumer UI sits at 162 of
// 335 strings against 226 for the others; and the owner app's own bn/gu/mr were
// authored in-repo and have not yet been read by a native speaker.
//
// Drop `beta` for a language when those close, not when this file is edited.
export const LANG_CAPS = {
  en: { catalogue: true, voice: true },
  hi: { catalogue: true, voice: true },
  bn: { catalogue: true, voice: true, beta: true },
  ta: { catalogue: true, voice: true },
  te: { catalogue: true, voice: true },
  kn: { catalogue: true, voice: true },
  ml: { catalogue: true, voice: true },
  mr: { catalogue: true, voice: true, beta: true },
  gu: { catalogue: true, voice: true, beta: true },
  ur: { catalogue: true, voice: true },
};

// Pure capability helpers. Default to false for any unknown/unlisted code, so a
// newly added language is treated as capability-less until it is added above.
export function langHasCatalogue(code) {
  const caps = LANG_CAPS[code];
  return !!(caps && caps.catalogue);
}

// Native voice UI gates on useNativeVoice().localeSupported() (the live BCP-47
// map). langHasVoice(code) is the static mirror of that map, kept for parity with
// the PWA's canUseVoice; keep the two in step when a language is added.
export function langHasVoice(code) {
  const caps = LANG_CAPS[code];
  return !!(caps && caps.voice);
}

// Beta marker. An explicit `beta` flag when one is set, otherwise the old rule:
// a language with no translated catalogue is beta. Pickers append a localized
// "(beta)" suffix to these labels but keep them fully selectable — the warning
// is about completeness, never about whether the language works.
export function isBetaLang(code) {
  const caps = LANG_CAPS[code];
  if (caps && typeof caps.beta === 'boolean') return caps.beta;
  return !langHasCatalogue(code);
}

// Convenience set of the beta (UI-only) language codes, derived from LANG_CAPS.
export const BETA_LANGS = new Set(
  LANGUAGES.map((l) => l.code).filter((code) => isBetaLang(code)),
);

const en = {
  'app.name': 'Smart Digital Khata',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.save': 'Save',
  'common.total': 'Total',
  'common.subtotal': 'Subtotal',
  'common.items': 'Items',
  'common.status': 'Status',

  'tab.khata': 'Khata',
  'tab.shops': 'Shops',
  'tab.products': 'Products',
  'tab.orders': 'Orders',
  'tab.cart': 'Cart',
  'tab.account': 'Account',

  'login.title': 'Sign in',
  'login.blurb': 'See your khata across every shop, pay dues, and order — all in one place.',
  'login.mobile': 'Mobile number',
  'login.otpHint': 'We will send a 6-digit code on WhatsApp.',
  'login.sendCode': 'Send code',
  'login.sending': 'Sending…',
  'login.enterCode': 'Enter the code sent to {phone}',
  'login.codePlaceholder': '6-digit code',
  'login.verify': 'Verify & continue',
  'login.verifying': 'Verifying…',
  'login.changeNumber': 'Change number',
  'login.resend': 'Resend code',
  'login.devCode': 'Test code:',
  'login.failed': 'Could not sign in. Please try again.',
  'login.heroTitle': 'Your shop khata, in your pocket',
  'login.heroSub': 'Sign in with your phone. We send a code on WhatsApp — no password to remember.',
  'login.madeForBharat': 'Made for Bharat · towns & villages',
  'login.verifyTitle': 'Verify your number',
  'login.enterCodeTitle': 'Enter the 6-digit code',
  'login.resendIn': 'Resend in {sec}s',
  'login.codeValidity': 'The code is valid for 5 minutes.',

  'khata.title': 'My khata',
  'khata.totalOutstanding': 'Total you owe',
  'khata.loading': 'Loading your khata…',
  'khata.none': 'You have no khata at any shop yet.',
  'khata.balance': 'Balance',
  'khata.owe': 'You owe',
  'khata.advance': 'In advance',
  'khata.settled': 'All settled',
  'khata.limitSuffix': ' · limit {amt}',
  'khata.pay': 'Pay',
  'khata.opening': 'Opening…',

  'shopkhata.title': 'Shop khata',
  'shopkhata.loading': 'Loading entries…',
  'shopkhata.entries': 'Entries',
  'shopkhata.noEntries': 'No entries yet.',
  'shopkhata.payNow': 'Pay now',
  'shopkhata.payTitle': 'Pay {shop}',
  'shopkhata.amountRupees': 'Amount (₹)',
  'shopkhata.youOwe': 'You owe {amt}',
  'shopkhata.payFull': 'Pay full balance',
  'shopkhata.startPay': 'Continue to payment',
  'shopkhata.starting': 'Starting…',
  'shopkhata.enterAmount': 'Enter an amount to pay.',
  'shopkhata.overpay': 'Amount is more than you owe here.',
  'shopkhata.nothingDue': 'Nothing due at this shop.',
  'shopkhata.paySuccess': 'Payment complete. Refreshing your balance…',
  'txn.purchase': 'Purchase',
  'txn.payment': 'Payment',
  'txn.cash': 'Cash paid',
  'txn.credit': 'Credit',
  // UPI was already a possible ledger type and simply had no word here, so a
  // row rendered the raw enum 'upi'. Fixed alongside the fourth type below.
  'txn.upi': 'UPI paid',
  // The FOURTH transaction type (batch C): the shop reducing an order it could
  // not fully supply. It LOWERS what is owed, like a payment — but the customer
  // handed nothing over, so it gets its own word rather than being called one.
  'txn.adjustment': 'Adjusted by shop',

  // --- THE SHOP REDUCED YOUR ORDER (batch C) ---------------------------
  // en + hi are AUTHORED; every other language falls back to English through
  // translate(). The customer must never simply find a smaller number with no
  // explanation, and an explanation about money is not worth guessing at in a
  // language the author cannot read back.
  'coedit.title': 'The shop adjusted your order',
  'coedit.intro': '{shop} could not supply everything you ordered.',
  'coedit.removed': '{item} — removed',
  'coedit.reduced': '{item} — {before} → {after}',
  'coedit.nowTotal': 'Your order now comes to {now}.',
  'coedit.wasSubtotal': 'Original items total {was}',
  'coedit.credit': '{amount} has been taken off your khata at this shop.',
  'coedit.prepaid': 'You had already paid. {amount} is kept as credit at this shop — it comes off your next order here.',
  'coedit.cash': 'Pay {now} when you collect — {amount} of items were taken off.',

  'pay.title': 'Payment',
  'pay.secure': 'You are paying securely on the shop’s payment page.',
  'pay.done': 'Done',
  'pay.cancelled': 'Payment not completed.',

  'shops.title': 'Discover shops',
  'shops.heading': 'Shops near you',
  'shops.searchPlaceholder': 'Search shop or city',
  'shops.loading': 'Loading shops…',
  'shops.none': 'No shops found. Try a different search.',
  'shops.useLocation': 'Near me',
  'shops.locating': 'Finding you…',
  'shops.nearby': 'Nearby',
  'shops.locationOff': 'Location is not available. Showing all shops.',
  'shops.itemsCount': '{n} items',
  'shops.kmAway': '{km} km away',
  'shops.noLocation': 'Location not set',

  // OS-native voice search on the shops screen. The mic only shows when the
  // device supports recognition AND the current language maps to a recognizer
  // locale. All ten languages map since batch LANG, so `voice.notInLanguage` is
  // now only reached by a language outside the picker. Hints auto-clear.
  'voice.search': 'Search by voice',
  'voice.listening': 'Listening…',
  'voice.hint.permission': 'Microphone access is off. Turn it on in Settings to search by voice.',
  'voice.hint.no-match': 'Did not catch that. Please try again.',
  'voice.hint.network': 'Voice search needs the internet. Check your connection.',
  'voice.hint.unavailable': 'Voice search is not available right now.',
  'voice.notInLanguage': 'Voice search is not available in this language yet.',

  'shopdetail.loading': 'Loading catalog…',
  'shopdetail.noItems': 'This shop has not added items yet.',
  'shopdetail.perKg': '/ kg',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'unit',
  'shopdetail.add': 'Add',
  'shopdetail.review': 'Review order',
  'shopdetail.deliveryFee': 'Delivery {amt}',
  'shopdetail.pickup': 'Pickup',
  'shopdetail.delivery': 'Delivery',

  'cart.title': 'Your cart',
  'cart.empty': 'Your cart is empty.',
  'cart.browse': 'Browse shops',
  'cart.fulfillment': 'How to get it',
  'cart.pickup': 'Pickup',
  'cart.delivery': 'Delivery',
  'cart.payment': 'Payment',
  'cart.onKhata': 'On khata',
  'cart.payOnline': 'Pay online',
  'cart.payCash': 'Cash',
  'cart.address': 'Delivery address',
  'cart.addressPlaceholder': 'House no, street, area, landmark',
  'cart.note': 'Note for the shop',
  'cart.notePlaceholder': 'e.g. call on arrival',
  'cart.deliveryFee': 'Delivery fee',
  'cart.freeDelivery': 'Free',
  'cart.belowMin': 'Minimum order for delivery is {amt}',
  'cart.placeOrder': 'Place order',
  'cart.placing': 'Placing…',
  'cart.addressRequired': 'Please enter a delivery address.',
  'cart.creditNote': 'Added to your khata at this shop.',
  'cart.prepaidNote': 'Pay now on the shop’s secure page.',
  'cart.cashNote': 'Pay cash on pickup or delivery.',
  'cart.remove': 'Remove',

  'orders.title': 'My orders',
  'orders.loading': 'Loading your orders…',
  'orders.none': 'You have no orders yet.',
  'orders.itemsCount': '{n} items',

  'orderdetail.title': 'Order',
  'orderdetail.loading': 'Loading order…',
  'orderdetail.deliverTo': 'Deliver to:',
  'orderdetail.note': 'Note:',
  'orderdetail.payment': 'Payment:',
  'orderdetail.cancel': 'Cancel order',
  'orderdetail.cancelling': 'Cancelling…',
  'orderdetail.cancelConfirm': 'Cancel this order?',
  'orderdetail.deliveryFee': 'Delivery fee',

  'ostatus.pending': 'Pending',
  'ostatus.accepted': 'Accepted',
  'ostatus.preparing': 'Preparing',
  'ostatus.ready': 'Ready',
  'ostatus.out_for_delivery': 'Out for delivery',
  'ostatus.completed': 'Completed',
  'ostatus.cancelled': 'Cancelled',
  'pmode.credit': 'On khata',
  'pmode.prepaid': 'Online',
  'pmode.cash': 'Cash',
  'pstatus.paid': 'Paid',

  'account.title': 'Account',
  'account.prepay': 'Pay in advance',
  'account.prepaySub': 'Pre-load credit & clear dues on the web',
  'account.moreOnWeb': 'More',
  'account.profile': 'Profile',
  'account.subtitle': 'All fields optional. Your phone is your login and cannot change here.',
  'account.name': 'Name',
  'account.phone': 'Phone',
  'account.email': 'Email',
  'account.optional': 'optional',
  'account.save': 'Save',
  'account.saving': 'Saving…',
  'account.saved': 'Saved.',
  'account.loadError': 'Could not load your profile.',
  'account.language': 'Language',
  'account.logout': 'Log out',
  'account.logoutConfirm': 'Log out of Smart Digital Khata?',
  'account.dataSaver': 'Data saver',
  'account.dataSaverSub': 'Skip extra photos on slow networks',

  // Suffix appended to picker labels of UI-only (no catalogue) languages.
  'login.betaSuffix': ' (beta)',

  // Shop availability (batch A) — whether the shop is taking orders right now.
  // The SAME key names exist in admin-dashboard/src/lib/i18n.js (consumer PWA)
  // and mobile-app/src/i18n.js (owner app), so a shopper reads the same words
  // in the app and on the web. en is the source of truth and hi is authored
  // below; every other language falls back to these English values the way this
  // file already handles missing keys. Nothing here is machine-translated — a
  // shopper mis-reading "closed" costs the shop a sale.
  'open.open': 'Open',
  'open.closed': 'Closed',
  'open.closedPill': 'Closed',
  'open.todayAt': 'at {time}',
  'open.tomorrowAt': 'tomorrow at {time}',
  'open.stateClosed': 'Closed — the shop is switched off right now',
  'open.statePaused': 'Paused — back {when}',
  'open.stateHoliday': 'Closed today — reopens {when}',
  'open.stateHolidayReason': 'Closed today ({reason}) — reopens {when}',
  'open.stateHours': 'Closed — opens {when}',
  'open.bannerTitle': 'This shop is closed right now',
  'open.browseOnly': 'You can look around — ordering opens again when the shop does.',
  'open.cannotOrder': 'Closed — cannot order',
  'open.cartBlocked': 'This shop is closed right now, so the order cannot be placed. Your cart is saved.',

  // Ready-time promise (batch B) — what a shopper reads once the shop has
  // accepted the order and said when it will be ready. The SAME key names exist
  // in admin-dashboard/src/lib/i18n.js (consumer PWA) and mobile-app/src/i18n.js
  // (owner app), so the shopper reads the same words in the app and on the web.
  // en is the source of truth and hi is authored below; every other language
  // falls back to these English values the way this file already handles missing
  // keys. Nothing here is machine-translated — a wrong ready time costs a
  // shopper a wasted trip.
  'eta.readyBy': 'Ready by {time}',
  'eta.takingLonger': 'Taking a little longer',
  'eta.takingLongerHelp': 'It was expected by {time}. It should not be much longer.',
  'eta.noPromise': 'No ready time promised',

  // --- BATCH MPARITY: closing the gaps against the web PWA -----------------
  // en is the source of truth and hi is authored below; every other language
  // falls back to these English values, the way this file already handles a
  // missing key. Nothing here is machine-translated. Where a string already
  // exists word for word in admin-dashboard/src/lib/i18n.js (the consumer PWA)
  // it is reused verbatim, so a shopper who uses both surfaces reads the same
  // sentence in each rather than two renderings of the same idea.

  // The cart is being read back off disk at launch. This is NOT the empty
  // state — saying "your cart is empty" to someone whose cart is still loading
  // is the exact failure this batch exists to remove.
  'cart.restoring': 'Getting your cart…',

  // Switching shops. A cart belongs to one shop, and the app used to replace
  // the whole basket without asking. The confirm sentence is the consumer
  // PWA's 'c.switchCartConfirm', word for word.
  'cart.switchShopTitle': 'Cart at another shop',
  'cart.switchShopConfirm': 'You have an unfinished cart at another shop. Clear it and start a cart here?',
  'cart.switchShopClear': 'Clear and start here',

  // Cross-shop product search. Mirrors the PWA's /c/products strings.
  'psearch.title': 'Find an item',
  'psearch.placeholder': 'Search products across shops',
  'psearch.searching': 'Searching…',
  'psearch.start': 'Search for a product to see which shops nearby have it.',
  'psearch.none': 'No products found. Try another word.',
  'psearch.failedTitle': 'Search did not finish',
  'psearch.atShop': 'at {shop}',
  // The full-width voice control, and the three sections under it. {language}
  // is the language's OWN name out of LANGUAGES, never a translated string.
  'psearch.voiceIn': 'Listens in {language}',
  'psearch.buyAgain': 'Buy it again',
  'psearch.recent': 'Recent searches',
  'psearch.clearRecent': 'Clear',
  'psearch.browse': 'Shop by category',

  // Quick-browse categories on the shop directory (labels only — the search
  // term sent to the API stays the English base word).
  'cat.attaRice': 'Atta & Rice',
  'cat.dairy': 'Dairy',
  'cat.snacks': 'Snacks',
  'cat.household': 'Household',
  'cat.personalCare': 'Personal Care',
  // Three shelves the chips gained when they stopped being keyword guesses.
  'cat.dalPulses': 'Dal & Pulses',
  'cat.spices': 'Spices',
  'cat.cookingOils': 'Cooking Oils',

  'shops.heroTitle': 'What do you need today?',
  'shops.searching': 'Searching…',

  // FAILED is not EMPTY. Each of these titles a card that says a load did not
  // finish, so "nothing here" is never how a shopper learns their basket,
  // their orders or a shop's shelves could not be fetched.
  'shops.failedTitle': 'Could not load shops',
  'shopdetail.failedTitle': 'Could not load this shop',
  'orders.failedTitle': 'Could not load your orders',

  // What the shopper is waiting for at each status — the line the web has
  // always shown under the status chip and the app never did. `ready` splits by
  // fulfillment: a pickup order is ready for them to collect, a delivery order
  // is ready and waiting to go out.
  'ostatus.hint.pending': 'Waiting for the shop to accept',
  'ostatus.hint.accepted': 'Accepted — preparing soon',
  'ostatus.hint.preparing': 'Being prepared',
  'ostatus.hint.ready_pickup': 'Ready for pickup',
  'ostatus.hint.ready_delivery': 'Ready — awaiting dispatch',
  'ostatus.hint.out_for_delivery': 'Out for delivery',
  'ostatus.hint.completed': 'Completed',
  'ostatus.hint.cancelled': 'Order cancelled',

  // What a shopper reads when a request fails. A shopper must NEVER be shown
  // the raw text — "Network Error", "timeout of 15000ms exceeded", "Request
  // failed with status code 500" — which names no cause they can act on and
  // reads like the app blaming them. Each of these says what happened and, by
  // implication, what to do; the screens add a Retry only where retrying helps.
  'err.offline': 'No internet right now. Check your connection and try again.',
  'err.slow': 'The network is too slow to finish that. Please try again.',
  'err.server': 'Something went wrong at our end. Please try again in a moment.',
  'err.notFound': 'That is not available any more.',
  'err.notAllowed': 'You cannot open this.',
  'err.signedOut': 'You have been signed out. Please sign in again.',
  'err.tooMany': 'Too many tries. Please wait a minute and try again.',
  'err.badRequest': 'Something in that was not right. Please check and try again.',
  'err.conflict': 'That could not be done just now. Please try again.',
  'err.generic': 'Something went wrong. Please try again.',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'account.gender': 'Gender',
  'account.genderUnset': 'Not set',
  'account.genderMale': 'Male',
  'account.genderFemale': 'Female',
  'account.genderOther': 'Other',
  'account.genderPreferNot': 'Prefer not to say',
  'account.dob': 'Date of birth',
  'account.phoneReadonly': 'Phone is your login ID and cannot be changed here.',
  'num.title': 'Mobile number',
  'num.current': 'Current number',
  'num.change': 'Change number',
  'num.new': 'New mobile number',
  'num.newHint': "We'll send a code to the new number to confirm it's yours. Your khata at every shop moves to it.",
  'num.sendCode': 'Send code',
  'num.sending': 'Sending…',
  'num.enterCode': 'Enter the code sent to {phone}',
  'num.confirm': 'Confirm change',
  'num.changing': 'Changing…',
  'num.cancel': 'Cancel',
  'num.changed': 'Number changed. Your khata across all shops now uses the new number.',
  'num.devCode': 'Dev code:',
  'stmt.title': 'Account statement',
  'stmt.subtitle': 'Opening balance, dated entries for a range, and closing balance.',
  'stmt.pickShop': 'Choose a shop',
  'stmt.allShops': 'All shops (combined)',
  'stmt.from': 'From',
  'stmt.to': 'To',
  'stmt.view': 'View',
  'stmt.opening': 'Opening balance',
  'stmt.closing': 'Closing balance',
  'stmt.totalPurchases': 'Total purchases',
  'stmt.totalPaid': 'Total paid',
  'stmt.totalAdjusted': 'Adjusted by shop',
  'stmt.noData': 'No entries in this date range.',
  'stmt.rangeError': 'The From date must be on or before the To date.',
  'stmt.loadError': 'Could not load the statement.',
  'stmt.combined': 'Combined total',
  'common.balance': 'Balance',
  'ref.title': 'Invite & earn',
  'ref.subtitle': 'Share your code. When someone joins with it, they appear here.',
  'ref.yourCode': 'Your referral code',
  'ref.shareLink': 'Share link',
  'ref.creditBalance': 'Your referral credit',
  'ref.referredCount': 'You have referred {n} so far.',
  'ref.activatedOf': '{a} of {n} activated',
  'ref.noneYet': 'No referrals yet — share your code to get started.',
  'ref.referredByLabel': 'You were invited by',
  'ref.loadError': 'Could not load referrals.',
  'ref.type.shop': 'Shop',
  'ref.type.owner': 'Shop owner',
  'ref.type.customer': 'Customer',
  'chelp.title': 'Help & FAQ',
  'chelp.subtitle': 'Short answers for shopping, orders and your khata.',
  'chelp.e2.q': 'How do I search for a product?',
  'chelp.e2.a': 'Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name.',
  'chelp.e3.q': 'How do I place an order?',
  'chelp.e3.a': 'Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it.',
  'chelp.e4.q': 'What is the difference between pickup and delivery?',
  'chelp.e4.a': 'Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount.',
  'chelp.e5.q': 'How do I pay for an order?',
  'chelp.e5.a': 'You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later.',
  'chelp.e6.q': 'How does my khata (udhaar) work?',
  'chelp.e6.a': 'Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement.',
  'chelp.e7.q': 'How do I track my order?',
  'chelp.e7.a': 'Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step.',
  'shopdetail.searchProducts': 'Search products',
  'shopdetail.allCategories': 'All categories',
  'shopdetail.category': 'Category',
  'shopdetail.brand': 'Brand',
  'shopdetail.size': 'Size',
  'shopdetail.noResults': 'No matching items.',

  // --- Over-the-air update status (batch OTA) ------------------------------
  // English only. These are new strings; nothing equivalent exists anywhere in
  // this repo to copy from, and inventing ten translations is not this batch's
  // work. Every other language falls back to English here, which is the
  // dictionary's documented behaviour. Listed for a translator.
  'upd.title': 'App version & updates',
  'upd.sub': 'Which version of the app is running on this phone.',
  'upd.embedded': 'Built-in version — never updated',
  'upd.downloaded': 'Running a downloaded update',
  'upd.bundle': 'Version',
  'upd.builtOn': 'Age',
  'upd.runtime': 'Runtime',
  'upd.channel': 'Channel',
  'upd.unknown': 'unknown',
  'upd.ageNow': 'just now',
  'upd.ageMinutes': '{n} minutes old',
  'upd.ageHours': '{n} hours old',
  'upd.ageDays': '{n} days old',
  'upd.check': 'Check for updates now',
  'upd.checking': 'Checking…',
  'upd.upToDate': 'You already have the latest version.',
  'upd.reloading': 'New version downloaded. Restarting the app…',
  'upd.failed': 'Could not check for updates. Check your internet and try again.',
  'upd.disabled': 'Updates are switched off in this build.',

  // --- Account additions (English only; listed for a translator) ------------
  'account.manage': 'Manage',
  'account.dobInvalid': 'Enter the date of birth as YYYY-MM-DD.',

  // --- Statement additions (English only; listed for a translator) ----------
  'stmt.last30': 'Last 30 days',
  'stmt.last90': 'Last 90 days',
  'stmt.badDate': 'Enter both dates as YYYY-MM-DD.',
  'stmt.exportOnWeb': 'Download CSV or print',
  'stmt.exportOnWebSub': 'Saving a file and printing need the web app. This opens it, already signed in.',
};

const hi = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'दाल और दलहन',
  'cat.spices': 'मसाले',
  'cat.cookingOils': 'खाद्य तेल',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'account.moreOnWeb': 'और',
  'app.name': 'स्मार्ट डिजिटल खाता',
  'common.loading': 'लोड हो रहा है…',
  'common.retry': 'फिर कोशिश करें',
  'common.cancel': 'रद्द करें',
  'common.back': 'वापस',
  'common.close': 'बंद करें',
  'common.search': 'खोजें',
  'common.save': 'सेव करें',
  'common.total': 'कुल',
  'common.subtotal': 'उप-योग',
  'common.items': 'सामान',
  'common.status': 'स्थिति',

  'tab.khata': 'खाता',
  'tab.shops': 'दुकानें',
  'tab.products': 'उत्पाद',
  'tab.orders': 'ऑर्डर',
  'tab.cart': 'कार्ट',
  'tab.account': 'अकाउंट',

  'login.title': 'साइन इन करें',
  'login.blurb': 'हर दुकान का अपना खाता देखें, बकाया चुकाएँ और ऑर्डर करें — सब एक जगह।',
  'login.mobile': 'मोबाइल नंबर',
  'login.otpHint': 'हम व्हाट्सऐप पर 6 अंकों का कोड भेजेंगे।',
  'login.sendCode': 'कोड भेजें',
  'login.sending': 'भेजा जा रहा है…',
  'login.enterCode': '{phone} पर भेजा गया कोड डालें',
  'login.codePlaceholder': '6 अंकों का कोड',
  'login.verify': 'सत्यापित करें व आगे बढ़ें',
  'login.verifying': 'सत्यापित हो रहा है…',
  'login.changeNumber': 'नंबर बदलें',
  'login.resend': 'कोड फिर भेजें',
  'login.devCode': 'टेस्ट कोड:',
  'login.failed': 'साइन इन नहीं हो सका। फिर कोशिश करें।',
  'login.heroTitle': 'आपकी दुकान का खाता, आपकी जेब में',
  'login.heroSub': 'अपने फ़ोन से साइन इन करें। हम व्हाट्सऐप पर कोड भेजते हैं — कोई पासवर्ड याद रखने की ज़रूरत नहीं।',
  'login.madeForBharat': 'भारत के लिए बना · कस्बे और गाँव',
  'login.verifyTitle': 'अपना नंबर सत्यापित करें',
  'login.enterCodeTitle': '6 अंकों का कोड डालें',
  'login.resendIn': '{sec}से में फिर भेजें',
  'login.codeValidity': 'कोड 5 मिनट तक मान्य है।',

  'khata.title': 'मेरा खाता',
  'khata.totalOutstanding': 'कुल बकाया',
  'khata.loading': 'आपका खाता लोड हो रहा है…',
  'khata.none': 'अभी किसी दुकान पर आपका खाता नहीं है।',
  'khata.balance': 'बैलेंस',
  'khata.owe': 'आप पर बकाया',
  'khata.advance': 'अग्रिम जमा',
  'khata.settled': 'पूरा चुकता',
  'khata.limitSuffix': ' · सीमा {amt}',
  'khata.pay': 'भुगतान',
  'khata.opening': 'खुल रहा है…',

  'shopkhata.title': 'दुकान का खाता',
  'shopkhata.loading': 'एंट्री लोड हो रही हैं…',
  'shopkhata.entries': 'एंट्री',
  'shopkhata.noEntries': 'अभी कोई एंट्री नहीं।',
  'shopkhata.payNow': 'अभी भुगतान करें',
  'shopkhata.payTitle': '{shop} को भुगतान',
  'shopkhata.amountRupees': 'राशि (₹)',
  'shopkhata.youOwe': 'आप पर {amt} बकाया',
  'shopkhata.payFull': 'पूरा बकाया चुकाएँ',
  'shopkhata.startPay': 'भुगतान पर जाएँ',
  'shopkhata.starting': 'शुरू हो रहा है…',
  'shopkhata.enterAmount': 'भुगतान की राशि डालें।',
  'shopkhata.overpay': 'राशि आपके बकाया से अधिक है।',
  'shopkhata.nothingDue': 'इस दुकान पर कुछ बकाया नहीं।',
  'shopkhata.paySuccess': 'भुगतान पूरा। बैलेंस अपडेट हो रहा है…',
  'txn.purchase': 'खरीद',
  'txn.payment': 'भुगतान',
  'txn.cash': 'नकद भुगतान',
  'txn.credit': 'उधार',
  'txn.upi': 'UPI भुगतान',
  'txn.adjustment': 'दुकान द्वारा समायोजित',

  'coedit.title': 'दुकान ने आपका ऑर्डर कम किया है',
  'coedit.intro': '{shop} पर आपके ऑर्डर का पूरा सामान उपलब्ध नहीं था।',
  'coedit.removed': '{item} — हटाया गया',
  'coedit.reduced': '{item} — {before} → {after}',
  'coedit.nowTotal': 'आपके ऑर्डर का कुल अब {now} है।',
  'coedit.wasSubtotal': 'मूल सामान का कुल {was}',
  'coedit.credit': 'इस दुकान पर आपके खाते में से {amount} कम कर दिए गए हैं।',
  'coedit.prepaid': 'आपने पहले ही भुगतान कर दिया था। {amount} इस दुकान पर आपके जमा (क्रेडिट) के रूप में रखे गए हैं — अगले ऑर्डर में कम हो जाएंगे।',
  'coedit.cash': 'सामान लेते समय {now} दीजिए — {amount} का सामान हटा दिया गया है।',

  'pay.title': 'भुगतान',
  'pay.secure': 'आप दुकान के सुरक्षित पेज पर भुगतान कर रहे हैं।',
  'pay.done': 'हो गया',
  'pay.cancelled': 'भुगतान पूरा नहीं हुआ।',

  'shops.title': 'दुकानें खोजें',
  'shops.heading': 'आपके पास की दुकानें',
  'shops.searchPlaceholder': 'दुकान या शहर खोजें',
  'shops.loading': 'दुकानें लोड हो रही हैं…',
  'shops.none': 'कोई दुकान नहीं मिली। दूसरी खोज आज़माएँ।',
  'shops.useLocation': 'मेरे पास',
  'shops.locating': 'आपको ढूँढ रहे हैं…',
  'shops.nearby': 'आस-पास',
  'shops.locationOff': 'लोकेशन उपलब्ध नहीं। सभी दुकानें दिखा रहे हैं।',
  'shops.itemsCount': '{n} सामान',
  'shops.kmAway': '{km} किमी दूर',
  'shops.noLocation': 'स्थान नहीं दिया',

  'voice.search': 'बोलकर खोजें',
  'voice.listening': 'सुन रहे हैं…',
  'voice.hint.permission': 'माइक बंद है। बोलकर खोजने के लिए सेटिंग्स में चालू करें।',
  'voice.hint.no-match': 'समझ नहीं आया। फिर से बोलें।',
  'voice.hint.network': 'बोलकर खोजने के लिए इंटरनेट चाहिए। कनेक्शन जाँचें।',
  'voice.hint.unavailable': 'बोलकर खोज अभी उपलब्ध नहीं है।',
  'voice.notInLanguage': 'इस भाषा में बोलकर खोज अभी उपलब्ध नहीं है।',

  'shopdetail.loading': 'कैटलॉग लोड हो रहा है…',
  'shopdetail.noItems': 'इस दुकान ने अभी सामान नहीं जोड़ा।',
  'shopdetail.perKg': '/ किलो',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'नग',
  'shopdetail.add': 'जोड़ें',
  'shopdetail.review': 'ऑर्डर देखें',
  'shopdetail.deliveryFee': 'डिलीवरी {amt}',
  'shopdetail.pickup': 'खुद ले जाएँ',
  'shopdetail.delivery': 'डिलीवरी',

  'cart.title': 'आपकी टोकरी',
  'cart.empty': 'आपकी टोकरी खाली है।',
  'cart.browse': 'दुकानें देखें',
  'cart.fulfillment': 'कैसे लेंगे',
  'cart.pickup': 'खुद ले जाएँ',
  'cart.delivery': 'डिलीवरी',
  'cart.payment': 'भुगतान',
  'cart.onKhata': 'खाते पर',
  'cart.payOnline': 'ऑनलाइन भुगतान',
  'cart.payCash': 'नकद',
  'cart.address': 'डिलीवरी पता',
  'cart.addressPlaceholder': 'मकान नं, गली, इलाका, पहचान',
  'cart.note': 'दुकान के लिए नोट',
  'cart.notePlaceholder': 'जैसे पहुँचने पर कॉल करें',
  'cart.deliveryFee': 'डिलीवरी शुल्क',
  'cart.freeDelivery': 'मुफ़्त',
  'cart.belowMin': 'डिलीवरी के लिए न्यूनतम ऑर्डर {amt} है',
  'cart.placeOrder': 'ऑर्डर करें',
  'cart.placing': 'ऑर्डर हो रहा है…',
  'cart.addressRequired': 'कृपया डिलीवरी पता डालें।',
  'cart.creditNote': 'इस दुकान पर आपके खाते में जुड़ेगा।',
  'cart.prepaidNote': 'दुकान के सुरक्षित पेज पर अभी भुगतान करें।',
  'cart.cashNote': 'लेते समय नकद भुगतान करें।',
  'cart.remove': 'हटाएँ',

  'orders.title': 'मेरे ऑर्डर',
  'orders.loading': 'आपके ऑर्डर लोड हो रहे हैं…',
  'orders.none': 'अभी आपका कोई ऑर्डर नहीं।',
  'orders.itemsCount': '{n} सामान',

  'orderdetail.title': 'ऑर्डर',
  'orderdetail.loading': 'ऑर्डर लोड हो रहा है…',
  'orderdetail.deliverTo': 'यहाँ पहुँचाएँ:',
  'orderdetail.note': 'नोट:',
  'orderdetail.payment': 'भुगतान:',
  'orderdetail.cancel': 'ऑर्डर रद्द करें',
  'orderdetail.cancelling': 'रद्द हो रहा है…',
  'orderdetail.cancelConfirm': 'यह ऑर्डर रद्द करें?',
  'orderdetail.deliveryFee': 'डिलीवरी शुल्क',

  'ostatus.pending': 'लंबित',
  'ostatus.accepted': 'स्वीकृत',
  'ostatus.preparing': 'तैयार हो रहा',
  'ostatus.ready': 'तैयार',
  'ostatus.out_for_delivery': 'भेजा गया',
  'ostatus.completed': 'पूरा हुआ',
  'ostatus.cancelled': 'रद्द',
  'pmode.credit': 'खाते पर',
  'pmode.prepaid': 'ऑनलाइन',
  'pmode.cash': 'नकद',
  'pstatus.paid': 'भुगतान हो गया',

  'account.title': 'खाता-सेटिंग',
  'account.profile': 'प्रोफ़ाइल',
  'account.subtitle': 'सभी जानकारी वैकल्पिक। आपका फ़ोन आपका लॉगिन है, यहाँ नहीं बदलेगा।',
  'account.name': 'नाम',
  'account.phone': 'फ़ोन',
  'account.email': 'ईमेल',
  'account.optional': 'वैकल्पिक',
  'account.save': 'सेव करें',
  'account.saving': 'सेव हो रहा है…',
  'account.saved': 'सेव हो गया।',
  'account.loadError': 'प्रोफ़ाइल लोड नहीं हो सकी।',
  'account.language': 'भाषा',
  'account.logout': 'लॉग आउट',
  'account.logoutConfirm': 'स्मार्ट डिजिटल खाता से लॉग आउट करें?',
  'account.dataSaver': 'डेटा सेवर',
  'account.dataSaverSub': 'धीमे नेटवर्क पर अतिरिक्त फ़ोटो न लोड करें',
  'login.betaSuffix': ' (बीटा)',

  // Shop availability (batch A) — authored Hindi, matching the consumer PWA
  // word for word so the app and the web never read differently.
  'open.open': 'खुली',
  'open.closed': 'बंद',
  'open.closedPill': 'बंद',
  'open.todayAt': '{time} बजे',
  'open.tomorrowAt': 'कल {time} बजे',
  'open.stateClosed': 'बंद — दुकान अभी बंद कर रखी है',
  'open.statePaused': '{when} तक रोकी हुई',
  'open.stateHoliday': 'आज बंद — {when} फिर खुलेगी',
  'open.stateHolidayReason': 'आज बंद ({reason}) — {when} फिर खुलेगी',
  'open.stateHours': 'बंद — {when} खुलेगी',
  'open.bannerTitle': 'यह दुकान अभी बंद है',
  'open.browseOnly': 'आप देख सकते हैं — दुकान खुलते ही ऑर्डर फिर चालू हो जाएगा।',
  'open.cannotOrder': 'बंद — ऑर्डर नहीं',
  'open.cartBlocked': 'यह दुकान अभी बंद है, इसलिए ऑर्डर नहीं हो सकता। आपका कार्ट सुरक्षित है।',

  // Ready-time promise (batch B) — authored Hindi, matching the consumer PWA
  // word for word so the app and the web never read differently.
  'eta.readyBy': '{time} बजे तक तैयार',
  'eta.takingLonger': 'थोड़ा और समय लग रहा है',
  'eta.takingLongerHelp': '{time} बजे तक तैयार होना था। बस थोड़ी ही देर और।',
  'eta.noPromise': 'कोई समय नहीं बताया गया',

  // --- BATCH MPARITY: authored Hindi -------------------------------------
  // Written to be read aloud by someone who reads slowly: short sentences,
  // everyday words, no English-in-Devanagari where a common Hindi word exists.
  // Strings the consumer PWA already carries in Hindi are reused word for word.
  'cart.restoring': 'आपका कार्ट लाया जा रहा है…',

  'cart.switchShopTitle': 'दूसरी दुकान का कार्ट',
  'cart.switchShopConfirm': 'दूसरी दुकान पर आपका अधूरा कार्ट है। उसे हटाकर यहाँ नया कार्ट शुरू करें?',
  'cart.switchShopClear': 'हटाकर यहाँ शुरू करें',

  'psearch.title': 'सामान खोजें',
  'psearch.placeholder': 'सभी दुकानों में सामान खोजें',
  'psearch.searching': 'खोज रहे हैं…',
  'psearch.start': 'कोई सामान खोजें और देखें कि आस-पास किन दुकानों में वह मिलता है।',
  'psearch.none': 'कुछ नहीं मिला। दूसरा शब्द आज़माएँ।',
  'psearch.failedTitle': 'खोज पूरी नहीं हो पाई',
  'psearch.atShop': '{shop} पर',

  'cat.attaRice': 'आटा और चावल',
  'cat.dairy': 'दूध-दही',
  'cat.snacks': 'नमकीन',
  'cat.household': 'घर का सामान',
  'cat.personalCare': 'साबुन-शैम्पू',

  'shops.heroTitle': 'आज आपको क्या चाहिए?',
  'shops.searching': 'खोज रहे हैं…',

  'shops.failedTitle': 'दुकानें नहीं आ पाईं',
  'shopdetail.failedTitle': 'यह दुकान नहीं खुल पाई',
  'orders.failedTitle': 'आपके ऑर्डर नहीं आ पाए',

  'ostatus.hint.pending': 'दुकान की स्वीकृति की प्रतीक्षा',
  'ostatus.hint.accepted': 'स्वीकृत — जल्द तैयार होगा',
  'ostatus.hint.preparing': 'तैयार हो रहा है',
  'ostatus.hint.ready_pickup': 'पिकअप के लिए तैयार',
  'ostatus.hint.ready_delivery': 'तैयार — भेजने की प्रतीक्षा',
  'ostatus.hint.out_for_delivery': 'डिलीवरी पर',
  'ostatus.hint.completed': 'पूरा',
  'ostatus.hint.cancelled': 'ऑर्डर रद्द',

  'err.offline': 'अभी इंटरनेट नहीं है। कनेक्शन देखकर फिर कोशिश करें।',
  'err.slow': 'नेटवर्क बहुत धीमा है, काम पूरा नहीं हुआ। फिर कोशिश करें।',
  'err.server': 'हमारी तरफ़ कुछ गड़बड़ हुई। थोड़ी देर में फिर कोशिश करें।',
  'err.notFound': 'यह अब उपलब्ध नहीं है।',
  'err.notAllowed': 'आप इसे नहीं खोल सकते।',
  'err.signedOut': 'आप लॉग आउट हो गए हैं। फिर से साइन इन करें।',
  'err.tooMany': 'बहुत बार कोशिश हुई। एक मिनट रुककर फिर कोशिश करें।',
  'err.badRequest': 'कुछ सही नहीं था। जाँचकर फिर कोशिश करें।',
  'err.conflict': 'यह अभी नहीं हो पाया। फिर कोशिश करें।',
  'err.generic': 'कुछ गड़बड़ हो गई। फिर कोशिश करें।',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'account.gender': 'लिंग',
  'account.genderUnset': 'तय नहीं',
  'account.genderMale': 'पुरुष',
  'account.genderFemale': 'महिला',
  'account.genderOther': 'अन्य',
  'account.genderPreferNot': 'नहीं बताना चाहते',
  'account.dob': 'जन्म तारीख़',
  'account.phoneReadonly': 'फ़ोन आपकी लॉगिन आईडी है और यहाँ बदला नहीं जा सकता।',
  'num.title': 'मोबाइल नंबर',
  'num.current': 'मौजूदा नंबर',
  'num.change': 'नंबर बदलें',
  'num.new': 'नया मोबाइल नंबर',
  'num.newHint': 'नए नंबर पर एक कोड भेजेंगे ताकि पुष्टि हो सके कि वह आपका है। हर दुकान का आपका खाता उसी पर चला जाएगा।',
  'num.sendCode': 'कोड भेजें',
  'num.sending': 'भेजा जा रहा है…',
  'num.enterCode': '{phone} पर भेजा गया कोड डालें',
  'num.confirm': 'बदलाव पक्का करें',
  'num.changing': 'बदला जा रहा है…',
  'num.cancel': 'रद्द करें',
  'num.changed': 'नंबर बदल गया। सभी दुकानों का आपका खाता अब नए नंबर पर है।',
  'num.devCode': 'डेव कोड:',
  'stmt.title': 'खाता विवरण',
  'stmt.subtitle': 'शुरुआती बैलेंस, अवधि की तारीख़वार एंट्रियाँ, और आख़िरी बैलेंस।',
  'stmt.pickShop': 'दुकान चुनें',
  'stmt.allShops': 'सभी दुकानें (संयुक्त)',
  'stmt.from': 'से',
  'stmt.to': 'तक',
  'stmt.view': 'देखें',
  'stmt.opening': 'शुरुआती बैलेंस',
  'stmt.closing': 'आख़िरी बैलेंस',
  'stmt.totalPurchases': 'कुल खरीद',
  'stmt.totalPaid': 'कुल भुगतान',
  'stmt.totalAdjusted': 'दुकान द्वारा समायोजित',
  'stmt.noData': 'इस अवधि में कोई एंट्री नहीं।',
  'stmt.rangeError': '"से" तारीख़ "तक" तारीख़ से पहले या समान होनी चाहिए।',
  'stmt.loadError': 'विवरण लोड नहीं हो सका।',
  'stmt.combined': 'संयुक्त कुल',
  'common.balance': 'बकाया',
  'ref.title': 'बुलाएँ और कमाएँ',
  'ref.subtitle': 'अपना कोड साझा करें। जो इससे जुड़ेगा, वह यहाँ दिखेगा।',
  'ref.yourCode': 'आपका रेफ़रल कोड',
  'ref.shareLink': 'शेयर लिंक',
  'ref.creditBalance': 'आपका रेफ़रल क्रेडिट',
  'ref.referredCount': 'अब तक आपने {n} को रेफ़र किया है।',
  'ref.activatedOf': '{n} में से {a} सक्रिय',
  'ref.noneYet': 'अभी कोई रेफ़रल नहीं — शुरू करने के लिए अपना कोड साझा करें।',
  'ref.referredByLabel': 'आपको आमंत्रित किया',
  'ref.loadError': 'रेफ़रल लोड नहीं हो सके।',
  'ref.type.shop': 'दुकान',
  'ref.type.owner': 'दुकान मालिक',
  'ref.type.customer': 'ग्राहक',
  'chelp.title': 'सहायता और सामान्य प्रश्न',
  'chelp.subtitle': 'खरीदारी, ऑर्डर और आपके खाते के लिए छोटे जवाब।',
  'chelp.e2.q': 'सामान कैसे खोजें?',
  'chelp.e2.a': 'ऊपर दिए सर्च बार का इस्तेमाल करें, या श्रेणियों में देखें। बोलकर खोजने के लिए 🎤 माइक दबाएँ और सामान का नाम बोलें।',
  'chelp.e3.q': 'ऑर्डर कैसे करें?',
  'chelp.e3.a': 'दुकान खोलें, चाहे गए सामान को कार्ट में डालें, पिकअप या डिलीवरी चुनें, और ऑर्डर करें दबाएँ। दुकान को आपका ऑर्डर मिल जाता है और वह पुष्टि कर देती है।',
  'chelp.e4.q': 'पिकअप और डिलीवरी में क्या फ़र्क़ है?',
  'chelp.e4.a': 'पिकअप यानी आप ऑर्डर खुद दुकान से ले आते हैं, मुफ़्त। डिलीवरी यानी दुकान आप तक पहुँचाती है, कभी-कभी थोड़े शुल्क के साथ — कई दुकानें तय रक़म से ऊपर मुफ़्त डिलीवरी देती हैं।',
  'chelp.e5.q': 'ऑर्डर का भुगतान कैसे करें?',
  'chelp.e5.a': 'आप खाते (उधार) पर, ऑनलाइन, या नकद भुगतान कर सकते हैं। खाते पर लेने पर वह रक़म उस दुकान पर आपके चालू बैलेंस में जुड़ जाती है, जिसे बाद में चुका सकते हैं।',
  'chelp.e6.q': 'मेरा खाता (उधार) कैसे काम करता है?',
  'chelp.e6.a': 'आपका खाता हर दुकान पर आपकी बाक़ी रक़म एक जगह दिखाता है। हर खरीद और भुगतान दर्ज होता है, इसलिए आपको हमेशा अपना बैलेंस पता रहता है और आप विवरण देख या डाउनलोड कर सकते हैं।',
  'chelp.e7.q': 'अपना ऑर्डर कैसे ट्रैक करें?',
  'chelp.e7.a': 'ऑर्डर टैब खोलें और हर ऑर्डर को लंबित से स्वीकृत, फिर तैयार या पूरा होते देखें। हर चरण पर आपको अपडेट मिलता है।',
  'shopdetail.searchProducts': 'उत्पाद खोजें',
  'shopdetail.allCategories': 'सभी श्रेणियां',
  'shopdetail.category': 'श्रेणी',
  'shopdetail.brand': 'ब्रांड',
  'shopdetail.size': 'साइज़',
  'shopdetail.noResults': 'कोई मेल खाती वस्तु नहीं।',
};

const bn = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'ডাল ও কড়াই',
  'cat.spices': 'মশলা',
  'cat.cookingOils': 'রান্নার তেল',
  'cat.household': 'গৃহস্থালি',
  'cat.personalCare': 'ব্যক্তিগত যত্ন',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'tab.cart': 'কার্ট',
  'voice.listening': 'শুনছি…',
  'cart.belowMin': 'ডেলিভারির জন্য ন্যূনতম অর্ডার {amt}',
  'account.moreOnWeb': 'আরও',
  'account.dataSaver': 'ডেটা সেভার',
  'cart.switchShopConfirm': 'অন্য একটি দোকানে আপনার একটি অসম্পূর্ণ কার্ট আছে। সেটি মুছে এখানে নতুন কার্ট শুরু করবেন?',
  'ostatus.hint.completed': 'সম্পন্ন',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'লোড হচ্ছে…',
  'common.retry': 'আবার চেষ্টা করুন',
  'common.cancel': 'বাতিল করুন',
  'common.back': 'পিছনে',
  'common.close': 'বন্ধ করুন',
  'common.search': 'খুঁজুন',
  'common.save': 'সেভ করুন',
  'common.total': 'মোট',
  'common.subtotal': 'উপ-মোট',
  'common.items': 'জিনিস',
  'common.status': 'অবস্থা',

  'tab.khata': 'খাতা',
  'tab.shops': 'দোকান',
  'tab.orders': 'অর্ডার',
  'tab.account': 'অ্যাকাউন্ট',

  'login.title': 'সাইন ইন করুন',
  'login.blurb': 'প্রতিটি দোকানে আপনার খাতা দেখুন, বাকি মেটান আর অর্ডার করুন — সব এক জায়গায়।',
  'login.mobile': 'মোবাইল নম্বর',
  'login.otpHint': 'আমরা হোয়াটসঅ্যাপে 6 সংখ্যার কোড পাঠাব।',
  'login.sendCode': 'কোড পাঠান',
  'login.sending': 'পাঠানো হচ্ছে…',
  'login.enterCode': '{phone} এ পাঠানো কোড লিখুন',
  'login.codePlaceholder': '6 সংখ্যার কোড',
  'login.verify': 'যাচাই করে এগিয়ে যান',
  'login.verifying': 'যাচাই হচ্ছে…',
  'login.changeNumber': 'নম্বর বদলান',
  'login.resend': 'কোড আবার পাঠান',
  'login.devCode': 'টেস্ট কোড:',
  'login.failed': 'সাইন ইন করা গেল না। আবার চেষ্টা করুন।',
  'login.heroTitle': 'আপনার দোকানের খাতা, আপনার পকেটে',
  'login.heroSub': 'আপনার ফোন দিয়ে সাইন ইন করুন। আমরা হোয়াটসঅ্যাপে কোড পাঠাই — কোনো পাসওয়ার্ড মনে রাখার দরকার নেই।',
  'login.madeForBharat': 'ভারতের জন্য তৈরি · শহর ও গ্রাম',
  'login.verifyTitle': 'আপনার নম্বর যাচাই করুন',
  'login.enterCodeTitle': '6 সংখ্যার কোড লিখুন',
  'login.resendIn': '{sec}সে পরে আবার পাঠান',
  'login.codeValidity': 'কোডটি 5 মিনিট পর্যন্ত বৈধ।',

  'khata.title': 'আমার খাতা',
  'khata.totalOutstanding': 'মোট বাকি',
  'khata.loading': 'আপনার খাতা লোড হচ্ছে…',
  'khata.none': 'এখনো কোনো দোকানে আপনার খাতা নেই।',
  'khata.balance': 'ব্যালেন্স',
  'khata.owe': 'আপনার দিতে হবে',
  'khata.advance': 'অগ্রিম',
  'khata.settled': 'পুরো মিটেছে',
  'khata.limitSuffix': ' · সীমা {amt}',
  'khata.pay': 'পরিশোধ',
  'khata.opening': 'খুলছে…',

  'shopkhata.title': 'দোকানের খাতা',
  'shopkhata.loading': 'এন্ট্রি লোড হচ্ছে…',
  'shopkhata.entries': 'এন্ট্রি',
  'shopkhata.noEntries': 'এখনো কোনো এন্ট্রি নেই।',
  'shopkhata.payNow': 'এখনই পরিশোধ করুন',
  'shopkhata.payTitle': '{shop} কে পরিশোধ',
  'shopkhata.amountRupees': 'টাকা (₹)',
  'shopkhata.youOwe': 'আপনার {amt} দিতে হবে',
  'shopkhata.payFull': 'পুরো বাকি মেটান',
  'shopkhata.startPay': 'পরিশোধে এগিয়ে যান',
  'shopkhata.starting': 'শুরু হচ্ছে…',
  'shopkhata.enterAmount': 'পরিশোধের টাকা লিখুন।',
  'shopkhata.overpay': 'টাকা আপনার বাকির চেয়ে বেশি।',
  'shopkhata.nothingDue': 'এই দোকানে কিছু বাকি নেই।',
  'shopkhata.paySuccess': 'পরিশোধ সম্পূর্ণ। ব্যালেন্স আপডেট হচ্ছে…',
  'txn.purchase': 'কেনা',
  'txn.payment': 'পরিশোধ',
  'txn.cash': 'নগদ পরিশোধ',
  'txn.credit': 'ধার',

  'pay.title': 'পরিশোধ',
  'pay.secure': 'আপনি দোকানের নিরাপদ পেজে পরিশোধ করছেন।',
  'pay.done': 'হয়ে গেছে',
  'pay.cancelled': 'পরিশোধ সম্পূর্ণ হয়নি।',

  'shops.title': 'দোকান খুঁজুন',
  'shops.heading': 'আপনার কাছের দোকান',
  'shops.searchPlaceholder': 'দোকান বা শহর খুঁজুন',
  'shops.loading': 'দোকান লোড হচ্ছে…',
  'shops.none': 'কোনো দোকান পাওয়া যায়নি। অন্য খোঁজ করুন।',
  'shops.useLocation': 'আমার কাছে',
  'shops.locating': 'আপনাকে খুঁজছি…',
  'shops.nearby': 'কাছাকাছি',
  'shops.locationOff': 'লোকেশন পাওয়া যাচ্ছে না। সব দোকান দেখানো হচ্ছে।',
  'shops.itemsCount': '{n} জিনিস',
  'shops.kmAway': '{km} কিমি দূরে',
  'shops.noLocation': 'লোকেশন নেই',

  'shopdetail.loading': 'তালিকা লোড হচ্ছে…',
  'shopdetail.noItems': 'এই দোকান এখনো জিনিস যোগ করেনি।',
  'shopdetail.perKg': '/ কেজি',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'টি',
  'shopdetail.add': 'যোগ করুন',
  'shopdetail.review': 'অর্ডার দেখুন',
  'shopdetail.deliveryFee': 'ডেলিভারি {amt}',
  'shopdetail.pickup': 'নিজে নিয়ে যান',
  'shopdetail.delivery': 'ডেলিভারি',

  'cart.title': 'আপনার ঝুড়ি',
  'cart.empty': 'আপনার ঝুড়ি খালি।',
  'cart.browse': 'দোকান দেখুন',
  'cart.fulfillment': 'কীভাবে নেবেন',
  'cart.pickup': 'নিজে নিয়ে যান',
  'cart.delivery': 'ডেলিভারি',
  'cart.payment': 'পরিশোধ',
  'cart.onKhata': 'খাতায়',
  'cart.payOnline': 'অনলাইনে পরিশোধ',
  'cart.payCash': 'নগদ',
  'cart.address': 'ডেলিভারি ঠিকানা',
  'cart.addressPlaceholder': 'বাড়ি নং, রাস্তা, এলাকা, চিহ্ন',
  'cart.note': 'দোকানের জন্য নোট',
  'cart.notePlaceholder': 'যেমন পৌঁছে কল করুন',
  'cart.deliveryFee': 'ডেলিভারি চার্জ',
  'cart.freeDelivery': 'ফ্রি',
  'cart.placeOrder': 'অর্ডার করুন',
  'cart.placing': 'অর্ডার হচ্ছে…',
  'cart.addressRequired': 'দয়া করে ডেলিভারি ঠিকানা লিখুন।',
  'cart.creditNote': 'এই দোকানে আপনার খাতায় যোগ হবে।',
  'cart.prepaidNote': 'দোকানের নিরাপদ পেজে এখনই পরিশোধ করুন।',
  'cart.cashNote': 'নেওয়ার সময় বা ডেলিভারিতে নগদ দিন।',
  'cart.remove': 'সরান',

  'orders.title': 'আমার অর্ডার',
  'orders.loading': 'আপনার অর্ডার লোড হচ্ছে…',
  'orders.none': 'এখনো আপনার কোনো অর্ডার নেই।',
  'orders.itemsCount': '{n} জিনিস',

  'orderdetail.title': 'অর্ডার',
  'orderdetail.loading': 'অর্ডার লোড হচ্ছে…',
  'orderdetail.deliverTo': 'এখানে পৌঁছে দিন:',
  'orderdetail.note': 'নোট:',
  'orderdetail.payment': 'পরিশোধ:',
  'orderdetail.cancel': 'অর্ডার বাতিল করুন',
  'orderdetail.cancelling': 'বাতিল হচ্ছে…',
  'orderdetail.cancelConfirm': 'এই অর্ডার বাতিল করবেন?',
  'orderdetail.deliveryFee': 'ডেলিভারি চার্জ',

  'ostatus.pending': 'অপেক্ষমাণ',
  'ostatus.accepted': 'গৃহীত',
  'ostatus.preparing': 'তৈরি হচ্ছে',
  'ostatus.ready': 'তৈরি',
  'ostatus.out_for_delivery': 'ডেলিভারিতে রওনা',
  'ostatus.completed': 'সম্পূর্ণ',
  'ostatus.cancelled': 'বাতিল',
  'pmode.credit': 'খাতায়',
  'pmode.prepaid': 'অনলাইন',
  'pmode.cash': 'নগদ',
  'pstatus.paid': 'পরিশোধ হয়েছে',

  'account.title': 'খাতা সেটিং',
  'account.profile': 'প্রোফাইল',
  'account.subtitle': 'সব তথ্য ঐচ্ছিক। আপনার ফোনই আপনার লগইন, এখানে বদলাবে না।',
  'account.name': 'নাম',
  'account.phone': 'ফোন',
  'account.email': 'ইমেল',
  'account.optional': 'ঐচ্ছিক',
  'account.save': 'সেভ করুন',
  'account.saving': 'সেভ হচ্ছে…',
  'account.saved': 'সেভ হয়েছে।',
  'account.loadError': 'আপনার প্রোফাইল লোড করা গেল না।',
  'account.language': 'ভাষা',
  'account.logout': 'লগ আউট',
  'account.logoutConfirm': 'Smart Digital Khata থেকে লগ আউট করবেন?',
  'login.betaSuffix': ' (বিটা)',
};

const ta = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'பருப்பு வகைகள்',
  'cat.spices': 'மசாலா',
  'cat.cookingOils': 'சமையல் எண்ணெய்',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'voice.listening': 'கேட்கிறது…',
  'cart.belowMin': 'டெலிவரிக்கான குறைந்தபட்ச ஆர்டர் {amt}',
  'account.moreOnWeb': 'மேலும்',
  'account.dataSaver': 'டேட்டா சேவர்',
  'cart.switchShopConfirm': 'வேறு கடையில் உங்கள் முடிக்காத கூடை உள்ளது. அதை நீக்கி இங்கே கூடை தொடங்கவா?',
  'psearch.placeholder': 'எல்லா கடைகளிலும் பொருட்களைத் தேடு',
  'psearch.searching': 'தேடுகிறது…',
  'psearch.start': 'அருகில் எந்தக் கடைகளில் கிடைக்கும் என்பதைக் காண ஒரு பொருளைத் தேடுங்கள்.',
  'psearch.none': 'பொருட்கள் எதுவும் கிடைக்கவில்லை. வேறு சொல்லை முயற்சிக்கவும்.',
  'psearch.atShop': '{shop} இல்',
  'cat.attaRice': 'மாவு & அரிசி',
  'cat.dairy': 'பால் பொருட்கள்',
  'cat.snacks': 'தின்பண்டங்கள்',
  'cat.household': 'வீட்டு உபயோகம்',
  'cat.personalCare': 'தனிநபர் பராமரிப்பு',
  'shops.searching': 'தேடுகிறது…',
  // Transcribed verbatim from the already-authored web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — the same
  // human-written strings the consumer PWA already ships, so the two
  // surfaces read identically.
  'tab.cart': 'கார்ட்',
  'ostatus.hint.pending': 'கடையின் ஏற்பை எதிர்பார்க்கிறது',
  'ostatus.hint.accepted': 'ஏற்கப்பட்டது — விரைவில் தயாராகும்',
  'ostatus.hint.preparing': 'தயாராகிறது',
  'ostatus.hint.ready_pickup': 'பிக்அப்பிற்குத் தயார்',
  'ostatus.hint.ready_delivery': 'தயார் — அனுப்ப காத்திருக்கிறது',
  'ostatus.hint.out_for_delivery': 'டெலிவரிக்கு சென்றது',
  'ostatus.hint.completed': 'முடிந்தது',
  'ostatus.hint.cancelled': 'ஆர்டர் ரத்து',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'ஏற்றுகிறது…',
  'common.retry': 'மீண்டும் முயற்சி',
  'common.cancel': 'ரத்து செய்',
  'common.back': 'பின்',
  'common.close': 'மூடு',
  'common.search': 'தேடு',
  'common.save': 'சேமி',
  'common.total': 'மொத்தம்',
  'common.subtotal': 'உபத் தொகை',
  'common.items': 'பொருட்கள்',
  'common.status': 'நிலை',

  'tab.khata': 'கணக்கு',
  'tab.shops': 'கடைகள்',
  'tab.products': 'பொருட்கள்',
  'tab.orders': 'ஆர்டர்கள்',
  'tab.account': 'சுயவிவரம்',

  'login.title': 'உள்நுழை',
  'login.blurb': 'ஒவ்வொரு கடையிலும் உங்கள் கணக்கைப் பாருங்கள், பாக்கியைச் செலுத்துங்கள், ஆர்டர் செய்யுங்கள் — எல்லாம் ஒரே இடத்தில்.',
  'login.mobile': 'மொபைல் எண்',
  'login.otpHint': 'வாட்ஸ்அப்பில் 6 இலக்க குறியீட்டை அனுப்புவோம்.',
  'login.sendCode': 'குறியீடு அனுப்பு',
  'login.sending': 'அனுப்புகிறது…',
  'login.enterCode': '{phone} க்கு அனுப்பிய குறியீட்டை உள்ளிடுங்கள்',
  'login.codePlaceholder': '6 இலக்க குறியீடு',
  'login.verify': 'சரிபார்த்து தொடரவும்',
  'login.verifying': 'சரிபார்க்கிறது…',
  'login.changeNumber': 'எண்ணை மாற்று',
  'login.resend': 'குறியீட்டை மீண்டும் அனுப்பு',
  'login.devCode': 'சோதனை குறியீடு:',
  'login.failed': 'உள்நுழைய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'login.heroTitle': 'உங்கள் கடை கணக்கு, உங்கள் பாக்கெட்டில்',
  'login.heroSub': 'உங்கள் ஃபோனில் உள்நுழையுங்கள். வாட்ஸ்அப்பில் குறியீட்டை அனுப்புவோம் — கடவுச்சொல் நினைவில் வைக்க வேண்டாம்.',
  'login.madeForBharat': 'பாரதத்திற்காக உருவாக்கப்பட்டது · நகரங்கள் & கிராமங்கள்',
  'login.verifyTitle': 'உங்கள் எண்ணைச் சரிபார்க்கவும்',
  'login.enterCodeTitle': '6 இலக்க குறியீட்டை உள்ளிடுங்கள்',
  'login.resendIn': '{sec}வி இல் மீண்டும் அனுப்பு',
  'login.codeValidity': 'குறியீடு 5 நிமிடங்களுக்கு செல்லுபடியாகும்.',

  'khata.title': 'என் கணக்கு',
  'khata.totalOutstanding': 'மொத்த பாக்கி',
  'khata.loading': 'உங்கள் கணக்கு ஏற்றுகிறது…',
  'khata.none': 'இதுவரை எந்தக் கடையிலும் உங்கள் கணக்கு இல்லை.',
  'khata.balance': 'இருப்பு',
  'khata.owe': 'நீங்கள் தர வேண்டியது',
  'khata.advance': 'முன்பணம்',
  'khata.settled': 'முழுவதும் தீர்ந்தது',
  'khata.limitSuffix': ' · வரம்பு {amt}',
  'khata.pay': 'செலுத்து',
  'khata.opening': 'திறக்கிறது…',

  'shopkhata.title': 'கடை கணக்கு',
  'shopkhata.loading': 'பதிவுகள் ஏற்றுகிறது…',
  'shopkhata.entries': 'பதிவுகள்',
  'shopkhata.noEntries': 'இதுவரை பதிவுகள் இல்லை.',
  'shopkhata.payNow': 'இப்போது செலுத்து',
  'shopkhata.payTitle': '{shop} க்கு செலுத்து',
  'shopkhata.amountRupees': 'தொகை (₹)',
  'shopkhata.youOwe': 'நீங்கள் {amt} தர வேண்டும்',
  'shopkhata.payFull': 'முழு பாக்கியையும் செலுத்து',
  'shopkhata.startPay': 'செலுத்த தொடரவும்',
  'shopkhata.starting': 'தொடங்குகிறது…',
  'shopkhata.enterAmount': 'செலுத்த வேண்டிய தொகையை உள்ளிடுங்கள்.',
  'shopkhata.overpay': 'தொகை உங்கள் பாக்கியை விட அதிகம்.',
  'shopkhata.nothingDue': 'இந்தக் கடையில் பாக்கி இல்லை.',
  'shopkhata.paySuccess': 'செலுத்துதல் முடிந்தது. இருப்பு புதுப்பிக்கிறது…',
  'txn.purchase': 'வாங்கியது',
  'txn.payment': 'செலுத்தியது',
  'txn.cash': 'பணம் செலுத்தியது',
  'txn.credit': 'கடன்',

  'pay.title': 'செலுத்துதல்',
  'pay.secure': 'கடையின் பாதுகாப்பான பக்கத்தில் நீங்கள் செலுத்துகிறீர்கள்.',
  'pay.done': 'முடிந்தது',
  'pay.cancelled': 'செலுத்துதல் முடியவில்லை.',

  'shops.title': 'கடைகளைத் தேடு',
  'shops.heading': 'உங்கள் அருகிலுள்ள கடைகள்',
  'shops.searchPlaceholder': 'கடை அல்லது ஊரைத் தேடு',
  'shops.loading': 'கடைகள் ஏற்றுகிறது…',
  'shops.none': 'கடை எதுவும் இல்லை. வேறு தேடலை முயற்சிக்கவும்.',
  'shops.useLocation': 'என் அருகில்',
  'shops.locating': 'உங்களைக் கண்டுபிடிக்கிறது…',
  'shops.nearby': 'அருகில்',
  'shops.locationOff': 'இருப்பிடம் கிடைக்கவில்லை. எல்லா கடைகளையும் காட்டுகிறது.',
  'shops.itemsCount': '{n} பொருட்கள்',
  'shops.kmAway': '{km} கிமீ தொலைவில்',
  'shops.noLocation': 'இருப்பிடம் இல்லை',

  'shopdetail.loading': 'பட்டியல் ஏற்றுகிறது…',
  'shopdetail.noItems': 'இந்தக் கடை இன்னும் பொருட்களைச் சேர்க்கவில்லை.',
  'shopdetail.perKg': '/ கிலோ',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'ஒன்று',
  'shopdetail.add': 'சேர்',
  'shopdetail.review': 'ஆர்டரைப் பார்',
  'shopdetail.deliveryFee': 'டெலிவரி {amt}',
  'shopdetail.pickup': 'நீங்களே எடுத்துச் செல்',
  'shopdetail.delivery': 'டெலிவரி',

  'cart.title': 'உங்கள் கூடை',
  'cart.empty': 'உங்கள் கூடை காலியாக உள்ளது.',
  'cart.browse': 'கடைகளைப் பார்',
  'cart.fulfillment': 'எப்படிப் பெறுவது',
  'cart.pickup': 'நீங்களே எடுத்துச் செல்',
  'cart.delivery': 'டெலிவரி',
  'cart.payment': 'செலுத்துதல்',
  'cart.onKhata': 'கணக்கில்',
  'cart.payOnline': 'ஆன்லைனில் செலுத்து',
  'cart.payCash': 'பணம்',
  'cart.address': 'டெலிவரி முகவரி',
  'cart.addressPlaceholder': 'வீட்டு எண், தெரு, பகுதி, அடையாளம்',
  'cart.note': 'கடைக்கு குறிப்பு',
  'cart.notePlaceholder': 'எ.கா. வந்ததும் அழையுங்கள்',
  'cart.deliveryFee': 'டெலிவரி கட்டணம்',
  'cart.freeDelivery': 'இலவசம்',
  'cart.placeOrder': 'ஆர்டர் செய்',
  'cart.placing': 'ஆர்டர் செய்கிறது…',
  'cart.addressRequired': 'தயவுசெய்து டெலிவரி முகவரியை உள்ளிடுங்கள்.',
  'cart.creditNote': 'இந்தக் கடையில் உங்கள் கணக்கில் சேர்க்கப்படும்.',
  'cart.prepaidNote': 'கடையின் பாதுகாப்பான பக்கத்தில் இப்போது செலுத்துங்கள்.',
  'cart.cashNote': 'எடுக்கும்போது அல்லது டெலிவரியில் பணம் செலுத்துங்கள்.',
  'cart.remove': 'நீக்கு',

  'orders.title': 'என் ஆர்டர்கள்',
  'orders.loading': 'உங்கள் ஆர்டர்கள் ஏற்றுகிறது…',
  'orders.none': 'இதுவரை உங்களுக்கு ஆர்டர் இல்லை.',
  'orders.itemsCount': '{n} பொருட்கள்',

  'orderdetail.title': 'ஆர்டர்',
  'orderdetail.loading': 'ஆர்டர் ஏற்றுகிறது…',
  'orderdetail.deliverTo': 'இங்கு சேர்க்க:',
  'orderdetail.note': 'குறிப்பு:',
  'orderdetail.payment': 'செலுத்துதல்:',
  'orderdetail.cancel': 'ஆர்டரை ரத்து செய்',
  'orderdetail.cancelling': 'ரத்து செய்கிறது…',
  'orderdetail.cancelConfirm': 'இந்த ஆர்டரை ரத்து செய்யவா?',
  'orderdetail.deliveryFee': 'டெலிவரி கட்டணம்',

  'ostatus.pending': 'நிலுவையில்',
  'ostatus.accepted': 'ஏற்கப்பட்டது',
  'ostatus.preparing': 'தயாராகிறது',
  'ostatus.ready': 'தயார்',
  'ostatus.out_for_delivery': 'டெலிவரிக்கு புறப்பட்டது',
  'ostatus.completed': 'முடிந்தது',
  'ostatus.cancelled': 'ரத்து செய்யப்பட்டது',
  'pmode.credit': 'கணக்கில்',
  'pmode.prepaid': 'ஆன்லைன்',
  'pmode.cash': 'பணம்',
  'pstatus.paid': 'செலுத்தப்பட்டது',

  'account.title': 'கணக்கு அமைப்பு',
  'account.profile': 'சுயவிவரம்',
  'account.subtitle': 'எல்லா விவரமும் விருப்பம். உங்கள் ஃபோன்தான் லாகின், இங்கே மாற்ற முடியாது.',
  'account.name': 'பெயர்',
  'account.phone': 'ஃபோன்',
  'account.email': 'மின்னஞ்சல்',
  'account.optional': 'விருப்பம்',
  'account.save': 'சேமி',
  'account.saving': 'சேமிக்கிறது…',
  'account.saved': 'சேமிக்கப்பட்டது.',
  'account.loadError': 'உங்கள் சுயவிவரத்தை ஏற்ற முடியவில்லை.',
  'account.language': 'மொழி',
  'account.logout': 'வெளியேறு',
  'account.logoutConfirm': 'Smart Digital Khata-விலிருந்து வெளியேறவா?',
  'login.betaSuffix': ' (பீட்டா)',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'num.title': 'மொபைல் எண்',
  'num.current': 'தற்போதைய எண்',
  'num.change': 'எண்ணை மாற்று',
  'num.new': 'புதிய மொபைல் எண்',
  'num.newHint': 'புதிய எண் உங்களுடையதா என உறுதிப்படுத்த ஒரு குறியீட்டை அனுப்புவோம். எல்லா கடைகளிலும் உங்கள் கணக்கு அதற்கு மாறும்.',
  'num.sendCode': 'குறியீட்டை அனுப்பு',
  'num.sending': 'அனுப்புகிறது…',
  'num.enterCode': '{phone} க்கு அனுப்பிய குறியீட்டை உள்ளிடவும்',
  'num.confirm': 'மாற்றத்தை உறுதிசெய்',
  'num.changing': 'மாற்றுகிறது…',
  'num.cancel': 'ரத்து',
  'num.changed': 'எண் மாற்றப்பட்டது. எல்லா கடைகளிலும் உங்கள் கணக்கு இப்போது புதிய எண்ணில் உள்ளது.',
  'num.devCode': 'டெவ் குறியீடு:',
  'common.balance': 'நிலுவை',
  'ref.title': 'அழைத்து சம்பாதிக்கவும்',
  'ref.subtitle': 'உங்கள் குறியீட்டைப் பகிரவும். அதன் மூலம் இணைபவர் இங்கே தோன்றுவார்.',
  'ref.yourCode': 'உங்கள் பரிந்துரை குறியீடு',
  'ref.shareLink': 'பகிர்வு இணைப்பு',
  'ref.referredCount': 'இதுவரை {n} பேரைப் பரிந்துரைத்துள்ளீர்கள்.',
  'ref.noneYet': 'இன்னும் பரிந்துரைகள் இல்லை — தொடங்க உங்கள் குறியீட்டைப் பகிரவும்.',
  'ref.referredByLabel': 'உங்களை அழைத்தவர்',
  'ref.loadError': 'பரிந்துரைகளை ஏற்ற முடியவில்லை.',
  'ref.type.shop': 'கடை',
  'ref.type.owner': 'கடை உரிமையாளர்',
  'ref.type.customer': 'வாடிக்கையாளர்',
  'chelp.title': 'உதவி மற்றும் கேள்வி-பதில்',
  'chelp.subtitle': 'ஷாப்பிங், ஆர்டர்கள், உங்கள் கணக்கு பற்றிய சிறு பதில்கள்.',
  'chelp.e2.q': 'பொருளை எப்படி தேடுவது?',
  'chelp.e2.a': 'மேலே உள்ள தேடல் பட்டியைப் பயன்படுத்துங்கள், அல்லது வகைகளில் பாருங்கள். குரலில் தேட, 🎤 மைக்கை அழுத்தி பொருளின் பெயரைச் சொல்லுங்கள்.',
  'chelp.e3.q': 'ஆர்டர் எப்படி செய்வது?',
  'chelp.e3.a': 'ஒரு கடையைத் திறந்து, வேண்டிய பொருட்களை கார்ட்டில் சேர்த்து, பிக்அப் அல்லது டெலிவரி தேர்ந்து, ஆர்டர் செய் என்பதை அழுத்துங்கள். கடைக்கு உங்கள் ஆர்டர் சென்று அது உறுதிசெய்யப்படும்.',
  'chelp.e4.q': 'பிக்அப்புக்கும் டெலிவரிக்கும் என்ன வித்தியாசம்?',
  'chelp.e4.a': 'பிக்அப் என்றால் ஆர்டரை நீங்களே கடையிலிருந்து இலவசமாக வாங்கிக்கொள்வது. டெலிவரி என்றால் கடை அதை உங்களிடம் கொண்டுவரும், சில நேரம் சிறு கட்டணத்துடன் — பல கடைகள் ஒரு குறிப்பிட்ட தொகைக்கு மேல் இலவச டெலிவரி தரும்.',
  'chelp.e5.q': 'ஆர்டருக்கு எப்படி பணம் கட்டுவது?',
  'chelp.e5.a': 'கணக்கில் (உதாரி), ஆன்லைனில், அல்லது ரொக்கமாகக் கட்டலாம். கணக்கில் வாங்கினால், அந்தத் தொகை அந்தக் கடையில் உங்கள் நடப்பு பாக்கியில் சேர்க்கப்படும், பிறகு தீர்க்கலாம்.',
  'chelp.e6.q': 'என் கணக்கு (உதாரி) எப்படி வேலை செய்யும்?',
  'chelp.e6.a': 'ஒவ்வொரு கடையிலும் நீங்கள் கட்ட வேண்டிய தொகையை உங்கள் கணக்கு ஒரே இடத்தில் காட்டும். ஒவ்வொரு வாங்குதலும் கட்டணமும் பட்டியலிடப்படும், அதனால் உங்கள் பாக்கி எப்போதும் தெரியும், அறிக்கையைப் பார்க்கலாம் அல்லது பதிவிறக்கலாம்.',
  'chelp.e7.q': 'என் ஆர்டரை எப்படி கண்காணிப்பது?',
  'chelp.e7.a': 'ஆர்டர்கள் தாவலைத் திறந்து, ஒவ்வொரு ஆர்டரும் நிலுவையிலிருந்து ஏற்கப்பட்டு, பிறகு தயார் அல்லது முடிந்தது என நகர்வதைப் பாருங்கள். ஒவ்வொரு படியிலும் உங்களுக்கு அறிவிப்பு வரும்.',
  'shopdetail.searchProducts': 'பொருட்களைத் தேடு',
  'shopdetail.allCategories': 'அனைத்து வகைகள்',
  'shopdetail.category': 'வகை',
  'shopdetail.brand': 'பிராண்ட்',
  'shopdetail.size': 'அளவு',
  'shopdetail.noResults': 'பொருந்தும் பொருட்கள் இல்லை.',
};

const te = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'పప్పు ధాన్యాలు',
  'cat.spices': 'మసాలాలు',
  'cat.cookingOils': 'వంట నూనె',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'voice.listening': 'వింటోంది…',
  'cart.belowMin': 'డెలివరీకి కనీస ఆర్డర్ {amt}',
  'account.moreOnWeb': 'మరిన్ని',
  'account.dataSaver': 'డేటా సేవర్',
  'cart.switchShopConfirm': 'వేరే దుకాణంలో మీ అసంపూర్ణ కార్ట్ ఉంది. దాన్ని తీసివేసి ఇక్కడ కార్ట్ ప్రారంభించాలా?',
  'psearch.placeholder': 'అన్ని దుకాణాల్లో ఉత్పత్తులను వెతకండి',
  'psearch.searching': 'వెతుకుతోంది…',
  'psearch.start': 'సమీపంలో ఏ దుకాణాల్లో దొరుకుతుందో చూడటానికి ఒక ఉత్పత్తిని వెతకండి.',
  'psearch.none': 'ఉత్పత్తులు ఏవీ కనబడలేదు. మరో పదాన్ని ప్రయత్నించండి.',
  'psearch.atShop': '{shop} వద్ద',
  'cat.attaRice': 'పిండి & బియ్యం',
  'cat.dairy': 'పాల ఉత్పత్తులు',
  'cat.snacks': 'స్నాక్స్',
  'cat.household': 'గృహోపకరణాలు',
  'cat.personalCare': 'వ్యక్తిగత సంరక్షణ',
  'shops.searching': 'వెతుకుతోంది…',
  // Transcribed verbatim from the already-authored web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — the same
  // human-written strings the consumer PWA already ships, so the two
  // surfaces read identically.
  'tab.cart': 'కార్ట్',
  'ostatus.hint.pending': 'దుకాణం ఆమోదం కోసం వేచి ఉంది',
  'ostatus.hint.accepted': 'ఆమోదించబడింది — త్వరలో సిద్ధమవుతుంది',
  'ostatus.hint.preparing': 'సిద్ధమవుతోంది',
  'ostatus.hint.ready_pickup': 'పికప్‌కు సిద్ధం',
  'ostatus.hint.ready_delivery': 'సిద్ధం — పంపడానికి వేచి ఉంది',
  'ostatus.hint.out_for_delivery': 'డెలివరీకి వెళ్లింది',
  'ostatus.hint.completed': 'పూర్తయింది',
  'ostatus.hint.cancelled': 'ఆర్డర్ రద్దు',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'లోడ్ అవుతోంది…',
  'common.retry': 'మళ్లీ ప్రయత్నించు',
  'common.cancel': 'రద్దు చేయి',
  'common.back': 'వెనుకకు',
  'common.close': 'మూసివేయి',
  'common.search': 'వెతుకు',
  'common.save': 'సేవ్ చేయి',
  'common.total': 'మొత్తం',
  'common.subtotal': 'ఉప మొత్తం',
  'common.items': 'వస్తువులు',
  'common.status': 'స్థితి',

  'tab.khata': 'ఖాతా',
  'tab.shops': 'దుకాణాలు',
  'tab.products': 'ఉత్పత్తులు',
  'tab.orders': 'ఆర్డర్లు',
  'tab.account': 'ప్రొఫైల్',

  'login.title': 'సైన్ ఇన్ చేయి',
  'login.blurb': 'ప్రతి దుకాణంలో మీ ఖాతా చూడండి, బాకీ చెల్లించండి, ఆర్డర్ చేయండి — అన్నీ ఒకే చోట.',
  'login.mobile': 'మొబైల్ నంబర్',
  'login.otpHint': 'వాట్సాప్‌లో 6 అంకెల కోడ్ పంపుతాము.',
  'login.sendCode': 'కోడ్ పంపు',
  'login.sending': 'పంపుతోంది…',
  'login.enterCode': '{phone} కు పంపిన కోడ్‌ను నమోదు చేయండి',
  'login.codePlaceholder': '6 అంకెల కోడ్',
  'login.verify': 'ధృవీకరించి కొనసాగు',
  'login.verifying': 'ధృవీకరిస్తోంది…',
  'login.changeNumber': 'నంబర్ మార్చు',
  'login.resend': 'కోడ్ మళ్లీ పంపు',
  'login.devCode': 'టెస్ట్ కోడ్:',
  'login.failed': 'సైన్ ఇన్ కాలేదు. మళ్లీ ప్రయత్నించండి.',
  'login.heroTitle': 'మీ దుకాణం ఖాతా, మీ జేబులో',
  'login.heroSub': 'మీ ఫోన్‌తో సైన్ ఇన్ చేయండి. వాట్సాప్‌లో కోడ్ పంపుతాము — పాస్‌వర్డ్ గుర్తుంచుకోవాల్సిన అవసరం లేదు.',
  'login.madeForBharat': 'భారత్ కోసం రూపొందించబడింది · పట్టణాలు & గ్రామాలు',
  'login.verifyTitle': 'మీ నంబర్‌ను ధృవీకరించండి',
  'login.enterCodeTitle': '6 అంకెల కోడ్ నమోదు చేయండి',
  'login.resendIn': '{sec}సె లో మళ్లీ పంపు',
  'login.codeValidity': 'కోడ్ 5 నిమిషాలు చెల్లుబాటవుతుంది.',

  'khata.title': 'నా ఖాతా',
  'khata.totalOutstanding': 'మొత్తం బాకీ',
  'khata.loading': 'మీ ఖాతా లోడ్ అవుతోంది…',
  'khata.none': 'ఇప్పటివరకు ఏ దుకాణంలోనూ మీ ఖాతా లేదు.',
  'khata.balance': 'నిల్వ',
  'khata.owe': 'మీరు ఇవ్వాల్సింది',
  'khata.advance': 'ముందస్తు',
  'khata.settled': 'పూర్తిగా తీరింది',
  'khata.limitSuffix': ' · పరిమితి {amt}',
  'khata.pay': 'చెల్లించు',
  'khata.opening': 'తెరుస్తోంది…',

  'shopkhata.title': 'దుకాణం ఖాతా',
  'shopkhata.loading': 'ఎంట్రీలు లోడ్ అవుతున్నాయి…',
  'shopkhata.entries': 'ఎంట్రీలు',
  'shopkhata.noEntries': 'ఇప్పటివరకు ఎంట్రీలు లేవు.',
  'shopkhata.payNow': 'ఇప్పుడే చెల్లించు',
  'shopkhata.payTitle': '{shop} కు చెల్లించు',
  'shopkhata.amountRupees': 'మొత్తం (₹)',
  'shopkhata.youOwe': 'మీరు {amt} ఇవ్వాలి',
  'shopkhata.payFull': 'పూర్తి బాకీ చెల్లించు',
  'shopkhata.startPay': 'చెల్లింపుకు కొనసాగు',
  'shopkhata.starting': 'ప్రారంభమవుతోంది…',
  'shopkhata.enterAmount': 'చెల్లించే మొత్తాన్ని నమోదు చేయండి.',
  'shopkhata.overpay': 'మొత్తం మీ బాకీ కంటే ఎక్కువ.',
  'shopkhata.nothingDue': 'ఈ దుకాణంలో బాకీ లేదు.',
  'shopkhata.paySuccess': 'చెల్లింపు పూర్తయింది. నిల్వ నవీకరిస్తోంది…',
  'txn.purchase': 'కొనుగోలు',
  'txn.payment': 'చెల్లింపు',
  'txn.cash': 'నగదు చెల్లింపు',
  'txn.credit': 'అప్పు',

  'pay.title': 'చెల్లింపు',
  'pay.secure': 'మీరు దుకాణం సురక్షిత పేజీలో చెల్లిస్తున్నారు.',
  'pay.done': 'అయింది',
  'pay.cancelled': 'చెల్లింపు పూర్తి కాలేదు.',

  'shops.title': 'దుకాణాలను కనుగొను',
  'shops.heading': 'మీ దగ్గరి దుకాణాలు',
  'shops.searchPlaceholder': 'దుకాణం లేదా ఊరు వెతుకు',
  'shops.loading': 'దుకాణాలు లోడ్ అవుతున్నాయి…',
  'shops.none': 'దుకాణాలు దొరకలేదు. వేరే విధంగా వెతకండి.',
  'shops.useLocation': 'నా దగ్గర',
  'shops.locating': 'మిమ్మల్ని కనుగొంటోంది…',
  'shops.nearby': 'దగ్గరలో',
  'shops.locationOff': 'లొకేషన్ అందుబాటులో లేదు. అన్ని దుకాణాలు చూపిస్తోంది.',
  'shops.itemsCount': '{n} వస్తువులు',
  'shops.kmAway': '{km} కిమీ దూరం',
  'shops.noLocation': 'లొకేషన్ లేదు',

  'shopdetail.loading': 'జాబితా లోడ్ అవుతోంది…',
  'shopdetail.noItems': 'ఈ దుకాణం ఇంకా వస్తువులు జోడించలేదు.',
  'shopdetail.perKg': '/ కిలో',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'ఒకటి',
  'shopdetail.add': 'జోడించు',
  'shopdetail.review': 'ఆర్డర్ చూడు',
  'shopdetail.deliveryFee': 'డెలివరీ {amt}',
  'shopdetail.pickup': 'మీరే తీసుకెళ్లండి',
  'shopdetail.delivery': 'డెలివరీ',

  'cart.title': 'మీ బుట్ట',
  'cart.empty': 'మీ బుట్ట ఖాళీగా ఉంది.',
  'cart.browse': 'దుకాణాలు చూడు',
  'cart.fulfillment': 'ఎలా పొందాలి',
  'cart.pickup': 'మీరే తీసుకెళ్లండి',
  'cart.delivery': 'డెలివరీ',
  'cart.payment': 'చెల్లింపు',
  'cart.onKhata': 'ఖాతాలో',
  'cart.payOnline': 'ఆన్‌లైన్ చెల్లింపు',
  'cart.payCash': 'నగదు',
  'cart.address': 'డెలివరీ చిరునామా',
  'cart.addressPlaceholder': 'ఇంటి నం, వీధి, ప్రాంతం, గుర్తు',
  'cart.note': 'దుకాణానికి నోట్',
  'cart.notePlaceholder': 'ఉదా. వచ్చాక కాల్ చేయండి',
  'cart.deliveryFee': 'డెలివరీ రుసుము',
  'cart.freeDelivery': 'ఉచితం',
  'cart.placeOrder': 'ఆర్డర్ చేయి',
  'cart.placing': 'ఆర్డర్ చేస్తోంది…',
  'cart.addressRequired': 'దయచేసి డెలివరీ చిరునామా నమోదు చేయండి.',
  'cart.creditNote': 'ఈ దుకాణంలో మీ ఖాతాలో చేరుతుంది.',
  'cart.prepaidNote': 'దుకాణం సురక్షిత పేజీలో ఇప్పుడే చెల్లించండి.',
  'cart.cashNote': 'తీసుకునేటప్పుడు లేదా డెలివరీలో నగదు చెల్లించండి.',
  'cart.remove': 'తీసివేయి',

  'orders.title': 'నా ఆర్డర్లు',
  'orders.loading': 'మీ ఆర్డర్లు లోడ్ అవుతున్నాయి…',
  'orders.none': 'ఇప్పటివరకు మీకు ఆర్డర్లు లేవు.',
  'orders.itemsCount': '{n} వస్తువులు',

  'orderdetail.title': 'ఆర్డర్',
  'orderdetail.loading': 'ఆర్డర్ లోడ్ అవుతోంది…',
  'orderdetail.deliverTo': 'ఇక్కడికి పంపు:',
  'orderdetail.note': 'నోట్:',
  'orderdetail.payment': 'చెల్లింపు:',
  'orderdetail.cancel': 'ఆర్డర్ రద్దు చేయి',
  'orderdetail.cancelling': 'రద్దు చేస్తోంది…',
  'orderdetail.cancelConfirm': 'ఈ ఆర్డర్ రద్దు చేయాలా?',
  'orderdetail.deliveryFee': 'డెలివరీ రుసుము',

  'ostatus.pending': 'పెండింగ్',
  'ostatus.accepted': 'ఆమోదించబడింది',
  'ostatus.preparing': 'సిద్ధమవుతోంది',
  'ostatus.ready': 'సిద్ధం',
  'ostatus.out_for_delivery': 'డెలివరీకి బయలుదేరింది',
  'ostatus.completed': 'పూర్తయింది',
  'ostatus.cancelled': 'రద్దయింది',
  'pmode.credit': 'ఖాతాలో',
  'pmode.prepaid': 'ఆన్‌లైన్',
  'pmode.cash': 'నగదు',
  'pstatus.paid': 'చెల్లించబడింది',

  'account.title': 'ఖాతా సెట్టింగ్',
  'account.profile': 'ప్రొఫైల్',
  'account.subtitle': 'అన్ని వివరాలు ఐచ్ఛికం. మీ ఫోన్ మీ లాగిన్, ఇక్కడ మారదు.',
  'account.name': 'పేరు',
  'account.phone': 'ఫోన్',
  'account.email': 'ఇమెయిల్',
  'account.optional': 'ఐచ్ఛికం',
  'account.save': 'సేవ్ చేయి',
  'account.saving': 'సేవ్ అవుతోంది…',
  'account.saved': 'సేవ్ అయింది.',
  'account.loadError': 'మీ ప్రొఫైల్ లోడ్ కాలేదు.',
  'account.language': 'భాష',
  'account.logout': 'లాగ్ అవుట్',
  'account.logoutConfirm': 'Smart Digital Khata నుండి లాగ్ అవుట్ చేయాలా?',
  'login.betaSuffix': ' (బీటా)',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'num.title': 'మొబైల్ నంబర్',
  'num.current': 'ప్రస్తుత నంబర్',
  'num.change': 'నంబర్ మార్చు',
  'num.new': 'కొత్త మొబైల్ నంబర్',
  'num.newHint': 'కొత్త నంబర్ మీదేనా అని నిర్ధారించడానికి ఒక కోడ్ పంపుతాం. అన్ని షాపుల్లో మీ ఖాతా దానికి మారుతుంది.',
  'num.sendCode': 'కోడ్ పంపు',
  'num.sending': 'పంపుతోంది…',
  'num.enterCode': '{phone} కి పంపిన కోడ్‌ను నమోదు చేయండి',
  'num.confirm': 'మార్పును నిర్ధారించు',
  'num.changing': 'మారుస్తోంది…',
  'num.cancel': 'రద్దు',
  'num.changed': 'నంబర్ మారింది. అన్ని షాపుల్లో మీ ఖాతా ఇప్పుడు కొత్త నంబర్‌లో ఉంది.',
  'num.devCode': 'డెవ్ కోడ్:',
  'common.balance': 'బకాయి',
  'ref.title': 'ఆహ్వానించి సంపాదించండి',
  'ref.subtitle': 'మీ కోడ్‌ను షేర్ చేయండి. దానితో చేరినవారు ఇక్కడ కనిపిస్తారు.',
  'ref.yourCode': 'మీ రిఫరల్ కోడ్',
  'ref.shareLink': 'షేర్ లింక్',
  'ref.referredCount': 'ఇప్పటివరకు మీరు {n} మందిని రిఫర్ చేశారు.',
  'ref.noneYet': 'ఇంకా రిఫరల్స్ లేవు — ప్రారంభించడానికి మీ కోడ్‌ను షేర్ చేయండి.',
  'ref.referredByLabel': 'మిమ్మల్ని ఆహ్వానించారు',
  'ref.loadError': 'రిఫరల్స్ లోడ్ చేయలేకపోయాం.',
  'ref.type.shop': 'దుకాణం',
  'ref.type.owner': 'దుకాణ యజమాని',
  'ref.type.customer': 'వినియోగదారు',
  'chelp.title': 'సహాయం మరియు తరచుగా అడిగే ప్రశ్నలు',
  'chelp.subtitle': 'షాపింగ్, ఆర్డర్లు, మీ ఖాతా గురించి చిన్న సమాధానాలు.',
  'chelp.e2.q': 'వస్తువును ఎలా వెతకాలి?',
  'chelp.e2.a': 'పైన ఉన్న సెర్చ్ బార్ ఉపయోగించండి, లేదా కేటగిరీలలో చూడండి. మాట్లాడి వెతకడానికి 🎤 మైక్ నొక్కి వస్తువు పేరు చెప్పండి.',
  'chelp.e3.q': 'ఆర్డర్ ఎలా పెట్టాలి?',
  'chelp.e3.a': 'ఒక దుకాణాన్ని తెరిచి, కావలసిన వస్తువులను కార్ట్‌లో చేర్చి, పికప్ లేదా డెలివరీ ఎంచుకుని, ఆర్డర్ పెట్టు నొక్కండి. దుకాణానికి మీ ఆర్డర్ చేరి అది నిర్ధారిస్తుంది.',
  'chelp.e4.q': 'పికప్‌కు, డెలివరీకి తేడా ఏమిటి?',
  'chelp.e4.a': 'పికప్ అంటే ఆర్డర్‌ను మీరే దుకాణం నుండి ఉచితంగా తెచ్చుకోవడం. డెలివరీ అంటే దుకాణం దాన్ని మీ దగ్గరకు తెస్తుంది, కొన్నిసార్లు చిన్న ఫీజుతో — చాలా దుకాణాలు నిర్ణీత మొత్తానికి పైన ఉచిత డెలివరీ ఇస్తాయి.',
  'chelp.e5.q': 'ఆర్డర్‌కు ఎలా చెల్లించాలి?',
  'chelp.e5.a': 'ఖాతా (ఉధార్)లో, ఆన్‌లైన్‌లో, లేదా నగదుగా చెల్లించవచ్చు. ఖాతాలో తీసుకుంటే, ఆ మొత్తం ఆ దుకాణంలో మీ నడుస్తున్న బ్యాలెన్స్‌కు చేరుతుంది, తర్వాత తీర్చవచ్చు.',
  'chelp.e6.q': 'నా ఖాతా (ఉధార్) ఎలా పనిచేస్తుంది?',
  'chelp.e6.a': 'ప్రతి దుకాణంలో మీరు చెల్లించాల్సిన మొత్తాన్ని మీ ఖాతా ఒకేచోట చూపుతుంది. ప్రతి కొనుగోలు, చెల్లింపు నమోదవుతుంది, కాబట్టి మీ బ్యాలెన్స్ ఎప్పుడూ తెలుస్తుంది, స్టేట్‌మెంట్ చూడవచ్చు లేదా డౌన్‌లోడ్ చేయవచ్చు.',
  'chelp.e7.q': 'నా ఆర్డర్‌ను ఎలా ట్రాక్ చేయాలి?',
  'chelp.e7.a': 'ఆర్డర్లు ట్యాబ్ తెరిచి, ప్రతి ఆర్డర్ పెండింగ్ నుండి ఆమోదం, ఆపై సిద్ధం లేదా పూర్తయింది వరకు కదలడం చూడండి. ప్రతి దశలో మీకు అప్‌డేట్ వస్తుంది.',
  'shopdetail.searchProducts': 'ఉత్పత్తులను వెతకండి',
  'shopdetail.allCategories': 'అన్ని వర్గాలు',
  'shopdetail.category': 'వర్గం',
  'shopdetail.brand': 'బ్రాండ్',
  'shopdetail.size': 'సైజు',
  'shopdetail.noResults': 'సరిపోలే వస్తువులు లేవు.',
};

const kn = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'ಬೇಳೆಕಾಳುಗಳು',
  'cat.spices': 'ಮಸಾಲೆ',
  'cat.cookingOils': 'ಅಡುಗೆ ಎಣ್ಣೆ',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'voice.listening': 'ಕೇಳುತ್ತಿದೆ…',
  'cart.belowMin': 'ಡೆಲಿವರಿಗೆ ಕನಿಷ್ಠ ಆರ್ಡರ್ {amt}',
  'account.moreOnWeb': 'ಇನ್ನಷ್ಟು',
  'account.dataSaver': 'ಡೇಟಾ ಸೇವರ್',
  'cart.switchShopConfirm': 'ಬೇರೆ ಅಂಗಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಅಪೂರ್ಣ ಕಾರ್ಟ್ ಇದೆ. ಅದನ್ನು ತೆಗೆದು ಇಲ್ಲಿ ಕಾರ್ಟ್ ಆರಂಭಿಸಬೇಕೇ?',
  'psearch.placeholder': 'ಎಲ್ಲಾ ಅಂಗಡಿಗಳಲ್ಲಿ ಉತ್ಪನ್ನಗಳನ್ನು ಹುಡುಕಿ',
  'psearch.searching': 'ಹುಡುಕುತ್ತಿದೆ…',
  'psearch.start': 'ಹತ್ತಿರದ ಯಾವ ಅಂಗಡಿಗಳಲ್ಲಿ ಸಿಗುತ್ತದೆ ಎಂದು ನೋಡಲು ಒಂದು ಉತ್ಪನ್ನವನ್ನು ಹುಡುಕಿ.',
  'psearch.none': 'ಯಾವುದೇ ಉತ್ಪನ್ನ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಪದವನ್ನು ಪ್ರಯತ್ನಿಸಿ.',
  'psearch.atShop': '{shop} ನಲ್ಲಿ',
  'cat.attaRice': 'ಹಿಟ್ಟು & ಅಕ್ಕಿ',
  'cat.dairy': 'ಹೈನು ಉತ್ಪನ್ನಗಳು',
  'cat.snacks': 'ತಿಂಡಿಗಳು',
  'cat.household': 'ಮನೆಬಳಕೆ',
  'cat.personalCare': 'ವೈಯಕ್ತಿಕ ಆರೈಕೆ',
  'shops.searching': 'ಹುಡುಕುತ್ತಿದೆ…',
  // Transcribed verbatim from the already-authored web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — the same
  // human-written strings the consumer PWA already ships, so the two
  // surfaces read identically.
  'tab.cart': 'ಕಾರ್ಟ್',
  'ostatus.hint.pending': 'ಅಂಗಡಿಯ ಸ್ವೀಕಾರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ',
  'ostatus.hint.accepted': 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ — ಶೀಘ್ರದಲ್ಲೇ ಸಿದ್ಧವಾಗುತ್ತದೆ',
  'ostatus.hint.preparing': 'ಸಿದ್ಧವಾಗುತ್ತಿದೆ',
  'ostatus.hint.ready_pickup': 'ಪಿಕಪ್‌ಗೆ ಸಿದ್ಧ',
  'ostatus.hint.ready_delivery': 'ಸಿದ್ಧ — ಕಳುಹಿಸಲು ಕಾಯುತ್ತಿದೆ',
  'ostatus.hint.out_for_delivery': 'ಡೆಲಿವರಿಗೆ ಹೊರಟಿದೆ',
  'ostatus.hint.completed': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'ostatus.hint.cancelled': 'ಆರ್ಡರ್ ರದ್ದಾಗಿದೆ',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'common.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  'common.cancel': 'ರದ್ದುಮಾಡಿ',
  'common.back': 'ಹಿಂದೆ',
  'common.close': 'ಮುಚ್ಚಿ',
  'common.search': 'ಹುಡುಕಿ',
  'common.save': 'ಉಳಿಸಿ',
  'common.total': 'ಒಟ್ಟು',
  'common.subtotal': 'ಉಪ ಮೊತ್ತ',
  'common.items': 'ವಸ್ತುಗಳು',
  'common.status': 'ಸ್ಥಿತಿ',

  'tab.khata': 'ಖಾತೆ',
  'tab.shops': 'ಅಂಗಡಿಗಳು',
  'tab.products': 'ಉತ್ಪನ್ನಗಳು',
  'tab.orders': 'ಆರ್ಡರ್‌ಗಳು',
  'tab.account': 'ಪ್ರೊಫೈಲ್',

  'login.title': 'ಸೈನ್ ಇನ್ ಮಾಡಿ',
  'login.blurb': 'ಪ್ರತಿ ಅಂಗಡಿಯ ನಿಮ್ಮ ಖಾತೆ ನೋಡಿ, ಬಾಕಿ ಪಾವತಿಸಿ, ಆರ್ಡರ್ ಮಾಡಿ — ಎಲ್ಲವೂ ಒಂದೇ ಕಡೆ.',
  'login.mobile': 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ',
  'login.otpHint': 'ವಾಟ್ಸ್‌ಆ್ಯಪ್‌ನಲ್ಲಿ 6 ಅಂಕಿಯ ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ.',
  'login.sendCode': 'ಕೋಡ್ ಕಳುಹಿಸಿ',
  'login.sending': 'ಕಳುಹಿಸುತ್ತಿದೆ…',
  'login.enterCode': '{phone} ಗೆ ಕಳುಹಿಸಿದ ಕೋಡ್ ನಮೂದಿಸಿ',
  'login.codePlaceholder': '6 ಅಂಕಿಯ ಕೋಡ್',
  'login.verify': 'ಪರಿಶೀಲಿಸಿ ಮುಂದುವರಿಯಿರಿ',
  'login.verifying': 'ಪರಿಶೀಲಿಸುತ್ತಿದೆ…',
  'login.changeNumber': 'ಸಂಖ್ಯೆ ಬದಲಿಸಿ',
  'login.resend': 'ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ',
  'login.devCode': 'ಟೆಸ್ಟ್ ಕೋಡ್:',
  'login.failed': 'ಸೈನ್ ಇನ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  'login.heroTitle': 'ನಿಮ್ಮ ಅಂಗಡಿ ಖಾತೆ, ನಿಮ್ಮ ಜೇಬಿನಲ್ಲಿ',
  'login.heroSub': 'ನಿಮ್ಮ ಫೋನ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಿ. ವಾಟ್ಸ್‌ಆ್ಯಪ್‌ನಲ್ಲಿ ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ — ಪಾಸ್‌ವರ್ಡ್ ನೆನಪಿಡುವ ಅಗತ್ಯವಿಲ್ಲ.',
  'login.madeForBharat': 'ಭಾರತಕ್ಕಾಗಿ ರೂಪಿಸಲಾಗಿದೆ · ಪಟ್ಟಣಗಳು & ಹಳ್ಳಿಗಳು',
  'login.verifyTitle': 'ನಿಮ್ಮ ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿ',
  'login.enterCodeTitle': '6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ',
  'login.resendIn': '{sec}ಸೆ ನಲ್ಲಿ ಮತ್ತೆ ಕಳುಹಿಸಿ',
  'login.codeValidity': 'ಕೋಡ್ 5 ನಿಮಿಷ ಮಾನ್ಯವಾಗಿದೆ.',

  'khata.title': 'ನನ್ನ ಖಾತೆ',
  'khata.totalOutstanding': 'ಒಟ್ಟು ಬಾಕಿ',
  'khata.loading': 'ನಿಮ್ಮ ಖಾತೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'khata.none': 'ಇನ್ನೂ ಯಾವ ಅಂಗಡಿಯಲ್ಲೂ ನಿಮ್ಮ ಖಾತೆ ಇಲ್ಲ.',
  'khata.balance': 'ಬ್ಯಾಲೆನ್ಸ್',
  'khata.owe': 'ನೀವು ಕೊಡಬೇಕಾದದ್ದು',
  'khata.advance': 'ಮುಂಗಡ',
  'khata.settled': 'ಪೂರ್ತಿ ತೀರಿದೆ',
  'khata.limitSuffix': ' · ಮಿತಿ {amt}',
  'khata.pay': 'ಪಾವತಿಸಿ',
  'khata.opening': 'ತೆರೆಯುತ್ತಿದೆ…',

  'shopkhata.title': 'ಅಂಗಡಿ ಖಾತೆ',
  'shopkhata.loading': 'ನಮೂದುಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…',
  'shopkhata.entries': 'ನಮೂದುಗಳು',
  'shopkhata.noEntries': 'ಇನ್ನೂ ನಮೂದುಗಳಿಲ್ಲ.',
  'shopkhata.payNow': 'ಈಗ ಪಾವತಿಸಿ',
  'shopkhata.payTitle': '{shop} ಗೆ ಪಾವತಿಸಿ',
  'shopkhata.amountRupees': 'ಮೊತ್ತ (₹)',
  'shopkhata.youOwe': 'ನೀವು {amt} ಕೊಡಬೇಕು',
  'shopkhata.payFull': 'ಪೂರ್ತಿ ಬಾಕಿ ಪಾವತಿಸಿ',
  'shopkhata.startPay': 'ಪಾವತಿಗೆ ಮುಂದುವರಿಯಿರಿ',
  'shopkhata.starting': 'ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ…',
  'shopkhata.enterAmount': 'ಪಾವತಿಸುವ ಮೊತ್ತ ನಮೂದಿಸಿ.',
  'shopkhata.overpay': 'ಮೊತ್ತ ನಿಮ್ಮ ಬಾಕಿಗಿಂತ ಹೆಚ್ಚು.',
  'shopkhata.nothingDue': 'ಈ ಅಂಗಡಿಯಲ್ಲಿ ಬಾಕಿ ಇಲ್ಲ.',
  'shopkhata.paySuccess': 'ಪಾವತಿ ಪೂರ್ಣಗೊಂಡಿದೆ. ಬ್ಯಾಲೆನ್ಸ್ ನವೀಕರಿಸುತ್ತಿದೆ…',
  'txn.purchase': 'ಖರೀದಿ',
  'txn.payment': 'ಪಾವತಿ',
  'txn.cash': 'ನಗದು ಪಾವತಿ',
  'txn.credit': 'ಸಾಲ',

  'pay.title': 'ಪಾವತಿ',
  'pay.secure': 'ನೀವು ಅಂಗಡಿಯ ಸುರಕ್ಷಿತ ಪುಟದಲ್ಲಿ ಪಾವತಿಸುತ್ತಿದ್ದೀರಿ.',
  'pay.done': 'ಆಯಿತು',
  'pay.cancelled': 'ಪಾವತಿ ಪೂರ್ಣಗೊಂಡಿಲ್ಲ.',

  'shops.title': 'ಅಂಗಡಿಗಳನ್ನು ಹುಡುಕಿ',
  'shops.heading': 'ನಿಮ್ಮ ಹತ್ತಿರದ ಅಂಗಡಿಗಳು',
  'shops.searchPlaceholder': 'ಅಂಗಡಿ ಅಥವಾ ಊರು ಹುಡುಕಿ',
  'shops.loading': 'ಅಂಗಡಿಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…',
  'shops.none': 'ಅಂಗಡಿಗಳು ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಹುಡುಕಾಟ ಪ್ರಯತ್ನಿಸಿ.',
  'shops.useLocation': 'ನನ್ನ ಹತ್ತಿರ',
  'shops.locating': 'ನಿಮ್ಮನ್ನು ಹುಡುಕುತ್ತಿದೆ…',
  'shops.nearby': 'ಹತ್ತಿರದಲ್ಲಿ',
  'shops.locationOff': 'ಸ್ಥಳ ಲಭ್ಯವಿಲ್ಲ. ಎಲ್ಲಾ ಅಂಗಡಿಗಳನ್ನು ತೋರಿಸುತ್ತಿದೆ.',
  'shops.itemsCount': '{n} ವಸ್ತುಗಳು',
  'shops.kmAway': '{km} ಕಿಮೀ ದೂರ',
  'shops.noLocation': 'ಸ್ಥಳ ಇಲ್ಲ',

  'shopdetail.loading': 'ಪಟ್ಟಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'shopdetail.noItems': 'ಈ ಅಂಗಡಿ ಇನ್ನೂ ವಸ್ತುಗಳನ್ನು ಸೇರಿಸಿಲ್ಲ.',
  'shopdetail.perKg': '/ ಕಿಲೋ',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'ಒಂದು',
  'shopdetail.add': 'ಸೇರಿಸಿ',
  'shopdetail.review': 'ಆರ್ಡರ್ ನೋಡಿ',
  'shopdetail.deliveryFee': 'ಡೆಲಿವರಿ {amt}',
  'shopdetail.pickup': 'ನೀವೇ ತೆಗೆದುಕೊಳ್ಳಿ',
  'shopdetail.delivery': 'ಡೆಲಿವರಿ',

  'cart.title': 'ನಿಮ್ಮ ಬುಟ್ಟಿ',
  'cart.empty': 'ನಿಮ್ಮ ಬುಟ್ಟಿ ಖಾಲಿಯಾಗಿದೆ.',
  'cart.browse': 'ಅಂಗಡಿಗಳನ್ನು ನೋಡಿ',
  'cart.fulfillment': 'ಹೇಗೆ ಪಡೆಯಬೇಕು',
  'cart.pickup': 'ನೀವೇ ತೆಗೆದುಕೊಳ್ಳಿ',
  'cart.delivery': 'ಡೆಲಿವರಿ',
  'cart.payment': 'ಪಾವತಿ',
  'cart.onKhata': 'ಖಾತೆಯಲ್ಲಿ',
  'cart.payOnline': 'ಆನ್‌ಲೈನ್ ಪಾವತಿ',
  'cart.payCash': 'ನಗದು',
  'cart.address': 'ಡೆಲಿವರಿ ವಿಳಾಸ',
  'cart.addressPlaceholder': 'ಮನೆ ನಂ, ಬೀದಿ, ಪ್ರದೇಶ, ಗುರುತು',
  'cart.note': 'ಅಂಗಡಿಗೆ ಟಿಪ್ಪಣಿ',
  'cart.notePlaceholder': 'ಉದಾ. ಬಂದಾಗ ಕರೆ ಮಾಡಿ',
  'cart.deliveryFee': 'ಡೆಲಿವರಿ ಶುಲ್ಕ',
  'cart.freeDelivery': 'ಉಚಿತ',
  'cart.placeOrder': 'ಆರ್ಡರ್ ಮಾಡಿ',
  'cart.placing': 'ಆರ್ಡರ್ ಆಗುತ್ತಿದೆ…',
  'cart.addressRequired': 'ದಯವಿಟ್ಟು ಡೆಲಿವರಿ ವಿಳಾಸ ನಮೂದಿಸಿ.',
  'cart.creditNote': 'ಈ ಅಂಗಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಖಾತೆಗೆ ಸೇರುತ್ತದೆ.',
  'cart.prepaidNote': 'ಅಂಗಡಿಯ ಸುರಕ್ಷಿತ ಪುಟದಲ್ಲಿ ಈಗ ಪಾವತಿಸಿ.',
  'cart.cashNote': 'ತೆಗೆದುಕೊಳ್ಳುವಾಗ ಅಥವಾ ಡೆಲಿವರಿಯಲ್ಲಿ ನಗದು ಪಾವತಿಸಿ.',
  'cart.remove': 'ತೆಗೆದುಹಾಕಿ',

  'orders.title': 'ನನ್ನ ಆರ್ಡರ್‌ಗಳು',
  'orders.loading': 'ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…',
  'orders.none': 'ಇನ್ನೂ ನಿಮಗೆ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ.',
  'orders.itemsCount': '{n} ವಸ್ತುಗಳು',

  'orderdetail.title': 'ಆರ್ಡರ್',
  'orderdetail.loading': 'ಆರ್ಡರ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'orderdetail.deliverTo': 'ಇಲ್ಲಿಗೆ ತಲುಪಿಸಿ:',
  'orderdetail.note': 'ಟಿಪ್ಪಣಿ:',
  'orderdetail.payment': 'ಪಾವತಿ:',
  'orderdetail.cancel': 'ಆರ್ಡರ್ ರದ್ದುಮಾಡಿ',
  'orderdetail.cancelling': 'ರದ್ದುಮಾಡುತ್ತಿದೆ…',
  'orderdetail.cancelConfirm': 'ಈ ಆರ್ಡರ್ ರದ್ದುಮಾಡಬೇಕೆ?',
  'orderdetail.deliveryFee': 'ಡೆಲಿವರಿ ಶುಲ್ಕ',

  'ostatus.pending': 'ಬಾಕಿ ಇದೆ',
  'ostatus.accepted': 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ',
  'ostatus.preparing': 'ಸಿದ್ಧವಾಗುತ್ತಿದೆ',
  'ostatus.ready': 'ಸಿದ್ಧ',
  'ostatus.out_for_delivery': 'ಡೆಲಿವರಿಗೆ ಹೊರಟಿದೆ',
  'ostatus.completed': 'ಪೂರ್ಣಗೊಂಡಿದೆ',
  'ostatus.cancelled': 'ರದ್ದಾಗಿದೆ',
  'pmode.credit': 'ಖಾತೆಯಲ್ಲಿ',
  'pmode.prepaid': 'ಆನ್‌ಲೈನ್',
  'pmode.cash': 'ನಗದು',
  'pstatus.paid': 'ಪಾವತಿಸಲಾಗಿದೆ',

  'account.title': 'ಖಾತೆ ಸೆಟ್ಟಿಂಗ್',
  'account.profile': 'ಪ್ರೊಫೈಲ್',
  'account.subtitle': 'ಎಲ್ಲಾ ವಿವರ ಐಚ್ಛಿಕ. ನಿಮ್ಮ ಫೋನ್ ನಿಮ್ಮ ಲಾಗಿನ್, ಇಲ್ಲಿ ಬದಲಾಗದು.',
  'account.name': 'ಹೆಸರು',
  'account.phone': 'ಫೋನ್',
  'account.email': 'ಇಮೇಲ್',
  'account.optional': 'ಐಚ್ಛಿಕ',
  'account.save': 'ಉಳಿಸಿ',
  'account.saving': 'ಉಳಿಸುತ್ತಿದೆ…',
  'account.saved': 'ಉಳಿಸಲಾಗಿದೆ.',
  'account.loadError': 'ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ.',
  'account.language': 'ಭಾಷೆ',
  'account.logout': 'ಲಾಗ್ ಔಟ್',
  'account.logoutConfirm': 'Smart Digital Khata ನಿಂದ ಲಾಗ್ ಔಟ್ ಮಾಡಬೇಕೆ?',
  'login.betaSuffix': ' (ಬೀಟಾ)',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'num.title': 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ',
  'num.current': 'ಪ್ರಸ್ತುತ ಸಂಖ್ಯೆ',
  'num.change': 'ಸಂಖ್ಯೆ ಬದಲಿಸಿ',
  'num.new': 'ಹೊಸ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ',
  'num.newHint': 'ಹೊಸ ಸಂಖ್ಯೆ ನಿಮ್ಮದೇ ಎಂದು ಖಚಿತಪಡಿಸಲು ಒಂದು ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ. ಎಲ್ಲಾ ಅಂಗಡಿಗಳಲ್ಲಿ ನಿಮ್ಮ ಖಾತೆ ಅದಕ್ಕೆ ವರ್ಗಾವಣೆಯಾಗುತ್ತದೆ.',
  'num.sendCode': 'ಕೋಡ್ ಕಳುಹಿಸಿ',
  'num.sending': 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…',
  'num.enterCode': '{phone} ಗೆ ಕಳುಹಿಸಿದ ಕೋಡ್ ನಮೂದಿಸಿ',
  'num.confirm': 'ಬದಲಾವಣೆ ಖಚಿತಪಡಿಸಿ',
  'num.changing': 'ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ…',
  'num.cancel': 'ರದ್ದುಮಾಡಿ',
  'num.changed': 'ಸಂಖ್ಯೆ ಬದಲಾಗಿದೆ. ಎಲ್ಲಾ ಅಂಗಡಿಗಳಲ್ಲಿ ನಿಮ್ಮ ಖಾತೆ ಈಗ ಹೊಸ ಸಂಖ್ಯೆಯಲ್ಲಿದೆ.',
  'num.devCode': 'ಡೆವ್ ಕೋಡ್:',
  'common.balance': 'ಬಾಕಿ',
  'ref.title': 'ಆಹ್ವಾನಿಸಿ ಗಳಿಸಿ',
  'ref.subtitle': 'ನಿಮ್ಮ ಕೋಡ್ ಹಂಚಿಕೊಳ್ಳಿ. ಅದರ ಮೂಲಕ ಸೇರುವವರು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತಾರೆ.',
  'ref.yourCode': 'ನಿಮ್ಮ ರೆಫರಲ್ ಕೋಡ್',
  'ref.shareLink': 'ಹಂಚಿಕೆ ಲಿಂಕ್',
  'ref.referredCount': 'ಇಲ್ಲಿಯವರೆಗೆ ನೀವು {n} ಜನರನ್ನು ರೆಫರ್ ಮಾಡಿದ್ದೀರಿ.',
  'ref.noneYet': 'ಇನ್ನೂ ರೆಫರಲ್‌ಗಳಿಲ್ಲ — ಪ್ರಾರಂಭಿಸಲು ನಿಮ್ಮ ಕೋಡ್ ಹಂಚಿಕೊಳ್ಳಿ.',
  'ref.referredByLabel': 'ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸಿದವರು',
  'ref.loadError': 'ರೆಫರಲ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.',
  'ref.type.shop': 'ಅಂಗಡಿ',
  'ref.type.owner': 'ಅಂಗಡಿ ಮಾಲೀಕ',
  'ref.type.customer': 'ಗ್ರಾಹಕ',
  'chelp.title': 'ಸಹಾಯ ಮತ್ತು ಪದೇಪದೇ ಕೇಳುವ ಪ್ರಶ್ನೆಗಳು',
  'chelp.subtitle': 'ಶಾಪಿಂಗ್, ಆರ್ಡರ್‌ಗಳು ಮತ್ತು ನಿಮ್ಮ ಖಾತೆಗೆ ಸಣ್ಣ ಉತ್ತರಗಳು.',
  'chelp.e2.q': 'ವಸ್ತುವನ್ನು ಹೇಗೆ ಹುಡುಕುವುದು?',
  'chelp.e2.a': 'ಮೇಲಿನ ಸರ್ಚ್ ಬಾರ್ ಬಳಸಿ, ಅಥವಾ ವರ್ಗಗಳಲ್ಲಿ ನೋಡಿ. ಧ್ವನಿಯಿಂದ ಹುಡುಕಲು 🎤 ಮೈಕ್ ಒತ್ತಿ ವಸ್ತುವಿನ ಹೆಸರು ಹೇಳಿ.',
  'chelp.e3.q': 'ಆರ್ಡರ್ ಹೇಗೆ ಮಾಡುವುದು?',
  'chelp.e3.a': 'ಒಂದು ಅಂಗಡಿಯನ್ನು ತೆರೆದು, ಬೇಕಾದ ವಸ್ತುಗಳನ್ನು ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ, ಪಿಕಪ್ ಅಥವಾ ಡೆಲಿವರಿ ಆಯ್ಕೆಮಾಡಿ, ಆರ್ಡರ್ ಮಾಡಿ ಒತ್ತಿ. ಅಂಗಡಿಗೆ ನಿಮ್ಮ ಆರ್ಡರ್ ತಲುಪಿ ಅದು ದೃಢೀಕರಿಸುತ್ತದೆ.',
  'chelp.e4.q': 'ಪಿಕಪ್ ಮತ್ತು ಡೆಲಿವರಿ ನಡುವಿನ ವ್ಯತ್ಯಾಸವೇನು?',
  'chelp.e4.a': 'ಪಿಕಪ್ ಎಂದರೆ ಆರ್ಡರ್‌ಅನ್ನು ನೀವೇ ಅಂಗಡಿಯಿಂದ ಉಚಿತವಾಗಿ ತೆಗೆದುಕೊಳ್ಳುವುದು. ಡೆಲಿವರಿ ಎಂದರೆ ಅಂಗಡಿ ಅದನ್ನು ನಿಮ್ಮ ಬಳಿಗೆ ತರುತ್ತದೆ, ಕೆಲವೊಮ್ಮೆ ಸಣ್ಣ ಶುಲ್ಕದೊಂದಿಗೆ — ಹಲವು ಅಂಗಡಿಗಳು ನಿಗದಿತ ಮೊತ್ತದ ಮೇಲೆ ಉಚಿತ ಡೆಲಿವರಿ ಕೊಡುತ್ತವೆ.',
  'chelp.e5.q': 'ಆರ್ಡರ್‌ಗೆ ಹೇಗೆ ಪಾವತಿಸುವುದು?',
  'chelp.e5.a': 'ಖಾತೆ (ಉಧಾರ್)ನಲ್ಲಿ, ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ, ಅಥವಾ ನಗದಾಗಿ ಪಾವತಿಸಬಹುದು. ಖಾತೆಯಲ್ಲಿ ತೆಗೆದುಕೊಂಡರೆ, ಆ ಮೊತ್ತ ಆ ಅಂಗಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಚಾಲ್ತಿ ಬಾಕಿಗೆ ಸೇರುತ್ತದೆ, ನಂತರ ತೀರಿಸಬಹುದು.',
  'chelp.e6.q': 'ನನ್ನ ಖಾತೆ (ಉಧಾರ್) ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ?',
  'chelp.e6.a': 'ಪ್ರತಿ ಅಂಗಡಿಯಲ್ಲಿ ನೀವು ಕೊಡಬೇಕಾದ ಮೊತ್ತವನ್ನು ನಿಮ್ಮ ಖಾತೆ ಒಂದೇ ಕಡೆ ತೋರಿಸುತ್ತದೆ. ಪ್ರತಿ ಖರೀದಿ ಮತ್ತು ಪಾವತಿ ದಾಖಲಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ನಿಮ್ಮ ಬಾಕಿ ಯಾವಾಗಲೂ ತಿಳಿಯುತ್ತದೆ, ವಿವರಣೆಯನ್ನು ನೋಡಬಹುದು ಅಥವಾ ಡೌನ್‌ಲೋಡ್ ಮಾಡಬಹುದು.',
  'chelp.e7.q': 'ನನ್ನ ಆರ್ಡರ್‌ಅನ್ನು ಹೇಗೆ ಟ್ರ್ಯಾಕ್ ಮಾಡುವುದು?',
  'chelp.e7.a': 'ಆರ್ಡರ್‌ಗಳು ಟ್ಯಾಬ್ ತೆರೆದು, ಪ್ರತಿ ಆರ್ಡರ್ ಬಾಕಿಯಿಂದ ಅನುಮೋದಿತ, ನಂತರ ಸಿದ್ಧ ಅಥವಾ ಪೂರ್ಣಗೊಂಡ ವರೆಗೆ ಸಾಗುವುದನ್ನು ನೋಡಿ. ಪ್ರತಿ ಹಂತದಲ್ಲೂ ನಿಮಗೆ ಅಪ್‌ಡೇಟ್ ಸಿಗುತ್ತದೆ.',
  'shopdetail.searchProducts': 'ಉತ್ಪನ್ನಗಳನ್ನು ಹುಡುಕಿ',
  'shopdetail.allCategories': 'ಎಲ್ಲಾ ವರ್ಗಗಳು',
  'shopdetail.category': 'ವರ್ಗ',
  'shopdetail.brand': 'ಬ್ರ್ಯಾಂಡ್',
  'shopdetail.size': 'ಗಾತ್ರ',
  'shopdetail.noResults': 'ಹೊಂದುವ ವಸ್ತುಗಳಿಲ್ಲ.',
};

const ml = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'പയർ വർഗ്ഗങ്ങൾ',
  'cat.spices': 'മസാല',
  'cat.cookingOils': 'പാചക എണ്ണ',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'voice.listening': 'കേൾക്കുന്നു…',
  'cart.belowMin': 'ഡെലിവറിക്ക് കുറഞ്ഞ ഓർഡർ {amt}',
  'account.moreOnWeb': 'കൂടുതൽ',
  'account.dataSaver': 'ഡാറ്റാ സേവർ',
  'cart.switchShopConfirm': 'മറ്റൊരു കടയിൽ നിങ്ങളുടെ പൂർത്തിയാകാത്ത കാർട്ട് ഉണ്ട്. അത് നീക്കി ഇവിടെ കാർട്ട് തുടങ്ങണോ?',
  'psearch.placeholder': 'എല്ലാ കടകളിലും ഉൽപ്പന്നങ്ങൾ തിരയുക',
  'psearch.searching': 'തിരയുന്നു…',
  'psearch.start': 'അടുത്തുള്ള ഏതൊക്കെ കടകളിൽ ലഭ്യമാണെന്ന് കാണാൻ ഒരു ഉൽപ്പന്നം തിരയുക.',
  'psearch.none': 'ഉൽപ്പന്നങ്ങളൊന്നും കണ്ടെത്തിയില്ല. മറ്റൊരു വാക്ക് ശ്രമിക്കുക.',
  'psearch.atShop': '{shop} ൽ',
  'cat.attaRice': 'മാവ് & അരി',
  'cat.dairy': 'പാൽ ഉൽപ്പന്നങ്ങൾ',
  'cat.snacks': 'ലഘുഭക്ഷണങ്ങൾ',
  'cat.household': 'വീട്ടുപകരണങ്ങൾ',
  'cat.personalCare': 'വ്യക്തിഗത പരിചരണം',
  'shops.searching': 'തിരയുന്നു…',
  // Transcribed verbatim from the already-authored web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — the same
  // human-written strings the consumer PWA already ships, so the two
  // surfaces read identically.
  'tab.cart': 'കാർട്ട്',
  'ostatus.hint.pending': 'കടയുടെ സ്വീകാരത്തിനായി കാത്തിരിക്കുന്നു',
  'ostatus.hint.accepted': 'സ്വീകരിച്ചു — ഉടൻ തയ്യാറാകും',
  'ostatus.hint.preparing': 'തയ്യാറാക്കുന്നു',
  'ostatus.hint.ready_pickup': 'പിക്കപ്പിന് തയ്യാർ',
  'ostatus.hint.ready_delivery': 'തയ്യാർ — അയയ്ക്കാൻ കാത്തിരിക്കുന്നു',
  'ostatus.hint.out_for_delivery': 'ഡെലിവറിക്ക് പോയി',
  'ostatus.hint.completed': 'പൂർത്തിയായി',
  'ostatus.hint.cancelled': 'ഓർഡർ റദ്ദാക്കി',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'ലോഡ് ചെയ്യുന്നു…',
  'common.retry': 'വീണ്ടും ശ്രമിക്കുക',
  'common.cancel': 'റദ്ദാക്കുക',
  'common.back': 'തിരികെ',
  'common.close': 'അടയ്ക്കുക',
  'common.search': 'തിരയുക',
  'common.save': 'സേവ് ചെയ്യുക',
  'common.total': 'ആകെ',
  'common.subtotal': 'ഉപ തുക',
  'common.items': 'സാധനങ്ങൾ',
  'common.status': 'നില',

  'tab.khata': 'ഖാത',
  'tab.shops': 'കടകൾ',
  'tab.products': 'ഉൽപ്പന്നങ്ങൾ',
  'tab.orders': 'ഓർഡറുകൾ',
  'tab.account': 'അക്കൗണ്ട്',

  'login.title': 'സൈൻ ഇൻ ചെയ്യുക',
  'login.blurb': 'ഓരോ കടയിലെയും നിങ്ങളുടെ ഖാത കാണുക, കുടിശ്ശിക അടയ്ക്കുക, ഓർഡർ ചെയ്യുക — എല്ലാം ഒരിടത്ത്.',
  'login.mobile': 'മൊബൈൽ നമ്പർ',
  'login.otpHint': 'വാട്ട്‌സ്ആപ്പിൽ 6 അക്ക കോഡ് അയക്കും.',
  'login.sendCode': 'കോഡ് അയക്കുക',
  'login.sending': 'അയക്കുന്നു…',
  'login.enterCode': '{phone} ലേക്ക് അയച്ച കോഡ് നൽകുക',
  'login.codePlaceholder': '6 അക്ക കോഡ്',
  'login.verify': 'പരിശോധിച്ച് തുടരുക',
  'login.verifying': 'പരിശോധിക്കുന്നു…',
  'login.changeNumber': 'നമ്പർ മാറ്റുക',
  'login.resend': 'കോഡ് വീണ്ടും അയക്കുക',
  'login.devCode': 'ടെസ്റ്റ് കോഡ്:',
  'login.failed': 'സൈൻ ഇൻ ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കുക.',
  'login.heroTitle': 'നിങ്ങളുടെ കട ഖാത, നിങ്ങളുടെ പോക്കറ്റിൽ',
  'login.heroSub': 'നിങ്ങളുടെ ഫോൺ ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുക. വാട്ട്‌സ്ആപ്പിൽ കോഡ് അയക്കും — പാസ്‌വേഡ് ഓർക്കേണ്ട ആവശ്യമില്ല.',
  'login.madeForBharat': 'ഭാരതത്തിനായി നിർമ്മിച്ചത് · പട്ടണങ്ങളും ഗ്രാമങ്ങളും',
  'login.verifyTitle': 'നിങ്ങളുടെ നമ്പർ പരിശോധിക്കുക',
  'login.enterCodeTitle': '6 അക്ക കോഡ് നൽകുക',
  'login.resendIn': '{sec}സെ യിൽ വീണ്ടും അയക്കുക',
  'login.codeValidity': 'കോഡ് 5 മിനിറ്റ് വരെ സാധുവാണ്.',

  'khata.title': 'എന്റെ ഖാത',
  'khata.totalOutstanding': 'ആകെ കുടിശ്ശിക',
  'khata.loading': 'നിങ്ങളുടെ ഖാത ലോഡ് ചെയ്യുന്നു…',
  'khata.none': 'ഇതുവരെ ഒരു കടയിലും നിങ്ങളുടെ ഖാത ഇല്ല.',
  'khata.balance': 'ബാക്കി',
  'khata.owe': 'നിങ്ങൾ കൊടുക്കാനുള്ളത്',
  'khata.advance': 'അഡ്വാൻസ്',
  'khata.settled': 'പൂർണമായി തീർന്നു',
  'khata.limitSuffix': ' · പരിധി {amt}',
  'khata.pay': 'അടയ്ക്കുക',
  'khata.opening': 'തുറക്കുന്നു…',

  'shopkhata.title': 'കട ഖാത',
  'shopkhata.loading': 'എൻട്രികൾ ലോഡ് ചെയ്യുന്നു…',
  'shopkhata.entries': 'എൻട്രികൾ',
  'shopkhata.noEntries': 'ഇതുവരെ എൻട്രികൾ ഇല്ല.',
  'shopkhata.payNow': 'ഇപ്പോൾ അടയ്ക്കുക',
  'shopkhata.payTitle': '{shop} ന് അടയ്ക്കുക',
  'shopkhata.amountRupees': 'തുക (₹)',
  'shopkhata.youOwe': 'നിങ്ങൾ {amt} കൊടുക്കണം',
  'shopkhata.payFull': 'മുഴുവൻ കുടിശ്ശിക അടയ്ക്കുക',
  'shopkhata.startPay': 'പേയ്‌മെന്റിലേക്ക് തുടരുക',
  'shopkhata.starting': 'ആരംഭിക്കുന്നു…',
  'shopkhata.enterAmount': 'അടയ്ക്കേണ്ട തുക നൽകുക.',
  'shopkhata.overpay': 'തുക നിങ്ങളുടെ കുടിശ്ശികയേക്കാൾ കൂടുതലാണ്.',
  'shopkhata.nothingDue': 'ഈ കടയിൽ കുടിശ്ശിക ഇല്ല.',
  'shopkhata.paySuccess': 'പേയ്‌മെന്റ് പൂർത്തിയായി. ബാക്കി പുതുക്കുന്നു…',
  'txn.purchase': 'വാങ്ങൽ',
  'txn.payment': 'അടവ്',
  'txn.cash': 'പണം അടച്ചു',
  'txn.credit': 'കടം',

  'pay.title': 'പേയ്‌മെന്റ്',
  'pay.secure': 'നിങ്ങൾ കടയുടെ സുരക്ഷിത പേജിൽ അടയ്ക്കുകയാണ്.',
  'pay.done': 'കഴിഞ്ഞു',
  'pay.cancelled': 'പേയ്‌മെന്റ് പൂർത്തിയായില്ല.',

  'shops.title': 'കടകൾ കണ്ടെത്തുക',
  'shops.heading': 'നിങ്ങളുടെ അടുത്തുള്ള കടകൾ',
  'shops.searchPlaceholder': 'കട അല്ലെങ്കിൽ നഗരം തിരയുക',
  'shops.loading': 'കടകൾ ലോഡ് ചെയ്യുന്നു…',
  'shops.none': 'കടകൾ കണ്ടെത്തിയില്ല. മറ്റൊരു തിരയൽ ശ്രമിക്കുക.',
  'shops.useLocation': 'എന്റെ അടുത്ത്',
  'shops.locating': 'നിങ്ങളെ കണ്ടെത്തുന്നു…',
  'shops.nearby': 'അടുത്ത്',
  'shops.locationOff': 'ലൊക്കേഷൻ ലഭ്യമല്ല. എല്ലാ കടകളും കാണിക്കുന്നു.',
  'shops.itemsCount': '{n} സാധനങ്ങൾ',
  'shops.kmAway': '{km} കിമീ അകലെ',
  'shops.noLocation': 'ലൊക്കേഷൻ ഇല്ല',

  'shopdetail.loading': 'കാറ്റലോഗ് ലോഡ് ചെയ്യുന്നു…',
  'shopdetail.noItems': 'ഈ കട ഇതുവരെ സാധനങ്ങൾ ചേർത്തിട്ടില്ല.',
  'shopdetail.perKg': '/ കിലോ',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'എണ്ണം',
  'shopdetail.add': 'ചേർക്കുക',
  'shopdetail.review': 'ഓർഡർ കാണുക',
  'shopdetail.deliveryFee': 'ഡെലിവറി {amt}',
  'shopdetail.pickup': 'നിങ്ങൾ തന്നെ എടുക്കുക',
  'shopdetail.delivery': 'ഡെലിവറി',

  'cart.title': 'നിങ്ങളുടെ കൊട്ട',
  'cart.empty': 'നിങ്ങളുടെ കൊട്ട ശൂന്യമാണ്.',
  'cart.browse': 'കടകൾ കാണുക',
  'cart.fulfillment': 'എങ്ങനെ വേണം',
  'cart.pickup': 'നിങ്ങൾ തന്നെ എടുക്കുക',
  'cart.delivery': 'ഡെലിവറി',
  'cart.payment': 'പേയ്‌മെന്റ്',
  'cart.onKhata': 'ഖാതയിൽ',
  'cart.payOnline': 'ഓൺലൈൻ അടവ്',
  'cart.payCash': 'പണം',
  'cart.address': 'ഡെലിവറി വിലാസം',
  'cart.addressPlaceholder': 'വീട്ട് നമ്പർ, തെരുവ്, പ്രദേശം, അടയാളം',
  'cart.note': 'കടയ്ക്ക് കുറിപ്പ്',
  'cart.notePlaceholder': 'ഉദാ. എത്തുമ്പോൾ വിളിക്കുക',
  'cart.deliveryFee': 'ഡെലിവറി ഫീസ്',
  'cart.freeDelivery': 'സൗജന്യം',
  'cart.placeOrder': 'ഓർഡർ ചെയ്യുക',
  'cart.placing': 'ഓർഡർ ചെയ്യുന്നു…',
  'cart.addressRequired': 'ദയവായി ഡെലിവറി വിലാസം നൽകുക.',
  'cart.creditNote': 'ഈ കടയിലെ നിങ്ങളുടെ ഖാതയിൽ ചേരും.',
  'cart.prepaidNote': 'കടയുടെ സുരക്ഷിത പേജിൽ ഇപ്പോൾ അടയ്ക്കുക.',
  'cart.cashNote': 'എടുക്കുമ്പോഴോ ഡെലിവറിയിലോ പണം അടയ്ക്കുക.',
  'cart.remove': 'നീക്കുക',

  'orders.title': 'എന്റെ ഓർഡറുകൾ',
  'orders.loading': 'നിങ്ങളുടെ ഓർഡറുകൾ ലോഡ് ചെയ്യുന്നു…',
  'orders.none': 'ഇതുവരെ നിങ്ങൾക്ക് ഓർഡറുകൾ ഇല്ല.',
  'orders.itemsCount': '{n} സാധനങ്ങൾ',

  'orderdetail.title': 'ഓർഡർ',
  'orderdetail.loading': 'ഓർഡർ ലോഡ് ചെയ്യുന്നു…',
  'orderdetail.deliverTo': 'ഇവിടേക്ക് എത്തിക്കുക:',
  'orderdetail.note': 'കുറിപ്പ്:',
  'orderdetail.payment': 'അടവ്:',
  'orderdetail.cancel': 'ഓർഡർ റദ്ദാക്കുക',
  'orderdetail.cancelling': 'റദ്ദാക്കുന്നു…',
  'orderdetail.cancelConfirm': 'ഈ ഓർഡർ റദ്ദാക്കണോ?',
  'orderdetail.deliveryFee': 'ഡെലിവറി ഫീസ്',

  'ostatus.pending': 'കാത്തിരിക്കുന്നു',
  'ostatus.accepted': 'സ്വീകരിച്ചു',
  'ostatus.preparing': 'തയ്യാറാക്കുന്നു',
  'ostatus.ready': 'തയ്യാർ',
  'ostatus.out_for_delivery': 'ഡെലിവറിക്ക് പുറപ്പെട്ടു',
  'ostatus.completed': 'പൂർത്തിയായി',
  'ostatus.cancelled': 'റദ്ദാക്കി',
  'pmode.credit': 'ഖാതയിൽ',
  'pmode.prepaid': 'ഓൺലൈൻ',
  'pmode.cash': 'പണം',
  'pstatus.paid': 'അടച്ചു',

  'account.title': 'അക്കൗണ്ട് ക്രമീകരണം',
  'account.profile': 'പ്രൊഫൈൽ',
  'account.subtitle': 'എല്ലാ വിവരവും ഐച്ഛികം. നിങ്ങളുടെ ഫോൺ ആണ് ലോഗിൻ, ഇവിടെ മാറ്റാനാവില്ല.',
  'account.name': 'പേര്',
  'account.phone': 'ഫോൺ',
  'account.email': 'ഇമെയിൽ',
  'account.optional': 'ഐച്ഛികം',
  'account.save': 'സേവ് ചെയ്യുക',
  'account.saving': 'സേവ് ചെയ്യുന്നു…',
  'account.saved': 'സേവ് ചെയ്തു.',
  'account.loadError': 'നിങ്ങളുടെ പ്രൊഫൈൽ ലോഡ് ചെയ്യാനായില്ല.',
  'account.language': 'ഭാഷ',
  'account.logout': 'ലോഗ് ഔട്ട്',
  'account.logoutConfirm': 'Smart Digital Khata യിൽ നിന്ന് ലോഗ് ഔട്ട് ചെയ്യണോ?',
  'login.betaSuffix': ' (ബീറ്റ)',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'num.title': 'മൊബൈൽ നമ്പർ',
  'num.current': 'നിലവിലെ നമ്പർ',
  'num.change': 'നമ്പർ മാറ്റുക',
  'num.new': 'പുതിയ മൊബൈൽ നമ്പർ',
  'num.newHint': 'പുതിയ നമ്പർ നിങ്ങളുടേതാണെന്ന് ഉറപ്പാക്കാൻ ഒരു കോഡ് അയയ്ക്കും. എല്ലാ കടകളിലെയും നിങ്ങളുടെ കണക്ക് അതിലേക്ക് മാറും.',
  'num.sendCode': 'കോഡ് അയയ്ക്കുക',
  'num.sending': 'അയയ്ക്കുന്നു…',
  'num.enterCode': '{phone} ലേക്ക് അയച്ച കോഡ് നൽകുക',
  'num.confirm': 'മാറ്റം സ്ഥിരീകരിക്കുക',
  'num.changing': 'മാറ്റുന്നു…',
  'num.cancel': 'റദ്ദാക്കുക',
  'num.changed': 'നമ്പർ മാറി. എല്ലാ കടകളിലെയും നിങ്ങളുടെ കണക്ക് ഇപ്പോൾ പുതിയ നമ്പറിലാണ്.',
  'num.devCode': 'ഡെവ് കോഡ്:',
  'common.balance': 'ബാക്കി',
  'ref.title': 'ക്ഷണിക്കൂ, നേടൂ',
  'ref.subtitle': 'നിങ്ങളുടെ കോഡ് പങ്കിടുക. അതുവഴി ചേരുന്നവർ ഇവിടെ കാണിക്കും.',
  'ref.yourCode': 'നിങ്ങളുടെ റഫറൽ കോഡ്',
  'ref.shareLink': 'പങ്കിടൽ ലിങ്ക്',
  'ref.referredCount': 'ഇതുവരെ നിങ്ങൾ {n} പേരെ റഫർ ചെയ്തു.',
  'ref.noneYet': 'ഇതുവരെ റഫറലുകൾ ഇല്ല — തുടങ്ങാൻ നിങ്ങളുടെ കോഡ് പങ്കിടുക.',
  'ref.referredByLabel': 'നിങ്ങളെ ക്ഷണിച്ചത്',
  'ref.loadError': 'റഫറലുകൾ ലോഡ് ചെയ്യാനായില്ല.',
  'ref.type.shop': 'കട',
  'ref.type.owner': 'കട ഉടമ',
  'ref.type.customer': 'ഉപഭോക്താവ്',
  'chelp.title': 'സഹായവും പതിവുചോദ്യങ്ങളും',
  'chelp.subtitle': 'ഷോപ്പിംഗ്, ഓർഡറുകൾ, നിങ്ങളുടെ കണക്ക് എന്നിവയ്ക്കുള്ള ചെറിയ ഉത്തരങ്ങൾ.',
  'chelp.e2.q': 'ഒരു സാധനം എങ്ങനെ തിരയും?',
  'chelp.e2.a': 'മുകളിലുള്ള സെർച്ച് ബാർ ഉപയോഗിക്കുക, അല്ലെങ്കിൽ വിഭാഗങ്ങളിൽ നോക്കുക. ശബ്ദത്തിലൂടെ തിരയാൻ 🎤 മൈക്ക് അമർത്തി സാധനത്തിന്റെ പേര് പറയുക.',
  'chelp.e3.q': 'ഓർഡർ എങ്ങനെ നൽകും?',
  'chelp.e3.a': 'ഒരു കട തുറന്ന്, വേണ്ട സാധനങ്ങൾ കാർട്ടിൽ ചേർത്ത്, പിക്കപ്പ് അല്ലെങ്കിൽ ഡെലിവറി തിരഞ്ഞെടുത്ത്, ഓർഡർ നൽകുക അമർത്തുക. കടയ്ക്ക് നിങ്ങളുടെ ഓർഡർ കിട്ടി അത് സ്ഥിരീകരിക്കും.',
  'chelp.e4.q': 'പിക്കപ്പും ഡെലിവറിയും തമ്മിലുള്ള വ്യത്യാസം എന്താണ്?',
  'chelp.e4.a': 'പിക്കപ്പ് എന്നാൽ ഓർഡർ നിങ്ങൾ തന്നെ കടയിൽ നിന്ന് സൗജന്യമായി എടുക്കുന്നത്. ഡെലിവറി എന്നാൽ കട അത് നിങ്ങളുടെ അടുത്ത് എത്തിക്കും, ചിലപ്പോൾ ചെറിയ ഫീസോടെ — പല കടകളും നിശ്ചിത തുകയ്ക്ക് മുകളിൽ സൗജന്യ ഡെലിവറി നൽകും.',
  'chelp.e5.q': 'ഓർഡറിന് എങ്ങനെ പണം നൽകും?',
  'chelp.e5.a': 'കണക്കിൽ (ഉധാർ), ഓൺലൈനായി, അല്ലെങ്കിൽ ക്യാഷായി നൽകാം. കണക്കിൽ വാങ്ങിയാൽ, ആ തുക ആ കടയിലെ നിങ്ങളുടെ നിലവിലെ ബാക്കിയിൽ ചേരും, പിന്നീട് തീർക്കാം.',
  'chelp.e6.q': 'എന്റെ കണക്ക് (ഉധാർ) എങ്ങനെ പ്രവർത്തിക്കും?',
  'chelp.e6.a': 'ഓരോ കടയിലും നിങ്ങൾ കൊടുക്കാനുള്ള തുക നിങ്ങളുടെ കണക്ക് ഒരിടത്ത് കാണിക്കും. ഓരോ വാങ്ങലും പണമടയ്ക്കലും രേഖപ്പെടും, അതിനാൽ നിങ്ങളുടെ ബാക്കി എപ്പോഴും അറിയാം, സ്റ്റേറ്റ്‌മെന്റ് കാണാം അല്ലെങ്കിൽ ഡൗൺലോഡ് ചെയ്യാം.',
  'chelp.e7.q': 'എന്റെ ഓർഡർ എങ്ങനെ ട്രാക്ക് ചെയ്യും?',
  'chelp.e7.a': 'ഓർഡറുകൾ ടാബ് തുറന്ന്, ഓരോ ഓർഡറും പെൻഡിംഗിൽ നിന്ന് അംഗീകരിച്ചു, പിന്നെ തയ്യാർ അല്ലെങ്കിൽ പൂർത്തിയായി എന്നിങ്ങനെ നീങ്ങുന്നത് കാണുക. ഓരോ ഘട്ടത്തിലും നിങ്ങൾക്ക് അപ്‌ഡേറ്റ് കിട്ടും.',
  'shopdetail.searchProducts': 'ഉൽപ്പന്നങ്ങൾ തിരയുക',
  'shopdetail.allCategories': 'എല്ലാ വിഭാഗങ്ങളും',
  'shopdetail.category': 'വിഭാഗം',
  'shopdetail.brand': 'ബ്രാൻഡ്',
  'shopdetail.size': 'വലുപ്പം',
  'shopdetail.noResults': 'പൊരുത്തപ്പെടുന്ന ഇനങ്ങളില്ല.',
};

const mr = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'डाळ आणि कडधान्ये',
  'cat.spices': 'मसाले',
  'cat.cookingOils': 'स्वयंपाकाचे तेल',
  'cat.household': 'घरगुती सामान',
  'cat.personalCare': 'वैयक्तिक काळजी',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'tab.cart': 'कार्ट',
  'voice.listening': 'ऐकत आहे…',
  'cart.belowMin': 'डिलिव्हरीसाठी किमान ऑर्डर {amt} आहे',
  'account.moreOnWeb': 'अधिक',
  'account.dataSaver': 'डेटा सेव्हर',
  'cart.switchShopConfirm': 'दुसऱ्या दुकानात तुमची अपूर्ण कार्ट आहे. ती साफ करून इथे नवीन कार्ट सुरू करायची?',
  'ostatus.hint.completed': 'पूर्ण',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'लोड होत आहे…',
  'common.retry': 'पुन्हा प्रयत्न करा',
  'common.cancel': 'रद्द करा',
  'common.back': 'मागे',
  'common.close': 'बंद करा',
  'common.search': 'शोधा',
  'common.save': 'सेव्ह करा',
  'common.total': 'एकूण',
  'common.subtotal': 'उप-बेरीज',
  'common.items': 'वस्तू',
  'common.status': 'स्थिती',

  'tab.khata': 'खाते',
  'tab.shops': 'दुकाने',
  'tab.orders': 'ऑर्डर',
  'tab.account': 'अकाउंट',

  'login.title': 'साइन इन करा',
  'login.blurb': 'प्रत्येक दुकानाचे तुमचे खाते पाहा, उधारी भरा आणि ऑर्डर करा — सर्व एका ठिकाणी.',
  'login.mobile': 'मोबाइल नंबर',
  'login.otpHint': 'आम्ही व्हॉट्सअॅपवर 6 अंकी कोड पाठवू.',
  'login.sendCode': 'कोड पाठवा',
  'login.sending': 'पाठवत आहे…',
  'login.enterCode': '{phone} वर पाठवलेला कोड टाका',
  'login.codePlaceholder': '6 अंकी कोड',
  'login.verify': 'पडताळून पुढे जा',
  'login.verifying': 'पडताळत आहे…',
  'login.changeNumber': 'नंबर बदला',
  'login.resend': 'कोड पुन्हा पाठवा',
  'login.devCode': 'टेस्ट कोड:',
  'login.failed': 'साइन इन होऊ शकले नाही. पुन्हा प्रयत्न करा.',
  'login.heroTitle': 'तुमच्या दुकानाचे खाते, तुमच्या खिशात',
  'login.heroSub': 'तुमच्या फोनने साइन इन करा. आम्ही व्हॉट्सअॅपवर कोड पाठवतो — पासवर्ड लक्षात ठेवायची गरज नाही.',
  'login.madeForBharat': 'भारतासाठी बनवले · शहरे आणि गावे',
  'login.verifyTitle': 'तुमचा नंबर पडताळा',
  'login.enterCodeTitle': '6 अंकी कोड टाका',
  'login.resendIn': '{sec}से मध्ये पुन्हा पाठवा',
  'login.codeValidity': 'कोड 5 मिनिटांसाठी वैध आहे.',

  'khata.title': 'माझे खाते',
  'khata.totalOutstanding': 'एकूण उधारी',
  'khata.loading': 'तुमचे खाते लोड होत आहे…',
  'khata.none': 'अजून कोणत्याही दुकानात तुमचे खाते नाही.',
  'khata.balance': 'शिल्लक',
  'khata.owe': 'तुम्हाला द्यायचे',
  'khata.advance': 'आगाऊ',
  'khata.settled': 'पूर्ण फिटले',
  'khata.limitSuffix': ' · मर्यादा {amt}',
  'khata.pay': 'भरा',
  'khata.opening': 'उघडत आहे…',

  'shopkhata.title': 'दुकानाचे खाते',
  'shopkhata.loading': 'नोंदी लोड होत आहेत…',
  'shopkhata.entries': 'नोंदी',
  'shopkhata.noEntries': 'अजून कोणतीही नोंद नाही.',
  'shopkhata.payNow': 'आता भरा',
  'shopkhata.payTitle': '{shop} ला भरा',
  'shopkhata.amountRupees': 'रक्कम (₹)',
  'shopkhata.youOwe': 'तुम्हाला {amt} द्यायचे आहेत',
  'shopkhata.payFull': 'पूर्ण उधारी भरा',
  'shopkhata.startPay': 'भरण्यासाठी पुढे जा',
  'shopkhata.starting': 'सुरू होत आहे…',
  'shopkhata.enterAmount': 'भरायची रक्कम टाका.',
  'shopkhata.overpay': 'रक्कम तुमच्या उधारीपेक्षा जास्त आहे.',
  'shopkhata.nothingDue': 'या दुकानात काही उधारी नाही.',
  'shopkhata.paySuccess': 'भरणा पूर्ण. शिल्लक अपडेट होत आहे…',
  'txn.purchase': 'खरेदी',
  'txn.payment': 'भरणा',
  'txn.cash': 'रोख भरणा',
  'txn.credit': 'उधार',

  'pay.title': 'भरणा',
  'pay.secure': 'तुम्ही दुकानाच्या सुरक्षित पेजवर भरत आहात.',
  'pay.done': 'झाले',
  'pay.cancelled': 'भरणा पूर्ण झाला नाही.',

  'shops.title': 'दुकाने शोधा',
  'shops.heading': 'तुमच्या जवळची दुकाने',
  'shops.searchPlaceholder': 'दुकान किंवा शहर शोधा',
  'shops.loading': 'दुकाने लोड होत आहेत…',
  'shops.none': 'कोणतीही दुकान मिळाली नाही. वेगळा शोध करा.',
  'shops.useLocation': 'माझ्याजवळ',
  'shops.locating': 'तुम्हाला शोधत आहे…',
  'shops.nearby': 'जवळपास',
  'shops.locationOff': 'लोकेशन उपलब्ध नाही. सर्व दुकाने दाखवत आहे.',
  'shops.itemsCount': '{n} वस्तू',
  'shops.kmAway': '{km} किमी दूर',
  'shops.noLocation': 'लोकेशन नाही',

  'shopdetail.loading': 'यादी लोड होत आहे…',
  'shopdetail.noItems': 'या दुकानाने अजून वस्तू जोडलेल्या नाहीत.',
  'shopdetail.perKg': '/ किलो',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'नग',
  'shopdetail.add': 'जोडा',
  'shopdetail.review': 'ऑर्डर पाहा',
  'shopdetail.deliveryFee': 'डिलिव्हरी {amt}',
  'shopdetail.pickup': 'स्वतः घेऊन जा',
  'shopdetail.delivery': 'डिलिव्हरी',

  'cart.title': 'तुमची टोपली',
  'cart.empty': 'तुमची टोपली रिकामी आहे.',
  'cart.browse': 'दुकाने पाहा',
  'cart.fulfillment': 'कसे घ्यायचे',
  'cart.pickup': 'स्वतः घेऊन जा',
  'cart.delivery': 'डिलिव्हरी',
  'cart.payment': 'भरणा',
  'cart.onKhata': 'खात्यावर',
  'cart.payOnline': 'ऑनलाइन भरणा',
  'cart.payCash': 'रोख',
  'cart.address': 'डिलिव्हरी पत्ता',
  'cart.addressPlaceholder': 'घर क्र, गल्ली, भाग, खूण',
  'cart.note': 'दुकानासाठी सूचना',
  'cart.notePlaceholder': 'उदा. पोहोचल्यावर कॉल करा',
  'cart.deliveryFee': 'डिलिव्हरी शुल्क',
  'cart.freeDelivery': 'मोफत',
  'cart.placeOrder': 'ऑर्डर करा',
  'cart.placing': 'ऑर्डर होत आहे…',
  'cart.addressRequired': 'कृपया डिलिव्हरी पत्ता टाका.',
  'cart.creditNote': 'या दुकानात तुमच्या खात्यात जमा होईल.',
  'cart.prepaidNote': 'दुकानाच्या सुरक्षित पेजवर आता भरा.',
  'cart.cashNote': 'घेताना किंवा डिलिव्हरीवर रोख भरा.',
  'cart.remove': 'काढा',

  'orders.title': 'माझे ऑर्डर',
  'orders.loading': 'तुमचे ऑर्डर लोड होत आहेत…',
  'orders.none': 'अजून तुमचा कोणताही ऑर्डर नाही.',
  'orders.itemsCount': '{n} वस्तू',

  'orderdetail.title': 'ऑर्डर',
  'orderdetail.loading': 'ऑर्डर लोड होत आहे…',
  'orderdetail.deliverTo': 'येथे पोहोचवा:',
  'orderdetail.note': 'सूचना:',
  'orderdetail.payment': 'भरणा:',
  'orderdetail.cancel': 'ऑर्डर रद्द करा',
  'orderdetail.cancelling': 'रद्द होत आहे…',
  'orderdetail.cancelConfirm': 'हा ऑर्डर रद्द करायचा?',
  'orderdetail.deliveryFee': 'डिलिव्हरी शुल्क',

  'ostatus.pending': 'प्रलंबित',
  'ostatus.accepted': 'स्वीकारले',
  'ostatus.preparing': 'तयार होत आहे',
  'ostatus.ready': 'तयार',
  'ostatus.out_for_delivery': 'डिलिव्हरीसाठी निघाले',
  'ostatus.completed': 'पूर्ण झाले',
  'ostatus.cancelled': 'रद्द केले',
  'pmode.credit': 'खात्यावर',
  'pmode.prepaid': 'ऑनलाइन',
  'pmode.cash': 'रोख',
  'pstatus.paid': 'भरले',

  'account.title': 'खाते सेटिंग',
  'account.profile': 'प्रोफाइल',
  'account.subtitle': 'सर्व माहिती ऐच्छिक. तुमचा फोन हेच तुमचे लॉगिन आहे, इथे बदलणार नाही.',
  'account.name': 'नाव',
  'account.phone': 'फोन',
  'account.email': 'ईमेल',
  'account.optional': 'ऐच्छिक',
  'account.save': 'सेव्ह करा',
  'account.saving': 'सेव्ह होत आहे…',
  'account.saved': 'सेव्ह झाले.',
  'account.loadError': 'तुमची प्रोफाइल लोड होऊ शकली नाही.',
  'account.language': 'भाषा',
  'account.logout': 'लॉग आउट',
  'account.logoutConfirm': 'Smart Digital Khata मधून लॉग आउट करायचे?',
  'login.betaSuffix': ' (बीटा)',
};

const gu = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'દાળ અને કઠોળ',
  'cat.spices': 'મસાલા',
  'cat.cookingOils': 'રસોઈ તેલ',
  'cat.household': 'ઘરવપરાશ',
  'cat.personalCare': 'વ્યક્તિગત સંભાળ',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'tab.cart': 'કાર્ટ',
  'voice.listening': 'સાંભળું છું…',
  'cart.belowMin': 'ડિલિવરી માટે ન્યૂનતમ ઑર્ડર {amt} છે',
  'account.moreOnWeb': 'વધુ',
  'account.dataSaver': 'ડેટા સેવર',
  'cart.switchShopConfirm': 'બીજી દુકાનમાં તમારી અધૂરી કાર્ટ છે. તેને સાફ કરી અહીં નવી કાર્ટ શરૂ કરવી?',
  'ostatus.hint.completed': 'પૂર્ણ',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'લોડ થઈ રહ્યું છે…',
  'common.retry': 'ફરી પ્રયાસ કરો',
  'common.cancel': 'રદ કરો',
  'common.back': 'પાછળ',
  'common.close': 'બંધ કરો',
  'common.search': 'શોધો',
  'common.save': 'સેવ કરો',
  'common.total': 'કુલ',
  'common.subtotal': 'ઉપ-કુલ',
  'common.items': 'સામાન',
  'common.status': 'સ્થિતિ',

  'tab.khata': 'ખાતું',
  'tab.shops': 'દુકાનો',
  'tab.orders': 'ઓર્ડર',
  'tab.account': 'એકાઉન્ટ',

  'login.title': 'સાઇન ઇન કરો',
  'login.blurb': 'દરેક દુકાનનું તમારું ખાતું જુઓ, બાકી ચૂકવો અને ઓર્ડર કરો — બધું એક જગ્યાએ.',
  'login.mobile': 'મોબાઇલ નંબર',
  'login.otpHint': 'અમે વોટ્સએપ પર 6 અંકનો કોડ મોકલીશું.',
  'login.sendCode': 'કોડ મોકલો',
  'login.sending': 'મોકલાઈ રહ્યું છે…',
  'login.enterCode': '{phone} પર મોકલેલો કોડ દાખલ કરો',
  'login.codePlaceholder': '6 અંકનો કોડ',
  'login.verify': 'ચકાસીને આગળ વધો',
  'login.verifying': 'ચકાસાઈ રહ્યું છે…',
  'login.changeNumber': 'નંબર બદલો',
  'login.resend': 'કોડ ફરી મોકલો',
  'login.devCode': 'ટેસ્ટ કોડ:',
  'login.failed': 'સાઇન ઇન થઈ શક્યું નહીં. ફરી પ્રયાસ કરો.',
  'login.heroTitle': 'તમારી દુકાનનું ખાતું, તમારા ખિસ્સામાં',
  'login.heroSub': 'તમારા ફોનથી સાઇન ઇન કરો. અમે વોટ્સએપ પર કોડ મોકલીએ છીએ — કોઈ પાસવર્ડ યાદ રાખવાની જરૂર નથી.',
  'login.madeForBharat': 'ભારત માટે બનાવ્યું · શહેરો અને ગામડાં',
  'login.verifyTitle': 'તમારો નંબર ચકાસો',
  'login.enterCodeTitle': '6 અંકનો કોડ દાખલ કરો',
  'login.resendIn': '{sec}સે માં ફરી મોકલો',
  'login.codeValidity': 'કોડ 5 મિનિટ સુધી માન્ય છે.',

  'khata.title': 'મારું ખાતું',
  'khata.totalOutstanding': 'કુલ બાકી',
  'khata.loading': 'તમારું ખાતું લોડ થઈ રહ્યું છે…',
  'khata.none': 'હજી કોઈ દુકાનમાં તમારું ખાતું નથી.',
  'khata.balance': 'બેલેન્સ',
  'khata.owe': 'તમારે આપવાના',
  'khata.advance': 'એડવાન્સ',
  'khata.settled': 'પૂરું ચૂકતે',
  'khata.limitSuffix': ' · મર્યાદા {amt}',
  'khata.pay': 'ચૂકવો',
  'khata.opening': 'ખૂલી રહ્યું છે…',

  'shopkhata.title': 'દુકાનનું ખાતું',
  'shopkhata.loading': 'એન્ટ્રી લોડ થઈ રહી છે…',
  'shopkhata.entries': 'એન્ટ્રી',
  'shopkhata.noEntries': 'હજી કોઈ એન્ટ્રી નથી.',
  'shopkhata.payNow': 'હમણાં ચૂકવો',
  'shopkhata.payTitle': '{shop} ને ચૂકવો',
  'shopkhata.amountRupees': 'રકમ (₹)',
  'shopkhata.youOwe': 'તમારે {amt} આપવાના છે',
  'shopkhata.payFull': 'આખી બાકી ચૂકવો',
  'shopkhata.startPay': 'ચૂકવણી પર જાઓ',
  'shopkhata.starting': 'શરૂ થઈ રહ્યું છે…',
  'shopkhata.enterAmount': 'ચૂકવવાની રકમ દાખલ કરો.',
  'shopkhata.overpay': 'રકમ તમારી બાકી કરતાં વધારે છે.',
  'shopkhata.nothingDue': 'આ દુકાનમાં કંઈ બાકી નથી.',
  'shopkhata.paySuccess': 'ચૂકવણી પૂરી. બેલેન્સ અપડેટ થઈ રહ્યું છે…',
  'txn.purchase': 'ખરીદી',
  'txn.payment': 'ચૂકવણી',
  'txn.cash': 'રોકડ ચૂકવણી',
  'txn.credit': 'ઉધાર',

  'pay.title': 'ચૂકવણી',
  'pay.secure': 'તમે દુકાનના સુરક્ષિત પેજ પર ચૂકવો છો.',
  'pay.done': 'થઈ ગયું',
  'pay.cancelled': 'ચૂકવણી પૂરી થઈ નથી.',

  'shops.title': 'દુકાનો શોધો',
  'shops.heading': 'તમારી નજીકની દુકાનો',
  'shops.searchPlaceholder': 'દુકાન કે શહેર શોધો',
  'shops.loading': 'દુકાનો લોડ થઈ રહી છે…',
  'shops.none': 'કોઈ દુકાન મળી નહીં. બીજી શોધ કરો.',
  'shops.useLocation': 'મારી નજીક',
  'shops.locating': 'તમને શોધી રહ્યા છીએ…',
  'shops.nearby': 'નજીકમાં',
  'shops.locationOff': 'લોકેશન ઉપલબ્ધ નથી. બધી દુકાનો બતાવી રહ્યા છીએ.',
  'shops.itemsCount': '{n} સામાન',
  'shops.kmAway': '{km} કિમી દૂર',
  'shops.noLocation': 'લોકેશન નથી',

  'shopdetail.loading': 'યાદી લોડ થઈ રહી છે…',
  'shopdetail.noItems': 'આ દુકાને હજી સામાન ઉમેર્યો નથી.',
  'shopdetail.perKg': '/ કિલો',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'નંગ',
  'shopdetail.add': 'ઉમેરો',
  'shopdetail.review': 'ઓર્ડર જુઓ',
  'shopdetail.deliveryFee': 'ડિલિવરી {amt}',
  'shopdetail.pickup': 'જાતે લઈ જાઓ',
  'shopdetail.delivery': 'ડિલિવરી',

  'cart.title': 'તમારી ટોપલી',
  'cart.empty': 'તમારી ટોપલી ખાલી છે.',
  'cart.browse': 'દુકાનો જુઓ',
  'cart.fulfillment': 'કેવી રીતે લેશો',
  'cart.pickup': 'જાતે લઈ જાઓ',
  'cart.delivery': 'ડિલિવરી',
  'cart.payment': 'ચૂકવણી',
  'cart.onKhata': 'ખાતામાં',
  'cart.payOnline': 'ઓનલાઇન ચૂકવણી',
  'cart.payCash': 'રોકડ',
  'cart.address': 'ડિલિવરી સરનામું',
  'cart.addressPlaceholder': 'ઘર નં, શેરી, વિસ્તાર, નિશાની',
  'cart.note': 'દુકાન માટે નોંધ',
  'cart.notePlaceholder': 'દા.ત. પહોંચીને કૉલ કરો',
  'cart.deliveryFee': 'ડિલિવરી ચાર્જ',
  'cart.freeDelivery': 'મફત',
  'cart.placeOrder': 'ઓર્ડર કરો',
  'cart.placing': 'ઓર્ડર થઈ રહ્યો છે…',
  'cart.addressRequired': 'કૃપા કરી ડિલિવરી સરનામું દાખલ કરો.',
  'cart.creditNote': 'આ દુકાનમાં તમારા ખાતામાં ઉમેરાશે.',
  'cart.prepaidNote': 'દુકાનના સુરક્ષિત પેજ પર હમણાં ચૂકવો.',
  'cart.cashNote': 'લેતી વખતે કે ડિલિવરીમાં રોકડ ચૂકવો.',
  'cart.remove': 'દૂર કરો',

  'orders.title': 'મારા ઓર્ડર',
  'orders.loading': 'તમારા ઓર્ડર લોડ થઈ રહ્યા છે…',
  'orders.none': 'હજી તમારો કોઈ ઓર્ડર નથી.',
  'orders.itemsCount': '{n} સામાન',

  'orderdetail.title': 'ઓર્ડર',
  'orderdetail.loading': 'ઓર્ડર લોડ થઈ રહ્યો છે…',
  'orderdetail.deliverTo': 'અહીં પહોંચાડો:',
  'orderdetail.note': 'નોંધ:',
  'orderdetail.payment': 'ચૂકવણી:',
  'orderdetail.cancel': 'ઓર્ડર રદ કરો',
  'orderdetail.cancelling': 'રદ થઈ રહ્યો છે…',
  'orderdetail.cancelConfirm': 'આ ઓર્ડર રદ કરવો?',
  'orderdetail.deliveryFee': 'ડિલિવરી ચાર્જ',

  'ostatus.pending': 'બાકી',
  'ostatus.accepted': 'સ્વીકાર્યો',
  'ostatus.preparing': 'તૈયાર થઈ રહ્યો છે',
  'ostatus.ready': 'તૈયાર',
  'ostatus.out_for_delivery': 'ડિલિવરી માટે નીકળ્યો',
  'ostatus.completed': 'પૂરો થયો',
  'ostatus.cancelled': 'રદ થયો',
  'pmode.credit': 'ખાતામાં',
  'pmode.prepaid': 'ઓનલાઇન',
  'pmode.cash': 'રોકડ',
  'pstatus.paid': 'ચૂકવાયું',

  'account.title': 'ખાતા સેટિંગ',
  'account.profile': 'પ્રોફાઇલ',
  'account.subtitle': 'બધી માહિતી વૈકલ્પિક. તમારો ફોન એ તમારું લોગિન છે, અહીં બદલાશે નહીં.',
  'account.name': 'નામ',
  'account.phone': 'ફોન',
  'account.email': 'ઈમેલ',
  'account.optional': 'વૈકલ્પિક',
  'account.save': 'સેવ કરો',
  'account.saving': 'સેવ થઈ રહ્યું છે…',
  'account.saved': 'સેવ થયું.',
  'account.loadError': 'તમારી પ્રોફાઇલ લોડ થઈ શકી નથી.',
  'account.language': 'ભાષા',
  'account.logout': 'લોગ આઉટ',
  'account.logoutConfirm': 'Smart Digital Khata માંથી લોગ આઉટ કરવું?',
  'login.betaSuffix': ' (બીટા)',
};

const ur = {
  // Chip labels for the shelves the category filter added. NOT new
  // translation: every value here is copied byte-for-byte out of the shipped
  // catalogue translations (backend/src/data/catalog-i18n.json), which is the
  // same human-written text a shopper already sees naming these very shelves
  // inside the catalogue.
  'cat.dalPulses': 'دالیں',
  'cat.spices': 'مصالحے',
  'cat.cookingOils': 'کھانے کا تیل',

  // Transcribed verbatim from translations a human already authored in this
  // repository: the regional seed that populates i18n_overrides
  // (backend/src/data/regional-i18n.json) and the web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — every value below
  // was copied byte-for-byte from a source whose own English is identical to
  // this app's English for the same key, so the app and the web read alike.
  'voice.listening': 'سن رہے ہیں…',
  'cart.belowMin': 'ڈیلیوری کے لیے کم از کم آرڈر {amt} ہے',
  'account.moreOnWeb': 'مزید',
  'account.dataSaver': 'ڈیٹا سیور',
  'cart.switchShopConfirm': 'کسی اور دکان پر آپ کا نامکمل کارٹ موجود ہے۔ اسے ہٹا کر یہاں کارٹ شروع کریں؟',
  'psearch.placeholder': 'تمام دکانوں میں مصنوعات تلاش کریں',
  'psearch.searching': 'تلاش جاری ہے…',
  'psearch.start': 'یہ دیکھنے کے لیے کوئی مصنوعہ تلاش کریں کہ قریب کن دکانوں میں دستیاب ہے۔',
  'psearch.none': 'کوئی مصنوعہ نہیں ملی۔ دوسرا لفظ آزمائیں۔',
  'psearch.atShop': '{shop} پر',
  'cat.attaRice': 'آٹا اور چاول',
  'cat.dairy': 'ڈیری',
  'cat.snacks': 'اسنیکس',
  'cat.household': 'گھریلو سامان',
  'cat.personalCare': 'ذاتی نگہداشت',
  'shops.searching': 'تلاش جاری ہے…',
  // Transcribed verbatim from the already-authored web dictionary
  // (admin-dashboard/src/lib/i18n.js). Not new translation — the same
  // human-written strings the consumer PWA already ships, so the two
  // surfaces read identically.
  'tab.cart': 'ٹوکری',
  'ostatus.hint.pending': 'دکان کی منظوری کا انتظار',
  'ostatus.hint.accepted': 'قبول شدہ — جلد تیار ہوگا',
  'ostatus.hint.preparing': 'تیار ہو رہا ہے',
  'ostatus.hint.ready_pickup': 'پک اپ کے لیے تیار',
  'ostatus.hint.ready_delivery': 'تیار — بھیجنے کا انتظار',
  'ostatus.hint.out_for_delivery': 'ترسیل کے لیے روانہ',
  'ostatus.hint.completed': 'مکمل',
  'ostatus.hint.cancelled': 'آرڈر منسوخ',
  'app.name': 'Smart Digital Khata',
  'common.loading': 'لوڈ ہو رہا ہے…',
  'common.retry': 'دوبارہ کوشش کریں',
  'common.cancel': 'منسوخ کریں',
  'common.back': 'واپس',
  'common.close': 'بند کریں',
  'common.search': 'تلاش کریں',
  'common.save': 'محفوظ کریں',
  'common.total': 'کل',
  'common.subtotal': 'ذیلی کل',
  'common.items': 'سامان',
  'common.status': 'حالت',

  'tab.khata': 'کھاتہ',
  'tab.shops': 'دکانیں',
  'tab.products': 'مصنوعات',
  'tab.orders': 'آرڈر',
  'tab.account': 'اکاؤنٹ',

  'login.title': 'سائن ان کریں',
  'login.blurb': 'ہر دکان کا اپنا کھاتہ دیکھیں، بقایا ادا کریں اور آرڈر کریں — سب ایک جگہ۔',
  'login.mobile': 'موبائل نمبر',
  'login.otpHint': 'ہم واٹس ایپ پر 6 ہندسوں کا کوڈ بھیجیں گے۔',
  'login.sendCode': 'کوڈ بھیجیں',
  'login.sending': 'بھیجا جا رہا ہے…',
  'login.enterCode': '{phone} پر بھیجا گیا کوڈ درج کریں',
  'login.codePlaceholder': '6 ہندسوں کا کوڈ',
  'login.verify': 'تصدیق کر کے آگے بڑھیں',
  'login.verifying': 'تصدیق ہو رہی ہے…',
  'login.changeNumber': 'نمبر بدلیں',
  'login.resend': 'کوڈ دوبارہ بھیجیں',
  'login.devCode': 'ٹیسٹ کوڈ:',
  'login.failed': 'سائن ان نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
  'login.heroTitle': 'آپ کی دکان کا کھاتہ، آپ کی جیب میں',
  'login.heroSub': 'اپنے فون سے سائن ان کریں۔ ہم واٹس ایپ پر کوڈ بھیجتے ہیں — کوئی پاس ورڈ یاد رکھنے کی ضرورت نہیں۔',
  'login.madeForBharat': 'بھارت کے لیے بنایا گیا · قصبے اور گاؤں',
  'login.verifyTitle': 'اپنا نمبر تصدیق کریں',
  'login.enterCodeTitle': '6 ہندسوں کا کوڈ درج کریں',
  'login.resendIn': '{sec}سے میں دوبارہ بھیجیں',
  'login.codeValidity': 'کوڈ 5 منٹ تک درست ہے۔',

  'khata.title': 'میرا کھاتہ',
  'khata.totalOutstanding': 'کل بقایا',
  'khata.loading': 'آپ کا کھاتہ لوڈ ہو رہا ہے…',
  'khata.none': 'ابھی کسی دکان پر آپ کا کھاتہ نہیں ہے۔',
  'khata.balance': 'بیلنس',
  'khata.owe': 'آپ کو دینا ہے',
  'khata.advance': 'پیشگی',
  'khata.settled': 'پورا ادا',
  'khata.limitSuffix': ' · حد {amt}',
  'khata.pay': 'ادائیگی',
  'khata.opening': 'کھل رہا ہے…',

  'shopkhata.title': 'دکان کا کھاتہ',
  'shopkhata.loading': 'اندراج لوڈ ہو رہے ہیں…',
  'shopkhata.entries': 'اندراج',
  'shopkhata.noEntries': 'ابھی کوئی اندراج نہیں۔',
  'shopkhata.payNow': 'ابھی ادا کریں',
  'shopkhata.payTitle': '{shop} کو ادائیگی',
  'shopkhata.amountRupees': 'رقم (₹)',
  'shopkhata.youOwe': 'آپ کو {amt} دینا ہے',
  'shopkhata.payFull': 'پورا بقایا ادا کریں',
  'shopkhata.startPay': 'ادائیگی پر جائیں',
  'shopkhata.starting': 'شروع ہو رہا ہے…',
  'shopkhata.enterAmount': 'ادائیگی کی رقم درج کریں۔',
  'shopkhata.overpay': 'رقم آپ کے بقایا سے زیادہ ہے۔',
  'shopkhata.nothingDue': 'اس دکان پر کچھ بقایا نہیں۔',
  'shopkhata.paySuccess': 'ادائیگی مکمل۔ بیلنس اپ ڈیٹ ہو رہا ہے…',
  'txn.purchase': 'خریداری',
  'txn.payment': 'ادائیگی',
  'txn.cash': 'نقد ادائیگی',
  'txn.credit': 'ادھار',

  'pay.title': 'ادائیگی',
  'pay.secure': 'آپ دکان کے محفوظ صفحے پر ادائیگی کر رہے ہیں۔',
  'pay.done': 'ہو گیا',
  'pay.cancelled': 'ادائیگی مکمل نہیں ہوئی۔',

  'shops.title': 'دکانیں تلاش کریں',
  'shops.heading': 'آپ کے قریب کی دکانیں',
  'shops.searchPlaceholder': 'دکان یا شہر تلاش کریں',
  'shops.loading': 'دکانیں لوڈ ہو رہی ہیں…',
  'shops.none': 'کوئی دکان نہیں ملی۔ دوسری تلاش آزمائیں۔',
  'shops.useLocation': 'میرے قریب',
  'shops.locating': 'آپ کو ڈھونڈ رہے ہیں…',
  'shops.nearby': 'قریب',
  'shops.locationOff': 'مقام دستیاب نہیں۔ ساری دکانیں دکھا رہے ہیں۔',
  'shops.itemsCount': '{n} سامان',
  'shops.kmAway': '{km} کلومیٹر دور',
  'shops.noLocation': 'مقام درج نہیں',

  'shopdetail.loading': 'فہرست لوڈ ہو رہی ہے…',
  'shopdetail.noItems': 'اس دکان نے ابھی سامان نہیں ڈالا۔',
  'shopdetail.perKg': '/ کلو',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'عدد',
  'shopdetail.add': 'شامل کریں',
  'shopdetail.review': 'آرڈر دیکھیں',
  'shopdetail.deliveryFee': 'ڈیلیوری {amt}',
  'shopdetail.pickup': 'خود لے جائیں',
  'shopdetail.delivery': 'ڈیلیوری',

  'cart.title': 'آپ کی ٹوکری',
  'cart.empty': 'آپ کی ٹوکری خالی ہے۔',
  'cart.browse': 'دکانیں دیکھیں',
  'cart.fulfillment': 'کیسے لیں گے',
  'cart.pickup': 'خود لے جائیں',
  'cart.delivery': 'ڈیلیوری',
  'cart.payment': 'ادائیگی',
  'cart.onKhata': 'کھاتے پر',
  'cart.payOnline': 'آن لائن ادائیگی',
  'cart.payCash': 'نقد',
  'cart.address': 'ڈیلیوری پتہ',
  'cart.addressPlaceholder': 'مکان نمبر، گلی، علاقہ، نشانی',
  'cart.note': 'دکان کے لیے نوٹ',
  'cart.notePlaceholder': 'مثلاً پہنچنے پر کال کریں',
  'cart.deliveryFee': 'ڈیلیوری فیس',
  'cart.freeDelivery': 'مفت',
  'cart.placeOrder': 'آرڈر کریں',
  'cart.placing': 'آرڈر ہو رہا ہے…',
  'cart.addressRequired': 'براہ کرم ڈیلیوری پتہ درج کریں۔',
  'cart.creditNote': 'اس دکان پر آپ کے کھاتے میں شامل ہوگا۔',
  'cart.prepaidNote': 'دکان کے محفوظ صفحے پر ابھی ادا کریں۔',
  'cart.cashNote': 'لیتے وقت یا ڈیلیوری پر نقد ادا کریں۔',
  'cart.remove': 'ہٹائیں',

  'orders.title': 'میرے آرڈر',
  'orders.loading': 'آپ کے آرڈر لوڈ ہو رہے ہیں…',
  'orders.none': 'ابھی آپ کا کوئی آرڈر نہیں۔',
  'orders.itemsCount': '{n} سامان',

  'orderdetail.title': 'آرڈر',
  'orderdetail.loading': 'آرڈر لوڈ ہو رہا ہے…',
  'orderdetail.deliverTo': 'یہاں پہنچائیں:',
  'orderdetail.note': 'نوٹ:',
  'orderdetail.payment': 'ادائیگی:',
  'orderdetail.cancel': 'آرڈر منسوخ کریں',
  'orderdetail.cancelling': 'منسوخ ہو رہا ہے…',
  'orderdetail.cancelConfirm': 'یہ آرڈر منسوخ کریں؟',
  'orderdetail.deliveryFee': 'ڈیلیوری فیس',

  'ostatus.pending': 'زیر التوا',
  'ostatus.accepted': 'منظور',
  'ostatus.preparing': 'تیار ہو رہا ہے',
  'ostatus.ready': 'تیار',
  'ostatus.out_for_delivery': 'روانہ ہو گیا',
  'ostatus.completed': 'مکمل',
  'ostatus.cancelled': 'منسوخ',
  'pmode.credit': 'کھاتے پر',
  'pmode.prepaid': 'آن لائن',
  'pmode.cash': 'نقد',
  'pstatus.paid': 'ادا ہو گیا',

  'account.title': 'کھاتہ ترتیبات',
  'account.profile': 'پروفائل',
  'account.subtitle': 'ساری معلومات اختیاری۔ آپ کا فون آپ کا لاگ ان ہے، یہاں نہیں بدلے گا۔',
  'account.name': 'نام',
  'account.phone': 'فون',
  'account.email': 'ای میل',
  'account.optional': 'اختیاری',
  'account.save': 'محفوظ کریں',
  'account.saving': 'محفوظ ہو رہا ہے…',
  'account.saved': 'محفوظ ہو گیا۔',
  'account.loadError': 'آپ کی پروفائل لوڈ نہیں ہو سکی۔',
  'account.language': 'زبان',
  'account.logout': 'لاگ آؤٹ',
  'account.logoutConfirm': 'Smart Digital Khata سے لاگ آؤٹ کریں؟',
  'login.betaSuffix': ' (بیٹا)',

  // --- Batch PARITY: strings COPIED VERBATIM from the web consumer app
  // (admin-dashboard/src/lib/i18n.js). No translation was authored here; every
  // value below is the one a human already wrote for the same feature on the
  // web. The web dictionary has only en/hi/ta/te/kn/ml/ur, so bn, mr and gu get
  // nothing and fall back to English; and where the web's own block still held
  // an English placeholder, the key was left out rather than copied, since the
  // fallback already produces exactly that and a copy would only inflate the
  // coverage ratchet.
  'num.title': 'موبائل نمبر',
  'num.current': 'موجودہ نمبر',
  'num.change': 'نمبر تبدیل کریں',
  'num.new': 'نیا موبائل نمبر',
  'num.newHint': 'یہ تصدیق کرنے کے لیے کہ نیا نمبر آپ کا ہے، ہم اس پر ایک کوڈ بھیجیں گے۔ ہر دکان پر آپ کا کھاتہ اسی پر منتقل ہو جائے گا۔',
  'num.sendCode': 'کوڈ بھیجیں',
  'num.sending': 'بھیجا جا رہا ہے…',
  'num.enterCode': '{phone} پر بھیجا گیا کوڈ درج کریں',
  'num.confirm': 'تبدیلی کی تصدیق کریں',
  'num.changing': 'تبدیل ہو رہا ہے…',
  'num.cancel': 'منسوخ کریں',
  'num.changed': 'نمبر تبدیل ہو گیا۔ تمام دکانوں پر آپ کا کھاتہ اب نئے نمبر پر ہے۔',
  'num.devCode': 'ڈیو کوڈ:',
  'common.balance': 'بقایا',
  'ref.title': 'دعوت دیں اور کمائیں',
  'ref.subtitle': 'اپنا کوڈ شیئر کریں۔ جو اس کے ذریعے شامل ہوگا، وہ یہاں نظر آئے گا۔',
  'ref.yourCode': 'آپ کا ریفرل کوڈ',
  'ref.shareLink': 'شیئر لنک',
  'ref.referredCount': 'اب تک آپ نے {n} کو ریفر کیا ہے۔',
  'ref.noneYet': 'ابھی کوئی ریفرل نہیں — شروع کرنے کے لیے اپنا کوڈ شیئر کریں۔',
  'ref.referredByLabel': 'آپ کو مدعو کیا',
  'ref.loadError': 'ریفرلز لوڈ نہیں ہو سکے۔',
  'ref.type.shop': 'دکان',
  'ref.type.owner': 'دکان مالک',
  'ref.type.customer': 'گاہک',
  'chelp.title': 'مدد اور عام سوالات',
  'chelp.subtitle': 'خریداری، آرڈر اور آپ کے کھاتے کے مختصر جواب۔',
  'chelp.e2.q': 'کوئی چیز کیسے تلاش کروں؟',
  'chelp.e2.a': 'اوپر دیے سرچ بار کا استعمال کریں، یا زمروں میں دیکھیں۔ بول کر تلاش کرنے کے لیے 🎤 مائیک دبائیں اور چیز کا نام بولیں۔',
  'chelp.e3.q': 'آرڈر کیسے کروں؟',
  'chelp.e3.a': 'دکان کھولیں، مطلوبہ چیزیں کارٹ میں ڈالیں، پک اپ یا ڈیلیوری چنیں، اور آرڈر کریں دبائیں۔ دکان کو آپ کا آرڈر مل جاتا ہے اور وہ تصدیق کر دیتی ہے۔',
  'chelp.e4.q': 'پک اپ اور ڈیلیوری میں کیا فرق ہے؟',
  'chelp.e4.a': 'پک اپ یعنی آپ آرڈر خود دکان سے لے آتے ہیں، مفت۔ ڈیلیوری یعنی دکان آپ تک پہنچاتی ہے، کبھی کبھی معمولی فیس کے ساتھ — کئی دکانیں مقررہ رقم سے اوپر مفت ڈیلیوری دیتی ہیں۔',
  'chelp.e5.q': 'آرڈر کی ادائیگی کیسے کروں؟',
  'chelp.e5.a': 'آپ کھاتے (اُدھار) پر، آن لائن، یا نقد ادائیگی کر سکتے ہیں۔ کھاتے پر لینے سے وہ رقم اس دکان پر آپ کے جاری بیلنس میں جڑ جاتی ہے، جسے بعد میں چکا سکتے ہیں۔',
  'chelp.e6.q': 'میرا کھاتہ (اُدھار) کیسے کام کرتا ہے؟',
  'chelp.e6.a': 'آپ کا کھاتہ ہر دکان پر آپ کی باقی رقم ایک جگہ دکھاتا ہے۔ ہر خرید اور ادائیگی درج ہوتی ہے، اس لیے آپ کو ہمیشہ اپنا بیلنس معلوم رہتا ہے اور آپ تفصیل دیکھ یا ڈاؤن لوڈ کر سکتے ہیں۔',
  'chelp.e7.q': 'اپنا آرڈر کیسے ٹریک کروں؟',
  'chelp.e7.a': 'آرڈر ٹیب کھولیں اور ہر آرڈر کو زیر التوا سے منظور شدہ، پھر تیار یا مکمل ہوتے دیکھیں۔ ہر مرحلے پر آپ کو اپ ڈیٹ ملتا ہے۔',
  'shopdetail.searchProducts': 'مصنوعات تلاش کریں',
  'shopdetail.allCategories': 'تمام زمرے',
  'shopdetail.category': 'زمرہ',
  'shopdetail.brand': 'برانڈ',
  'shopdetail.size': 'سائز',
  'shopdetail.noResults': 'کوئی مماثل اشیاء نہیں۔',
};

// Every language below is fully authored (translated), matching en's key set.
const DICTS = {
  en,
  hi,
  bn,
  ta,
  te,
  kn,
  ml,
  mr,
  gu,
  ur,
};

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// Pure translate against a given language code — used by the hook below.
export function translate(lang, key, vars) {
  const dict = DICTS[lang] || en;
  const s = dict[key] != null ? dict[key] : (en[key] != null ? en[key] : key);
  return interpolate(s, vars);
}

// Best-effort device language (2-letter), falling back to 'en'. Never throws.
function deviceLang() {
  try {
    let loc = '';
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager && NativeModules.SettingsManager.settings;
      loc = (s && (s.AppleLocale || (s.AppleLanguages && s.AppleLanguages[0]))) || '';
    } else {
      loc = (NativeModules.I18nManager && NativeModules.I18nManager.localeIdentifier) || '';
    }
    const two = String(loc).slice(0, 2).toLowerCase();
    return DICTS[two] ? two : 'en';
  } catch (e) {
    return 'en';
  }
}

async function loadStoredLang() {
  try {
    const v = await SecureStore.getItemAsync(LANG_KEY);
    if (v && DICTS[v]) return v;
  } catch (e) { /* ignore */ }
  return deviceLang();
}

const LangContext = createContext({
  lang: 'en',
  t: (k, vars) => translate('en', k, vars),
  setLang: () => {},
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');
  // Gate the first paint until the stored language is read, so the app never
  // flashes English before switching to the saved language on a cold start.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStoredLang().then((l) => {
      if (!alive) return;
      setLangState(l);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const setLang = useCallback(async (l) => {
    if (!DICTS[l]) return;
    setLangState(l);
    // AWAIT the write so the choice is durably flushed before we move on — a
    // fire-and-forget write can be lost if the app is closed right after, which
    // made the language appear to reset to English on the next open.
    try { await SecureStore.setItemAsync(LANG_KEY, l); } catch (e) { /* ignore */ }
  }, []);

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
  }), [lang, setLang]);

  // Dark splash (matches the app background) until the stored language resolves.
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
  }

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}
