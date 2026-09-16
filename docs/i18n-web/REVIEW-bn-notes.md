# Bengali — points for the native review

Every machine check passes on these. They are wording judgements a reader of
the language has to make, listed as found rather than fixed.

## A currency word next to an amount that already carries ₹

Money placeholders arrive pre-formatted — money()/inr() put the ₹ in — so these
render as "₹500.00 টাকা", i.e. "₹500.00 rupees". Dropping the word works in some
and not others: in "{amount} টাকার জিনিস" the genitive is doing grammatical work
and the sentence needs rephrasing instead.

- `c.prepayHelperNoDue`
  - en: {amt} becomes an advance you can spend later
  - bn: {amt} টাকা অ্যাডভান্স জমা থাকবে, পরে কেনাকাটায় কাটবে
- `coedit.cash`
  - en: Pay {now} when you collect — {amount} of items were taken off.
  - bn: নেওয়ার সময় নগদ {now} দিন — {amount} টাকার জিনিস বাদ দেওয়া হয়েছে।
- `coedit.credit`
  - en: {amount} has been taken off your khata at this shop.
  - bn: এই দোকান থেকে আপনার খাতায় {amount} টাকা কমিয়ে দেওয়া হয়েছে।
- `coedit.prepaid`
  - en: You had already paid. {amount} is kept as credit at this shop — it comes off your next order here.
  - bn: আপনি আগেই টাকা দিয়েছিলেন। বাকি {amount} টাকা এই দোকানে জমা রইল — পরের অর্ডারে কেটে নেওয়া হবে।
- `oedit.reducedBy`
  - en: You are taking off {amount}.
  - bn: আপনি {amount} টাকা কমাচ্ছেন।
- `promo.submit`
  - en: Boost for {amount}
  - bn: {amount} টাকার বদলে বুস্ট করুন

## Spelling seen one way once, another way elsewhere

- "advance" transliterated both অ্যাডভান্স and এ্যাডভান্স (part 01).
- "Premium" came back as পিমিয়াম once against প্রিমিয়াম five times (part 01).
  Fixed by hand; noted because the class will recur and no automated check sees it.

## Left in English on purpose

`set.razorpayKeyId`, `set.keySecret`, `set.webhookSecret` — these must match, word
for word, what the shopkeeper is reading in Razorpay's own dashboard. Confirm that
is the right call for a Bengali-speaking owner; the two that were transliterated
with an English gloss ("কী সিক্রেট (Key Secret)") are arguably better and the
three should agree.
