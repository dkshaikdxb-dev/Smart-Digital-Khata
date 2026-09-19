# The other open questions

These are not per-language row lists — each is one question, sometimes across several
languages. The biggest by far is the consumer FAQ: 36 translations written by a machine
and read by nobody who speaks the language.

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

