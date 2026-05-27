const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const register = async (req, res) => {
  try {
    const { name, mobile, password } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { mobile }
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        email: null,
        role: 'merchant'
      }
    });

    const token = jwt.sign(
      {
        userId: user.id,
        mobile: user.mobile
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Registration failed',
      error: error.message
    });
  }
};

module.exports = {
  register
};
