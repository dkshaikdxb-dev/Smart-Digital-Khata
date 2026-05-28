const prisma = require('../lib/prisma');

const createSession = async payload => {
  return prisma.session.create({
    data: payload
  });
};

const revokeSession = async sessionId => {
  return prisma.session.delete({
    where: {
      id: sessionId
    }
  });
};

module.exports = {
  createSession,
  revokeSession
};
