#!/usr/bin/env node
/**
 * Shop-name localization — pure, deterministic, offline, no ML, no network.
 *
 * The problem: a shop's NAME stayed in English while the rest of the app renders
 * in the customer's language, so the two were visibly out of sync. This module
 * renders an English shop name into a native script DETERMINISTICALLY, with an
 * always-available English fallback and a needs_review flag so the human-in-loop
 * (the owner override UI) can correct proper nouns.
 *
 * WHY HYBRID (dictionary + transliteration), not pure transliteration:
 *   Raw English->Indic ITRANS transliteration produces garbage for the recurring
 *   business words because English spelling is not phonetic
 *   ("Store" -> स्तोरे, "General" -> गेनेरल्, "Provision" -> प्रोविसिओन्). So we:
 *     1. NORMALIZE the closed set of recurring Indian shop words via a curated
 *        per-language BUSINESS_LEXICON (natural native script, human-picked); and
 *     2. best-effort TRANSLITERATE the remaining proper-noun tokens with
 *        @indic-transliteration/sanscript (ITRANS -> native script); and
 *     3. mark the WHOLE name needs_review=true whenever a proper-noun token had
 *        to be transliterated (fully-lexicon names stay trusted); and
 *     4. always fall back to the raw English name for en / ur / any language with
 *        no native script here.
 *   Verified: "Sri Balaji General Stores" -> श्री बलजि जनरल स्टोर;
 *             "New Bharat Provision"       -> न्यू भरत् प्रोविज़न.
 *
 * DEPENDENCY NOTE:
 *   @indic-transliteration/sanscript is a runtime `dependency` (pure JS,
 *   deterministic, no network, no ML), so it is present in production too —
 *   `npm ci --omit=dev` installs it — and the normal path ALWAYS transliterates
 *   proper nouns into native script (no English/native mix). The require is
 *   still wrapped DEFENSIVELY as a never-throw safety net: if the module somehow
 *   cannot be loaded, the util degrades to keeping the curated business words in
 *   native script, the proper-noun token verbatim, and flags the name
 *   needs_review — it never throws and never fails signup/rename. (The same
 *   library is also used by the build-time-only enrich-catalog-i18n util.)
 *
 * Nothing here performs I/O; the DB helper `reseedShopName` at the bottom is the
 * only side-effecting export and it operates purely on an injected client.
 */

// Native script per language, as understood by the transliteration engine.
// Kept identical to enrich-catalog-i18n.js so both i18n paths agree on coverage.
// Urdu (ur, Arabic script) is intentionally absent: Roman->Arabic-script is not
// reliably deterministic with these tools, so ur falls back to the English name.
const SCRIPT_BY_LANG = Object.freeze({
  hi: 'devanagari',
  ta: 'tamil',
  te: 'telugu',
  kn: 'kannada',
  ml: 'malayalam',
});

// The closed set of languages we render a native shop name into: the non-'en',
// non-'ur' languages that have a native script above. This matches the existing
// transliteration coverage (bn/gu/mr are deliberately NOT here — they have no
// script mapping and no catalog transliteration today).
const RENDER_LANGS = Object.freeze(Object.keys(SCRIPT_BY_LANG));

/**
 * BUSINESS_LEXICON — the curated, closed dictionary of recurring Indian shop
 * words, in natural native script per language. These are human-picked
 * (loanwords kept sensible) so that a name built ENTIRELY from these words needs
 * no review. Keys are the stripped, lowercased ASCII form of the word.
 *
 * The Devanagari (hi) forms are review-grade. The ta/te/kn/ml forms are natural
 * loanword spellings that a native speaker should still spot-check; the owner
 * override UI is the correction path for anything that reads awkwardly.
 */
const BUSINESS_LEXICON = Object.freeze({
  hi: Object.freeze({
    store: 'स्टोर', stores: 'स्टोर', kirana: 'किराना', general: 'जनरल',
    provision: 'प्रोविज़न', provisions: 'प्रोविज़न', traders: 'ट्रेडर्स',
    medical: 'मेडिकल', medicals: 'मेडिकल', mart: 'मार्ट', bakery: 'बेकरी',
    sweets: 'स्वीट्स', dairy: 'डेयरी', electronics: 'इलेक्ट्रॉनिक्स',
    hardware: 'हार्डवेयर', supermarket: 'सुपरमार्केट', enterprises: 'एंटरप्राइज़ेज़',
    agencies: 'एजेंसीज़', shop: 'शॉप', new: 'न्यू', sri: 'श्री', shri: 'श्री',
    super: 'सुपर', fresh: 'फ्रेश', cool: 'कूल', point: 'पॉइंट', center: 'सेंटर',
    centre: 'सेंटर', and: 'एंड',
    bazaar: 'बाज़ार', bazar: 'बाज़ार', bhandar: 'भंडार', market: 'मार्केट',
    grocery: 'ग्रोसरी', groceries: 'ग्रोसरीज़', corner: 'कॉर्नर', daily: 'डेली',
    needs: 'नीड्स', family: 'फैमिली', mini: 'मिनी', emporium: 'एम्पोरियम',
    collection: 'कलेक्शन', variety: 'वैरायटी',
  }),
  ta: Object.freeze({
    store: 'ஸ்டோர்', stores: 'ஸ்டோர்', kirana: 'கிராணா', general: 'ஜெனரல்',
    provision: 'புரோவிஷன்', provisions: 'புரோவிஷன்', traders: 'ட்ரேடர்ஸ்',
    medical: 'மெடிக்கல்', medicals: 'மெடிக்கல்', mart: 'மார்ட்', bakery: 'பேக்கரி',
    sweets: 'ஸ்வீட்ஸ்', dairy: 'டெய்ரி', electronics: 'எலக்ட்ரானிக்ஸ்',
    hardware: 'ஹார்ட்வேர்', supermarket: 'சூப்பர்மார்க்கெட்', enterprises: 'என்டர்பிரைசஸ்',
    agencies: 'ஏஜென்சீஸ்', shop: 'ஷாப்', new: 'நியூ', sri: 'ஸ்ரீ', shri: 'ஸ்ரீ',
    super: 'சூப்பர்', fresh: 'ஃப்ரெஷ்', cool: 'கூல்', point: 'பாயிண்ட்', center: 'சென்டர்',
    centre: 'சென்டர்', and: 'அண்ட்',
    bazaar: 'பஜார்', bazar: 'பஜார்', bhandar: 'பண்டார்', market: 'மார்க்கெட்',
    grocery: 'க்ரோசரி', groceries: 'க்ரோசரீஸ்', corner: 'கார்னர்', daily: 'டெய்லி',
    needs: 'நீட்ஸ்', family: 'ஃபேமிலி', mini: 'மினி', emporium: 'எம்போரியம்',
    collection: 'கலெக்ஷன்', variety: 'வெரைட்டி',
  }),
  te: Object.freeze({
    store: 'స్టోర్', stores: 'స్టోర్', kirana: 'కిరాణా', general: 'జనరల్',
    provision: 'ప్రొవిజన్', provisions: 'ప్రొవిజన్', traders: 'ట్రేడర్స్',
    medical: 'మెడికల్', medicals: 'మెడికల్', mart: 'మార్ట్', bakery: 'బేకరీ',
    sweets: 'స్వీట్స్', dairy: 'డెయిరీ', electronics: 'ఎలక్ట్రానిక్స్',
    hardware: 'హార్డ్వేర్', supermarket: 'సూపర్మార్కెట్', enterprises: 'ఎంటర్ప్రైజెస్',
    agencies: 'ఏజెన్సీస్', shop: 'షాప్', new: 'న్యూ', sri: 'శ్రీ', shri: 'శ్రీ',
    super: 'సూపర్', fresh: 'ఫ్రెష్', cool: 'కూల్', point: 'పాయింట్', center: 'సెంటర్',
    centre: 'సెంటర్', and: 'అండ్',
    bazaar: 'బజార్', bazar: 'బజార్', bhandar: 'భండార్', market: 'మార్కెట్',
    grocery: 'గ్రోసరీ', groceries: 'గ్రోసరీస్', corner: 'కార్నర్', daily: 'డైలీ',
    needs: 'నీడ్స్', family: 'ఫ్యామిలీ', mini: 'మినీ', emporium: 'ఎంపోరియం',
    collection: 'కలెక్షన్', variety: 'వెరైటీ',
  }),
  kn: Object.freeze({
    store: 'ಸ್ಟೋರ್', stores: 'ಸ್ಟೋರ್', kirana: 'ಕಿರಾಣಾ', general: 'ಜನರಲ್',
    provision: 'ಪ್ರೊವಿಜನ್', provisions: 'ಪ್ರೊವಿಜನ್', traders: 'ಟ್ರೇಡರ್ಸ್',
    medical: 'ಮೆಡಿಕಲ್', medicals: 'ಮೆಡಿಕಲ್', mart: 'ಮಾರ್ಟ್', bakery: 'ಬೇಕರಿ',
    sweets: 'ಸ್ವೀಟ್ಸ್', dairy: 'ಡೈರಿ', electronics: 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್',
    hardware: 'ಹಾರ್ಡ್ವೇರ್', supermarket: 'ಸೂಪರ್ಮಾರ್ಕೆಟ್', enterprises: 'ಎಂಟರ್ಪ್ರೈಸಸ್',
    agencies: 'ಏಜೆನ್ಸೀಸ್', shop: 'ಶಾಪ್', new: 'ನ್ಯೂ', sri: 'ಶ್ರೀ', shri: 'ಶ್ರೀ',
    super: 'ಸೂಪರ್', fresh: 'ಫ್ರೆಶ್', cool: 'ಕೂಲ್', point: 'ಪಾಯಿಂಟ್', center: 'ಸೆಂಟರ್',
    centre: 'ಸೆಂಟರ್', and: 'ಅಂಡ್',
    bazaar: 'ಬಜಾರ್', bazar: 'ಬಜಾರ್', bhandar: 'ಭಂಡಾರ್', market: 'ಮಾರ್ಕೆಟ್',
    grocery: 'ಗ್ರೋಸರಿ', groceries: 'ಗ್ರೋಸರೀಸ್', corner: 'ಕಾರ್ನರ್', daily: 'ಡೈಲಿ',
    needs: 'ನೀಡ್ಸ್', family: 'ಫ್ಯಾಮಿಲಿ', mini: 'ಮಿನಿ', emporium: 'ಎಂಪೋರಿಯಂ',
    collection: 'ಕಲೆಕ್ಷನ್', variety: 'ವೆರೈಟಿ',
  }),
  ml: Object.freeze({
    store: 'സ്റ്റോർ', stores: 'സ്റ്റോർ', kirana: 'കിരാണ', general: 'ജനറൽ',
    provision: 'പ്രൊവിഷൻ', provisions: 'പ്രൊവിഷൻ', traders: 'ട്രേഡേഴ്സ്',
    medical: 'മെഡിക്കൽ', medicals: 'മെഡിക്കൽ', mart: 'മാർട്ട്', bakery: 'ബേക്കറി',
    sweets: 'സ്വീറ്റ്സ്', dairy: 'ഡെയറി', electronics: 'ഇലക്ട്രോണിക്സ്',
    hardware: 'ഹാർഡ്വെയർ', supermarket: 'സൂപ്പർമാർക്കറ്റ്', enterprises: 'എന്റർപ്രൈസസ്',
    agencies: 'ഏജൻസീസ്', shop: 'ഷോപ്പ്', new: 'ന്യൂ', sri: 'ശ്രീ', shri: 'ശ്രീ',
    super: 'സൂപ്പർ', fresh: 'ഫ്രഷ്', cool: 'കൂൾ', point: 'പോയിന്റ്', center: 'സെന്റർ',
    centre: 'സെന്റർ', and: 'ആൻഡ്',
    bazaar: 'ബസാർ', bazar: 'ബസാർ', bhandar: 'ഭണ്ഡാർ', market: 'മാർക്കറ്റ്',
    grocery: 'ഗ്രോസറി', groceries: 'ഗ്രോസറീസ്', corner: 'കോർണർ', daily: 'ഡെയിലി',
    needs: 'നീഡ്സ്', family: 'ഫാമിലി', mini: 'മിനി', emporium: 'എംപോറിയം',
    collection: 'കളക്ഷൻ', variety: 'വെറൈറ്റി',
  }),
});

/**
 * SURNAMES — a curated, closed dictionary of common Indian surnames in natural
 * native script per language, keyed by the stripped, lowercased ASCII form (the
 * same `lexKey` used for BUSINESS_LEXICON). Real shop names overwhelmingly begin
 * with the owner's surname ("Sharma Kirana Store"), and raw transliteration
 * mangles them (Sharma -> शर्म, Reddy -> रेद्द्य्). A curated hit is TRUSTED: it
 * does NOT set needs_review, exactly like a business-lexicon hit. Common spelling
 * variants share the same target (reddy/reddi, iyer/ayyar, verma/varma, etc.).
 *
 * The Devanagari (hi) forms are review-grade and match the audited targets. The
 * ta/te/kn/ml forms are the conventional local renderings but a native speaker
 * should still spot-check them; the owner override UI is the correction path.
 */
const SURNAMES = Object.freeze({
  hi: Object.freeze({
    sharma: 'शर्मा', gupta: 'गुप्ता', patel: 'पटेल', reddy: 'रेड्डी', reddi: 'रेड्डी',
    khan: 'खान', singh: 'सिंह', iyer: 'अय्यर', ayyar: 'अय्यर', das: 'दास',
    mehta: 'मेहता', nair: 'नायर', kumar: 'कुमार', verma: 'वर्मा', varma: 'वर्मा',
    yadav: 'यादव', shah: 'शाह', rao: 'राव', naidu: 'नायडू', pillai: 'पिल्लई',
    menon: 'मेनन', bose: 'बोस', roy: 'रॉय', agarwal: 'अग्रवाल', aggarwal: 'अग्रवाल',
    jain: 'जैन', kapoor: 'कपूर', malhotra: 'मल्होत्रा', bhat: 'भट', bhatt: 'भट्ट',
    shetty: 'शेट्टी', hegde: 'हेगड़े', prasad: 'प्रसाद', mishra: 'मिश्रा', misra: 'मिश्रा',
    pandey: 'पांडे', tiwari: 'तिवारी', joshi: 'जोशी', desai: 'देसाई', chauhan: 'चौहान',
    nayak: 'नायक', sinha: 'सिन्हा', ghosh: 'घोष', banerjee: 'बनर्जी', chatterjee: 'चटर्जी',
    mukherjee: 'मुखर्जी', krishnan: 'कृष्णन', raman: 'रमन', subramanian: 'सुब्रमण्यन',
    chopra: 'चोपड़ा', saxena: 'सक्सेना', dubey: 'दुबे', thakur: 'ठाकुर', patil: 'पाटिल',
    kulkarni: 'कुलकर्णी', deshpande: 'देशपांडे', gowda: 'गौड़ा',
  }),
  ta: Object.freeze({
    sharma: 'ஷர்மா', gupta: 'குப்தா', patel: 'படேல்', reddy: 'ரெட்டி', reddi: 'ரெட்டி',
    khan: 'கான்', singh: 'சிங்', iyer: 'ஐயர்', ayyar: 'ஐயர்', das: 'தாஸ்',
    mehta: 'மேத்தா', nair: 'நாயர்', kumar: 'குமார்', verma: 'வர்மா', varma: 'வர்மா',
    yadav: 'யாதவ்', shah: 'ஷா', rao: 'ராவ்', naidu: 'நாயுடு', pillai: 'பிள்ளை',
    menon: 'மேனன்', bose: 'போஸ்', roy: 'ராய்', agarwal: 'அகர்வால்', aggarwal: 'அகர்வால்',
    jain: 'ஜைன்', kapoor: 'கபூர்', malhotra: 'மல்ஹோத்ரா', bhat: 'பட்', bhatt: 'பட்ட',
    shetty: 'ஷெட்டி', hegde: 'ஹெக்டே', prasad: 'பிரசாத்', mishra: 'மிஸ்ரா', misra: 'மிஸ்ரா',
    pandey: 'பாண்டே', tiwari: 'திவாரி', joshi: 'ஜோஷி', desai: 'தேசாய்', chauhan: 'சவுஹான்',
    nayak: 'நாயக்', sinha: 'சின்ஹா', ghosh: 'கோஷ்', banerjee: 'பானர்ஜி', chatterjee: 'சட்டர்ஜி',
    mukherjee: 'முகர்ஜி', krishnan: 'கிருஷ்ணன்', raman: 'ராமன்', subramanian: 'சுப்பிரமணியன்',
    chopra: 'சோப்ரா', saxena: 'சக்சேனா', dubey: 'துபே', thakur: 'தாகூர்', patil: 'பாட்டீல்',
    kulkarni: 'குல்கர்ணி', deshpande: 'தேஷ்பாண்டே', gowda: 'கவுடா',
  }),
  te: Object.freeze({
    sharma: 'శర్మ', gupta: 'గుప్తా', patel: 'పటేల్', reddy: 'రెడ్డి', reddi: 'రెడ్డి',
    khan: 'ఖాన్', singh: 'సింగ్', iyer: 'అయ్యర్', ayyar: 'అయ్యర్', das: 'దాస్',
    mehta: 'మెహతా', nair: 'నాయర్', kumar: 'కుమార్', verma: 'వర్మ', varma: 'వర్మ',
    yadav: 'యాదవ్', shah: 'షా', rao: 'రావు', naidu: 'నాయుడు', pillai: 'పిళ్ళై',
    menon: 'మీనన్', bose: 'బోస్', roy: 'రాయ్', agarwal: 'అగర్వాల్', aggarwal: 'అగర్వాల్',
    jain: 'జైన్', kapoor: 'కపూర్', malhotra: 'మల్హోత్రా', bhat: 'భట్', bhatt: 'భట్',
    shetty: 'శెట్టి', hegde: 'హెగ్డే', prasad: 'ప్రసాద్', mishra: 'మిశ్రా', misra: 'మిశ్రా',
    pandey: 'పాండే', tiwari: 'తివారీ', joshi: 'జోషి', desai: 'దేశాయ్', chauhan: 'చౌహాన్',
    nayak: 'నాయక్', sinha: 'సిన్హా', ghosh: 'ఘోష్', banerjee: 'బెనర్జీ', chatterjee: 'చటర్జీ',
    mukherjee: 'ముఖర్జీ', krishnan: 'కృష్ణన్', raman: 'రామన్', subramanian: 'సుబ్రమణ్యన్',
    chopra: 'చోప్రా', saxena: 'సక్సేనా', dubey: 'దూబే', thakur: 'ఠాకూర్', patil: 'పాటిల్',
    kulkarni: 'కులకర్ణి', deshpande: 'దేశ్పాండే', gowda: 'గౌడ',
  }),
  kn: Object.freeze({
    sharma: 'ಶರ್ಮಾ', gupta: 'ಗುಪ್ತಾ', patel: 'ಪಟೇಲ್', reddy: 'ರೆಡ್ಡಿ', reddi: 'ರೆಡ್ಡಿ',
    khan: 'ಖಾನ್', singh: 'ಸಿಂಗ್', iyer: 'ಅಯ್ಯರ್', ayyar: 'ಅಯ್ಯರ್', das: 'ದಾಸ್',
    mehta: 'ಮೆಹ್ತಾ', nair: 'ನಾಯರ್', kumar: 'ಕುಮಾರ್', verma: 'ವರ್ಮಾ', varma: 'ವರ್ಮಾ',
    yadav: 'ಯಾದವ್', shah: 'ಶಾ', rao: 'ರಾವ್', naidu: 'ನಾಯುಡು', pillai: 'ಪಿಳ್ಳೈ',
    menon: 'ಮೆನನ್', bose: 'ಬೋಸ್', roy: 'ರಾಯ್', agarwal: 'ಅಗರ್ವಾಲ್', aggarwal: 'ಅಗರ್ವಾಲ್',
    jain: 'ಜೈನ್', kapoor: 'ಕಪೂರ್', malhotra: 'ಮಲ್ಹೋತ್ರಾ', bhat: 'ಭಟ್', bhatt: 'ಭಟ್',
    shetty: 'ಶೆಟ್ಟಿ', hegde: 'ಹೆಗಡೆ', prasad: 'ಪ್ರಸಾದ್', mishra: 'ಮಿಶ್ರಾ', misra: 'ಮಿಶ್ರಾ',
    pandey: 'ಪಾಂಡೆ', tiwari: 'ತಿವಾರಿ', joshi: 'ಜೋಶಿ', desai: 'ದೇಸಾಯಿ', chauhan: 'ಚೌಹಾನ್',
    nayak: 'ನಾಯಕ್', sinha: 'ಸಿನ್ಹಾ', ghosh: 'ಘೋಷ್', banerjee: 'ಬ್ಯಾನರ್ಜಿ', chatterjee: 'ಚಟರ್ಜಿ',
    mukherjee: 'ಮುಖರ್ಜಿ', krishnan: 'ಕೃಷ್ಣನ್', raman: 'ರಾಮನ್', subramanian: 'ಸುಬ್ರಮಣ್ಯನ್',
    chopra: 'ಚೋಪ್ರಾ', saxena: 'ಸಕ್ಸೇನಾ', dubey: 'ದುಬೆ', thakur: 'ಠಾಕೂರ್', patil: 'ಪಾಟೀಲ್',
    kulkarni: 'ಕುಲಕರ್ಣಿ', deshpande: 'ದೇಶಪಾಂಡೆ', gowda: 'ಗೌಡ',
  }),
  ml: Object.freeze({
    sharma: 'ശർമ്മ', gupta: 'ഗുപ്ത', patel: 'പട്ടേൽ', reddy: 'റെഡ്ഡി', reddi: 'റെഡ്ഡി',
    khan: 'ഖാൻ', singh: 'സിംഗ്', iyer: 'അയ്യർ', ayyar: 'അയ്യർ', das: 'ദാസ്',
    mehta: 'മേത്ത', nair: 'നായർ', kumar: 'കുമാർ', verma: 'വർമ്മ', varma: 'വർമ്മ',
    yadav: 'യാദവ്', shah: 'ഷാ', rao: 'റാവു', naidu: 'നായിഡു', pillai: 'പിള്ള',
    menon: 'മേനോൻ', bose: 'ബോസ്', roy: 'റോയ്', agarwal: 'അഗർവാൾ', aggarwal: 'അഗർവാൾ',
    jain: 'ജെയിൻ', kapoor: 'കപൂർ', malhotra: 'മൽഹോത്ര', bhat: 'ഭട്ട്', bhatt: 'ഭട്ട്',
    shetty: 'ഷെട്ടി', hegde: 'ഹെഗ്ഡെ', prasad: 'പ്രസാദ്', mishra: 'മിശ്ര', misra: 'മിശ്ര',
    pandey: 'പാണ്ഡെ', tiwari: 'തിവാരി', joshi: 'ജോഷി', desai: 'ദേശായി', chauhan: 'ചൗഹാൻ',
    nayak: 'നായക്', sinha: 'സിൻഹ', ghosh: 'ഘോഷ്', banerjee: 'ബാനർജി', chatterjee: 'ചാറ്റർജി',
    mukherjee: 'മുഖർജി', krishnan: 'കൃഷ്ണൻ', raman: 'രാമൻ', subramanian: 'സുബ്രഹ്മണ്യൻ',
    chopra: 'ചോപ്ര', saxena: 'സക്സേന', dubey: 'ദുബെ', thakur: 'ഠാക്കൂർ', patil: 'പാട്ടീൽ',
    kulkarni: 'കുൽക്കർണി', deshpande: 'ദേശ്പാണ്ഡെ', gowda: 'ഗൗഡ',
  }),
});

/**
 * Resolve the transliteration engine using @indic-transliteration/sanscript
 * (a runtime dependency: deterministic, pure JS, no ML, no network). Returns an
 * object exposing `transliterate(asciiToken, lang) -> nativeString | null`,
 * where null means the engine could not handle that language's script. The
 * require is wrapped only as a never-throw safety net; in production the library
 * is installed (`npm ci --omit=dev` keeps it), so the normal path always
 * transliterates. Cached after the first resolve so the require cost is paid once.
 */
let _engine;
function resolveEngine() {
  if (_engine !== undefined) return _engine;
  try {
    // eslint-disable-next-line global-require
    const lib = require('@indic-transliteration/sanscript');
    _engine = {
      name: 'sanscript',
      available: true,
      transliterate(token, lang) {
        const scheme = SCRIPT_BY_LANG[lang];
        if (!scheme) return null;
        // ITRANS is a Roman input scheme; sanscript maps it phonetically into the
        // target Indic script. Best-effort for arbitrary English proper nouns.
        return lib.t(String(token), 'itrans', scheme);
      },
    };
  } catch (err) {
    // Safety net only — sanscript is a runtime dependency, so this should not
    // happen in a correctly installed image. If it ever does, degrade instead of
    // throwing: business words still localize via the lexicon, proper nouns stay
    // Roman and the name is flagged needs_review.
    _engine = {
      name: 'unavailable',
      available: false,
      reason: err && err.message,
      transliterate() {
        return null;
      },
    };
  }
  return _engine;
}

// Per-script virama (halant) — a combining mark that suppresses the inherent
// vowel. Used only for the conservative trailing-cleanup below.
const VIRAMA_BY_SCRIPT = Object.freeze({
  devanagari: '्', tamil: '்', telugu: '్',
  kannada: '್', malayalam: '്',
});

/**
 * Conservative cleanup of a single transliterated token. Deliberately minimal
 * (the enrich util's careful folding is the reference for "small and safe"):
 *   - strip NUL / C0 control characters and normalize whitespace, and
 *   - collapse a DOUBLED trailing virama down to one (a genuine transliterator
 *     artefact); and
 *   - for Devanagari (hi) ONLY, strip a SINGLE trailing virama/halant so an
 *     unknown proper noun reads by the natural schwa-deletion convention
 *     (पतेल् -> पतेल, नैर् -> नैर) instead of an over-marked halant. This is NOT
 *     done for the Dravidian scripts (ta/te/kn/ml), where a word-final pure
 *     consonant / pulli is legitimate and stripping it would corrupt correct
 *     forms (e.g. "Bharat" -> भरत in hi, but பரத் / భరత్ / ಭರತ್ / ഭരത് elsewhere).
 *   Never throws; never rewrites the phonemes of a name.
 */
function cleanTranslit(token, lang) {
  if (token == null) return '';
  let out = String(token)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const script = SCRIPT_BY_LANG[lang];
  const v = VIRAMA_BY_SCRIPT[script];
  if (v) {
    // Fold a stray DOUBLE virama down to one first.
    const dbl = new RegExp(`${v}${v}+`, 'g');
    out = out.replace(dbl, v);
    // Devanagari only: drop a single word-final halant (schwa-deletion reading).
    if (script === 'devanagari' && out.endsWith(v)) {
      out = out.slice(0, -v.length);
    }
  }
  return out;
}

// The stripped, lowercased ASCII lookup key for a token (letters only). Empty
// for a purely non-alphabetic token (digits, '&', '-', already-native script).
function lexKey(token) {
  return String(token == null ? '' : token).toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Localize one English shop name into `lang`. Pure and total.
 * Returns { name, needsReview }:
 *   - en / ur / any lang without a native script here -> the English name
 *     verbatim, needsReview=false (English is ALWAYS the fallback).
 *   - otherwise: tokenize on whitespace (order preserved, joined by single
 *     spaces); each token is either a curated lexicon word, a transliterated
 *     proper noun (marks the whole name needsReview=true), or a non-alpha token
 *     passed through unchanged ('&' and the word 'and' map via the lexicon).
 */
function localizeShopName(englishName, lang) {
  const raw = englishName == null ? '' : String(englishName);
  const l = (lang || '').trim().toLowerCase();

  // English fallback for the base language, Arabic-script Urdu, and anything we
  // do not have a native script for.
  if (!SCRIPT_BY_LANG[l]) {
    return { name: raw, needsReview: false };
  }

  const lexicon = BUSINESS_LEXICON[l] || {};
  const surnames = SURNAMES[l] || {};
  const engine = resolveEngine();

  // Whitespace tokens; drop the empties from leading/trailing/multiple spaces.
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    // Empty / whitespace-only input: nothing to localize, English passthrough.
    return { name: raw, needsReview: false };
  }

  let needsReview = false;
  const rendered = tokens.map((token) => {
    const key = lexKey(token);

    // Non-alpha token ('&', digits, '-', or already-native input): '&' and the
    // literal word 'and' localize via the lexicon; everything else passes
    // through byte-for-byte (this also leaves already-native-script input alone).
    if (!key) {
      if (token === '&' && lexicon.and) return lexicon.and;
      return token;
    }

    // Curated business word — trusted, no review needed for this token.
    if (Object.prototype.hasOwnProperty.call(lexicon, key)) {
      return lexicon[key];
    }

    // Curated surname — also trusted (most shop names lead with the owner's
    // surname, which raw transliteration mangles). Checked AFTER the business
    // lexicon so a word appearing in both resolves to its business meaning.
    if (Object.prototype.hasOwnProperty.call(surnames, key)) {
      return surnames[key];
    }

    // Proper-noun remainder: best-effort transliteration. A machine-produced
    // token means the whole name should be human-reviewed.
    const native = engine.transliterate(key, l);
    if (native && native.trim()) {
      needsReview = true;
      return cleanTranslit(native, l);
    }

    // Safety net: engine unavailable (should not happen — sanscript is a runtime
    // dependency) or it produced nothing. Keep the Roman token so the name is
    // still readable, and flag for review.
    needsReview = true;
    return token;
  });

  return { name: rendered.join(' '), needsReview };
}

/**
 * Render an English name into every requested language. `activeLangs` is the set
 * of language codes to render into (typically RENDER_LANGS or the active subset
 * of it). Unknown/duplicate codes are ignored; en/ur are skipped (English
 * fallback needs no stored row). Returns a { [lang]: { name, needsReview } } map.
 * Pure and total.
 */
function renderAllLangs(englishName, activeLangs) {
  const langs = Array.isArray(activeLangs) ? activeLangs : RENDER_LANGS;
  const out = {};
  for (const lang of langs) {
    const l = (lang || '').trim().toLowerCase();
    if (!SCRIPT_BY_LANG[l] || Object.prototype.hasOwnProperty.call(out, l)) continue;
    out[l] = localizeShopName(englishName, l);
  }
  return out;
}

/**
 * Resolve which render languages are ACTIVE, from the `languages` registry,
 * intersected with the closed RENDER_LANGS set. Defensive: any error (missing
 * table, no client) or empty result falls back to the full RENDER_LANGS set, so
 * a seed is never skipped because the registry could not be read. `client` is
 * anything with a .query method (a tx client or the pool).
 */
async function resolveActiveRenderLangs(client) {
  try {
    const r = await client.query(
      `SELECT code FROM languages
        WHERE is_active = true AND code = ANY($1::text[])`,
      [RENDER_LANGS.slice()]
    );
    const active = r.rows.map((row) => row.code).filter((c) => SCRIPT_BY_LANG[c]);
    return active.length ? active : RENDER_LANGS.slice();
  } catch (err) {
    return RENDER_LANGS.slice();
  }
}

/**
 * (Re)seed shop_name_i18n for one shop from its English name. Side-effecting:
 * runs against the injected `client` (a tx client or the pool). UPSERTs an
 * 'auto' row per active render language, and NEVER clobbers a row an owner has
 * manually set (source='owner') — the ON CONFLICT update is guarded to
 * source='auto' only. Idempotent. Callers wrap this defensively so a failure
 * here can never fail signup / rename.
 */
async function reseedShopName(client, shopId, englishName) {
  const langs = await resolveActiveRenderLangs(client);
  const rendered = renderAllLangs(englishName, langs);
  for (const [lang, { name, needsReview }] of Object.entries(rendered)) {
    if (!name) continue; // never store an empty native name
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO shop_name_i18n (shop_id, lang, name, source, needs_review, updated_at)
       VALUES ($1, $2, $3, 'auto', $4, NOW())
       ON CONFLICT (shop_id, lang) DO UPDATE
         SET name = EXCLUDED.name,
             source = 'auto',
             needs_review = EXCLUDED.needs_review,
             updated_at = NOW()
       WHERE shop_name_i18n.source = 'auto'`,
      [shopId, lang, name, needsReview]
    );
  }
}

module.exports = {
  SCRIPT_BY_LANG,
  RENDER_LANGS,
  BUSINESS_LEXICON,
  SURNAMES,
  resolveEngine,
  cleanTranslit,
  localizeShopName,
  renderAllLangs,
  resolveActiveRenderLangs,
  reseedShopName,
};
