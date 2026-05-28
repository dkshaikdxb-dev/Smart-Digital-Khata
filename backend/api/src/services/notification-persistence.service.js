const prisma = require('../lib/prisma');

const createNotification = async payload => {
  return prisma.notification.create({
    data: payload
  });
};

module.exports = {
  createNotification
};
