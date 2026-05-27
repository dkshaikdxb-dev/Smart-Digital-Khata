const prisma = require('../config/prisma');

const createLedgerEntry = async (req, res) => {
  try {
    const ledgerEntry = await prisma.ledgerEntry.create({
      data: req.body
    });

    return res.status(201).json({
      message: 'Ledger entry created successfully',
      ledgerEntry
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to create ledger entry',
      error: error.message
    });
  }
};

const getLedgerEntries = async (req, res) => {
  try {
    const { customerId } = req.query;

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        customerId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json({
      entries
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch ledger entries',
      error: error.message
    });
  }
};

module.exports = {
  createLedgerEntry,
  getLedgerEntries
};
