# Web console translation — what to send Gemini, and in what order

The four earlier batches (2,101 strings) closed the two **native app**
dictionaries. The **web console** — `khata.dadashaik.com`, which is also what
the app shows inside its Staff / Suppliers / Promote / Delivery screens — has a
separate dictionary that was never part of them.

Measured, not estimated (`node scripts/web-i18n-request.mjs` rebuilds it):

| audience | strings | hi | ta te kn ml ur | bn gu mr |
|---|---|---|---|---|
| Shopkeeper (owner console) | 869 | 98.2% | 77.0% — 200 in English | 43.2% — **494 in English** |
| Shopper (consumer PWA) | 328 | 97.6% | 79.9% — 66 in English | 66.2% — 111 in English |

Admin-desk chrome (464 keys) is **excluded** — it is English-first on purpose,
and counting it would overstate the debt by half.

## Send ONE file per language. Never a consolidated one.

The consolidated 15-language sheet from the last round came back with scripts
mixed **between** languages — Tamil text sitting in Malayalam rows. The safety
checks caught it, but the fix is to not run that shape again.

Suggested order, by how many people are hurt and how badly:

1. `web-bn.csv` (566) · `web-gu.csv` (566) · `web-mr.csv` (566) — these three have
   no built-in dictionary block at all, so everything not in the overrides file
   falls through to English.
2. `web-ta.csv` · `web-te.csv` · `web-kn.csv` · `web-ml.csv` · `web-ur.csv` (232 each).
3. `web-hi.csv` (21) — a rounding error, do it last.

## The prompt

Upload exactly one file, then paste this, replacing the two names:

> You are translating the interface of Smart Digital Khata, a credit-ledger and
> ordering app used by small kirana (grocery) shopkeepers and their customers in
> small towns and villages in India. Translate the attached CSV into **Bengali**,
> writing in the **Bengali script**.
>
> Fill ONLY the empty `translation` column. Return the complete CSV with every
> original column and row unchanged, in the same order. Do not add, drop,
> reorder or merge rows. Do not translate any other column.
>
> Who reads these words: a shopkeeper with a cheap Android phone and limited
> schooling, often on a 2G connection, and their customers. Many are not
> comfortable readers. Write the way such a person speaks, not the way a
> newspaper or a government form is written.
>
> Rules, in order of importance:
>
> 1. **Placeholders are literal.** Anything in curly braces — `{amount}`,
>    `{name}`, `{n}`, `{mins}` — is replaced with a real value at run time. Copy
>    each one exactly, same spelling, same braces. The `placeholders` column
>    lists what each row must still contain. A dropped or renamed placeholder
>    prints a broken sentence to a real shopkeeper.
> 2. **Every character of your answer must be in the Bengali script**, except
>    placeholders, numerals, and genuine brand names (UPI, WhatsApp, Razorpay,
>    Smart Khata, PDF, OTP). Never leave a row in English. Never use a different
>    Indic script.
> 3. **Plain spoken register.** Not formal, not Sanskritised, not translated
>    word-for-word from English. If the natural spoken word is an English
>    loanword people actually say — order, delivery, balance, online, message —
>    use it in the Bengali script rather than forcing a pure word nobody uses.
> 4. **Numerals stay Latin**: 30, ₹1,250.00.
> 5. **Money words carry real meaning — be careful.** This app tracks credit
>    (udhaar). Money the customer OWES the shop and money the customer has PAID
>    are opposite things, and one wrong word makes a shopkeeper read their own
>    ledger backwards. The `where_it_appears` column tells you which screen a
>    string is on; use it. If a short English word is ambiguous out of context,
>    pick the reading that fits that screen, and say so at the end.
> 6. **Keep it short.** These are buttons, labels and column headings on a small
>    phone screen. A translation more than about 1.5× the English length will
>    be cut off.
>
> After the CSV, list separately: any row you were unsure about and why, and any
> row where the English itself is ambiguous.

## What happens when it comes back

Save the returned file over the same name and tell me. Before anything ships I
check every row, and a row failing any check is rejected rather than fixed
quietly:

- the `key` and `english` columns still match this repo exactly (this is what
  caught the mixed-script rows last time — a bled row no longer matches),
- every placeholder in the English survives, spelled identically,
- the translation is in that language's own script, with no U+FFFD,
- no row left in English.

Then the strings go into `backend/src/data/regional-i18n.json`, which
`import:i18n` loads into `i18n_overrides` on every deploy. `translate()` reads
overrides **before** the built-in dictionary, for every language — so this one
path covers all nine, and no large JS dictionary file is hand-edited.

A native-speaker read is still worth having afterwards, exactly as with the app
batches. These languages keep their "(beta)" marker until that happens.
