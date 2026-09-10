-- 0051_enrolment_credits_debited.sql
-- Debit enrolment Khata Credits at CAPTURE, not at ORDER time (Batch R5).
-- Additive + idempotent. All money is integer paise.
--
-- Adds a per-enrolment flag recording whether the wallet_applied_paise credit has
-- actually been debited from the shop's Khata Credits wallet:
--   true  = the credit has been debited (the enrolment either went straight to
--           paid — full-credit / manual mode — or its Razorpay capture confirmed).
--   false = the intent is recorded (wallet_applied_paise) but nothing has been
--           debited yet — a still-pending Razorpay order.
-- The debit now happens on the pending->paid transition (markPaid), guarded by
-- this flag so a confirm can never double-debit, and an ABANDONED Razorpay
-- checkout leaves the row pending with credits_debited=false and the balance
-- fully intact — no credit is ever lost to a checkout the shopper walked away from.

ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS credits_debited BOOLEAN NOT NULL DEFAULT false;
