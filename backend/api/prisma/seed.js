const prisma = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const merchant = await prisma.user.create({
    data: {
      name: 'Demo Merchant',
      mobile: '9999999999',
      password: hashedPassword
    }
  });

  const shop = await prisma.shop.create({
    data: {
      name: 'Demo Kirana Store',
      gstNumber: '29ABCDE1234F1Z5',
      address: 'Chennai, Tamil Nadu',
      ownerId: merchant.id
    }
  });

  const customer = await prisma.customer.create({
    data: {
      name: 'Rahul Kumar',
      mobile: '8888888888',
      shopId: shop.id
    }
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        customerId: customer.id,
        amount: 500,
        type: 'credit',
        note: 'Grocery purchase'
      },
      {
        customerId: customer.id,
        amount: 200,
        type: 'debit',
        note: 'Partial payment'
      }
    ]
  });

  console.log('Seed data inserted successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
