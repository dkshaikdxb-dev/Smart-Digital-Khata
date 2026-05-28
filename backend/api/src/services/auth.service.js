const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const env = require('../config/env.config');

const registerUser = async payload => {
  const hashedPassword = await bcrypt.hash(payload.password, 10);

  return prisma.user.create({
    data: {
      tenantId: payload.tenantId,
      fullName: payload.fullName,
      email: payload.email,
      passwordHash: hashedPassword,
      role: payload.role
    }
  });
};

const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    },
    env.jwtSecret,
    {
      expiresIn: '1d'
    }
  );

  return {
    token,
    user
  };
};

module.exports = {
  registerUser,
  loginUser
};
