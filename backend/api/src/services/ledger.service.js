const prisma = require('../config/prisma');

const calculateCustomerBalance = async (customerId) => {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      customerId
    }
  });

  let balance = 0;

  entries.forEach((entry) => {
    if (entry.type === 'credit') {
      balance += entry.amount;
    }

    if (entry.type === 'debit') {
      balance -= entry.amount;
    }
  });

  return balance;
};

module.exports = {
  calculateCustomerBalance
};
