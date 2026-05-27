const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const dueAgingController = require('../controllers/due-aging.controller');

router.get('/', authMiddleware, dueAgingController.getDueAgingReport);

module.exports = router;
