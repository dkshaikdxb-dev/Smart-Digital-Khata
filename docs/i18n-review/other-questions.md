# The other open questions

These are not per-language row lists — each is one question, sometimes across several
languages. The biggest by far is the consumer FAQ: 36 translations written by a machine
and read by nobody who speaks the language.

## `gu-accepted-wording` — 4 strings

**Is the current Gujarati word for 'Accepted' the right one?**

It appears in NEITHER surface's prior history — it is a word a decision introduced, and no native speaker has read it. The FORM rule (bare in chips) is locked; the WORDING is not.

- `ostatus.accepted` · Gujarati · web — સ્વીકારેલ
- `dash.orderStatus.accepted` · Gujarati · web — સ્વીકારેલ
- `ostatus.accepted` · Gujarati · app/consumer — સ્વીકારેલ
- `ostatus.accepted` · Gujarati · app/owner — સ્વીકારેલ

**Your answer:** 

## `gu-out-for-delivery-form` — 5 strings

**'Out for delivery' has no bare Gujarati form in the corpus — one candidate is masculine, the other neuter, neither is uninflected.**

Applying the bare-chip rule here would mean inventing a word, which is what produced gu-accepted-wording. Left as it stands rather than invented.

- `ostatus.out_for_delivery` · Gujarati · web — ડિલિવરી માટે નીકળ્યો
- `dash.orderStatus.out_for_delivery` · Gujarati · web — ડિલિવરી માટે નીકળ્યો
- `status.out_for_delivery` · Gujarati · web — ડિલિવરી માટે નીકળ્યું
- `ostatus.out_for_delivery` · Gujarati · app/consumer — ડિલિવરી માટે નીકળ્યો
- `ostatus.out_for_delivery` · Gujarati · app/owner — ડિલિવરી માટે નીકળ્યો

**Your answer:** 

## `status-mentions-in-prose` — 3 strings

**chelp.e7.a names order states inside a sentence, and the words it uses do not match the chips.**

The gu web prose uses a Latin loan where the chip uses the Gujarati word; the mr prose uses the Sanskritic form that mr-status-register just replaced in the chips. Rewriting prose is not the same decision as fixing a chip, and neither gu-status-form nor mr-status-register claims it.

- `chelp.e7.a` · Gujarati · web — ઑર્ડર ટૅબ ખોલો અને દરેક ઑર્ડરને પેન્ડિંગથી મંજૂર, પછી તૈયાર કે પૂરો થતો જુઓ. દરેક પગલે તમને અપડેટ મળે છે.
- `chelp.e7.a` · Marathi · web — ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबितपासून मंजूर, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते.
- `chelp.e7.a` · Marathi · app/consumer — ऑर्डर टॅब उघडा आणि प्रत्येक ऑर्डर प्रलंबित पासून स्वीकारले, मग तयार किंवा पूर्ण होताना पाहा. प्रत्येक टप्प्यावर तुम्हाला अपडेट मिळते.

**Your answer:** 

## `rangeEmpty-rewording` — 0 strings

**cat.rangeEmpty needed a rewrite, not a word swap, because the substituted noun left a phrase that did not parse.**

The repair in product-item-grammar is a judgement about what 'Your range is empty' should say in gu and mr, not a mechanical fix. Applied to clear the defect; the wording still wants a native speaker.

**Your answer:** 

## `razorpay-casing-other-languages` — 40 strings

**ta, te, kn, ml and ur all transliterate the Razorpay credential terms, as hi did before this round.**

Out of the stated scope of razorpay-casing. Applying it by cross-language analogy is exactly the implicit override the freeze forbids.

- `set.noKeySecret` · Tamil · web — கீ சீக்ரெட் இல்லை
- `set.noWebhookSecret` · Tamil · web — வெப்ஹுக் சீக்ரெட் இல்லை
- `set.keySecretSet` · Tamil · web — கீ சீக்ரெட் அமைக்கப்பட்டது
- `set.webhookSecretSet` · Tamil · web — வெப்ஹுக் சீக்ரெட் அமைக்கப்பட்டது
- `set.noKeySecret` · Telugu · web — కీ సీక్రెట్ లేదు
- `set.noWebhookSecret` · Telugu · web — వెబ్‌హుక్ సీక్రెట్ లేదు
- `set.keySecretSet` · Telugu · web — కీ సీక్రెట్ సెట్ చేయబడింది
- `set.webhookSecretSet` · Telugu · web — వెబ్‌హుక్ సీక్రెట్ సెట్ చేయబడింది
- `set.noKeySecret` · Kannada · web — ಕೀ ಸೀಕ್ರೆಟ್ ಇಲ್ಲ
- `set.noWebhookSecret` · Kannada · web — ವೆಬ್‌ಹುಕ್ ಸೀಕ್ರೆಟ್ ಇಲ್ಲ
- `set.keySecretSet` · Kannada · web — ಕೀ ಸೀಕ್ರೆಟ್ ಹೊಂದಿಸಲಾಗಿದೆ
- `set.webhookSecretSet` · Kannada · web — ವೆಬ್‌ಹುಕ್ ಸೀಕ್ರೆಟ್ ಹೊಂದಿಸಲಾಗಿದೆ
- `set.noKeySecret` · Malayalam · web — കീ സീക്രട്ട് ഇല്ല
- `set.noWebhookSecret` · Malayalam · web — വെബ്‌ഹുക്ക് സീക്രട്ട് ഇല്ല
- `set.keySecretSet` · Malayalam · web — കീ സീക്രട്ട് സജ്ജമാക്കി
- `set.webhookSecretSet` · Malayalam · web — വെബ്‌ഹുക്ക് സീക്രട്ട് സജ്ജമാക്കി
- `set.noKeySecret` · Urdu · web — کوئی کی سیکریٹ نہیں
- `set.noWebhookSecret` · Urdu · web — کوئی ویب ہک سیکریٹ نہیں
- `set.keySecretSet` · Urdu · web — کی سیکریٹ مقرر ہے
- `set.webhookSecretSet` · Urdu · web — ویب ہک سیکریٹ مقرر ہے
- `set.noKeySecret` · Tamil · app/owner — கீ சீக்ரெட் இல்லை
- `set.noWebhookSecret` · Tamil · app/owner — வெப்ஹுக் சீக்ரெட் இல்லை
- `set.keySecretSet` · Tamil · app/owner — கீ சீக்ரெட் அமைக்கப்பட்டது
- `set.webhookSecretSet` · Tamil · app/owner — வெப்ஹுக் சீக்ரெட் அமைக்கப்பட்டது
- `set.noKeySecret` · Telugu · app/owner — కీ సీక్రెట్ లేదు
- `set.noWebhookSecret` · Telugu · app/owner — వెబ్‌హుక్ సీక్రెట్ లేదు
- `set.keySecretSet` · Telugu · app/owner — కీ సీక్రెట్ సెట్ చేయబడింది
- `set.webhookSecretSet` · Telugu · app/owner — వెబ్‌హుక్ సీక్రెట్ సెట్ చేయబడింది
- `set.noKeySecret` · Kannada · app/owner — ಕೀ ಸೀಕ್ರೆಟ್ ಇಲ್ಲ
- `set.noWebhookSecret` · Kannada · app/owner — ವೆಬ್‌ಹುಕ್ ಸೀಕ್ರೆಟ್ ಇಲ್ಲ
- `set.keySecretSet` · Kannada · app/owner — ಕೀ ಸೀಕ್ರೆಟ್ ಹೊಂದಿಸಲಾಗಿದೆ
- `set.webhookSecretSet` · Kannada · app/owner — ವೆಬ್‌ಹುಕ್ ಸೀಕ್ರೆಟ್ ಹೊಂದಿಸಲಾಗಿದೆ
- `set.noKeySecret` · Malayalam · app/owner — കീ സീക്രട്ട് ഇല്ല
- `set.noWebhookSecret` · Malayalam · app/owner — വെബ്‌ഹുക്ക് സീക്രട്ട് ഇല്ല
- `set.keySecretSet` · Malayalam · app/owner — കീ സീക്രട്ട് സജ്ജമാക്കി
- `set.webhookSecretSet` · Malayalam · app/owner — വെബ്‌ഹുക്ക് സീക്രട്ട് സജ്ജമാക്കി
- `set.noKeySecret` · Urdu · app/owner — کوئی کی سیکریٹ نہیں
- `set.noWebhookSecret` · Urdu · app/owner — کوئی ویب ہک سیکریٹ نہیں
- `set.keySecretSet` · Urdu · app/owner — کی سیکریٹ مقرر ہے
- `set.webhookSecretSet` · Urdu · app/owner — ویب ہک سیکریٹ مقرر ہے

**Your answer:** 

## `whatsapp-latin-urdu` — 2 strings

**Urdu renders WhatsApp in the Urdu script in two login strings.**

whatsapp-latin scopes itself to bn, gu, mr and hi. Extending it to ur by analogy is the implicit override the freeze forbids — and Urdu is right-to-left, so an embedded Latin word is a typographic decision, not just a spelling one.

- `login.otpHint` · Urdu · app/consumer — ہم واٹس ایپ پر 6 ہندسوں کا کوڈ بھیجیں گے۔
- `login.heroSub` · Urdu · app/consumer — اپنے فون سے سائن ان کریں۔ ہم واٹس ایپ پر کوڈ بھیجتے ہیں — کوئی پاس ورڈ یاد رکھنے کی ضرورت نہیں۔

**Your answer:** 

