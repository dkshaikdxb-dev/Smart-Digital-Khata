const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const shopController = require('../controllers/shop.controller');

router.get('/', authMiddleware, shopController.getShops);

router.post('/', authMiddleware, shopController.createShop);

module.exports = router;
