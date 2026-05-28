const express = require('express');
const crypto = require('crypto');

const router = express.Router();

router.post('/razorpay', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const signature = req.headers['x-razorpay-signature'];

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({
      success: false,
      message: 'Invalid webhook signature'
    });
  }

  return res.status(200).json({
    success: true
  });
});

module.exports = router;
