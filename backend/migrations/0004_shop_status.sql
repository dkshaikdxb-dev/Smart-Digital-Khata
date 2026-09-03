-- Platform admin control: shops can be suspended.
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
