const prisma = require('../config/prisma');

const getDashboardAnalytics = async (shopId) => {
  const customers = await prisma.customer.findMany({
    where: {
      shopId
    },
    include: {
      ledgerEntries: true
    }
  });

  let totalOutstanding = 0;
  let totalCollections = 0;
  let pendingDues = 0;

  customers.forEach((customer) => {
    customer.ledgerEntries.forEach((entry) => {
      if (entry.type === 'credit') {
        totalOutstanding += entry.amount;
        pendingDues += entry.amount;
      }

      if (entry.type === 'debit') {
        totalCollections += entry.amount;
        pendingDues -= entry.amount;
      }
    });
  });

  return {
    totalCustomers: customers.length,
    totalOutstanding,
    totalCollections,
    pendingDues
  };
};

module.exports = {
  getDashboardAnalytics
};
