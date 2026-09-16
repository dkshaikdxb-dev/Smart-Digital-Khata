# Bengali — points for the native review

Machine checks passed on all of these; they are wording judgements a reader of
the language has to make. Listed as they were found, not fixed.

## A currency word next to an amount that already carries ₹

Every money placeholder arrives pre-formatted — money()/inr() put the ₹ in — so
these render as "₹500.00 টাকা", i.e. "₹500.00 rupees". Dropping the word works
in some and not others: in "{amount} টাকার জিনিস" the genitive is doing
grammatical work and the sentence needs rephrasing instead.

- `c.prepayHelperNoDue` — {amt} টাকা অ্যাডভান্স জমা থাকবে, পরে কেনাকাটায় কাটবে
  - en: {amt} becomes an advance you can spend later
- `coedit.cash` — নেওয়ার সময় নগদ {now} দিন — {amount} টাকার জিনিস বাদ দেওয়া হয়েছে।
  - en: Pay {now} when you collect — {amount} of items were taken off.
- `coedit.credit` — এই দোকান থেকে আপনার খাতায় {amount} টাকা কমিয়ে দেওয়া হয়েছে।
  - en: {amount} has been taken off your khata at this shop.
- `coedit.prepaid` — আপনি আগেই টাকা দিয়েছিলেন। বাকি {amount} টাকা এই দোকানে জমা রইল — পরের অর্ডারে কেটে নেওয়া হবে।
  - en: You had already paid. {amount} is kept as credit at this shop — it comes off your next order here.
- `oedit.reducedBy` — আপনি {amount} টাকা কমাচ্ছেন।
  - en: You are taking off {amount}.

## Spelling seen once, another way elsewhere

- "advance" transliterated both অ্যাডভান্স and এ্যাডভান্স in part 01.
- "Premium" came back as পিমিয়াম once against প্রিমিয়াম five times; fixed by hand,
  noted here because the same class will recur and no automated check sees it.
