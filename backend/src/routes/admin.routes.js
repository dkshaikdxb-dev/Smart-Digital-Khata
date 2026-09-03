const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/admin.controller');

const updateShopSchema = Joi.object({
  status: Joi.string().valid('active', 'suspended'),
  plan: Joi.string().valid('free', 'pro', 'family'),
}).min(1);

router.use(auth('admin'));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/shops', asyncHandler(ctrl.listShops));
router.get('/shops/:id', asyncHandler(ctrl.getShop));
router.patch('/shops/:id', validate(updateShopSchema), asyncHandler(ctrl.updateShop));
router.get('/users', asyncHandler(ctrl.listUsers));

module.exports = router;
