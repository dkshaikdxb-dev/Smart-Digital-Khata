const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const loadAdminRole = require('../middleware/loadAdminRole');
const requirePerm = require('../middleware/requirePerm');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/content.controller');

// Editor-in-chief content desk. Mounted at /api/admin/content. Every route is
// auth('admin') + content:manage — a non-admin is 401/403, an admin without
// content:manage is 403. Mirrors the admin.routes guard chain.
router.use(auth('admin'));
router.use(asyncHandler(loadAdminRole));
router.use(requirePerm('content:manage'));

const CHANNELS = [
  'blog', 'linkedin', 'twitter', 'newsletter_community', 'newsletter_ecosystem',
  'whatsapp_tip', 'reel', 'voice',
];
const ENGINES = ['record', 'reach'];
const STATUSES = [
  'idea', 'drafting', 'draft', 'localized', 'in_review', 'approved',
  'scheduled', 'published', 'rejected', 'archived',
];

const createSchema = Joi.object({
  channel: Joi.string().valid(...CHANNELS).required(),
  engine: Joi.string().valid(...ENGINES).required(),
  autonomy_tier: Joi.number().integer().valid(0, 1, 2).required(),
  language: Joi.string().max(8).default('en'),
  title: Joi.string().max(300).allow('', null),
  brief: Joi.string().max(8000).allow('', null),
  body: Joi.string().max(20000).allow('', null),
  // Creation may start an item as a raw idea or a first draft only.
  status: Joi.string().valid('idea', 'draft').default('idea'),
});

const patchSchema = Joi.object({
  title: Joi.string().max(300).allow('', null),
  brief: Joi.string().max(8000).allow('', null),
  body: Joi.string().max(20000).allow('', null),
  language: Joi.string().max(8),
  scheduled_at: Joi.date().iso().allow(null),
  autonomy_tier: Joi.number().integer().valid(0, 1, 2),
}).min(1);

const transitionSchema = Joi.object({
  to: Joi.string().valid(...STATUSES).required(),
  note: Joi.string().max(2000).allow('', null),
  scheduled_at: Joi.date().iso(),
});

router.get('/', asyncHandler(ctrl.list));
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/config', asyncHandler(ctrl.config));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.patch('/:id', validate(patchSchema), asyncHandler(ctrl.patch));
router.post('/:id/transition', validate(transitionSchema), asyncHandler(ctrl.transition));
router.post('/:id/draft', asyncHandler(ctrl.draft));

module.exports = router;
