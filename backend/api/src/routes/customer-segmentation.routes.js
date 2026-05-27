const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const customerSegmentationController = require('../controllers/customer-segmentation.controller');

router.post(
  '/',
  authMiddleware,
  customerSegmentationController.getCustomerSegment
);

module.exports = router;
