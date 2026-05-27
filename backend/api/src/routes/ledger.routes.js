const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({
    message: 'Fetch ledger entries endpoint'
  });
});

router.post('/', async (req, res) => {
  res.json({
    message: 'Create ledger entry endpoint'
  });
});

module.exports = router;
