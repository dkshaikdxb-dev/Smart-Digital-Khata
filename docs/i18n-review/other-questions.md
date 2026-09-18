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

## `consumer-faq-app-variants` — 40 strings

**The consumer app answers chelp.e1, e8 and e9 in its own words, because the web's answers describe controls this app does not have.**

- `chelp.e1.a` · English · app/consumer — Open the Shops tab and type a shop name or your city in the search box. If you see the 🎤 microphone, tap it and say the name instead of typing.
- `chelp.e8.a` · English · app/consumer — Open the Account tab and pick your language under Language — the app remembers it on this phone. If you see the 🎤 microphone, tap it to search by voice. Wherever you see 🔊, tap it to have the text read aloud, and tap it again to stop.
- `chelp.e9.q` · English · app/consumer — Can I change how the app looks?
- `chelp.e9.a` · English · app/consumer — The app uses one dark screen everywhere, so there is nothing to switch. If your connection is slow or costly, open the Account tab and turn on Data saver to stop extra photos loading.
- `chelp.e1.a` · Hindi · app/consumer — दुकानें टैब खोलें और सर्च बॉक्स में दुकान का नाम या अपना शहर लिखें। अगर 🎤 माइक दिखे, तो उसे दबाकर टाइप करने के बजाय नाम बोलें।
- `chelp.e8.a` · Hindi · app/consumer — अकाउंट टैब खोलें और भाषा में अपनी भाषा चुनें — ऐप इसे इस फ़ोन पर याद रखता है। अगर 🎤 माइक दिखे, तो बोलकर खोजने के लिए उसे दबाएं। जहां भी 🔊 दिखे, उसे दबाने पर लिखा हुआ पढ़कर सुनाया जाता है; रोकने के लिए दोबारा दबाएं।
- `chelp.e9.q` · Hindi · app/consumer — क्या मैं ऐप का रूप बदल सकता हूँ?
- `chelp.e9.a` · Hindi · app/consumer — ऐप हर जगह एक ही गहरी स्क्रीन इस्तेमाल करता है, इसलिए बदलने के लिए कुछ नहीं है। अगर आपका कनेक्शन धीमा या महँगा है, तो अकाउंट टैब खोलकर डेटा सेवर चालू करें ताकि अतिरिक्त फ़ोटो लोड न हों।
- `chelp.e1.a` · Bengali · app/consumer — দোকান ট্যাব খুলুন এবং সার্চ বক্সে দোকানের নাম বা আপনার শহর লিখুন। যদি 🎤 মাইক দেখতে পান, সেটি চেপে টাইপ করার বদলে নাম বলুন।
- `chelp.e8.a` · Bengali · app/consumer — অ্যাকাউন্ট ট্যাব খুলুন এবং ভাষা-য় আপনার ভাষা বেছে নিন — অ্যাপ এটি এই ফোনে মনে রাখে। যদি 🎤 মাইক দেখতে পান, বলে খুঁজতে সেটি চাপুন। যেখানেই 🔊 দেখবেন, সেটি চাপলে লেখাটি পড়ে শোনানো হয়; থামাতে আবার চাপুন।
- `chelp.e9.q` · Bengali · app/consumer — আমি কি অ্যাপের চেহারা বদলাতে পারি?
- `chelp.e9.a` · Bengali · app/consumer — অ্যাপ সব জায়গায় একটিই গাঢ় স্ক্রিন ব্যবহার করে, তাই বদলানোর কিছু নেই। আপনার কানেকশন ধীর বা খরচসাপেক্ষ হলে অ্যাকাউন্ট ট্যাব খুলে ডেটা সেভার চালু করুন, যাতে বাড়তি ছবি লোড না হয়।
- `chelp.e1.a` · Tamil · app/consumer — கடைகள் தாவலைத் திறந்து, தேடல் பெட்டியில் கடையின் பெயரையோ உங்கள் ஊரையோ தட்டச்சு செய்யுங்கள். 🎤 மைக் தெரிந்தால், அதை அழுத்தி தட்டச்சு செய்வதற்குப் பதிலாகப் பெயரைச் சொல்லுங்கள்.
- `chelp.e8.a` · Tamil · app/consumer — சுயவிவரம் தாவலைத் திறந்து, மொழி-யில் உங்கள் மொழியைத் தேர்ந்தெடுங்கள் — ஆப் அதை இந்த ஃபோனில் நினைவில் வைக்கும். 🎤 மைக் தெரிந்தால், குரலில் தேட அதை அழுத்துங்கள். எங்கெல்லாம் 🔊 தெரிகிறதோ, அதை அழுத்தினால் எழுத்து வாசித்துக் காட்டப்படும்; நிறுத்த மீண்டும் அழுத்துங்கள்.
- `chelp.e9.q` · Tamil · app/consumer — ஆப் தோற்றத்தை மாற்ற முடியுமா?
- `chelp.e9.a` · Tamil · app/consumer — ஆப் எல்லா இடத்திலும் ஒரே இருண்ட திரையையே பயன்படுத்துகிறது, எனவே மாற்ற ஒன்றுமில்லை. உங்கள் இணைப்பு மெதுவாகவோ விலை அதிகமாகவோ இருந்தால், சுயவிவரம் தாவலைத் திறந்து டேட்டா சேவர் ஆன் செய்யுங்கள்; கூடுதல் படங்கள் ஏற்றப்படாது.
- `chelp.e1.a` · Telugu · app/consumer — దుకాణాలు ట్యాబ్ తెరిచి, సెర్చ్ బాక్స్‌లో దుకాణం పేరు లేదా మీ నగరం టైప్ చేయండి. 🎤 మైక్ కనిపిస్తే, దాన్ని నొక్కి టైప్ చేయడానికి బదులు పేరు చెప్పండి.
- `chelp.e8.a` · Telugu · app/consumer — ప్రొఫైల్ ట్యాబ్ తెరిచి, భాష లో మీ భాషను ఎంచుకోండి — యాప్ దీన్ని ఈ ఫోన్‌లో గుర్తుంచుకుంటుంది. 🎤 మైక్ కనిపిస్తే, మాట్లాడి వెతకడానికి దాన్ని నొక్కండి. ఎక్కడ 🔊 కనిపించినా, దాన్ని నొక్కితే రాసినది చదివి వినిపిస్తుంది; ఆపడానికి మళ్లీ నొక్కండి.
- `chelp.e9.q` · Telugu · app/consumer — యాప్ కనిపించే తీరును మార్చగలనా?
- `chelp.e9.a` · Telugu · app/consumer — యాప్ అంతటా ఒకే ముదురు స్క్రీన్ వాడుతుంది, కాబట్టి మార్చడానికి ఏమీ లేదు. మీ కనెక్షన్ నెమ్మదిగా లేదా ఖరీదుగా ఉంటే, ప్రొఫైల్ ట్యాబ్ తెరిచి డేటా సేవర్ ఆన్ చేయండి; అదనపు ఫోటోలు లోడ్ కావు.
- `chelp.e1.a` · Kannada · app/consumer — ಅಂಗಡಿಗಳು ಟ್ಯಾಬ್ ತೆರೆದು, ಸರ್ಚ್ ಬಾಕ್ಸ್‌ನಲ್ಲಿ ಅಂಗಡಿಯ ಹೆಸರು ಅಥವಾ ನಿಮ್ಮ ಊರನ್ನು ಟೈಪ್ ಮಾಡಿ. 🎤 ಮೈಕ್ ಕಂಡರೆ, ಅದನ್ನು ಒತ್ತಿ ಟೈಪ್ ಮಾಡುವ ಬದಲು ಹೆಸರು ಹೇಳಿ.
- `chelp.e8.a` · Kannada · app/consumer — ಪ್ರೊಫೈಲ್ ಟ್ಯಾಬ್ ತೆರೆದು, ಭಾಷೆ ಯಲ್ಲಿ ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ — ಆ್ಯಪ್ ಇದನ್ನು ಈ ಫೋನ್‌ನಲ್ಲಿ ನೆನಪಿಡುತ್ತದೆ. 🎤 ಮೈಕ್ ಕಂಡರೆ, ಧ್ವನಿಯಿಂದ ಹುಡುಕಲು ಅದನ್ನು ಒತ್ತಿ. ಎಲ್ಲಿ 🔊 ಕಂಡರೂ, ಅದನ್ನು ಒತ್ತಿದರೆ ಬರಹವನ್ನು ಓದಿ ಕೇಳಿಸಲಾಗುತ್ತದೆ; ನಿಲ್ಲಿಸಲು ಮತ್ತೆ ಒತ್ತಿ.
- `chelp.e9.q` · Kannada · app/consumer — ಆ್ಯಪ್ ಕಾಣುವ ರೀತಿಯನ್ನು ಬದಲಾಯಿಸಬಹುದೇ?
- `chelp.e9.a` · Kannada · app/consumer — ಆ್ಯಪ್ ಎಲ್ಲೆಡೆ ಒಂದೇ ಕಡುಬಣ್ಣದ ಪರದೆಯನ್ನು ಬಳಸುತ್ತದೆ, ಆದ್ದರಿಂದ ಬದಲಾಯಿಸಲು ಏನೂ ಇಲ್ಲ. ನಿಮ್ಮ ಕನೆಕ್ಷನ್ ನಿಧಾನ ಅಥವಾ ದುಬಾರಿಯಾಗಿದ್ದರೆ, ಪ್ರೊಫೈಲ್ ಟ್ಯಾಬ್ ತೆರೆದು ಡೇಟಾ ಸೇವರ್ ಆನ್ ಮಾಡಿ; ಹೆಚ್ಚುವರಿ ಫೋಟೋಗಳು ಲೋಡ್ ಆಗುವುದಿಲ್ಲ.
- `chelp.e1.a` · Malayalam · app/consumer — കടകൾ ടാബ് തുറന്ന്, സെർച്ച് ബോക്സിൽ കടയുടെ പേരോ നിങ്ങളുടെ നഗരമോ ടൈപ്പ് ചെയ്യുക. 🎤 മൈക്ക് കണ്ടാൽ, അത് അമർത്തി ടൈപ്പ് ചെയ്യുന്നതിന് പകരം പേര് പറയുക.
- `chelp.e8.a` · Malayalam · app/consumer — അക്കൗണ്ട് ടാബ് തുറന്ന്, ഭാഷ-യിൽ നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക — ആപ്പ് അത് ഈ ഫോണിൽ ഓർത്തുവെക്കും. 🎤 മൈക്ക് കണ്ടാൽ, ശബ്ദത്തിലൂടെ തിരയാൻ അത് അമർത്തുക. എവിടെ 🔊 കണ്ടാലും, അത് അമർത്തിയാൽ എഴുത്ത് വായിച്ചു കേൾപ്പിക്കും; നിർത്താൻ വീണ്ടും അമർത്തുക.
- `chelp.e9.q` · Malayalam · app/consumer — ആപ്പിന്റെ കാഴ്ച മാറ്റാൻ കഴിയുമോ?
- `chelp.e9.a` · Malayalam · app/consumer — ആപ്പ് എല്ലായിടത്തും ഒരേ ഇരുണ്ട സ്ക്രീൻ ഉപയോഗിക്കുന്നു, അതിനാൽ മാറ്റാൻ ഒന്നുമില്ല. നിങ്ങളുടെ കണക്ഷൻ പതുക്കെയോ ചെലവേറിയതോ ആണെങ്കിൽ, അക്കൗണ്ട് ടാബ് തുറന്ന് ഡാറ്റാ സേവർ ഓൺ ചെയ്യുക; അധിക ഫോട്ടോകൾ ലോഡ് ആകില്ല.
- `chelp.e1.a` · Marathi · app/consumer — दुकाने टॅब उघडा आणि सर्च बॉक्समध्ये दुकानाचे नाव किंवा तुमचे शहर लिहा. 🎤 माइक दिसला तर तो दाबून टाइप करण्याऐवजी नाव बोला.
- `chelp.e8.a` · Marathi · app/consumer — अकाउंट टॅब उघडा आणि भाषा मध्ये तुमची भाषा निवडा — ॲप ती या फोनवर लक्षात ठेवते. 🎤 माइक दिसला तर बोलून शोधण्यासाठी तो दाबा. जिथे 🔊 दिसेल तिथे तो दाबल्यावर मजकूर वाचून ऐकवला जातो; थांबवण्यासाठी पुन्हा दाबा.
- `chelp.e9.q` · Marathi · app/consumer — ॲप कसे दिसते ते बदलता येईल का?
- `chelp.e9.a` · Marathi · app/consumer — ॲप सगळीकडे एकच गडद स्क्रीन वापरते, त्यामुळे बदलण्यासारखे काही नाही. तुमचे कनेक्शन मंद किंवा महाग असेल तर अकाउंट टॅब उघडून डेटा सेव्हर चालू करा; म्हणजे जादा फोटो लोड होणार नाहीत.
- `chelp.e1.a` · Gujarati · app/consumer — દુકાનો ટૅબ ખોલો અને સર્ચ બૉક્સમાં દુકાનનું નામ કે તમારું શહેર લખો. 🎤 માઇક દેખાય તો તેને દબાવીને ટાઇપ કરવાને બદલે નામ બોલો.
- `chelp.e8.a` · Gujarati · app/consumer — એકાઉન્ટ ટૅબ ખોલો અને ભાષા માં તમારી ભાષા પસંદ કરો — ઍપ એને આ ફોન પર યાદ રાખે છે. 🎤 માઇક દેખાય તો બોલીને શોધવા તેને દબાવો. જ્યાં પણ 🔊 દેખાય, તેને દબાવતાં લખાણ વાંચીને સંભળાવાય છે; રોકવા ફરી દબાવો.
- `chelp.e9.q` · Gujarati · app/consumer — ઍપ કેવી દેખાય છે તે બદલી શકાય?
- `chelp.e9.a` · Gujarati · app/consumer — ઍપ બધે એક જ ઘેરી સ્ક્રીન વાપરે છે, એટલે બદલવા જેવું કંઈ નથી. તમારું કનેક્શન ધીમું કે મોંઘું હોય તો એકાઉન્ટ ટૅબ ખોલીને ડેટા સેવર ચાલુ કરો; જેથી વધારાના ફોટા લોડ ન થાય.
- `chelp.e1.a` · Urdu · app/consumer — دکانیں ٹیب کھولیں اور سرچ باکس میں دکان کا نام یا اپنا شہر لکھیں۔ اگر 🎤 مائیک نظر آئے تو اسے دبا کر ٹائپ کرنے کے بجائے نام بولیں۔
- `chelp.e8.a` · Urdu · app/consumer — اکاؤنٹ ٹیب کھولیں اور زبان میں اپنی زبان چنیں — ایپ اسے اس فون پر یاد رکھتا ہے۔ اگر 🎤 مائیک نظر آئے تو بول کر تلاش کرنے کے لیے اسے دبائیں۔ جہاں بھی 🔊 نظر آئے، اسے دبانے پر تحریر پڑھ کر سنائی جاتی ہے؛ روکنے کے لیے دوبارہ دبائیں۔
- `chelp.e9.q` · Urdu · app/consumer — کیا میں ایپ کی شکل بدل سکتا ہوں؟
- `chelp.e9.a` · Urdu · app/consumer — ایپ ہر جگہ ایک ہی گہری اسکرین استعمال کرتا ہے، اس لیے بدلنے کے لیے کچھ نہیں۔ اگر آپ کا کنیکشن سست یا مہنگا ہے تو اکاؤنٹ ٹیب کھول کر ڈیٹا سیور آن کریں؛ تاکہ اضافی تصویریں لوڈ نہ ہوں۔

**Your answer:** 

