const prisma = require('../config/prisma');

const createShop = async (req, res) => {
  try {
    const { name, gstNumber, address } = req.body;

    const shop = await prisma.shop.create({
      data: {
        name,
        gstNumber,
        address,
        ownerId: req.user.userId
      }
    });

    return res.status(201).json({
      message: 'Shop created successfully',
      shop
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to create shop',
      error: error.message
    });
  }
};

const getShops = async (req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      where: {
        ownerId: req.user.userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.status(200).json({
      shops
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
};

module.exports = {
  createShop,
  getShops
};
