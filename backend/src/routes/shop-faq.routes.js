const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/shop-faq.controller');

// Owner-authored per-store FAQ. Mounted at /api/shops so these read as
// /api/shops/faqs; every route is shop-scoped in the controller via
// req.user.shopId — a shop_id is never accepted from the body.

const createSchema = Joi.object({
  question: Joi.string().trim().min(1).max(300).required(),
  answer: Joi.string().trim().min(1).max(2000).required(),
  sort_order: Joi.number().integer().min(0),
});

const updateSchema = Joi.object({
  question: Joi.string().trim().min(1).max(300),
  answer: Joi.string().trim().min(1).max(2000),
  sort_order: Joi.number().integer().min(0),
  is_active: Joi.boolean(),
}).min(1);

const idSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

router.use(auth(['owner', 'staff']));
router.get('/faqs', asyncHandler(ctrl.list));
router.post('/faqs', validate(createSchema), asyncHandler(ctrl.create));
router.patch('/faqs/:id', validate(idSchema, 'params'), validate(updateSchema), asyncHandler(ctrl.update));
router.delete('/faqs/:id', validate(idSchema, 'params'), asyncHandler(ctrl.remove));

module.exports = router;
