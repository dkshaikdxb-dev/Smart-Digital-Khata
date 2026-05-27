const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const merchantBenchmarkController = require('../controllers/merchant-benchmark.controller');

router.post('/', authMiddleware, merchantBenchmarkController.getBenchmarkInsights);

module.exports = router;
