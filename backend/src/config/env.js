const Joi = require('joi');

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),
  PORT: Joi.number().default(4000),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('30d'),
  BCRYPT_SALT_ROUNDS: Joi.number().default(10),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://redis:6379'),

  APP_URL: Joi.string().uri().allow('').default(''),
  ADMIN_URL: Joi.string().uri().allow('').default(''),
  ALLOWED_ORIGINS: Joi.string().allow('').default(''),

  RAZORPAY_KEY_ID: Joi.string().allow('').default(''),
  RAZORPAY_KEY_SECRET: Joi.string().allow('').default(''),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().allow('').default(''),

  WHATSAPP_API_URL: Joi.string().uri().default('https://graph.facebook.com/v18.0'),
  WHATSAPP_API_TOKEN: Joi.string().allow('').default(''),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').default(''),
  WHATSAPP_VERIFY_TOKEN: Joi.string().allow('').default(''),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(60_000),
  RATE_LIMIT_MAX: Joi.number().default(120),

  TZ: Joi.string().default('Asia/Kolkata'),
}).unknown(true);

function validateEnv() {
  const { error, value } = schema.validate(process.env, { abortEarly: false, stripUnknown: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:');
    error.details.forEach((d) => console.error(`  - ${d.message}`));
    process.exit(1);
  }
  return value;
}

module.exports = { validateEnv };
