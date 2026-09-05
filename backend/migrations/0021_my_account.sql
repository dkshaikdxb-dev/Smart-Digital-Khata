-- My Account (Phase A) — optional, privacy-first profile fields for both the
-- shop-side login users and the consumer customer_users. Additive & idempotent
-- so it is safe to re-run.
--
-- PII is OPTIONAL everywhere: email, gender and date_of_birth are never required
-- to use any feature. They power the account section, greetings, and future
-- analytics only. There is NO KYC / verification. gender is validated in the app
-- to one of 'male','female','other','prefer_not_to_say' (or null); date_of_birth
-- is a plain nullable DATE (no future dates, enforced in the app).

-- Shop-side users (owner/staff/admin). email/name/phone already exist.
ALTER TABLE users          ADD COLUMN IF NOT EXISTS gender        TEXT;
ALTER TABLE users          ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Consumer accounts (phone-login customers). phone is the login id; email is new
-- and optional (no UNIQUE — a consumer's email is not a login identifier).
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS gender        TEXT;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
