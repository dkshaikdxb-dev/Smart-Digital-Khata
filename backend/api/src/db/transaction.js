const prisma = require('../lib/prisma');

const runTransaction = async callback => {
  return prisma.$transaction(async tx => {
    return callback(tx);
  });
};

module.exports = {
  runTransaction
};
