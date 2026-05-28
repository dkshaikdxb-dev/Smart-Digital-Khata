const crypto = require('crypto');
const prisma = require('../lib/prisma');

const generateRefreshToken = async userId => {
  const token = crypto.randomBytes(64).toString('hex');

  await prisma.refreshToken.create({
    data: {
      userId,
      token
    }
  });

  return token;
};

module.exports = {
  generateRefreshToken
};
