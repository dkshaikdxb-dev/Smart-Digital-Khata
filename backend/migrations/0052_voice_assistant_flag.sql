-- 0052_voice_assistant_flag.sql
-- Per-platform on/off toggle for the owner voice "Ask" (command-voice) assistant.
-- Additive + idempotent. The flag lives in platform_settings (read live by the
-- public config endpoint via getVoiceAssistantEnabled) so a later Admin edit can
-- flip it without a code change.
--
-- DEFAULT ON: the assistant is free, on-device (Web Speech only) and offline —
-- nothing regresses by shipping it enabled. This is the enable/disable hook a
-- later batch can make per-shop / per-plan (a subscription lever); for now it is
-- one platform flag.
--
-- ON CONFLICT DO NOTHING (not DO UPDATE): a one-time seed that never overwrites a
-- value an operator has since changed via the admin settings UI.

INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('voice_assistant_enabled', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
