const prisma = require('../config/prisma');

const generateDueAgingReport = async (shopId) => {
  const customers = await prisma.customer.findMany({
    where: {
      shopId
    },
    include: {
      ledgerEntries: true
    }
  });

  const buckets = {
    current: [],
    days30: [],
    days60: [],
    days90: []
  };

  customers.forEach((customer) => {
    let outstanding = 0;

    customer.ledgerEntries.forEach((entry) => {
      if (entry.type === 'credit') {
        outstanding += entry.amount;
      }

      if (entry.type === 'debit') {
        outstanding -= entry.amount;
      }
    });

    const mockAge = Math.floor(Math.random() * 120);

    const payload = {
      customer: customer.name,
      outstanding,
      age: mockAge
    };

    if (mockAge <= 30) {
      buckets.current.push(payload);
    } else if (mockAge <= 60) {
      buckets.days30.push(payload);
    } else if (mockAge <= 90) {
      buckets.days60.push(payload);
    } else {
      buckets.days90.push(payload);
    }
  });

  return buckets;
};

module.exports = {
  generateDueAgingReport
};
