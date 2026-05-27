const prisma = require('../config/prisma');

const processPaymentReminders = async () => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        ledgerEntries: true
      }
    });

    const reminders = [];

    customers.forEach((customer) => {
      let balance = 0;

      customer.ledgerEntries.forEach((entry) => {
        if (entry.type === 'credit') {
          balance += entry.amount;
        }

        if (entry.type === 'debit') {
          balance -= entry.amount;
        }
      });

      if (balance > 0) {
        reminders.push({
          customer: customer.name,
          mobile: customer.mobile,
          outstanding: balance
        });
      }
    });

    console.log('Pending reminders:', reminders);

    return reminders;
  } catch (error) {
    console.error('Reminder job failed:', error.message);
  }
};

module.exports = {
  processPaymentReminders
};
