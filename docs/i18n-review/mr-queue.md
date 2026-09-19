# Marathi — strings waiting for you

76 rows. Every one of them is a string a Marathi speaker has not read.

Each row shows the English it was translated from and what each surface says today.
The web is khata.dadashaik.com; app/consumer is the shopper's phone app and app/owner
the shopkeeper's. Where the two surfaces differ, that is the question — but they are
**allowed** to differ, and often should: a chip on a phone and a sentence on a page are
not the same thing. Say what each one should read.

Write your answer on the **Your answer** line. "web is right", "app is right", or a better
string — all three are useful answers. "I would not say this at all" is also an answer.

## 7 questions, not 76 answers

The ledger says so itself — "76 rows resolve to about 7 decisions". Answer the
question at the head of each section and every row under it follows. You do not have to
rule on each line, though you can: a row you disagree with overrides its theme.

- **`register_and_tense`** — 54 rows
- **`outstanding_word`** — 7 rows
- **`pay_verb`** — 6 rows
- **`cart_word`** — 3 rows
- **`product_word`** — 3 rows
- **`catalogue_word`** — 2 rows
- **`c.locationNotSet`** — 1 rows

## `register_and_tense` — 54 rows

**The two surfaces differ in register and in how they inflect status labels ('रद्द' vs 'रद्द केले').**

Neither is wrong; it is one voice decision for the product, and applying it string by string is how a product ends up with two voices.

**Your answer for this whole theme:** 

### The surfaces disagree — 39

| key | English | web | app |
|---|---|---|---|
| `acc.genderFemale` / `account.genderFemale` | Female | स्त्री | महिला |
| `acc.genderPreferNot` / `account.genderPreferNot` | Prefer not to say | सांगू इच्छित नाही | सांगायचे नाही |
| `acc.genderUnset` / `account.genderUnset` | Not set | सेट केलेले नाही | दिलेले नाही |
| `acc.phoneReadonly` / `account.phoneReadonly` | Phone is your login ID and cannot be changed here. | फोन हा तुमचा लॉगिन आयडी आहे आणि इथे बदलता येत नाही. | फोन हीच तुमची लॉगिन आयडी आहे, इथे बदलता येत नाही. |
| `c.deliverTo` / `orderdetail.deliverTo` | Deliver to: | इथे पोहोचवा: | येथे पोहोचवा: |
| `c.enterCodeSentTo` / `login.enterCode` | Enter the code sent to {phone} | {phone} वर पाठवलेला कोड लिहा | {phone} वर पाठवलेला कोड टाका |
| `c.noShops` / `shops.none` | No shops found. Try a different search. | कोणतेही दुकान सापडले नाही. वेगळ्या प्रकारे शोधा. | कोणतीही दुकान मिळाली नाही. वेगळा शोध करा. |
| `c.noteColon` / `orderdetail.note` | Note: | नोंद: | सूचना: |
| `c.notePlaceholderArrival` / `cart.notePlaceholder` | e.g. call on arrival | उदा. पोहोचल्यावर फोन करा | उदा. पोहोचल्यावर कॉल करा |
| `c.placing` / `cart.placing` | Placing… | ऑर्डर करत आहे… | ऑर्डर होत आहे… |
| `c.size` / `shopdetail.size` | Size | आकार | साइज |
| `c.verifyContinue` / `login.verify` | Verify & continue | पडताळा आणि पुढे जा | पडताळून पुढे जा |
| `cat.descOptional` / `cat.descPlaceholder` | Description (optional) | वर्णन (ऐच्छिक) | तपशील (ऐच्छिक) |
| `cat.loadMore` | Load more | अधिक लोड करा | अधिक पाहा |
| `common.note` / `ord.note` | Note | नोंद | सूचना |
| `common.noteOptional` / `addtx.note` | Note (optional) | नोंद (ऐच्छिक) | सूचना (ऐच्छिक) |
| `dash.orderStatus.cancelled` / `ostatus.cancelled` | Cancelled | रद्द | रद्द केले |
| `dash.revenue.family` / `title.family` | Family | फॅमिली | कुटुंब |
| `dash.revenue.free` / `cart.freeDelivery` | Free | फ्री | मोफत |
| `fam.combinedStatement` / `famd.combinedStatement` | Combined statement | एकत्रित विवरण | एकत्रित हिशेब |
| `fam.removeConfirm` / `famd.removeConfirm` | Remove {name} from this family? | {name} यांना या कुटुंबातून काढायचे? | {name} ला या कुटुंबातून काढायचे? |
| `fam.sendReminder` / `famd.sendReminder` | Send WhatsApp reminder | WhatsApp रिमाइंडर पाठवा | WhatsApp वर आठवण पाठवा |
| `help.title` / `chelp.title` | Help & FAQ | मदत आणि सामान्य प्रश्न | मदत आणि नेहमीचे प्रश्न |
| `log.signIn` / `login.title` | Sign in | साइन इन | साइन इन करा |
| `mod.loadMore` / `cat.loadMore` | Load more | अधिक लोड करा | अधिक पाहा |
| `nav.insights` / `title.insights` | Insights | माहिती | विश्लेषण |
| `nav.settings` / `title.settings` | Settings | सेटिंग्ज | सेटिंग |
| `ord.terminal` | This order is {s} — no further changes. | हा ऑर्डर {s} आहे — पुढे कोणताही बदल नाही. | हा ऑर्डर {s} — आता बदल नाही. |
| `ostatus.cancelled` | Cancelled | रद्द | रद्द केले |
| `ref.noneYet` | No referrals yet — share your code to get started. | अजून कोणतेही रेफरल नाही — सुरू करण्यासाठी तुमचा कोड शेअर करा. | अजून कोणताही रेफरल नाही — सुरू करण्यासाठी तुमचा कोड शेअर करा. |
| `ref.referredCount` | You have referred {n} so far. | तुम्ही आतापर्यंत {n} जणांना रेफर केले आहे. | आतापर्यंत तुम्ही {n} जणांना रेफर केले आहे. |
| `ref.shareLink` | Share link | लिंक शेअर करा | शेअर लिंक |
| `set.customerNotifications` | Customer notifications | ग्राहक नोटिफिकेशन | ग्राहकांचे नोटिफिकेशन |
| `set.free` / `cart.freeDelivery` | Free | फ्री | मोफत |
| `stmt.allShops` | All shops (combined) | सर्व दुकाने (एकत्रित) | सर्व दुकाने (एकत्र) |
| `stmt.closing` | Closing balance | अखेरची शिल्लक | शेवटची शिल्लक |
| `stmt.loadError` | Could not load the statement. | विवरण लोड होऊ शकले नाही. | तपशील लोड होऊ शकला नाही. |
| `stmt.subtitle` | Opening balance, dated entries for a range, and closing balance. | सुरुवातीची शिल्लक, कालावधीसाठी तारखेनुसार नोंदी, आणि अखेरची शिल्लक. | सुरुवातीची शिल्लक, कालावधीतील तारखेनुसार नोंदी, आणि शेवटची शिल्लक. |
| `stmt.title` | Account statement | खात्याचे विवरण | खात्याचा तपशील |

### Both surfaces already say this — 15

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e4.a` | Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount. | स्वतः घेऊन जाणे म्हणजे तुम्ही ऑर्डर स्वतः दुकानातून आणता, मोफत. डिलिव्हरी म्हणजे दुकान तुमच्यापर्यंत पोहोचवते, कधी थोड्या शुल्कासह — बरीच दुकाने ठरलेल्या रकमेच्या वर मोफत डिलिव्हरी देतात. |
| `chelp.e4.q` | What is the difference between pickup and delivery? | स्वतः घेऊन जाणे आणि डिलिव्हरीत काय फरक आहे? |
| `common.subtotal` | Subtotal | उप-बेरीज |
| `ins.collectionRate` | Collection rate | वसुलीचा दर |
| `num.changed` | Number changed. Your khata across all shops now uses the new number. | नंबर बदलला. सर्व दुकानांतले तुमचे खाते आता नवीन नंबरवर आहे. |
| `num.enterCode` / `login.enterCode` | Enter the code sent to {phone} | {phone} वर पाठवलेला कोड टाका |
| `ord.empty` | No orders in this view yet. | इथे अजून कोणताही ऑर्डर नाही. |
| `ord.mark` | Mark {s} | {s} म्हणून नोंदवा |
| `ord.marked` | Order marked {s}. | ऑर्डर {s} म्हणून नोंदवला. |
| `ref.referredByLabel` | You were invited by | तुम्हाला निमंत्रण दिले |
| `ref.subtitle` | Share your code. When someone joins with it, they appear here. | तुमचा कोड शेअर करा. कोणी त्याने जोडले गेले की इथे दिसेल. |
| `ref.type.owner` | Shop owner | दुकान मालक |
| `stmt.noData` | No entries in this date range. | या कालावधीत कोणतीही नोंद नाही. |
| `stmt.pickShop` | Choose a shop | दुकान निवडा |
| `stmt.rangeError` | The From date must be on or before the To date. | "पासून" तारीख "पर्यंत" तारखेच्या आधी किंवा तीच असावी. |

## `outstanding_word` — 7 rows

**Is Outstanding बाकी (web) or उधारी (app)?**

MONEY. उधारी is specifically credit given on udhaar — arguably more precise for a khata app; बाकी is the neutral 'remaining'. Six rows including common.outstanding, common.totalOutstanding and two customers-with-dues labels. The answer must be one word, and it must not collide with whatever 'Balance' (शिल्लक) becomes.

**Your answer for this whole theme:** 

### The surfaces disagree — 3

| key | English | web | app |
|---|---|---|---|
| `common.totalOutstanding` / `dash.totalOutstanding` | Total outstanding | एकूण बाकी | एकूण उधारी |
| `fam.combinedOutstanding` / `famd.combinedOutstanding` | Combined outstanding | एकत्रित बाकी | एकत्रित उधारी |
| `ins.customersWithDues` / `dash.customersWithDues` | Customers with dues | बाकी असलेले ग्राहक | उधारी असलेले ग्राहक |

### Both surfaces already say this — 4

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e6.a` | Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement. | तुमचे खाते प्रत्येक दुकानातली तुमची उधारी एका ठिकाणी दाखवते. प्रत्येक खरेदी आणि भरणा नोंदला जातो, त्यामुळे तुमची शिल्लक नेहमी माहीत असते आणि तपशील पाहता किंवा डाउनलोड करता येतो. |
| `common.outstanding` / `ins.outstanding` | Outstanding | उधारी |
| `dash.customersWithDues` | Customers with dues | उधारी असलेले ग्राहक |
| `ins.outstandingByAge` | Outstanding by age | किती दिवसांची उधारी |

## `pay_verb` — 6 rows

**Is pay भरणे (app) or देणे (web)?**

Both are ordinary Marathi for paying. The app is consistent on भर-, the web on दे-. It runs through the FAQ answers and c.payOnline, and a product should use one verb for one action.

**Your answer for this whole theme:** 

### The surfaces disagree — 3

| key | English | web | app |
|---|---|---|---|
| `c.payOnline` / `cart.payOnline` | Pay online | ऑनलाइन भरा | ऑनलाइन भरणा |
| `set.discovery` | Discovery (list your shop) | डिस्कव्हरी (तुमचे दुकान यादीत टाका) | शोध (तुमचे दुकान यादीत द्या) |
| `set.paymentSaved` | Payment settings saved. | भरणा सेटिंग्ज सेव्ह झाल्या. | भरणा सेटिंग सेव्ह झाले. |

### Both surfaces already say this — 3

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e5.a` | You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later. | तुम्ही खात्यावर (उधार), ऑनलाइन, किंवा रोख भरू शकता. खात्यावर घेतले तर ती रक्कम त्या दुकानातल्या तुमच्या चालू शिल्लकीत जमा होते, नंतर फेडता येते. |
| `chelp.e5.q` | How do I pay for an order? | ऑर्डरचे पैसे कसे भरायचे? |
| `ref.title` | Invite & earn | निमंत्रण द्या आणि कमवा |

## `cart_word` — 3 rows

**Your answer for this whole theme:** 

### The surfaces disagree — 2

| key | English | web | app |
|---|---|---|---|
| `c.cartEmpty` / `cart.empty` | Your cart is empty. | तुमची कार्ट रिकामी आहे. | तुमची टोपली रिकामी आहे. |
| `c.yourCart` / `cart.title` | Your cart | तुमची कार्ट | तुमची टोपली |

### Both surfaces already say this — 1

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e3.a` | Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it. | दुकान उघडा, हव्या त्या वस्तू कार्टमध्ये टाका, स्वतः घेऊन जाणे की डिलिव्हरी निवडा, आणि ऑर्डर करा दाबा. दुकानाला तुमची ऑर्डर मिळते आणि ते ती निश्चित करतात. |

## `product_word` — 3 rows

**Is a product उत्पादन (web) or वस्तू (app)?**

उत्पादन is the formal word; वस्तू is 'thing/article'. The identical question is open in Gujarati and Bengali.

**Your answer for this whole theme:** 

### The surfaces disagree — 1

| key | English | web | app |
|---|---|---|---|
| `chelp.e2.a` | Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name. | वरच्या सर्च बारचा वापर करा, किंवा कॅटेगरीत पाहा. बोलून शोधायला 🎤 माइक दाबा आणि वस्तूचे नाव सांगा. | वरचा सर्च बार वापरा, किंवा श्रेणींमध्ये पाहा. बोलून शोधण्यासाठी 🎤 माइक दाबा आणि वस्तूचे नाव बोला. |

### Both surfaces already say this — 2

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `cat.addProduct` | Add product | वस्तू जोडा |
| `cat.empty` | No products yet. Add your first above. | अजून कोणतीही वस्तू नाही. वर पहिली जोडा. |

## `catalogue_word` — 2 rows

> **Already decided — do not answer this one.** `catalogue-loanword` is LOCKED and says: where the ENGLISH says catalog, the language uses the loanword, not its word for "list". That settles the WORD. It says nothing about the case ending or the verb around it, so a row where both surfaces already use the loanword and still differ is a register question and belongs to the theme below.
>
> The web obeys it. The app does not, in nine strings across bn, gu and mr — `shopdetail.loading`, `cat.searchCatalogue` and `cat.noCatalogue`. That decision carries no values and the gate cannot evaluate it, which is how they drifted unseen. Repairing them needs the loanword forms written by someone who speaks the language; it is not a choice between the two surfaces.

### The surfaces disagree — 2

| key | English | web | app |
|---|---|---|---|
| `c.loadingCatalog` / `shopdetail.loading` | Loading catalog… | कॅटलॉग लोड होत आहे… | यादी लोड होत आहे… |
| `cat.addFromCatalogue` | Add from catalogue | कॅटलॉगमधून जोडा | कॅटलॉगतून जोडा |

## `c.locationNotSet` — 1 rows

**Location not set — स्थान सेट केलेले नाही (web) or लोकेशन नाही (app)?**

The app drops 'set' and uses the loanword. Shorter is better on a chip, but 'no location' and 'location not set' are not the same statement.

**Your answer for this whole theme:** 

### The surfaces disagree — 1

| key | English | web | app |
|---|---|---|---|
| `c.locationNotSet` / `shops.noLocation` | Location not set | लोकेशन सेट केलेले नाही | लोकेशन नाही |

