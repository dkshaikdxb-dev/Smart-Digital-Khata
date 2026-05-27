const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const ledgerController = require('../controllers/ledger.controller');

router.get('/', authMiddleware, ledgerController.getLedgerEntries);

router.post('/', authMiddleware, ledgerController.createLedgerEntry);

module.exports = router;
