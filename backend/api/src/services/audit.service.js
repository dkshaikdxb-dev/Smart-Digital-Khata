const prisma = require('../lib/prisma');

const createAuditEntry = async payload => {
  return prisma.auditLog.create({
    data: payload
  });
};

module.exports = {
  createAuditEntry
};
