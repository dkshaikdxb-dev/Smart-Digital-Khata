-- Loose / weighed selling (⑦). Many kirana items are sold loose by weight (rice,
-- dal, sugar priced per KG; a shopper buys e.g. 250g). Additive & idempotent.
--
-- Semantics: when products.sold_by_weight = true, products.price is paise PER KG
-- and unit should be 'kg'. A weighed order line's price is recomputed server-side
-- (never trusted from the client) as round(price_per_kg * weight_grams / 1000)
-- in paise, with quantity fixed at 1 and the chosen weight_grams recorded on the
-- order_items row. Unit products are unchanged (price * integer quantity).
ALTER TABLE products    ADD COLUMN IF NOT EXISTS sold_by_weight BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight_grams   INTEGER;
