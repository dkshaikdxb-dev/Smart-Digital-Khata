-- Admin RBAC + moderation (Phase C). Additive and idempotent so it is safe to
-- re-run. Gives platform admins sub-roles with permission sets (super/support/
-- finance/moderation), a block state for shop-side login users and for consumer
-- accounts, and an audit trail of every moderation action.

-- Admin sub-role (only meaningful when users.role='admin'). Existing admins get
-- 'super' so nothing they can do today regresses.
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role TEXT
  CHECK (admin_role IN ('super','support','finance','moderation'));
UPDATE users SET admin_role = 'super' WHERE role = 'admin' AND admin_role IS NULL;

-- Block state for shop-side principals (owner/staff). Shops already have
-- status active|suspended (0004) — that stays the shop-level block. This is the
-- per-login-user block used to lock out an individual owner or staff member.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','blocked'));

-- Block state for consumer accounts.
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','blocked'));

-- Immutable-ish audit trail of every moderation action.
CREATE TABLE IF NOT EXISTS moderation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID,                 -- who did it
  action        TEXT NOT NULL,        -- e.g. shop.suspend, shop.reinstate, user.block, user.unblock, customer.block, customer.unblock, admin_role.set
  target_type   TEXT NOT NULL,        -- 'shop' | 'user' | 'customer'
  target_id     UUID NOT NULL,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modlog_created ON moderation_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modlog_target ON moderation_actions (target_type, target_id);
