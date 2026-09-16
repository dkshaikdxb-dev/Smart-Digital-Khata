# Marathi (`mr`) — web console translation

566 strings, split into 5 files under `web-mr-parts/`.
**Upload ONE part per conversation turn and paste the prompt below each time.**
Asking for all 566 in one reply is where a model starts dropping rows near
the end, and a short reply looks exactly like a complete one.

## The prompt

---

You are translating the interface of **Smart Digital Khata**, an app used by
small kirana (grocery) shopkeepers and their customers in small towns and
villages in India. It keeps a shop's **khata** — the running credit ledger of
what each customer owes — and lets customers order from the shop.

Translate the attached CSV into **Marathi**, written in the **Devanagari script**.

**Return a CSV with exactly two columns: `key` and `translation`.** One row per
input row, in the same order, keys copied exactly. Do not return the other
columns. Do not add, drop, merge or reorder rows. Return nothing but the CSV.

Who reads these words: someone with a cheap Android phone, a 2G connection and
limited schooling. Many are not confident readers. Write the way such a person
speaks — not the way a newspaper, a bank form or a government notice is written.

### Rule zero — read the attached file, do not invent one

Translate ONLY the rows in the attached CSV. Do not write your own list of
interface strings.

Every key in that file contains a **dot**: `acc.language`, `cart.belowMin`,
`sup.nav`. If the keys you are about to write contain underscores
(`web_nav_tagline`) or look like names you chose, you are not reading the file
— stop and say so.

Before the CSV, output these three lines so it is clear the file was read:

    FILE: <the filename you were given>
    ROWS: <how many data rows it has>
    FIRST/LAST KEY: <the first key>, <the last key>

If you cannot open or read the attachment, say exactly that and stop. Do not
produce a translation from the description of the app above. An invented list is
worse than no answer: it looks like work and is silently discarded.

### Rules, in order of importance

1. **Placeholders are code, not words.** Anything in curly braces — `{amount}`,
   `{name}`, `{n}`, `{shop}` — is replaced with a real value when the app runs.
   Copy each one exactly: same spelling, same braces, no translation, none added
   or dropped. The `placeholders` column lists what that row must still contain.
   A missing placeholder prints a broken sentence to a real shopkeeper.

2. **One script only.** Every character must be Devanagari, except placeholders,
   numerals, and real brand names (UPI, WhatsApp, Razorpay, Smart Khata, PDF,
   OTP, QR). Never leave a row in English. Never use another Indic script.

3. **Use the words this app already uses.** These are not suggestions — they are
   what the same person already sees in the mobile app, and the web must match:

| English | Marathi |
|---|---|
| khata | खाते |
| order | ऑर्डर |
| delivery | डिलिव्हरी |
| pickup | स्वतः घेऊन जा |
| balance | शिल्लक |
| cash | रोख |
| pay | भरा |
| shop | दुकान |
| customer | ग्राहक |
| credit | उधार |
| total | एकूण |
| items | वस्तू |
| paid | भरले |
| on khata | खात्यावर |
| pay online | ऑनलाइन भरणा |
| you owe | तुम्हाला द्यायचे |
| staff | कर्मचारी |
| free | मोफत |
| open | उघडी |
| closed | बंद |
| add | जोडा |
| remove | काढा |
| save | सेव्ह करा |
| cancel | रद्द करा |
| retry | पुन्हा प्रयत्न करा |
| search | शोधा |
| close | बंद करा |
| payment | भरणा |

4. **Money words carry direction, and getting one wrong is serious.** This app
   tracks credit. Money the customer **owes the shop** and money the customer
   **has paid or holds in advance** are opposites. A word that can mean "deposit"
   or "amount in your favour" must never be used for a debt. If a short English
   string is ambiguous on its own, use the `where_it_appears` column to see which
   screen it is on, choose the reading that fits, and note it at the end.

5. **Plain spoken register.** Where the natural spoken word is an English
   loanword people actually say — order, delivery, balance, online, message,
   mobile — use it written in Devanagari, rather than forcing a pure word nobody
   uses in a shop.

6. **Numerals stay Latin**: 30, 1,250.00.

7. **Keep it short.** These are buttons, labels and column headings on a small
   phone. Aim to stay within about 1.5x the English length; a long translation is
   cut off mid-word on a 360px screen.

8. **Read `where_it_appears`.** "Shopkeeper: settings" means the shop's owner is
   reading it; "Shopper: cart" means their customer is. The politeness level and
   the word for "you" often differ between the two.

After the CSV, list separately: rows you were unsure about and why, and rows
where the **English itself** is ambiguous.

---

## After each part

Save the reply as `web-mr-NN.csv` next to the part it answers and tell me.
Nothing ships before it passes `node scripts/web-i18n-verify.mjs`, which
rejects rather than repairs — a silently corrected translation is one nobody
reviewed. It checks that every key is real and unknown to no one, that
placeholders survive exactly, that the text is in Devanagari and carries no
other Indic script, that no row came back in English, and that nothing contains
a replacement character.

## Parts

- `web-mr-parts/web-mr-01.csv` — 128 strings (acc.language … credits.title)
- `web-mr-parts/web-mr-02.csv` — 126 strings (csfaq.subtitle … dlv.unassigned)
- `web-mr-parts/web-mr-03.csv` — 121 strings (err.accountStopped … open.tomorrowAt)
- `web-mr-parts/web-mr-04.csv` — 120 strings (ord.advanceCol … share.title)
- `web-mr-parts/web-mr-05.csv` — 71 strings (snl.auto … voice.err.network)
