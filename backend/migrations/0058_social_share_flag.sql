-- 0058_social_share_flag.sql (batch SOCIAL1)
-- Per-platform on/off toggle for the owner "Share your shop" poster — a branded
-- image (shop name, tagline, a typed offer, store link + QR) generated ENTIRELY
-- on-device (HTML Canvas + the existing qrcode package) that the shopkeeper posts
-- to their WhatsApp Status / Instagram / Facebook via the phone's native share
-- sheet. This path needs NO Meta/Facebook API and NO credentials: the shopkeeper
-- shares it themselves, which is the realistic viral channel for this audience.
-- The flag lives in platform_settings (read LIVE by GET /api/public/config via
-- getSocialShareEnabled, mirroring voice_assistant_enabled) so a later Admin edit
-- can flip it without a code change.
--
-- DEFAULT ON: the poster is free, local and offline (no server round-trip beyond
-- loading the page) — nothing regresses by shipping it enabled.
--
-- PARKED, DEFAULT OFF — meta_autopost_enabled:
--   The LICENSED path — Meta Graph API auto-posting (post the poster to a
--   connected Facebook Page / Instagram Business account for the shop) and Meta
--   commerce CATALOGUE sync — is deliberately NOT built in this batch. It requires
--   a Meta app id + secret and per-shop Page/IG access tokens (external
--   credentials + an app review), so it is seeded here OFF as a documented seam
--   only. No live Graph API call, no token storage and no new dependency is wired
--   to this flag in this batch; see admin-dashboard/src/utils/metaCommerce.js for
--   where that integration would attach when the credentials exist.
--
-- ON CONFLICT DO NOTHING (not DO UPDATE): a one-time seed that never overwrites a
-- value an operator has since changed via the admin settings UI.

INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('social_share_enabled', 'true', NOW()),
  ('meta_autopost_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;
