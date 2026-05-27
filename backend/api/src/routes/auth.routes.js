const express = require('express');
const router = express.Router();

router.post('/login', async (req, res) => {
  res.json({
    message: 'Login endpoint under development'
  });
});

router.post('/register', async (req, res) => {
  res.json({
    message: 'Register endpoint under development'
  });
});

module.exports = router;
