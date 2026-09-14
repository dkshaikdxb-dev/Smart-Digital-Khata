-- CUSTOMER PHONE NUMBERS ARE E.164 (batch MONEYFIX, defect H6).
--
-- `customers.phone` is the join key between a shop's ledger row and the person
-- holding it. EVERY consumer lookup — /my/khata, /my/khata/:shopId, /my/orders,
-- the consumer statement, and the auto-create inside order placement — matches
-- on `toE164(...)` of the signed-in number. But only `changePhone` normalised on
-- the way IN: `create` and `update` wrote whatever the owner typed.
--
-- So an owner who typed `9876543210` created a row that customer could never
-- find: they signed in as `+919876543210`, got a 404 on their own khata, and the
-- moment they placed an order the auto-create made a SECOND `customers` row at
-- the same shop — one person, one shop, two ledgers, and the balance the owner
-- was chasing sitting on the one the customer could not see.
--
-- The controllers now normalise on every write path. This migration deals with
-- the rows written before that.
--
-- ADDITIVE + IDEMPOTENT + SAFE ON LIVE DATA:
--   * only rows whose stored value is NOT already the normalised form are
--     touched, so a re-run is a no-op;
--   * NOTHING is merged, renumbered or deleted — a normalisation that would
--     collide with another row at the same shop is REFUSED and recorded for a
--     human, because merging two ledgers is a money decision and the repo
--     already has an owner-driven, audited path for it
--     (customer.controller.changePhone -> utils/customer-merge.relinkCustomerPhone,
--     which repoints every transaction/order/payment and recomputes the balance
--     as an exact paise sum). A migration must not make that call unattended.

-- ---------------------------------------------------------------------------
-- Where the refusals are reported. One row per customer that could NOT be
-- normalised, with what it holds now and what it would have become.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_phone_conflicts (
  customer_id      UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  shop_id          UUID NOT NULL,
  stored_phone     TEXT NOT NULL,
  normalised_phone TEXT NOT NULL,
  -- The customer at the same shop already holding `normalised_phone`, when the
  -- clash is with an existing row. NULL when two un-normalised rows at the same
  -- shop would simply have collapsed onto each other.
  collides_with    UUID,
  noticed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set by whoever resolves it (merge, correction, archive). Never set here.
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_phone_conflicts_shop
  ON customer_phone_conflicts (shop_id) WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- The normalisation itself, mirroring utils/phone.toE164 exactly:
--   strip spaces/dashes/parentheses; already-'+' is left alone; a bare 10-digit
--   number gets the India country code; anything else just gets the '+'.
-- IMMUTABLE + no I/O, so it is safe to index on later if that is ever wanted.
-- CREATE OR REPLACE makes the migration re-runnable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION khata_to_e164(raw TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN raw IS NULL THEN raw
    WHEN btrim(regexp_replace(raw, '[\s\-()]', '', 'g')) = '' THEN raw
    WHEN regexp_replace(raw, '[\s\-()]', '', 'g') LIKE '+%'
      THEN regexp_replace(raw, '[\s\-()]', '', 'g')
    WHEN length(regexp_replace(raw, '[\s\-()]', '', 'g')) = 10
      THEN '+91' || regexp_replace(raw, '[\s\-()]', '', 'g')
    ELSE '+' || regexp_replace(raw, '[\s\-()]', '', 'g')
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- RECORD THE REFUSALS FIRST, while every row still holds its original value.
--
-- A row is refused when either
--   (a) another customer AT THE SAME SHOP already holds the normalised number
--       (`taken`), or
--   (b) two or more un-normalised rows at the same shop normalise to the SAME
--       number — the oldest wins (created_at, then id, both deterministic) and
--       the rest are refused rather than silently collapsed.
-- ---------------------------------------------------------------------------
WITH changing AS (
  SELECT c.id, c.shop_id, c.phone AS stored, khata_to_e164(c.phone) AS e164, c.created_at
    FROM customers c
   WHERE c.phone IS NOT NULL
     AND khata_to_e164(c.phone) IS DISTINCT FROM c.phone
), ranked AS (
  SELECT ch.*,
         ROW_NUMBER() OVER (PARTITION BY ch.shop_id, ch.e164
                            ORDER BY ch.created_at ASC, ch.id ASC) AS rn,
         (SELECT o.id FROM customers o
           WHERE o.shop_id = ch.shop_id AND o.phone = ch.e164 AND o.id <> ch.id
           ORDER BY o.id LIMIT 1) AS taken_by
    FROM changing ch
)
INSERT INTO customer_phone_conflicts (customer_id, shop_id, stored_phone, normalised_phone, collides_with)
SELECT id, shop_id, stored, e164, taken_by
  FROM ranked
 WHERE taken_by IS NOT NULL OR rn > 1
ON CONFLICT (customer_id) DO UPDATE
  SET stored_phone     = EXCLUDED.stored_phone,
      normalised_phone = EXCLUDED.normalised_phone,
      collides_with    = EXCLUDED.collides_with,
      noticed_at       = NOW();

-- ---------------------------------------------------------------------------
-- Then normalise everything that is free to move. Same CTE, opposite predicate,
-- so a row is either updated or recorded above — never both and never neither.
-- ---------------------------------------------------------------------------
WITH changing AS (
  SELECT c.id, c.shop_id, c.phone AS stored, khata_to_e164(c.phone) AS e164, c.created_at
    FROM customers c
   WHERE c.phone IS NOT NULL
     AND khata_to_e164(c.phone) IS DISTINCT FROM c.phone
), ranked AS (
  SELECT ch.*,
         ROW_NUMBER() OVER (PARTITION BY ch.shop_id, ch.e164
                            ORDER BY ch.created_at ASC, ch.id ASC) AS rn,
         EXISTS (SELECT 1 FROM customers o
                  WHERE o.shop_id = ch.shop_id AND o.phone = ch.e164 AND o.id <> ch.id) AS taken
    FROM changing ch
)
UPDATE customers c
   SET phone = r.e164, updated_at = NOW()
  FROM ranked r
 WHERE c.id = r.id
   AND r.rn = 1
   AND NOT r.taken;
