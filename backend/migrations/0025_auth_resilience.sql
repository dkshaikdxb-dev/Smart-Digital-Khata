-- Phase G — Consumer auth resilience: number change + PIN + long session + owner
-- merge. Additive & idempotent so it is safe to re-run.
--
-- PIN is an OPTIONAL, faster-than-OTP login for consumers. It is bcrypt-hashed
-- (never stored in plaintext), rate-limited and locked after repeated failures.
-- A server-verified PIN still needs data connectivity — it is NOT offline auth;
-- the long-lived consumer session is the genuine no-network mitigation. OTP
-- login stays the primary/recovery path if the PIN is forgotten or locked.
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

-- Audit of every consumer number change (self-service or owner-initiated), kept
-- for trust and support. Money ledgers are re-linked across shops during a
-- change; this row records who did it and how many shops were touched.
CREATE TABLE IF NOT EXISTS phone_changes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID,          -- the consumer account, when known
  from_phone       TEXT NOT NULL,
  to_phone         TEXT NOT NULL,
  changed_by       TEXT NOT NULL CHECK (changed_by IN ('self','owner')),
  actor_id         UUID,          -- owner user id when changed_by='owner'
  shops_relinked   INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_changes_cu ON phone_changes(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_phone_changes_created ON phone_changes(created_at DESC);
