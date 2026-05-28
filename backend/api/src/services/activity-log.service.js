const prisma = require('../lib/prisma');

const createActivityLog = async payload => {
  return prisma.activityLog.create({
    data: payload
  });
};

module.exports = {
  createActivityLog
};
