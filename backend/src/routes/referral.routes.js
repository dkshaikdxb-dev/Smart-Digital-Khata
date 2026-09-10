const router = require('express').Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const referralCtrl = require('../controllers/referral.controller');

// Owner/staff Khata Credits endpoints (Batch R3). Read-only views of the shop's
// closed-loop credit balance + ledger, and the caller's own referral earnings.
router.use(auth(['owner', 'staff']));

// GET /api/referral/wallet   → { balance_paise, currency, ledger:[recent 50] }
router.get('/wallet', asyncHandler(referralCtrl.meWallet));

// GET /api/referral/earnings → { code, accrued_paise, settled_paise,
//                               wallet_balance_paise, by_role:{...} }
router.get('/earnings', asyncHandler(referralCtrl.meEarnings));

module.exports = router;
