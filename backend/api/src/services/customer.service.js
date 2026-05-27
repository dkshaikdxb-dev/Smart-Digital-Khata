const prisma = require('../config/prisma');

const createCustomer = async (data) => {
  return prisma.customer.create({
    data
  });
};

const getCustomersByShop = async (shopId) => {
  return prisma.customer.findMany({
    where: {
      shopId
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
};

module.exports = {
  createCustomer,
  getCustomersByShop
};
