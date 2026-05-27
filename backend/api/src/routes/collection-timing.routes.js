const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const collectionTimingController = require('../controllers/collection-timing.controller');

router.post(
  '/',
  authMiddleware,
  collectionTimingController.getCollectionWindow
);

module.exports = router;
