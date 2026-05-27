const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({
    message: 'Fetch customers endpoint'
  });
});

router.post('/', async (req, res) => {
  res.json({
    message: 'Create customer endpoint'
  });
});

module.exports = router;
