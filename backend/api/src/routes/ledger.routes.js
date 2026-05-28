const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth.middleware');
const ledgerController = require('../controllers/ledger.controller');

router.get('/', authMiddleware, async (req, res) => {
  const ledgers = await prisma.ledger.findMany({
    include: {
      customer: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return res.status(200).json({
    success: true,
    data: ledgers
  });
});

router.post('/', authMiddleware, ledgerController.createLedgerEntry);

module.exports = router;
