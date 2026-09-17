# Gujarati web/app reconciliation — decision ledger

Built before anything was applied, and read BY the apply step: a row this
file does not name is not touched, in either direction.

| | rows |
|---|---|
| divergences found | 131 |
| take the app string | 7 |
| keep the web string | 1 |
| await a Gujarati reader | 123 |

## Applied — take the app string

### `c.codePlaceholder`
- en:  6-digit code
- web: ૬-અંકનો કોડ
- app: 6 અંકનો કોડ  _(i18n:login.codePlaceholder)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: The web writes ૬ — a Gujarati digit. Every number this app renders comes from the code in Latin, so a native digit sits beside Latin ones on the same screen. The app is right.
- flags: !! NUMBERS

### `dash.network.age0`
- en:  0–30 days
- web: ૦–૩૦ દિવસ
- app: 0–30 દિવસ  _(i18n:ins.age_0_30)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits ૦–૩૦ on the web; the app has 0–30. Same rule.
- flags: !! NUMBERS

### `dash.network.age30`
- en:  31–60 days
- web: ૩૧–૬૦ દિવસ
- app: 31–60 દિવસ  _(i18n:ins.age_31_60)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits on the web; the app has Latin. Same rule.
- flags: !! NUMBERS

### `ins.age_0_30`
- en:  0–30 days
- web: ૦–૩૦ દિવસ
- app: 0–30 દિવસ  _(i18n:ins.age_0_30)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits on the web; the app has Latin. Same rule.
- flags: !! NUMBERS

### `ins.age_31_60`
- en:  31–60 days
- web: ૩૧–૬૦ દિવસ
- app: 31–60 દિવસ  _(i18n:ins.age_31_60)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits on the web; the app has Latin. Same rule.
- flags: !! NUMBERS

### `ins.age_61_90`
- en:  61–90 days
- web: ૬૧–૯૦ દિવસ
- app: 61–90 દિવસ  _(i18n:ins.age_61_90)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits on the web; the app has Latin. Same rule.
- flags: !! NUMBERS

### `ins.age_90_plus`
- en:  90+ days
- web: ૯૦+ દિવસ
- app: 90+ દિવસ  _(i18n:ins.age_90_plus)_
- class: **C**  ·  decision: **app**
- confidence: high  ·  native review: no
- reason: Gujarati digits on the web; the app has Latin. Same rule.
- flags: !! NUMBERS


## Applied — keep the web string

### `chelp.e7.a`
- en:  Open the Orders tab to see each order move from pending to approved, then to ready or completed. You get an update at every step.
- web: ઑર્ડર ટૅબ ખોલો અને દરેક ઑર્ડરને પેન્ડિંગથી મંજૂર, પછી તૈયાર કે પૂરો થતો જુઓ. દરેક પગલે તમને અપડેટ મળે છે.
- app: ઓર્ડર ટેબ ખોલો અને દરેક ઓર્ડર બાકીથી સ્વીકાર્યો, પછી તૈયાર કે પૂરો થતો જુઓ. દરેક તબક્કે તમને અપડેટ મળે છે.  _(i18n:chelp.e7.a)_
- class: **C**  ·  decision: **web**
- confidence: high  ·  native review: yes
- reason: The app conflates two different things and misuses a money word. English: 'each order move from pending to approved'. The app renders APPROVED as સ્વીકાર્યો (accepted) — this product treats accept and approve as separate steps — and PENDING as બાકી, which in this app means money outstanding. The web has મંજૂર (approved) and પેન્ડિંગ (pending) and is correct.
- flags: !! ACCEPT, !! APPROVE, !! PENDING


## Awaiting a Gujarati reader

Grouped into themes in scripts/gu-reconcile-decisions.json: about eight
questions, not one per row. The web string stays live until answered.

### `acc.dob`
- en:  Date of birth
- web: જન્મતારીખ
- app: જન્મ તારીખ  _(i18n:account.dob)_
- class: **B**  ·  decision: **review**

### `acc.genderUnset`
- en:  Not set
- web: સેટ નથી
- app: આપ્યું નથી  _(i18n:account.genderUnset)_
- class: **B**  ·  decision: **review**

### `acc.loadError`
- en:  Could not load your profile.
- web: તમારી પ્રોફાઇલ લોડ થઈ શકી નહીં.
- app: તમારી પ્રોફાઇલ લોડ થઈ શકી નથી.  _(i18n:account.loadError)_
- class: **B**  ·  decision: **review**

### `acc.logout`
- en:  Log out
- web: લૉગ આઉટ
- app: લોગ આઉટ  _(i18n:account.logout)_
- class: **B**  ·  decision: **review**

### `acc.optional`
- en:  optional
- web: મરજિયાત
- app: વૈકલ્પિક  _(i18n:account.optional)_
- class: **B**  ·  decision: **review**

### `acc.phoneReadonly`
- en:  Phone is your login ID and cannot be changed here.
- web: ફોન એ તમારો લૉગિન આઈડી છે અને અહીં બદલી શકાતો નથી.
- app: ફોન એ જ તમારું લોગિન આઈડી છે, અહીં બદલી શકાતું નથી.  _(i18n:account.phoneReadonly)_
- class: **B**  ·  decision: **review**

### `c.cancelling`
- en:  Cancelling…
- web: રદ થાય છે…
- app: રદ થઈ રહ્યો છે…  _(i18n:orderdetail.cancelling)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `c.cartEmpty`
- en:  Your cart is empty.
- web: તમારી કાર્ટ ખાલી છે.
- app: તમારી ટોપલી ખાલી છે.  _(i18n:cart.empty)_
- class: **B**  ·  decision: **review**

### `c.enterCodeSentTo`
- en:  Enter the code sent to {phone}
- web: {phone} પર મોકલેલો કોડ લખો
- app: {phone} પર મોકલેલો કોડ દાખલ કરો  _(i18n:login.enterCode)_
- class: **B**  ·  decision: **review**

### `c.loadingCatalog`
- en:  Loading catalog…
- web: કૅટલૉગ લોડ થાય છે…
- app: યાદી લોડ થઈ રહી છે…  _(i18n:shopdetail.loading)_
- class: **C**  ·  decision: **review**
- flags: !! CATALOGUE

### `c.loadingOrder`
- en:  Loading order…
- web: ઑર્ડર લોડ થાય છે…
- app: ઓર્ડર લોડ થઈ રહ્યો છે…  _(i18n:orderdetail.loading)_
- class: **B**  ·  decision: **review**

### `c.loadingShops`
- en:  Loading shops…
- web: દુકાનો લોડ થાય છે…
- app: દુકાનો લોડ થઈ રહી છે…  _(i18n:shops.loading)_
- class: **B**  ·  decision: **review**

### `c.locationNotSet`
- en:  Location not set
- web: સ્થાન સેટ નથી
- app: લોકેશન નથી  _(i18n:shops.noLocation)_
- class: **B**  ·  decision: **review**

### `c.myOrders`
- en:  My orders
- web: મારા ઑર્ડર
- app: મારા ઓર્ડર  _(i18n:orders.title)_
- class: **A** (orthography only)  ·  decision: **review**

### `c.noShops`
- en:  No shops found. Try a different search.
- web: કોઈ દુકાન મળી નથી. બીજી રીતે શોધો.
- app: કોઈ દુકાન મળી નહીં. બીજી શોધ કરો.  _(i18n:shops.none)_
- class: **B**  ·  decision: **review**

### `c.notePlaceholderArrival`
- en:  e.g. call on arrival
- web: દા.ત. પહોંચતાં ફોન કરો
- app: દા.ત. પહોંચીને કૉલ કરો  _(i18n:cart.notePlaceholder)_
- class: **B**  ·  decision: **review**

### `c.opening`
- en:  Opening…
- web: ખૂલે છે…
- app: ખૂલી રહ્યું છે…  _(i18n:khata.opening)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `c.payOnline`
- en:  Pay online
- web: ઑનલાઇન ચૂકવો
- app: ઓનલાઇન ચૂકવણી  _(i18n:cart.payOnline)_
- class: **B**  ·  decision: **review**

### `c.placeOrder`
- en:  Place order
- web: ઑર્ડર કરો
- app: ઓર્ડર કરો  _(i18n:cart.placeOrder)_
- class: **A** (orthography only)  ·  decision: **review**

### `c.placing`
- en:  Placing…
- web: ઑર્ડર થાય છે…
- app: ઓર્ડર થઈ રહ્યો છે…  _(i18n:cart.placing)_
- class: **B**  ·  decision: **review**

### `c.prepaid`
- en:  Prepaid
- web: અગાઉથી ચૂકવેલ
- app: ઓનલાઇન  _(i18n:pmode.prepaid)_
- class: **C**  ·  decision: **review**
- flags: !! PAY, !! CONTENT LOST

### `c.sending`
- en:  Sending…
- web: મોકલાય છે…
- app: મોકલાઈ રહ્યું છે…  _(i18n:login.sending)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `c.unit`
- en:  unit
- web: એકમ
- app: નંગ  _(i18n:shopdetail.unit)_
- class: **B**  ·  decision: **review**

### `c.verifyContinue`
- en:  Verify & continue
- web: ચકાસો અને આગળ વધો
- app: ચકાસીને આગળ વધો  _(i18n:login.verify)_
- class: **B**  ·  decision: **review**

### `c.verifying`
- en:  Verifying…
- web: ચકાસાય છે…
- app: ચકાસાઈ રહ્યું છે…  _(i18n:login.verifying)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `c.yourCart`
- en:  Your cart
- web: તમારી કાર્ટ
- app: તમારી ટોપલી  _(i18n:cart.title)_
- class: **B**  ·  decision: **review**

### `cat.addFromCatalogue`
- en:  Add from catalogue
- web: કૅટલૉગમાંથી ઉમેરો
- app: યાદીમાંથી ઉમેરો  _(i18n:cat.addFromCatalogue)_
- class: **C**  ·  decision: **review**
- flags: !! CATALOGUE

### `cat.addProduct`
- en:  Add product
- web: ઉત્પાદન ઉમેરો
- app: સામાન ઉમેરો  _(i18n:cat.addProduct)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `cat.descOptional`
- en:  Description (optional)
- web: વર્ણન (મરજિયાત)
- app: વર્ણન (વૈકલ્પિક)  _(i18n:cat.descPlaceholder)_
- class: **B**  ·  decision: **review**

### `cat.empty`
- en:  No products yet. Add your first above.
- web: હજી કોઈ ઉત્પાદન નથી. ઉપર તમારું પહેલું ઉમેરો.
- app: હજી કોઈ સામાન નથી. ઉપર પહેલો ઉમેરો.  _(i18n:cat.empty)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `cat.loadMore`
- en:  Load more
- web: વધુ લોડ કરો
- app: વધુ જુઓ  _(i18n:cat.loadMore)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `cat.noResults`
- en:  No matching items.
- web: મળતી કોઈ વસ્તુ નથી.
- app: મળતો કોઈ સામાન નથી.  _(i18n:shopdetail.noResults)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `chelp.e2.a`
- en:  Use the search bar at the top, or browse the categories. To search by voice, tap the 🎤 microphone and just say the item name.
- web: ઉપરના સર્ચ બારનો ઉપયોગ કરો, અથવા કૅટેગરીમાં જુઓ. બોલીને શોધવા 🎤 માઇક દબાવો અને વસ્તુનું નામ બોલો.
- app: ઉપરનો સર્ચ બાર વાપરો, કે શ્રેણીઓમાં જુઓ. બોલીને શોધવા 🎤 માઇક દબાવો અને સામાનનું નામ બોલો.  _(i18n:chelp.e2.a)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `chelp.e2.q`
- en:  How do I search for a product?
- web: વસ્તુ કેવી રીતે શોધવી?
- app: સામાન કેવી રીતે શોધવો?  _(i18n:chelp.e2.q)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `chelp.e3.a`
- en:  Open a shop, add the items you want to your cart, choose pickup or delivery, and tap Place order. The shop gets your order and confirms it.
- web: એક દુકાન ખોલો, જોઈતી વસ્તુઓ કાર્ટમાં ઉમેરો, પિકઅપ કે ડિલિવરી પસંદ કરો, અને ઑર્ડર કરો દબાવો. દુકાનને તમારો ઑર્ડર મળે છે અને તે તેની પુષ્ટિ કરે છે.
- app: દુકાન ખોલો, જોઈતો સામાન કાર્ટમાં નાખો, જાતે લઈ જવું કે ડિલિવરી પસંદ કરો, અને ઓર્ડર કરો દબાવો. દુકાનને તમારો ઓર્ડર મળે છે અને તે પાકો કરે છે.  _(i18n:chelp.e3.a)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `chelp.e3.q`
- en:  How do I place an order?
- web: ઑર્ડર કેવી રીતે કરવો?
- app: ઓર્ડર કેવી રીતે કરવો?  _(i18n:chelp.e3.q)_
- class: **A** (orthography only)  ·  decision: **review**

### `chelp.e4.a`
- en:  Pickup means you collect the order from the shop yourself, for free. Delivery means the shop brings it to you, sometimes with a small fee — many shops give free delivery above a set amount.
- web: પિકઅપ એટલે તમે જાતે દુકાનેથી ઑર્ડર લઈ આવો, મફત. ડિલિવરી એટલે દુકાન તમારા સુધી પહોંચાડે, ક્યારેક નાની ફી સાથે — ઘણી દુકાનો નક્કી રકમથી ઉપર મફત ડિલિવરી આપે છે.
- app: જાતે લઈ જવું એટલે તમે ઓર્ડર જાતે દુકાનેથી લઈ આવો, મફત. ડિલિવરી એટલે દુકાન તમારા સુધી પહોંચાડે, ક્યારેક નાના ચાર્જ સાથે — ઘણી દુકાનો નક્કી રકમથી ઉપર મફત ડિલિવરી આપે છે.  _(i18n:chelp.e4.a)_
- class: **B**  ·  decision: **review**

### `chelp.e4.q`
- en:  What is the difference between pickup and delivery?
- web: પિકઅપ અને ડિલિવરીમાં શું ફરક છે?
- app: જાતે લઈ જવું અને ડિલિવરીમાં શું ફરક છે?  _(i18n:chelp.e4.q)_
- class: **B**  ·  decision: **review**

### `chelp.e5.a`
- en:  You can pay on khata (udhaar), pay online, or pay cash. If you pay on khata, the amount is added to your running balance at that shop, to settle later.
- web: તમે ખાતા (ઉધાર) પર, ઑનલાઇન, કે રોકડમાં ચૂકવી શકો છો. ખાતા પર લો તો એ રકમ એ દુકાનમાં તમારા ચાલુ બાકીમાં ઉમેરાય છે, પછી ચૂકતે કરી શકો.
- app: તમે ખાતામાં (ઉધાર), ઓનલાઇન, કે રોકડ ચૂકવી શકો છો. ખાતામાં લો તો એ રકમ એ દુકાનમાં તમારા ચાલુ બાકીમાં ઉમેરાય છે, પછી ચૂકવી શકાય.  _(i18n:chelp.e5.a)_
- class: **B**  ·  decision: **review**

### `chelp.e5.q`
- en:  How do I pay for an order?
- web: ઑર્ડરના પૈસા કેવી રીતે ચૂકવવા?
- app: ઓર્ડરના પૈસા કેવી રીતે ચૂકવવા?  _(i18n:chelp.e5.q)_
- class: **A** (orthography only)  ·  decision: **review**

### `chelp.e6.a`
- en:  Your khata shows what you owe at each shop in one place. Every purchase and payment is listed, so you always know your balance and can view or download a statement.
- web: તમારું ખાતું દરેક દુકાનમાં તમારી બાકી રકમ એક જગ્યાએ બતાવે છે. દરેક ખરીદી અને ચૂકવણી નોંધાય છે, તેથી તમને હંમેશાં તમારી બાકી ખબર રહે છે, અને વિગત જોઈ કે ડાઉનલોડ કરી શકો છો.
- app: તમારું ખાતું દરેક દુકાનમાં તમારી બાકી એક જગ્યાએ બતાવે છે. દરેક ખરીદી અને ચૂકવણી નોંધાય છે, એટલે તમારું બેલેન્સ હંમેશાં ખબર રહે છે અને વિવરણ જોઈ કે ડાઉનલોડ કરી શકો છો.  _(i18n:chelp.e6.a)_
- class: **B**  ·  decision: **review**

### `chelp.e6.q`
- en:  How does my khata (udhaar) work?
- web: મારું ખાતું (ઉધાર) કેવી રીતે કામ કરે છે?
- app: મારું ખાતું (ઉધાર) કેવી રીતે ચાલે છે?  _(i18n:chelp.e6.q)_
- class: **B**  ·  decision: **review**

### `chelp.e7.q`
- en:  How do I track my order?
- web: મારો ઑર્ડર કેવી રીતે ટ્રૅક કરવો?
- app: મારો ઓર્ડર કેવી રીતે ટ્રેક કરવો?  _(i18n:chelp.e7.q)_
- class: **B**  ·  decision: **review**

### `chelp.subtitle`
- en:  Short answers for shopping, orders and your khata.
- web: ખરીદી, ઑર્ડર અને તમારા ખાતા માટે ટૂંકા જવાબ.
- app: ખરીદી, ઓર્ડર અને તમારા ખાતા માટે ટૂંકા જવાબ.  _(i18n:chelp.subtitle)_
- class: **A** (orthography only)  ·  decision: **review**

### `common.balance`
- en:  Balance
- web: બાકી
- app: બેલેન્સ  _(i18n:khata.balance)_
- class: **C**  ·  decision: **review**
- flags: !! PENDING, ~ CONTENT ADDED

### `common.creditLimit`
- en:  Credit limit
- web: ઉધાર મર્યાદા
- app: ઉધારની મર્યાદા  _(i18n:custd.creditLimit)_
- class: **B**  ·  decision: **review**

### `common.items`
- en:  Items
- web: વસ્તુઓ
- app: સામાન  _(i18n:common.items)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `common.noteOptional`
- en:  Note (optional)
- web: નોંધ (મરજિયાત)
- app: નોંધ (વૈકલ્પિક)  _(i18n:addtx.note)_
- class: **B**  ·  decision: **review**

### `common.outstanding`
- en:  Outstanding
- web: બાકી રકમ
- app: બાકી  _(i18n:ins.outstanding)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `common.remove`
- en:  Remove
- web: કાઢો
- app: દૂર કરો  _(i18n:cart.remove)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `common.subtotal`
- en:  Subtotal
- web: પેટા-કુલ
- app: ઉપ-કુલ  _(i18n:common.subtotal)_
- class: **B**  ·  decision: **review**

### `ctab.orders`
- en:  Orders
- web: ઑર્ડર
- app: ઓર્ડર  _(i18n:tab.orders)_
- class: **A** (orthography only)  ·  decision: **review**

### `dash.customersWithDues`
- en:  Customers with dues
- web: બાકીવાળા ગ્રાહકો
- app: બાકી હોય તેવા ગ્રાહક  _(i18n:dash.customersWithDues)_
- class: **B**  ·  decision: **review**

### `dash.kpi.orders`
- en:  Orders
- web: ઑર્ડર
- app: ઓર્ડર  _(i18n:tab.orders)_
- class: **A** (orthography only)  ·  decision: **review**

### `dash.orderStatus.accepted`
- en:  Accepted
- web: સ્વીકાર્યું
- app: સ્વીકાર્યો  _(i18n:ostatus.accepted)_
- class: **B**  ·  decision: **review**

### `dash.orderStatus.cancelled`
- en:  Cancelled
- web: રદ
- app: રદ થયો  _(i18n:ostatus.cancelled)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `dash.orderStatus.out_for_delivery`
- en:  Out for delivery
- web: ડિલિવરી માટે નીકળ્યું
- app: ડિલિવરી માટે નીકળ્યો  _(i18n:ostatus.out_for_delivery)_
- class: **B**  ·  decision: **review**

### `dash.orderStatus.preparing`
- en:  Preparing
- web: તૈયાર થાય છે
- app: તૈયાર થઈ રહ્યો છે  _(i18n:ostatus.preparing)_
- class: **B**  ·  decision: **review**

### `dash.revenue.family`
- en:  Family
- web: ફેમિલી
- app: પરિવાર  _(i18n:title.family)_
- class: **B**  ·  decision: **review**

### `dash.revenue.free`
- en:  Free
- web: ફ્રી
- app: મફત  _(i18n:cart.freeDelivery)_
- class: **B**  ·  decision: **review**

### `dl.customers`
- en:  Customers
- web: ગ્રાહકો
- app: ગ્રાહક  _(i18n:tab.customers)_
- class: **B**  ·  decision: **review**

### `dl.myOrders`
- en:  My orders
- web: મારા ઑર્ડર
- app: મારા ઓર્ડર  _(i18n:orders.title)_
- class: **A** (orthography only)  ·  decision: **review**

### `dl.orders`
- en:  Orders
- web: ઑર્ડર
- app: ઓર્ડર  _(i18n:tab.orders)_
- class: **A** (orthography only)  ·  decision: **review**

### `fam.combinedStatement`
- en:  Combined statement
- web: સંયુક્ત સ્ટેટમેન્ટ
- app: સંયુક્ત હિસાબ  _(i18n:famd.combinedStatement)_
- class: **B**  ·  decision: **review**

### `fam.removeConfirm`
- en:  Remove {name} from this family?
- web: {name}ને આ પરિવારમાંથી કાઢવા?
- app: {name} ને આ પરિવારમાંથી દૂર કરવા?  _(i18n:famd.removeConfirm)_
- class: **B**  ·  decision: **review**

### `fam.sendReminder`
- en:  Send WhatsApp reminder
- web: WhatsApp રિમાઇન્ડર મોકલો
- app: વોટ્સએપ પર યાદ કરાવો  _(i18n:famd.sendReminder)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `ins.activeCustomers`
- en:  Active customers
- web: સક્રિય ગ્રાહકો
- app: સક્રિય ગ્રાહક  _(i18n:ins.activeCustomers)_
- class: **B**  ·  decision: **review**

### `ins.collectionRate`
- en:  Collection rate
- web: વસૂલાત દર
- app: વસૂલીનો દર  _(i18n:ins.collectionRate)_
- class: **B**  ·  decision: **review**

### `ins.customersWithDues`
- en:  Customers with dues
- web: બાકીવાળા ગ્રાહકો
- app: બાકી હોય તેવા ગ્રાહક  _(i18n:dash.customersWithDues)_
- class: **B**  ·  decision: **review**

### `ins.outstandingByAge`
- en:  Outstanding by age
- web: સમય પ્રમાણે બાકી
- app: કેટલા દિવસની બાકી  _(i18n:ins.outstandingByAge)_
- class: **B**  ·  decision: **review**

### `log.signIn`
- en:  Sign in
- web: સાઇન ઇન
- app: સાઇન ઇન કરો  _(i18n:login.title)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `mod.loadMore`
- en:  Load more
- web: વધુ લોડ કરો
- app: વધુ જુઓ  _(i18n:cat.loadMore)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `nav.catalog`
- en:  Catalog
- web: કૅટલૉગ
- app: યાદી  _(i18n:tab.catalog)_
- class: **C**  ·  decision: **review**
- flags: !! CATALOGUE, !! CONTENT LOST

### `nav.customers`
- en:  Customers
- web: ગ્રાહકો
- app: ગ્રાહક  _(i18n:tab.customers)_
- class: **B**  ·  decision: **review**

### `nav.insights`
- en:  Insights
- web: માહિતી
- app: વિશ્લેષણ  _(i18n:title.insights)_
- class: **B**  ·  decision: **review**

### `nav.logout`
- en:  Log out
- web: લૉગ આઉટ
- app: લોગ આઉટ  _(i18n:account.logout)_
- class: **B**  ·  decision: **review**

### `nav.orders`
- en:  Orders
- web: ઑર્ડર
- app: ઓર્ડર  _(i18n:tab.orders)_
- class: **A** (orthography only)  ·  decision: **review**

### `nav.settings`
- en:  Settings
- web: સેટિંગ્સ
- app: સેટિંગ  _(i18n:title.settings)_
- class: **B**  ·  decision: **review**

### `num.changed`
- en:  Number changed. Your khata across all shops now uses the new number.
- web: નંબર બદલાયો. બધી દુકાનોમાં તમારું ખાતું હવે નવો નંબર વાપરે છે.
- app: નંબર બદલાઈ ગયો. બધી દુકાનોમાં તમારું ખાતું હવે નવા નંબર પર છે.  _(i18n:num.changed)_
- class: **B**  ·  decision: **review**

### `num.changing`
- en:  Changing…
- web: બદલાય છે…
- app: બદલાઈ રહ્યું છે…  _(i18n:num.changing)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `num.confirm`
- en:  Confirm change
- web: બદલાવ પાકો કરો
- app: ફેરફારની ખાતરી કરો  _(i18n:num.confirm)_
- class: **B**  ·  decision: **review**

### `num.enterCode`
- en:  Enter the code sent to {phone}
- web: {phone} પર મોકલેલો કોડ લખો
- app: {phone} પર મોકલેલો કોડ દાખલ કરો  _(i18n:login.enterCode)_
- class: **B**  ·  decision: **review**

### `num.sending`
- en:  Sending…
- web: મોકલાય છે…
- app: મોકલાઈ રહ્યું છે…  _(i18n:login.sending)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `ord.cancelConfirm`
- en:  Cancel this order?
- web: આ ઑર્ડર રદ કરવો?
- app: આ ઓર્ડર રદ કરવો?  _(i18n:orderdetail.cancelConfirm)_
- class: **A** (orthography only)  ·  decision: **review**

### `ord.cancelOrder`
- en:  Cancel order
- web: ઑર્ડર રદ કરો
- app: ઓર્ડર રદ કરો  _(i18n:orderdetail.cancel)_
- class: **A** (orthography only)  ·  decision: **review**

### `ord.empty`
- en:  No orders in this view yet.
- web: આ વ્યૂમાં હજી કોઈ ઑર્ડર નથી.
- app: અહીં હજી કોઈ ઓર્ડર નથી.  _(i18n:ord.empty)_
- class: **B**  ·  decision: **review**

### `ord.emptyItems`
- en:  No items on this order.
- web: આ ઑર્ડરમાં કોઈ વસ્તુ નથી.
- app: આ ઓર્ડરમાં કોઈ સામાન નથી.  _(i18n:ord.noItems)_
- class: **C**  ·  decision: **review**
- flags: !! PRODUCT

### `ord.mark`
- en:  Mark {s}
- web: {s} ચિહ્નિત કરો
- app: {s} તરીકે નોંધો  _(i18n:ord.mark)_
- class: **B**  ·  decision: **review**

### `ord.marked`
- en:  Order marked {s}.
- web: ઑર્ડર {s} ચિહ્નિત થયો.
- app: ઓર્ડર {s} નોંધાયો.  _(i18n:ord.marked)_
- class: **B**  ·  decision: **review**

### `ord.order`
- en:  Order
- web: ઑર્ડર
- app: ઓર્ડર  _(i18n:orderdetail.title)_
- class: **A** (orthography only)  ·  decision: **review**

### `ord.terminal`
- en:  This order is {s} — no further changes.
- web: આ ઑર્ડર {s} છે — વધુ કોઈ ફેરફાર નહીં.
- app: આ ઓર્ડર {s} — હવે કોઈ ફેરફાર નહીં.  _(i18n:ord.terminal)_
- class: **B**  ·  decision: **review**

### `ostatus.accepted`
- en:  Accepted
- web: સ્વીકાર્યું
- app: સ્વીકાર્યો  _(i18n:ostatus.accepted)_
- class: **B**  ·  decision: **review**

### `ostatus.cancelled`
- en:  Cancelled
- web: રદ
- app: રદ થયો  _(i18n:ostatus.cancelled)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `ostatus.out_for_delivery`
- en:  Out for delivery
- web: ડિલિવરી માટે નીકળ્યું
- app: ડિલિવરી માટે નીકળ્યો  _(i18n:ostatus.out_for_delivery)_
- class: **B**  ·  decision: **review**

### `ostatus.preparing`
- en:  Preparing
- web: તૈયાર થાય છે
- app: તૈયાર થઈ રહ્યો છે  _(i18n:ostatus.preparing)_
- class: **B**  ·  decision: **review**

### `pin.saving`
- en:  Saving…
- web: સેવ થાય છે…
- app: સેવ થઈ રહ્યું છે…  _(i18n:account.saving)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `ref.loadError`
- en:  Could not load referrals.
- web: રેફરલ લોડ થઈ શક્યા નહીં.
- app: રેફરલ લોડ થઈ શક્યા નથી.  _(i18n:ref.loadError)_
- class: **B**  ·  decision: **review**

### `ref.referredCount`
- en:  You have referred {n} so far.
- web: તમે અત્યાર સુધી {n}ને રેફર કર્યા છે.
- app: અત્યાર સુધી તમે {n} ને રેફર કર્યા છે.  _(i18n:ref.referredCount)_
- class: **B**  ·  decision: **review**

### `ref.shareLink`
- en:  Share link
- web: લિંક શેર કરો
- app: શેર લિંક  _(i18n:ref.shareLink)_
- class: **C**  ·  decision: **review**
- flags: !! CONTENT LOST

### `ref.subtitle`
- en:  Share your code. When someone joins with it, they appear here.
- web: તમારો કોડ શેર કરો. કોઈ તેની સાથે જોડાય ત્યારે અહીં દેખાય છે.
- app: તમારો કોડ શેર કરો. કોઈ તેનાથી જોડાય તો અહીં દેખાશે.  _(i18n:ref.subtitle)_
- class: **B**  ·  decision: **review**

### `ref.title`
- en:  Invite & earn
- web: આમંત્રણ આપી કમાઓ
- app: આમંત્રણ આપો ને કમાઓ  _(i18n:ref.title)_
- class: **B**  ·  decision: **review**

### `ref.type.owner`
- en:  Shop owner
- web: દુકાનમાલિક
- app: દુકાન માલિક  _(i18n:ref.type.owner)_
- class: **B**  ·  decision: **review**

### `set.customerNotifications`
- en:  Customer notifications
- web: ગ્રાહક નોટિફિકેશન
- app: ગ્રાહકનાં નોટિફિકેશન  _(i18n:set.customerNotifications)_
- class: **B**  ·  decision: **review**

### `set.discovery`
- en:  Discovery (list your shop)
- web: ડિસ્કવરી (તમારી દુકાન યાદીમાં મૂકો)
- app: શોધ (તમારી દુકાન યાદીમાં મૂકો)  _(i18n:set.discovery)_
- class: **B**  ·  decision: **review**

### `set.free`
- en:  Free
- web: ફ્રી
- app: મફત  _(i18n:cart.freeDelivery)_
- class: **B**  ·  decision: **review**

### `set.keySecretSet`
- en:  Key secret set
- web: કી સિક્રેટ સેટ છે
- app: Key secret આપેલું છે  _(i18n:set.keySecretSet)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `set.leaveBlank`
- en:  Leave blank to keep current
- web: હાલનું રાખવા ખાલી છોડો
- app: હાલનું રાખવા ખાલી રાખો  _(i18n:set.leaveBlank)_
- class: **B**  ·  decision: **review**

### `set.noKeySecret`
- en:  No key secret
- web: કોઈ કી સિક્રેટ નથી
- app: Key secret નથી  _(i18n:set.noKeySecret)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `set.noWebhookSecret`
- en:  No webhook secret
- web: કોઈ વેબહૂક સિક્રેટ નથી
- app: Webhook secret નથી  _(i18n:set.noWebhookSecret)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `set.paymentSaved`
- en:  Payment settings saved.
- web: ચૂકવણી સેટિંગ્સ સેવ થઈ.
- app: ચૂકવણી સેટિંગ સેવ થયું.  _(i18n:set.paymentSaved)_
- class: **B**  ·  decision: **review**

### `set.webhookSecretSet`
- en:  Webhook secret set
- web: વેબહૂક સિક્રેટ સેટ છે
- app: Webhook secret આપેલું છે  _(i18n:set.webhookSecretSet)_
- class: **B**  ·  decision: **review**
- flags: ~ LATIN/BRAND

### `staff.remove`
- en:  Remove
- web: કાઢો
- app: દૂર કરો  _(i18n:cart.remove)_
- class: **B**  ·  decision: **review**
- flags: ~ CONTENT ADDED

### `stmt.allShops`
- en:  All shops (combined)
- web: બધી દુકાનો (સંયુક્ત)
- app: બધી દુકાનો (સાથે)  _(i18n:stmt.allShops)_
- class: **B**  ·  decision: **review**

### `stmt.closing`
- en:  Closing balance
- web: આખરી બાકી
- app: છેલ્લું બેલેન્સ  _(i18n:stmt.closing)_
- class: **C**  ·  decision: **review**
- flags: !! PENDING, ~ CONTENT ADDED

### `stmt.combined`
- en:  Combined total
- web: સંયુક્ત કુલ
- app: બધું મળીને કુલ  _(i18n:stmt.combined)_
- class: **B**  ·  decision: **review**

### `stmt.loadError`
- en:  Could not load the statement.
- web: સ્ટેટમેન્ટ લોડ થઈ શક્યું નહીં.
- app: વિવરણ લોડ થઈ શક્યું નથી.  _(i18n:stmt.loadError)_
- class: **B**  ·  decision: **review**

### `stmt.noData`
- en:  No entries in this date range.
- web: આ તારીખ મર્યાદામાં કોઈ એન્ટ્રી નથી.
- app: આ સમયગાળામાં કોઈ એન્ટ્રી નથી.  _(i18n:stmt.noData)_
- class: **B**  ·  decision: **review**

### `stmt.opening`
- en:  Opening balance
- web: શરૂઆતની બાકી
- app: શરૂઆતનું બેલેન્સ  _(i18n:stmt.opening)_
- class: **C**  ·  decision: **review**
- flags: !! PENDING

### `stmt.pickShop`
- en:  Choose a shop
- web: એક દુકાન પસંદ કરો
- app: દુકાન પસંદ કરો  _(i18n:stmt.pickShop)_
- class: **B**  ·  decision: **review**

### `stmt.rangeError`
- en:  The From date must be on or before the To date.
- web: 'થી' તારીખ 'સુધી' તારીખની બરાબર કે પહેલાં હોવી જોઈએ.
- app: "થી" તારીખ "સુધી" તારીખ પહેલાંની કે એ જ હોવી જોઈએ.  _(i18n:stmt.rangeError)_
- class: **B**  ·  decision: **review**

### `stmt.subtitle`
- en:  Opening balance, dated entries for a range, and closing balance.
- web: શરૂઆતની બાકી, એક મર્યાદા માટે તારીખવાળી એન્ટ્રી, અને આખરી બાકી.
- app: શરૂઆતનું બેલેન્સ, સમયગાળાની તારીખવાર એન્ટ્રી, અને છેલ્લું બેલેન્સ.  _(i18n:stmt.subtitle)_
- class: **C**  ·  decision: **review**
- flags: !! PENDING

### `stmt.title`
- en:  Account statement
- web: ખાતાનું સ્ટેટમેન્ટ
- app: ખાતાનું વિવરણ  _(i18n:stmt.title)_
- class: **B**  ·  decision: **review**

### `tx.empty`
- en:  No transactions yet.
- web: હજી કોઈ વ્યવહાર નથી.
- app: હજી કોઈ લેવડદેવડ નથી.  _(i18n:custd.noTransactions)_
- class: **B**  ·  decision: **review**

