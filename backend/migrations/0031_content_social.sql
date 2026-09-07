-- Content engine — real social publishers (Batch S). ADDITIVE & backward
-- compatible. Turns the content engine's `linkedin` and `twitter` outbox slots
-- into REAL publishers that post via the platforms' OAuth 2.0 APIs. Ships
-- CREDENTIAL-GATED and INERT: with no app credentials / no connected account the
-- channel keeps using the OUTBOX adapter, so nothing existing breaks.
--
-- SECURITY: OAuth access/refresh tokens are stored ONLY as AES-256-GCM
-- ciphertext (never plaintext) — see backend/src/utils/token-crypto.js. Short-
-- lived, single-use `state` rows guard the OAuth callback against CSRF and (for
-- X) carry the PKCE verifier. Idempotent (IF NOT EXISTS throughout).

-- One connected account per social channel. Tokens live only as ciphertext; the
-- accounts API never returns any token column. A partial-unique index keeps at
-- most ONE active account per channel (a reconnect deactivates the prior row).
CREATE TABLE IF NOT EXISTS content_channel_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('linkedin','twitter')),
  external_account_id TEXT,            -- platform user id / URN (e.g. LinkedIn 'sub', X user id)
  display_name TEXT,
  access_token_enc TEXT NOT NULL,      -- AES-256-GCM ciphertext (never plaintext)
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_account_active ON content_channel_accounts(channel) WHERE is_active;

-- Short-lived OAuth `state` rows. Each authorize URL carries one; the callback
-- consumes it (single-use — deleted on success, rejected if unknown/expired).
CREATE TABLE IF NOT EXISTS content_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('linkedin','twitter')),
  code_verifier TEXT,                  -- PKCE verifier (X); short-lived row
  redirect_uri TEXT NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_exp ON content_oauth_states(expires_at);

-- Claim columns so the publisher can do its network POST OUTSIDE the row-lock tx:
-- a CLAIM tx stamps publish_started_at + bumps publish_attempts, the network send
-- runs unlocked, then a FINALIZE tx records the outcome.
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS publish_started_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
