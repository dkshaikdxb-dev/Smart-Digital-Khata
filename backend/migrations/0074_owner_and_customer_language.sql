-- Durable language preference for the two people the app sends WhatsApp to:
-- the shop OWNER and the CUSTOMER (batch LANG).
--
-- Until now the chosen language lived only in the browser's localStorage, so
-- nothing the server composed could honour it. The weekly owner summary fell
-- back to Hindi for every shop in the country, and every customer order/payment
-- message went out in English no matter which language that customer had picked
-- on the consumer app. These three columns are the server's durable copy.
--
-- NULL everywhere means "not set" — deliberately NOT defaulted to 'en' or 'hi',
-- because "this owner has never told us" and "this owner chose English" are
-- different facts and the fallback chains read them differently.
--
-- No foreign key to `languages`: the registry rows can be deactivated or
-- re-staged by an admin, and a shopkeeper's stored preference must survive that
-- rather than blocking the admin or cascading to NULL. The code validates a
-- stored code against the registry when it uses it.
--
-- Additive and idempotent: every statement is IF NOT EXISTS, so re-running the
-- migration is a no-op and no existing row is rewritten.

-- The OWNER's language, mirrored from the owner console's language switch.
-- Read by the weekly WhatsApp summary (services/weekly-summary.service).
ALTER TABLE shops ADD COLUMN IF NOT EXISTS language TEXT;

-- The CUSTOMER's language for this shop's khata. Stamped when the shopper picks
-- a language on the consumer PWA and when they place an order, and read by the
-- purchase / payment / reminder WhatsApp messages (services/notification.service).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_language TEXT;

-- The consumer account's own language — the GLOBAL identity (phone-keyed,
-- migration 0007) behind every per-shop `customers` row. One pick on the
-- consumer app propagates from here to each shop's customer row.
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS language TEXT;
