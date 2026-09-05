-- Staff accounts — let a shop owner create additional staff logins for their
-- shop. Additive and idempotent so it is safe to re-run.

-- Staff (or any login user) can be disabled without deleting the row. Existing
-- rows default to active.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Staff created by phone alone may have no email. Postgres UNIQUE still permits
-- multiple NULLs, so the existing users_email_key constraint keeps holding.
-- Dropping NOT NULL is idempotent (a no-op when already nullable).
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Phone lookups drive the new phone-or-email login path; the (shop_id, role)
-- index speeds owner staff listings. Both are additive/idempotent.
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_shop_role ON users(shop_id, role);
