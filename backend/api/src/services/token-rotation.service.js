const prisma = require('../lib/prisma');
const crypto = require('crypto');

const rotateRefreshToken = async oldToken => {
  const existingToken = await prisma.refreshToken.findUnique({
    where: {
      token: oldToken
    }
  });

  if (!existingToken) {
    throw new Error('Invalid refresh token');
  }

  const newToken = crypto.randomBytes(64).toString('hex');

  await prisma.refreshToken.update({
    where: {
      token: oldToken
    },
    data: {
      token: newToken
    }
  });

  return newToken;
};

module.exports = {
  rotateRefreshToken
};
