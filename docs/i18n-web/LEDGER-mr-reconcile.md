# Marathi web/app reconciliation — decision ledger

Written before anything is applied, and read BY the apply step: a row this
file does not name is not touched, in either direction.

Linguistic checks were derived from the Marathi corpus, not inherited.
Negation: नाही, नाहीत, नका, नये.
No orthographic split found in this corpus.

**Limitation:** Marathi shares its script with `hi`, so a string in that language cannot be detected here by script. Only a reader catches it.

| | rows |
|---|---|
| divergences | 91 |
| A / B / C | 0 / 63 / 28 |
| take the app string | 7 |
| keep the web string | 1 |
| await a Marathi reader | 83 |

## Applied — take the app string

### `c.codePlaceholder`
- en:  6-digit code
- web: ६-अंकी कोड
- app: 6 अंकी कोड  _(i18n:login.codePlaceholder)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: The web writes ६ — a Devanagari digit — for a code LENGTH, on a screen whose keypad produces Latin digits. Every number this app renders comes from the code in Latin.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `dash.network.age0`
- en:  0–30 days
- web: ०–३० दिवस
- app: 0–30 दिवस  _(i18n:ins.age_0_30)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits ०–३० on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `dash.network.age30`
- en:  31–60 days
- web: ३१–६० दिवस
- app: 31–60 दिवस  _(i18n:ins.age_31_60)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `ins.age_0_30`
- en:  0–30 days
- web: ०–३० दिवस
- app: 0–30 दिवस  _(i18n:ins.age_0_30)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `ins.age_31_60`
- en:  31–60 days
- web: ३१–६० दिवस
- app: 31–60 दिवस  _(i18n:ins.age_31_60)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `ins.age_61_90`
- en:  61–90 days
- web: ६१–९० दिवस
- app: 61–90 दिवस  _(i18n:ins.age_61_90)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)

### `ins.age_90_plus`
- en:  90+ days
- web: ९०+ दिवस
- app: 90+ दिवस  _(i18n:ins.age_90_plus)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Devanagari digits on the web, Latin in the app. Same rule.
- flags: !! NUMBERS, !! NATIVE DIGITS (web)


## Applied — keep the web string

### `chelp.e7.a`
- en:  Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step.
- web: ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबितपासून मंजूर, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते.
- app: ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबित पासून स्वीकारले, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते.  _(i18n:chelp.e7.a)_
- class: **C**  ·  decision: **web**
- confidence: high  ·  native review: yes
- reason: 'each order move from pending to approved'. The app renders APPROVED as स्वीकारले — accepted — and this product treats accept and approve as separate steps in the same sentence that lists them as separate steps. The web has मंजूर (approved) and is correct. Marathi's app does get PENDING right (प्रलंबित), unlike Gujarati's, so this is the only wrong word in the row.
- flags: !! APPROVE, !! PENDING


## Awaiting a Marathi reader

### `acc.genderFemale`
- en:  Female
- web: स्त्री
- app: महिला  _(i18n:account.genderFemale)_
- class: **B**  ·  decision: **review**

### `acc.genderPreferNot`
- en:  Prefer not to say
- web: सांगू इच्छित नाही
- app: सांगायचे नाही  _(i18n:account.genderPreferNot)_
- class: **B**  ·  decision: **review**

### `acc.genderUnset`
- en:  Not set
- web: सेट केलेले नाही
- app: दिलेले नाही  _(i18n:account.genderUnset)_
- class: **B**  ·  decision: **review**

### `acc.phoneReadonly`
- en:  Phone is your login ID and cannot be changed here.
- web: फोन हा तुमचा लॉगिन आयडी आहे आणि इथे बदलता येत नाही.
- app: फोन हीच तुमची लॉगिन आयडी आहे, इथे बदलता येत नाही.  _(i18n:account.phoneReadonly)_
- class: **B**  ·  decision: **review**

### `c.cartEmpty`
- en:  Your cart is empty.
- web: तुमची कार्ट रिकामी आहे.
- app: तुमची टोपली रिकामी आहे.  _(i18n:cart.empty)_
- class: **B**  ·  decision: **review**

### `c.deliverTo`
- en:  Deliver to:
- web: इथे पोहोचवा:
- app: येथे पोहोचवा:  _(i18n:orderdetail.deliverTo)_
- class: **B**  ·  decision: **review**

### `c.enterCodeSentTo`
- en:  Enter the code sent to {phone}
- web: {phone} वर पाठवलेला कोड लिहा
- app: {phone} वर पाठवलेला कोड टाका  _(i18n:login.enterCode)_
- class: **B**  ·  decision: **review**

### `c.loadingCatalog`
- en:  Loading catalog…
- web: कॅटलॉग लोड होत आहे…
- app: यादी लोड होत आहे…  _(i18n:shopdetail.loading)_
- class: **B**  ·  decision: **review**

### `c.locationNotSet`
- en:  Location not set
- web: स्थान सेट केलेले नाही
- app: लोकेशन नाही  _(i18n:shops.noLocation)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `c.noShops`
- en:  No shops found. Try a different search.
- web: कोणतेही दुकान सापडले नाही. वेगळ्या प्रकारे शोधा.
- app: कोणतीही दुकान मिळाली नाही. वेगळा शोध करा.  _(i18n:shops.none)_
- class: **B**  ·  decision: **review**

### `c.noteColon`
- en:  Note:
- web: नोंद:
- app: सूचना:  _(i18n:orderdetail.note)_
- class: **B**  ·  decision: **review**

### `c.notePlaceholderArrival`
- en:  e.g. call on arrival
- web: उदा. पोहोचल्यावर फोन करा
- app: उदा. पोहोचल्यावर कॉल करा  _(i18n:cart.notePlaceholder)_
- class: **B**  ·  decision: **review**

### `c.payOnline`
- en:  Pay online
- web: ऑनलाइन भरा
- app: ऑनलाइन भरणा  _(i18n:cart.payOnline)_
- class: **C**  ·  decision: **review**
- flags: !! PAY

### `c.placing`
- en:  Placing…
- web: ऑर्डर करत आहे…
- app: ऑर्डर होत आहे…  _(i18n:cart.placing)_
- class: **B**  ·  decision: **review**

### `c.prepaid`
- en:  Prepaid
- web: आगाऊ भरलेले
- app: ऑनलाइन  _(i18n:pmode.prepaid)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `c.size`
- en:  Size
- web: आकार
- app: साइज  _(i18n:shopdetail.size)_
- class: **B**  ·  decision: **review**

### `c.unit`
- en:  unit
- web: एकक
- app: नग  _(i18n:shopdetail.unit)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `c.verifyContinue`
- en:  Verify & continue
- web: पडताळा आणि पुढे जा
- app: पडताळून पुढे जा  _(i18n:login.verify)_
- class: **B**  ·  decision: **review**

### `c.yourCart`
- en:  Your cart
- web: तुमची कार्ट
- app: तुमची टोपली  _(i18n:cart.title)_
- class: **B**  ·  decision: **review**

### `cat.addFromCatalogue`
- en:  Add from catalogue
- web: कॅटलॉगमधून जोडा
- app: यादीतून जोडा  _(i18n:cat.addFromCatalogue)_
- class: **B**  ·  decision: **review**

### `cat.addProduct`
- en:  Add product
- web: उत्पादन जोडा
- app: वस्तू जोडा  _(i18n:cat.addProduct)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `cat.descOptional`
- en:  Description (optional)
- web: वर्णन (ऐच्छिक)
- app: तपशील (ऐच्छिक)  _(i18n:cat.descPlaceholder)_
- class: **B**  ·  decision: **review**

### `cat.empty`
- en:  No products yet. Add your first above.
- web: अजून कोणतेही उत्पादन नाही. वर तुमचे पहिले जोडा.
- app: अजून कोणतीही वस्तू नाही. वर पहिली जोडा.  _(i18n:cat.empty)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `cat.loadMore`
- en:  Load more
- web: अधिक लोड करा
- app: अधिक पाहा  _(i18n:cat.loadMore)_
- class: **B**  ·  decision: **review**

### `chelp.e2.a`
- en:  Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name.
- web: वरच्या सर्च बारचा वापर करा, किंवा कॅटेगरीत पाहा. बोलून शोधायला 🎤 माइक दाबा आणि वस्तूचे नाव सांगा.
- app: वरचा सर्च बार वापरा, किंवा श्रेणींमध्ये पाहा. बोलून शोधण्यासाठी 🎤 माइक दाबा आणि वस्तूचे नाव बोला.  _(i18n:chelp.e2.a)_
- class: **B**  ·  decision: **review**

### `chelp.e3.a`
- en:  Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it.
- web: एक दुकान उघडा, हव्या त्या वस्तू कार्टमध्ये टाका, पिकअप किंवा डिलिव्हरी निवडा, आणि ऑर्डर करा दाबा. दुकानाला तुमची ऑर्डर मिळते आणि ती पक्की केली जाते.
- app: दुकान उघडा, हव्या त्या वस्तू कार्टमध्ये टाका, स्वतः घेऊन जाणे की डिलिव्हरी निवडा, आणि ऑर्डर करा दाबा. दुकानाला तुमची ऑर्डर मिळते आणि ते ती निश्चित करतात.  _(i18n:chelp.e3.a)_
- class: **B**  ·  decision: **review**

### `chelp.e4.a`
- en:  Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount.
- web: पिकअप म्हणजे तुम्ही स्वतः दुकानातून ऑर्डर घेऊन येता, मोफत. डिलिव्हरी म्हणजे दुकान ती तुमच्यापर्यंत पोहोचवते, कधी थोड्या शुल्कासह — बरीच दुकाने ठरावीक रकमेवर मोफत डिलिव्हरी देतात.
- app: स्वतः घेऊन जाणे म्हणजे तुम्ही ऑर्डर स्वतः दुकानातून आणता, मोफत. डिलिव्हरी म्हणजे दुकान तुमच्यापर्यंत पोहोचवते, कधी थोड्या शुल्कासह — बरीच दुकाने ठरलेल्या रकमेच्या वर मोफत डिलिव्हरी देतात.  _(i18n:chelp.e4.a)_
- class: **B**  ·  decision: **review**

### `chelp.e4.q`
- en:  What is the difference between pickup and delivery?
- web: पिकअप आणि डिलिव्हरीत काय फरक आहे?
- app: स्वतः घेऊन जाणे आणि डिलिव्हरीत काय फरक आहे?  _(i18n:chelp.e4.q)_
- class: **B**  ·  decision: **review**

### `chelp.e5.a`
- en:  You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later.
- web: तुम्ही खात्यावर (उधार), ऑनलाइन, किंवा रोखीने देऊ शकता. खात्यावर घेतल्यास ती रक्कम त्या दुकानात तुमच्या चालू बाकीत जमा होते, नंतर चुकती करता येते.
- app: तुम्ही खात्यावर (उधार), ऑनलाइन, किंवा रोख भरू शकता. खात्यावर घेतले तर ती रक्कम त्या दुकानातल्या तुमच्या चालू शिल्लकीत जमा होते, नंतर फेडता येते.  _(i18n:chelp.e5.a)_
- class: **C**  ·  decision: **review**
- flags: !! PAY, !! BALANCE

### `chelp.e5.q`
- en:  How do I pay for an order?
- web: ऑर्डरचे पैसे कसे द्यायचे?
- app: ऑर्डरचे पैसे कसे भरायचे?  _(i18n:chelp.e5.q)_
- class: **C**  ·  decision: **review**
- flags: !! PAY

### `chelp.e6.a`
- en:  Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement.
- web: तुमचे खाते प्रत्येक दुकानातील तुमची बाकी एका ठिकाणी दाखवते. प्रत्येक खरेदी आणि भरणा नोंदवला जातो, त्यामुळे तुमची बाकी नेहमी कळते, आणि तपशील पाहता किंवा डाउनलोड करता येतो.
- app: तुमचे खाते प्रत्येक दुकानातली तुमची उधारी एका ठिकाणी दाखवते. प्रत्येक खरेदी आणि भरणा नोंदला जातो, त्यामुळे तुमची शिल्लक नेहमी माहीत असते आणि तपशील पाहता किंवा डाउनलोड करता येतो.  _(i18n:chelp.e6.a)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING, !! BALANCE

### `common.note`
- en:  Note
- web: नोंद
- app: सूचना  _(i18n:ord.note)_
- class: **B**  ·  decision: **review**

### `common.noteOptional`
- en:  Note (optional)
- web: नोंद (ऐच्छिक)
- app: सूचना (ऐच्छिक)  _(i18n:addtx.note)_
- class: **B**  ·  decision: **review**

### `common.outstanding`
- en:  Outstanding
- web: बाकी
- app: उधारी  _(i18n:ins.outstanding)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `common.subtotal`
- en:  Subtotal
- web: उप-एकूण
- app: उप-बेरीज  _(i18n:common.subtotal)_
- class: **B**  ·  decision: **review**

### `common.totalOutstanding`
- en:  Total outstanding
- web: एकूण बाकी
- app: एकूण उधारी  _(i18n:dash.totalOutstanding)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `dash.customersWithDues`
- en:  Customers with dues
- web: बाकी असलेले ग्राहक
- app: उधारी असलेले ग्राहक  _(i18n:dash.customersWithDues)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `dash.orderStatus.cancelled`
- en:  Cancelled
- web: रद्द
- app: रद्द केले  _(i18n:ostatus.cancelled)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `dash.revenue.family`
- en:  Family
- web: फॅमिली
- app: कुटुंब  _(i18n:title.family)_
- class: **B**  ·  decision: **review**

### `dash.revenue.free`
- en:  Free
- web: फ्री
- app: मोफत  _(i18n:cart.freeDelivery)_
- class: **B**  ·  decision: **review**

### `fam.combinedOutstanding`
- en:  Combined outstanding
- web: एकत्रित बाकी
- app: एकत्रित उधारी  _(i18n:famd.combinedOutstanding)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `fam.combinedStatement`
- en:  Combined statement
- web: एकत्रित विवरण
- app: एकत्रित हिशेब  _(i18n:famd.combinedStatement)_
- class: **B**  ·  decision: **review**

### `fam.removeConfirm`
- en:  Remove {name} from this family?
- web: {name} यांना या कुटुंबातून काढायचे?
- app: {name} ला या कुटुंबातून काढायचे?  _(i18n:famd.removeConfirm)_
- class: **B**  ·  decision: **review**

### `fam.sendReminder`
- en:  Send WhatsApp reminder
- web: WhatsApp रिमाइंडर पाठवा
- app: व्हॉट्सअॅपवर आठवण पाठवा  _(i18n:famd.sendReminder)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `help.title`
- en:  Help & FAQ
- web: मदत आणि सामान्य प्रश्न
- app: मदत आणि नेहमीचे प्रश्न  _(i18n:chelp.title)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `ins.collectionRate`
- en:  Collection rate
- web: वसुली दर
- app: वसुलीचा दर  _(i18n:ins.collectionRate)_
- class: **B**  ·  decision: **review**

### `ins.customersWithDues`
- en:  Customers with dues
- web: बाकी असलेले ग्राहक
- app: उधारी असलेले ग्राहक  _(i18n:dash.customersWithDues)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `ins.outstandingByAge`
- en:  Outstanding by age
- web: कालावधीनुसार बाकी
- app: किती दिवसांची उधारी  _(i18n:ins.outstandingByAge)_
- class: **C**  ·  decision: **review**
- flags: !! OUTSTANDING

### `log.signIn`
- en:  Sign in
- web: साइन इन
- app: साइन इन करा  _(i18n:login.title)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `mod.loadMore`
- en:  Load more
- web: अधिक लोड करा
- app: अधिक पाहा  _(i18n:cat.loadMore)_
- class: **B**  ·  decision: **review**

### `nav.catalog`
- en:  Catalog
- web: कॅटलॉग
- app: यादी  _(i18n:tab.catalog)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `nav.insights`
- en:  Insights
- web: माहिती
- app: विश्लेषण  _(i18n:title.insights)_
- class: **B**  ·  decision: **review**

### `nav.settings`
- en:  Settings
- web: सेटिंग्ज
- app: सेटिंग  _(i18n:title.settings)_
- class: **B**  ·  decision: **review**

### `num.changed`
- en:  Number changed. Your khata across all shops now uses the new number.
- web: नंबर बदलला. सर्व दुकानांतील तुमचे खाते आता नवीन नंबर वापरते.
- app: नंबर बदलला. सर्व दुकानांतले तुमचे खाते आता नवीन नंबरवर आहे.  _(i18n:num.changed)_
- class: **B**  ·  decision: **review**

### `num.enterCode`
- en:  Enter the code sent to {phone}
- web: {phone} वर पाठवलेला कोड लिहा
- app: {phone} वर पाठवलेला कोड टाका  _(i18n:login.enterCode)_
- class: **B**  ·  decision: **review**

### `ord.empty`
- en:  No orders in this view yet.
- web: या दृश्यात अजून कोणताही ऑर्डर नाही.
- app: इथे अजून कोणताही ऑर्डर नाही.  _(i18n:ord.empty)_
- class: **B**  ·  decision: **review**

### `ord.mark`
- en:  Mark {s}
- web: {s} चिन्हांकित करा
- app: {s} म्हणून नोंदवा  _(i18n:ord.mark)_
- class: **B**  ·  decision: **review**

### `ord.marked`
- en:  Order marked {s}.
- web: ऑर्डर {s} चिन्हांकित झाला.
- app: ऑर्डर {s} म्हणून नोंदवला.  _(i18n:ord.marked)_
- class: **B**  ·  decision: **review**

### `ord.terminal`
- en:  This order is {s} — no further changes.
- web: हा ऑर्डर {s} आहे — पुढे कोणताही बदल नाही.
- app: हा ऑर्डर {s} — आता बदल नाही.  _(i18n:ord.terminal)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `ostatus.cancelled`
- en:  Cancelled
- web: रद्द
- app: रद्द केले  _(i18n:ostatus.cancelled)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `ref.noneYet`
- en:  No referrals yet — share your code to get started.
- web: अजून कोणतेही रेफरल नाही — सुरू करण्यासाठी तुमचा कोड शेअर करा.
- app: अजून कोणताही रेफरल नाही — सुरू करण्यासाठी तुमचा कोड शेअर करा.  _(i18n:ref.noneYet)_
- class: **B**  ·  decision: **review**

### `ref.referredByLabel`
- en:  You were invited by
- web: तुम्हाला आमंत्रण दिले
- app: तुम्हाला निमंत्रण दिले  _(i18n:ref.referredByLabel)_
- class: **B**  ·  decision: **review**

### `ref.referredCount`
- en:  You have referred {n} so far.
- web: तुम्ही आतापर्यंत {n} जणांना रेफर केले आहे.
- app: आतापर्यंत तुम्ही {n} जणांना रेफर केले आहे.  _(i18n:ref.referredCount)_
- class: **B**  ·  decision: **review**

### `ref.shareLink`
- en:  Share link
- web: लिंक शेअर करा
- app: शेअर लिंक  _(i18n:ref.shareLink)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `ref.subtitle`
- en:  Share your code. When someone joins with it, they appear here.
- web: तुमचा कोड शेअर करा. कोणी तो वापरून सामील झाल्यावर इथे दिसतो.
- app: तुमचा कोड शेअर करा. कोणी त्याने जोडले गेले की इथे दिसेल.  _(i18n:ref.subtitle)_
- class: **B**  ·  decision: **review**

### `ref.title`
- en:  Invite & earn
- web: आमंत्रण देऊन कमवा
- app: निमंत्रण द्या आणि कमवा  _(i18n:ref.title)_
- class: **B**  ·  decision: **review**

### `ref.type.owner`
- en:  Shop owner
- web: दुकानमालक
- app: दुकान मालक  _(i18n:ref.type.owner)_
- class: **B**  ·  decision: **review**

### `set.customerNotifications`
- en:  Customer notifications
- web: ग्राहक नोटिफिकेशन
- app: ग्राहकांचे नोटिफिकेशन  _(i18n:set.customerNotifications)_
- class: **B**  ·  decision: **review**

### `set.discovery`
- en:  Discovery (list your shop)
- web: डिस्कव्हरी (तुमचे दुकान यादीत टाका)
- app: शोध (तुमचे दुकान यादीत द्या)  _(i18n:set.discovery)_
- class: **B**  ·  decision: **review**

### `set.free`
- en:  Free
- web: फ्री
- app: मोफत  _(i18n:cart.freeDelivery)_
- class: **B**  ·  decision: **review**

### `set.keySecretSet`
- en:  Key secret set
- web: की सिक्रेट सेट आहे
- app: Key secret दिलेले आहे  _(i18n:set.keySecretSet)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `set.noKeySecret`
- en:  No key secret
- web: कोणतेही की सिक्रेट नाही
- app: Key secret नाही  _(i18n:set.noKeySecret)_
- class: **C**  ·  decision: **review**
- flags: ~ LATIN/BRAND, !! CONTENT LOST

### `set.noWebhookSecret`
- en:  No webhook secret
- web: कोणतेही वेबहूक सिक्रेट नाही
- app: Webhook secret नाही  _(i18n:set.noWebhookSecret)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `set.paymentSaved`
- en:  Payment settings saved.
- web: भरणा सेटिंग्ज सेव्ह झाल्या.
- app: भरणा सेटिंग सेव्ह झाले.  _(i18n:set.paymentSaved)_
- class: **B**  ·  decision: **review**

### `set.webhookSecretSet`
- en:  Webhook secret set
- web: वेबहूक सिक्रेट सेट आहे
- app: Webhook secret दिलेले आहे  _(i18n:set.webhookSecretSet)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `stmt.allShops`
- en:  All shops (combined)
- web: सर्व दुकाने (एकत्रित)
- app: सर्व दुकाने (एकत्र)  _(i18n:stmt.allShops)_
- class: **B**  ·  decision: **review**

### `stmt.closing`
- en:  Closing balance
- web: अखेरची शिल्लक
- app: शेवटची शिल्लक  _(i18n:stmt.closing)_
- class: **B**  ·  decision: **review**

### `stmt.loadError`
- en:  Could not load the statement.
- web: विवरण लोड होऊ शकले नाही.
- app: तपशील लोड होऊ शकला नाही.  _(i18n:stmt.loadError)_
- class: **B**  ·  decision: **review**

### `stmt.noData`
- en:  No entries in this date range.
- web: या तारखेच्या कालावधीत कोणतीही नोंद नाही.
- app: या कालावधीत कोणतीही नोंद नाही.  _(i18n:stmt.noData)_
- class: **B**  ·  decision: **review**

### `stmt.pickShop`
- en:  Choose a shop
- web: एक दुकान निवडा
- app: दुकान निवडा  _(i18n:stmt.pickShop)_
- class: **B**  ·  decision: **review**

### `stmt.rangeError`
- en:  The From date must be on or before the To date.
- web: पासूनची तारीख पर्यंतच्या तारखेच्या समान किंवा आधी असावी.
- app: "पासून" तारीख "पर्यंत" तारखेच्या आधी किंवा तीच असावी.  _(i18n:stmt.rangeError)_
- class: **B**  ·  decision: **review**

### `stmt.subtitle`
- en:  Opening balance, dated entries for a range, and closing balance.
- web: सुरुवातीची शिल्लक, कालावधीसाठी तारखेनुसार नोंदी, आणि अखेरची शिल्लक.
- app: सुरुवातीची शिल्लक, कालावधीतील तारखेनुसार नोंदी, आणि शेवटची शिल्लक.  _(i18n:stmt.subtitle)_
- class: **B**  ·  decision: **review**

### `stmt.title`
- en:  Account statement
- web: खात्याचे विवरण
- app: खात्याचा तपशील  _(i18n:stmt.title)_
- class: **B**  ·  decision: **review**

