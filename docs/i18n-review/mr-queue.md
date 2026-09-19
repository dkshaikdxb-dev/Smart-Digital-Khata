# Marathi — strings waiting for you

28 rows. Every one of them is a string a Marathi speaker has not read.

Each row shows the English it was translated from and what each surface says today.
The web is khata.dadashaik.com; app/consumer is the shopper's phone app and app/owner
the shopkeeper's. Where the two surfaces differ, that is the question — but they are
**allowed** to differ, and often should: a chip on a phone and a sentence on a page are
not the same thing. Say what each one should read.

Write your answer on the **Your answer** line. "web is right", "app is right", or a better
string — all three are useful answers. "I would not say this at all" is also an answer.

## 6 questions, not 28 answers

The ledger says so itself — "28 rows resolve to about 6 decisions". Answer the
question at the head of each section and every row under it follows. You do not have to
rule on each line, though you can: a row you disagree with overrides its theme.

- **`register_and_tense`** — 15 rows
- **`outstanding_word`** — 4 rows
- **`pay_verb`** — 3 rows
- **`product_word`** — 3 rows
- **`catalogue_word`** — 2 rows
- **`cart_word`** — 1 rows

Closed since the ledger was written, with no rows left: `c.locationNotSet`.

## `register_and_tense` — 15 rows

**The two surfaces differ in register and in how they inflect status labels ('रद्द' vs 'रद्द केले').**

Neither is wrong; it is one voice decision for the product, and applying it string by string is how a product ends up with two voices.

**Your answer for this whole theme:** 

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

## `outstanding_word` — 4 rows

**Is Outstanding बाकी (web) or उधारी (app)?**

MONEY. उधारी is specifically credit given on udhaar — arguably more precise for a khata app; बाकी is the neutral 'remaining'. Six rows including common.outstanding, common.totalOutstanding and two customers-with-dues labels. The answer must be one word, and it must not collide with whatever 'Balance' (शिल्लक) becomes.

**Your answer for this whole theme:** 

### Both surfaces already say this — 4

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e6.a` | Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement. | तुमचे खाते प्रत्येक दुकानातली तुमची उधारी एका ठिकाणी दाखवते. प्रत्येक खरेदी आणि भरणा नोंदला जातो, त्यामुळे तुमची शिल्लक नेहमी माहीत असते आणि तपशील पाहता किंवा डाउनलोड करता येतो. |
| `common.outstanding` / `ins.outstanding` | Outstanding | उधारी |
| `dash.customersWithDues` | Customers with dues | उधारी असलेले ग्राहक |
| `ins.outstandingByAge` | Outstanding by age | किती दिवसांची उधारी |

## `pay_verb` — 3 rows

**Is pay भरणे (app) or देणे (web)?**

Both are ordinary Marathi for paying. The app is consistent on भर-, the web on दे-. It runs through the FAQ answers and c.payOnline, and a product should use one verb for one action.

**Your answer for this whole theme:** 

### Both surfaces already say this — 3

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e5.a` | You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later. | तुम्ही खात्यावर (उधार), ऑनलाइन, किंवा रोख भरू शकता. खात्यावर घेतले तर ती रक्कम त्या दुकानातल्या तुमच्या चालू शिल्लकीत जमा होते, नंतर फेडता येते. |
| `chelp.e5.q` | How do I pay for an order? | ऑर्डरचे पैसे कसे भरायचे? |
| `ref.title` | Invite & earn | निमंत्रण द्या आणि कमवा |

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

## `cart_word` — 1 rows

**Your answer for this whole theme:** 

### Both surfaces already say this — 1

No choice to make between them. The question is only whether the wording is right.

| key | English | both |
|---|---|---|
| `chelp.e3.a` | Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it. | दुकान उघडा, हव्या त्या वस्तू कार्टमध्ये टाका, स्वतः घेऊन जाणे की डिलिव्हरी निवडा, आणि ऑर्डर करा दाबा. दुकानाला तुमची ऑर्डर मिळते आणि ते ती निश्चित करतात. |

