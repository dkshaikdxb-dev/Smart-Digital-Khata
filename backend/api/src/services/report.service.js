const prisma = require('../config/prisma');

const generateOutstandingReport = async (shopId) => {
  const customers = await prisma.customer.findMany({
    where: {
      shopId
    },
    include: {
      ledgerEntries: true
    }
  });

  return customers.map((customer) => {
    let outstanding = 0;

    customer.ledgerEntries.forEach((entry) => {
      if (entry.type === 'credit') {
        outstanding += entry.amount;
      }

      if (entry.type === 'debit') {
        outstanding -= entry.amount;
      }
    });

    return {
      customer: customer.name,
      mobile: customer.mobile,
      outstanding
    };
  });
};

module.exports = {
  generateOutstandingReport
};
